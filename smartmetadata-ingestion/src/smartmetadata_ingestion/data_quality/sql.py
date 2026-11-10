# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Dialect-aware SQL compilation for data-quality validators.

The shapes mirror the official SQLAlchemy functions at pin ``a3012259ca``
(``RegexpMatchFn`` for regex, ``MedianFn`` for the median, the standard
aggregates elsewhere). The product has no SQLAlchemy profiler path, so each
validator compiles plain SQL strings executed through the existing scalar
DB-API callback; this module owns every dialect branch so no validator
carries its own.

ADR:2026-11-08-validator-compile-table-diff-params
"""

from __future__ import annotations

from typing import Any, cast

from smartmetadata_ingestion.connectors.profile_sql import (
    SqlDialect,
    percentile_sql,
    quote_ansi,
    quote_mssql,
    quote_mysql,
)
from smartmetadata_ingestion.data_quality.models import TableRef
from smartmetadata_ingestion.errors import WorkflowError

# Dialects whose tables are addressed as ``database.table`` (two parts);
# every other dialect takes ``database.schema.table``.
TWO_PART_DIALECTS = frozenset({"mysql", "mariadb", "doris"})

# Dialect aliases for the shared percentile renderer in
# ``connectors/profile_sql.py`` (the single shared source for the profiler
# and the validators). Pin ``profiler/orm/functions/median.py`` HAS a MySQL
# ROW_NUMBER compile and a Doris ``percentile_approx`` compile; only
# MariaDB falls through to the default ``percentile_cont``, which is not
# valid SQL there — so only MariaDB fails closed.
# ADR:2026-11-10-profiler-window-hybrid-metrics
_DIALECT_ALIASES = {
    "greenplum": "postgres",
    "timescale": "postgres",
    "redshift": "postgres",
    "unitycatalog": "databricks",
}


def quote_ident(dialect: str, name: str) -> str:
    """Quote one identifier for the dialect."""
    if dialect in {"mssql"}:
        return quote_mssql(name)
    if dialect in {"mysql", "mariadb", "doris", "databricks", "unitycatalog"}:
        return quote_mysql(name)
    return quote_ansi(name)


def table_sql(dialect: str, table: TableRef) -> str:
    """Render a fully qualified table reference for the dialect."""
    if dialect in TWO_PART_DIALECTS:
        return f"{quote_ident(dialect, table.database)}.{quote_ident(dialect, table.table)}"
    return (
        f"{quote_ident(dialect, table.database)}"
        f".{quote_ident(dialect, table.schema)}"
        f".{quote_ident(dialect, table.table)}"
    )


def literal(value: Any) -> str:
    """Render a parameter value as a SQL literal.

    Numbers render plain (validated by the caller's parse), strings are
    single-quote-escaped, booleans become ``TRUE``/``FALSE``. Values come
    from server-authored test definitions — the same trust level as the
    existing config-supplied ``expression`` — never from UI input at run
    time (ADR:2026-11-08-validator-compile-table-diff-params).
    """
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def literal_list(values: list[Any]) -> str:
    return "(" + ", ".join(literal(value) for value in values) + ")"


def regex_match_sql(dialect: str, column_sql: str, pattern_sql: str) -> str:
    """Render ``column matches pattern`` for the dialect.

    Mirrors official ``RegexpMatchFn``: ``~`` on the Postgres family,
    ``REGEXP`` on the MySQL family, ``REGEXP_LIKE`` on Snowflake /
    Databricks / Unity Catalog, and the official ``LIKE`` fallback on
    MSSQL (the test definition itself documents that fallback).
    """
    if dialect in {"postgres", "greenplum", "timescale", "redshift"}:
        return f"{column_sql} ~ {pattern_sql}"
    if dialect in {"mysql", "mariadb", "doris"}:
        return f"{column_sql} REGEXP {pattern_sql}"
    if dialect in {"snowflake", "databricks", "unitycatalog"}:
        return f"REGEXP_LIKE({column_sql}, {pattern_sql})"
    if dialect == "mssql":
        return f"{column_sql} LIKE {pattern_sql}"
    raise WorkflowError(f"regex validators have no compiled form for dialect {dialect!r}")


def median_sql(dialect: str, column_sql: str, *, table_sql: str | None = None) -> str:
    """Render the median aggregate for the dialect (official ``MedianFn``).

    Delegates to the shared percentile renderer in
    ``connectors/profile_sql.py``; MySQL rendering needs ``table_sql``
    (the dataset source) for its ROW_NUMBER subquery.
    """
    rendered_dialect = cast(SqlDialect, _DIALECT_ALIASES.get(dialect, dialect))
    return percentile_sql(rendered_dialect, column_sql, 0.5, table_sql=table_sql)


def stddev_sql(dialect: str, column_sql: str) -> str:
    if dialect == "mssql":
        return f"STDEV({column_sql})"
    return f"STDDEV({column_sql})"


def length_sql(dialect: str, column_sql: str) -> str:
    if dialect == "mssql":
        return f"LEN({column_sql})"
    return f"CHAR_LENGTH({column_sql})"
