# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared live SQL profile reader.

One parameterized implementation behind every connector's ``CursorProfileReader``:
the per-connector ``*_common`` module only supplies its dialect (identifier quoting,
placeholder style, the ``information_schema.columns`` query and the sample template).
The computed columns match the existing ``ProfileStatRow`` surface exactly
(row count / null count / distinct count / min / max / mean) — no new metrics.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, Literal

from smartmetadata_ingestion.errors import WorkflowError

ParamStyle = Literal["format", "qmark"]

# Substrings that mark a column type as numeric (AVG applies). Matched
# case-insensitively against the ``data_type`` reported by information_schema.
_NUMERIC_TOKENS = (
    "int",
    "bigint",
    "smallint",
    "tinyint",
    "decimal",
    "numeric",
    "float",
    "double",
    "real",
    "number",
    "money",
    "serial",
)

# Characters that must never appear in an identifier: statement terminator,
# NUL and line breaks. The quote character itself is escaped by doubling.
_UNSAFE_IDENT_CHARS = frozenset({";", "\x00", "\n", "\r"})


def _check_ident(name: str) -> str:
    if not name or any(char in _UNSAFE_IDENT_CHARS for char in name):
        raise WorkflowError(f"unsafe identifier {name!r}")
    return name


def quote_ansi(name: str) -> str:
    """Double-quote identifier (Postgres family, Snowflake)."""
    return '"' + _check_ident(name).replace('"', '""') + '"'


def quote_mysql(name: str) -> str:
    """Backtick identifier (MySQL family, Databricks / Spark SQL)."""
    return "`" + _check_ident(name).replace("`", "``") + "`"


def quote_mssql(name: str) -> str:
    """Bracket identifier (SQL Server)."""
    return "[" + _check_ident(name).replace("]", "]]") + "]"


def is_numeric_type(data_type: str | None) -> bool:
    lowered = (data_type or "").lower()
    return any(token in lowered for token in _NUMERIC_TOKENS)


class SqlProfileReader:
    """Live ``ProfileReader`` over a DB-API cursor factory.

    ``columns_sql`` uses ``{ph}`` for each filter placeholder; it is rendered
    with ``%s`` (``paramstyle="format"``) or ``?`` (``paramstyle="qmark"``).
    ``columns_params`` maps ``(database, schema, table)`` to the filter values
    in the order the placeholders appear. ``sample_template`` is formatted
    with ``{ident}`` and ``{limit}``.
    """

    def __init__(
        self,
        connect: Callable[[], Any],
        *,
        quote: Callable[[str], str],
        paramstyle: ParamStyle,
        columns_sql: str,
        columns_params: Callable[[str | None, str, str], tuple[Any, ...]],
        sample_template: str,
        ident_style: Literal["two", "three"],
        stat_row: Callable[..., Any],
        sample_row: Callable[..., Any],
    ) -> None:
        self._connect = connect
        self._quote = quote
        self._placeholder = "%s" if paramstyle == "format" else "?"
        self._columns_sql = columns_sql.format(ph=self._placeholder)
        self._columns_params = columns_params
        self._sample_template = sample_template
        self._ident_style = ident_style
        self._stat_row = stat_row
        self._sample_row = sample_row

    def profile(self, database: str | None, schema: str, table: str) -> Sequence[Any]:
        ident = self._ident(database, schema, table)
        row_count = self._fetch_scalar(f"SELECT COUNT(*) FROM {ident}")
        columns = self._fetch_columns(database, schema, table)
        stats = [self._stat_row(column_name=None, row_count=row_count)]
        for column_name, data_type in columns:
            stats.append(self._profile_column(ident, column_name, data_type))
        return stats

    def sample(
        self, database: str | None, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[Any]:
        ident = self._ident(database, schema, table)
        sql = self._sample_template.format(ident=ident, limit=int(limit))
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                names = [col[0] for col in (cursor.description or [])]
                return [
                    self._sample_row(values={names[i]: row[i] for i in range(len(names))})
                    for row in cursor.fetchall()
                ]
            finally:
                cursor.close()

    def _ident(self, database: str | None, schema: str, table: str) -> str:
        if self._ident_style == "two":
            parts = (schema, table)
        else:
            if not database:
                raise WorkflowError("database is required to qualify a table")
            parts = (database, schema, table)
        return ".".join(self._quote(part) for part in parts)

    def _fetch_columns(
        self, database: str | None, schema: str, table: str
    ) -> list[tuple[str, str | None]]:
        rows = self._fetch(self._columns_sql, self._columns_params(database, schema, table))
        return [(str(row[0]), row[1] if len(row) > 1 else None) for row in rows]

    def _profile_column(self, ident: str, column_name: str, data_type: str | None) -> Any:
        column = self._quote(column_name)
        selects = [
            f"COUNT(*) - COUNT({column})",
            f"COUNT(DISTINCT {column})",
            f"MIN({column})",
            f"MAX({column})",
        ]
        numeric = is_numeric_type(data_type)
        if numeric:
            selects.append(f"AVG({column})")
        row = self._fetch_one(f"SELECT {', '.join(selects)} FROM {ident}")
        mean = None
        if numeric and len(row) > 4 and row[4] is not None:
            mean = float(row[4])
        return self._stat_row(
            column_name=column_name,
            null_count=_as_int(row[0]),
            distinct_count=_as_int(row[1]),
            min_value=_as_text(row[2]),
            max_value=_as_text(row[3]),
            mean=mean,
        )

    def _fetch_scalar(self, sql: str) -> int:
        row = self._fetch_one(sql)
        return int(row[0]) if row and row[0] is not None else 0

    def _fetch_one(self, sql: str) -> tuple[Any, ...]:
        rows = self._fetch(sql)
        return tuple(rows[0]) if rows else ()

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


def _as_int(value: Any) -> int | None:
    return int(value) if value is not None else None


def _as_text(value: Any) -> str | None:
    return None if value is None else str(value)
