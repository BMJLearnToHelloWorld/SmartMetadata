# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MariaDB database connector (metadata + view lineage).

Aligns to Apache OpenMetadata MariaDB service tile / MariaDBSource.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mariadb_common as mariadb
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.connectors.sql_views import map_table_type, parse_view_parents
from smartmetadata_ingestion.datatypes import map_mysql_type
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import (
    ColumnRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageEndpoint,
    LineageRecord,
    SchemaRecord,
    TableRecord,
    WorkflowRecord,
)


@register_source("mariadb")
class MariaDBSource:
    SERVICE_TYPE = "MariaDB"

    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: mariadb.CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader or (
            mariadb.CursorCatalogReader(connect) if connect is not None else None
        )

    def prepare(self) -> None:
        mariadb.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        database_name = self._database_name()
        yield DatabaseRecord(name=database_name, service=self._config.service_name)
        reader = self._require_reader()
        for schema in self._selected_schemas(reader):
            database_fqn = build_fqn(self._config.service_name, database_name)
            yield SchemaRecord(name=schema.name, database=database_fqn)
            schema_fqn = build_fqn(self._config.service_name, database_name, schema.name)
            for table in reader.list_tables(schema.name):
                yield TableRecord(
                    name=table.name,
                    database_schema=schema_fqn,
                    table_type=map_table_type(table.table_type),
                    description=table.comment,
                    columns=self._columns(reader, table),
                )
        if self._config.include_view_lineage:
            yield from self._view_lineage(reader, database_name)

    def _service_record(self) -> DatabaseServiceRecord:
        connection = mariadb.build_service_connection_config(
            raw=self._config.connection or {},
            store_secrets=self._config.store_connection_secrets,
        )
        return DatabaseServiceRecord(
            name=self._config.service_name,
            service_type=self.SERVICE_TYPE,
            display_name=self._config.service_display_name,
            connection=connection,
        )

    def _database_name(self) -> str:
        raw = self._config.connection or {}
        return str(raw.get("databaseName") or raw.get("database") or "default")

    def _require_reader(self) -> mariadb.CatalogReader:
        if self._reader is not None:
            return self._reader
        return mariadb.CursorCatalogReader(mariadb.mariadb_connect(self._config.connection or {}))

    def _include_schemas(self) -> list[str]:
        if self._config.include_schemas:
            return list(self._config.include_schemas)
        schema = (self._config.connection or {}).get("databaseSchema")
        return [str(schema)] if schema else []

    def _selected_schemas(self, reader: mariadb.CatalogReader) -> list[mariadb.SchemaRow]:
        exclude = list(self._config.exclude_schemas) + list(mariadb.system_schemas())
        return [
            schema
            for schema in reader.list_schemas()
            if is_selected(schema.name, include=self._include_schemas(), exclude=exclude)
        ]

    def _columns(
        self, reader: mariadb.CatalogReader, table: mariadb.TableRow
    ) -> list[ColumnRecord]:
        return [
            ColumnRecord(
                name=column.name,
                data_type=map_mysql_type(column.data_type),
                data_type_display=column.data_type,
                description=column.comment,
                ordinal_position=column.ordinal_position,
                data_length=_as_int(column.char_length),
            )
            for column in reader.list_columns(table.schema_name, table.name)
        ]

    def _view_lineage(
        self, reader: mariadb.CatalogReader, database_name: str
    ) -> Iterable[LineageRecord]:
        known_tables = {
            (table.schema_name, table.name)
            for schema in self._selected_schemas(reader)
            for table in reader.list_tables(schema.name)
        }
        for view in reader.list_views():
            if (view.schema_name, view.name) not in known_tables:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in parse_view_parents(
                view.definition, view.schema_name
            ):
                if (schema_name, table_name) not in known_tables:
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


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)
