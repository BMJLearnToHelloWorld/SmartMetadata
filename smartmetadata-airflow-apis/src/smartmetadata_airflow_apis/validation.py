# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shape validation for deploy / run_automation request bodies.

Only field locations are reported (Missing / Invalid / Extra) — never input
values, so a rejected body cannot leak a secret such as a JWT.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.contracts import TYPE_TO_TASK
from smartmetadata_airflow_apis.errors import ValidationError

PIPELINE_TYPES = frozenset(TYPE_TO_TASK)


def _missing(field: str) -> str:
    return f"Missing: {field}"


def _invalid(field: str) -> str:
    return f"Invalid: {field}"


def _require_mapping(payload: Any, where: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError([_invalid(where)])
    return payload


def _require_str(mapping: dict[str, Any], field: str, problems: list[str]) -> str | None:
    value = mapping.get(field)
    if value is None:
        problems.append(_missing(field))
        return None
    if not isinstance(value, str) or not value.strip():
        problems.append(_invalid(field))
        return None
    return value


def validate_ingestion_pipeline(payload: Any) -> dict[str, Any]:
    """Validate a deploy body; returns it unchanged when it is well-formed."""
    body = _require_mapping(payload, "body")
    problems: list[str] = []
    if not body:
        raise ValidationError([_invalid("body")])
    _require_str(body, "name", problems)
    pipeline_type = _require_str(body, "pipelineType", problems)
    if pipeline_type is not None and pipeline_type not in PIPELINE_TYPES:
        problems.append(_invalid("pipelineType"))
    source = body.get("source")
    if source is None:
        problems.append(_missing("source"))
    elif not isinstance(source, dict):
        problems.append(_invalid("source"))
    else:
        _require_str(source, "type", problems)
        _require_str(source, "serviceName", problems)
    server_conn = body.get("openMetadataServerConnection")
    if server_conn is None:
        problems.append(_missing("openMetadataServerConnection"))
    elif not isinstance(server_conn, dict):
        problems.append(_invalid("openMetadataServerConnection"))
    else:
        _require_str(server_conn, "hostPort", problems)
    if problems:
        raise ValidationError(problems)
    return body


def validate_automation_workflow(payload: Any) -> dict[str, Any]:
    """Validate a run_automation body; returns it unchanged when well-formed.

    The official Workflow shape (``entity/automations/workflow.json``,
    required: id, name, workflowType, request): the connection lives under
    ``request.connection.config`` (TestServiceConnectionRequest), not at
    the top level. ``openMetadataServerConnection`` is not schema-required
    and is not validated here — a body without it fails at fetch time
    (500), like the official route's ``execute()``. Whether the request
    carries a connection is also the executor's call (a connection-less
    request is a well-formed workflow the plugin cannot run → 500).
    """
    body = _require_mapping(payload, "body")
    problems: list[str] = []
    if not body:
        raise ValidationError([_invalid("body")])
    _require_str(body, "name", problems)
    _require_str(body, "workflowType", problems)
    request = body.get("request")
    if request is None:
        problems.append(_missing("request"))
    elif not isinstance(request, dict):
        problems.append(_invalid("request"))
    if problems:
        raise ValidationError(problems)
    return body
