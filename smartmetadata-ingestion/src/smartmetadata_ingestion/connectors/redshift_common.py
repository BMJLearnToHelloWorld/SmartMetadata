# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Redshift connection, catalog/usage readers, and helpers.

Clean-room alignment to Apache OpenMetadata RedshiftConnection / service_spec.
service_spec: metadata + lineage + usage + profiler + connection. No sampler_class / data_diff invent.
OSS: sqlalchemy-redshift~=1.0.0, psycopg2-binary, GeoAlchemy2. No collate-data-diff.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

from smartmetadata_ingestion.connectors.constraints import nullable_flag
from smartmetadata_ingestion.connectors.profile_sql import (
    MetricParamsByColumn,
    ProfileOptions,
    SqlProfileReader,
    quote_ansi,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
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
    is_nullable: bool | None = None


@dataclass(frozen=True, slots=True)
class ViewRow:
    database_name: str
    schema_name: str
    name: str
    definition: str


@dataclass(frozen=True, slots=True)
class ProfileStatRow:
    column_name: str | None
    row_count: int | None = None
    null_count: int | None = None
    distinct_count: int | None = None
    min_value: Any | None = None
    max_value: Any | None = None
    mean: float | None = None
    column_count: int | None = None
    column_names: list[str] | None = None
    values_count: int | None = None
    count_in_set: int | None = None
    like_count: int | None = None
    ilike_count: int | None = None
    not_like_count: int | None = None
    regex_count: int | None = None
    not_regex_count: int | None = None
    max_length: int | None = None
    min_length: int | None = None
    stddev: float | None = None
    sum_value: float | None = None
    unique_count: int | None = None
    null_missing_count: int | None = None
    distinct_proportion: float | None = None
    unique_proportion: float | None = None
    null_proportion: float | None = None
    duplicate_count: int | None = None
    like_ratio: float | None = None
    ilike_ratio: float | None = None
    median: float | None = None
    first_quartile: float | None = None
    third_quartile: float | None = None
    inter_quartile_range: float | None = None
    non_parametric_skew: float | None = None
    histogram: dict | None = None
    cardinality_distribution: dict | None = None
    size_in_byte: int | None = None
    create_date_time: str | None = None
    profile_sample: float | None = None
    profile_sample_type: str | None = None
    custom_metrics: list[dict] | None = None


@dataclass(frozen=True, slots=True)
class SampleRow:
    values: dict[str, Any]


class CatalogReader(Protocol):
    def list_databases(self) -> Sequence[DatabaseRow]: ...
    def list_schemas(self, database: str) -> Sequence[SchemaRow]: ...
    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]: ...
    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]: ...
    def list_views(self, database: str) -> Sequence[ViewRow]: ...


class ProfileReader(Protocol):
    def profile_table(
        self,
        database: str,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
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
        self,
        database: str,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
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


class RedshiftInstanceType(str, Enum):
    """Provisioned vs serverless, per the pin's ``RedshiftInstanceType``
    (``connection.py``): which system views the query history reads
    from. Detected once per run by :func:`redshift_query_preflight`."""

    PROVISIONED = "provisioned"
    SERVERLESS = "serverless"


# The instance probe, verbatim from the pin (``connection.py:329``).
_REDSHIFT_INSTANCE_PROBE = "SELECT 1 FROM pg_catalog.stl_query LIMIT 1"

# Permission-probe views per branch, from the pin's test queries
# (``queries.py:365-382``). The stored-procedure-channel views
# (``SVL_STORED_PROC_CALL`` / ``STL_INSERT`` / ``STL_DELETE`` /
# ``SYS_PROCEDURE_CALL``) are not probed here: they serve the
# stored-procedure queries, which are out of scope for the query-log
# preflight.
_REDSHIFT_PROVISIONED_PRIVILEGE_VIEWS = (
    "STL_QUERY",
    "STL_QUERYTEXT",
    "STL_SCAN",
    "SVV_TABLE_INFO",
)
_REDSHIFT_SERVERLESS_PRIVILEGE_VIEWS = (
    "SYS_QUERY_HISTORY",
    "SYS_QUERY_TEXT",
    "SYS_QUERY_DETAIL",
)


def _pgcode(error: BaseException) -> str | None:
    """The PostgreSQL SQLSTATE on the error or anywhere in its cause
    chain — the pin's ``_pgcode`` idea (``connection.py:343-358``):
    the driver exposes it on ``.pgcode`` and SQLAlchemy preserves
    the original DBAPI error at ``.orig``."""
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        code = getattr(current, "pgcode", None)
        if code is None:
            code = getattr(getattr(current, "orig", None), "pgcode", None)
        if code is not None:
            return str(code)
        current = current.__cause__ or current.__context__
    return None


def _execute_one(connect_factory, statement: str) -> list[tuple[Any, ...]]:
    """One statement through a DB-API factory, returning its rows as
    tuples. The factory is the query-log connect factory (the test
    seam when one is set), never a new connection shape."""
    with connect_factory() as connection:
        cursor = connection.cursor()
        try:
            cursor.execute(statement)
            return [tuple(row) for row in cursor.fetchall()]
        finally:
            cursor.close()


def detect_redshift_instance_type(connect_factory) -> RedshiftInstanceType:
    """Provisioned or serverless, by probing for the STL system
    tables (pin ``connection.py:312-340``). Only SQLSTATE ``42P01``
    (undefined table) means serverless — D-L2c C, deviation D-C3:
    the pin catches bare ``ProgrammingError``, but on this product's
    native psycopg2 path a connection/auth/permission failure
    happens inside the same call, and a bare catch would disguise
    that failure as a branch switch. Anything else propagates."""
    try:
        _execute_one(connect_factory, _REDSHIFT_INSTANCE_PROBE)
    except Exception as exc:
        if _pgcode(exc) == "42P01":
            return RedshiftInstanceType.SERVERLESS
        raise
    return RedshiftInstanceType.PROVISIONED


def check_redshift_query_privileges(
    connect_factory, instance_type: RedshiftInstanceType
) -> None:
    """The branch's ``has_table_privilege`` probe (pin
    ``queries.py:365-382``), loud on any missing SELECT: a
    ``WorkflowError`` naming the missing views and the branch. A
    missing privilege must never silently fall back to the old
    context-less template."""
    views = (
        _REDSHIFT_PROVISIONED_PRIVILEGE_VIEWS
        if instance_type is RedshiftInstanceType.PROVISIONED
        else _REDSHIFT_SERVERLESS_PRIVILEGE_VIEWS
    )
    selects = ", ".join(
        f"has_table_privilege('{view}', 'SELECT') AS can_access_{view.lower()}"
        for view in views
    )
    rows = _execute_one(connect_factory, f"SELECT {selects}")
    if not rows:
        raise WorkflowError(
            f"Redshift {instance_type.value} query-log preflight failed: "
            f"privilege probe returned no rows for {', '.join(views)}"
        )
    first = rows[0]
    if isinstance(first, dict):
        values = [
            bool(first.get(f"can_access_{view.lower()}")) for view in views
        ]
    else:
        values = [bool(value) for value in list(first)[: len(views)]]
    missing = [view for view, ok in zip(views, values, strict=True) if not ok]
    if missing:
        raise WorkflowError(
            f"Redshift {instance_type.value} query-log preflight failed: "
            f"account lacks SELECT on {', '.join(missing)}"
        )


def redshift_query_preflight(connect_factory) -> RedshiftInstanceType:
    """The Redshift query-log preflight, run in ``prepare()`` before
    any history read: detect the instance type first (it decides
    the branch), then probe that branch's privileges. Returns the
    instance type so the caller can select the matching template."""
    instance_type = detect_redshift_instance_type(connect_factory)
    check_redshift_query_privileges(connect_factory, instance_type)
    return instance_type


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
        "clusterIdentifier",
        "workgroupName",
        "supportsMetadataExtraction",
        "supportsIncrementalMetadataExtraction",
        "supportsUsageExtraction",
        "supportsLineageExtraction",
        "supportsDBTExtraction",
        "supportsProfiler",
        "supportsDatabase",
        "supportsQueryComment",
        "supportsSystemProfile",
        "supportsDataDiff",
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
    ):
        if isinstance(raw.get(key), dict) and raw.get(key):
            config[key] = dict(raw[key])
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
                   ordinal_position, character_maximum_length, is_nullable
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
                is_nullable=nullable_flag(row[6]),
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


class CursorProfileReader:
    """Live profile reads through a DB-API cursor factory."""

    def __init__(self, connect) -> None:
        self._reader = SqlProfileReader(
            connect,
            quote=quote_ansi,
            paramstyle="format",
            columns_sql=(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_catalog = {ph} AND table_schema = {ph} AND table_name = {ph} "
                "ORDER BY ordinal_position"
            ),
            columns_params=lambda database, schema, table: (database, schema, table),
            sample_template="SELECT * FROM {ident} LIMIT {limit}",
            ident_style="three",
            stat_row=ProfileStatRow,
            sample_row=SampleRow,
            dialect="postgres",
        )

    def profile_table(
        self,
        database: str,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> Sequence[ProfileStatRow]:
        return self._reader.profile(
            database,
            schema,
            table,
            metric_params=metric_params,
            sample_config=sample_config,
            options=options,
        )

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]:
        return self._reader.sample(database, schema, table, limit=limit)
