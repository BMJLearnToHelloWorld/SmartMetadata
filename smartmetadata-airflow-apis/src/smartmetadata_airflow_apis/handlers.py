# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Pure request handlers for AirflowRESTClient path names.

Success bodies and failure codes follow the official plugin (ruling §2.1
and §0.3); the server only accepts HTTP 200 as success and echoes success
bodies as ``reason`` without parsing them, so the message texts match the
official ones exactly — except the deploy message, which keeps the official
text as its prefix and appends the ignored source switches when any were
dropped (P-11), so a successful deploy never silently under-ingests. Failure mapping is per route, not generic:
``trigger`` on an unknown DAG is a 500 (the server treats a failed trigger
as a server error) while ``status``/``enable``/``disable``/``kill``/
``last_dag_logs`` on an unknown DAG are 404; ``delete`` on an unknown DAG
is a 500 because the official delete only returns 200 when the DB records
AND both files are deleted.
"""

from __future__ import annotations

import logging
from typing import Any

from smartmetadata_airflow_apis.contracts import PRODUCT_RELEASE_VERSION
from smartmetadata_airflow_apis.errors import (
    DagOperationError,
    NoRunsError,
    UnknownDagError,
    ValidationError,
)
from smartmetadata_airflow_apis.response import GENERIC_SERVER_ERROR
from smartmetadata_airflow_apis.run_id import clean_dag_id
from smartmetadata_airflow_apis.store import DagStore
from smartmetadata_airflow_apis.validation import (
    validate_automation_workflow,
    validate_ingestion_pipeline,
)
from smartmetadata_airflow_apis.workflows.translation import ignored_source_switches

logger = logging.getLogger(__name__)

# Sentinel: run_automation should use the executor's production fetcher.
# app.py imports this same object; a second sentinel would not compare equal.
USE_DEFAULT_FETCHER = object()


class HandlerResult:
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body


def _server_error() -> HandlerResult:
    return HandlerResult(500, {"error": GENERIC_SERVER_ERROR})


def _not_found(dag_id: str) -> HandlerResult:
    return HandlerResult(404, {"error": f"DAG {dag_id} not found."})


def _clean_dag_id(dag_id: str) -> str:
    """Registered DAG id for a request dag_id (ruling §1.5).

    Mirrors official's ``get_request_dag_id`` / ``get_arg_dag_id``: the
    server sends the raw pipeline name, and the registered id is the
    cleaned form (``[^0-9a-zA-Z-_]+`` -> ``_``). Cleaning belongs at the
    API boundary — the store and the worker only ever see registered ids.
    """
    return clean_dag_id(dag_id)


def health(_: DagStore) -> HandlerResult:
    return HandlerResult(200, {"status": "healthy", "version": PRODUCT_RELEASE_VERSION})


def health_auth(_: DagStore) -> HandlerResult:
    # Java AirflowRESTClient.readHealthResponse expects JSON with "version"
    return HandlerResult(200, {"version": PRODUCT_RELEASE_VERSION, "status": "healthy"})


def csrf_token(token: str | None) -> HandlerResult:
    if token:
        return HandlerResult(
            200,
            {
                "csrf_token": token,
                "message": "Include this token in X-CSRFToken header for POST/PUT/DELETE requests",
            },
        )
    return HandlerResult(
        200,
        {"csrf_token": None, "message": "CSRF protection appears to be disabled"},
    )


def deploy(store: DagStore, payload: dict[str, Any]) -> HandlerResult:
    try:
        pipeline = validate_ingestion_pipeline(payload)
    except ValidationError as exc:
        return HandlerResult(400, {"error": "; ".join(exc.problems)})
    # P-11: switches the runner will ignore are surfaced at deploy time
    # (log + response), never silently dropped: a successful deploy must
    # not under-ingest without anyone noticing. The official message
    # stays the prefix; only the ignored-switch note is appended.
    ignored = ignored_source_switches(pipeline)
    if ignored:
        logger.warning(
            "deploying pipeline %s with ignored source switches: %s",
            pipeline.get("name"),
            ", ".join(ignored),
        )
    try:
        dag_id = store.deploy(pipeline)
    except DagOperationError:
        return _server_error()
    message = f"Workflow [{dag_id}] has been created"
    if ignored:
        message += f"; ignored source switches: {', '.join(ignored)}"
    return HandlerResult(200, {"message": message})


def trigger(store: DagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "trigger requires dag_id"})
    dag_id = _clean_dag_id(str(dag_id))
    conf = payload.get("conf") if isinstance(payload.get("conf"), dict) else {}
    try:
        run = store.trigger(str(dag_id), conf)
    except (UnknownDagError, DagOperationError):
        # Official trigger on an unknown DAG is a server error, not 404.
        return _server_error()
    return HandlerResult(
        200,
        {"message": f"Workflow [{dag_id}] has been triggered {run['runId']}"},
    )


def delete(store: DagStore, dag_id: str | None) -> HandlerResult:
    if not dag_id:
        return HandlerResult(400, {"error": "delete requires dag_id"})
    dag_id = _clean_dag_id(dag_id)
    try:
        deleted = store.delete(dag_id)
    except DagOperationError as exc:
        logger.error("delete failed for DAG %s: %s", dag_id, exc, exc_info=True)
        return _server_error()
    except Exception as exc:  # noqa: BLE001 - official routes catch all
        logger.error("delete failed for DAG %s: %s", dag_id, exc, exc_info=True)
        return _server_error()
    if not deleted:
        # Official delete only returns 200 when the DB records AND both
        # files are deleted; an unknown DAG deletes 0 records -> 500.
        return _server_error()
    return HandlerResult(200, {"message": f"DAG [{dag_id}] has been deleted"})


def enable(store: DagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "enable requires dag_id"})
    dag_id = _clean_dag_id(str(dag_id))
    try:
        enabled = store.set_enabled(str(dag_id), True)
    except Exception as exc:  # noqa: BLE001 - official routes catch all
        logger.error("enable failed for DAG %s: %s", dag_id, exc, exc_info=True)
        return _server_error()
    if not enabled:
        return _not_found(str(dag_id))
    # Official message has no brackets (operations/state.py).
    return HandlerResult(200, {"message": f"DAG {dag_id} has been enabled"})


def disable(store: DagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "disable requires dag_id"})
    dag_id = _clean_dag_id(str(dag_id))
    try:
        disabled = store.set_enabled(str(dag_id), False)
    except Exception as exc:  # noqa: BLE001 - official routes catch all
        logger.error("disable failed for DAG %s: %s", dag_id, exc, exc_info=True)
        return _server_error()
    if not disabled:
        return _not_found(str(dag_id))
    return HandlerResult(200, {"message": f"DAG {dag_id} has been disabled"})


def status(
    store: DagStore,
    dag_id: str | None,
    run_id: str | None = None,
    only_queued: bool = False,
) -> HandlerResult:
    if not dag_id:
        return HandlerResult(400, {"error": "status requires dag_id"})
    dag_id = _clean_dag_id(dag_id)
    try:
        runs = store.status(dag_id, run_id=run_id, only_queued=only_queued)
    except UnknownDagError:
        return _not_found(dag_id)
    # Java reads a JSON array of PipelineStatus.
    return HandlerResult(200, runs)


def kill(store: DagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "kill requires dag_id"})
    dag_id = _clean_dag_id(str(dag_id))
    try:
        killed = store.kill(str(dag_id))
    except UnknownDagError:
        return _not_found(str(dag_id))
    except Exception as exc:  # noqa: BLE001 - official routes catch all
        logger.error("kill failed for DAG %s: %s", dag_id, exc, exc_info=True)
        return _server_error()
    if not killed:
        return HandlerResult(
            404,
            {"error": f"Workflow [{dag_id}] has no running or pending runs nor tasks"},
        )
    return HandlerResult(200, {"message": f"Workflow [{dag_id}] has been killed"})


def last_dag_logs(
    store: DagStore,
    dag_id: str | None,
    task_id: str | None,
    run_id: str | None = None,
    after: int = 0,
) -> HandlerResult:
    if not dag_id or not task_id:
        return HandlerResult(400, {"error": "last_dag_logs requires dag_id and task_id"})
    dag_id = _clean_dag_id(dag_id)
    try:
        body = store.last_logs(dag_id, run_id, task_id, after=after)
    except UnknownDagError:
        return _not_found(dag_id)
    except NoRunsError:
        return HandlerResult(
            404, {"error": f"Workflow [{dag_id}] has no runs to read logs from"}
        )
    except ValidationError as exc:
        return HandlerResult(400, {"error": "; ".join(exc.problems)})
    return HandlerResult(200, body)


def host_ip(store: DagStore) -> HandlerResult:
    return HandlerResult(200, {"ip": store.host_ip()})


def run_automation(
    store: DagStore,
    payload: dict[str, Any],
    *,
    fetch_workflow: Any = USE_DEFAULT_FETCHER,
) -> HandlerResult:
    """Synchronously execute an automation workflow (ruling §4.4).

    ``fetch_workflow`` is the workflow fetcher the executor uses to get
    the decrypted workflow from the server; the default is the production
    fetcher. ``None`` executes the posted body directly — a seam for
    tests without a server, never used in production. A completed test is
    a 200 carrying the ``TestConnectionResult``: a failed connection is a
    test outcome, not a server error
    (ADR:2026-11-11-test-connection-failed-steps-are-results). An
    unsupported service type is a 400 with the reason in plaintext. Only
    infra failures (workflow fetch, definition fetch, unusable request)
    are the masked 500.
    """
    try:
        workflow = validate_automation_workflow(payload)
    except ValidationError as exc:
        return HandlerResult(400, {"error": "; ".join(exc.problems)})
    try:
        from smartmetadata_ingestion.automations.execute import (
            UnsupportedServiceTypeError,
            execute_automation_workflow,
        )

        kwargs: dict[str, Any] = (
            {} if fetch_workflow is USE_DEFAULT_FETCHER else {"fetch_workflow": fetch_workflow}
        )
        result = execute_automation_workflow(workflow, **kwargs)
    except UnsupportedServiceTypeError as exc:
        return HandlerResult(400, {"error": str(exc)})
    except Exception as exc:  # noqa: BLE001 - mapped to the masked 500
        logger.error(
            "run_automation failed for workflow %s: %s",
            workflow.get("name"),
            exc,
            exc_info=True,
        )
        return _server_error()
    return HandlerResult(200, result)
