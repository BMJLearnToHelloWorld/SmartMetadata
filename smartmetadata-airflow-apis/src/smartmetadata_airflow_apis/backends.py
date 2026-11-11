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

from smartmetadata_airflow_apis.config import (
    base_log_folder,
    dag_generated_configs_dir,
    dags_folder,
)
from smartmetadata_airflow_apis.errors import (
    DagOperationError,
    NoRunsError,
    UnknownDagError,
    ValidationError,
)
from smartmetadata_airflow_apis.logs import (
    get_log_file_info,
    read_log_chunk_from_file,
    split_log_chunks,
)
from smartmetadata_airflow_apis.run_id import clean_dag_id, resolve_run_id
from smartmetadata_airflow_apis.store import resolve_host_ip

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


def _ms(value: Any) -> int | None:
    """A datetime as epoch milliseconds; None stays None."""
    if value is None:
        return None
    try:
        return int(value.timestamp() * 1000)
    except (AttributeError, OverflowError, OSError, ValueError):
        return None


def _now_ms() -> int:
    return int(time.time() * 1000)


def _state_value(state: Any) -> str:
    value = getattr(state, "value", state)
    return str(value) if value is not None else "queued"


def _format_run(dag_id: str, dag_run: Any) -> dict[str, Any]:
    """One DagRun as the server's PipelineStatus (ruling §2.1).

    The run id resolves conf-first (run_id.resolve_run_id): the server
    recorded the queued run under the conf pipelineRunId, and the worker
    reports under it, so status must return the same id.
    """
    logical_date = getattr(dag_run, "logical_date", None) or getattr(
        dag_run, "execution_date", None
    )
    return {
        "runId": resolve_run_id(dag_id, dag_run.run_id, dag_run.conf or {}),
        "pipelineState": _state_value(dag_run.get_state()),
        "startDate": _ms(dag_run.start_date),
        "endDate": _ms(dag_run.end_date),
        "timestamp": _ms(logical_date),
    }


def _dag_model(session: Any, dag_id: str) -> Any:
    from airflow.models.dag import DagModel

    return session.query(DagModel).filter(DagModel.dag_id == dag_id).one_or_none()


def _last_parsed_time(dag_id: str) -> Any:
    from airflow.utils.session import create_session

    with create_session() as session:
        row = _dag_model(session, dag_id)
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
        # P-40: a DAG with import errors but an existing serialized row
        # must NOT count as registered — otherwise deploy reports success
        # for a DAG the processor keeps failing on (official
        # _wait_for_dag_registration).
        if row.has_import_errors:
            return False
        # SerializedDagModel's PK is a surrogate id, so one dag_id can have
        # several serialized rows (one per dag version); .one_or_none()
        # raises MultipleResultsFound after a re-serialize. This is an
        # existence check, so take the latest row instead.
        serialized = (
            session.query(SerializedDagModel)
            .filter(SerializedDagModel.dag_id == dag_id)
            .order_by(SerializedDagModel.last_updated.desc())
            .first()
        )
        return serialized is not None


def _sync_dag_to_db(dag: Any) -> None:
    """Sync one parsed DAG to the DB (official refresh_session_dag fast path).

    A sync failure is a deploy failure (official returns a server error),
    never a reason to fall back to waiting — the DAG is broken, not slow.
    """
    from airflow.utils.session import create_session

    try:
        with create_session() as session:
            dag.sync_to_db(session=session)
            session.commit()
    except Exception as exc:  # noqa: BLE001 - mapped to a DAG error
        raise DagOperationError(
            f"failed to sync DAG {dag.dag_id} to the database: {exc}"
        ) from exc


def _wait_for_registration(dag_id: str, previous_parse: Any) -> None:
    deadline = time.monotonic() + _WAIT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if _is_registered(dag_id, previous_parse):
            return
        time.sleep(_WAIT_POLL_SECONDS)
    raise DagOperationError(
        f"DAG {dag_id} was not registered within {_WAIT_TIMEOUT_SECONDS:.0f}s"
    )


def _fail_unfinished_runs(dag_id: str, session: Any) -> bool:
    """Mark the DAG's running/queued runs (and their unfinished tasks) failed.

    Mirrors official ``operations/kill_all.py``; the caller commits.
    Returns whether there was a run to stop.
    """
    from airflow.models.dagrun import DagRun
    from airflow.utils.state import DagRunState

    runs = (
        session.query(DagRun)
        .filter(
            DagRun.dag_id == dag_id,
            DagRun.state.in_((DagRunState.RUNNING, DagRunState.QUEUED)),
        )
        .all()
    )
    if not runs:
        return False
    for dag_run in runs:
        dag_run.set_state(DagRunState.FAILED)
    _fail_unfinished_task_instances(dag_id, session)
    return True


def _fail_unfinished_task_instances(dag_id: str, session: Any) -> None:
    """Mark every unfinished task instance of the DAG as failed."""
    from airflow.models.taskinstance import TaskInstance
    from airflow.utils.state import TaskInstanceState

    instances = (
        session.query(TaskInstance)
        .filter(
            TaskInstance.dag_id == dag_id,
            TaskInstance.state.notin_(
                (TaskInstanceState.SUCCESS, TaskInstanceState.FAILED)
            ),
        )
        .all()
    )
    for instance in instances:
        instance.set_state(TaskInstanceState.FAILED, session=session)


def _airflow_delete_dag(dag_id: str, *, session: Any) -> int:
    """One seam to Airflow's own DAG delete (the gate patches this to
    simulate Airflow refusing a delete)."""
    from airflow.api.common.delete_dag import delete_dag

    return delete_dag(dag_id, session=session)


def _has_running_task_instances(dag_id: str, session: Any) -> bool:
    from airflow.models.taskinstance import TaskInstance
    from airflow.utils.state import TaskInstanceState

    running = session.query(TaskInstance).filter(
        TaskInstance.dag_id == dag_id,
        TaskInstance.state == TaskInstanceState.RUNNING,
    )
    return bool(session.query(running.exists()).scalar())


def _delete_dag_records(dag_id: str, session: Any) -> int:
    """Delete the DAG's DB records; DagNotFound counts as zero records.

    Airflow refuses while a task is running, so when the delete raises
    and a task is running, stop the run the same way kill does and
    delete again (official operations/delete.py).
    """
    from airflow.exceptions import AirflowException, DagNotFound

    try:
        return _airflow_delete_dag(dag_id, session=session)
    except DagNotFound:
        return 0
    except AirflowException:
        if not _has_running_task_instances(dag_id, session):
            raise
        logger.info("Stopping the active run of DAG %s before deleting it", dag_id)
        if not _fail_unfinished_runs(dag_id, session):
            _fail_unfinished_task_instances(dag_id, session)
        return _airflow_delete_dag(dag_id, session=session)


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
        from smartmetadata_ingestion.secrets import dump_with_safe_jwt

        dag_id = clean_dag_id(str(pipeline["name"]))
        config_path = self._configs_dir / f"{dag_id}.json"
        dag_path = self._dags_folder / f"{dag_id}.py"

        # P-39: the JWT is written in its stored form — a secret:<id>
        # reference when a secrets manager is configured, never the
        # resolved value (official dump_with_safe_jwt).
        config_path.write_text(dump_with_safe_jwt(pipeline), encoding="utf-8")
        template = (RESOURCES_DIR / "dag_runner.jinja").read_text(encoding="utf-8")
        rendered = template.replace("{{ config_path }}", json.dumps(str(config_path)))
        dag_path.write_text(rendered, encoding="utf-8")

        _import_dag_file(dag_path)

        previous_parse = _last_parsed_time(dag_id)
        found = self._parse_with_dagbag(dag_path)
        dag = next(
            (parsed for parsed in found if getattr(parsed, "dag_id", None) == dag_id),
            None,
        )
        if dag is None:
            raise DagOperationError(
                f"DAG {dag_id} was not loaded from {dag_path}"
            )
        # P-40: sync the parsed DAG to the DB when the Airflow version
        # supports it (Airflow 3.3.2's DAG has no sync_to_db, so the
        # product deployment takes the wait path there) and skip the
        # wait on success; only without sync_to_db do we wait for the
        # processor to register the DAG (official refresh_session_dag).
        synced = hasattr(dag, "sync_to_db")
        if synced:
            _sync_dag_to_db(dag)
        _scan_in_background()
        if not synced:
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
    def trigger(self, dag_id: str, conf: dict[str, Any] | None = None) -> dict[str, Any]:
        """Create a DagRun; the run record carries the converged run id.

        ``replace_microseconds=False`` keeps two triggers inside one
        second from colliding on the (dag_id, logical_date) uniqueness.
        The server never sends a run id, so Airflow mints ``manual__...``
        and the converged id comes from the trigger conf (see _format_run).
        """
        from airflow.api.common.trigger_dag import trigger_dag
        from airflow.models.dagrun import DagRunTriggeredByType
        from airflow.utils import timezone
        from airflow.utils.session import create_session

        conf = dict(conf or {})
        with create_session() as session:
            if _dag_model(session, dag_id) is None:
                raise UnknownDagError(dag_id)
        try:
            dag_run = trigger_dag(
                dag_id,
                run_id=None,
                conf=conf,
                logical_date=timezone.utcnow(),
                replace_microseconds=False,
                triggered_by=DagRunTriggeredByType.REST_API,
            )
        except Exception as exc:  # noqa: BLE001 - mapped to a server error
            raise DagOperationError(f"trigger failed for DAG {dag_id}: {exc}") from exc
        if dag_run is None:
            raise DagOperationError(f"trigger failed for DAG {dag_id}: no run created")
        start_ms = _ms(dag_run.start_date) or _now_ms()
        return {
            "runId": resolve_run_id(dag_id, dag_run.run_id, conf),
            "pipelineState": "queued",
            "startDate": start_ms,
            "endDate": None,
            "timestamp": _ms(dag_run.logical_date) or start_ms,
        }

    def status(
        self,
        dag_id: str,
        run_id: str | None = None,
        only_queued: bool = False,
    ) -> list[dict[str, Any]]:
        """The 10 latest DagRuns, newest first (official operations/status)."""
        from airflow.models.dagrun import DagRun
        from airflow.utils.session import create_session
        from airflow.utils.state import DagRunState

        with create_session() as session:
            if _dag_model(session, dag_id) is None:
                raise UnknownDagError(dag_id)
            query = (
                session.query(DagRun)
                .filter(DagRun.dag_id == dag_id)
                .order_by(DagRun.start_date.desc())
            )
            if only_queued:
                query = query.filter(DagRun.state == DagRunState.QUEUED)
            runs = query.limit(10).all()
            formatted = [_format_run(dag_id, run) for run in runs]
        if run_id is not None:
            formatted = [r for r in formatted if r["runId"] == run_id]
        return formatted

    def last_logs(
        self,
        dag_id: str,
        run_id: str | None,
        task_id: str,
        after: int = 0,
    ) -> dict[str, Any]:
        """Logs of the latest run's task: file streaming, TaskLogReader fallback.

        ``run_id`` is accepted for the protocol but ignored, like the
        official operation and the in-memory store: logs always come from
        the latest run.
        """
        from airflow.utils.log.log_reader import TaskLogReader
        from airflow.utils.session import create_session

        with create_session() as session:
            dag_model = _dag_model(session, dag_id)
            if dag_model is None:
                raise UnknownDagError(dag_id)
            last_run = dag_model.get_last_dagrun(
                session=session, include_manually_triggered=True
            )
            if last_run is None:
                raise NoRunsError(dag_id)
            task_instances = last_run.get_task_instances(session=session)
            target = next(
                (ti for ti in task_instances if ti.task_id == task_id), None
            )
            if target is None:
                raise ValidationError([f"Invalid: task_id {task_id}"])
            try_number = (
                getattr(target, "try_number", None)
                or getattr(target, "_try_number", None)
                or 1
            )
            task_log_reader = TaskLogReader()
            if not task_log_reader.supports_read:
                raise DagOperationError("task log reader does not support reading logs")
            streamed = self._read_logs_from_file(
                dag_id, last_run.run_id, task_id, try_number, after
            )
            if streamed is not None:
                return streamed
            return self._read_logs_via_reader(
                dag_id, task_id, target, task_log_reader, try_number, after
            )

    def _read_logs_from_file(
        self,
        dag_id: str,
        airflow_run_id: str,
        task_id: str,
        try_number: int,
        after: int,
    ) -> dict[str, Any] | None:
        """One chunk from the task log file; None when the file is unusable."""
        import os

        base = base_log_folder()
        dag_safe = dag_id.replace(".", "_DOT_")
        task_safe = task_id.replace(".", "_DOT_")
        relative = (
            f"dag_id={dag_safe}/run_id={airflow_run_id}/"
            f"task_id={task_safe}/attempt={try_number}.log"
        )
        log_path = base / relative
        try:
            real_path = os.path.realpath(log_path)
            real_base = os.path.realpath(base)
        except Exception:  # noqa: BLE001 - fall back to the reader
            return None
        if not real_path.startswith(real_base + os.sep):
            logger.warning("log path %s is outside %s", real_path, real_base)
            raise ValidationError([f"Invalid: log path for DAG {dag_id}"])
        if not os.path.exists(real_path):
            return None
        file_mtime = int(os.stat(real_path).st_mtime)
        _, total_chunks = get_log_file_info(real_path, file_mtime)
        if after < 0 or after >= total_chunks:
            raise ValidationError([f"Invalid: after {after}"])
        chunk = read_log_chunk_from_file(real_path, after)
        if chunk is None:
            return None
        body: dict[str, Any] = {task_id: chunk, "total": total_chunks}
        if after + 1 < total_chunks:
            body["after"] = after + 1
        return body

    @staticmethod
    def _read_logs_via_reader(
        dag_id: str,
        task_id: str,
        task_instance: Any,
        task_log_reader: Any,
        try_number: int,
        after: int,
    ) -> dict[str, Any]:
        raw = "".join(
            task_log_reader.read_log_stream(
                ti=task_instance,
                try_number=try_number,
                metadata={"download_logs": False},
            )
        )
        if not raw:
            raise ValidationError(
                [f"Invalid: no logs for DAG {dag_id} and task {task_id}"]
            )
        chunks = split_log_chunks(raw)
        total = len(chunks)
        if after < 0 or after >= total:
            raise ValidationError([f"Invalid: after {after}"])
        body: dict[str, Any] = {task_id: chunks[after], "total": total}
        if after + 1 < total:
            body["after"] = after + 1
        return body

    # -- lifecycle (step 5) ----------------------------------------------
    def set_enabled(self, dag_id: str, enabled: bool) -> bool:
        """Pause/unpause the DAG; False when it is not registered."""
        from airflow.utils.session import create_session

        try:
            with create_session() as session:
                dag_model = _dag_model(session, dag_id)
                if dag_model is None:
                    return False
                dag_model.is_paused = not enabled
                session.commit()
                return True
        except Exception as exc:  # noqa: BLE001 - mapped to a server error
            raise DagOperationError(
                f"failed to set enabled={enabled} for DAG {dag_id}: {exc}"
            ) from exc

    def delete(self, dag_id: str) -> bool:
        """DB first, files after; 200 only when all three legs succeed.

        The DB delete runs first so Airflow's FK ordering is enforced
        before the files go. If it raises, the files stay on disk and
        the next parse can restore the DAG (official operations/delete.py).
        """
        from airflow.utils.session import create_session

        safe_id = clean_dag_id(dag_id)
        dag_path = self._dags_folder / f"{safe_id}.py"
        config_path = self._configs_dir / f"{safe_id}.json"
        try:
            with create_session() as session:
                deleted = _delete_dag_records(dag_id, session)
                session.commit()
        except (UnknownDagError, DagOperationError):
            raise
        except Exception as exc:  # noqa: BLE001 - mapped to a server error
            raise DagOperationError(
                f"delete failed for DAG {dag_id}: {exc}"
            ) from exc
        deleted_file = False
        if dag_path.is_file():
            deleted_file = True
            dag_path.unlink()
        deleted_config = False
        if config_path.is_file():
            deleted_config = True
            config_path.unlink()
        if deleted <= 0 or not deleted_file or not deleted_config:
            logger.error(
                "Could not fully delete DAG %s. Deleted database records: %s; "
                "DAG file: %s; config file: %s",
                dag_id,
                deleted,
                deleted_file,
                deleted_config,
            )
        return deleted > 0 and deleted_file and deleted_config

    def kill(self, dag_id: str) -> bool:
        """Fail every running/queued run; False when there is none to kill."""
        from airflow.utils.session import create_session

        try:
            with create_session() as session:
                if _dag_model(session, dag_id) is None:
                    raise UnknownDagError(dag_id)
                killed = _fail_unfinished_runs(dag_id, session)
                session.commit()
                return killed
        except UnknownDagError:
            raise
        except Exception as exc:  # noqa: BLE001 - mapped to a server error
            raise DagOperationError(f"kill failed for DAG {dag_id}: {exc}") from exc

    def host_ip(self) -> str:
        return resolve_host_ip()


__all__ = ["AirflowBackend"]
