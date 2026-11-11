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
from smartmetadata_airflow_apis.workflows import builders  # noqa: F401  (registers builders)
from smartmetadata_airflow_apis.workflows.registry import registered_types
from smartmetadata_airflow_apis.workflows.translation import (
    KNOWN_SERVICE_TYPES,
    deploy_scope_problems,
)

PIPELINE_TYPES = frozenset(TYPE_TO_TASK)


def _missing(field: str) -> str:
    return f"Missing: {field}"


def _invalid(field: str) -> str:
    return f"Invalid: {field}"


def _require_mapping(payload: Any, where: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError([_invalid(where)])
    return payload


def _require_str(
    mapping: dict[str, Any],
    field: str,
    problems: list[str],
    location: str | None = None,
) -> str | None:
    """Require a non-empty string at ``field``; report it as ``location``.

    ``location`` defaults to ``field``; nested fields pass the dotted
    path (e.g. ``service.type``) so the error names the full location,
    never just the leaf key.
    """
    value = mapping.get(field)
    where = location if location is not None else field
    if value is None:
        problems.append(_missing(where))
        return None
    if not isinstance(value, str) or not value.strip():
        problems.append(_invalid(where))
        return None
    return value


def _require_dict(
    mapping: dict[str, Any],
    field: str,
    problems: list[str],
    location: str | None = None,
) -> dict[str, Any] | None:
    """Require a mapping at ``field``; report it as ``location``."""
    value = mapping.get(field)
    where = location if location is not None else field
    if value is None:
        problems.append(_missing(where))
        return None
    if not isinstance(value, dict):
        problems.append(_invalid(where))
        return None
    return value


def _is_int_or_null(value: Any) -> bool:
    # bool is an int subclass in Python: True/1 must not pass as an int.
    return value is None or (isinstance(value, int) and not isinstance(value, bool))


def _is_bool_or_null(value: Any) -> bool:
    return value is None or isinstance(value, bool)


def _check_nested_types(body: dict[str, Any], problems: list[str]) -> None:
    """Nested type checks (P-32); appends field locations only.

    A wrong nested type must 400 naming the field, before any file is
    written — not 500 at DAG-parse time. Fields already reported missing
    or malformed by the top-level checks are skipped here so no field is
    reported twice (``sourceConfig.config`` is already covered by the
    N-11 scope check below).
    """
    airflow_config = body.get("airflowConfig")
    if isinstance(airflow_config, dict):
        schedule = airflow_config.get("scheduleInterval")
        if schedule is not None and not isinstance(schedule, str):
            problems.append(_invalid("airflowConfig.scheduleInterval"))
        for field in (
            "maxActiveRuns",
            "retries",
            "retryDelay",
            "workflowTimeout",
            "concurrency",
            "endDate",
        ):
            if not _is_int_or_null(airflow_config.get(field)):
                problems.append(_invalid(f"airflowConfig.{field}"))
        for field in ("pausePipeline", "pipelineCatchup"):
            if not _is_bool_or_null(airflow_config.get(field)):
                problems.append(_invalid(f"airflowConfig.{field}"))
    service = body.get("service")
    if isinstance(service, dict):
        service_type = service.get("type")
        if (
            isinstance(service_type, str)
            and service_type.strip()
            and service_type not in KNOWN_SERVICE_TYPES
        ):
            problems.append(_invalid("service.type"))
    pipeline_type = body.get("pipelineType")
    if (
        isinstance(pipeline_type, str)
        and pipeline_type.strip()
        and pipeline_type in PIPELINE_TYPES
        and pipeline_type not in registered_types()
    ):
        # A type the registry does not cover (dataInsight / policyAgent /
        # reverseMetadata, like official) can never build a DAG: 400 here
        # instead of a 500 after files are written.
        problems.append(_invalid("pipelineType"))


def validate_ingestion_pipeline(payload: Any) -> dict[str, Any]:
    """Validate a deploy body; returns it unchanged when it is well-formed.

    The deploy body is the IngestionPipeline **entity** the server sends
    (ruling §3.1, fix-round): top-level ``sourceConfig`` + ``service``,
    never the workflow-config form's top-level ``source`` — the official
    deploy route parses the payload as the entity
    (``parse_ingestion_pipeline_config_gracefully``) and the entity
    schema has no ``source`` property. A stray top-level ``source`` is
    ignored, not rejected (ruling §3.2, U-F1).
    """
    body = _require_mapping(payload, "body")
    problems: list[str] = []
    if not body:
        raise ValidationError([_invalid("body")])
    _require_str(body, "name", problems)
    pipeline_type = _require_str(body, "pipelineType", problems)
    if pipeline_type is not None and pipeline_type not in PIPELINE_TYPES:
        problems.append(_invalid("pipelineType"))
    # Entity fields (schema-required): sourceConfig + airflowConfig.
    _require_dict(body, "sourceConfig", problems)
    service = _require_dict(body, "service", problems)
    if service is not None:
        _require_str(service, "type", problems, location="service.type")
        _require_str(service, "name", problems, location="service.name")
    _require_dict(body, "airflowConfig", problems)
    server_conn = _require_dict(body, "openMetadataServerConnection", problems)
    if server_conn is not None:
        _require_str(server_conn, "hostPort", problems)
        security = _require_dict(
            server_conn,
            "securityConfig",
            problems,
            location="openMetadataServerConnection.securityConfig",
        )
        if security is not None:
            _require_str(
                security,
                "jwtToken",
                problems,
                location="openMetadataServerConnection.securityConfig.jwtToken",
            )
    _check_nested_types(body, problems)
    if problems:
        raise ValidationError(problems)
    # Deploy-time scope (P-11: only malformed structure — N-10/N-11 —
    # is rejected; regex scope and includeViews are expressible now):
    # checked here, before any file is written, so a violation is a 400
    # naming only the field location — never a 500 after partial writes
    # that would leave a broken DAG file behind for the dag-processor.
    # The scope input is the top-level sourceConfig (entity form).
    scope_problems = deploy_scope_problems(body.get("sourceConfig"))
    if scope_problems:
        raise ValidationError([_invalid(field) for field in scope_problems])
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
