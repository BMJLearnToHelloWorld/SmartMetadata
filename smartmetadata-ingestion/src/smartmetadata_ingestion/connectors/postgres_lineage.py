# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Postgres lineage source (view lineage + optional injected edges)."""

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import postgres_common as postgres
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.sql_views import parse_view_parents
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord


@register_source("postgres-lineage")
class PostgresLineageSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: postgres.LineageReader | None = None,
        catalog: postgres.CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader
        raw = config.connection or {}
        if catalog is not None:
            self._catalog = catalog
        elif connect is not None:
            self._catalog = postgres.CursorCatalogReader(
                connect,
                ingest_all=bool(raw.get("ingestAllDatabases")),
                entry_database=str(raw.get("database") or "") or None,
            )
        else:
            self._catalog = None

    def prepare(self) -> None:
        postgres.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        if self._reader is not None:
            for edge in self._reader.list_edges():
                from_fqn = build_fqn(
                    self._config.service_name,
                    edge.source_database,
                    edge.source_schema,
                    edge.source_table,
                )
                to_fqn = build_fqn(
                    self._config.service_name,
                    edge.target_database,
                    edge.target_schema,
                    edge.target_table,
                )
                if from_fqn == to_fqn:
                    continue
                yield LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                    source="QueryLineage",
                    sql_query=edge.sql_query,
                )
            return
        catalog = self._require_catalog()
        for database in catalog.list_databases():
            known = {
                (t.schema_name, t.name)
                for schema in catalog.list_schemas(database.name)
                for t in catalog.list_tables(database.name, schema.name)
            }
            for view in catalog.list_views(database.name):
                if (view.schema_name, view.name) not in known:
                    continue
                to_fqn = build_fqn(
                    self._config.service_name,
                    database.name,
                    view.schema_name,
                    view.name,
                )
                for schema_name, table_name in parse_view_parents(
                    view.definition, view.schema_name
                ):
                    if (schema_name, table_name) not in known:
                        continue
                    if schema_name == view.schema_name and table_name == view.name:
                        continue
                    from_fqn = build_fqn(
                        self._config.service_name,
                        database.name,
                        schema_name,
                        table_name,
                    )
                    yield LineageRecord(
                        from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                        to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                        source="ViewLineage",
                        sql_query=view.definition,
                    )

    def _require_catalog(self) -> postgres.CatalogReader:
        if self._catalog is not None:
            return self._catalog
        raw = self._config.connection or {}
        connect = postgres.postgres_connect(raw)
        return postgres.CursorCatalogReader(
            connect,
            ingest_all=bool(raw.get("ingestAllDatabases")),
            entry_database=str(raw.get("database") or "") or None,
        )
