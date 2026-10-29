# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from smartmetadata_ingestion.config import SourceConfig, WorkflowConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    ColumnLineage,
    ColumnRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    EntityRef,
    LineageEndpoint,
    LineageRecord,
    SchemaRecord,
    TableRecord,
    UsageRecord,
    WorkflowRecord,
)


class Source(Protocol):
    def produce(self) -> Iterable[WorkflowRecord]: ...

    def prepare(self) -> None:
        """Optional setup before produce. Default is a no-op."""

    def close(self) -> None:
        """Optional teardown after produce. Default is a no-op."""


@register_source("static")
class StaticSource:
    """Fixture/source-of-record list used in tests and documented dry runs."""

    def __init__(self, config: SourceConfig):
        self._config = config

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield DatabaseServiceRecord(
            name=self._config.service_name,
            service_type="CustomDatabase",
            display_name=self._config.service_display_name,
        )
        for raw in self._config.records:
            yield parse_static_record(raw, default_service=self._config.service_name)


def parse_static_record(raw: dict, *, default_service: str) -> WorkflowRecord:
    kind = raw.get("kind")
    if kind == "database":
        return DatabaseRecord(
            name=raw["name"],
            service=raw.get("service", default_service),
            description=raw.get("description"),
        )
    if kind == "schema":
        return SchemaRecord(
            name=raw["name"],
            database=raw["database"],
            description=raw.get("description"),
        )
    if kind == "table":
        columns = [
            ColumnRecord(
                name=column["name"],
                data_type=column.get("dataType", column.get("data_type", "STRING")),
                data_type_display=column.get("dataTypeDisplay"),
                description=column.get("description"),
                ordinal_position=column.get("ordinalPosition"),
            )
            for column in raw.get("columns", [])
        ]
        return TableRecord(
            name=raw["name"],
            database_schema=raw["databaseSchema"],
            columns=columns,
            table_type=raw.get("tableType", "Regular"),
            description=raw.get("description"),
        )
    if kind == "lineage":
        from_entity = raw["fromEntity"]
        to_entity = raw["toEntity"]
        columns_lineage = [
            ColumnLineage(
                from_columns=list(col.get("fromColumns") or col.get("from_columns") or []),
                to_column=col.get("toColumn") or col["to_column"],
                function=col.get("function"),
            )
            for col in raw.get("columnsLineage") or raw.get("columns_lineage") or []
        ]
        pipeline = None
        raw_pipeline = raw.get("pipeline")
        if isinstance(raw_pipeline, dict):
            pipeline = EntityRef(
                type=raw_pipeline["type"],
                fully_qualified_name=raw_pipeline.get("fullyQualifiedName")
                or raw_pipeline.get("fully_qualified_name"),
                id=raw_pipeline.get("id"),
                name=raw_pipeline.get("name"),
            )
        return LineageRecord(
            from_entity=LineageEndpoint(type=from_entity["type"], fqn=from_entity["fqn"]),
            to_entity=LineageEndpoint(type=to_entity["type"], fqn=to_entity["fqn"]),
            description=raw.get("description"),
            source=raw.get("source", "Manual"),
            sql_query=raw.get("sqlQuery"),
            columns_lineage=columns_lineage,
            pipeline=pipeline,
        )
    if kind == "usage":
        return UsageRecord(
            entity_type=raw.get("entityType") or raw.get("entity_type") or "table",
            fqn=raw["fqn"],
            date=raw["date"],
            count=int(raw["count"]),
        )
    raise WorkflowError(f"unsupported static record kind {kind!r}")


def build_source(config: WorkflowConfig, source: Source | None = None) -> Source:
    if source is not None:
        return source
    from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources

    load_builtin_sources()
    return get_source(config.source.type, config.source)
