# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Workflow records produced by a Source and consumed by a Sink."""

from __future__ import annotations

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


class ColumnRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    data_type: str
    data_type_display: str | None = None
    description: str | None = None
    ordinal_position: int | None = None
    data_length: int | None = None


class TableRecord(Record):
    kind: Literal["table"] = "table"
    name: str
    database_schema: str
    columns: list[ColumnRecord] = Field(default_factory=list)
    table_type: str = "Regular"
    description: str | None = None

    def label(self) -> str:
        return f"table:{self.database_schema}.{self.name}"


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


class MessagingServiceRecord(Record):
    kind: Literal["messagingService"] = "messagingService"
    name: str
    service_type: str
    description: str | None = None
    display_name: str | None = None
    connection: dict[str, Any] | None = None

    def label(self) -> str:
        return f"messagingService:{self.name}"


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

    def label(self) -> str:
        return f"topic:{self.service}.{self.name}"



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
    | LineageRecord
    | UsageRecord
    | ProfileRecord
    | TestCaseResultRecord
    | MessagingServiceRecord
    | TopicRecord
    | ClassificationRecord
    | TagRecord
    | AppRecord
)
