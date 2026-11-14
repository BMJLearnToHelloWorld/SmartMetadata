# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared MariaDB connection, catalog reader, and helpers.

Clean-room alignment to Apache OpenMetadata MariaDBConnection / service_spec
(metadata + lineage + profiler + connection). No usage/sampler/data_diff invent.
OSS: PyMySQL (mysql-family; no dedicated plugins["mariadb"] key in setup.py).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.connectors.constraints import ConstraintRow, nullable_flag
from smartmetadata_ingestion.connectors.ddl import quote_backtick_ident
from smartmetadata_ingestion.connectors.procedures import ProcedureRow, epoch_ms
from smartmetadata_ingestion.connectors.profile_sql import (
    MYSQL_TABLE_STATS_SQL,
    MetricParamsByColumn,
    ProfileOptions,
    SqlProfileReader,
    quote_mysql,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
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
    created_ms: int | None = None
    updated_ms: int | None = None


@dataclass(frozen=True, slots=True)
class ColumnRow:
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
    def list_schemas(self) -> Sequence[SchemaRow]: ...
    def list_tables(self, schema: str) -> Sequence[TableRow]: ...
    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]: ...
    def list_views(self) -> Sequence[ViewRow]: ...


class ProfileReader(Protocol):
    def profile_table(
        self,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> Sequence[ProfileStatRow]: ...
    def sample_table(self, schema: str, table: str, *, limit: int = 50) -> Sequence[SampleRow]: ...


class SequenceCatalogReader:
    def __init__(
        self,
        *,
        schemas: Sequence[SchemaRow] = (),
        tables: Sequence[TableRow] = (),
        columns: Sequence[ColumnRow] = (),
        views: Sequence[ViewRow] = (),
        procedures: Sequence[ProcedureRow] = (),
        constraints: Sequence[ConstraintRow] = (),
        ddls: Mapping[tuple[str, str], str] | None = None,
        samples: Mapping[tuple[str, str], list[Any]] | None = None,
    ) -> None:
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)
        self._procedures = list(procedures)
        self._constraints = list(constraints)
        self._ddls = dict(ddls or {})
        self._samples = dict(samples or {})

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

    def list_procedures(self, schema: str) -> Sequence[ProcedureRow]:
        return [row for row in self._procedures if row.schema_name == schema]

    def list_constraints(self, schema: str) -> Sequence[ConstraintRow]:
        return [row for row in self._constraints if row.schema_name == schema]

    def get_table_ddl(self, schema: str, table: str) -> str | None:
        return self._ddls.get((schema, table))

    def sample_column_values(
        self, schema: str, table: str, column: str, limit: int
    ) -> list[Any]:
        return list(self._samples.get((schema, table, column), ()))[:limit]


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
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> Sequence[ProfileStatRow]:
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
        "type": "MariaDB",
        "scheme": raw.get("scheme") or DEFAULT_SCHEME,
    }
    for key in ("hostPort", "username", "databaseName", "databaseSchema"):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    if store_secrets:
        pwd = password_of(raw)
        if pwd:
            config["password"] = pwd
    return {"config": config}


def mariadb_connect(connection: dict[str, Any]):
    try:
        import pymysql
    except ImportError as exc:
        raise WorkflowError(
            "mariadb live reads need the optional extra: "
            "pip install 'smartmetadata-ingestion[mariadb]'"
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
            SELECT table_schema, table_name, table_type, table_comment, create_time, update_time
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
                created_ms=epoch_ms(row[4]),
                updated_ms=epoch_ms(row[5]),
            )
            for row in rows
        ]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, column_name, data_type, ordinal_position,
                   character_maximum_length, column_comment, is_nullable
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
                is_nullable=nullable_flag(row[7]),
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

    def list_procedures(self, schema: str) -> Sequence[ProcedureRow]:
        rows = self._fetch(
            """
            SELECT routine_schema, routine_name, routine_type, external_language,
                   routine_definition, routine_comment, created, last_altered
            FROM information_schema.routines
            WHERE routine_schema = %s
            ORDER BY routine_name
            """,
            (schema,),
        )
        return [
            ProcedureRow(
                schema_name=row[0],
                name=row[1],
                routine_type=row[2],
                language=row[3],
                definition=row[4],
                comment=row[5],
                created_ms=epoch_ms(row[6]),
                updated_ms=epoch_ms(row[7]),
            )
            for row in rows
        ]
    def list_constraints(self, schema: str) -> Sequence[ConstraintRow]:
        rows = self._fetch(
            """
            SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
                   kcu.column_name, kcu.ordinal_position,
                   kcu.referenced_table_schema, kcu.referenced_table_name,
                   kcu.referenced_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_schema = tc.constraint_schema
             AND kcu.constraint_name = tc.constraint_name
             AND kcu.table_schema = tc.table_schema
             AND kcu.table_name = tc.table_name
            WHERE tc.table_schema = %s
              AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
            ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
            """,
            (schema,),
        )
        return [
            ConstraintRow(
                schema_name=row[0],
                table_name=row[1],
                constraint_name=row[2],
                constraint_type=row[3],
                column_name=row[4],
                ordinal_position=int(row[5]),
                referred_schema=row[6],
                referred_table=row[7],
                referred_column=row[8],
            )
            for row in rows
        ]

    def get_table_ddl(self, schema: str, table: str) -> str | None:
        ident = f"{quote_backtick_ident(schema)}.{quote_backtick_ident(table)}"
        rows = self._fetch(f"SHOW CREATE TABLE {ident}")
        if not rows:
            return None
        return rows[0][1]

    def sample_column_values(
        self, schema: str, table: str, column: str, limit: int
    ) -> list[Any]:
        ident = quote_backtick_ident(column)
        rows = self._fetch(
            f"SELECT {ident} FROM {quote_backtick_ident(schema)}.{quote_backtick_ident(table)} "
            f"WHERE {ident} IS NOT NULL LIMIT %s",
            (limit,),
        )
        return [row[0] for row in rows]

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


class CursorProfileReader:
    """Live profile reads through a DB-API cursor factory."""

    def __init__(self, connect) -> None:
        self._reader = SqlProfileReader(
            connect,
            quote=quote_mysql,
            paramstyle="format",
            columns_sql=(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = {ph} AND table_name = {ph} "
                "ORDER BY ordinal_position"
            ),
            columns_params=lambda database, schema, table: (schema, table),
            sample_template="SELECT * FROM {ident} LIMIT {limit}",
            ident_style="two",
            stat_row=ProfileStatRow,
            sample_row=SampleRow,
            dialect="mariadb",
            table_stats_sql=MYSQL_TABLE_STATS_SQL,
            table_stats_params=lambda database, schema, table: (schema, table),
        )

    def profile_table(
        self,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> Sequence[ProfileStatRow]:
        return self._reader.profile(
            None,
            schema,
            table,
            metric_params=metric_params,
            sample_config=sample_config,
            options=options,
        )

    def sample_table(self, schema: str, table: str, *, limit: int = 50) -> Sequence[SampleRow]:
        return self._reader.sample(None, schema, table, limit=limit)
