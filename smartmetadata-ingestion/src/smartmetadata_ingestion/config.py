# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""YAML/JSON workflow configuration. Secrets come from the environment, not the file."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.expand import expand_value


def _to_camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        alias_generator=_to_camel,
    )


class AuthConfig(CamelModel):
    type: Literal["jwt", "login"] = "jwt"
    jwt_token: str | None = None
    email: str | None = None
    password: str | None = None

    @model_validator(mode="after")
    def require_credentials(self) -> AuthConfig:
        if self.type == "jwt" and not (self.jwt_token and self.jwt_token.strip()):
            raise ValueError("auth.jwtToken is required when auth.type is jwt")
        if self.type == "login":
            if not (self.email and self.email.strip()):
                raise ValueError("auth.email is required when auth.type is login")
            if not (self.password and self.password.strip()):
                raise ValueError("auth.password is required when auth.type is login")
        return self


class ServerConfig(CamelModel):
    host_port: str
    auth: AuthConfig
    timeout_seconds: float = 30.0
    retry_attempts: int = 3

    @field_validator("host_port")
    @classmethod
    def strip_host(cls, value: str) -> str:
        host = value.strip().rstrip("/")
        if not host:
            raise ValueError("server.hostPort is required")
        path = urlparse(host).path
        if path in {"", "/"}:
            return f"{host}/api"
        return host

    @field_validator("retry_attempts")
    @classmethod
    def cap_retries(cls, value: int) -> int:
        if value < 0 or value > 8:
            raise ValueError("server.retryAttempts must be between 0 and 8")
        return value


class WorkflowSettings(CamelModel):
    name: str
    type: Literal[
        "metadata",
        "usage",
        "lineage",
        "profiler",
        "TestSuite",
        "data_diff",
        "dbt",
        "autoClassification",
        "elasticSearchReindex",
        "application",
    ] = "metadata"
    fail_fast: bool = False
    ingestion_pipeline_fqn: str | None = None
    reconcile_stale: bool = False
    reconcile_dry_run: bool = False


class MessagingMetadataPipelineConfig(CamelModel):
    """Official ``messagingServiceMetadataPipeline`` sourceConfig (messaging only).

    Carries the sampling flags of the messaging metadata pipeline: the
    pipeline gate reads ``generateSampleData`` and, for legacy pipeline
    configs, ``storeSampleData`` (official ``common_broker_source.py``
    ``getattr`` order). No other pipeline config lives here: filter
    patterns are translated into the ``include_*`` lists above,
    ``markDeletedTopics`` is carried on ``SourceConfig`` and honored
    by reconcile, and ``overrideMetadata`` is carried there and
    honored bulk-only by the sink.
    ADR:2026-11-08-sampler-messaging-config-surface
    """

    generate_sample_data: bool = False
    store_sample_data: bool | None = None


# --- Per-type pipeline knobs (capability batch 1, C-3) ---------------------
# The five pipeline schemas' knobs, carried typed on SourceConfig so the
# runners read them instead of the translation silently dropping them.
# Defaults are the schema defaults; where two schemas disagree on one
# shared field, the translation applies the pipeline's own schema default
# and SourceConfig keeps the common one (see translation.py).
# ADR:2026-11-14-agent-capability-batch1

# The profiler schema's default metric list, in schema order: an absent
# ``metrics`` key means this list, while an explicitly empty list means
# "compute all metrics" — the two must stay distinguishable, so the
# translation passes this constant only when the key is absent.
DEFAULT_PROFILER_METRICS: tuple[str, ...] = (
    "mean",
    "valuesCount",
    "columnCount",
    "distinctCount",
    "distinctProportion",
    "max",
    "min",
    "nullCount",
    "rowCount",
    "stddev",
    "sum",
    "uniqueCount",
    "uniqueProportion",
    "columnNames",
    "nullProportion",
    "median",
    "firstQuartile",
    "thirdQuartile",
    "interQuartileRange",
    "nonParametricSkew",
)


class QueryParserConfig(CamelModel):
    """``parserconfig/queryParserConfig.json``: which SQL parser the cascade tries.

    ``SqlParse`` is deliberately absent from the enum: it is the cascade's
    implicit universal fallback, never a selectable type.
    """

    type: Literal["Auto", "SqlGlot", "SqlFluff"] = "Auto"


class IncrementalConfig(CamelModel):
    """The database metadata schema's ``incremental`` object."""

    enabled: bool = False
    lookback_days: int = 7
    safety_margin_days: int = 1


OwnerValue = str | list[str]


class OwnerConfig(CamelModel):
    """``type/ownerConfig.json``: owners per hierarchy level, with inheritance.

    A level is one owner for everything or a map from entity name/FQN to
    its owner(s); the schema's business rule (users and teams mutually
    exclusive, at most one team) is enforced by the server at pipeline
    creation, not re-checked here.
    """

    default: str | None = None
    service: str | None = None
    database: str | dict[str, OwnerValue] | None = None
    database_schema: str | dict[str, OwnerValue] | None = None
    table: str | dict[str, OwnerValue] | None = None
    enable_inheritance: bool = True


class ShardedTablesConfig(CamelModel):
    """BigQuery daily-shard grouping. Present only in the UI schema copy
    (``smartmetadata-ui/src/ingestion/schemas/``); the in-repo spec copy
    lacks it (C-15 stale snapshot). Omitted configuration stays disabled.
    """

    enabled: bool = False


class LineageInformationConfig(CamelModel):
    """The dashboard/ML/pipeline metadata schemas' ``lineageInformation``."""

    db_service_prefixes: list[str] = Field(default_factory=list)


class NativeEngineConfig(CamelModel):
    """The profiler schema's native processing engine (the default)."""

    type: Literal["Native"]


class SparkEngineInnerConfig(CamelModel):
    """The Spark engine's ``config`` object."""

    temp_path: str = "/tmp/openmetadata"
    extra_config: dict[str, Any] | None = None


class SparkEngineConfig(CamelModel):
    """The profiler schema's Spark processing engine. Carried typed; no
    Spark runner exists yet, so selecting it is a recorded residual, not
    a silent no-op (the value reaches the runner, which fails loud on
    an engine it cannot run)."""

    type: Literal["Spark"]
    remote: str
    config: SparkEngineInnerConfig | None = None


ProcessingEngineConfig = Annotated[
    NativeEngineConfig | SparkEngineConfig,
    Field(discriminator="type"),
]


class StaticSamplingConfig(CamelModel):
    """``type/staticSamplingConfig.json``: one fixed sample size.

    The schema spells the row-count type ``ROWS``; the runner's
    ``StaticSampleConfig`` spells it ``ROW_COUNT`` — the profiler worker
    maps between them, following the existing ``_static_from_dict``.
    """

    profile_sample: float | None = None
    profile_sample_type: Literal["PERCENTAGE", "ROWS"] | None = None
    sampling_method_type: Literal["SYSTEM", "BERNOULLI"] | None = None


class DynamicSamplingThreshold(CamelModel):
    """One row-count tier of ``type/dynamicSamplingConfig.json``."""

    row_count_threshold: int = Field(ge=1)
    profile_sample: float | None = None
    profile_sample_type: Literal["PERCENTAGE", "ROWS"] | None = None
    sampling_method_type: Literal["SYSTEM", "BERNOULLI"] | None = None


class DynamicSamplingConfig(CamelModel):
    """``type/dynamicSamplingConfig.json``: sample size from row-count tiers."""

    smart_sampling: bool = True
    thresholds: list[DynamicSamplingThreshold] = Field(default_factory=list)


class ProfileSampleConfig(CamelModel):
    """``type/samplingConfig.json#/definitions/profileSampleConfig``.

    The schema's ``config`` is a ``oneOf`` over the static and dynamic
    shapes that does not consult ``sampleConfigType``: a config shaped
    like the other arm is still schema-valid. Resolution therefore tries
    the declared arm first and the other arm second, and fails only when
    neither shape validates.
    """

    sample_config_type: Literal["STATIC", "DYNAMIC"] = "DYNAMIC"
    config: StaticSamplingConfig | DynamicSamplingConfig | None = None

    @model_validator(mode="before")
    @classmethod
    def resolve_config_arm(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("config")
        if not isinstance(raw, dict):
            return data
        declared = data.get("sampleConfigType", data.get("sample_config_type", "DYNAMIC"))
        arms: tuple[type[StaticSamplingConfig] | type[DynamicSamplingConfig], ...] = (
            (DynamicSamplingConfig, StaticSamplingConfig)
            if declared != "STATIC"
            else (StaticSamplingConfig, DynamicSamplingConfig)
        )
        for arm in arms:
            try:
                resolved = arm.model_validate(raw)
            except Exception:
                continue
            return {**data, "config": resolved}
        return data


class SourceConfig(CamelModel):
    type: str
    service_name: str
    service_display_name: str | None = None
    connection: dict[str, Any] = Field(default_factory=dict)
    # --- H track 1 (Wave 2 sampler messaging chain) -----------------------
    # The messaging metadata pipeline's sourceConfig surface only. No
    # generic sampling flag lives on SourceConfig: official defines
    # generateSampleData only in messagingServiceMetadataPipeline, so the
    # flag is a typed messaging-scoped block, never a shared boolean.
    messaging_metadata: MessagingMetadataPipelineConfig | None = None
    include_schemas: list[str] = Field(default_factory=list)
    exclude_schemas: list[str] = Field(
        default_factory=lambda: ["information_schema", "pg_catalog", "pg_toast"]
    )
    include_databases: list[str] = Field(default_factory=list)
    exclude_databases: list[str] = Field(default_factory=list)
    include_topics: list[str] = Field(default_factory=list)
    exclude_topics: list[str] = Field(default_factory=list)
    include_dashboards: list[str] = Field(default_factory=list)
    exclude_dashboards: list[str] = Field(default_factory=list)
    include_charts: list[str] = Field(default_factory=list)
    exclude_charts: list[str] = Field(default_factory=list)
    include_containers: list[str] = Field(default_factory=list)
    exclude_containers: list[str] = Field(default_factory=list)
    include_pipelines: list[str] = Field(default_factory=list)
    exclude_pipelines: list[str] = Field(default_factory=list)
    # Further filter-pattern levels (one include/exclude pair per schema
    # pattern key; the translation splits each FilterPattern into them).
    # ``include_classifications`` matches an entity's tags/tiers/glossary
    # terms (the classificationFilterPattern semantic), not entity names.
    include_stored_procedures: list[str] = Field(default_factory=list)
    exclude_stored_procedures: list[str] = Field(default_factory=list)
    include_data_models: list[str] = Field(default_factory=list)
    exclude_data_models: list[str] = Field(default_factory=list)
    include_projects: list[str] = Field(default_factory=list)
    exclude_projects: list[str] = Field(default_factory=list)
    include_api_collections: list[str] = Field(default_factory=list)
    exclude_api_collections: list[str] = Field(default_factory=list)
    include_api_endpoints: list[str] = Field(default_factory=list)
    exclude_api_endpoints: list[str] = Field(default_factory=list)
    include_ml_models: list[str] = Field(default_factory=list)
    exclude_ml_models: list[str] = Field(default_factory=list)
    include_search_indexes: list[str] = Field(default_factory=list)
    exclude_search_indexes: list[str] = Field(default_factory=list)
    include_directories: list[str] = Field(default_factory=list)
    exclude_directories: list[str] = Field(default_factory=list)
    include_files: list[str] = Field(default_factory=list)
    exclude_files: list[str] = Field(default_factory=list)
    include_spreadsheets: list[str] = Field(default_factory=list)
    exclude_spreadsheets: list[str] = Field(default_factory=list)
    include_worksheets: list[str] = Field(default_factory=list)
    exclude_worksheets: list[str] = Field(default_factory=list)
    include_buckets: list[str] = Field(default_factory=list)
    exclude_buckets: list[str] = Field(default_factory=list)
    include_servers: list[str] = Field(default_factory=list)
    exclude_servers: list[str] = Field(default_factory=list)
    include_classifications: list[str] = Field(default_factory=list)
    exclude_classifications: list[str] = Field(default_factory=list)
    # Table scope (P-11): official FilterPattern regex, passed through
    # verbatim by the translation layer; include_views decides whether
    # View / MaterializedView rows are emitted at all.
    include_tables: list[str] = Field(default_factory=list)
    exclude_tables: list[str] = Field(default_factory=list)
    include_views: bool = True
    include_view_lineage: bool = False
    store_connection_secrets: bool = False
    records: list[dict[str, Any]] = Field(default_factory=list)

    # --- Per-type pipeline knobs (capability batch 1, C-3) ---------------
    # Carried typed from the pipeline schemas by the translation; the
    # runners honor them in the batch-1/2 work. Where a boolean toggle
    # and a filter-pattern list would share a name, the list keeps the
    # plain name and the toggle takes the ``_enabled`` suffix
    # (``includeTables`` -> ``include_tables_enabled`` and siblings).
    # ADR:2026-11-14-agent-capability-batch1
    # Metadata: deletion flags. These carry the schema values for the
    # per-kind reconcile work (D-C7); ``workflow.reconcileStale`` is
    # derived from the service family's flags at translation time, so
    # the gate opens exactly when a family flag is true.
    mark_deleted_tables: bool = True
    mark_deleted_stored_procedures: bool = True
    mark_deleted_schemas: bool = False
    mark_deleted_databases: bool = False
    mark_deleted_topics: bool = True
    mark_deleted_containers: bool = True
    mark_deleted_dashboards: bool = True
    mark_deleted_data_models: bool = True
    mark_deleted_charts: bool = True
    mark_deleted_api_collections: bool = True
    mark_deleted_ml_models: bool = True
    mark_deleted_pipelines: bool = True
    mark_deleted_search_indexes: bool = True
    mark_deleted_directories: bool = True
    mark_deleted_files: bool = True
    mark_deleted_spreadsheets: bool = True
    mark_deleted_worksheets: bool = True
    # Metadata: inclusion toggles and overrides.
    include_tables_enabled: bool = True
    include_tags: bool = True
    include_custom_properties: bool = False
    include_owners: bool = False
    include_stored_procedures_enabled: bool = True
    # The alias generator would spell this ``includeDdl``; the schema
    # key is ``includeDDL``.
    include_ddl: bool = Field(default=False, alias="includeDDL")
    override_metadata: bool = False
    override_lineage: bool = False
    include_data_models_enabled: bool = True
    include_metrics: bool = False
    include_draft_dashboard: bool = True
    include_usage: bool = True
    include_lineage: bool = True
    # The alias generator would spell this ``includeUndeployedPipelines``;
    # the schema key capitalizes the D.
    include_undeployed_pipelines: bool = Field(
        default=True, alias="includeUnDeployedPipelines"
    )
    include_sample_data: bool = True
    include_index_template: bool = False
    include_directories_enabled: bool = True
    include_files_enabled: bool = True
    include_spreadsheets_enabled: bool = True
    include_worksheets_enabled: bool = True
    owner_config: OwnerConfig | None = None
    lineage_information: LineageInformationConfig | None = None
    default_manifest: str | None = None
    sharded_tables: ShardedTablesConfig | None = None
    # Metadata: extraction behavior.
    use_fqn_for_filtering: bool = False
    threads: int = 1
    incremental: IncrementalConfig | None = None
    extract_json_schema: bool = False
    json_schema_sample_size: int = Field(default=10, ge=1, le=1000)
    max_schema_inference_depth: int | None = Field(default=None, ge=0)
    max_children_per_column: int | None = Field(default=None, ge=0)
    query_parsing_timeout_limit: int = 300
    ownership_update_mode: Literal["replace", "append"] = "replace"
    status_lookback_days: int = 1
    sample_size: int = 10
    # Usage + lineage: query-log reading and parsing.
    query_log_duration: int = 1
    stage_file_location: str = "/tmp/query_log"
    filter_condition: str | None = None
    result_limit: int = 1000
    query_log_file_path: str | None = None
    # Dead knob (D-C6): carried so the config round-trips, but no reader
    # may honor it — the pin leaves it unread too and the cost pipeline
    # runs unconditionally.
    process_query_cost_analysis: bool = True
    parsing_timeout_limit: int = 300
    query_parser_config: QueryParserConfig | None = None
    override_view_lineage: bool = False
    process_view_lineage: bool = True
    process_query_lineage: bool = True
    process_stored_procedure_lineage: bool = True
    process_cross_database_lineage: bool = False
    cross_database_service_names: list[str] = Field(default_factory=list)
    enable_temp_table_lineage: bool = False
    incremental_lineage_processing: bool = True
    # Profiler.
    processing_engine: ProcessingEngineConfig | None = None
    compute_table_metrics: bool = True
    compute_column_metrics: bool = True
    use_statistics: bool = False
    enable_auto_partition_detection: bool = True
    profile_sample_config: ProfileSampleConfig | None = None
    randomized_sample: bool = False
    thread_count: int | None = None
    timeout_seconds: int = 43200
    metrics: list[str] = Field(default_factory=lambda: list(DEFAULT_PROFILER_METRICS))
    # AutoClassification (all three category schemas).
    store_sample_data: bool = False
    enable_auto_classification: bool = True
    confidence: float = Field(default=80, ge=0, le=100)
    sample_data_count: int = Field(default=50, ge=1, le=1000)
    classification_language: str = "en"

    # --- TestSuite server pull (Wave 2 H track 3) ---
    # ADR:2026-11-08-test-suite-server-pull — mirrors official
    # TestSuitePipeline: the table FQN of a table suite (absent = the logical
    # suite named `service_name`), plus an optional case-name filter.
    entity_fully_qualified_name: str | None = None
    test_case_names: list[str] = Field(default_factory=list)

    @field_validator("entity_fully_qualified_name")
    @classmethod
    def strip_entity_fqn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = str(value).strip()
        return stripped or None

    @field_validator("type")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        if not value or not str(value).strip():
            raise ValueError("source.type is required")
        return str(value).strip().lower()

    @field_validator("service_name")
    @classmethod
    def require_service_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("source.serviceName is required")
        return value.strip()


class ProcessorConfig(CamelModel):
    type: str
    options: dict[str, Any] = Field(default_factory=dict)


class SinkConfig(CamelModel):
    type: Literal["metadata-rest"] = "metadata-rest"
    use_bulk: bool = True
    bulk_batch_size: int = 50

    @field_validator("bulk_batch_size")
    @classmethod
    def require_batch(cls, value: int) -> int:
        if value < 1 or value > 500:
            raise ValueError("sink.bulkBatchSize must be between 1 and 500")
        return value


class LineageEndpointConfig(CamelModel):
    type: str
    fqn: str


class ColumnLineageSpec(CamelModel):
    from_columns: list[str] = Field(default_factory=list)
    to_column: str
    function: str | None = None


class EntityRefSpec(CamelModel):
    type: str
    fully_qualified_name: str | None = None
    id: str | None = None
    name: str | None = None


class LineageSpec(CamelModel):
    from_entity: LineageEndpointConfig
    to_entity: LineageEndpointConfig
    description: str | None = None
    source: str = "Manual"
    sql_query: str | None = None
    columns_lineage: list[ColumnLineageSpec] = Field(default_factory=list)
    pipeline: EntityRefSpec | None = None


class UsageSpec(CamelModel):
    entity_type: str = "table"
    fqn: str
    date: str
    count: int


class ProfileSpec(CamelModel):
    entity_type: str = "table"
    fqn: str | None = None
    table_id: str | None = None
    profile_data: dict[str, Any] | None = None
    profile_type: str | None = None
    timestamp: int | None = None
    table_profile: dict[str, Any] | None = None
    column_profile: list[dict[str, Any]] = Field(default_factory=list)
    system_profile: list[dict[str, Any]] = Field(default_factory=list)


class TestCaseResultSpec(CamelModel):
    test_case_fqn: str
    timestamp: int
    test_case_status: str
    test_result_value: list[dict[str, Any]] = Field(default_factory=list)
    result: str | None = None
    sample_data: str | None = None
    passed_rows: int | None = None
    failed_rows: int | None = None
    passed_rows_percentage: float | None = None
    failed_rows_percentage: float | None = None
    duration: float | None = None


class TestCaseSpec(CamelModel):
    """A data-quality case executed live by a TestSuite workflow.

    ``expression`` is the SQL the case evaluates (the existing
    ``*TestSuiteInterface.run_test_case`` contract); ``expected`` is the
    scalar it is compared against.
    """

    test_case_fqn: str
    expression: str
    expected: Any = True


class ProfilerMetricParamSpec(CamelModel):
    """Per-column runtime props for the parameterized profiler metrics.

    Mirrors the official RUNTIME_PROPS_METRICS contract: likeCount /
    iLikeCount / notLikeCount / regexCount / notRegexCount take an
    expression, countInSet takes a values list. Props are bound as DB-API
    parameters, never interpolated into SQL
    (ADR:2026-11-08-profiler-extended-metrics-static-like-composed).
    """

    __test__ = False

    column: str
    like_count: str | None = None
    ilike_count: str | None = None
    not_like_count: str | None = None
    regex_count: str | None = None
    not_regex_count: str | None = None
    count_in_set: list[str | int | float | bool] | None = None

    @field_validator("column")
    @classmethod
    def require_column(cls, value: str) -> str:
        if not value or not str(value).strip():
            raise ValueError("profiler metric param column is required")
        return value

    @model_validator(mode="after")
    def require_at_least_one_param(self) -> ProfilerMetricParamSpec:
        if not any(
            value is not None
            for value in (
                self.like_count,
                self.ilike_count,
                self.not_like_count,
                self.regex_count,
                self.not_regex_count,
                self.count_in_set,
            )
        ):
            raise ValueError("profiler metric param entry must set at least one metric param")
        return self


class ProfilerSampleSpec(CamelModel):
    """Static sampling config for the profiler dataset (Wave 3 serial point 6).

    Mirrors the official ``StaticSamplingConfig`` (PERCENTAGE / ROW_COUNT;
    ``samplingMethodType`` SYSTEM / BERNOULLI, only consumed by Snowflake
    TABLESAMPLE). The profiler computes every metric — window, composed
    and hybrid alike — on this dataset. No ``profileQuery`` field: a
    user-query dataset is not supported in this batch
    (R-W3H-6-profile-query); DYNAMIC sampling is likewise out of scope
    (R-W3H-6-dynamic-sampling).

    ADR:2026-11-10-profiler-window-hybrid-metrics
    """

    __test__ = False

    profile_sample: float
    profile_sample_type: Literal["PERCENTAGE", "ROW_COUNT"] = "PERCENTAGE"
    sampling_method_type: Literal["SYSTEM", "BERNOULLI"] | None = None

    @model_validator(mode="after")
    def require_valid_sample(self) -> ProfilerSampleSpec:
        if self.profile_sample_type == "PERCENTAGE":
            if not 0 < self.profile_sample <= 100:
                raise ValueError("profiler sample profileSample must be in (0, 100] for PERCENTAGE")
        elif not float(self.profile_sample).is_integer() or self.profile_sample < 1:
            raise ValueError("profiler sample profileSample must be an integer >= 1 for ROW_COUNT")
        return self

    def to_static(self) -> StaticSampleConfig:
        return StaticSampleConfig(
            profile_sample=self.profile_sample,
            sample_type=self.profile_sample_type,
            sampling_method=self.sampling_method_type,
        )


class ProfilerTableSampleSpec(ProfilerSampleSpec):
    """Per-table sampling override, keyed by table FQN.

    Resolution order: per-table config, then the workflow default
    (``profilerSample``), then no sampling. The server levels (entity
    ``tableProfilerConfig`` / schema / database) are not pulled by the
    workflow yet (R-W3H-6-sampler-server-config).
    """

    __test__ = False

    table_fqn: str

    @field_validator("table_fqn")
    @classmethod
    def require_table_fqn(cls, value: str) -> str:
        if not value or not str(value).strip():
            raise ValueError("profiler table sample tableFqn is required")
        return value


class SchemaDiffTable(CamelModel):
    """One side of a schema diff (pin ``SchemaDiffResult``).

    ``schema`` maps each column name to its pulled ``{"type", "constraints"}``
    pair; the type is the pulled ``dataType`` string verbatim and the
    constraint is the pulled ``constraint`` or ``""``. Rendered into result
    values with the pin ``__str__`` shape (``serviceType='...' ...``).
    """

    __test__ = False

    service_type: str
    fully_qualified_table_name: str
    # Pin names this field `schema` (SchemaDiffResult.schema_ with alias
    # "schema"); the attribute keeps the underscore so it does not shadow
    # BaseModel.schema.
    schema_: dict[str, dict[str, str]] = Field(default_factory=dict, alias="schema")

    def render(self) -> str:
        return " ".join(
            f"{key}={value!r}" for key, value in self.model_dump(by_alias=True).items()
        )


class SchemaDiff(CamelModel):
    """Column differences between the two compared tables (pin ``ColumnDiffResult``).

    ``removed`` / ``added`` are non-key columns present on one side only;
    ``changed`` are columns present on both sides whose types are
    incomparable (§3.6 family table). A non-empty diff fails the verdict
    regardless of the row diff. Absent (``None`` on the spec) when the setter
    found no column difference — or for inline specs, which carry no table
    metadata and skip schema comparison (disclosed in the message).
    """

    __test__ = False

    removed: list[str] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    changed: list[str] = Field(default_factory=list)
    schema_table_1: SchemaDiffTable
    schema_table_2: SchemaDiffTable

    def has_diff(self) -> bool:
        return bool(self.removed or self.added or self.changed)


class DataDiffSideSpec(CamelModel):
    """One side of a data-diff comparison.

    ``database`` is the catalog for Databricks / Unity Catalog (their
    builders call the segment ``catalog``); ``source_type`` / ``connection``
    default to the workflow's source when omitted, so same-service diffs
    only name the tables while cross-service diffs can override per side.
    ``extra_columns`` is the value-comparison column set for this side
    (``None`` = key-set mode, no value comparison); ``key_column_types``
    carries the pulled ``dataType`` per key column for the SQL Server
    int-key sampling check; ``service`` is the service name, recorded so
    abort messages and schema tables can use the full FQN.
    """

    __test__ = False

    database: str
    schema: str
    table: str
    key_columns: list[str]
    source_type: str | None = None
    connection: dict[str, Any] | None = None
    extra_columns: list[str] | None = None
    key_column_types: dict[str, str] | None = None
    service: str | None = None

    @field_validator("key_columns")
    @classmethod
    def require_key_columns(cls, value: list[str]) -> list[str]:
        if not value or any(not column or not str(column).strip() for column in value):
            raise ValueError("key_columns must name at least one non-blank column")
        return value

    @field_validator("source_type")
    @classmethod
    def normalize_source_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return str(value).strip().lower()


class DataDiffSpec(CamelModel):
    """A key-set data diff executed live by a DataDiff workflow.

    Mirrors the official ``TableDiffRuntimeParameters`` surface (two tables,
    key columns, threshold, optional where clause). ``threshold`` follows the
    official verdict rule: 0 means exactly zero differences are allowed,
    otherwise the diff passes while the total is below the threshold.
    ``table_profile_config`` is the table1 entity's profiler config carried
    as raw JSON (only its ``profileSampleConfig`` face is consumed, by P2-2
    sampling); ``case_sensitive_columns`` is the ``caseSensitiveColumns``
    parameter (default False, official ``get_bool_test_case_param``);
    ``schema_diff`` is the setter-computed column diff (``None`` = no column
    difference, or an inline spec with no table metadata).

    ADR:2026-11-11-table-diff-cross-service-connection-source
    ADR:2026-11-11-table-diff-sampling-disclosure
    """

    __test__ = False

    test_case_fqn: str
    left: DataDiffSideSpec
    right: DataDiffSideSpec
    threshold: int = 0
    where_clause: str | None = None
    table_profile_config: dict[str, Any] | None = None
    case_sensitive_columns: bool = False
    schema_diff: SchemaDiff | None = None

    @field_validator("threshold")
    @classmethod
    def require_non_negative_threshold(cls, value: int) -> int:
        if value < 0:
            raise ValueError("threshold must be zero or positive")
        return value


class ClassificationSpec(CamelModel):
    name: str
    description: str
    display_name: str | None = None
    provider: str | None = None
    mutually_exclusive: bool | None = None


class TagSpec(CamelModel):
    name: str
    description: str
    classification: str | None = None
    parent: str | None = None
    display_name: str | None = None
    provider: str | None = None
    mutually_exclusive: bool | None = None


class AppSpec(CamelModel):
    name: str
    display_name: str | None = None
    description: str | None = None
    bot: str | None = None
    app_configuration: dict[str, Any] | None = None
    app_schedule: dict[str, Any] | None = None
    supports_interrupt: bool | None = None
    allow_bot_impersonation: bool | None = None


class WorkflowConfig(CamelModel):
    workflow: WorkflowSettings
    server: ServerConfig
    source: SourceConfig
    processors: list[ProcessorConfig] = Field(default_factory=list)
    sink: SinkConfig = Field(default_factory=SinkConfig)
    lineage: list[LineageSpec] = Field(default_factory=list)
    usage: list[UsageSpec] = Field(default_factory=list)
    profiles: list[ProfileSpec] = Field(default_factory=list)
    test_case_results: list[TestCaseResultSpec] = Field(default_factory=list)
    test_cases: list[TestCaseSpec] = Field(default_factory=list)
    profiler_metric_params: list[ProfilerMetricParamSpec] = Field(default_factory=list)
    profiler_sample: ProfilerSampleSpec | None = None
    profiler_table_samples: list[ProfilerTableSampleSpec] = Field(default_factory=list)
    data_diffs: list[DataDiffSpec] = Field(default_factory=list)
    classifications: list[ClassificationSpec] = Field(default_factory=list)
    tags: list[TagSpec] = Field(default_factory=list)
    apps: list[AppSpec] = Field(default_factory=list)


def load_raw_config(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    if suffix in {".yaml", ".yml"}:
        loaded = yaml.safe_load(text)
    elif suffix == ".json":
        loaded = json.loads(text)
    else:
        raise WorkflowError(f"unsupported config suffix {path.suffix}; use .yaml, .yml, or .json")
    if not isinstance(loaded, dict):
        raise WorkflowError("workflow config must be a mapping")
    return loaded


def load_workflow_config(
    path: Path,
    *,
    environ: dict[str, str] | None = None,
) -> WorkflowConfig:
    raw = expand_value(load_raw_config(path), environ)
    try:
        return WorkflowConfig.model_validate(raw)
    except Exception as exc:
        raise WorkflowError(f"invalid workflow config {path}: {exc}") from exc
