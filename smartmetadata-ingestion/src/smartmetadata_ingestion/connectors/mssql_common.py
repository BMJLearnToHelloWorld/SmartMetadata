# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared MSSQL connection, catalog/usage/lineage readers, and helpers.

Clean-room alignment to Apache OpenMetadata MssqlConnection / service_spec
(metadata, lineage, usage, sampler, data_diff, connection).
OSS locked: sqlalchemy-pytds (default); optional pyodbc / pymssql.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.errors import WorkflowError

SCHEME_PYTDS = "mssql+pytds"
SCHEME_PYODBC = "mssql+pyodbc"
SCHEME_PYMSSQL = "mssql+pymssql"
DEFAULT_SCHEME = SCHEME_PYTDS
DEFAULT_ODBC_DRIVER = "ODBC Driver 18 for SQL Server"

_SYSTEM_DATABASES = frozenset({"msdb", "model", "tempdb"})
_SYSTEM_SCHEMAS = frozenset({"information_schema", "sys", "guest"})


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


def normalize_scheme(raw: dict[str, Any]) -> str:
    scheme = str(raw.get("scheme") or DEFAULT_SCHEME).strip()
    if scheme not in {SCHEME_PYTDS, SCHEME_PYODBC, SCHEME_PYMSSQL}:
        raise WorkflowError(
            f"unsupported mssql scheme {scheme!r}; expected "
            f"{SCHEME_PYTDS}, {SCHEME_PYODBC}, or {SCHEME_PYMSSQL}"
        )
    return scheme


def password_of(connection: dict[str, Any]) -> str:
    auth = connection.get("authType")
    if isinstance(auth, dict) and auth.get("password") is not None:
        return str(auth.get("password") or "")
    return str(connection.get("password") or "")


def run_connection_test(connection: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    if not connection.get("database"):
        raise WorkflowError("database is required")
    steps.append("CheckDatabase")
    if connection.get("hostPort"):
        steps.append("CheckHostPort")
    if connection.get("username"):
        steps.append("CheckUsername")
    normalize_scheme(connection)
    steps.append("CheckScheme")
    return steps


def build_service_connection_config(
    *,
    raw: dict[str, Any],
    store_secrets: bool,
) -> dict[str, Any] | None:
    if not raw:
        return None
    config: dict[str, Any] = {
        "type": "Mssql",
        "scheme": normalize_scheme(raw) if raw.get("scheme") else DEFAULT_SCHEME,
    }
    for key in (
        "hostPort",
        "username",
        "database",
        "driver",
        "encrypt",
        "trustServerCertificate",
        "ingestAllDatabases",
        "includeSynonyms",
    ):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    if store_secrets:
        pwd = password_of(raw)
        if pwd:
            config["password"] = pwd
    return {"config": config}


def mssql_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() for the configured scheme."""

    scheme = normalize_scheme(connection)
    host_port = connection.get("hostPort") or "localhost:1433"
    if ":" in str(host_port):
        host, port_text = str(host_port).rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = str(host_port), 1433
    database = connection.get("database")
    username = connection.get("username")
    password = password_of(connection)

    if scheme == SCHEME_PYTDS:
        try:
            import pytds  # type: ignore
        except ImportError as exc:
            raise WorkflowError(
                "mssql+pytds live reads need: pip install 'smartmetadata-ingestion[mssql]'"
            ) from exc

        def connect_pytds():
            return pytds.connect(
                server=host,
                port=port,
                database=database,
                user=username,
                password=password,
            )

        return connect_pytds

    if scheme == SCHEME_PYMSSQL:
        try:
            import pymssql  # type: ignore
        except ImportError as exc:
            raise WorkflowError(
                "mssql+pymssql live reads need: pip install 'smartmetadata-ingestion[mssql-pymssql]'"
            ) from exc

        def connect_pymssql():
            return pymssql.connect(
                server=host,
                port=port,
                user=username,
                password=password,
                database=database,
            )

        return connect_pymssql

    # pyodbc
    try:
        import pyodbc  # type: ignore
    except ImportError as exc:
        raise WorkflowError(
            "mssql+pyodbc live reads need: pip install 'smartmetadata-ingestion[mssql-odbc]'"
        ) from exc
    driver = connection.get("driver") or DEFAULT_ODBC_DRIVER
    encrypt = "yes" if connection.get("encrypt") else "no"
    trust = "yes" if connection.get("trustServerCertificate") else "no"
    conn_str = (
        f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};"
        f"UID={username};PWD={password};Encrypt={encrypt};"
        f"TrustServerCertificate={trust}"
    )

    def connect_pyodbc():
        return pyodbc.connect(conn_str)

    return connect_pyodbc


class CursorCatalogReader:
    """INFORMATION_SCHEMA reads; database list from sys.databases."""

    def __init__(self, connect, *, ingest_all: bool = False, entry_database: str | None = None) -> None:
        self._connect = connect
        self._ingest_all = ingest_all
        self._entry_database = entry_database

    def list_databases(self) -> Sequence[DatabaseRow]:
        if not self._ingest_all and self._entry_database:
            return [DatabaseRow(name=self._entry_database)]
        rows = self._fetch("SELECT name FROM sys.databases ORDER BY name")
        return [DatabaseRow(name=row[0]) for row in rows]

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        rows = self._fetch(
            f"SELECT name FROM [{database}].sys.schemas ORDER BY name"
            if self._use_qualified()
            else "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME"
        )
        if self._use_qualified():
            return [SchemaRow(database_name=database, name=row[0]) for row in rows]
        return [SchemaRow(database_name=database, name=row[0]) for row in rows]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        rows = self._fetch(
            """
            SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
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
            SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE,
                   ORDINAL_POSITION, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
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
            SELECT TABLE_SCHEMA, TABLE_NAME, VIEW_DEFINITION
            FROM INFORMATION_SCHEMA.VIEWS
            ORDER BY TABLE_SCHEMA, TABLE_NAME
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

    def _use_qualified(self) -> bool:
        return bool(self._ingest_all)

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                if params:
                    cursor.execute(sql, params)
                else:
                    cursor.execute(sql)
                return list(cursor.fetchall())
            finally:
                cursor.close()
