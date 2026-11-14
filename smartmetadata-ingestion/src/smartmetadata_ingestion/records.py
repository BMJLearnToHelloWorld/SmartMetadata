# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Workflow records produced by a Source and consumed by a Sink."""

from __future__ import annotations

import hashlib
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str

    def label(self) -> str:
        return self.kind


class DatabaseServiceRecord(Record):
    kind: Literal["databaseService"] = "databaseService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"databaseService:{self.name}"


class DatabaseRecord(Record):
    kind: Literal["database"] = "database"
    name: str
    service: str
    description: str | None = None

    def label(self) -> str:
        return f"database:{self.service}.{self.name}"


class SchemaRecord(Record):
    kind: Literal["schema"] = "schema"
    name: str
    database: str
    description: str | None = None

    def label(self) -> str:
        return f"schema:{self.database}.{self.name}"


class TagLabelRecord(BaseModel):
    """One applied tag label (type/tagLabel.json): all four fields required."""

    model_config = ConfigDict(extra="forbid")

    tag_fqn: str
    source: str
    label_type: str
    state: str


class ColumnRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    data_type: str
    data_type_display: str | None = None
    description: str | None = None
    ordinal_position: int | None = None
    data_length: int | None = None
    array_data_type: str | None = None
    children: list[ColumnRecord] | None = None
    precision: int | None = None
    scale: int | None = None
    # Column-level constraint (table.json#/definitions/constraint):
    # PRIMARY_KEY wins over UNIQUE wins over NOT_NULL when a column
    # carries several; NULL is never set explicitly (absence = nullable).
    constraint: Literal["NULL", "NOT_NULL", "UNIQUE", "PRIMARY_KEY"] | None = None
    tags: list[TagLabelRecord] = Field(default_factory=list)


class LifeCycleAccessRecord(BaseModel):
    """One lifeCycle access detail (type/lifeCycle.json#accessDetails)."""

    model_config = ConfigDict(extra="forbid")

    timestamp: int
    accessed_by_a_process: str | None = None


class LifeCycleRecord(BaseModel):
    """Entity lifeCycle: created/updated/accessed access details."""

    model_config = ConfigDict(extra="forbid")

    created: LifeCycleAccessRecord | None = None
    updated: LifeCycleAccessRecord | None = None
    accessed: LifeCycleAccessRecord | None = None


def life_cycle_from_ms(
    created_ms: int | None, updated_ms: int | None
) -> LifeCycleRecord | None:
    """A lifeCycle from catalog timestamps, or ``None`` when neither is known."""
    created = (
        LifeCycleAccessRecord(timestamp=created_ms) if created_ms is not None else None
    )
    updated = (
        LifeCycleAccessRecord(timestamp=updated_ms) if updated_ms is not None else None
    )
    if created is None and updated is None:
        return None
    return LifeCycleRecord(created=created, updated=updated)


class TableConstraintRecord(BaseModel):
    """One tableConstraint (entity/data/table.json#/definitions/tableConstraint).

    CHECK constraints have no enum value here and are not carried.
    """

    model_config = ConfigDict(extra="forbid")

    constraint_type: Literal[
        "UNIQUE", "PRIMARY_KEY", "FOREIGN_KEY", "SORT_KEY", "DIST_KEY", "CLUSTER_KEY"
    ]
    columns: list[str] = Field(default_factory=list)
    referred_columns: list[str] | None = None
    relationship_type: (
        Literal["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"] | None
    ) = None


class PartitionColumnRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column_name: str
    interval_type: str = "TIME-UNIT"
    interval: str | None = None


class TablePartitionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[PartitionColumnRecord] = Field(default_factory=list)


class TableRecord(Record):
    kind: Literal["table"] = "table"
    name: str
    database_schema: str
    columns: list[ColumnRecord] = Field(default_factory=list)
    table_type: str = "Regular"
    description: str | None = None
    table_partition: TablePartitionRecord | None = None
    tags: list[TagLabelRecord] = Field(default_factory=list)
    # Owner names from ownerConfig resolution (or the source); the sink
    # resolves each to an EntityReference id — the schema requires id.
    owner_names: list[str] = Field(default_factory=list)
    # DDL for the table/view (schemaDefinition), gated on includeDDL.
    schema_definition: str | None = None
    table_constraints: list[TableConstraintRecord] = Field(default_factory=list)
    life_cycle: LifeCycleRecord | None = None
    # Custom properties (entity extension); no current source exposes any.
    extension: dict[str, Any] | None = None

    def label(self) -> str:
        return f"table:{self.database_schema}.{self.name}"


class StoredProcedureRecord(Record):
    """A stored procedure / function / UDF: a first-class topology node.

    ``code`` carries the routine definition; an empty string means the
    source exposed no definition (the create request requires the
    field, and skipping the record would let reconcile delete the
    procedure as unseen).
    """

    kind: Literal["storedProcedure"] = "storedProcedure"
    name: str
    database_schema: str
    stored_procedure_type: Literal[
        "StoredProcedure", "UDF", "StoredPackage", "Function"
    ] = "StoredProcedure"
    language: Literal["SQL", "Java", "JavaScript", "Python", "External"] = "SQL"
    code: str = ""
    description: str | None = None
    tags: list[TagLabelRecord] = Field(default_factory=list)
    owner_names: list[str] = Field(default_factory=list)
    life_cycle: LifeCycleRecord | None = None
    extension: dict[str, Any] | None = None

    def label(self) -> str:
        return f"storedProcedure:{self.database_schema}.{self.name}"


class LineageEndpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    fqn: str


class ColumnLineage(BaseModel):
    """Apache ColumnLineage: fromColumns FQNs → toColumn FQN (+ optional function)."""

    model_config = ConfigDict(extra="forbid")

    from_columns: list[str] = Field(default_factory=list)
    to_column: str
    function: str | None = None


class EntityRef(BaseModel):
    """Minimal EntityReference used in LineageDetails.pipeline."""

    model_config = ConfigDict(extra="forbid")

    type: str
    fully_qualified_name: str | None = None
    id: str | None = None
    name: str | None = None


class LineageRecord(Record):
    kind: Literal["lineage"] = "lineage"
    from_entity: LineageEndpoint
    to_entity: LineageEndpoint
    description: str | None = None
    source: str = "Manual"
    sql_query: str | None = None
    columns_lineage: list[ColumnLineage] = Field(default_factory=list)
    pipeline: EntityRef | None = None

    def label(self) -> str:
        return f"lineage:{self.from_entity.fqn}->{self.to_entity.fqn}"




class ProfileRecord(Record):
    """Apache CreateEntityProfile (preferred) or CreateTableProfile (legacy id)."""

    kind: Literal["profile"] = "profile"
    entity_type: str = "table"
    fqn: str | None = None
    table_id: str | None = None
    # CreateEntityProfile fields
    profile_data: dict[str, Any] | None = None
    profile_type: str | None = None
    timestamp: int | None = None
    # CreateTableProfile fields (legacy)
    table_profile: dict[str, Any] | None = None
    column_profile: list[dict[str, Any]] = Field(default_factory=list)
    system_profile: list[dict[str, Any]] = Field(default_factory=list)

    def label(self) -> str:
        target = self.fqn or self.table_id or "?"
        return f"profile:{self.entity_type}:{target}"


class TestCaseResultRecord(Record):
    __test__ = False

    """Apache CreateTestCaseResult posted under a test-case FQN."""

    kind: Literal["testCaseResult"] = "testCaseResult"
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

    def label(self) -> str:
        return f"testCaseResult:{self.test_case_fqn}@{self.timestamp}"

class UsageRecord(Record):
    """Apache DailyCount report: PUT /v1/usage/{entity}/name/{fqn}."""

    kind: Literal["usage"] = "usage"
    entity_type: str = "table"
    fqn: str
    date: str
    count: int

    def label(self) -> str:
        return f"usage:{self.entity_type}:{self.fqn}@{self.date}"


class TableQueryRecord(Record):
    """One raw query from a query log, per the ``tableQuery`` spec schema.

    The usage/lineage input row is the RAW QUERY — never pre-aggregated
    counts. Aggregation happens in the usage stage, after parsing.
    The label carries only the query hash: query text may hold literal
    values and must not leak into run history or failure labels.
    """

    kind: Literal["tableQuery"] = "tableQuery"
    query: str
    service_name: str
    query_type: str | None = None
    exclude_usage: bool = False
    dialect: str | None = None
    user_name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    analysis_date: str | None = None
    aborted: bool = False
    database_name: str | None = None
    database_schema: str | None = None
    duration: float | None = None
    cost: float | None = None

    def label(self) -> str:
        query_hash = hashlib.md5(self.query.encode("utf-8")).hexdigest()[:8]
        return f"tableQuery:{self.service_name}:{query_hash}"


class QueryRecord(Record):
    """A ``CreateQueryRequest`` the lineage channels emit for a query
    whose lineage was processed (design §3.7: ``processedLineage=True``).

    Distinct from ``TableQueryRecord`` (the raw log input): this is
    the catalog Query entity request the sink writes. ``table_fqns``
    are the resolved tables the query touched, linked via the query
    usage endpoint; ``triggered_by_fqn`` names the stored procedure
    whose body held the query, when the procedure channel emitted it.
    The label carries only the query hash, never the text.
    """

    kind: Literal["query"] = "query"
    query: str
    service_name: str
    dialect: str | None = None
    query_type: str | None = None
    duration: float | None = None
    query_date_ms: int | None = None
    user_name: str | None = None
    exclude_usage: bool = False
    processed_lineage: bool = True
    triggered_by_fqn: str | None = None
    table_fqns: list[str] = Field(default_factory=list)

    def label(self) -> str:
        query_hash = hashlib.md5(self.query.encode("utf-8")).hexdigest()[:8]
        return f"query:{self.service_name}:{query_hash}"


class MessagingServiceRecord(Record):
    kind: Literal["messagingService"] = "messagingService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"messagingService:{self.name}"


class TopicSampleData(BaseModel):
    """Official ``TopicSampleData``: the sampled messages of one topic.

    ``messages`` are decoded message strings (official
    ``CommonBrokerSource.decode_message`` returns a string per message);
    a payload that cannot be decoded as UTF-8 is skipped by the sampler,
    never stored as mojibake.
    """

    model_config = ConfigDict(extra="forbid")

    messages: list[str] = Field(default_factory=list)


class TopicRecord(Record):
    kind: Literal["topic"] = "topic"
    name: str
    service: str
    partitions: int = 1
    description: str | None = None
    message_schema: dict[str, Any] | None = None
    cleanup_policies: list[str] | None = None
    replication_factor: int | None = None
    retention_time: float | None = None
    maximum_message_size: int | None = None
    topic_config: dict[str, Any] | None = None
    # Sampled live messages (H track 1). The sink PUTs these to
    # /v1/topics/{id}/sampleData only when messages is non-empty.
    sample_data: TopicSampleData | None = None

    def label(self) -> str:
        return f"topic:{self.service}.{self.name}"





class DashboardServiceRecord(Record):
    kind: Literal["dashboardService"] = "dashboardService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"dashboardService:{self.name}"


class ChartRecord(Record):
    kind: Literal["chart"] = "chart"
    name: str
    service: str
    display_name: str | None = None
    description: str | None = None
    chart_type: str | None = None
    source_url: str | None = None

    def label(self) -> str:
        return f"chart:{self.service}.{self.name}"


class DashboardRecord(Record):
    kind: Literal["dashboard"] = "dashboard"
    name: str
    service: str
    display_name: str | None = None
    description: str | None = None
    source_url: str | None = None
    project: str | None = None
    charts: list[str] | None = None

    def label(self) -> str:
        return f"dashboard:{self.service}.{self.name}"


class StorageServiceRecord(Record):
    kind: Literal["storageService"] = "storageService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"storageService:{self.name}"


class ContainerRecord(Record):
    kind: Literal["container"] = "container"
    name: str
    service: str
    display_name: str | None = None
    description: str | None = None
    parent_fqn: str | None = None
    prefix: str | None = None
    number_of_objects: float | None = None
    size: float | None = None
    file_formats: list[str] | None = None
    source_url: str | None = None
    full_path: str | None = None
    data_model: dict[str, Any] | None = None

    def label(self) -> str:
        if self.parent_fqn:
            return f"container:{self.parent_fqn}.{self.name}"
        return f"container:{self.service}.{self.name}"



class PipelineServiceRecord(Record):
    kind: Literal["pipelineService"] = "pipelineService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"pipelineService:{self.name}"


class PipelineRecord(Record):
    kind: Literal["pipeline"] = "pipeline"
    name: str
    service: str
    display_name: str | None = None
    description: str | None = None
    source_url: str | None = None
    concurrency: int | None = None
    pipeline_location: str | None = None
    schedule_interval: str | None = None
    tasks: list[dict[str, Any]] | None = None
    state: str | None = None

    def label(self) -> str:
        return f"pipeline:{self.service}.{self.name}"

class ClassificationRecord(Record):
    """Apache CreateClassification → PUT /v1/classifications."""

    kind: Literal["classification"] = "classification"
    name: str
    description: str
    display_name: str | None = None
    provider: str | None = None
    mutually_exclusive: bool | None = None

    def label(self) -> str:
        return f"classification:{self.name}"


class TagRecord(Record):
    """Apache CreateTag → PUT /v1/tags."""

    kind: Literal["tag"] = "tag"
    name: str
    description: str
    classification: str | None = None
    parent: str | None = None
    display_name: str | None = None
    provider: str | None = None
    mutually_exclusive: bool | None = None

    def label(self) -> str:
        scope = self.classification or self.parent or "?"
        return f"tag:{scope}.{self.name}"


class AppRecord(Record):
    """Apache CreateApp → PUT /v1/apps (no Collate-only AI/RDF invent)."""

    kind: Literal["app"] = "app"
    name: str
    display_name: str | None = None
    description: str | None = None
    bot: str | None = None
    app_configuration: dict[str, Any] | None = None
    app_schedule: dict[str, Any] | None = None
    supports_interrupt: bool | None = None
    allow_bot_impersonation: bool | None = None

    def label(self) -> str:
        return f"app:{self.name}"


WorkflowRecord = (
    DatabaseServiceRecord
    | DatabaseRecord
    | SchemaRecord
    | TableRecord
    | StoredProcedureRecord
    | LineageRecord
    | UsageRecord
    | TableQueryRecord
    | QueryRecord
    | ProfileRecord
    | TestCaseResultRecord
    | MessagingServiceRecord
    | TopicRecord
    | DashboardServiceRecord
    | ChartRecord
    | DashboardRecord
    | StorageServiceRecord
    | ContainerRecord
    | PipelineServiceRecord
    | PipelineRecord
    | ClassificationRecord
    | TagRecord
    | AppRecord
)
