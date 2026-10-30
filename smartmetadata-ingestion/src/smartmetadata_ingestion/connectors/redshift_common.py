# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Redshift connection, catalog/usage/lineage readers, and helpers.

Clean-room alignment to Apache OpenMetadata RedshiftConnection / service_spec.
service_spec: metadata + lineage + usage + profiler + connection. No sampler_class / data_diff invent.
OSS: sqlalchemy-redshift~=1.0.0, psycopg2-binary, GeoAlchemy2. No collate-data-diff.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.errors import WorkflowError

DEFAULT_SCHEME = "redshift+psycopg2"
DEFAULT_PORT = 5439
_SYSTEM_DATABASES = frozenset({"template0", "template1"})
_SYSTEM_SCHEMAS = frozenset({"information_schema", "pg_catalog", "pg_toast"})


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


@dataclass(frozen=True, slots=True)
class LineageEdgeRow:
    source_database: str
    source_schema: str
    source_table: str
    target_database: str
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
    def list_databases(self) -> Sequence[DatabaseRow]: ...
    def list_schemas(self, database: str) -> Sequence[SchemaRow]: ...
    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]: ...
    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]: ...
    def list_views(self, database: str) -> Sequence[ViewRow]: ...


class LineageReader(Protocol):
    def list_edges(self) -> Sequence[LineageEdgeRow]: ...


class UsageReader(Protocol):
    def list_usage(self) -> Sequence[UsageEventRow]: ...


class ProfileReader(Protocol):
    def profile_table(
        self, database: str, schema: str, table: str
    ) -> Sequence[ProfileStatRow]: ...

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]: ...


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

    def profile_table(
        self, database: str, schema: str, table: str
    ) -> Sequence[ProfileStatRow]:
        return self._stats

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]:
        return self._samples[:limit]


def system_databases() -> frozenset[str]:
    return _SYSTEM_DATABASES


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
    if not connection.get("database"):
        raise WorkflowError("database is required")
    steps.append("CheckDatabase")
    return steps


def build_service_connection_config(
    *,
    raw: dict[str, Any],
    store_secrets: bool,
) -> dict[str, Any] | None:
    if not raw:
        return None
    config: dict[str, Any] = {
        "type": "Redshift",
        "scheme": raw.get("scheme") or DEFAULT_SCHEME,
    }
    for key in (
        "hostPort",
        "username",
        "database",
        "ingestAllDatabases",
        "sslMode",
        "clusterIdentifier", "workgroupName",
    ):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    if store_secrets:
        pwd = password_of(raw)
        if pwd:
            config["authType"] = {"password": pwd}
    return {"config": config}


def redshift_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() using psycopg2 (postgres-family wire protocol)."""
    try:
        import psycopg2
    except ImportError as exc:
        raise WorkflowError(
            "redshift live reads need the optional extra: "
            "pip install 'smartmetadata-ingestion[redshift]'"
        ) from exc
    host_port = connection.get("hostPort") or f"localhost:{DEFAULT_PORT}"
    if ":" in str(host_port):
        host, port_text = str(host_port).rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = str(host_port), DEFAULT_PORT
    database = connection.get("database")

    def connect():
        return psycopg2.connect(
            host=host,
            port=port,
            user=connection.get("username"),
            password=password_of(connection),
            dbname=database,
        )

    return connect


class CursorCatalogReader:
    """information_schema / pg_database reads for postgres-family engines."""

    def __init__(
        self, connect, *, ingest_all: bool = False, entry_database: str | None = None
    ) -> None:
        self._connect = connect
        self._ingest_all = ingest_all
        self._entry_database = entry_database

    def list_databases(self) -> Sequence[DatabaseRow]:
        if not self._ingest_all and self._entry_database:
            return [DatabaseRow(name=self._entry_database)]
        rows = self._fetch(
            "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
        )
        return [DatabaseRow(name=row[0]) for row in rows]

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        rows = self._fetch(
            "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
        )
        return [SchemaRow(database_name=database, name=row[0]) for row in rows]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = %s
            ORDER BY table_name
            """,
            (schema,),
        )
        return [
            TableRow(
                database_name=database,
                schema_name=row[0],
                name=row[1],
                table_type=row[2] or "BASE TABLE",
            )
            for row in rows
        ]

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, column_name, data_type,
                   ordinal_position, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [
            ColumnRow(
                database_name=database,
                schema_name=row[0],
                table_name=row[1],
                name=row[2],
                data_type=row[3] or "STRING",
                ordinal_position=int(row[4]),
                char_length=row[5],
            )
            for row in rows
        ]

    def list_views(self, database: str) -> Sequence[ViewRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, view_definition
            FROM information_schema.views
            ORDER BY table_schema, table_name
            """
        )
        return [
            ViewRow(
                database_name=database,
                schema_name=row[0],
                name=row[1],
                definition=row[2] or "",
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
