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
(``data_diff.diff_tables``) compares full row values; this module only
compares key sets (added / removed rows). Changed-row, schema-diff and
sampling comparisons are a later phase — never implied by the result.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
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
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord


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


DATA_DIFF_BINDINGS: dict[str, DataDiffBinding] = {
    "databricks": DataDiffBinding(
        databricks_data_diff.DatabricksTableParameter,
        databricks_data_diff.DatabricksDataDiff,
        databricks_common.databricks_connect,
        databricks_common.quote_ident,
        "three",
        "catalog",
    ),
    "mssql": DataDiffBinding(
        mssql_data_diff.MssqlTableParameter,
        mssql_data_diff.MssqlDataDiff,
        mssql_common.mssql_connect,
        quote_mssql,
        "three",
    ),
    "mysql": DataDiffBinding(
        mysql_data_diff.MysqlTableParameter,
        mysql_data_diff.MysqlDataDiff,
        mysql_common.mysql_connect,
        quote_mysql,
        "two",
    ),
    "postgres": DataDiffBinding(
        postgres_data_diff.PostgresTableParameter,
        postgres_data_diff.PostgresDataDiff,
        postgres_common.postgres_connect,
        quote_ansi,
        "three",
    ),
    "snowflake": DataDiffBinding(
        snowflake_data_diff.SnowflakeTableParameter,
        snowflake_data_diff.SnowflakeDataDiff,
        snowflake_common.snowflake_connect,
        quote_ansi,
        "three",
    ),
    # Unity Catalog reuses the Databricks execution surface.
    "unitycatalog": DataDiffBinding(
        unitycatalog_data_diff.UnityCatalogTableParameter,
        unitycatalog_data_diff.UnityCatalogDataDiff,
        databricks_common.databricks_connect,
        databricks_common.quote_ident,
        "three",
        "catalog",
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
    ),
    # P2-5: Azure SQL is SQL Server over TDS (official groups Mssql +
    # AzureSQL as one dialect family; dialect stays "mssql").
    "azuresql": DataDiffBinding(
        azuresql_data_diff.AzureSQLTableParameter,
        azuresql_data_diff.AzureSQLDataDiff,
        azuresql_common.azuresql_connect,
        quote_mssql,
        "three",
    ),
    # P2-5: ClickZetta tables are addressed schema.table; the side's
    # database segment is the workspace.
    "clickzetta": DataDiffBinding(
        clickzetta_data_diff.ClickzettaTableParameter,
        clickzetta_data_diff.ClickzettaDataDiff,
        clickzetta_common.clickzetta_connect,
        quote_clickzetta,
        "two",
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
        if self._ident_style == "two":
            parts = (schema, table)
        else:
            if not database:
                raise WorkflowError("database is required to qualify a table")
            parts = (database, schema, table)
        return ".".join(self._quote(part) for part in parts)

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


def _aborted_result(
    spec: DataDiffSpec, side_spec: DataDiffSideSpec, timestamp: int
) -> TestCaseResultRecord:
    key_columns = side_spec.key_columns
    if len(key_columns) == 1:
        subject = f"Key column '{key_columns[0]}' is"
    else:
        subject = f"Key columns ({', '.join(repr(column) for column in key_columns)}) are"
    location = f"in {side_spec.database}.{side_spec.schema}.{side_spec.table}"
    return TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=timestamp,
        test_case_status="Aborted",
        result=(
            f"{subject} not unique {location}. A row-level diff needs a unique key: "
            "pick a unique column, or add more columns to the key."
        ),
    )


def _has_duplicate_keys(keys: list[tuple[Any, ...]]) -> bool:
    return len(keys) != len(set(keys))


def run_data_diff_spec(
    spec: DataDiffSpec,
    *,
    left_binding: DataDiffBinding,
    right_binding: DataDiffBinding,
    default_connection: dict[str, Any],
    fetch_keys: Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None = None,
    timestamp: int,
) -> TestCaseResultRecord:
    """Run one compiled data-diff spec (key-set comparison) and build its result.

    The single verdict implementation shared by the DataDiff workflow and
    the tableDiff validator (ADR:2026-11-08-validator-compile-table-diff-params):
    the official verdict formula (``(threshold or total) == 0 or total <
    threshold``), duplicate keys abort the case, and only the fields the
    key-set engine actually computes are written (``removedRows`` /
    ``addedRows`` / ``diffCount`` plus the key-set-only disclosure).
    """
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
    passed = (spec.threshold or total) == 0 or total < spec.threshold
    return TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=timestamp,
        test_case_status="Success" if passed else "Failed",
        test_result_value=[
            {"name": "removedRows", "value": str(diff.extra_left)},
            {"name": "addedRows", "value": str(diff.extra_right)},
            {"name": "diffCount", "value": str(total)},
        ],
        result=(
            f"Found {total} different keys (key-set comparison only: "
            f"{diff.extra_left} only in left table, {diff.extra_right} only in "
            f"right table; row-value and schema differences are not compared)"
        ),
        passed_rows=diff.common,
        failed_rows=total,
    )
