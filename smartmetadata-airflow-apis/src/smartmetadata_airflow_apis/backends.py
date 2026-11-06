# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Airflow-backed DAG store.

Implements the store protocol against a real Airflow 3 metadata database.
This is the production backend: DAGs are files under ``dags_folder`` plus
generated config JSON under ``dag_generated_configs``. The in-memory store
in ``store.py`` exists only for tests that do not have Airflow installed.

Deploy flow (official behaviour, clean-room implementation):
  config JSON (JWT pinned) -> render dag_runner -> DagBag parse ->
  background scan -> 60 s wait for registration.
"""

from __future__ import annotations

import json
import logging
import multiprocessing
import time
import uuid
from pathlib import Path
from typing import Any

from smartmetadata_airflow_apis.config import dag_generated_configs_dir, dags_folder
from smartmetadata_airflow_apis.errors import DagOperationError
from smartmetadata_airflow_apis.run_id import clean_dag_id

logger = logging.getLogger(__name__)

RESOURCES_DIR = Path(__file__).resolve().parent / "resources"

_WAIT_TIMEOUT_SECONDS = 60.0
_WAIT_POLL_SECONDS = 0.5


def _import_dag_file(dag_path: Path) -> None:
    """Import a generated DAG file once to validate it parses.

    The module name is unique per call so re-deploys re-execute the file
    instead of reusing a cached module.
    """
    import importlib.util

    module_name = f"_sm_generated_dag_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(module_name, dag_path)
    if spec is None or spec.loader is None:
        raise DagOperationError(f"cannot load DAG file {dag_path}")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - re-raised as a DAG error
        raise DagOperationError(f"DAG file {dag_path} failed to parse: {exc}") from exc


def _scan_in_background() -> None:
    """Run one DagFileProcessorManager pass in a spawned subprocess.

    Best effort: if the scan cannot start, the wait loop below still
    succeeds once the running dag-processor picks the file up.
    """
    try:
        ctx = multiprocessing.get_context("spawn")
        proc = ctx.Process(target=_run_scan_once, daemon=True)
        proc.start()
    except Exception:  # noqa: BLE001 - scan is an optimisation, not required
        logger.warning("background DAG scan could not be started", exc_info=True)


def _run_scan_once() -> None:
    from airflow.dag_processing.manager import DagFileProcessorManager

    manager = DagFileProcessorManager(max_runs=1)
    manager.run()


def _last_parsed_time(dag_id: str) -> Any:
    from airflow.models.dag import DagModel
    from airflow.utils.session import create_session

    with create_session() as session:
        row = session.query(DagModel).filter(DagModel.dag_id == dag_id).one_or_none()
        return row.last_parsed_time if row is not None else None


def _is_registered(dag_id: str, previous_parse: Any) -> bool:
    from airflow.models.dag import DagModel
    from airflow.models.serialized_dag import SerializedDagModel
    from airflow.utils.session import create_session

    with create_session() as session:
        row = session.query(DagModel).filter(DagModel.dag_id == dag_id).one_or_none()
        if row is None or row.last_parsed_time is None:
            return False
        if previous_parse is not None and row.last_parsed_time == previous_parse:
            return False
        serialized = (
            session.query(SerializedDagModel)
            .filter(SerializedDagModel.dag_id == dag_id)
            .one_or_none()
        )
        return serialized is not None


def _wait_for_registration(dag_id: str, previous_parse: Any) -> None:
    deadline = time.monotonic() + _WAIT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if _is_registered(dag_id, previous_parse):
            return
        time.sleep(_WAIT_POLL_SECONDS)
    raise DagOperationError(
        f"DAG {dag_id} was not registered within {_WAIT_TIMEOUT_SECONDS:.0f}s"
    )


class AirflowBackend:
    """DAG store backed by a real Airflow 3 instance."""

    def __init__(
        self,
        *,
        configs_dir_path: str | Path | None = None,
        dags_folder_path: str | Path | None = None,
    ) -> None:
        self._configs_dir = Path(configs_dir_path) if configs_dir_path else dag_generated_configs_dir()
        self._dags_folder = Path(dags_folder_path) if dags_folder_path else dags_folder()
        self._configs_dir.mkdir(parents=True, exist_ok=True)
        self._dags_folder.mkdir(parents=True, exist_ok=True)

    # -- deploy ---------------------------------------------------------
    def deploy(self, pipeline: dict[str, Any]) -> str:
        dag_id = clean_dag_id(str(pipeline["name"]))
        config_path = self._configs_dir / f"{dag_id}.json"
        dag_path = self._dags_folder / f"{dag_id}.py"

        config_path.write_text(json.dumps(pipeline, indent=2), encoding="utf-8")
        template = (RESOURCES_DIR / "dag_runner.jinja").read_text(encoding="utf-8")
        rendered = template.replace("{{ config_path }}", json.dumps(str(config_path)))
        dag_path.write_text(rendered, encoding="utf-8")

        _import_dag_file(dag_path)

        previous_parse = _last_parsed_time(dag_id)
        self._parse_with_dagbag(dag_path)
        _scan_in_background()
        _wait_for_registration(dag_id, previous_parse)
        return dag_id

    def _parse_with_dagbag(self, dag_path: Path) -> Any:
        from airflow.models.dagbag import DagBag

        bag = DagBag(dag_folder=str(self._dags_folder), collect_dags=False)
        found = bag.process_file(str(dag_path))
        if not found:
            errors = bag.import_errors
            detail = "; ".join(f"{k}: {v}" for k, v in errors.items())
            raise DagOperationError(
                f"DAG file {dag_path} produced no DAGs"
                + (f": {detail}" if detail else "")
            )
        return found

    # -- trigger / status / logs (step 3) --------------------------------
    def trigger(self, dag_id: str, conf: dict[str, Any]) -> str:
        raise NotImplementedError("step 3")

    def status(self, dag_id: str, run_id: str | None = None) -> dict[str, Any]:
        raise NotImplementedError("step 3")

    def last_logs(
        self, dag_id: str, run_id: str, task_id: str, after: str | None
    ) -> dict[str, Any]:
        raise NotImplementedError("step 3")

    # -- lifecycle (step 5) ----------------------------------------------
    def set_enabled(self, dag_id: str, enabled: bool) -> bool:
        raise NotImplementedError("step 5")

    def delete(self, dag_id: str) -> bool:
        raise NotImplementedError("step 5")

    def kill(self, dag_id: str, run_id: str) -> bool:
        raise NotImplementedError("step 5")

    def host_ip(self) -> str:
        raise NotImplementedError("step 5")


__all__ = ["AirflowBackend"]
