# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Data-diff execution bindings.

Maps a ``source.type`` to the connector's table-parameter builder, key-set
differ, live connect factory and live key fetcher. A type with no entry here
has no data-diff implementation and the workflow rejects it explicitly
instead of silently running a metadata pass. Nine types are bound
(databricks / mssql / mysql / postgres / snowflake / unitycatalog +
trino / azuresql / clickzetta, P2-5); redshift is still unbound by design —
it gets its own connector item, it never reuses the postgres binding.

Clean-room: no collate-data-diff dependency. The official engine
(``data_diff.diff_tables``) compares full row values; this module compares
key sets when a spec carries no extra columns (Phase 1), and compares row
values with the chunked key-driven engine (P2-1) once the setter has
determined extra columns. Sampling (P2-2) renders its where clause into
the same row fetch.

ADR:2026-11-11-table-diff-value-engine-chunked-row-comparison
"""

from __future__ import annotations

import json
import logging
import math
import random
import string
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Literal

from smartmetadata_ingestion.config import DataDiffSideSpec, DataDiffSpec
from smartmetadata_ingestion.connectors import (
    azuresql_common,
    azuresql_data_diff,
    clickzetta_common,
    clickzetta_data_diff,
    databricks_common,
    databricks_data_diff,
    mssql_common,
    mssql_data_diff,
    mysql_common,
    mysql_data_diff,
    postgres_common,
    postgres_data_diff,
    snowflake_common,
    snowflake_data_diff,
    trino_common,
    trino_data_diff,
    unitycatalog_data_diff,
)
from smartmetadata_ingestion.connectors.profile_sql import (
    quote_ansi,
    quote_clickzetta,
    quote_mssql,
    quote_mysql,
)
from smartmetadata_ingestion.data_quality.sampling import (
    StaticSampleConfig,
    resolve_table_diff_sample_config,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord

logger = logging.getLogger(__name__)

# P2-1 chunk size: one chunk of left rows + one chunk of right rows + one
# chunk of keys is the memory bound (ruling §3.4).
DATA_DIFF_CHUNK_SIZE = 1000

# Failed-row sample kept in memory only, for debug logging (pin
# SAMPLE_DATA_DEFAULT_COUNT = 50); never written into a result record.
FAILED_ROWS_SAMPLE_SIZE = 50

# Sampling (P2-2, ruling §4.2): the SQL Server dialects hash with HASHBYTES
# and only integer keys hash the same as every other database (pin
# ``tableDiff.py:95-99``); ClickZetta has no verified MD5/SUBSTRING
# equivalent, so a clickzetta side never samples (warn + full compare).
SQL_SERVER_SERVICE_TYPES = frozenset({"mssql", "azuresql"})
SQL_SERVER_SAMPLING_KEY_TYPES = frozenset({"TINYINT", "SMALLINT", "INT", "BIGINT"})

# Per-dialect CAST target for the sample-where key rendering (ruling §4.2):
# MySQL has no VARCHAR cast target, Spark SQL uses STRING.
_SAMPLE_CAST_TARGET: dict[str, str] = {
    "mysql": "CHAR",
    "databricks": "STRING",
    "unitycatalog": "STRING",
}


@dataclass(frozen=True)
class KeySetDiff:
    """Outcome of comparing two key sets.

    ``extra_left`` / ``extra_right`` are the added / removed rows;
    ``common`` is the shared key count (the official ``passedRows``).
    Changed rows (same key, different values) are not computed here.
    """

    extra_left: int
    extra_right: int
    common: int

    @property
    def total(self) -> int:
        return self.extra_left + self.extra_right


def compare_key_sets(left_keys: Iterable[Any], right_keys: Iterable[Any]) -> KeySetDiff:
    """Compare two key iterables by set membership. Single shared implementation
    behind every connector's ``*DataDiff.compare`` — no per-connector copies."""
    left = set(left_keys)
    right = set(right_keys)
    return KeySetDiff(
        extra_left=len(left - right),
        extra_right=len(right - left),
        common=len(left & right),
    )


# -- column type families (pin tableDiff §3.6) -------------------------------
# A pulled ``dataType`` string maps to a comparability family (pin
# ``_get_column_python_type`` / ``is_numeric`` equivalent): the three numeric
# families compare across each other, every other family only with itself,
# and a dataType outside the table is its own family (comparable only with
# the same name). A missing type on either side is unprovable either way,
# so it compares (never fail a case for metadata the server did not send).

_NUMERIC_FAMILIES = frozenset({"integer", "float", "decimal"})

_TYPE_FAMILIES: dict[str, str] = {
    "TINYINT": "integer",
    "SMALLINT": "integer",
    "INT": "integer",
    "BIGINT": "integer",
    "FLOAT": "float",
    "DOUBLE": "float",
    "DECIMAL": "decimal",
    "NUMERIC": "decimal",
    "NUMBER": "decimal",
    "STRING": "string",
    "TEXT": "string",
    "CHAR": "string",
    "VARCHAR": "string",
    "BOOLEAN": "boolean",
    "TIMESTAMP": "timestamp",
    "TIMESTAMPZ": "timestamp",
    "DATETIME": "timestamp",
    "DATE": "date",
    "TIME": "time",
    "BINARY": "binary",
    "VARBINARY": "binary",
    "UUID": "uuid",
}


def column_type_family(data_type: str | None) -> str | None:
    """The comparability family of a pulled ``dataType`` string (``None`` when
    the server sent no type)."""
    if data_type is None:
        return None
    return _TYPE_FAMILIES.get(str(data_type).strip().upper(), str(data_type).strip().upper())


def column_types_comparable(left: str | None, right: str | None) -> bool:
    """Whether two pulled ``dataType`` strings may be compared (§3.6)."""
    left_family = column_type_family(left)
    right_family = column_type_family(right)
    if left_family is None or right_family is None:
        return True
    if left_family in _NUMERIC_FAMILIES and right_family in _NUMERIC_FAMILIES:
        return True
    return left_family == right_family


# -- row-value comparison (P2-1, ruling §3.5/§3.6) ---------------------------
# Key identity and value equality are deliberately NOT the same operation:
# keys need a hashable normal form (for the streaming duplicate check and
# the per-chunk lookup), values need a cross-type equality (INT 1 == BIGINT
# 1, case-insensitive strings, aware vs naive datetimes, JSON objects).


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _is_nan(value: Any) -> bool:
    return isinstance(value, float) and math.isnan(value)


def _norm_key_value(value: Any, case_sensitive: bool) -> Any:
    """One key value's hashable identity (``None``/``bool``/numeric/string/
    datetime in that order; anything else falls back to its repr)."""
    if value is None:
        return ("none", None)
    if isinstance(value, bool):
        return ("bool", value)
    if _is_number(value):
        if _is_nan(value):
            return ("nan", None)
        return ("num", Decimal(str(value)))
    if isinstance(value, str):
        return ("str", value if case_sensitive else value.lower())
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return ("aware", value.astimezone(timezone.utc).replace(tzinfo=None))
        return ("naive", value)
    if isinstance(value, (date, time)):
        return ("other", value)
    try:
        hash(value)
    except TypeError:
        return ("repr", repr(value))
    return ("other", value)


def _norm_key(key: tuple[Any, ...], case_sensitive: bool) -> tuple[Any, ...]:
    return tuple(_norm_key_value(value, case_sensitive) for value in key)


def _values_equal(left: Any, right: Any, case_sensitive: bool) -> bool:
    """Cross-type value equality (§3.6): no ``str()`` normalisation — a
    numeric string never equals a number, a date never equals a datetime."""
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if _is_number(left) and _is_number(right):
        if _is_nan(left) or _is_nan(right):
            return _is_nan(left) and _is_nan(right)
        return Decimal(str(left)) == Decimal(str(right))
    if isinstance(left, str) and isinstance(right, str):
        try:
            left_json = json.loads(left)
            right_json = json.loads(right)
        except (ValueError, TypeError):
            pass
        else:
            if isinstance(left_json, (dict, list)) and isinstance(right_json, (dict, list)):
                return left_json == right_json
        return left == right if case_sensitive else left.lower() == right.lower()
    if isinstance(left, datetime) and isinstance(right, datetime):
        if (left.tzinfo is None) != (right.tzinfo is None):
            return False
        if left.tzinfo is not None:
            return left.astimezone(timezone.utc) == right.astimezone(timezone.utc)
        return left == right
    if type(left) is not type(right):
        return False
    return left == right


class DuplicateKeyError(Exception):
    """A key is not unique on one side (ruling §3.8); the message names the
    key columns only, never the offending values, and the location is the
    side's full FQN."""

    def __init__(self, key_columns: list[str], table_fqn: str) -> None:
        if len(key_columns) == 1:
            subject = f"Key column '{key_columns[0]}' is"
        else:
            subject = f"Key columns ({', '.join(repr(column) for column in key_columns)}) are"
        super().__init__(
            f"{subject} not unique in {table_fqn}. A row-level diff needs a "
            "unique key: pick a unique column, or add more columns to the key."
        )


class UnsupportedDialectError(Exception):
    """A diff side has no data-diff binding (ruling §3.9)."""

    def __init__(self, side: str, source_type: str) -> None:
        super().__init__(f"Unsupported dialect on the {side} side: '{source_type}'")


@dataclass(frozen=True)
class DataDiffBinding:
    parameter: type
    differ: type
    connect: Callable[[dict[str, Any]], Callable[[], Any]]
    quote: Callable[[str], str]
    ident_style: Literal["two", "three"]
    # Keyword the parameter builder takes for the catalog/database segment
    # ("database" everywhere except Databricks / Unity Catalog, where the
    # builder calls it "catalog").
    database_kwarg: Literal["database", "catalog"] = "database"
    # DB-API parameter marker the chunked row SQL uses: postgres / mysql /
    # snowflake drivers take ``%s`` (format); mssql / databricks /
    # unitycatalog / trino / azuresql / clickzetta take ``?`` (qmark).
    # Every binding sets this explicitly; the default exists only so the
    # field can sit after ``database_kwarg``.
    paramstyle: Literal["format", "qmark"] = "format"


DATA_DIFF_BINDINGS: dict[str, DataDiffBinding] = {
    "databricks": DataDiffBinding(
        databricks_data_diff.DatabricksTableParameter,
        databricks_data_diff.DatabricksDataDiff,
        databricks_common.databricks_connect,
        databricks_common.quote_ident,
        "three",
        "catalog",
        paramstyle="qmark",
    ),
    "mssql": DataDiffBinding(
        mssql_data_diff.MssqlTableParameter,
        mssql_data_diff.MssqlDataDiff,
        mssql_common.mssql_connect,
        quote_mssql,
        "three",
        paramstyle="qmark",
    ),
    "mysql": DataDiffBinding(
        mysql_data_diff.MysqlTableParameter,
        mysql_data_diff.MysqlDataDiff,
        mysql_common.mysql_connect,
        quote_mysql,
        "two",
        paramstyle="format",
    ),
    "postgres": DataDiffBinding(
        postgres_data_diff.PostgresTableParameter,
        postgres_data_diff.PostgresDataDiff,
        postgres_common.postgres_connect,
        quote_ansi,
        "three",
        paramstyle="format",
    ),
    "snowflake": DataDiffBinding(
        snowflake_data_diff.SnowflakeTableParameter,
        snowflake_data_diff.SnowflakeDataDiff,
        snowflake_common.snowflake_connect,
        quote_ansi,
        "three",
        paramstyle="format",
    ),
    # Unity Catalog reuses the Databricks execution surface.
    "unitycatalog": DataDiffBinding(
        unitycatalog_data_diff.UnityCatalogTableParameter,
        unitycatalog_data_diff.UnityCatalogDataDiff,
        databricks_common.databricks_connect,
        databricks_common.quote_ident,
        "three",
        "catalog",
        paramstyle="qmark",
    ),
    # P2-5: Trino takes the table-specific catalog per side (official
    # TrinoTableParameter injects catalog + schema from the table FQN).
    "trino": DataDiffBinding(
        trino_data_diff.TrinoTableParameter,
        trino_data_diff.TrinoDataDiff,
        trino_common.trino_connect,
        quote_ansi,
        "three",
        "catalog",
        paramstyle="qmark",
    ),
    # P2-5: Azure SQL is SQL Server over TDS (official groups Mssql +
    # AzureSQL as one dialect family; dialect stays "mssql").
    "azuresql": DataDiffBinding(
        azuresql_data_diff.AzureSQLTableParameter,
        azuresql_data_diff.AzureSQLDataDiff,
        azuresql_common.azuresql_connect,
        quote_mssql,
        "three",
        paramstyle="qmark",
    ),
    # P2-5: ClickZetta tables are addressed schema.table; the side's
    # database segment is the workspace.
    "clickzetta": DataDiffBinding(
        clickzetta_data_diff.ClickzettaTableParameter,
        clickzetta_data_diff.ClickzettaDataDiff,
        clickzetta_common.clickzetta_connect,
        quote_clickzetta,
        "two",
        paramstyle="qmark",
    ),
}


def datadiff_binding(source_type: str) -> DataDiffBinding | None:
    return DATA_DIFF_BINDINGS.get(source_type.strip().lower())


def build_side(
    binding: DataDiffBinding,
    connection: dict[str, Any],
    *,
    database: str,
    schema: str,
    table: str,
    key_columns: list[str],
) -> dict[str, Any]:
    """Build one diff side through the connector's ``*TableParameter``.

    The returned dict is the side descriptor the differ and the key fetcher
    consume. It is never written into a result record (Snowflake sides may
    carry private-key material).
    """
    kwargs: dict[str, Any] = {
        binding.database_kwarg: database,
        "schema": schema,
        "table": table,
        "key_columns": key_columns,
    }
    return binding.parameter.build(connection, **kwargs)


def _qualify_table(
    quote: Callable[[str], str],
    ident_style: Literal["two", "three"],
    database: str | None,
    schema: str,
    table: str,
) -> str:
    """The dialect's fully qualified table name (shared by the key and row
    fetchers; ``two`` = schema.table, ``three`` = database.schema.table)."""
    if ident_style == "two":
        parts = (schema, table)
    else:
        if not database:
            raise WorkflowError("database is required to qualify a table")
        parts = (database, schema, table)
    return ".".join(quote(part) for part in parts)


class SqlKeyFetcher:
    """Live key fetcher over a DB-API connect factory.

    ``SELECT DISTINCT`` over the configured key columns; the caller compares
    the returned key tuples. Identifiers are quoted per dialect (same
    grouping as ``SqlProfileReader``); ``where_clause`` is config-supplied
    SQL, trusted like the TestSuite ``expression`` — never built from UI input.
    """

    def __init__(
        self,
        connect: Callable[[], Any],
        *,
        quote: Callable[[str], str],
        ident_style: Literal["two", "three"],
    ) -> None:
        self._connect = connect
        self._quote = quote
        self._ident_style = ident_style

    def ident(self, database: str | None, schema: str, table: str) -> str:
        return _qualify_table(self._quote, self._ident_style, database, schema, table)

    def keys_sql(
        self,
        database: str | None,
        schema: str,
        table: str,
        key_columns: list[str],
        where_clause: str | None = None,
    ) -> str:
        if not key_columns:
            raise WorkflowError("key_columns are required for data diff")
        columns = ", ".join(self._quote(column) for column in key_columns)
        sql = f"SELECT DISTINCT {columns} FROM {self.ident(database, schema, table)}"
        clause = (where_clause or "").strip()
        if clause:
            sql += f" WHERE {clause}"
        return sql

    def fetch_keys(
        self,
        database: str | None,
        schema: str,
        table: str,
        key_columns: list[str],
        where_clause: str | None = None,
    ) -> list[tuple[Any, ...]]:
        sql = self.keys_sql(database, schema, table, key_columns, where_clause)
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                return [tuple(row) for row in cursor.fetchall()]
            finally:
                cursor.close()


class SqlRowFetcher:
    """Live chunked row fetcher over a DB-API connect factory (P2-1).

    One fetcher per side, over a single connection the caller holds open
    for the whole comparison: the left side streams ``key + extra`` rows in
    ``DATA_DIFF_CHUNK_SIZE`` batches ordered by key, and either side answers
    a chunk lookup (``WHERE key IN (...)`` / composite ``OR`` of ``AND``
    groups) for one chunk of keys. Key order is the comparison order — a
    string key orders by ``LOWER(column)`` when the comparison is case
    insensitive, so duplicates stay adjacent in the stream.
    """

    def __init__(
        self,
        connect: Callable[[], Any],
        *,
        quote: Callable[[str], str],
        ident_style: Literal["two", "three"],
        paramstyle: Literal["format", "qmark"] = "format",
    ) -> None:
        self._connect = connect
        self._quote = quote
        self._ident_style = ident_style
        self._placeholder = "%s" if paramstyle == "format" else "?"

    def ident(self, database: str | None, schema: str, table: str) -> str:
        return _qualify_table(self._quote, self._ident_style, database, schema, table)

    def _key_order_expr(
        self,
        key_columns: list[str],
        *,
        case_sensitive: bool,
        key_column_types: dict[str, str] | None,
    ) -> str:
        exprs = []
        for column in key_columns:
            quoted = self._quote(column)
            family = column_type_family((key_column_types or {}).get(column))
            if not case_sensitive and family == "string":
                exprs.append(f"LOWER({quoted})")
            else:
                exprs.append(quoted)
        return ", ".join(exprs)

    def rows_sql(
        self,
        database: str | None,
        schema: str,
        table: str,
        key_columns: list[str],
        extra_columns: list[str] | None = None,
        where_clause: str | None = None,
        *,
        case_sensitive: bool = True,
        key_column_types: dict[str, str] | None = None,
    ) -> str:
        if not key_columns:
            raise WorkflowError("key_columns are required for data diff")
        columns = ", ".join(
            self._quote(column) for column in [*key_columns, *(extra_columns or [])]
        )
        sql = f"SELECT {columns} FROM {self.ident(database, schema, table)}"
        clause = (where_clause or "").strip()
        if clause:
            sql += f" WHERE {clause}"
        order = self._key_order_expr(
            key_columns, case_sensitive=case_sensitive, key_column_types=key_column_types
        )
        return f"{sql} ORDER BY {order}"

    def chunk_sql(
        self,
        database: str | None,
        schema: str,
        table: str,
        key_columns: list[str],
        keys: list[tuple[Any, ...]],
        extra_columns: list[str] | None = None,
        where_clause: str | None = None,
    ) -> tuple[str, list[Any]]:
        if not key_columns:
            raise WorkflowError("key_columns are required for data diff")
        if not keys:
            raise WorkflowError("chunk lookup needs at least one key")
        columns = ", ".join(
            self._quote(column) for column in [*key_columns, *(extra_columns or [])]
        )
        placeholder = self._placeholder
        if len(key_columns) == 1:
            quoted = self._quote(key_columns[0])
            condition = f"{quoted} IN ({', '.join(placeholder for _ in keys)})"
            params = [key[0] for key in keys]
        else:
            groups = []
            params = []
            for key in keys:
                groups.append(
                    " AND ".join(f"{self._quote(column)} = {placeholder}" for column in key_columns)
                )
                params.extend(key)
            condition = "(" + ") OR (".join(groups) + ")"
        sql = f"SELECT {columns} FROM {self.ident(database, schema, table)} WHERE {condition}"
        clause = (where_clause or "").strip()
        if clause:
            sql += f" AND ({clause})"
        return sql, params

    def count_sql(self, database: str | None, schema: str, table: str) -> str:
        return f"SELECT COUNT(*) FROM {self.ident(database, schema, table)}"


def _side_connection(
    side_spec: DataDiffSideSpec, default_connection: dict[str, Any]
) -> dict[str, Any]:
    if side_spec.connection:
        return side_spec.connection
    return default_connection


def _fetch_keys_for(
    spec: DataDiffSpec,
    side_spec: DataDiffSideSpec,
    binding: DataDiffBinding,
    side: dict[str, Any],
    *,
    default_connection: dict[str, Any],
    fetch_keys: Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None = None,
) -> list[tuple[Any, ...]]:
    if fetch_keys is not None:
        return [tuple(row) for row in fetch_keys(side)]
    fetcher = SqlKeyFetcher(
        binding.connect(_side_connection(side_spec, default_connection)),
        quote=binding.quote,
        ident_style=binding.ident_style,
    )
    return fetcher.fetch_keys(
        side_spec.database,
        side_spec.schema,
        side_spec.table,
        side_spec.key_columns,
        where_clause=spec.where_clause,
    )


def _side_fqn(side_spec: DataDiffSideSpec) -> str:
    """A side's full FQN (``service.database.schema.table`` when the setter
    recorded the service, else ``database.schema.table``)."""
    if side_spec.service:
        return f"{side_spec.service}.{side_spec.database}.{side_spec.schema}.{side_spec.table}"
    return f"{side_spec.database}.{side_spec.schema}.{side_spec.table}"


def _aborted_result(
    spec: DataDiffSpec, side_spec: DataDiffSideSpec, timestamp: int
) -> TestCaseResultRecord:
    return TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=timestamp,
        test_case_status="Aborted",
        result=str(DuplicateKeyError(side_spec.key_columns, _side_fqn(side_spec))),
    )


def _has_duplicate_keys(keys: list[tuple[Any, ...]]) -> bool:
    return len(keys) != len(set(keys))


# -- chunked row comparison (P2-1, ruling §3.4/§3.7) --------------------------
# Two passes over key-ordered streams, chunk-bounded throughout: pass 1
# streams the left rows in chunks and looks each chunk up on the right
# (removed / changed / unchanged), pass 2 streams the right keys in chunks
# and looks each chunk up on the left (added). A right-only key is never
# fetched by pass 1, so the second pass is what finds added rows. The row
# source hides whether rows come from a live connection or an injected
# ``fetch_rows`` callable; the engine never holds more than one chunk of
# rows plus one chunk of keys per side.


@dataclass
class _RowDiffOutcome:
    removed: int = 0
    added: int = 0
    changed: int = 0
    unchanged: int = 0
    left_rows: int = 0
    column_diff_counts: dict[str, int] = field(default_factory=dict)
    # (kind, key tuple, extra-column count) — values are masked at log time.
    failed_sample: list[tuple[str, tuple[Any, ...], int]] = field(default_factory=list)
    capped: bool = False

    @property
    def total(self) -> int:
        return self.removed + self.added + self.changed


class _LiveRowSource:
    """Row source over two live connections, held open for one comparison."""

    def __init__(
        self,
        spec: DataDiffSpec,
        left_binding: DataDiffBinding,
        right_binding: DataDiffBinding,
        default_connection: dict[str, Any],
        *,
        left_where: str | None,
        right_where: str | None,
    ) -> None:
        self._spec = spec
        self._left_connect = left_binding.connect(_side_connection(spec.left, default_connection))
        self._right_connect = right_binding.connect(
            _side_connection(spec.right, default_connection)
        )
        self._left_fetcher = SqlRowFetcher(
            self._left_connect,
            quote=left_binding.quote,
            ident_style=left_binding.ident_style,
            paramstyle=left_binding.paramstyle,
        )
        self._right_fetcher = SqlRowFetcher(
            self._right_connect,
            quote=right_binding.quote,
            ident_style=right_binding.ident_style,
            paramstyle=right_binding.paramstyle,
        )
        self._left_where = left_where
        self._right_where = right_where
        self._left_count: int | None = None
        self._left_count_known = False

    def __enter__(self) -> _LiveRowSource:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def set_where(self, left_where: str | None, right_where: str | None) -> None:
        """Replace the per-side where clauses (sampling resolution runs
        after construction: it needs the row count first)."""
        self._left_where = left_where
        self._right_where = right_where

    def _rows(
        self, connect: Callable[[], Any], sql: str, params: list[Any] | None = None
    ) -> list[tuple[Any, ...]]:
        with connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, params or [])
                return [tuple(row) for row in cursor.fetchall()]
            finally:
                cursor.close()

    def iter_left_rows(self) -> Iterator[tuple[Any, ...]]:
        fetcher = self._left_fetcher
        spec = self._spec
        sql = fetcher.rows_sql(
            spec.left.database,
            spec.left.schema,
            spec.left.table,
            spec.left.key_columns,
            spec.left.extra_columns,
            self._left_where,
            case_sensitive=spec.case_sensitive_columns,
            key_column_types=spec.left.key_column_types,
        )
        with self._left_connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                while True:
                    batch = cursor.fetchmany(DATA_DIFF_CHUNK_SIZE)
                    if not batch:
                        return
                    yield from (tuple(row) for row in batch)
            finally:
                cursor.close()

    def rows_for_keys(
        self,
        side: Literal["left", "right"],
        keys: list[tuple[Any, ...]],
        *,
        with_extra: bool = True,
    ) -> list[tuple[Any, ...]]:
        spec = self._spec
        side_spec = spec.left if side == "left" else spec.right
        fetcher = self._left_fetcher if side == "left" else self._right_fetcher
        connect = self._left_connect if side == "left" else self._right_connect
        where = self._left_where if side == "left" else self._right_where
        sql, params = fetcher.chunk_sql(
            side_spec.database,
            side_spec.schema,
            side_spec.table,
            side_spec.key_columns,
            keys,
            side_spec.extra_columns if with_extra else [],
            where,
        )
        return self._rows(connect, sql, params)

    def iter_right_keys(self) -> Iterator[tuple[Any, ...]]:
        fetcher = self._right_fetcher
        spec = self._spec
        sql = fetcher.rows_sql(
            spec.right.database,
            spec.right.schema,
            spec.right.table,
            spec.right.key_columns,
            [],
            self._right_where,
            case_sensitive=spec.case_sensitive_columns,
            key_column_types=spec.right.key_column_types,
        )
        with self._right_connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                while True:
                    batch = cursor.fetchmany(DATA_DIFF_CHUNK_SIZE)
                    if not batch:
                        return
                    yield from (tuple(row) for row in batch)
            finally:
                cursor.close()

    def left_count(self) -> int | None:
        if not self._left_count_known:
            self._left_count_known = True
            try:
                rows = self._rows(
                    self._left_connect,
                    self._left_fetcher.count_sql(
                        self._spec.left.database,
                        self._spec.left.schema,
                        self._spec.left.table,
                    ),
                )
                self._left_count = int(rows[0][0]) if rows else None
            except Exception:
                self._left_count = None
        return self._left_count


class _InjectedRowSource:
    """Row source over an injected ``fetch_rows(side)`` callable (tests).

    Rows are full ``key + extra`` tuples in the spec's column order per
    side; the source materialises each side once, lazily."""

    def __init__(
        self,
        spec: DataDiffSpec,
        left_side: dict[str, Any],
        right_side: dict[str, Any],
        fetch_rows: Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]],
    ) -> None:
        self._spec = spec
        self._left_side = left_side
        self._right_side = right_side
        self._fetch_rows = fetch_rows
        self._left_rows: list[tuple[Any, ...]] | None = None
        self._right_rows: list[tuple[Any, ...]] | None = None

    def __enter__(self) -> _InjectedRowSource:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def set_where(self, left_where: str | None, right_where: str | None) -> None:
        """No-op: injected rows are already filtered by the test."""
        return None

    def _left(self) -> list[tuple[Any, ...]]:
        if self._left_rows is None:
            self._left_rows = [tuple(row) for row in self._fetch_rows(self._left_side)]
        return self._left_rows

    def _right(self) -> list[tuple[Any, ...]]:
        if self._right_rows is None:
            self._right_rows = [tuple(row) for row in self._fetch_rows(self._right_side)]
        return self._right_rows

    def iter_left_rows(self) -> Iterator[tuple[Any, ...]]:
        yield from self._left()

    def rows_for_keys(
        self,
        side: Literal["left", "right"],
        keys: list[tuple[Any, ...]],
        *,
        with_extra: bool = True,
    ) -> list[tuple[Any, ...]]:
        rows = self._left() if side == "left" else self._right()
        side_spec = self._spec.left if side == "left" else self._spec.right
        wanted = {_norm_key(key, self._spec.case_sensitive_columns) for key in keys}
        result = []
        for row in rows:
            if (
                _norm_key(row[: len(side_spec.key_columns)], self._spec.case_sensitive_columns)
                in wanted
            ):
                result.append(row if with_extra else row[: len(side_spec.key_columns)])
        return result

    def iter_right_keys(self) -> Iterator[tuple[Any, ...]]:
        for row in self._right():
            yield row[: len(self._spec.right.key_columns)]

    def left_count(self) -> int | None:
        return len(self._left())


def _extra_name_map(side_spec: DataDiffSideSpec) -> dict[str, str]:
    """Normalised extra-column name -> the side's own spelling."""
    return {_norm_name(name): name for name in (side_spec.extra_columns or [])}


def _norm_name(name: str) -> str:
    return name.strip().lower()


def _comparable_extra_names(spec: DataDiffSpec) -> list[str]:
    """Extra columns compared on both sides, in left-table order: the
    intersection of the two sides' extra columns, minus columns the schema
    diff says changed type on."""
    left_names = _extra_name_map(spec.left)
    right_names = _extra_name_map(spec.right)
    changed = set()
    if spec.schema_diff is not None:
        changed = {_norm_name(name) for name in spec.schema_diff.changed}
    return [name for name in left_names if name in right_names and name not in changed]


def _schema_table_type(schema_table: Any, column: str) -> str | None:
    """The pulled type of ``column`` in a schema table (``None`` when the
    table or the column is absent)."""
    if schema_table is None:
        return None
    columns = schema_table.schema_ or {}
    for name, info in columns.items():
        if _norm_name(name) == _norm_name(column):
            return info.get("type")
    return None


def _key_type_mismatch(spec: DataDiffSpec) -> str | None:
    """The key-type failure message when the schema diff says a key column
    changed type (§3.6); ``None`` when no key column is incomparable."""
    if spec.schema_diff is None:
        return None
    for name in spec.schema_diff.changed:
        if _norm_name(name) in {
            _norm_name(column) for column in spec.left.key_columns
        } or _norm_name(name) in {_norm_name(column) for column in spec.right.key_columns}:
            left_type = _schema_table_type(spec.schema_diff.schema_table_1, name)
            right_type = _schema_table_type(spec.schema_diff.schema_table_2, name)
            return (
                f"Key column '{name}' has mismatching types: {left_type!r} on the "
                f"left table and {right_type!r} on the right table; key columns "
                "must have comparable types"
            )
    return None


def _validate_row(row: tuple[Any, ...], width: int, *, side: str) -> None:
    if len(row) < width:
        raise WorkflowError(
            f"fetch_rows returned a {side} row with {len(row)} values, "
            f"expected {width} (key + extra columns)"
        )


def _compare_rows(
    spec: DataDiffSpec,
    row_source: _LiveRowSource | _InjectedRowSource,
    *,
    capped: bool,
) -> _RowDiffOutcome:
    """The two-pass chunked comparison (§3.4). ``capped`` stops the count
    at the first distinct diff key past the threshold."""
    outcome = _RowDiffOutcome()
    case_sensitive = spec.case_sensitive_columns
    n_keys = len(spec.left.key_columns)
    n_left = n_keys + len(spec.left.extra_columns or [])
    n_right = n_keys + len(spec.right.extra_columns or [])
    left_names = _extra_name_map(spec.left)
    comparable = _comparable_extra_names(spec)
    threshold = spec.threshold or 0

    def _diffs_exceeded() -> bool:
        return capped and threshold > 0 and outcome.total > threshold

    def _sample(kind: str, key: tuple[Any, ...]) -> None:
        if len(outcome.failed_sample) < FAILED_ROWS_SAMPLE_SIZE:
            outcome.failed_sample.append((kind, key, len(spec.left.extra_columns or [])))

    # Pass 1 — stream the left rows in chunks; look each chunk up on the
    # right. Duplicates are adjacent in the key-ordered stream.
    chunk: list[tuple[Any, ...]] = []
    previous_key: tuple[Any, ...] | None = None

    def _process_left_chunk(rows: list[tuple[Any, ...]]) -> None:
        keys = [row[:n_keys] for row in rows]
        right_rows = row_source.rows_for_keys("right", keys)
        right_by_key: dict[tuple[Any, ...], tuple[Any, ...]] = {}
        for right_row in right_rows:
            _validate_row(right_row, n_right, side="right")
            norm = _norm_key(right_row[:n_keys], case_sensitive)
            if norm in right_by_key:
                raise DuplicateKeyError(spec.right.key_columns, _side_fqn(spec.right))
            right_by_key[norm] = right_row
        for left_row in rows:
            _validate_row(left_row, n_left, side="left")
            key = left_row[:n_keys]
            outcome.left_rows += 1
            right_row = right_by_key.get(_norm_key(key, case_sensitive))
            if right_row is None:
                outcome.removed += 1
                _sample("removed", key)
            else:
                left_extras = {
                    _norm_name(name): left_row[n_keys + i]
                    for i, name in enumerate(spec.left.extra_columns or [])
                }
                right_extras = {
                    _norm_name(name): right_row[n_keys + i]
                    for i, name in enumerate(spec.right.extra_columns or [])
                }
                differing = [
                    name
                    for name in comparable
                    if not _values_equal(
                        left_extras.get(name), right_extras.get(name), case_sensitive
                    )
                ]
                if differing:
                    outcome.changed += 1
                    for name in differing:
                        outcome.column_diff_counts[left_names[name]] = (
                            outcome.column_diff_counts.get(left_names[name], 0) + 1
                        )
                    _sample("changed", key)
                else:
                    outcome.unchanged += 1
            if _diffs_exceeded():
                return

    for left_row in row_source.iter_left_rows():
        norm = _norm_key(left_row[:n_keys], case_sensitive)
        if norm == previous_key:
            raise DuplicateKeyError(spec.left.key_columns, _side_fqn(spec.left))
        previous_key = norm
        chunk.append(left_row)
        if len(chunk) >= DATA_DIFF_CHUNK_SIZE:
            _process_left_chunk(chunk)
            chunk = []
            if _diffs_exceeded():
                break
    if chunk and not _diffs_exceeded():
        _process_left_chunk(chunk)

    # Pass 2 — stream the right keys in chunks; look each chunk up on the
    # left. Only this pass finds added rows.
    if not _diffs_exceeded():
        right_chunk: list[tuple[Any, ...]] = []
        previous_key = None

        def _process_right_chunk(keys: list[tuple[Any, ...]]) -> None:
            left_rows = row_source.rows_for_keys("left", keys, with_extra=False)
            left_key_set = {_norm_key(row[:n_keys], case_sensitive) for row in left_rows}
            for key in keys:
                if _norm_key(key, case_sensitive) not in left_key_set:
                    outcome.added += 1
                    _sample("added", key)
                if _diffs_exceeded():
                    return

        for right_key in row_source.iter_right_keys():
            norm = _norm_key(right_key, case_sensitive)
            if norm == previous_key:
                raise DuplicateKeyError(spec.right.key_columns, _side_fqn(spec.right))
            previous_key = norm
            right_chunk.append(right_key)
            if len(right_chunk) >= DATA_DIFF_CHUNK_SIZE:
                _process_right_chunk(right_chunk)
                right_chunk = []
                if _diffs_exceeded():
                    break
        if right_chunk and not _diffs_exceeded():
            _process_right_chunk(right_chunk)

    outcome.capped = _diffs_exceeded()
    return outcome


def _log_failed_sample(outcome: _RowDiffOutcome) -> None:
    """The first failed rows, key columns in the clear and every other
    value masked — debug log only, never a result record (§3.8)."""
    if not outcome.failed_sample:
        return
    logger.debug("Sample of failed rows (first %d):", len(outcome.failed_sample))
    for kind, key, extra_count in outcome.failed_sample[:10]:
        logger.debug(
            "%s",
            [kind, *(str(value) for value in key), *["***"] * extra_count],
        )


# -- sampling (P2-2, ruling §4.2/§4.3) ----------------------------------------
# The sample where selects rows by the MD5 of the key columns + a random
# salt, compared against an 8-hex-digit nonce. Both sides share one salt
# and one nonce per run, so the same rows are selected on both sides
# (Q-2 (b): same-run both-side key-set identity is the strong assertion).
#
# ADR:2026-11-11-table-diff-sampling-disclosure


def build_sample_where_clause(
    source_type: str,
    binding: DataDiffBinding,
    *,
    key_columns: list[str],
    salt: str,
    hex_nonce: str,
) -> str:
    """The MD5 key-hash sample where for one side (pin
    ``build_sample_where_clause`` / ``build_sql_server_sample_where_clause``).

    Key columns render with an explicit CAST (the official SQLAlchemy
    implicit concat fails on non-string keys in some dialects — Postgres
    has no ``integer || text`` operator; verified §4.4.3). The salt is a
    5-character alphanumeric literal, appended to the concat so both sides
    hash the same text."""
    quote = binding.quote
    salt_literal = "'" + salt.replace("'", "''") + "'"
    if source_type in SQL_SERVER_SERVICE_TYPES:
        key_texts = " + ".join(
            f"CAST({quote(column)} AS VARCHAR)" for column in key_columns
        )
        digest = f"HASHBYTES('MD5', {key_texts} + {salt_literal})"
        hex_digest = f"LOWER(CONVERT(VARCHAR(32), {digest}, 2))"
        return f"SUBSTRING({hex_digest}, 1, 8) < '{hex_nonce}'"
    cast_target = _SAMPLE_CAST_TARGET.get(source_type, "VARCHAR")
    casts = [f"CAST({quote(column)} AS {cast_target})" for column in key_columns]
    if source_type == "mysql":
        concat = f"CONCAT({', '.join([*casts, salt_literal])})"
    else:
        concat = " || ".join([*casts, salt_literal])
    if source_type == "trino":
        # §4.4.1: md5 takes varbinary only, and SUBSTRING on varbinary
        # returns varbinary — wrap the digest in to_hex first.
        return f"substr(to_hex(md5(CAST({concat} AS VARBINARY))), 1, 8) < '{hex_nonce}'"
    if source_type in ("databricks", "unitycatalog"):
        return f"substring(md5({concat}), 1, 8) < '{hex_nonce}'"
    if source_type in ("mysql", "snowflake"):
        return f"SUBSTR(MD5({concat}), 1, 8) < '{hex_nonce}'"
    return f"SUBSTRING(MD5({concat}) FROM 1 FOR 8) < '{hex_nonce}'"


def _sql_server_keys_unfit_for_sampling(
    spec: DataDiffSpec, left_source_type: str, right_source_type: str
) -> list[str]:
    """The key columns of a SQL Server side that are not integers, as
    ``'name (TYPE)'`` (pin ``sql_server_keys_unfit_for_sampling``); a
    missing type is unfit too — it cannot prove the key hashes the same."""
    unfit: list[str] = []
    for side_spec, source_type in (
        (spec.left, left_source_type),
        (spec.right, right_source_type),
    ):
        if source_type not in SQL_SERVER_SERVICE_TYPES:
            continue
        for column in side_spec.key_columns:
            data_type = (side_spec.key_column_types or {}).get(column)
            if column_type_family(data_type) != "integer":
                unfit.append(f"{column} ({data_type or 'unknown'})")
    return unfit


def _combine_where(user_where: str | None, sample_where: str | None) -> str | None:
    """``(<user where>) AND (<sample where>)``; either side alone when the
    other is absent."""
    user = (user_where or "").strip()
    sample = (sample_where or "").strip()
    if user and sample:
        return f"({user}) AND ({sample})"
    return sample or user or None


def _sample_disclosure(static: StaticSampleConfig) -> str:
    amount = (
        f"{_format_sample_amount(static.profile_sample)} rows"
        if static.sample_type == "ROW_COUNT"
        else f"{_format_sample_amount(static.profile_sample)}%"
    )
    return (
        f"Sampled comparison: {amount} of the table (MD5 key-hash sampling); "
        "the verdict is an estimate over the sample, not a full-table conclusion."
    )


def _format_sample_amount(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return repr(value)


def _resolve_sampling(
    spec: DataDiffSpec,
    left_binding: DataDiffBinding,
    right_binding: DataDiffBinding,
    row_source: _LiveRowSource | _InjectedRowSource,
    *,
    left_source_type: str,
    right_source_type: str,
) -> tuple[str | None, str | None, str | None]:
    """Resolve the sampling for one run: the combined per-side where
    clauses plus the message disclosure, or the user where clauses with no
    disclosure when sampling is off. A side that cannot sample (clickzetta,
    non-integer SQL Server keys) warns and compares all rows."""
    user_where = spec.where_clause
    if not spec.table_profile_config:
        return user_where, user_where, None
    static = resolve_table_diff_sample_config(
        spec.table_profile_config.get("profileSampleConfig"),
        row_count_fn=row_source.left_count,
    )
    if static is None:
        return user_where, user_where, None
    if static.sample_type == "PERCENTAGE" and static.profile_sample == 100:
        return user_where, user_where, None
    if left_source_type == "clickzetta" or right_source_type == "clickzetta":
        logger.warning(
            "Skipping sampling: ClickZetta has no verified MD5 function for "
            "key-hash sampling. Comparing all the rows instead."
        )
        return user_where, user_where, None
    unfit = _sql_server_keys_unfit_for_sampling(spec, left_source_type, right_source_type)
    if unfit:
        logger.warning(
            "Skipping sampling: a SQL Server table can only be sampled on integer "
            "key columns, which hash the same in every database, so that both "
            "tables select the same rows. Not supported: %s. Comparing all the "
            "rows instead.",
            ", ".join(unfit),
        )
        return user_where, user_where, None
    if static.sample_type == "ROW_COUNT":
        row_count = row_source.left_count()
        if row_count is None:
            raise WorkflowError("Row count is required for ROWS profile sample type")
        fraction = static.profile_sample / row_count
    else:
        fraction = static.profile_sample / 100
    nonce = int((2**32 - 1) * fraction)
    hex_nonce = hex(nonce)[2:].rjust(8, "0")
    salt = "".join(random.choices(string.ascii_letters + string.digits, k=5))
    left_where = _combine_where(
        user_where,
        build_sample_where_clause(
            left_source_type,
            left_binding,
            key_columns=spec.left.key_columns,
            salt=salt,
            hex_nonce=hex_nonce,
        ),
    )
    right_where = _combine_where(
        user_where,
        build_sample_where_clause(
            right_source_type,
            right_binding,
            key_columns=spec.right.key_columns,
            salt=salt,
            hex_nonce=hex_nonce,
        ),
    )
    return left_where, right_where, _sample_disclosure(static)


def _build_row_result(
    spec: DataDiffSpec,
    outcome: _RowDiffOutcome,
    *,
    has_column_diff: bool,
    left_count: int | None,
    schema_compared: bool,
    sample_disclosure: str | None = None,
    timestamp: int,
) -> TestCaseResultRecord:
    """The P2-1 result (§3.7): full-count branch writes the counts plus
    columnDiffCounts plus the schema fields and passedRows; the capped
    branch writes only diffCount (threshold + 1) plus the schema fields —
    no ``"None"`` strings, no invented counts (Q-1 (a))."""
    verdict_total = spec.threshold + 1 if outcome.capped else outcome.total
    passed = (not has_column_diff) and (
        (spec.threshold or verdict_total) == 0 or verdict_total < spec.threshold
    )
    values: list[dict[str, str]] = []
    if outcome.capped:
        values.append({"name": "diffCount", "value": str(spec.threshold + 1)})
    else:
        values.extend(
            [
                {"name": "removedRows", "value": str(outcome.removed)},
                {"name": "addedRows", "value": str(outcome.added)},
                {"name": "changedRows", "value": str(outcome.changed)},
                {"name": "diffCount", "value": str(outcome.total)},
            ]
        )
        if outcome.column_diff_counts:
            counts = dict(
                sorted(
                    outcome.column_diff_counts.items(),
                    key=lambda item: item[1],
                    reverse=True,
                )
            )
            values.append({"name": "columnDiffCounts", "value": json.dumps(counts)})
    if has_column_diff and spec.schema_diff is not None:
        values.extend(
            [
                {"name": "removedColumns", "value": str(len(spec.schema_diff.removed))},
                {"name": "addedColumns", "value": str(len(spec.schema_diff.added))},
                {"name": "changedColumns", "value": str(len(spec.schema_diff.changed))},
                {"name": "schemaTable1", "value": spec.schema_diff.schema_table_1.render()},
                {"name": "schemaTable2", "value": spec.schema_diff.schema_table_2.render()},
            ]
        )
    if has_column_diff:
        message = (
            f"Schema mismatch detected: {len(spec.schema_diff.removed)} removed, "
            f"{len(spec.schema_diff.added)} added, "
            f"{len(spec.schema_diff.changed)} changed columns. "
            f"Found {verdict_total} different rows."
        )
    else:
        message = (
            f"Found {verdict_total} different rows which is more than "
            f"the threshold of {spec.threshold}"
        )
    if outcome.column_diff_counts and not outcome.capped:
        counts = dict(
            sorted(
                outcome.column_diff_counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        )
        top = ", ".join(f"{column} ({count})" for column, count in list(counts.items())[:3])
        message = f"{message.rstrip('.')}. Columns differing most: {top}."
    if outcome.capped:
        message += (
            f" Counting stopped after exceeding the threshold of {spec.threshold} "
            "(capped count, not the full total)."
        )
    if sample_disclosure is not None:
        message += f" {sample_disclosure}"
    if not schema_compared:
        message += " Schema differences are not compared (no table metadata in inline spec)."
    record = TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=timestamp,
        test_case_status="Success" if passed else "Failed",
        test_result_value=values,
        result=message,
        failed_rows=verdict_total,
    )
    if not outcome.capped:
        record.passed_rows = outcome.unchanged
        if left_count is not None and left_count > 0:
            record.passed_rows_percentage = outcome.unchanged / left_count * 100
            record.failed_rows_percentage = verdict_total / left_count * 100
    return record


def _failed_schema_result(spec: DataDiffSpec, message: str, timestamp: int) -> TestCaseResultRecord:
    """A Failed record for a schema-level failure (key-type mismatch): the
    schema fields are known, no row counts exist yet."""
    values: list[dict[str, str]] = []
    if spec.schema_diff is not None:
        values.extend(
            [
                {"name": "removedColumns", "value": str(len(spec.schema_diff.removed))},
                {"name": "addedColumns", "value": str(len(spec.schema_diff.added))},
                {"name": "changedColumns", "value": str(len(spec.schema_diff.changed))},
                {"name": "schemaTable1", "value": spec.schema_diff.schema_table_1.render()},
                {"name": "schemaTable2", "value": spec.schema_diff.schema_table_2.render()},
            ]
        )
    return TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=timestamp,
        test_case_status="Failed",
        test_result_value=values,
        result=message,
    )


def run_data_diff_spec(
    spec: DataDiffSpec,
    *,
    left_binding: DataDiffBinding | None,
    right_binding: DataDiffBinding | None,
    default_connection: dict[str, Any],
    fetch_keys: Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None = None,
    fetch_rows: Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None = None,
    compute_counts: bool = True,
    left_source_type: str | None = None,
    right_source_type: str | None = None,
    schema_compared: bool = True,
    timestamp: int,
) -> TestCaseResultRecord:
    """Run one compiled data-diff spec and build its result.

    The single verdict implementation shared by the DataDiff workflow and
    the tableDiff validator (ADR:2026-11-08-validator-compile-table-diff-params):
    the official verdict formula (``(threshold or total) == 0 or total <
    threshold``), duplicate keys abort the case, an unbound dialect aborts
    it, and a column diff fails it. With no extra columns on either side
    the key-set comparison runs (Phase 1); with extra columns the chunked
    row engine runs (P2-1). ``schema_compared`` is False for inline specs,
    which carry no table metadata — the result then discloses that schema
    differences were not compared (Q-3 (a)).

    ADR:2026-11-11-table-diff-value-engine-chunked-row-comparison
    """
    if left_binding is None:
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=str(
                UnsupportedDialectError(
                    "left", left_source_type or spec.left.source_type or "unknown"
                )
            ),
        )
    if right_binding is None:
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=str(
                UnsupportedDialectError(
                    "right", right_source_type or spec.right.source_type or "unknown"
                )
            ),
        )
    left_side = build_side(
        left_binding,
        _side_connection(spec.left, default_connection),
        database=spec.left.database,
        schema=spec.left.schema,
        table=spec.left.table,
        key_columns=spec.left.key_columns,
    )
    right_side = build_side(
        right_binding,
        _side_connection(spec.right, default_connection),
        database=spec.right.database,
        schema=spec.right.schema,
        table=spec.right.table,
        key_columns=spec.right.key_columns,
    )
    key_mismatch = _key_type_mismatch(spec)
    if key_mismatch is not None:
        return _failed_schema_result(spec, key_mismatch, timestamp)
    has_column_diff = spec.schema_diff is not None and spec.schema_diff.has_diff()
    if not spec.left.extra_columns and not spec.right.extra_columns:
        left_keys = _fetch_keys_for(
            spec,
            spec.left,
            left_binding,
            left_side,
            default_connection=default_connection,
            fetch_keys=fetch_keys,
        )
        duplicate_side = spec.left if _has_duplicate_keys(left_keys) else None
        if duplicate_side is None:
            right_keys = _fetch_keys_for(
                spec,
                spec.right,
                right_binding,
                right_side,
                default_connection=default_connection,
                fetch_keys=fetch_keys,
            )
            duplicate_side = spec.right if _has_duplicate_keys(right_keys) else None
        if duplicate_side is not None:
            return _aborted_result(spec, duplicate_side, timestamp)
        diff = compare_key_sets(left_keys, right_keys)
        total = diff.total
        passed = (not has_column_diff) and (
            (spec.threshold or total) == 0 or total < spec.threshold
        )
        values: list[dict[str, str]] = [
            {"name": "removedRows", "value": str(diff.extra_left)},
            {"name": "addedRows", "value": str(diff.extra_right)},
            {"name": "diffCount", "value": str(total)},
        ]
        if has_column_diff and spec.schema_diff is not None:
            values.extend(
                [
                    {"name": "removedColumns", "value": str(len(spec.schema_diff.removed))},
                    {"name": "addedColumns", "value": str(len(spec.schema_diff.added))},
                    {"name": "changedColumns", "value": str(len(spec.schema_diff.changed))},
                    {"name": "schemaTable1", "value": spec.schema_diff.schema_table_1.render()},
                    {"name": "schemaTable2", "value": spec.schema_diff.schema_table_2.render()},
                ]
            )
        if has_column_diff:
            message = (
                f"Schema mismatch detected: {len(spec.schema_diff.removed)} removed, "
                f"{len(spec.schema_diff.added)} added, "
                f"{len(spec.schema_diff.changed)} changed columns. "
                f"Found {total} different keys (key-set comparison only: "
                f"{diff.extra_left} only in left table, {diff.extra_right} only in "
                "right table; row values are not compared)"
            )
        else:
            message = (
                f"Found {total} different keys (key-set comparison only: "
                f"{diff.extra_left} only in left table, {diff.extra_right} only in "
                f"right table; row-value and schema differences are not compared)"
            )
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Success" if passed else "Failed",
            test_result_value=values,
            result=message,
            passed_rows=diff.common,
            failed_rows=total,
        )
    # Row-value comparison (P2-1): chunked, two-pass, error-layered (§3.9).
    capped = (spec.threshold or 0) > 0 and not compute_counts
    if fetch_rows is not None:
        row_source: _LiveRowSource | _InjectedRowSource = _InjectedRowSource(
            spec, left_side, right_side, fetch_rows
        )
    else:
        row_source = _LiveRowSource(
            spec,
            left_binding,
            right_binding,
            default_connection,
            left_where=spec.where_clause,
            right_where=spec.where_clause,
        )
    try:
        with row_source:
            left_where, right_where, sample_disclosure = _resolve_sampling(
                spec,
                left_binding,
                right_binding,
                row_source,
                left_source_type=left_source_type or spec.left.source_type or "unknown",
                right_source_type=right_source_type or spec.right.source_type or "unknown",
            )
            row_source.set_where(left_where, right_where)
            outcome = _compare_rows(spec, row_source, capped=capped)
            _log_failed_sample(outcome)
            left_count = row_source.left_count() if not capped else None
    except DuplicateKeyError as exc:
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=str(exc),
        )
    except UnsupportedDialectError as exc:
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=str(exc),
        )
    except Exception as exc:
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=f"ERROR: Unexpected error while running the table diff test: {exc}",
        )
    return _build_row_result(
        spec,
        outcome,
        has_column_diff=has_column_diff,
        left_count=left_count,
        schema_compared=schema_compared,
        sample_disclosure=sample_disclosure,
        timestamp=timestamp,
    )
