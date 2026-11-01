# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Mysql connection, catalog reader, and helpers.

Clean-room alignment to Apache OpenMetadata MysqlConnection / service_spec
(metadata + lineage + profiler + connection). No usage/sampler/data_diff invent.
OSS: PyMySQL (mysql-family; no dedicated plugins["mysql"] key in setup.py).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.errors import WorkflowError

DEFAULT_SCHEME = "mysql+pymysql"
_SYSTEM_SCHEMAS = frozenset({"information_schema", "mysql", "performance_schema", "sys", "innodb"})


@dataclass(frozen=True, slots=True)
class SchemaRow:
    name: str


@dataclass(frozen=True, slots=True)
class TableRow:
    schema_name: str
    name: str
    table_type: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ColumnRow:
    schema_name: str
    table_name: str
    name: str
    data_type: str
    ordinal_position: int
    char_length: int | None = None
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ViewRow:
    schema_name: str
    name: str
    definition: str


@dataclass(frozen=True, slots=True)
class LineageEdgeRow:
    source_schema: str
    source_table: str
    target_schema: str
    target_table: str
    sql_query: str | None = None


@dataclass(frozen=True, slots=True)
class UsageEventRow:
    database: str
    schema_name: str
    table_name: str
    date: str
    count: int


@dataclass(frozen=True, slots=True)
class ProfileStatRow:
    column_name: str | None
    row_count: int | None = None
    null_count: int | None = None
    distinct_count: int | None = None
    min_value: str | None = None
    max_value: str | None = None
    mean: float | None = None


@dataclass(frozen=True, slots=True)
class SampleRow:
    values: dict[str, Any]


class CatalogReader(Protocol):
    def list_schemas(self) -> Sequence[SchemaRow]: ...
    def list_tables(self, schema: str) -> Sequence[TableRow]: ...
    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]: ...
    def list_views(self) -> Sequence[ViewRow]: ...


class LineageReader(Protocol):
    def list_edges(self) -> Sequence[LineageEdgeRow]: ...


class UsageReader(Protocol):
    def list_usage(self) -> Sequence[UsageEventRow]: ...


class ProfileReader(Protocol):
    def profile_table(self, schema: str, table: str) -> Sequence[ProfileStatRow]: ...
    def sample_table(self, schema: str, table: str, *, limit: int = 50) -> Sequence[SampleRow]: ...


class SequenceCatalogReader:
    def __init__(
        self,
        *,
        schemas: Sequence[SchemaRow] = (),
        tables: Sequence[TableRow] = (),
        columns: Sequence[ColumnRow] = (),
        views: Sequence[ViewRow] = (),
    ) -> None:
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)

    def list_schemas(self) -> Sequence[SchemaRow]:
        return self._schemas

    def list_tables(self, schema: str) -> Sequence[TableRow]:
        return [row for row in self._tables if row.schema_name == schema]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        return [
            row
            for row in self._columns
            if row.schema_name == schema and row.table_name == table
        ]

    def list_views(self) -> Sequence[ViewRow]:
        return self._views


class SequenceLineageReader:
    def __init__(self, edges: Sequence[LineageEdgeRow] = ()) -> None:
        self._edges = list(edges)

    def list_edges(self) -> Sequence[LineageEdgeRow]:
        return self._edges


class SequenceUsageReader:
    def __init__(self, events: Sequence[UsageEventRow] = ()) -> None:
        self._events = list(events)

    def list_usage(self) -> Sequence[UsageEventRow]:
        return self._events


class SequenceProfileReader:
    def __init__(
        self,
        *,
        stats: Sequence[ProfileStatRow] = (),
        samples: Sequence[SampleRow] = (),
    ) -> None:
        self._stats = list(stats)
        self._samples = list(samples)

    def profile_table(self, schema: str, table: str) -> Sequence[ProfileStatRow]:
        return self._stats

    def sample_table(self, schema: str, table: str, *, limit: int = 50) -> Sequence[SampleRow]:
        return self._samples[:limit]


def system_schemas() -> frozenset[str]:
    return _SYSTEM_SCHEMAS


def password_of(connection: dict[str, Any]) -> str:
    auth = connection.get("authType")
    if isinstance(auth, dict) and auth.get("password") is not None:
        return str(auth.get("password") or "")
    return str(connection.get("password") or "")


def run_connection_test(connection: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    if not connection.get("hostPort"):
        raise WorkflowError("hostPort is required")
    steps.append("CheckHostPort")
    if not connection.get("username"):
        raise WorkflowError("username is required")
    steps.append("CheckUsername")
    return steps


def build_service_connection_config(
    *,
    raw: dict[str, Any],
    store_secrets: bool,
) -> dict[str, Any] | None:
    if not raw:
        return None
    config: dict[str, Any] = {
        "type": "Mysql",
        "scheme": raw.get("scheme") or DEFAULT_SCHEME,
    }
    for key in (
        "hostPort",
        "username",
        "databaseName",
        "databaseSchema",
        "useSlowLogs",
        "queryHistoryTable",
        "supportsMetadataExtraction",
        "supportsDBTExtraction",
        "supportsProfiler",
        "supportsQueryComment",
        "supportsDataDiff",
        "supportsUsageExtraction",
        "supportsLineageExtraction",
    ):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    for key in (
        "schemaFilterPattern",
        "tableFilterPattern",
        "databaseFilterPattern",
        "storedProcedureFilterPattern",
        "sslConfig",
        "connectionOptions",
        "connectionArguments",
        "authType",
    ):
        if isinstance(raw.get(key), dict) and raw.get(key):
            config[key] = dict(raw[key])
    if store_secrets:
        pwd = password_of(raw)
        if pwd:
            # Prefer authType password shape when present; else top-level password.
            if isinstance(config.get("authType"), dict):
                config["authType"] = {**config["authType"], "password": pwd}
            else:
                config["authType"] = {"password": pwd}
    return {"config": config}


def mysql_connect(connection: dict[str, Any]):
    try:
        import pymysql
    except ImportError as exc:
        raise WorkflowError(
            "mysql live reads need the optional extra: "
            "pip install 'smartmetadata-ingestion[mysql]'"
        ) from exc
    host_port = connection.get("hostPort") or "localhost:3306"
    if ":" in str(host_port):
        host, port_text = str(host_port).rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = str(host_port), 3306
    database = (
        connection.get("databaseSchema")
        or connection.get("databaseName")
        or connection.get("database")
    )

    def connect():
        return pymysql.connect(
            host=host,
            port=port,
            user=connection.get("username"),
            password=password_of(connection),
            database=database,
        )

    return connect


class CursorCatalogReader:
    def __init__(self, connect) -> None:
        self._connect = connect

    def list_schemas(self) -> Sequence[SchemaRow]:
        rows = self._fetch(
            "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
        )
        return [SchemaRow(name=row[0]) for row in rows]

    def list_tables(self, schema: str) -> Sequence[TableRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, table_type, table_comment
            FROM information_schema.tables
            WHERE table_schema = %s
            ORDER BY table_name
            """,
            (schema,),
        )
        return [
            TableRow(
                schema_name=row[0],
                name=row[1],
                table_type=row[2] or "BASE TABLE",
                comment=_blank_to_none(row[3]),
            )
            for row in rows
        ]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, column_name, data_type, ordinal_position,
                   character_maximum_length, column_comment
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [
            ColumnRow(
                schema_name=row[0],
                table_name=row[1],
                name=row[2],
                data_type=row[3] or "STRING",
                ordinal_position=int(row[4]),
                char_length=row[5],
                comment=_blank_to_none(row[6]),
            )
            for row in rows
        ]

    def list_views(self) -> Sequence[ViewRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, view_definition
            FROM information_schema.views
            ORDER BY table_schema, table_name
            """
        )
        return [
            ViewRow(schema_name=row[0], name=row[1], definition=row[2] or "")
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


def _blank_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
