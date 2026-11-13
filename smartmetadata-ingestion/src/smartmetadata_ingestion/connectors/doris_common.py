# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Doris connection, catalog reader, and helpers.

Clean-room alignment to Apache OpenMetadata DorisConnection / DorisSource
(service_spec: metadata + lineage + connection; schema supportsProfiler).
OSS: pydoris (locked); live reads use PyMySQL (MySQL protocol / OM ADR).
"""

from __future__ import annotations

import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.connectors.profile_sql import (
    MetricParamsByColumn,
    SqlProfileReader,
    quote_mysql,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import PartitionColumnRecord, TablePartitionRecord

_SYSTEM_SCHEMAS = frozenset({"information_schema", "mysql", "__internal_schema", "sys"})

# Official DorisSource.RELKIND_MAP (doris/metadata.py). Keys are case-
# sensitive ENGINE values as INFORMATION_SCHEMA reports them.
_DORIS_ENGINE_TO_TABLE_TYPE = {
    "Doris": "Regular",
    "View": "View",
    "MEMORY": "View",
    "OLAP": "MaterializedView",
    "Iceberg": "Iceberg",
    "ICEBERG": "Iceberg",
}


def map_doris_table_type(engine: str | None) -> str:
    """Map a Doris ENGINE value to an official tableType, else Regular."""
    return _DORIS_ENGINE_TO_TABLE_TYPE.get(engine or "", "Regular")


def qualified_identifier(*identifiers: str | None) -> str:
    """Official `_qualified_identifier`: quote each name part, join with `.`."""
    return ".".join(quote_mysql(identifier) for identifier in identifiers if identifier is not None)


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


@dataclass(frozen=True, slots=True)
class SampleRow:
    values: dict[str, Any]


class CatalogReader(Protocol):
    def list_schemas(self) -> Sequence[SchemaRow]: ...

    def list_tables(self, schema: str) -> Sequence[TableRow]: ...

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]: ...

    def list_views(self) -> Sequence[ViewRow]: ...

    def get_table_partition_details(
        self, schema: str, table: str
    ) -> TablePartitionRecord | None: ...


class LineageReader(Protocol):
    def list_edges(self) -> Sequence[LineageEdgeRow]: ...


class ProfileReader(Protocol):
    def profile_table(
        self,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
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
        partitions: dict[tuple[str, str], str] | None = None,
    ) -> None:
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)
        self._partitions = dict(partitions or {})

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

    def get_table_partition_details(
        self, schema: str, table: str
    ) -> TablePartitionRecord | None:
        if (schema, table) not in self._partitions:
            return None
        key = self._partitions[(schema, table)]
        if key == "":
            return None
        return TablePartitionRecord(
            columns=[
                PartitionColumnRecord(column_name=part)
                for part in key.split(", ")
            ]
        )


class SequenceLineageReader:
    def __init__(self, edges: Sequence[LineageEdgeRow] = ()) -> None:
        self._edges = list(edges)

    def list_edges(self) -> Sequence[LineageEdgeRow]:
        return self._edges


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


def test_live_connection(connection: dict[str, Any], *, connect=None) -> None:
    """Open the connection and run ``SELECT 1``; raises WorkflowError on failure.

    This is the live half of a test connection (``run_connection_test``
    above only checks the shape). ``connect`` is the injectable factory
    used by tests; production uses :func:`doris_connect`.
    """
    factory = connect or doris_connect(connection)
    try:
        with factory() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            finally:
                cursor.close()
    except WorkflowError:
        raise
    except Exception as exc:  # noqa: BLE001 - surfaced as a workflow error
        raise WorkflowError(f"doris test connection failed: {exc}") from exc


def build_service_connection_config(
    *,
    raw: dict[str, Any],
    store_secrets: bool,
) -> dict[str, Any] | None:
    if not raw:
        return None
    config: dict[str, Any] = {"type": "Doris", "scheme": raw.get("scheme") or "doris"}
    for key in (
        "hostPort",
        "username",
        "databaseName",
        "databaseSchema",
        "supportsMetadataExtraction",
        "supportsDBTExtraction",
        "supportsProfiler",
        "supportsAutoPartitionDetection",
        "supportsQueryComment",
        "supportsViewLineageExtraction",
    ):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    for key in (
        "schemaFilterPattern",
        "tableFilterPattern",
        "databaseFilterPattern",
        "sslConfig",
        "connectionOptions",
        "connectionArguments",
    ):
        if isinstance(raw.get(key), dict) and raw.get(key):
            config[key] = dict(raw[key])
    if store_secrets:
        pwd = password_of(raw)
        if pwd:
            # Doris has no authType: the schema carries a top-level password.
            config["password"] = pwd
    return {"config": config}


def doris_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() using PyMySQL (Doris MySQL protocol)."""

    try:
        import pymysql
    except ImportError as exc:
        raise WorkflowError(
            "doris live reads need the optional extra: pip install 'smartmetadata-ingestion[doris]'"
        ) from exc
    host_port = connection.get("hostPort") or "localhost:9030"
    if ":" in str(host_port):
        host, port_text = str(host_port).rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = str(host_port), 9030
    database = (
        connection.get("databaseSchema")
        or connection.get("databaseName")
        or connection.get("database")
    )

    ssl = pymysql_ssl_from_config(connection)

    def connect():
        kwargs: dict[str, Any] = {
            "host": host,
            "port": port,
            "user": connection.get("username"),
            "password": password_of(connection),
            "database": database,
        }
        if ssl:
            kwargs["ssl"] = ssl
        return pymysql.connect(**kwargs)

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
        # Official DORIS_GET_TABLE_NAMES reads ENGINE, not table_type.
        # table_comment is kept from the existing fork probe (official
        # fetches comments separately via DORIS_TABLE_COMMENTS).
        rows = self._fetch(
            """
            SELECT table_schema, table_name, engine, table_comment
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
                table_type=row[2] or "",
                comment=_blank_to_none(row[3]),
            )
            for row in rows
        ]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        # Official DorisSource._get_columns uses SHOW FULL COLUMNS, whose
        # Type field is the full type string (ARRAY<INT(11)>, VARCHAR(20)).
        # information_schema.columns.column_type is that same string and
        # stays parameterized. character_maximum_length is kept for the
        # dataLength gate when the type string has no explicit length.
        rows = self._fetch(
            """
            SELECT table_schema, table_name, column_name, column_type, ordinal_position,
                   character_maximum_length, column_comment, data_type
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
                data_type=row[3] or row[7] or "STRING",
                ordinal_position=int(row[4]),
                char_length=row[5],
                comment=_blank_to_none(row[6]),
            )
            for row in rows
        ]

    def list_views(self) -> Sequence[ViewRow]:
        # Official DORIS_VIEW_DEFINITIONS selects '' as view_def and uses
        # invalid SQL (`engine in ['MaterializedView', 'View']`). The
        # fork keeps information_schema.views.view_definition instead of
        # inventing SHOW CREATE VIEW or copying that empty query.
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

    def get_table_partition_details(
        self, schema: str, table: str
    ) -> TablePartitionRecord | None:
        # Official DorisSource.get_table_partition_details: SHOW PARTITIONS
        # FROM the qualified table; if the first row's PartitionKey is not
        # empty, emit TIME-UNIT columns split on ", ". Any exception is
        # (False, None).
        try:
            qualified = qualified_identifier(schema, table)
            rows, description = self._fetch_described(
                f"SHOW PARTITIONS FROM {qualified}"
            )
        except Exception:
            return None
        if not rows:
            return None
        key = _partition_key(rows[0], description)
        if key is None or key == "":
            return None
        return TablePartitionRecord(
            columns=[
                PartitionColumnRecord(column_name=part)
                for part in key.split(", ")
            ]
        )

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        rows, _description = self._fetch_described(sql, params)
        return rows

    def _fetch_described(
        self, sql: str, params: tuple[Any, ...] = ()
    ) -> tuple[list[tuple[Any, ...]], Any]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, params)
                return list(cursor.fetchall()), cursor.description
            finally:
                cursor.close()


def _blank_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _partition_key(row: Any, description: Any) -> str | None:
    """Read PartitionKey from a DB-API row (tuple or mapping)."""
    if isinstance(row, dict):
        for key, value in row.items():
            if str(key).lower() == "partitionkey":
                return "" if value is None else str(value)
        return None
    if description:
        for index, col in enumerate(description):
            name = col[0] if isinstance(col, (tuple, list)) else getattr(col, "name", None)
            if name is not None and str(name).lower() == "partitionkey":
                return "" if row[index] is None else str(row[index])
    if hasattr(row, "PartitionKey"):
        value = row.PartitionKey
        return "" if value is None else str(value)
    return None


def _write_ssl_temp_file(content: str) -> str:
    """Materialise a certificate for the life of the process.

    Official SSLManager.write_secret_temp_file writes a temp file and
    keeps the path until cleanup; callers hold the path across connects.
    """
    handle = tempfile.NamedTemporaryFile(
        prefix="sm-doris-ssl-", suffix=".pem", delete=False, mode="w", encoding="utf-8"
    )
    with handle:
        handle.write(content)
    return handle.name


def pymysql_ssl_from_config(connection: dict[str, Any]) -> dict[str, Any] | None:
    """Build a PyMySQL `ssl=` dict from official sslConfig field names.

    Official check_ssl_and_init / setup_ssl (Doris shares the MySQL
    registration) writes caCertificate / sslCertificate / sslKey to temp
    files and puts the paths on connectionArguments.ssl as ssl_ca /
    ssl_cert / ssl_key. SQLAlchemy then maps those to PyMySQL's ca /
    cert / key. This helper applies the same material to the live
    `pymysql.connect(..., ssl=...)` path used by catalog, profile, and
    test-connection. Existing connectionArguments.ssl entries are kept.
    """
    raw_ssl = {}
    arguments = connection.get("connectionArguments")
    if isinstance(arguments, dict) and isinstance(arguments.get("ssl"), dict):
        raw_ssl.update(arguments["ssl"])
    ssl_config = connection.get("sslConfig")
    if isinstance(ssl_config, dict):
        mapping = (
            ("caCertificate", "ca"),
            ("sslCertificate", "cert"),
            ("sslKey", "key"),
        )
        for config_key, pymysql_key in mapping:
            value = ssl_config.get(config_key)
            if value:
                raw_ssl[pymysql_key] = _write_ssl_temp_file(str(value))
    # Official SQLAlchemy mysql dialect maps ssl_ca -> ca, etc.
    aliases = {"ssl_ca": "ca", "ssl_cert": "cert", "ssl_key": "key"}
    ssl_args: dict[str, Any] = {}
    for key, value in raw_ssl.items():
        ssl_args[aliases.get(str(key), key)] = value
    return ssl_args or None


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
            dialect="doris",
        )

    def profile_table(
        self,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
    ) -> Sequence[ProfileStatRow]:
        return self._reader.profile(
            None, schema, table, metric_params=metric_params, sample_config=sample_config
        )

    def sample_table(self, schema: str, table: str, *, limit: int = 50) -> Sequence[SampleRow]:
        return self._reader.sample(None, schema, table, limit=limit)
