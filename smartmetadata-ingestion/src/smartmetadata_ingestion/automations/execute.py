# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Minimal automation workflow executor (ruling §4.4, U-4).

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

Failure semantics: anything the executor cannot run or that fails the live
test raises :class:`AutomationError` (the plugin maps it to a masked 500);
only a successful test returns. The server turns the plugin's 200 into a
successful test-connection response and the 500 into a
``PipelineServiceClientException``.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)


class AutomationError(WorkflowError):
    """A run_automation execution failure (the plugin maps it to 500)."""


FetchWorkflow = Callable[[str, dict[str, Any]], dict[str, Any]]


def fetch_workflow_by_name(
    name: str, server_connection: dict[str, Any]
) -> dict[str, Any]:
    """GET ``/v1/automations/workflows/name/{name}`` with the body's JWT."""
    from urllib.parse import quote

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
        raise AutomationError(
            "openMetadataServerConnection is not usable"
        ) from exc
    rest = RestClient(server_config)
    try:
        entity = rest.request(
            "GET", f"/v1/automations/workflows/name/{quote(name, safe='')}"
        )
    except Exception as exc:  # noqa: BLE001 - fetch failure is a 500
        raise AutomationError(
            f"failed to fetch automation workflow {name!r} from the server"
        ) from exc
    finally:
        rest.close()
    if not isinstance(entity, dict):
        raise AutomationError(
            f"server returned an unusable automation workflow {name!r}"
        )
    return entity


def execute_automation_workflow(
    workflow: dict[str, Any],
    *,
    fetch_workflow: FetchWorkflow | None = fetch_workflow_by_name,
) -> None:
    """Execute a Workflow's test connection synchronously.

    ``fetch_workflow=None`` executes the posted body directly; that seam
    exists only for tests without a server. Production always passes the
    real fetcher (the plugin app's default), so the decrypted workflow
    from the server is what runs.
    """
    name = workflow.get("name")
    workflow_type = workflow.get("workflowType")
    if workflow_type is not None and workflow_type != "TEST_CONNECTION":
        raise AutomationError(
            f"unsupported automation workflowType {workflow_type!r}"
        )
    if fetch_workflow is not None:
        workflow = fetch_workflow(
            str(name), workflow.get("openMetadataServerConnection") or {}
        )
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
    _run_test_connection(service_type, config)


def _run_test_connection(service_type: str, config: dict[str, Any]) -> None:
    normalized = service_type.strip().lower()
    if normalized == "mysql":
        _test_mysql(config)
        return
    raise AutomationError(
        f"unsupported service connection type {service_type!r}"
    )


def _test_mysql(config: dict[str, Any]) -> None:
    from smartmetadata_ingestion.connectors.mysql_common import test_live_connection

    try:
        test_live_connection(config)
    except WorkflowError:
        host_port = str(config.get("hostPort") or "")
        if "localhost" not in host_port:
            raise
        # Official runner quirk: the plugin runs in a container, where
        # "localhost" means the container itself, so a failed localhost
        # test is retried once against the Docker host.
        retried = dict(config)
        retried["hostPort"] = host_port.replace("localhost", "host.docker.internal")
        logger.info("mysql test connection retrying localhost as host.docker.internal")
        test_live_connection(retried)


__all__ = [
    "AutomationError",
    "execute_automation_workflow",
    "fetch_workflow_by_name",
]
