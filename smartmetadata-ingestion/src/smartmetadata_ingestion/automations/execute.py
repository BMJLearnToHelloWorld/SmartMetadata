# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Automation workflow executor (ruling §4.4, U-4).

Clean-room implementation of the official ``execute_runner`` contract:
parse the Workflow JSON the server sends, re-fetch it by name, then run
the request's test against the connector. Synchronous; no DAG, no DagRun.

The re-fetch is load-bearing, not a freshness nicety: the server sends the
Workflow *encrypted* (``WorkflowResource.java:396-401`` — "We will send the
encrypted Workflow to the Pipeline Service Client. It will be fetched from
the API from there, since we are decrypting on GET based on user auth."),
so the posted body must never be executed as-is in production. The fetched
(decrypted) workflow is authoritative; the posted body only supplies the
name and the server connection to fetch with.

Test execution is definition-driven, mirroring the official
``TestConnectionRunner``: the definition is fetched from the server and its
steps run in order against the type's checks; a missing check is a visible
``Skipped`` step, never a crash, and once a connection gate fails the rest
are skipped as ``ConnectionNotEstablished``. The workflow is patched after
each step (``Running``) and finally (``Successful``/``Failed`` mirroring the
result), so the UI poll sees the outcome.

Failure semantics (ADR:2026-11-11-test-connection-failed-steps-are-results):
a failed connection is a test outcome — the run returns a
``TestConnectionResult`` with the failed steps and the plugin answers 200 —
while an unsupported service type raises
:class:`UnsupportedServiceTypeError` (the plugin answers 400 with the reason
in plaintext). Only infra failures (workflow fetch, definition fetch, an
unusable request) raise :class:`AutomationError` (the plugin maps it to a
masked 500).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from time import perf_counter
from typing import Any
from urllib.parse import quote

from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)


class AutomationError(WorkflowError):
    """A run_automation execution failure (the plugin maps it to 500)."""


class UnsupportedServiceTypeError(AutomationError):
    """A service type the executor has no checks for (the plugin maps it to 400)."""


FetchWorkflow = Callable[[str, dict[str, Any]], dict[str, Any]]


def _server_client(server_connection: dict[str, Any]):
    """Build the server client from a workflow's server connection."""
    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import ServerConfig

    conn = server_connection or {}
    security = conn.get("securityConfig") or {}
    jwt_token = security.get("jwtToken")
    if not isinstance(jwt_token, str) or not jwt_token.strip():
        raise AutomationError(
            "openMetadataServerConnection.securityConfig.jwtToken is required "
            "to fetch the automation workflow"
        )
    try:
        server_config = ServerConfig.model_validate(
            {
                "hostPort": conn.get("hostPort"),
                "auth": {"type": "jwt", "jwtToken": jwt_token},
            }
        )
    except Exception as exc:  # noqa: BLE001 - bad server connection shape
        raise AutomationError("openMetadataServerConnection is not usable") from exc
    return RestClient(server_config)


def fetch_workflow_by_name(name: str, server_connection: dict[str, Any]) -> dict[str, Any]:
    """GET ``/v1/automations/workflows/name/{name}`` with the body's JWT."""
    rest = _server_client(server_connection)
    try:
        entity = rest.request("GET", f"/v1/automations/workflows/name/{quote(name, safe='')}")
    except Exception as exc:  # noqa: BLE001 - fetch failure is a 500
        raise AutomationError(
            f"failed to fetch automation workflow {name!r} from the server"
        ) from exc
    finally:
        rest.close()
    if not isinstance(entity, dict):
        raise AutomationError(f"server returned an unusable automation workflow {name!r}")
    return entity


def fetch_test_connection_definition(
    service_type: str, server_connection: dict[str, Any], *, client=None
) -> dict[str, Any]:
    """GET the TestConnectionDefinition for a service type from the server."""
    rest = client if client is not None else _server_client(server_connection)
    try:
        entity = rest.get_test_connection_definition(service_type)
    except Exception as exc:  # noqa: BLE001 - fetch failure is a 500
        raise AutomationError(
            f"failed to fetch test connection definition for {service_type!r} from the server"
        ) from exc
    finally:
        if client is None:
            rest.close()
    if not isinstance(entity, dict):
        raise AutomationError(
            f"server returned an unusable test connection definition for {service_type!r}"
        )
    return entity


def patch_workflow_response(
    workflow_id: str,
    result: dict[str, Any],
    status: str,
    server_connection: dict[str, Any],
    *,
    client=None,
) -> None:
    """PATCH a workflow's response + status (pin ``patch_automation_workflow_response``).

    Never raises: a failed write-back is logged, like official — the run's
    outcome is the returned result, not the patch.
    """
    rest = client
    try:
        if rest is None:
            rest = _server_client(server_connection)
        rest.patch_automation_workflow_response(workflow_id, result, status)
    except Exception as exc:  # noqa: BLE001 - a failed patch must not fail the run
        logger.warning("failed to PATCH automation workflow %s response: %s", workflow_id, exc)
    finally:
        if client is None and rest is not None:
            rest.close()


def execute_automation_workflow(
    workflow: dict[str, Any],
    *,
    fetch_workflow: FetchWorkflow | None = fetch_workflow_by_name,
) -> dict[str, Any]:
    """Execute a Workflow's test connection synchronously.

    Returns the ``TestConnectionResult`` dict — a failed connection is a
    test outcome in that result, not an exception.

    ``fetch_workflow=None`` executes the posted body directly; that seam
    exists only for tests without a server. Production always passes the
    real fetcher (the plugin app's default), so the decrypted workflow
    from the server is what runs.
    """
    name = workflow.get("name")
    workflow_type = workflow.get("workflowType")
    if workflow_type is not None and workflow_type != "TEST_CONNECTION":
        raise AutomationError(f"unsupported automation workflowType {workflow_type!r}")
    if fetch_workflow is not None:
        workflow = fetch_workflow(str(name), workflow.get("openMetadataServerConnection") or {})
    request = workflow.get("request")
    if not isinstance(request, dict):
        raise AutomationError("automation workflow request is missing")
    connection = request.get("connection")
    if not isinstance(connection, dict):
        raise AutomationError("automation workflow request has no connection")
    config = connection.get("config")
    if not isinstance(config, dict):
        raise AutomationError("automation workflow connection has no config")
    service_type = config.get("type")
    if not isinstance(service_type, str) or not service_type.strip():
        raise AutomationError("automation workflow connection config has no type")
    server_connection = workflow.get("openMetadataServerConnection") or {}
    workflow_id = workflow.get("id")
    client = None
    if fetch_workflow is not None:
        client = _server_client(server_connection)
    try:
        return _run_test_connection(
            service_type,
            config,
            server_connection=server_connection,
            workflow_id=workflow_id if isinstance(workflow_id, str) else None,
            client=client,
        )
    finally:
        if client is not None:
            client.close()


def _run_test_connection(
    service_type: str,
    config: dict[str, Any],
    *,
    server_connection: dict[str, Any],
    workflow_id: str | None,
    client=None,
) -> dict[str, Any]:
    normalized = service_type.strip().lower()
    if normalized != "mysql":
        raise UnsupportedServiceTypeError(f"unsupported service connection type {service_type!r}")
    from smartmetadata_ingestion.automations.mysql_checks import MysqlChecks

    definition = fetch_test_connection_definition(service_type, server_connection, client=client)
    steps = definition.get("steps") if isinstance(definition, dict) else None
    if (
        not isinstance(steps, list)
        or not steps
        or any(not isinstance(step, dict) or not step.get("name") for step in steps)
    ):
        raise AutomationError(f"test connection definition for {service_type!r} has no steps")
    checks = MysqlChecks(config).checks()

    def _patch(result: dict[str, Any], *, final: bool) -> None:
        if not workflow_id:
            return
        if not final:
            status = "Running"
        elif result["status"] == "Successful":
            status = "Successful"
        else:
            status = "Failed"
        result["lastUpdatedAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
        patch_workflow_response(workflow_id, result, status, server_connection, client=client)

    return _run_definition_steps(steps, checks, patch=_patch)


def _run_definition_steps(
    steps: list[dict[str, Any]],
    checks: dict[str, Callable[[], Any]],
    *,
    patch: Callable[..., None] | None = None,
) -> dict[str, Any]:
    """Run definition steps in order (pin ``TestConnectionRunner.run``)."""
    result: dict[str, Any] = {"lastUpdatedAt": None, "status": "Running", "steps": []}
    gate_failed = False
    for step in steps:
        step_result = _run_step(checks.get(step["name"]), step, gate_failed)
        if not step_result["passed"] and _is_gate(step):
            gate_failed = True
        result["steps"].append(step_result)
        if patch is not None:
            patch(result, final=False)
    result["status"] = (
        "Successful"
        if all(step["passed"] for step in result["steps"] if step["mandatory"])
        else "Failed"
    )
    if patch is not None:
        patch(result, final=True)
    return result


def _run_step(
    method: Callable[[], Any] | None,
    step: dict[str, Any],
    gate_failed: bool,
) -> dict[str, Any]:
    if gate_failed:
        return _step_result(
            step, status="Skipped", passed=False, skip_reason="ConnectionNotEstablished"
        )
    if method is None:
        logger.warning("No check implemented for step %r", step["name"])
        return _step_result(step, status="Skipped", passed=False, skip_reason="NotImplemented")
    started = perf_counter()
    try:
        evidence = method()
    except Exception as error:  # noqa: BLE001 - a failed check is a failed step
        duration_ms = _elapsed_ms(started)
        logger.debug("Step %r failed", step["name"], exc_info=True)
        return _step_result(
            step,
            status="Failed" if _is_mandatory(step) else "Warning",
            passed=False,
            error_log=str(error),
            duration_ms=duration_ms,
        )
    duration_ms = _elapsed_ms(started)
    return _step_result(
        step,
        status="Warning" if evidence.caveat else "Passed",
        passed=True,
        diagnosis=(
            {"title": evidence.caveat.title, "remediation": evidence.caveat.remediation}
            if evidence.caveat
            else None
        ),
        duration_ms=duration_ms,
        executed_command=evidence.command,
        result_summary=evidence.summary,
    )


def _step_result(
    step: dict[str, Any],
    *,
    status: str,
    passed: bool,
    error_log: str | None = None,
    skip_reason: str | None = None,
    diagnosis: dict[str, str] | None = None,
    duration_ms: int | None = None,
    executed_command: str | None = None,
    result_summary: str | None = None,
) -> dict[str, Any]:
    """One TestConnectionStepResult (pin ``StepResultBuilder`` contract)."""
    return {
        "name": step["name"],
        "mandatory": _is_mandatory(step),
        "passed": passed,
        "status": status,
        "message": None,
        "errorLog": error_log,
        "skipReason": skip_reason,
        "diagnosis": diagnosis,
        "durationMs": duration_ms,
        "executedCommand": executed_command,
        "resultSummary": result_summary,
    }


def _is_mandatory(step: dict[str, Any]) -> bool:
    mandatory = step.get("mandatory")
    return True if mandatory is None else bool(mandatory)


def _is_gate(step: dict[str, Any]) -> bool:
    return step.get("category") == "ConnectionGate"


def _elapsed_ms(started: float) -> int:
    return int((perf_counter() - started) * 1000)


__all__ = [
    "AutomationError",
    "UnsupportedServiceTypeError",
    "execute_automation_workflow",
    "fetch_test_connection_definition",
    "fetch_workflow_by_name",
    "patch_workflow_response",
]
