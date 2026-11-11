# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared DAG construction for the workflow builders.

One task per DAG, built explicitly (no ``with DAG(...)`` context manager:
the process-wide DagContext races with a KeyError when several DAG files
are parsed concurrently). The task runs the translated WorkflowConfig
through the product runner in-process (LocalExecutor).

Run identity converges on one UUID across the server, the worker and the
failure callbacks: the trigger conf's ``pipelineRunId`` when the server
minted one, else ``pipeline_run_id(dag_id, dag_run.run_id)``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from functools import partial
from typing import Any

from smartmetadata_airflow_apis.run_id import clean_dag_id, resolve_run_id
from smartmetadata_airflow_apis.workflows.translation import (
    TranslationError,
    translate_filter_pattern,
)

logger = logging.getLogger(__name__)

_TAG_LIMIT = 90


def _name_tail(value: str | None) -> str:
    if not value:
        return ""
    return str(value).split(".")[-1][: _TAG_LIMIT]


def build_dag_configs(pipeline: dict[str, Any]) -> dict[str, Any]:
    """Airflow DAG kwargs for one pipeline.

    ``start_date`` comes from the pipeline's ``updatedAt``: it only moves
    when the pipeline really changes, so a no-op re-deploy does not shift
    the schedule. Without it, fall back to now.
    """
    from airflow.utils import timezone

    airflow_config = pipeline.get("airflowConfig") or {}
    updated_at = pipeline.get("updatedAt")
    if isinstance(updated_at, (int, float)) and updated_at > 0:
        start_date = datetime.fromtimestamp(updated_at / 1000, tz=timezone.utc)
    else:
        start_date = timezone.utcnow()
    configs: dict[str, Any] = {
        "dag_id": clean_dag_id(str(pipeline.get("name"))),
        "description": pipeline.get("description") or "",
        "schedule": airflow_config.get("scheduleInterval"),
        "start_date": start_date,
        "max_active_runs": airflow_config.get("maxActiveRuns") or 1,
        "is_paused_upon_creation": bool(airflow_config.get("pausePipeline", False)),
        "catchup": bool(airflow_config.get("pipelineCatchup", False)),
        "tags": [
            "SmartMetadata",
            _name_tail(pipeline.get("displayName") or pipeline.get("name")),
            f"type:{pipeline.get('pipelineType')}",
            f"service:{_name_tail((pipeline.get('service') or {}).get('name'))}",
        ],
    }
    end_date = airflow_config.get("endDate")
    if end_date:
        configs["end_date"] = end_date
    workflow_timeout = airflow_config.get("workflowTimeout")
    if workflow_timeout:
        configs["dagrun_timeout"] = timedelta(seconds=int(workflow_timeout))
    concurrency = airflow_config.get("concurrency")
    if concurrency:
        configs["max_active_tasks"] = int(concurrency)
    return configs


def set_operator_logger(level: str | None) -> None:
    """Set the ingestion loggers to the pipeline's logger level."""
    if not level:
        return
    try:
        numeric = getattr(logging, str(level).upper(), None)
        if isinstance(numeric, int):
            logging.getLogger("smartmetadata_ingestion").setLevel(numeric)
    except Exception:
        pass


def _is_uuid(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def _resolve_run_id(dag_id: str, dag_run: Any) -> str | None:
    # One rule for every side (run_id.resolve_run_id): the server-minted
    # pipelineRunId from the trigger conf when it is a valid UUID, else
    # the derivation from the Airflow run id.
    if dag_run is None:
        return None
    conf = getattr(dag_run, "conf", None) or {}
    run_id = getattr(dag_run, "run_id", None)
    return resolve_run_id(dag_id, run_id, conf if isinstance(conf, dict) else {})


def _apply_source_config_override(
    workflow_config: dict[str, Any], override: dict[str, Any]
) -> dict[str, Any]:
    """Apply a trigger conf sourceConfigOverride to the baked config.

    Only this run is affected. Overridden filter patterns are re-translated
    through the same rule as deploy time; unknown keys are ignored with a
    warning (they belong to other pipeline types' configs).
    """
    config = dict(workflow_config)
    source = dict(config.get("source") or {})
    for key in ("schemaFilterPattern", "databaseFilterPattern"):
        if key not in override:
            continue
        try:
            includes, excludes = translate_filter_pattern(override.get(key))
        except TranslationError:
            # Fail loudly: a malformed override (non-dict pattern,
            # non-list includes/excludes) is only known at trigger time,
            # so deploy validation cannot catch it — but ignoring a
            # narrowing override would run the deployed (broader) scope.
            # The task fails here; the failure callback writes the run
            # back as failed. This matches the official
            # apply_source_config_override, whose model_validate raises.
            raise
        if key == "schemaFilterPattern":
            source["includeSchemas"] = includes
            source["excludeSchemas"] = excludes
        else:
            source["includeDatabases"] = includes
            source["excludeDatabases"] = excludes
    if "markDeletedTables" in override:
        workflow = dict(config.get("workflow") or {})
        workflow["reconcileStale"] = bool(override["markDeletedTables"])
        config["workflow"] = workflow
    for key in override:
        if key not in {
            "schemaFilterPattern",
            "databaseFilterPattern",
            "markDeletedTables",
        }:
            logger.warning("ignoring sourceConfigOverride key %s", key)
    config["source"] = source
    return config


def run_pipeline_workflow(
    workflow_config: dict[str, Any],
    run_id: str,
    raise_on_error: bool,
) -> Any:
    """Task callable: run the translated config through the product runner.

    The runner reports the run's status under ``run_id`` itself; when the
    run fails and ``raise_on_error`` is false the task still succeeds (the
    failure is visible through the pipeline status, matching the official
    builders that omit raiseOnError).
    """
    from smartmetadata_ingestion.config import WorkflowConfig
    from smartmetadata_ingestion.runner import run_workflow

    config = WorkflowConfig.model_validate(workflow_config)
    try:
        return run_workflow(config, run_id=run_id)
    except Exception:
        if raise_on_error:
            raise
        logger.warning(
            "workflow %s failed but raiseOnError is false; leaving the task green",
            config.workflow.name,
        )
        return None


def workflow_operator_class():  # type: ignore[no-untyped-def]
    """The single-task operator: resolve the run id, apply overrides, run."""
    from airflow.operators.python import PythonOperator

    class WorkflowPythonOperator(PythonOperator):
        def __init__(
            self,
            *,
            workflow_config: dict[str, Any],
            pipeline: dict[str, Any],
            raise_on_error: bool = False,
            logger_level: str | None = None,
            **kwargs: Any,
        ) -> None:
            super().__init__(python_callable=self._run, **kwargs)
            self._workflow_config = workflow_config
            self._pipeline = pipeline
            self._raise_on_error = raise_on_error
            self._logger_level = logger_level
            # The run this task is executing (ruling §1.5.3, fix-round
            # B-2): stored when _run resolves it, so on_kill can write
            # the run back as failed even though Airflow calls it with
            # no context. The official operator writes the id back into
            # the shared workflow_config.pipelineRunId for the same
            # reason; the product config is a plain dict, so the
            # operator instance itself is the shared state.
            self._current_run_id: str | None = None
            self._current_start_ms: int | None = None

        def _run(self, **context: Any) -> Any:
            from smartmetadata_ingestion.pipeline_status import now_ms

            dag_run = context.get("dag_run")
            run_id = _resolve_run_id(self.dag_id, dag_run)
            if run_id is None:
                run_id = str(uuid.uuid4())
            self._current_run_id = run_id
            self._current_start_ms = now_ms()
            config = dict(self._workflow_config)
            conf = (getattr(dag_run, "conf", None) or {}) if dag_run else {}
            override = (
                conf.get("sourceConfigOverride") if isinstance(conf, dict) else None
            )
            if isinstance(override, dict) and override:
                config = _apply_source_config_override(config, override)
            set_operator_logger(self._logger_level)
            return run_pipeline_workflow(config, run_id, self._raise_on_error)

        def on_kill(self) -> None:
            try:
                super().on_kill()
            finally:
                # No context here, so the run id must come from the
                # instance state _run stored (B-2); passing None made
                # this a permanent no-op. Before _run starts there is
                # no run id and the writeback is skipped, as before.
                _write_failed_status(
                    self._workflow_config,
                    self._pipeline,
                    self._current_run_id,
                    self._current_start_ms,
                )

    return WorkflowPythonOperator


def _failed_status_payload(
    rest: Any,
    fqn: str,
    run_id: str,
    start_ms: int | None,
) -> dict[str, Any]:
    """The failed writeback payload: the stored status, only flipped.

    Official ``send_failed_status_callback``: fetch the stored status
    first and change only ``endDate`` + ``pipelineState=failed`` — the
    step details, startDate and counts the workflow already wrote stay.
    ``triggeredBy`` is a server audit field the client never writes
    (``build_pipeline_status``; the PUT handler nulls it anyway), so it
    is dropped from the body. A missing/unreadable stored status (404,
    an old stub without the getter) falls back to the bare build.
    """
    from smartmetadata_ingestion.pipeline_status import (
        build_pipeline_status,
        now_ms,
    )

    getter = getattr(rest, "get_pipeline_status", None)
    stored = None
    if callable(getter):
        try:
            stored = getter(str(fqn), str(run_id))
        except Exception:
            stored = None
    if isinstance(stored, dict) and stored:
        payload = dict(stored)
        payload.pop("triggeredBy", None)
        payload["pipelineState"] = "failed"
        payload["endDate"] = now_ms()
        return payload
    return build_pipeline_status(
        run_id=run_id,
        pipeline_state="failed",
        start_ms=start_ms or now_ms(),
        end_ms=now_ms(),
    )


def _write_failed_status(
    workflow_config: dict[str, Any],
    pipeline: dict[str, Any],
    run_id: str | None,
    start_ms: int | None,
) -> None:
    """Best-effort failed writeback; never raises."""
    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import ServerConfig

    try:
        workflow = workflow_config.get("workflow") or {}
        # The builders dump WorkflowConfig with model_dump(mode="json"),
        # whose keys are snake_case — the camelCase spelling this read
        # used never matches, so the writeback silently skipped every
        # run. Accept both spellings (the raw dict translate_pipeline
        # builds uses camelCase).
        fqn = workflow.get("ingestionPipelineFqn") or workflow.get(
            "ingestion_pipeline_fqn"
        )
        if not fqn or not run_id:
            logger.debug("skipping failed status writeback: no fqn or run id")
            return
        server = ServerConfig.model_validate(workflow_config.get("server") or {})
        rest = RestClient(server)
        try:
            payload = _failed_status_payload(rest, str(fqn), run_id, start_ms)
            rest.add_pipeline_status(str(fqn), payload)
        finally:
            try:
                rest.close()
            except Exception:
                pass
    except Exception as exc:
        logger.warning("failed status writeback failed: %s", exc)


def _send_failed(
    workflow_config: dict[str, Any],
    pipeline: dict[str, Any],
    context: Any,
) -> None:
    dag_run = context.get("dag_run") if isinstance(context, dict) else None
    # B-4: derive the run id from the REGISTERED dag id, not the raw
    # pipeline name. The worker resolves with self.dag_id
    # (clean_dag_id(name)); the raw name here produced a different uuid5
    # for names needing cleaning ("my.pipe" -> "my_pipe"), so the failed
    # writeback landed on a run the server never saw. dag_run.dag_id is
    # the registered id (the official worker uses it too); fall back to
    # the cleaned name when there is no dag_run.
    dag_id = getattr(dag_run, "dag_id", None) or clean_dag_id(
        pipeline.get("name", "")
    )
    run_id = _resolve_run_id(dag_id, dag_run)
    start_ms = None
    if isinstance(context, dict):
        task_instance = context.get("task_instance")
        start = getattr(task_instance, "start_date", None) if task_instance else None
        if start is not None:
            try:
                start_ms = int(start.timestamp() * 1000)
            except Exception:
                start_ms = None
    _write_failed_status(workflow_config, pipeline, run_id, start_ms)


def send_failed_status_callback(
    workflow_config: dict[str, Any], pipeline: dict[str, Any], context: Any
) -> None:
    """Task-level failure callback: the run failed after starting."""
    _send_failed(workflow_config, pipeline, context)


def send_failed_run_status_callback(
    workflow_config: dict[str, Any], pipeline: dict[str, Any], context: Any
) -> None:
    """DAG-level failure callback: the run never started a task.

    Only server-triggered runs carry a pipelineRunId in conf; scheduled
    runs without one are left to the task-level callback.
    """
    dag_run = context.get("dag_run") if isinstance(context, dict) else None
    conf = (getattr(dag_run, "conf", None) or {}) if dag_run else {}
    if not isinstance(conf, dict) or not _is_uuid(conf.get("pipelineRunId")):
        return
    _send_failed(workflow_config, pipeline, context)


def build_dag(
    task_name: str,
    pipeline: dict[str, Any],
    workflow_config: dict[str, Any],
    params: dict[str, Any] | None = None,
    raise_on_error: bool | None = None,
) -> Any:
    """Build the single-task DAG for one pipeline (no DAG context manager).

    ``raise_on_error`` overrides the pipeline's own value when given: the
    official profiler (and test_suite) builders omit raiseOnError, so their
    builders pass False; metadata/usage/lineage leave it None and keep the
    pipeline value.
    """
    from airflow import DAG

    if raise_on_error is None:
        raise_on_error = bool(pipeline.get("raiseOnError", False))
    configs = build_dag_configs(pipeline)
    airflow_config = pipeline.get("airflowConfig") or {}
    dag = DAG(
        on_failure_callback=partial(
            send_failed_run_status_callback, workflow_config, pipeline
        ),
        **configs,
    )
    operator = workflow_operator_class()(
        task_id=task_name,
        workflow_config=workflow_config,
        pipeline=pipeline,
        raise_on_error=raise_on_error,
        logger_level=pipeline.get("loggerLevel"),
        retries=int(airflow_config.get("retries") or 0),
        retry_delay=timedelta(seconds=int(airflow_config.get("retryDelay") or 300)),
        on_failure_callback=partial(
            send_failed_status_callback, workflow_config, pipeline
        ),
        owner=((pipeline.get("owners") or [{}])[0] or {}).get("name") or "smartmetadata",
        dag=dag,
    )
    dag_params = {
        "pipelineRunId": None,
        "sourceConfigOverride": None,
    }
    if params:
        dag_params.update(params)
    dag.params.update(dag_params)
    return dag
