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
and again here; additive extras are logged and skipped. The per-type knob
tables below carry every knob of the five pipeline schemas, typed, with
schema defaults (ADR:2026-11-14-agent-capability-batch1).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class TranslationError(Exception):
    """The pipeline cannot be expressed as a product WorkflowConfig."""


def translate_filter_pattern(
    pattern: dict[str, Any] | None,
) -> tuple[list[str], list[str]]:
    """(includes, excludes) regex lists for a filter-pattern block.

    Official ``FilterPattern`` is a full regex, passed through verbatim
    into ``WorkflowSource`` — the runner matches it (P-11). Only a
    malformed block is rejected here: a non-dict pattern or non-list
    includes/excludes (deploy validation's N-10/N-11, second line of
    defence at parse time, e.g. for trigger-time overrides).
    """
    if not pattern:
        return [], []
    if not isinstance(pattern, dict):
        raise TranslationError("filter pattern must be an object")
    for sub in ("includes", "excludes"):
        if sub in pattern and not isinstance(pattern[sub], list):
            raise TranslationError(f"filter pattern {sub} must be a list")
    return (
        [str(entry) for entry in pattern.get("includes") or []],
        [str(entry) for entry in pattern.get("excludes") or []],
    )


def _normalize_pipeline_type(value: Any) -> str | None:
    """The pipeline type as the builders spell it (``TestSuite`` normalized).

    ``None`` when the pipeline names no type: deploy validation requires
    ``pipelineType``, so this only happens for hand-built dicts, which
    keep the historical metadata reading.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    return "TestSuite" if normalized == "testSuite" else normalized


def ignored_source_switches(
    pipeline: dict[str, Any],
    *,
    workflow_type: str | None = None,
) -> list[str]:
    """Source switches the runner will ignore for this pipeline.

    ``generateSampleData`` / ``storeSampleData`` only reach the runner
    for messaging metadata pipelines (``source.messagingMetadata``) —
    and ``storeSampleData`` also reaches it for autoClassification
    pipelines (``source.storeSampleData``); ``sampleDataQuery`` and
    ``enableDataProfiler`` have no runner capability on any type, and
    ``storageMetadataConfigSource`` (credential-bearing manifest
    sources) has no runner design yet. Deploy surfaces these (log +
    response) so a successful deploy never silently under-ingests
    (P-11). ``workflow_type`` overrides the pipeline's own
    ``pipelineType`` when the caller knows it authoritatively (the
    translation does); deploy derives it from the payload.
    ADR:2026-11-14-agent-capability-batch1
    """
    config = (pipeline.get("sourceConfig") or {}).get("config")
    if not isinstance(config, dict):
        return []
    effective = _normalize_pipeline_type(workflow_type) or _normalize_pipeline_type(
        pipeline.get("pipelineType")
    )
    if effective is None:
        effective = "metadata"
    ignored: list[str] = []
    is_messaging_metadata = (
        effective == "metadata"
        and (pipeline.get("service") or {}).get("type") == "messagingService"
    )
    if config.get("generateSampleData") and not is_messaging_metadata:
        ignored.append("generateSampleData")
    if (
        config.get("storeSampleData")
        and effective != "autoClassification"
        and not is_messaging_metadata
    ):
        ignored.append("storeSampleData")
    if config.get("sampleDataQuery"):
        ignored.append("sampleDataQuery")
    if config.get("enableDataProfiler"):
        ignored.append("enableDataProfiler")
    if config.get("storageMetadataConfigSource") is not None:
        ignored.append("storageMetadataConfigSource")
    return ignored


# Filter-pattern keys across the five pipeline schemas, each mapped to the
# (include, exclude) SourceConfig aliases the pattern splits into.
# ADR:2026-11-14-agent-capability-batch1
_PATTERN_KNOBS: tuple[tuple[str, str, str], ...] = (
    ("schemaFilterPattern", "includeSchemas", "excludeSchemas"),
    ("databaseFilterPattern", "includeDatabases", "excludeDatabases"),
    ("tableFilterPattern", "includeTables", "excludeTables"),
    ("storedProcedureFilterPattern", "includeStoredProcedures", "excludeStoredProcedures"),
    ("topicFilterPattern", "includeTopics", "excludeTopics"),
    ("dashboardFilterPattern", "includeDashboards", "excludeDashboards"),
    ("chartFilterPattern", "includeCharts", "excludeCharts"),
    ("dataModelFilterPattern", "includeDataModels", "excludeDataModels"),
    ("projectFilterPattern", "includeProjects", "excludeProjects"),
    ("containerFilterPattern", "includeContainers", "excludeContainers"),
    ("bucketFilterPattern", "includeBuckets", "excludeBuckets"),
    ("pipelineFilterPattern", "includePipelines", "excludePipelines"),
    ("apiCollectionFilterPattern", "includeApiCollections", "excludeApiCollections"),
    ("apiEndpointFilterPattern", "includeApiEndpoints", "excludeApiEndpoints"),
    ("mlModelFilterPattern", "includeMlModels", "excludeMlModels"),
    ("searchIndexFilterPattern", "includeSearchIndexes", "excludeSearchIndexes"),
    ("directoryFilterPattern", "includeDirectories", "excludeDirectories"),
    ("fileFilterPattern", "includeFiles", "excludeFiles"),
    ("spreadsheetFilterPattern", "includeSpreadsheets", "excludeSpreadsheets"),
    ("worksheetFilterPattern", "includeWorksheets", "excludeWorksheets"),
    ("serverFilterPattern", "includeServers", "excludeServers"),
    ("classificationFilterPattern", "includeClassifications", "excludeClassifications"),
)

# Scalar knobs: (sourceConfig key, SourceConfig alias, schema default).
# Keys whose schema default varies by pipeline/service (includeViews,
# includeTags, includeOwners) are NOT here; translate_pipeline computes
# their defaults from the pipeline. Keys carried elsewhere (storeSampleData
# for autoClassification, generateSampleData for messaging metadata) are
# NOT here either, so an ignored switch can never leak into the runner.
_BOOL_KNOBS: tuple[tuple[str, str, bool], ...] = (
    ("markDeletedTables", "markDeletedTables", True),
    ("markDeletedStoredProcedures", "markDeletedStoredProcedures", True),
    ("markDeletedSchemas", "markDeletedSchemas", False),
    ("markDeletedDatabases", "markDeletedDatabases", False),
    ("markDeletedTopics", "markDeletedTopics", True),
    ("markDeletedContainers", "markDeletedContainers", True),
    ("markDeletedDashboards", "markDeletedDashboards", True),
    ("markDeletedDataModels", "markDeletedDataModels", True),
    ("markDeletedCharts", "markDeletedCharts", True),
    ("markDeletedApiCollections", "markDeletedApiCollections", True),
    ("markDeletedMlModels", "markDeletedMlModels", True),
    ("markDeletedPipelines", "markDeletedPipelines", True),
    ("markDeletedSearchIndexes", "markDeletedSearchIndexes", True),
    ("markDeletedDirectories", "markDeletedDirectories", True),
    ("markDeletedFiles", "markDeletedFiles", True),
    ("markDeletedSpreadsheets", "markDeletedSpreadsheets", True),
    ("markDeletedWorksheets", "markDeletedWorksheets", True),
    ("includeTables", "includeTablesEnabled", True),
    ("includeCustomProperties", "includeCustomProperties", False),
    ("includeStoredProcedures", "includeStoredProceduresEnabled", True),
    ("includeDDL", "includeDDL", False),
    ("overrideMetadata", "overrideMetadata", False),
    ("overrideLineage", "overrideLineage", False),
    ("useFqnForFiltering", "useFqnForFiltering", False),
    ("extractJsonSchema", "extractJsonSchema", False),
    ("processQueryCostAnalysis", "processQueryCostAnalysis", True),
    ("overrideViewLineage", "overrideViewLineage", False),
    ("processViewLineage", "processViewLineage", True),
    ("processQueryLineage", "processQueryLineage", True),
    ("processStoredProcedureLineage", "processStoredProcedureLineage", True),
    ("processCrossDatabaseLineage", "processCrossDatabaseLineage", False),
    ("enableTempTableLineage", "enableTempTableLineage", False),
    ("incrementalLineageProcessing", "incrementalLineageProcessing", True),
    ("computeTableMetrics", "computeTableMetrics", True),
    ("computeColumnMetrics", "computeColumnMetrics", True),
    ("useStatistics", "useStatistics", False),
    ("enableAutoPartitionDetection", "enableAutoPartitionDetection", True),
    ("randomizedSample", "randomizedSample", False),
    ("enableAutoClassification", "enableAutoClassification", True),
    ("includeDataModels", "includeDataModelsEnabled", True),
    ("includeMetrics", "includeMetrics", False),
    ("includeDraftDashboard", "includeDraftDashboard", True),
    ("includeUsage", "includeUsage", True),
    ("includeLineage", "includeLineage", True),
    ("includeUnDeployedPipelines", "includeUnDeployedPipelines", True),
    ("includeSampleData", "includeSampleData", True),
    ("includeIndexTemplate", "includeIndexTemplate", False),
    ("includeDirectories", "includeDirectoriesEnabled", True),
    ("includeFiles", "includeFilesEnabled", True),
    ("includeSpreadsheets", "includeSpreadsheetsEnabled", True),
    ("includeWorksheets", "includeWorksheetsEnabled", True),
)

_INT_KNOBS: tuple[tuple[str, str, int], ...] = (
    ("queryLogDuration", "queryLogDuration", 1),
    ("queryParsingTimeoutLimit", "queryParsingTimeoutLimit", 300),
    ("threads", "threads", 1),
    ("jsonSchemaSampleSize", "jsonSchemaSampleSize", 10),
    ("resultLimit", "resultLimit", 1000),
    ("parsingTimeoutLimit", "parsingTimeoutLimit", 300),
    ("timeoutSeconds", "timeoutSeconds", 43200),
    ("sampleDataCount", "sampleDataCount", 50),
    ("statusLookbackDays", "statusLookbackDays", 1),
    ("sampleSize", "sampleSize", 10),
)

_NULLABLE_INT_KNOBS: tuple[tuple[str, str], ...] = (
    ("threadCount", "threadCount"),
    ("maxSchemaInferenceDepth", "maxSchemaInferenceDepth"),
    ("maxChildrenPerColumn", "maxChildrenPerColumn"),
)

_STR_KNOBS: tuple[tuple[str, str, str], ...] = (
    ("stageFileLocation", "stageFileLocation", "/tmp/query_log"),
    ("classificationLanguage", "classificationLanguage", "en"),
    ("ownershipUpdateMode", "ownershipUpdateMode", "replace"),
)

_NULLABLE_STR_KNOBS: tuple[tuple[str, str], ...] = (
    ("filterCondition", "filterCondition"),
    ("queryLogFilePath", "queryLogFilePath"),
    ("defaultManifest", "defaultManifest"),
)

# Object knobs, validated by their typed SourceConfig models. An explicit
# null reads as "not provided" (the server emits null for unset objects);
# a present-but-malformed object fails loudly through model validation.
_OBJECT_KNOBS: tuple[str, ...] = (
    "incremental",
    "ownerConfig",
    "queryParserConfig",
    "profileSampleConfig",
    "processingEngine",
    "lineageInformation",
    "shardedTables",
)

# Every sourceConfig key the five pipeline schemas (plus the legacy
# switches and the ignored storage key) may carry. Anything else in a
# five-type config is warned about at parse time, never silently
# dropped; other workflow types (TestSuite, dbt, ...) own their keys
# and are not checked here.
_KNOWN_CONFIG_KEYS: frozenset[str] = (
    frozenset(key for key, _, _ in _PATTERN_KNOBS)
    | frozenset(key for key, _, _ in _BOOL_KNOBS)
    | frozenset(key for key, _, _ in _INT_KNOBS)
    | frozenset(key for key, _ in _NULLABLE_INT_KNOBS)
    | frozenset(key for key, _, _ in _STR_KNOBS)
    | frozenset(key for key, _ in _NULLABLE_STR_KNOBS)
    | frozenset(_OBJECT_KNOBS)
    | {
        "type",
        "includeViews",
        "includeTags",
        "includeOwners",
        "storeSampleData",
        "generateSampleData",
        "confidence",
        "crossDatabaseServiceNames",
        "metrics",
        "sampleDataQuery",
        "enableDataProfiler",
        "storageMetadataConfigSource",
    }
)

_FIVE_WORKFLOW_TYPES: frozenset[str] = frozenset(
    {"metadata", "usage", "lineage", "profiler", "autoClassification"}
)


def _warn_unknown_keys(
    config_block: dict[str, Any],
    workflow_type: str,
    pipeline_name: Any,
) -> None:
    """Warn about sourceConfig keys no five-type schema declares.

    A typo'd or newer-schema knob must surface at parse time; the run
    proceeds with the known knobs, since the server already validated
    the pipeline at creation and an unknown key cannot change runner
    behavior either way.
    """
    if workflow_type not in _FIVE_WORKFLOW_TYPES:
        return
    for key in sorted(set(config_block) - _KNOWN_CONFIG_KEYS):
        logger.warning(
            "unknown sourceConfig key %r for pipeline %s; ignoring it",
            key,
            pipeline_name,
        )


def deploy_scope_problems(source_config: dict[str, Any] | None) -> list[str]:
    """Deploy-time scope problems, as field locations only (ruling §4.2).

    Since P-11 the scope IS expressible — table patterns, ``includeViews``
    false and full regex are all honored by the runner — so only
    malformed structure is rejected here, before deploy writes any file:
    N-10 (a non-dict pattern) and N-11 (non-list includes/excludes),
    for every filter-pattern level the five schemas declare. A violation
    is a 400 naming only the field location — never a 500 after partial
    writes, and never a value (§2.3). Returns the offending field locations.
    """
    problems: list[str] = []
    if source_config is None:
        return problems
    if not isinstance(source_config, dict):
        # N-11: a present-but-malformed sourceConfig (e.g. a string)
        # raises AttributeError instead of a 400 naming the field.
        problems.append("sourceConfig")
        return problems
    config = source_config.get("config")
    if config is None:
        return problems
    if not isinstance(config, dict):
        # N-11: a present-but-malformed config (e.g. a string) passes
        # validation, then fails at DAG-parse time after files are written.
        problems.append("sourceConfig.config")
        return problems
    for key, _, _ in _PATTERN_KNOBS:
        pattern = config.get(key)
        if pattern is None:
            continue
        if not isinstance(pattern, dict):
            # N-10: a present-but-malformed pattern value (e.g. a string)
            # slips past validation and fails at DAG-parse time with a 500
            # after files are written; reject it here as Invalid.
            problems.append(f"sourceConfig.config.{key}")
            continue
        if any(
            sub in pattern and not isinstance(pattern[sub], list)
            for sub in ("includes", "excludes")
        ):
            # N-11: non-list includes/excludes iterate per character at
            # parse time (a string "sales" becomes ["s", "a", "l", "e",
            # "s"]) — a silent wrong scope with no error anywhere.
            problems.append(f"sourceConfig.config.{key}")
    return problems


def check_source_config_scope(source_config: dict[str, Any] | None) -> None:
    """Parse-time scope check (second line behind deploy validation).

    Since P-11 the whole official scope is expressible — regex patterns
    at all three levels and ``includeViews: false`` are honored by the
    runner — so there is nothing left to reject here. The hook stays so
    the translation keeps a parse-time place for scope rules; malformed
    structure is still caught by ``translate_filter_pattern``.
    """
    return None


def _server_config(pipeline: dict[str, Any]) -> dict[str, Any]:
    from smartmetadata_ingestion.secrets import (
        SecretsResolutionError,
        resolve_secret,
    )

    conn = pipeline.get("openMetadataServerConnection") or {}
    security = conn.get("securityConfig") or {}
    jwt_token = security.get("jwtToken")
    if not isinstance(jwt_token, str) or not jwt_token.strip():
        raise TranslationError(
            "openMetadataServerConnection.securityConfig.jwtToken is required"
        )
    # P-39: the stored JWT may be a secret:<id> reference (the server
    # sends the reference form when a secrets manager is configured).
    # Resolve it to the real Bearer here, at DAG-parse time, so rotating
    # the secret takes effect on the next parse without a re-deploy.
    # The deployed config file itself keeps the reference (dump_with_safe_jwt).
    try:
        jwt_token = resolve_secret(
            jwt_token,
            provider=conn.get("secretsManagerProvider"),
            loader=conn.get("secretsManagerLoader"),
        )
    except SecretsResolutionError as exc:
        raise TranslationError(str(exc)) from exc
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

# Service types a deploy body may name (P-32): the live service types
# above, plus "testSuite" — a testSuite pipeline's service IS the
# testSuite entity (official TestCasePipelineResolver), which has no
# entry in _SERVICE_PATHS because its connection is derived, not fetched.
KNOWN_SERVICE_TYPES = frozenset(_SERVICE_PATHS) | {"testSuite"}


def fetch_service_connection(
    pipeline: dict[str, Any],
    *,
    client: Any | None = None,
) -> tuple[dict[str, Any], str | None]:
    """Fetch the service's live connection from the server (parse time).

    The stored pipeline JSON is never trusted for the connection: the
    server is the source of truth, so a rotated secret or changed
    connection takes effect on the next DAG parse without a re-deploy.

    Returns ``(connection config, service type)``: the service type is
    the live service entity's ``serviceType`` (e.g. ``"Mysql"``), or
    ``None`` when the entity carries none — the caller falls back to
    the connection config's ``type``. The service name comes from the
    entity reference (``pipeline["service"]["name"]``), like the
    official ``build_source``.
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
        service_name = service.get("name")
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
        return config, (entity or {}).get("serviceType")
    finally:
        if client is None:
            try:
                rest.close()
            except Exception:
                pass


def _translate_source_knobs(
    config_block: dict[str, Any],
    workflow_type: str,
    service_type: str | None,
) -> dict[str, Any]:
    """Every per-type knob, translated to SourceConfig aliases.

    Absent keys take their schema default, so the runner always sees the
    effective config; present values pass through raw for model
    validation (a mistyped knob fails loudly at parse time, never
    silently coerced into a wrong run). Three defaults vary by
    pipeline/service and are computed here: the profiler schema defaults
    ``includeViews`` to false, the pipeline-service metadata schema
    defaults ``includeOwners`` to true, and the storage metadata schema
    defaults ``includeTags`` to false.
    ADR:2026-11-14-agent-capability-batch1
    """
    from smartmetadata_ingestion.config import DEFAULT_PROFILER_METRICS

    knobs: dict[str, Any] = {}
    for key, include_alias, exclude_alias in _PATTERN_KNOBS:
        includes, excludes = translate_filter_pattern(config_block.get(key))
        knobs[include_alias] = includes
        knobs[exclude_alias] = excludes
    for key, alias, default in _BOOL_KNOBS:
        knobs[alias] = config_block.get(key, default)
    for key, alias, default in _INT_KNOBS:
        knobs[alias] = config_block.get(key, default)
    for key, alias in _NULLABLE_INT_KNOBS:
        knobs[alias] = config_block.get(key)
    for key, alias, default in _STR_KNOBS:
        knobs[alias] = config_block.get(key, default)
    for key, alias in _NULLABLE_STR_KNOBS:
        knobs[alias] = config_block.get(key)
    for key in _OBJECT_KNOBS:
        if config_block.get(key) is not None:
            knobs[key] = config_block[key]
    knobs["confidence"] = config_block.get("confidence", 80)
    knobs["crossDatabaseServiceNames"] = config_block.get("crossDatabaseServiceNames", [])
    if "metrics" in config_block:
        knobs["metrics"] = config_block["metrics"]
    else:
        knobs["metrics"] = list(DEFAULT_PROFILER_METRICS)
    knobs["includeViews"] = config_block.get("includeViews", workflow_type != "profiler")
    knobs["includeOwners"] = config_block.get(
        "includeOwners",
        workflow_type == "metadata" and service_type == "pipelineService",
    )
    knobs["includeTags"] = config_block.get(
        "includeTags",
        not (workflow_type == "metadata" and service_type == "storageService"),
    )
    if workflow_type == "autoClassification":
        knobs["storeSampleData"] = config_block.get("storeSampleData", False)
    return knobs


# The markDeleted* aliases, for the reconcileStale gate: the gate is
# true when any effective deletion flag of the pipeline's service
# family is true (schema defaults applied), so a pipeline that deletes
# only schemas still reconciles, while a family whose flags are all
# false never does. Other families' defaults must not open the gate.
# ADR:2026-11-14-agent-capability-batch1
_MARK_DELETED_BY_SERVICE_TYPE: dict[str, tuple[str, ...]] = {
    "databaseService": (
        "markDeletedTables",
        "markDeletedStoredProcedures",
        "markDeletedSchemas",
        "markDeletedDatabases",
    ),
    "messagingService": ("markDeletedTopics",),
    "dashboardService": (
        "markDeletedDashboards",
        "markDeletedDataModels",
        "markDeletedCharts",
    ),
    "storageService": ("markDeletedContainers",),
    "pipelineService": ("markDeletedPipelines",),
    "searchService": ("markDeletedSearchIndexes",),
    "mlmodelService": ("markDeletedMlModels",),
    "apiService": ("markDeletedApiCollections",),
    "driveService": (
        "markDeletedDirectories",
        "markDeletedFiles",
        "markDeletedSpreadsheets",
        "markDeletedWorksheets",
    ),
}


def _reconcile_stale_for(
    source_knobs: dict[str, Any], workflow_type: str, service_type: str | None
) -> bool:
    """Whether the translated run reconciles stale entities (D-C7).

    Only metadata pipelines reconcile: usage/lineage/profiler configs
    carry the same knob defaults on the source, but their runs must
    never delete catalog entities. For metadata, the pin schema
    defaults of the service family decide —
    ``markDeletedTables``/``markDeletedStoredProcedures`` default true,
    so an AutoPilot config that sets only filter patterns reconciles,
    as the pin's does. An unknown service type reads as the database
    family, matching the runner's scope default.
    """
    if workflow_type != "metadata":
        return False
    aliases = _MARK_DELETED_BY_SERVICE_TYPE.get(
        service_type or "", _MARK_DELETED_BY_SERVICE_TYPE["databaseService"]
    )
    return any(bool(source_knobs.get(alias)) for alias in aliases)


# Override keys that carry through to SourceConfig under their own
# spelling (computed-default knobs and the remaining scalar knobs).
_OVERRIDE_IDENTITY_KEYS: frozenset[str] = frozenset(
    {
        "includeViews",
        "includeTags",
        "includeOwners",
        "confidence",
        "crossDatabaseServiceNames",
        "metrics",
    }
)

# Knob tables flattened for override translation: sourceConfig key ->
# SourceConfig alias. Filter patterns are handled separately (they
# split into include/exclude alias pairs).
_OVERRIDE_SCALAR_ALIASES: dict[str, str] = (
    {key: alias for key, alias, _ in _BOOL_KNOBS}
    | {key: alias for key, alias, _ in _INT_KNOBS}
    | {key: alias for key, alias in _NULLABLE_INT_KNOBS}
    | {key: alias for key, alias, _ in _STR_KNOBS}
    | {key: alias for key, alias in _NULLABLE_STR_KNOBS}
    | {key: key for key in _OBJECT_KNOBS}
    | {key: key for key in _OVERRIDE_IDENTITY_KEYS}
)


def translate_source_config_override(
    override: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Translate trigger-time ``sourceConfigOverride`` keys to source updates.

    Returns ``(updates, ignored)``: ``updates`` maps SourceConfig
    aliases to the override's values (filter patterns split into their
    include/exclude pairs through the same rule as deploy time), and
    ``ignored`` names the keys no runner knob owns — the caller warns
    about those. A malformed filter pattern raises ``TranslationError``:
    ignoring a narrowing override would run the deployed (broader)
    scope. Values pass through raw for model validation, as in
    ``_translate_source_knobs``.
    ADR:2026-11-14-agent-capability-batch1
    """
    pattern_aliases = {key: (include, exclude) for key, include, exclude in _PATTERN_KNOBS}
    updates: dict[str, Any] = {}
    ignored: list[str] = []
    for key, value in override.items():
        if key in pattern_aliases:
            include_alias, exclude_alias = pattern_aliases[key]
            includes, excludes = translate_filter_pattern(value)
            updates[include_alias] = includes
            updates[exclude_alias] = excludes
        elif key in _OVERRIDE_SCALAR_ALIASES:
            updates[_OVERRIDE_SCALAR_ALIASES[key]] = value
        else:
            ignored.append(key)
    return updates, ignored


def _alias_to_snake(alias: str) -> str:
    """A SourceConfig alias in field-name spelling (``markDeletedTables``)."""
    out: list[str] = []
    for char in alias:
        if char.isupper():
            out.append("_")
            out.append(char.lower())
        else:
            out.append(char)
    return "".join(out)


def reconcile_gate_for_source(source: dict[str, Any], family: str) -> bool:
    """The effective reconcile gate for a baked source dict (D-C7).

    The baked dict may spell flags camelCase (raw translation) or
    snake_case (a builder's model dump), and an override may have added
    the camelCase spelling beside the dumped snake_case one: the alias
    spelling wins, then the field spelling, then the schema default.
    Only the service family's flags decide — other families' defaults
    must not open the gate.
    ADR:2026-11-14-agent-capability-batch1
    """
    aliases = _MARK_DELETED_BY_SERVICE_TYPE.get(
        family, _MARK_DELETED_BY_SERVICE_TYPE["databaseService"]
    )
    defaults = {
        alias: default
        for key, alias, default in _BOOL_KNOBS
        if key.startswith("markDeleted")
    }
    for alias in aliases:
        value = source.get(alias, None)
        if value is None:
            value = source.get(_alias_to_snake(alias), defaults[alias])
        if bool(value):
            return True
    return False


def _test_case_names(entries: Any) -> list[str]:
    """Normalize ``sourceConfig.config.testCases`` to case names.

    The schema (``testSuitePipeline.json``) carries strings; a dict
    entry is accepted defensively (``name``, else the last segment of
    ``fullyQualifiedName`` — the pull filter compares against the bare
    case name). Anything else fails loudly instead of silently running
    no cases.
    """
    if entries is None:
        return []
    if not isinstance(entries, list):
        raise TranslationError("sourceConfig.config.testCases must be a list")
    names: list[str] = []
    for entry in entries:
        if isinstance(entry, str):
            if entry.strip():
                names.append(entry.strip())
        elif isinstance(entry, dict):
            name = entry.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
                continue
            fqn = entry.get("fullyQualifiedName")
            if isinstance(fqn, str) and fqn.strip():
                names.append(fqn.strip().split(".")[-1])
                continue
            raise TranslationError(
                "testCases entries must name a test case (name or "
                "fullyQualifiedName)"
            )
        else:
            raise TranslationError(
                "testCases entries must be strings naming a test case"
            )
    return names


def _test_suite_service_connection(
    pipeline: dict[str, Any],
    server_client: Any | None = None,
) -> tuple[dict[str, Any], str | None]:
    """Derive the database connection for a testSuite pipeline (parse time).

    Official ``build_source`` returns ``serviceConnection=None`` for
    testSuite and the TestSuiteSource resolves the connection at run time
    from the table named by
    ``sourceConfig.config.entityFullyQualifiedName``. The product runner
    consumes a static ``WorkflowConfig``, so the same resolution happens
    here, at DAG-parse time: table entity -> its service reference ->
    that service's live connection (so a rotated connection takes effect
    on the next parse without a re-deploy, like the other types).
    """
    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import ServerConfig
    from smartmetadata_ingestion.errors import RestError

    config_block = (pipeline.get("sourceConfig") or {}).get("config") or {}
    entity_fqn = config_block.get("entityFullyQualifiedName")
    if not isinstance(entity_fqn, str) or not entity_fqn.strip():
        raise TranslationError(
            "testSuite pipeline needs "
            "sourceConfig.config.entityFullyQualifiedName: the database "
            "connection is derived from that table's service"
        )
    server_config = ServerConfig.model_validate(_server_config(pipeline))
    rest = server_client if server_client is not None else RestClient(server_config)
    try:
        try:
            table = rest.get_table_by_name(entity_fqn.strip())
        except RestError as exc:
            raise TranslationError(
                f"cannot resolve the testSuite table "
                f"{entity_fqn.strip()!r}: {exc}"
            ) from exc
        service_ref = (table or {}).get("service") or {}
        service_name = service_ref.get("name")
        if not service_name:
            raise TranslationError(
                f"table {entity_fqn.strip()!r} names no service to derive "
                "the testSuite connection from"
            )
        derived = dict(pipeline)
        derived["service"] = {
            "name": service_name,
            "type": service_ref.get("type") or "databaseService",
        }
        return fetch_service_connection(derived, client=rest)
    finally:
        if server_client is None:
            try:
                rest.close()
            except Exception:
                pass


def translate_pipeline(
    pipeline: dict[str, Any],
    *,
    workflow_type: str,
    service_connection: tuple[dict[str, Any], str | None] | None = None,
    server_client: Any | None = None,
    raise_on_error: bool | None = None,
) -> Any:
    """Build the product WorkflowConfig for one pipeline.

    ``service_connection`` overrides the live fetch (tests): a
    ``(config, service type)`` pair, as ``fetch_service_connection``
    returns; otherwise the connection and the service type are fetched
    live from the server at parse time.

    The source type is derived from the live service — the service
    entity's ``serviceType`` when present, else the connection config's
    ``type`` — lowercased, with the usage/lineage suffix per
    ``workflow_type`` (official ``build_source`` + usage/lineage
    builders). Neither source means the pipeline cannot be expressed:
    fail loudly instead of silently building a ``"None"`` source.

    ``raise_on_error`` overrides the pipeline's own value when given: the
    official profiler (and test_suite) builders omit raiseOnError, so their
    builders pass False; metadata/usage/lineage leave it None and keep the
    pipeline value (official ``build_workflow_config_property``).
    """
    from smartmetadata_ingestion.config import WorkflowConfig

    # The server spells the pipeline type "TestSuite" (schema enum);
    # accept the service-type spelling too and normalize it.
    if workflow_type == "testSuite":
        workflow_type = "TestSuite"

    if raise_on_error is None:
        raise_on_error = bool(pipeline.get("raiseOnError", False))

    source_config = pipeline.get("sourceConfig") or {}
    config_block = source_config.get("config") or {}
    check_source_config_scope(source_config)
    _warn_unknown_keys(config_block, workflow_type, pipeline.get("name"))
    service_type = (pipeline.get("service") or {}).get("type")
    source_knobs = _translate_source_knobs(config_block, workflow_type, service_type)
    # The service-category type (databaseService, messagingService, ...):
    # service_type is reassigned below to the live service entity's
    # engine type (Mysql, Kafka, ...), which must not reach the
    # reconcile gate's family lookup.
    service_category = service_type
    # H track 1: the messaging metadata pipeline's generateSampleData
    # (legacy storeSampleData) travels to the runner as
    # source.messagingMetadata. Any other pipeline type has no such field
    # in the official schema, so the flag stays ignored there — including
    # autoClassification on a messaging service, whose storeSampleData
    # travels as source.storeSampleData instead.
    # ADR:2026-11-08-sampler-messaging-config-surface
    messaging_metadata: dict[str, Any] | None = None
    if workflow_type == "metadata" and service_type == "messagingService":
        if (
            config_block.get("generateSampleData") is not None
            or config_block.get("storeSampleData") is not None
        ):
            messaging_metadata = {}
            if config_block.get("generateSampleData") is not None:
                messaging_metadata["generateSampleData"] = bool(
                    config_block["generateSampleData"]
                )
            if config_block.get("storeSampleData") is not None:
                messaging_metadata["storeSampleData"] = bool(config_block["storeSampleData"])
    # Switches with no runner capability stay ignored — but warned here
    # and surfaced again at deploy time (ignored_source_switches), never
    # silently dropped.
    for switch in ignored_source_switches(pipeline, workflow_type=workflow_type):
        if switch == "generateSampleData":
            logger.warning(
                "sample data generation is not supported by the product runner yet; "
                "ignoring generateSampleData for pipeline %s",
                pipeline.get("name"),
            )
        elif switch == "storeSampleData":
            logger.warning(
                "storeSampleData is not supported by the product runner yet; "
                "ignoring it for pipeline %s",
                pipeline.get("name"),
            )
        elif switch == "sampleDataQuery":
            logger.warning(
                "sampleDataQuery is not supported by the product runner yet; "
                "ignoring it for pipeline %s",
                pipeline.get("name"),
            )
        elif switch == "enableDataProfiler":
            logger.warning(
                "enableDataProfiler inside a metadata pipeline is not supported by "
                "the product runner yet; ignoring it for pipeline %s",
                pipeline.get("name"),
            )
        elif switch == "storageMetadataConfigSource":
            logger.warning(
                "storageMetadataConfigSource is not supported by the product "
                "runner yet; ignoring it for pipeline %s",
                pipeline.get("name"),
            )
    if workflow_type == "TestSuite" and service_connection is None:
        # Official build_source: testSuite passes sourceConfig through
        # with serviceConnection=None; the connection is resolved from
        # the suite's table (see _test_suite_service_connection).
        service_connection, service_type = _test_suite_service_connection(
            pipeline, server_client
        )
    elif service_connection is None:
        service_connection, service_type = fetch_service_connection(
            pipeline, client=server_client
        )
    else:
        service_connection, service_type = service_connection
    base_type = (service_type or service_connection.get("type") or "").strip()
    if not base_type:
        raise TranslationError(
            "cannot derive the source type: the service has neither "
            "a serviceType nor a connection type"
        )
    base_type = base_type.lower()
    if workflow_type == "usage":
        source_type = f"{base_type}-usage"
    elif workflow_type == "lineage":
        source_type = f"{base_type}-lineage"
    else:
        source_type = base_type
    service = pipeline.get("service") or {}
    service_name = service.get("name")
    service_display_name = service.get("displayName") or service_name
    source_block: dict[str, Any] = {
        "type": source_type,
        "serviceName": service_name,
        "serviceDisplayName": service_display_name,
        "connection": service_connection,
    }
    source_block.update(source_knobs)
    raw = {
        "workflow": {
            "name": pipeline.get("name"),
            "type": workflow_type,
            "failFast": raise_on_error,
            "ingestionPipelineFqn": pipeline.get("fullyQualifiedName"),
            "reconcileStale": _reconcile_stale_for(
                source_knobs, workflow_type, service_category
            ),
        },
        "server": _server_config(pipeline),
        "source": source_block,
        "processors": [],
        "sink": {"type": "metadata-rest"},
    }
    if messaging_metadata is not None:
        raw["source"]["messagingMetadata"] = messaging_metadata
    if workflow_type == "TestSuite":
        # Official build_source passes the testSuite sourceConfig
        # through untouched; the runner pulls the cases from the table
        # named here (entityFullyQualifiedName) at run time.
        entity_fqn = config_block.get("entityFullyQualifiedName")
        if isinstance(entity_fqn, str) and entity_fqn.strip():
            raw["source"]["entityFullyQualifiedName"] = entity_fqn.strip()
        raw["source"]["testCaseNames"] = _test_case_names(
            config_block.get("testCases")
        )
    try:
        return WorkflowConfig.model_validate(raw)
    except Exception as exc:
        raise TranslationError(f"cannot build WorkflowConfig: {exc}") from exc
