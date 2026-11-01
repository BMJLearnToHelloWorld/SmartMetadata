# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Mysql lineage source (official MysqlLineageSource = view lineage edges)."""

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mysql_common as mysql
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord


@register_source("mysql-lineage")
class MysqlLineageSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: mysql.LineageReader | None = None,
        catalog: mysql.CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._catalog = catalog or (
            mysql.CursorCatalogReader(connect) if connect is not None else None
        )

    def prepare(self) -> None:
        mysql.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        database_name = str(
            (self._config.connection or {}).get("databaseName")
            or (self._config.connection or {}).get("database")
            or "default"
        )
        if self._reader is not None:
            for edge in self._reader.list_edges():
                from_fqn = build_fqn(
                    self._config.service_name,
                    database_name,
                    edge.source_schema,
                    edge.source_table,
                )
                to_fqn = build_fqn(
                    self._config.service_name,
                    database_name,
                    edge.target_schema,
                    edge.target_table,
                )
                if from_fqn == to_fqn:
                    continue
                yield LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                    source="ViewLineage",
                    sql_query=edge.sql_query,
                )
            return
        # Fall back: derive view lineage from catalog views (OM MysqlLineageSource).
        from smartmetadata_ingestion.connectors.sql_views import parse_view_parents

        catalog = self._require_catalog()
        known = {
            (t.schema_name, t.name)
            for schema in catalog.list_schemas()
            for t in catalog.list_tables(schema.name)
        }
        for view in catalog.list_views():
            if (view.schema_name, view.name) not in known:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in parse_view_parents(
                view.definition, view.schema_name
            ):
                if (schema_name, table_name) not in known:
                    continue
                if schema_name == view.schema_name and table_name == view.name:
                    continue
                from_fqn = build_fqn(
                    self._config.service_name, database_name, schema_name, table_name
                )
                yield LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                    source="ViewLineage",
                    sql_query=view.definition,
                )

    def _require_catalog(self) -> mysql.CatalogReader:
        if self._catalog is not None:
            return self._catalog
        return mysql.CursorCatalogReader(mysql.mysql_connect(self._config.connection or {}))
