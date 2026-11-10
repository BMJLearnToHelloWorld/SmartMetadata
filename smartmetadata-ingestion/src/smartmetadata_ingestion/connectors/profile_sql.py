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
The computed columns match the ``ProfileStatRow`` surface: the original six metrics
(row count / null count / distinct count / min / max / mean) plus the 21 extended
profiler metrics (15 static + 6 composed).
ADR:2026-11-08-profiler-extended-metrics-static-like-composed

Static metrics run as one aggregate SELECT per column (plus one grouped subquery
for ``uniqueCount``, mirroring the official QueryMetric shape); composed ratios
are derived in Python from the static results, never from a second data pass.
``min``/``max`` are written back typed (the driver value, JSON-safe normalized),
not stringified.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from smartmetadata_ingestion.errors import WorkflowError

ParamStyle = Literal["format", "qmark"]

# Dialect key driving the SQL rendering differences (official LenFn / StdDevFn /
# RegexpMatchFn compiles + SQLAlchemy ilike rendering, per the ADR). Each
# connector's CursorProfileReader passes exactly one of these.
SqlDialect = Literal["postgres", "mysql", "mssql", "snowflake", "databricks"]

# Length function per dialect (official LenFn: LENGTH for MySQL-family and
# Databricks, LENGTH(CAST AS text) for Postgres, LEN for MSSQL/Snowflake).
_LENGTH_SQL: dict[SqlDialect, str] = {
    "postgres": "LENGTH(CAST({col} AS text))",
    "mysql": "LENGTH({col})",
    "mssql": "LEN({col})",
    "snowflake": "LEN({col})",
    "databricks": "LENGTH({col})",
}

# Population standard deviation per dialect (official StdDevFn: STDDEV_POP
# everywhere except MSSQL, which uses STDEVP).
_STDDEV_SQL: dict[SqlDialect, str] = {
    "postgres": "STDDEV_POP({col})",
    "mysql": "STDDEV_POP({col})",
    "mssql": "STDEVP({col})",
    "snowflake": "STDDEV_POP({col})",
    "databricks": "STDDEV_POP({col})",
}

# Case-insensitive LIKE operator per dialect (official ilike: ILIKE where the
# engine supports it; plain LIKE where LIKE is already case-insensitive by
# collation, i.e. MySQL-family and MSSQL).
_ILIKE_OP: dict[SqlDialect, str] = {
    "postgres": "ILIKE",
    "mysql": "LIKE",
    "mssql": "LIKE",
    "snowflake": "ILIKE",
    "databricks": "ILIKE",
}

# Regex predicate per dialect (official RegexpMatchFn: `~` for Postgres via
# SQLAlchemy regexp_match, REGEXP for MySQL, REGEXP_LIKE for Databricks;
# Snowflake REGEXP_LIKE. MSSQL has no regex operator, so the metric is
# not computed there (None) instead of failing the column query.
_REGEX_SQL: dict[SqlDialect, str | None] = {
    "postgres": "{col} ~ {ph}",
    "mysql": "{col} REGEXP {ph}",
    "mssql": None,
    "snowflake": "REGEXP_LIKE({col}, {ph})",
    "databricks": "REGEXP_LIKE({col}, {ph})",
}

# Official RUNTIME_PROPS_METRICS: the parameterized static metrics. They only
# run when runtime props are supplied; without props they resolve to None,
# never to a hardcoded expression or value set.
PARAMETERIZED_METRICS: tuple[str, ...] = (
    "likeCount",
    "iLikeCount",
    "notLikeCount",
    "regexCount",
    "notRegexCount",
    "countInSet",
)

# Per-column runtime props, keyed by official metric name:
# {"likeCount": {"expression": "J%"}, "countInSet": {"values": ["a", "b"]}}.
ColumnMetricParams = Mapping[str, Mapping[str, Any]]
MetricParamsByColumn = Mapping[str, ColumnMetricParams]

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

# Substrings that mark a column type as string-like (LIKE / ILIKE / REGEXP /
# LENGTH apply). Matched case-insensitively against information_schema.
_STRING_TOKENS = (
    "char",
    "text",
    "string",
    "enum",
    "clob",
)

# MSSQL deprecated types that cannot appear in a GROUP BY (official
# UniqueCount keeps a dedicated MSSQL branch for them); uniqueCount is
# skipped for these instead of failing the column query.
_MSSQL_UNGROUPABLE_TYPES = frozenset({"text", "ntext", "image"})

# Characters that must never appear in an identifier: statement terminator,
# NUL and line breaks. The quote character itself is escaped by doubling.
_UNSAFE_IDENT_CHARS = frozenset({";", "\x00", "\n", "\r"})

# Scalar types a countInSet value may carry. Values are only ever sent as
# bound DB-API parameters, never interpolated into SQL text.
_SCALAR_TYPES = (str, int, float, bool)


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


def is_string_type(data_type: str | None) -> bool:
    lowered = (data_type or "").lower()
    return any(token in lowered for token in _STRING_TOKENS)


def _validate_column_params(
    column_name: str, params: ColumnMetricParams | None
) -> dict[str, dict[str, Any]]:
    """Validate one column's runtime props; fail fast on a bad shape.

    Unknown metric names, non-string expressions and non-scalar or empty
    value sets are configuration errors, not missing metrics: raising here
    keeps a typo from silently producing a partial profile.
    """
    if not params:
        return {}
    validated: dict[str, dict[str, Any]] = {}
    for metric, raw in params.items():
        if metric not in PARAMETERIZED_METRICS:
            raise WorkflowError(f"unknown metric parameter {metric!r} for column {column_name!r}")
        if not isinstance(raw, Mapping):
            raise WorkflowError(
                f"metric parameter {metric!r} for column {column_name!r} must be a mapping"
            )
        if metric == "countInSet":
            values = raw.get("values")
            if not isinstance(values, list) or not values:
                raise WorkflowError(
                    f"countInSet for column {column_name!r} requires a non-empty values list"
                )
            for value in values:
                if value is None or not isinstance(value, _SCALAR_TYPES):
                    raise WorkflowError(
                        f"countInSet for column {column_name!r} "
                        f"requires scalar values, got {value!r}"
                    )
            validated[metric] = {"values": list(values)}
        else:
            expression = raw.get("expression")
            if not isinstance(expression, str):
                raise WorkflowError(
                    f"{metric} for column {column_name!r} requires a string expression"
                )
            validated[metric] = {"expression": expression}
    return validated


class SqlProfileReader:
    """Live ``ProfileReader`` over a DB-API cursor factory.

    ``columns_sql`` uses ``{ph}`` for each filter placeholder; it is rendered
    with ``%s`` (``paramstyle="format"``) or ``?`` (``paramstyle="qmark"``).
    ``columns_params`` maps ``(database, schema, table)`` to the filter values
    in the order the placeholders appear. ``sample_template`` is formatted
    with ``{ident}`` and ``{limit}``. ``dialect`` selects the LIKE / ILIKE /
    REGEXP / LENGTH / STDDEV rendering for this engine.
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
        dialect: SqlDialect,
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
        self._dialect = dialect

    def profile(
        self,
        database: str | None,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
    ) -> Sequence[Any]:
        ident = self._ident(database, schema, table)
        row_count = self._fetch_scalar(f"SELECT COUNT(*) FROM {ident}")
        columns = self._fetch_columns(database, schema, table)
        stats = [
            self._stat_row(
                column_name=None,
                row_count=row_count,
                column_count=len(columns),
                column_names=[name for name, _ in columns],
            )
        ]
        for column_name, data_type in columns:
            column_params = (metric_params or {}).get(column_name)
            stats.append(self._profile_column(ident, column_name, data_type, params=column_params))
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

    def _profile_column(
        self,
        ident: str,
        column_name: str,
        data_type: str | None,
        *,
        params: ColumnMetricParams | None = None,
    ) -> Any:
        column = self._quote(column_name)
        numeric = is_numeric_type(data_type)
        string = is_string_type(data_type)
        length = _LENGTH_SQL[self._dialect].format(col=column)
        ph = self._placeholder
        validated = _validate_column_params(column_name, params)

        selects: list[str] = []
        slots: list[str] = []
        sql_params: list[Any] = []

        def add(slot: str, expr: str, *args: Any) -> None:
            selects.append(expr)
            slots.append(slot)
            sql_params.extend(args)

        add("null_count", f"COUNT(*) - COUNT({column})")
        add("distinct_count", f"COUNT(DISTINCT {column})")
        add("min_value", f"MIN({column})")
        add("max_value", f"MAX({column})")
        add("mean", f"AVG({column})" if numeric else "NULL")
        add("values_count", f"COUNT({column})")
        if string:
            add(
                "null_missing_count",
                f"SUM(CASE WHEN {column} IS NULL THEN 1 WHEN {column} = '' THEN 1 ELSE 0 END)",
            )
        else:
            add(
                "null_missing_count",
                f"SUM(CASE WHEN {column} IS NULL THEN 1 ELSE 0 END)",
            )
        if numeric:
            add("sum_value", f"SUM({column})")
            add("stddev", _STDDEV_SQL[self._dialect].format(col=column))
        elif string:
            # Official Sum/StdDev on a concatenable column aggregate its length.
            add("sum_value", f"SUM({length})")
            add("stddev", _STDDEV_SQL[self._dialect].format(col=length))
        else:
            add("sum_value", "NULL")
            add("stddev", "NULL")
        if string:
            add("max_length", f"MAX({length})")
            add("min_length", f"MIN({length})")
        else:
            add("max_length", "NULL")
            add("min_length", "NULL")
        if string:
            # LIKE / ILIKE / REGEXP are string predicates: on any other type
            # the metric resolves to None instead of failing the column query.
            if "likeCount" in validated:
                add(
                    "like_count",
                    f"SUM(CASE WHEN {column} LIKE {ph} THEN 1 ELSE 0 END)",
                    validated["likeCount"]["expression"],
                )
            if "iLikeCount" in validated:
                op = _ILIKE_OP[self._dialect]
                add(
                    "ilike_count",
                    f"SUM(CASE WHEN {column} {op} {ph} THEN 1 ELSE 0 END)",
                    validated["iLikeCount"]["expression"],
                )
            if "notLikeCount" in validated:
                # Official formula verbatim (pin not_like_count.py +
                # test_not_like_count): the CASE counts rows matching the
                # pattern (NULL rows included), not rows failing it.
                add(
                    "not_like_count",
                    f"SUM(CASE WHEN {column} NOT LIKE {ph} THEN 0 ELSE 1 END)",
                    validated["notLikeCount"]["expression"],
                )
            regex_sql = _REGEX_SQL[self._dialect]
            if regex_sql is not None:
                predicate = regex_sql.format(col=column, ph=ph)
                if "regexCount" in validated:
                    add(
                        "regex_count",
                        f"SUM(CASE WHEN {predicate} THEN 1 ELSE 0 END)",
                        validated["regexCount"]["expression"],
                    )
                if "notRegexCount" in validated:
                    # Same inverted official shape as notLikeCount.
                    add(
                        "not_regex_count",
                        f"SUM(CASE WHEN NOT ({predicate}) THEN 0 ELSE 1 END)",
                        validated["notRegexCount"]["expression"],
                    )
        if "countInSet" in validated:
            values = validated["countInSet"]["values"]
            placeholders = ", ".join(ph for _ in values)
            add(
                "count_in_set",
                f"SUM(CASE WHEN {column} IN ({placeholders}) THEN 1 ELSE 0 END)",
                *values,
            )

        row = self._fetch_one(f"SELECT {', '.join(selects)} FROM {ident}", tuple(sql_params))
        got = dict(zip(slots, row, strict=True)) if row else {}
        unique_count = self._unique_count(ident, column, data_type)
        values_count = _as_int(got.get("values_count"))
        distinct_count = _as_int(got.get("distinct_count"))
        return self._stat_row(
            column_name=column_name,
            null_count=_as_int(got.get("null_count")),
            distinct_count=distinct_count,
            min_value=_typed_value(got.get("min_value")),
            max_value=_typed_value(got.get("max_value")),
            mean=_as_float(got.get("mean")),
            values_count=values_count,
            count_in_set=_as_int(got.get("count_in_set")),
            like_count=_as_int(got.get("like_count")),
            ilike_count=_as_int(got.get("ilike_count")),
            not_like_count=_as_int(got.get("not_like_count")),
            regex_count=_as_int(got.get("regex_count")),
            not_regex_count=_as_int(got.get("not_regex_count")),
            max_length=_as_int(got.get("max_length")),
            min_length=_as_int(got.get("min_length")),
            stddev=_as_float(got.get("stddev")),
            sum_value=_as_float(got.get("sum_value")),
            unique_count=unique_count,
            null_missing_count=_as_int(got.get("null_missing_count")),
            distinct_proportion=_proportion(distinct_count, values_count),
            unique_proportion=_capped_proportion(unique_count, values_count),
            null_proportion=_null_proportion(values_count, _as_int(got.get("null_count"))),
            duplicate_count=_difference(values_count, distinct_count),
            like_ratio=_proportion(_as_int(got.get("like_count")), values_count),
            ilike_ratio=_proportion(_as_int(got.get("ilike_count")), values_count),
        )

    def _unique_count(self, ident: str, column: str, data_type: str | None) -> int | None:
        """Count of values appearing exactly once (official UniqueCount).

        One grouped subquery: ``SELECT COUNT(*) FROM (SELECT col ... GROUP BY
        col HAVING COUNT(*) = 1)``. NULLs group together like any other value,
        matching the official SQL shape.
        """
        if self._dialect == "mssql" and (data_type or "").lower() in (_MSSQL_UNGROUPABLE_TYPES):
            return None
        row = self._fetch_one(
            f"SELECT COUNT(*) FROM (SELECT {column} FROM {ident} "
            f"GROUP BY {column} HAVING COUNT(*) = 1) AS only_once"
        )
        return _as_int(row[0]) if row else None

    def _fetch_scalar(self, sql: str) -> int:
        row = self._fetch_one(sql)
        return int(row[0]) if row and row[0] is not None else 0

    def _fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> tuple[Any, ...]:
        rows = self._fetch(sql, params)
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


def _as_float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _typed_value(value: Any) -> Any:
    """Return a driver value typed for write-back, JSON-safe.

    ``min``/``max`` keep the column's type instead of being stringified:
    ints, floats, strings and bools pass through; Decimal becomes float;
    dates/times become ISO strings; bytes decode as UTF-8. Anything else
    falls back to ``str`` so the profile record stays JSON-serializable.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", "replace")
    return str(value)


def _proportion(part: int | None, total: int | None) -> float | None:
    """Official DistinctRatio / LikeRatio guard: None when no denominator."""
    if total and part is not None:
        return part / total
    return None


def _capped_proportion(part: int | None, total: int | None) -> float | None:
    """Official UniqueRatio: min(unique / count, 1), None when no denominator."""
    if total and part is not None:
        return min(part / total, 1)
    return None


def _null_proportion(values_count: int | None, null_count: int | None) -> float | None:
    """Official NullRatio: null / (values + null); None when the total is 0."""
    total = (values_count or 0) + (null_count or 0)
    if total == 0:
        return None
    return (null_count or 0) / total


def _difference(values_count: int | None, distinct_count: int | None) -> int | None:
    """Official DuplicateCount: values - distinct; None when either is None."""
    if values_count is not None and distinct_count is not None:
        return values_count - distinct_count
    return None
