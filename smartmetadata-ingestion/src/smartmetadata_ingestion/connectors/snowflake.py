# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Snowflake connector. Reads INFORMATION_SCHEMA through a CatalogReader."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors import snowflake_common
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.connectors.sql_views import map_table_type, parse_view_parents
from smartmetadata_ingestion.datatypes import map_snowflake_type
from smartmetadata_ingestion.errors import WorkflowError
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

_SYSTEM_DATABASES = frozenset({"snowflake", "snowflake_sample_data"})
_SYSTEM_SCHEMAS = frozenset({"information_schema"})
_UNSAFE_IDENT = re.compile(r'["\\;\n\r\x00]')


@dataclass(frozen=True, slots=True)
class DatabaseRow:
    name: str


@dataclass(frozen=True, slots=True)
class SchemaRow:
    database_name: str
    name: str


@dataclass(frozen=True, slots=True)
class TableRow:
    database_name: str
    schema_name: str
    name: str
    table_type: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ColumnRow:
    database_name: str
    schema_name: str
    table_name: str
    name: str
    data_type: str
    ordinal_position: int
    char_length: int | None = None
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ViewRow:
    database_name: str
    schema_name: str
    name: str
    definition: str


class CatalogReader(Protocol):
    def list_databases(self) -> Sequence[DatabaseRow]: ...

    def list_schemas(self, database: str) -> Sequence[SchemaRow]: ...

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]: ...

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]: ...

    def list_views(self, database: str) -> Sequence[ViewRow]: ...


class SequenceCatalogReader:
    def __init__(
        self,
        *,
        databases: Sequence[DatabaseRow] = (),
        schemas: Sequence[SchemaRow] = (),
        tables: Sequence[TableRow] = (),
        columns: Sequence[ColumnRow] = (),
        views: Sequence[ViewRow] = (),
    ) -> None:
        self._databases = list(databases)
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)

    def list_databases(self) -> Sequence[DatabaseRow]:
        return self._databases

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        return [row for row in self._schemas if row.database_name == database]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        return [
            row
            for row in self._tables
            if row.database_name == database and row.schema_name == schema
        ]

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]:
        return [
            row
            for row in self._columns
            if row.database_name == database
            and row.schema_name == schema
            and row.table_name == table
        ]

    def list_views(self, database: str) -> Sequence[ViewRow]:
        return [row for row in self._views if row.database_name == database]


class CursorCatalogReader:
    """Reads Snowflake INFORMATION_SCHEMA through a DB-API cursor factory."""

    def __init__(self, connect):
        self._connect = connect

    def list_databases(self) -> Sequence[DatabaseRow]:
        rows = self._fetch(
            "SELECT DATABASE_NAME FROM INFORMATION_SCHEMA.DATABASES ORDER BY DATABASE_NAME"
        )
        return [DatabaseRow(name=row[0]) for row in rows]

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        ident = quote_snowflake_ident(database)
        rows = self._fetch(
            f"SELECT CATALOG_NAME, SCHEMA_NAME FROM {ident}.INFORMATION_SCHEMA.SCHEMATA "
            "ORDER BY SCHEMA_NAME"
        )
        return [SchemaRow(database_name=row[0], name=row[1]) for row in rows]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        ident = quote_snowflake_ident(database)
        rows = self._fetch(
            f"""
            SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, COMMENT
            FROM {ident}.INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
            ORDER BY TABLE_NAME
            """,
            (schema,),
        )
        return [
            TableRow(
                database_name=row[0],
                schema_name=row[1],
                name=row[2],
                table_type=row[3],
                comment=_blank_to_none(row[4]),
            )
            for row in rows
        ]

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]:
        ident = quote_snowflake_ident(database)
        rows = self._fetch(
            f"""
            SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE,
                   ORDINAL_POSITION, CHARACTER_MAXIMUM_LENGTH, COMMENT
            FROM {ident}.INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
            """,
            (schema, table),
        )
        return [
            ColumnRow(
                database_name=row[0],
                schema_name=row[1],
                table_name=row[2],
                name=row[3],
                data_type=row[4],
                ordinal_position=int(row[5]),
                char_length=row[6],
                comment=_blank_to_none(row[7]),
            )
            for row in rows
        ]

    def list_views(self, database: str) -> Sequence[ViewRow]:
        ident = quote_snowflake_ident(database)
        rows = self._fetch(
            f"""
            SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, VIEW_DEFINITION
            FROM {ident}.INFORMATION_SCHEMA.VIEWS
            ORDER BY TABLE_SCHEMA, TABLE_NAME
            """
        )
        return [
            ViewRow(
                database_name=row[0],
                schema_name=row[1],
                name=row[2],
                definition=row[3] or "",
            )
            for row in rows
        ]

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, params)
                return list(cursor.fetchall())
            finally:
                cursor.close()


@register_source("snowflake")
class SnowflakeSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader or (CursorCatalogReader(connect) if connect is not None else None)

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._require_reader()
        for database in self._selected_databases(reader):
            yield DatabaseRecord(name=database.name, service=self._config.service_name)
            database_fqn = build_fqn(self._config.service_name, database.name)
            for schema in self._selected_schemas(reader, database.name):
                yield SchemaRecord(name=schema.name, database=database_fqn)
                schema_fqn = build_fqn(self._config.service_name, database.name, schema.name)
                for table in reader.list_tables(database.name, schema.name):
                    yield TableRecord(
                        name=table.name,
                        database_schema=schema_fqn,
                        table_type=map_table_type(table.table_type),
                        description=table.comment,
                        columns=self._columns(reader, table),
                    )
            if self._config.include_view_lineage:
                yield from self._view_lineage(reader, database.name)

    def _service_record(self) -> DatabaseServiceRecord:
        connection = snowflake_common.build_service_connection_config(
            raw=self._config.connection or {},
            store_secrets=self._config.store_connection_secrets,
        )
        return DatabaseServiceRecord(
            name=self._config.service_name,
            service_type="Snowflake",
            display_name=self._config.service_display_name,
            description=None,
            connection=connection,
        )

    def _require_reader(self) -> CatalogReader:
        if self._reader is not None:
            return self._reader
        return CursorCatalogReader(_snowflake_connect(self._config.connection))

    def _include_databases(self) -> list[str]:
        if self._config.include_databases:
            return list(self._config.include_databases)
        database = self._config.connection.get("database")
        return [str(database)] if database else []

    def _selected_databases(self, reader: CatalogReader) -> list[DatabaseRow]:
        exclude = list(self._config.exclude_databases) + list(_SYSTEM_DATABASES)
        return [
            database
            for database in reader.list_databases()
            if is_selected(database.name, include=self._include_databases(), exclude=exclude)
        ]

    def _selected_schemas(self, reader: CatalogReader, database: str) -> list[SchemaRow]:
        exclude = list(self._config.exclude_schemas) + list(_SYSTEM_SCHEMAS)
        return [
            schema
            for schema in reader.list_schemas(database)
            if is_selected(schema.name, include=self._config.include_schemas, exclude=exclude)
        ]

    def _columns(self, reader: CatalogReader, table: TableRow) -> list[ColumnRecord]:
        return [
            ColumnRecord(
                name=column.name,
                data_type=map_snowflake_type(column.data_type),
                data_type_display=column.data_type,
                description=column.comment,
                ordinal_position=column.ordinal_position,
                data_length=_as_int(column.char_length),
            )
            for column in reader.list_columns(table.database_name, table.schema_name, table.name)
        ]

    def _view_lineage(self, reader: CatalogReader, database_name: str) -> Iterable[LineageRecord]:
        known_tables = {
            (table.schema_name, table.name)
            for schema in self._selected_schemas(reader, database_name)
            for table in reader.list_tables(database_name, schema.name)
        }
        for view in reader.list_views(database_name):
            if (view.schema_name, view.name) not in known_tables:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in parse_view_parents(view.definition, view.schema_name):
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


def quote_snowflake_ident(name: str) -> str:
    if not name or _UNSAFE_IDENT.search(name):
        raise WorkflowError(f"unsafe Snowflake identifier {name!r}")
    return '"' + name.replace('"', '""') + '"'


def _blank_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _snowflake_connect(connection: dict[str, Any]):
    if not connection.get("account"):
        raise WorkflowError("snowflake source.connection.account is required")
    try:
        import snowflake.connector
    except ImportError as exc:
        raise WorkflowError(
            "snowflake live reads need the optional extra: "
            "pip install 'smartmetadata-ingestion[snowflake]'"
        ) from exc

    def connect():
        kwargs: dict[str, Any] = {
            "user": connection.get("username"),
            "password": connection.get("password"),
            "account": connection.get("account"),
            "warehouse": connection.get("warehouse"),
            "database": connection.get("database"),
            "role": connection.get("role"),
        }
        return snowflake.connector.connect(**{key: value for key, value in kwargs.items() if value})

    return connect
