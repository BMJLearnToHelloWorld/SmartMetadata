# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""IngestionPipeline (server JSON) -> product WorkflowConfig.

Runs at DAG-parse time, inside the builder: the deploy step stores the
pipeline JSON as sent, and only here is it turned into the product runner's
config. The service connection is fetched live from the server at parse
time (only the bot JWT is pinned in the stored JSON); nothing else secret
is stored.

Field mapping decisions are recorded in ruling §4.2 (T-1..T-4): scope
restrictions the product cannot express fail loudly at deploy validation
and again here; additive extras are logged and skipped.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_REGEX_META = set(".*+?()|[]{}^$\\")


class TranslationError(Exception):
    """The pipeline cannot be expressed as a product WorkflowConfig."""


def _is_literal(pattern: str) -> bool:
    return not any(ch in _REGEX_META for ch in pattern)


def _translate_pattern(pattern: str) -> str | None:
    """One official filter pattern -> a product exact name, or None for all.

    ``.*`` means include-all; ``^name$`` and bare ``name`` are plain names.
    Anything else is a real regex the product's exact matcher cannot honor.
    """
    if pattern == ".*":
        return None
    anchored = re.fullmatch(r"\^([^\^$]+)\$", pattern)
    if anchored is not None:
        candidate = anchored.group(1)
        if _is_literal(candidate):
            return candidate
        raise TranslationError(f"filter pattern {pattern!r} is not a plain name")
    if _is_literal(pattern):
        return pattern
    raise TranslationError(f"filter pattern {pattern!r} is not a plain name")


def translate_filter_pattern(
    pattern: dict[str, Any] | None,
) -> tuple[list[str], list[str]]:
    """(includes, excludes) exact-name lists for a filter-pattern block."""
    if not pattern:
        return [], []
    includes: list[str] = []
    excludes: list[str] = []
    for entry in pattern.get("includes") or []:
        name = _translate_pattern(str(entry))
        if name is not None:
            includes.append(name)
    for entry in pattern.get("excludes") or []:
        name = _translate_pattern(str(entry))
        if name is not None:
            excludes.append(name)
        else:
            raise TranslationError(
                "filter pattern .* cannot exclude everything in the product runner"
            )
    return includes, excludes


def check_source_config_scope(source_config: dict[str, Any] | None) -> None:
    """Reject scope restrictions the product runner cannot honor (deploy 400).

    Called at deploy validation; the translation enforces the same rules at
    parse time. Additive extras (sample data, profiler flags) are only
    logged, never rejected: skipping them ingests less, never more.
    """
    config = (source_config or {}).get("config")
    if not isinstance(config, dict):
        return
    table_filter = config.get("tableFilterPattern")
    if isinstance(table_filter, dict):
        if table_filter.get("includes") or table_filter.get("excludes"):
            raise TranslationError(
                "sourceConfig.config.tableFilterPattern is not supported "
                "by the product runner yet"
            )
    if config.get("includeViews") is False:
        raise TranslationError(
            "sourceConfig.config.includeViews=false is not supported "
            "by the product runner yet"
        )


def _server_config(pipeline: dict[str, Any]) -> dict[str, Any]:
    conn = pipeline.get("openMetadataServerConnection") or {}
    security = conn.get("securityConfig") or {}
    jwt_token = security.get("jwtToken")
    if not isinstance(jwt_token, str) or not jwt_token.strip():
        raise TranslationError(
            "openMetadataServerConnection.securityConfig.jwtToken is required"
        )
    return {
        "hostPort": conn.get("hostPort"),
        "auth": {"type": "jwt", "jwtToken": jwt_token},
    }


_SERVICE_PATHS = {
    "apiService": "apiServices",
    "databaseService": "databaseServices",
    "dashboardService": "dashboardServices",
    "driveService": "driveServices",
    "messagingService": "messagingServices",
    "metadataService": "metadataServices",
    "mlmodelService": "mlmodelServices",
    "pipelineService": "pipelineServices",
    "searchService": "searchServices",
    "storageService": "storageServices",
}


def fetch_service_connection(
    pipeline: dict[str, Any],
    *,
    client: Any | None = None,
) -> dict[str, Any]:
    """Fetch the service's live connection from the server (parse time).

    The stored pipeline JSON is never trusted for the connection: the
    server is the source of truth, so a rotated secret or changed
    connection takes effect on the next DAG parse without a re-deploy.
    """
    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import ServerConfig

    server_config = ServerConfig.model_validate(_server_config(pipeline))
    rest = client if client is not None else RestClient(server_config)
    try:
        service = pipeline.get("service") or {}
        service_type = service.get("type") or "databaseService"
        path = _SERVICE_PATHS.get(service_type)
        if path is None:
            raise TranslationError(f"unknown service type {service_type!r}")
        source = pipeline.get("source") or {}
        service_name = source.get("serviceName")
        from urllib.parse import quote

        entity = rest.request(
            "GET", f"/v1/services/{path}/name/{quote(str(service_name), safe='')}"
        )
        connection = (entity or {}).get("connection") or {}
        config = connection.get("config")
        if not isinstance(config, dict):
            raise TranslationError(
                f"service {service_name!r} has no connection config on the server"
            )
        return config
    finally:
        if client is None:
            try:
                rest.close()
            except Exception:
                pass


def translate_pipeline(
    pipeline: dict[str, Any],
    *,
    workflow_type: str,
    source_type: str,
    service_connection: dict[str, Any] | None = None,
    server_client: Any | None = None,
    raise_on_error: bool | None = None,
) -> Any:
    """Build the product WorkflowConfig for one pipeline.

    ``service_connection`` overrides the live fetch (tests); otherwise the
    connection is fetched from the server at parse time.

    ``raise_on_error`` overrides the pipeline's own value when given: the
    official profiler (and test_suite) builders omit raiseOnError, so their
    builders pass False; metadata/usage/lineage leave it None and keep the
    pipeline value (official ``build_workflow_config_property``).
    """
    from smartmetadata_ingestion.config import WorkflowConfig

    if raise_on_error is None:
        raise_on_error = bool(pipeline.get("raiseOnError", False))

    source = pipeline.get("source") or {}
    source_config = source.get("sourceConfig") or {}
    config_block = source_config.get("config") or {}
    check_source_config_scope(source_config)
    schema_includes, schema_excludes = translate_filter_pattern(
        config_block.get("schemaFilterPattern")
    )
    db_includes, db_excludes = translate_filter_pattern(
        config_block.get("databaseFilterPattern")
    )
    if config_block.get("generateSampleData") or config_block.get("sampleDataQuery"):
        logger.warning(
            "sample data generation is not supported by the product runner yet; "
            "ignoring generateSampleData for pipeline %s",
            pipeline.get("name"),
        )
    if config_block.get("enableDataProfiler"):
        logger.warning(
            "enableDataProfiler inside a metadata pipeline is not supported by "
            "the product runner yet; ignoring it for pipeline %s",
            pipeline.get("name"),
        )
    if service_connection is None:
        service_connection = fetch_service_connection(
            pipeline, client=server_client
        )
    raw = {
        "workflow": {
            "name": pipeline.get("name"),
            "type": workflow_type,
            "failFast": raise_on_error,
            "ingestionPipelineFqn": pipeline.get("fullyQualifiedName"),
            "reconcileStale": bool(config_block.get("markDeletedTables", False)),
        },
        "server": _server_config(pipeline),
        "source": {
            "type": source_type,
            "serviceName": source.get("serviceName"),
            "serviceDisplayName": source.get("serviceDisplayName"),
            "connection": service_connection,
            "includeSchemas": schema_includes,
            "excludeSchemas": schema_excludes,
            "includeDatabases": db_includes,
            "excludeDatabases": db_excludes,
        },
        "processors": [],
        "sink": {"type": "metadata-rest"},
    }
    try:
        return WorkflowConfig.model_validate(raw)
    except Exception as exc:
        raise TranslationError(f"cannot build WorkflowConfig: {exc}") from exc
