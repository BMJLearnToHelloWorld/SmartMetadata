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

import math
import re
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from smartmetadata_ingestion.data_quality.sampling import (
    StaticSampleConfig,
    dataset_sql,
)
from smartmetadata_ingestion.errors import WorkflowError

ParamStyle = Literal["format", "qmark"]

# Dialect key driving the SQL rendering differences (official LenFn / StdDevFn /
# RegexpMatchFn compiles + SQLAlchemy ilike rendering, per the ADR). Each
# connector's CursorProfileReader passes exactly one of these. MariaDB and
# Doris are distinct keys from MySQL (same LENGTH/STDDEV/LIKE/REGEXP
# rendering) because their percentile compile differs: MySQL and Doris have
# one, MariaDB has none (ADR:2026-11-10-profiler-window-hybrid-metrics).
SqlDialect = Literal["postgres", "mysql", "mariadb", "doris", "mssql", "snowflake", "databricks"]

# Length function per dialect (official LenFn: LENGTH for MySQL-family and
# Databricks, LENGTH(CAST AS text) for Postgres, LEN for MSSQL/Snowflake).
_LENGTH_SQL: dict[SqlDialect, str] = {
    "postgres": "LENGTH(CAST({col} AS text))",
    "mysql": "LENGTH({col})",
    "mariadb": "LENGTH({col})",
    "doris": "LENGTH({col})",
    "mssql": "LEN({col})",
    "snowflake": "LEN({col})",
    "databricks": "LENGTH({col})",
}

# Population standard deviation per dialect (official StdDevFn: STDDEV_POP
# everywhere except MSSQL, which uses STDEVP).
_STDDEV_SQL: dict[SqlDialect, str] = {
    "postgres": "STDDEV_POP({col})",
    "mysql": "STDDEV_POP({col})",
    "mariadb": "STDDEV_POP({col})",
    "doris": "STDDEV_POP({col})",
    "mssql": "STDEVP({col})",
    "snowflake": "STDDEV_POP({col})",
    "databricks": "STDDEV_POP({col})",
}

# Dialects with no official percentile compile. Pin `profiler/orm/functions/
# median.py` HAS a MySQL ROW_NUMBER compile and a Doris `percentile_approx`
# compile; only MariaDB falls through to the default `percentile_cont`,
# which is not valid SQL there — so only MariaDB fails closed. The
# ``{"mysql", "mariadb", "doris"}`` set that used to sit here was wrong.
# ADR:2026-11-10-profiler-window-hybrid-metrics
MEDIAN_UNSUPPORTED_DIALECTS = frozenset({"mariadb"})


def percentile_sql(
    dialect: SqlDialect,
    column_sql: str,
    percentile: float,
    *,
    table_sql: str | None = None,
) -> str:
    """Render a percentile aggregate for the dialect (official MedianFn).

    Single shared source for the profiler and the median validator
    (``data_quality/sql.py::median_sql`` delegates here): the per-dialect
    table comes from pin ``profiler/orm/functions/median.py``. Snowflake
    and Databricks render approximate functions — callers must not assert
    exact values on those dialects. MariaDB has no official compile and
    fails closed; MySQL needs ``table_sql`` (the dataset source) for its
    ROW_NUMBER subquery.
    """
    if dialect == "mariadb":
        raise WorkflowError(
            "median/quartile metrics are not supported on MariaDB: "
            "the official MedianFn has no MariaDB compile"
        )
    if dialect == "snowflake":
        return f"approx_percentile({column_sql}, {percentile:.2f})"
    if dialect == "databricks":
        return f"percentile_approx({column_sql}, {percentile:.2f})"
    if dialect == "mssql":
        return f"percentile_cont({percentile:.2f}) WITHIN GROUP (ORDER BY {column_sql} ASC) OVER()"
    if dialect == "mysql":
        if table_sql is None:
            raise WorkflowError("MySQL percentile rendering needs the table (dataset) source")
        return (
            f"(SELECT _pct_col FROM (SELECT {column_sql} AS _pct_col, "
            f"ROW_NUMBER() OVER (ORDER BY {column_sql}) AS row_num, "
            f"COUNT(*) OVER () AS total_count FROM {table_sql}) temp "
            f"WHERE temp.row_num = ROUND({percentile:.2f} * temp.total_count))"
        )
    if dialect == "doris":
        return f"percentile_approx({column_sql}, {percentile:.2f})"
    return f"percentile_cont({percentile:.2f}) WITHIN GROUP (ORDER BY {column_sql} ASC)"


def value_rank_sql(column_sql: str) -> str:
    """Render the ValueRank window fragment (official ValueRankFn).

    Only used inside the cardinalityDistribution CTE: valueRank has no
    ColumnProfile field (pin and product ``table.json`` agree), so it never
    lands as a metric of its own.
    """
    return f"ROW_NUMBER() OVER (ORDER BY COUNT({column_sql}) DESC)"


def format_large_string_numbers(number: float | int) -> str:
    """Format a large number human-readably (official ``helpers.py``).

    1,000,000 -> ``"1.000M"``. One deliberate fix: the official magnitude is
    unclamped, so 0 < |n| < 1 indexes the units list with a negative
    magnitude (``0.25`` would label ``"250.000T"``); the magnitude is
    clamped at 0 here, so small numbers render plain (``"0.250"``).
    """
    if number == 0:
        return "0"
    magnitude = max(0, int(math.floor(math.log(abs(number), 1000.0))))
    units = ["", "K", "M", "B", "T"]
    if magnitude >= len(units):
        return f"{int(number / 1000.0**magnitude)}e{magnitude * 3}"
    return f"{number / 1000.0**magnitude:.3f}{units[magnitude]}"


def _format_bin_label(lower: float | None, upper: float | None = None) -> str:
    """Format a histogram bin label (official ``Histogram._format_bin_labels``)."""
    formatted_lower = "null" if lower is None else format_large_string_numbers(lower)
    if upper is None:
        return f"{formatted_lower} and up"
    return f"{formatted_lower} to {format_large_string_numbers(upper)}"


def _histogram_bins(
    iqr: float | None, row_count: int, res_min: float, res_max: float
) -> tuple[int, float]:
    """Bin count + width (official ``Histogram._get_bins``).

    Freedman-Diaconis first; when the IQR is missing or the bin count
    exceeds 100, fall back to Sturges; still over 100, cap at 100.
    """
    max_bin_count = 100
    if iqr is not None:
        bin_width = 1.0 if iqr == 0 else 2 * iqr * row_count ** (-1 / 3)
        num_bins = math.ceil((res_max - res_min) / bin_width)
    if iqr is None or num_bins > max_bin_count:
        num_bins = int(math.ceil(math.log2(row_count) + 1))
        bin_width = (res_max - res_min) / num_bins
    if num_bins > max_bin_count:
        num_bins = max_bin_count
        bin_width = (res_max - res_min) / num_bins
    return num_bins, bin_width


# Case-insensitive LIKE operator per dialect (official ilike: ILIKE where the
# engine supports it; plain LIKE where LIKE is already case-insensitive by
# collation, i.e. MySQL-family and MSSQL).
_ILIKE_OP: dict[SqlDialect, str] = {
    "postgres": "ILIKE",
    "mysql": "LIKE",
    "mariadb": "LIKE",
    "doris": "LIKE",
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
    "mariadb": "{col} REGEXP {ph}",
    "doris": "{col} REGEXP {ph}",
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


# Official ClickZetta data-diff dialect (ClickzettaDialect.quote): backticks,
# and identifiers must match ^[A-Za-z_][A-Za-z0-9_$]*$ — anything else is
# rejected, never escaped. ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
_CLICKZETTA_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


def quote_clickzetta(name: str) -> str:
    """Backtick identifier (ClickZetta)."""
    if not isinstance(name, str) or not _CLICKZETTA_IDENT.fullmatch(name):
        raise WorkflowError(f"unsafe ClickZetta identifier {name!r}")
    return f"`{name}`"


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
        sample_config: StaticSampleConfig | None = None,
    ) -> Sequence[Any]:
        ident = self._ident(database, schema, table)
        dataset = dataset_sql(self._dialect, ident, sample_config=sample_config)
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
            stats.append(
                self._profile_column(dataset, column_name, data_type, params=column_params)
            )
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
        dataset: str,
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
        if self._dialect not in MEDIAN_UNSUPPORTED_DIALECTS and (numeric or string):
            # Official window metrics (median / firstQuartile / thirdQuartile):
            # quantifiable columns direct, concatenable columns over their
            # length; other types resolve to None without failing the query.
            percentile_column = column if numeric else length
            add("median", percentile_sql(self._dialect, percentile_column, 0.5, table_sql=dataset))
            add(
                "first_quartile",
                percentile_sql(self._dialect, percentile_column, 0.25, table_sql=dataset),
            )
            add(
                "third_quartile",
                percentile_sql(self._dialect, percentile_column, 0.75, table_sql=dataset),
            )
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

        row = self._fetch_one(f"SELECT {', '.join(selects)} FROM {dataset}", tuple(sql_params))
        got = dict(zip(slots, row, strict=True)) if row else {}
        unique_count = self._unique_count(dataset, column, data_type)
        values_count = _as_int(got.get("values_count"))
        distinct_count = _as_int(got.get("distinct_count"))
        mean_value = _as_float(got.get("mean"))
        stddev_value = _as_float(got.get("stddev"))
        min_value = _typed_value(got.get("min_value"))
        max_value = _typed_value(got.get("max_value"))
        median = _as_float(got.get("median"))
        first_quartile = _as_float(got.get("first_quartile"))
        third_quartile = _as_float(got.get("third_quartile"))
        # Official composed metrics (IQR / NonParametricSkew): derived in
        # Python from the static results, never from a second data pass.
        inter_quartile_range = (
            third_quartile - first_quartile
            if first_quartile is not None and third_quartile is not None
            else None
        )
        non_parametric_skew = (
            (mean_value - median) / stddev_value
            if mean_value is not None
            and median is not None
            and stddev_value is not None
            and stddev_value != 0
            else None
        )
        histogram = (
            self._histogram(
                dataset, column, values_count, min_value, max_value, inter_quartile_range
            )
            if numeric
            else None
        )
        cardinality_distribution = (
            self._cardinality_distribution(dataset, column, values_count, distinct_count)
            if string
            else None
        )
        return self._stat_row(
            column_name=column_name,
            null_count=_as_int(got.get("null_count")),
            distinct_count=distinct_count,
            min_value=min_value,
            max_value=max_value,
            mean=mean_value,
            values_count=values_count,
            count_in_set=_as_int(got.get("count_in_set")),
            like_count=_as_int(got.get("like_count")),
            ilike_count=_as_int(got.get("ilike_count")),
            not_like_count=_as_int(got.get("not_like_count")),
            regex_count=_as_int(got.get("regex_count")),
            not_regex_count=_as_int(got.get("not_regex_count")),
            max_length=_as_int(got.get("max_length")),
            min_length=_as_int(got.get("min_length")),
            stddev=stddev_value,
            sum_value=_as_float(got.get("sum_value")),
            unique_count=unique_count,
            null_missing_count=_as_int(got.get("null_missing_count")),
            distinct_proportion=_proportion(distinct_count, values_count),
            unique_proportion=_capped_proportion(unique_count, values_count),
            null_proportion=_null_proportion(values_count, _as_int(got.get("null_count"))),
            duplicate_count=_difference(values_count, distinct_count),
            like_ratio=_proportion(_as_int(got.get("like_count")), values_count),
            ilike_ratio=_proportion(_as_int(got.get("ilike_count")), values_count),
            median=median,
            first_quartile=first_quartile,
            third_quartile=third_quartile,
            inter_quartile_range=inter_quartile_range,
            non_parametric_skew=non_parametric_skew,
            histogram=histogram,
            cardinality_distribution=cardinality_distribution,
        )

    def _unique_count(self, dataset: str, column: str, data_type: str | None) -> int | None:
        """Count of values appearing exactly once (official UniqueCount).

        One grouped subquery: ``SELECT COUNT(*) FROM (SELECT col ... GROUP BY
        col HAVING COUNT(*) = 1)``. NULLs group together like any other value,
        matching the official SQL shape.
        """
        if self._dialect == "mssql" and (data_type or "").lower() in (_MSSQL_UNGROUPABLE_TYPES):
            return None
        row = self._fetch_one(
            f"SELECT COUNT(*) FROM (SELECT {column} FROM {dataset} "
            f"GROUP BY {column} HAVING COUNT(*) = 1) AS only_once"
        )
        return _as_int(row[0]) if row else None

    def _histogram(
        self,
        dataset: str,
        column: str,
        values_count: int | None,
        min_value: Any,
        max_value: Any,
        iqr: float | None,
    ) -> dict[str, Any] | None:
        """Histogram over the dataset (official hybrid Histogram).

        One session query with one CASE per bin (at most 100). Only
        quantifiable columns; min/max NaN/inf resolve to None. The bin
        count/width follow ``_histogram_bins`` (Freedman-Diaconis, then
        Sturges, capped at 100); the last bin is lower-bound-only.
        """
        if values_count is None or values_count <= 0:
            return None
        if min_value is None or max_value is None:
            return None
        if not isinstance(min_value, (int, float)) or not isinstance(max_value, (int, float)):
            return None
        if isinstance(min_value, float) and (math.isnan(min_value) or math.isinf(min_value)):
            return None
        if isinstance(max_value, float) and (math.isnan(max_value) or math.isinf(max_value)):
            return None
        res_min, res_max = float(min_value), float(max_value)
        num_bins, bin_width = _histogram_bins(iqr, values_count, res_min, res_max)
        if num_bins == 0:
            return None
        labels: list[str] = []
        case_exprs: list[str] = []
        lower = res_min
        for bin_num in range(num_bins):
            upper = lower + bin_width
            if bin_num < num_bins - 1:
                label = _format_bin_label(lower, upper)
                case_exprs.append(
                    f"COUNT(CASE WHEN {column} >= {lower!r} AND {column} < {upper!r} "
                    f"THEN {column} END) AS {self._quote(label)}"
                )
            else:
                label = _format_bin_label(lower)
                case_exprs.append(
                    f"COUNT(CASE WHEN {column} >= {lower!r} THEN {column} END) "
                    f"AS {self._quote(label)}"
                )
            labels.append(label)
            lower = upper
        row = self._fetch_one(f"SELECT {', '.join(case_exprs)} FROM {dataset}")
        if not row:
            return None
        return {
            "boundaries": labels,
            "frequencies": [int(value) if value is not None else 0 for value in row],
        }

    def _cardinality_distribution(
        self,
        dataset: str,
        column: str,
        values_count: int | None,
        distinct_count: int | None,
    ) -> dict[str, Any] | None:
        """Cardinality distribution over the dataset (official hybrid).

        One GROUP BY query in three CTE stages: per-value counts ranked by
        the ValueRank fragment, low-frequency values folded into 'Others'
        (threshold 0 while distinct <= 20, else 2% of the total), then
        summed per category, ordered by count descending.
        """
        if values_count is None or values_count == 0:
            return None
        if values_count == distinct_count:
            return {"allValuesUnique": True}
        if distinct_count is not None and distinct_count <= 20:
            threshold: float | int = 0
        else:
            threshold = 0.02 * values_count
        rank = value_rank_sql(column)
        rank_alias = self._quote("valueRank")
        sum_alias = self._quote("sum")
        sql = (
            f"WITH value_counts AS (SELECT {column} AS category, "
            f"COUNT({column}) AS category_count, {rank} AS {rank_alias} "
            f"FROM {dataset} WHERE {column} IS NOT NULL GROUP BY {column}), "
            f"categories AS (SELECT CASE WHEN category_count >= {threshold!r} "
            f"OR {rank_alias} <= 5 THEN category ELSE 'Others' END AS category, "
            f"category_count FROM value_counts) "
            f"SELECT category, SUM(category_count) AS {sum_alias} FROM categories "
            f"GROUP BY category ORDER BY {sum_alias} DESC"
        )
        rows = self._fetch(sql)
        if not rows:
            return None
        categories = [row[0] for row in rows]
        counts = [int(row[1]) for row in rows]
        return {
            "categories": categories,
            "counts": counts,
            "percentages": [round(count / values_count * 100, 2) for count in counts],
        }

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
