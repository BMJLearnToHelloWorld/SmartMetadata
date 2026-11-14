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
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from smartmetadata_ingestion.data_quality.sampling import (
    StaticSampleConfig,
    dataset_sql,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import ProfileRecord

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

# The metric vocabulary: ``metricType`` enum of
# ``configuration/profilerConfiguration.json`` (36 values). A pipeline
# ``metrics`` entry outside this set is a configuration error, never a
# silently skipped name.
METRIC_TYPE_NAMES: frozenset[str] = frozenset(
    {
        "mean",
        "valuesCount",
        "countInSet",
        "columnCount",
        "distinctCount",
        "distinctProportion",
        "iLikeCount",
        "likeCount",
        "notLikeCount",
        "regexCount",
        "notRegexCount",
        "max",
        "maxLength",
        "min",
        "minLength",
        "nullCount",
        "rowCount",
        "stddev",
        "sum",
        "uniqueCount",
        "uniqueProportion",
        "columnNames",
        "duplicateCount",
        "iLikeRatio",
        "likeRatio",
        "nullProportion",
        "interQuartileRange",
        "nonParametricSkew",
        "median",
        "firstQuartile",
        "thirdQuartile",
        "system",
        "histogram",
        "cardinalityDistribution",
        "valueRank",
        "nullMissingCount",
    }
)

# Table-level metrics: computed once per table, not per column.
# ``columnNames`` has no TableProfile field in either schema copy and the
# pin's write-back never maps it, so selecting it changes nothing
# observable — it is accepted (it is a real metric name) and its value,
# the column listing, stays on the table stat row.
TABLE_METRIC_NAMES: frozenset[str] = frozenset({"rowCount", "columnCount", "columnNames"})

# ``system`` is not a column metric: it selects system profiles, which no
# dialect has a wired computer for (bounded residual — requesting it fails
# loud at workflow prepare). ``valueRank`` never lands as a metric of its
# own; it only ranks values inside the cardinalityDistribution CTE.
SYSTEM_METRIC = "system"
VALUE_RANK_METRIC = "valueRank"

# Composed/hybrid metrics and the static metrics they are derived from.
# A selected composed metric pulls its prerequisites into the effective
# set (the closure below), and the write-back carries that effective set:
# selecting distinctProportion also writes distinctCount and valuesCount,
# as the pin's unfiltered write-back does — the pin writes every computed
# result, never filtering back to the requested names. The run computes
# what is selected, plus exactly the inputs those selections need, never
# a second data pass.
_METRIC_DEPENDENCIES: dict[str, frozenset[str]] = {
    "distinctProportion": frozenset({"distinctCount", "valuesCount"}),
    "uniqueProportion": frozenset({"uniqueCount", "valuesCount"}),
    "nullProportion": frozenset({"nullCount", "valuesCount"}),
    "duplicateCount": frozenset({"valuesCount", "distinctCount"}),
    "likeRatio": frozenset({"likeCount", "valuesCount"}),
    "iLikeRatio": frozenset({"iLikeCount", "valuesCount"}),
    "interQuartileRange": frozenset({"firstQuartile", "thirdQuartile"}),
    "nonParametricSkew": frozenset({"mean", "median", "stddev"}),
    "histogram": frozenset({"min", "max", "interQuartileRange", "valuesCount"}),
    "cardinalityDistribution": frozenset({"valuesCount", "distinctCount"}),
}


def metric_closure(selected: frozenset[str] | None) -> frozenset[str] | None:
    """Expand a selected metric set with its derivation prerequisites.

    ``None`` means "all metrics" (an empty pipeline ``metrics`` list) and
    stays ``None``. Unknown names are rejected here too: a set that
    reached the reader was already validated, and a second line of
    defence keeps a typo from silently computing nothing.
    """
    if selected is None:
        return None
    unknown = sorted(selected - METRIC_TYPE_NAMES)
    if unknown:
        raise WorkflowError(f"unknown profiler metric(s): {', '.join(unknown)}")
    closure = set(selected)
    pending = list(selected)
    while pending:
        metric = pending.pop()
        for prerequisite in _METRIC_DEPENDENCIES.get(metric, ()):
            if prerequisite not in closure:
                closure.add(prerequisite)
                pending.append(prerequisite)
    return frozenset(closure)


def validate_pipeline_metrics(metrics: Sequence[str]) -> frozenset[str] | None:
    """Validate the pipeline ``metrics`` list: empty means "compute all"
    (the schema's rule), otherwise every name must be a known metric."""
    if not metrics:
        return None
    return metric_closure(frozenset(metrics))

# Per-column runtime props, keyed by official metric name:
# {"likeCount": {"expression": "J%"}, "countInSet": {"values": ["a", "b"]}}.
ColumnMetricParams = Mapping[str, Mapping[str, Any]]
MetricParamsByColumn = Mapping[str, ColumnMetricParams]


@dataclass(frozen=True, slots=True)
class PartitionFilter:
    """One resolved partition scope: the predicate applied to the dataset.

    ``time_unit`` scopes to rows at or after a cutoff the planner computed
    from the current time minus the configured interval (the pin's
    ``col >= now - interval`` filter, with the cutoff bound as a parameter
    instead of dialect date arithmetic). ``integer_range`` scopes to the
    configured start/end bounds; ``column_value`` to the listed values.
    """

    column: str
    kind: Literal["time_unit", "integer_range", "column_value"]
    cutoff: Any | None = None
    range_start: int | None = None
    range_end: int | None = None
    values: tuple[Any, ...] = ()


@dataclass(frozen=True, slots=True)
class CustomMetricRequest:
    """One registered custom metric: a SQL expression returning a single
    numerical value, evaluated over the profiler dataset. ``column_name``
    binds it to a column profile; ``None`` binds it to the table profile
    (the ``customMetric`` schema shape)."""

    name: str
    column_name: str | None
    expression: str


@dataclass(frozen=True)
class ProfileOptions:
    """The resolved per-table profiler plan, as the reader consumes it.

    Built by ``profiler_plan`` from the pipeline knobs, the table entity's
    ``tableProfilerConfig``/``customMetrics``, and the global
    ``ProfilerConfiguration``. ``metrics=None`` means "all metrics" (the
    schema's empty-list rule); per-column entries of ``None`` likewise.
    A reader called without options keeps the legacy behavior: every
    metric, both toggles on, no sampling/partition/query beyond the
    explicit ``sample_config`` argument.
    """

    metrics: frozenset[str] | None = None
    per_column_metrics: Mapping[str, frozenset[str] | None] = field(default_factory=dict)
    compute_table_metrics: bool = True
    compute_column_metrics: bool = True
    include_columns: frozenset[str] | None = None
    exclude_columns: frozenset[str] = frozenset()
    sample_resolver: Callable[[int], StaticSampleConfig | None] | None = None
    partition: PartitionFilter | None = None
    profile_query: str | None = None
    custom_metrics: tuple[CustomMetricRequest, ...] = ()
    randomized: bool = False


# Table-size / creation-time queries, one per engine family that exposes
# both through a stable system catalog. Each returns one row
# ``(size_in_bytes, create_time)`` and uses ``{ph}`` placeholders in the
# order its connector's ``table_stats_params`` supplies. Engines without
# an entry (Redshift, Doris, Databricks/UnityCatalog) have no verified
# query: their readers pass no stats SQL and the fields stay ``None`` —
# a bounded residual per dialect, never a guessed query.
# MySQL/MariaDB: information_schema.tables carries both columns.
MYSQL_TABLE_STATS_SQL = (
    "SELECT data_length + index_length, create_time FROM information_schema.tables "
    "WHERE table_schema = {ph} AND table_name = {ph}"
)
# Postgres family: pg_total_relation_size takes the qualified relation
# name; Postgres keeps no creation time, so the second column is NULL.
POSTGRES_TABLE_STATS_SQL = "SELECT pg_total_relation_size({ph}), NULL"
# Snowflake: information_schema.tables carries BYTES and CREATED.
SNOWFLAKE_TABLE_STATS_SQL = (
    "SELECT bytes, created FROM information_schema.tables "
    "WHERE table_catalog = {ph} AND table_schema = {ph} AND table_name = {ph}"
)
# MSSQL: allocation-unit pages summed per table (8 KiB pages) + create_date.
MSSQL_TABLE_STATS_SQL = (
    "SELECT (SELECT SUM(a.total_pages) * 8192 FROM sys.partitions AS p "
    "JOIN sys.allocation_units AS a ON p.partition_id = a.container_id "
    "WHERE p.object_id = t.object_id), t.create_date "
    "FROM sys.tables AS t JOIN sys.schemas AS s ON t.schema_id = s.schema_id "
    "WHERE s.name = {ph} AND t.name = {ph}"
)

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
        table_stats_sql: str | None = None,
        table_stats_params: Callable[[str | None, str, str], tuple[Any, ...]] | None = None,
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
        self._table_stats_sql = (
            table_stats_sql.format(ph=self._placeholder) if table_stats_sql else None
        )
        self._table_stats_params = table_stats_params

    def profile(
        self,
        database: str | None,
        schema: str,
        table: str,
        *,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> Sequence[Any]:
        opts = options or ProfileOptions()
        metrics = metric_closure(opts.metrics)
        ident = self._ident(database, schema, table)
        # The row count runs on the whole table even under sampling (the
        # pin's rule), and DYNAMIC tier resolution needs it too — but a
        # run that selected neither rowCount nor a resolver skips the
        # COUNT(*) entirely instead of paying for an unreported number.
        needs_row_count = (
            metrics is None or "rowCount" in metrics or opts.sample_resolver is not None
        )
        row_count = self._fetch_scalar(f"SELECT COUNT(*) FROM {ident}") if needs_row_count else None
        resolved_sample = (
            opts.sample_resolver(row_count)
            if opts.sample_resolver is not None and row_count is not None
            else None
        )
        # The plan resolver wins over the legacy explicit sample config:
        # the plan already folds the config-file fallback into its own
        # precedence chain, so letting the explicit argument win would
        # shadow the table entity's and pipeline's sampling choices.
        effective_sample = (
            resolved_sample
            if opts.sample_resolver is not None
            else sample_config
        )
        dataset, dataset_params = self._dataset(
            ident,
            effective_sample,
            partition=opts.partition,
            profile_query=opts.profile_query,
            randomized=opts.randomized,
        )
        columns = self._fetch_columns_for_dataset(
            database, schema, table, profile_query=opts.profile_query
        )
        profiled_columns = [
            (name, data_type)
            for name, data_type in columns
            if (opts.include_columns is None or name in opts.include_columns)
            and name not in opts.exclude_columns
        ]
        size_in_byte, create_date_time = self._fetch_table_stats(
            database, schema, table
        ) if opts.compute_table_metrics else (None, None)
        # Custom metrics follow their level's toggle: table-bound customs
        # are table metrics, column-bound customs are column metrics.
        active_customs = tuple(
            metric
            for metric in opts.custom_metrics
            if (metric.column_name is None and opts.compute_table_metrics)
            or (metric.column_name is not None and opts.compute_column_metrics)
        )
        custom_results = self._compute_custom_metrics(
            dataset,
            dataset_params,
            active_customs,
            profiled_names={name for name, _ in profiled_columns},
        )
        # The table row always exists: it carries the dataset metadata
        # (column listing, resolved sample, stats) even when table
        # metrics are off — only rowCount/columnCount are gated.
        stats: list[Any] = [
            self._stat_row(
                column_name=None,
                row_count=(
                    row_count
                    if opts.compute_table_metrics and (metrics is None or "rowCount" in metrics)
                    else None
                ),
                column_count=(
                    len(columns)
                    if opts.compute_table_metrics and (metrics is None or "columnCount" in metrics)
                    else None
                ),
                column_names=[name for name, _ in columns],
                size_in_byte=size_in_byte,
                create_date_time=create_date_time,
                profile_sample=(
                    effective_sample.profile_sample if effective_sample is not None else None
                ),
                profile_sample_type=(
                    _sample_type_name(effective_sample) if effective_sample is not None else None
                ),
                custom_metrics=custom_results.get(None) or None,
            )
        ]
        column_stats: list[Any] = []
        if opts.compute_column_metrics:
            for column_name, data_type in profiled_columns:
                column_params = (metric_params or {}).get(column_name)
                column_metrics = metric_closure(
                    opts.per_column_metrics.get(column_name, metrics)
                )
                if column_metrics is not None and not column_metrics:
                    # Every metric filtered out for this column (e.g. the
                    # global config disables its data type): no query, no
                    # profile entry — the pin drops such columns from the
                    # results the same way.
                    continue
                if column_metrics is not None and column_metrics <= (
                    TABLE_METRIC_NAMES | {VALUE_RANK_METRIC}
                ):
                    # A set naming only table metrics (or valueRank, which
                    # only ranks values inside the cardinality CTE) selects
                    # no column computation: no query, no profile entry —
                    # the same outcome the plan resolver produces for a
                    # cataloged table by stripping table metrics from the
                    # column set. Without this, an uncataloged table falls
                    # back to the pipeline set and reaches the column query
                    # with an empty SELECT list.
                    continue
                column_stats.append(
                    self._profile_column(
                        dataset,
                        dataset_params,
                        column_name,
                        data_type,
                        params=column_params,
                        metrics=column_metrics,
                        custom_metrics=custom_results.get(column_name) or None,
                    )
                )
        stats.extend(column_stats)
        if (
            not opts.compute_table_metrics
            and not column_stats
            and not custom_results
        ):
            # The pin's empty-profile guard: a run that computed nothing
            # (both toggles off, or every column filtered out) fails the
            # table loudly instead of writing an empty profile.
            raise WorkflowError(
                f"no profile data computed for {schema}.{table}: "
                "table and column metrics are both disabled or no columns remain"
            )
        return stats

    def _dataset(
        self,
        ident: str,
        sample_config: StaticSampleConfig | None,
        *,
        partition: PartitionFilter | None,
        profile_query: str | None,
        randomized: bool,
    ) -> tuple[str, tuple[Any, ...]]:
        """Render the dataset FROM source and its bound parameters.

        A user query defines the dataset whole: sampling and partition
        scoping do not apply to it. Otherwise the partition scope applies
        first (the sample is drawn from the scoped rows), except on
        Snowflake, where TABLESAMPLE can only attach to the base table —
        there the sample is taken first and the partition predicate wraps
        it. Partition values are always bound parameters, never
        interpolated: a COLUMN-VALUE list comes from stored config.
        """
        if profile_query:
            return f"({profile_query}) AS _sample", ()
        predicate, params = self._partition_predicate(partition) if partition else ("", ())
        if not partition:
            return (
                dataset_sql(
                    self._dialect, ident, sample_config=sample_config, randomized=randomized
                ),
                (),
            )
        if self._dialect == "snowflake":
            sampled = dataset_sql(
                self._dialect, ident, sample_config=sample_config, randomized=randomized
            )
            return f"(SELECT * FROM {sampled} WHERE {predicate}) AS _partition", params
        scoped = f"(SELECT * FROM {ident} WHERE {predicate}) AS _partition"
        return (
            dataset_sql(
                self._dialect, scoped, sample_config=sample_config, randomized=randomized
            ),
            params,
        )

    def _partition_predicate(self, partition: PartitionFilter) -> tuple[str, tuple[Any, ...]]:
        column = self._quote(partition.column)
        ph = self._placeholder
        if partition.kind == "column_value":
            placeholders = ", ".join(ph for _ in partition.values)
            return f"{column} IN ({placeholders})", tuple(partition.values)
        if partition.kind == "integer_range":
            return (
                f"{column} BETWEEN {ph} AND {ph}",
                (partition.range_start, partition.range_end),
            )
        return f"{column} >= {ph}", (partition.cutoff,)

    def _fetch_columns_for_dataset(
        self,
        database: str | None,
        schema: str,
        table: str,
        *,
        profile_query: str | None,
    ) -> list[tuple[str, str | None]]:
        """Column names + types for the dataset.

        Normally the table's cataloged columns. Under a user query the
        dataset's own columns win (names from the query's cursor
        description), with types looked up from the catalog by name — a
        query column the catalog does not know keeps no type, so its
        type-gated metrics resolve to None instead of failing.
        """
        cataloged = self._fetch_columns(database, schema, table)
        if not profile_query:
            return cataloged
        types = {name: data_type for name, data_type in cataloged}
        names = self._fetch_query_column_names(profile_query)
        if not names:
            raise WorkflowError("profileQuery returned no columns to profile")
        return [(name, types.get(name)) for name in names]

    def _fetch_query_column_names(self, query: str) -> list[str]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(query)
                return [str(col[0]) for col in (cursor.description or [])]
            finally:
                cursor.close()

    def _fetch_table_stats(
        self, database: str | None, schema: str, table: str
    ) -> tuple[int | None, str | None]:
        """Table size + creation time, when the dialect exposes them.

        Dialects without a stats query report ``(None, None)``: the
        fields stay unset rather than guessed.
        """
        if self._table_stats_sql is None or self._table_stats_params is None:
            return None, None
        row = self._fetch_one(
            self._table_stats_sql, self._table_stats_params(database, schema, table)
        )
        if not row:
            return None, None
        size = row[0]
        created = _typed_value(row[1]) if len(row) > 1 else None
        return (
            int(size) if size is not None else None,
            str(created) if created is not None else None,
        )

    def _compute_custom_metrics(
        self,
        dataset: str,
        dataset_params: tuple[Any, ...],
        custom_metrics: tuple[CustomMetricRequest, ...],
        *,
        profiled_names: set[str],
    ) -> dict[str | None, list[dict[str, Any]]]:
        """Evaluate each registered custom metric over the dataset.

        One scalar query per metric; the expression is server-stored
        user SQL (the ``customMetric`` schema shape), evaluated as the
        SELECT list over the dataset. A metric bound to a column that is
        not being profiled is a configuration error, not a skipped
        metric. Results group by binding: ``None`` for table-level.
        """
        results: dict[str | None, list[dict[str, Any]]] = {}
        for metric in custom_metrics:
            if metric.column_name is not None and metric.column_name not in profiled_names:
                raise WorkflowError(
                    f"custom metric {metric.name!r} binds to column "
                    f"{metric.column_name!r}, which is not profiled"
                )
            row = self._fetch_one(
                f"SELECT {metric.expression} FROM {dataset}", dataset_params
            )
            value = _as_float(row[0]) if row else None
            results.setdefault(metric.column_name, []).append(
                {"name": metric.name, "value": value}
            )
        return results

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
        dataset_params: tuple[Any, ...],
        column_name: str,
        data_type: str | None,
        *,
        params: ColumnMetricParams | None = None,
        metrics: frozenset[str] | None = None,
        custom_metrics: list[dict[str, Any]] | None = None,
    ) -> Any:
        column = self._quote(column_name)
        numeric = is_numeric_type(data_type)
        string = is_string_type(data_type)
        length = _LENGTH_SQL[self._dialect].format(col=column)
        ph = self._placeholder
        validated = _validate_column_params(column_name, params)
        # ``metrics`` is the closure (selected names + derivation inputs):
        # SQL runs only for names in it, so a run computes what is
        # selected. ``None`` means every metric, the legacy behavior.
        def wanted(name: str) -> bool:
            return metrics is None or name in metrics

        selects: list[str] = []
        slots: list[str] = []
        sql_params: list[Any] = []

        def add(slot: str, expr: str, *args: Any) -> None:
            selects.append(expr)
            slots.append(slot)
            sql_params.extend(args)

        if wanted("nullCount"):
            add("null_count", f"COUNT(*) - COUNT({column})")
        if wanted("distinctCount"):
            add("distinct_count", f"COUNT(DISTINCT {column})")
        if wanted("min"):
            add("min_value", f"MIN({column})")
        if wanted("max"):
            add("max_value", f"MAX({column})")
        if wanted("mean"):
            add("mean", f"AVG({column})" if numeric else "NULL")
        if wanted("valuesCount"):
            add("values_count", f"COUNT({column})")
        if wanted("nullMissingCount"):
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
        if wanted("sum"):
            if numeric:
                add("sum_value", f"SUM({column})")
            elif string:
                # Official Sum/StdDev on a concatenable column aggregate its length.
                add("sum_value", f"SUM({length})")
            else:
                add("sum_value", "NULL")
        if wanted("stddev"):
            if numeric:
                add("stddev", _STDDEV_SQL[self._dialect].format(col=column))
            elif string:
                add("stddev", _STDDEV_SQL[self._dialect].format(col=length))
            else:
                add("stddev", "NULL")
        if (
            self._dialect not in MEDIAN_UNSUPPORTED_DIALECTS
            and (numeric or string)
            and (wanted("median") or wanted("firstQuartile") or wanted("thirdQuartile"))
        ):
            # Official window metrics (median / firstQuartile / thirdQuartile):
            # quantifiable columns direct, concatenable columns over their
            # length; other types resolve to None without failing the query.
            percentile_column = column if numeric else length
            if wanted("median"):
                add(
                    "median",
                    percentile_sql(self._dialect, percentile_column, 0.5, table_sql=dataset),
                )
            if wanted("firstQuartile"):
                add(
                    "first_quartile",
                    percentile_sql(self._dialect, percentile_column, 0.25, table_sql=dataset),
                )
            if wanted("thirdQuartile"):
                add(
                    "third_quartile",
                    percentile_sql(self._dialect, percentile_column, 0.75, table_sql=dataset),
                )
        if wanted("maxLength"):
            add("max_length", f"MAX({length})" if string else "NULL")
        if wanted("minLength"):
            add("min_length", f"MIN({length})" if string else "NULL")
        if string:
            # LIKE / ILIKE / REGEXP are string predicates: on any other type
            # the metric resolves to None instead of failing the column query.
            if "likeCount" in validated and wanted("likeCount"):
                add(
                    "like_count",
                    f"SUM(CASE WHEN {column} LIKE {ph} THEN 1 ELSE 0 END)",
                    validated["likeCount"]["expression"],
                )
            if "iLikeCount" in validated and wanted("iLikeCount"):
                op = _ILIKE_OP[self._dialect]
                add(
                    "ilike_count",
                    f"SUM(CASE WHEN {column} {op} {ph} THEN 1 ELSE 0 END)",
                    validated["iLikeCount"]["expression"],
                )
            if "notLikeCount" in validated and wanted("notLikeCount"):
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
                if "regexCount" in validated and wanted("regexCount"):
                    add(
                        "regex_count",
                        f"SUM(CASE WHEN {predicate} THEN 1 ELSE 0 END)",
                        validated["regexCount"]["expression"],
                    )
                if "notRegexCount" in validated and wanted("notRegexCount"):
                    # Same inverted official shape as notLikeCount.
                    add(
                        "not_regex_count",
                        f"SUM(CASE WHEN NOT ({predicate}) THEN 0 ELSE 1 END)",
                        validated["notRegexCount"]["expression"],
                    )
        if "countInSet" in validated and wanted("countInSet"):
            values = validated["countInSet"]["values"]
            placeholders = ", ".join(ph for _ in values)
            add(
                "count_in_set",
                f"SUM(CASE WHEN {column} IN ({placeholders}) THEN 1 ELSE 0 END)",
                *values,
            )

        # Dataset parameters come after the SELECT-list parameters: the
        # dataset subquery sits in the FROM clause, textually after them.
        # An empty SELECT list (e.g. only uniqueCount was selected, which
        # runs its own grouped query below) never renders: the slots stay
        # unset and the independently gated queries still run.
        if selects:
            row = self._fetch_one(
                f"SELECT {', '.join(selects)} FROM {dataset}",
                tuple(sql_params) + dataset_params,
            )
            got = dict(zip(slots, row, strict=True)) if row else {}
        else:
            got = {}
        unique_count = (
            self._unique_count(dataset, dataset_params, column, data_type)
            if wanted("uniqueCount")
            else None
        )
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
                dataset,
                dataset_params,
                column,
                values_count,
                min_value,
                max_value,
                inter_quartile_range,
            )
            if numeric and wanted("histogram")
            else None
        )
        cardinality_distribution = (
            self._cardinality_distribution(
                dataset, dataset_params, column, values_count, distinct_count
            )
            if string and wanted("cardinalityDistribution")
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
            custom_metrics=custom_metrics,
        )

    def _unique_count(
        self, dataset: str, dataset_params: tuple[Any, ...], column: str, data_type: str | None
    ) -> int | None:
        """Count of values appearing exactly once (official UniqueCount).

        One grouped subquery: ``SELECT COUNT(*) FROM (SELECT col ... GROUP BY
        col HAVING COUNT(*) = 1)``. NULLs group together like any other value,
        matching the official SQL shape.
        """
        if self._dialect == "mssql" and (data_type or "").lower() in (_MSSQL_UNGROUPABLE_TYPES):
            return None
        row = self._fetch_one(
            f"SELECT COUNT(*) FROM (SELECT {column} FROM {dataset} "
            f"GROUP BY {column} HAVING COUNT(*) = 1) AS only_once",
            dataset_params,
        )
        return _as_int(row[0]) if row else None

    def _histogram(
        self,
        dataset: str,
        dataset_params: tuple[Any, ...],
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
        row = self._fetch_one(f"SELECT {', '.join(case_exprs)} FROM {dataset}", dataset_params)
        if not row:
            return None
        return {
            "boundaries": labels,
            "frequencies": [int(value) if value is not None else 0 for value in row],
        }

    def _cardinality_distribution(
        self,
        dataset: str,
        dataset_params: tuple[Any, ...],
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
        rows = self._fetch(sql, dataset_params)
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


def _sample_type_name(sample: StaticSampleConfig) -> str:
    """The schema spelling of a resolved sample's type: the runner spells
    the row-count type ``ROW_COUNT``, the schema spells it ``ROWS``."""
    return "ROWS" if sample.sample_type == "ROW_COUNT" else "PERCENTAGE"


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


# Column-profile field per metric name: the 31 computed fields the runner
# writes back, keyed by the official metric name, valued by the stat-row
# attribute. One table drives every connector's mapping, so a field can
# never drift between dialects.
_COLUMN_FIELD_BY_METRIC: dict[str, str] = {
    "nullCount": "null_count",
    "distinctCount": "distinct_count",
    "min": "min_value",
    "max": "max_value",
    "mean": "mean",
    "valuesCount": "values_count",
    "countInSet": "count_in_set",
    "likeCount": "like_count",
    "iLikeCount": "ilike_count",
    "notLikeCount": "not_like_count",
    "regexCount": "regex_count",
    "notRegexCount": "not_regex_count",
    "maxLength": "max_length",
    "minLength": "min_length",
    "stddev": "stddev",
    "sum": "sum_value",
    "uniqueCount": "unique_count",
    "nullMissingCount": "null_missing_count",
    "distinctProportion": "distinct_proportion",
    "uniqueProportion": "unique_proportion",
    "nullProportion": "null_proportion",
    "duplicateCount": "duplicate_count",
    "likeRatio": "like_ratio",
    "iLikeRatio": "ilike_ratio",
    "median": "median",
    "firstQuartile": "first_quartile",
    "thirdQuartile": "third_quartile",
    "interQuartileRange": "inter_quartile_range",
    "nonParametricSkew": "non_parametric_skew",
    "histogram": "histogram",
    "cardinalityDistribution": "cardinality_distribution",
}


def build_profile_record(
    stats: Sequence[Any],
    *,
    service: str,
    database: str,
    schema: str,
    table: str,
    timestamp: int,
    options: ProfileOptions | None = None,
    system_profile: Sequence[dict[str, Any]] = (),
) -> ProfileRecord:
    """Map stat rows to the full ``TableProfile`` write-back shape.

    The table profile always carries timestamp, executionSource (the
    physical target, or ``None`` when a user query defined the dataset —
    the pin's rule), profileSample/profileSampleType (the type defaults
    to PERCENTAGE when nothing was sampled, as the pin's does), sizeInByte,
    createDateTime, and customMetrics; rowCount/columnCount appear only
    when computed (table metrics on and the metric selected). Column
    profiles carry name, timestamp, executionSource, and the effective
    metric set — the selected names plus the derivation prerequisites the
    closure pulled in, so selecting distinctProportion also writes
    distinctCount and valuesCount (the pin writes every computed result
    without filtering back to the requested names). Names outside the
    effective set are omitted, never written as ``None`` — plus
    customMetrics when the column has any. ``columnNames``
    is deliberately not written: no TableProfile field exists for it in
    either schema copy and the pin's write-back never maps it.
    """
    opts = options or ProfileOptions()
    table_stat = next((s for s in stats if s.column_name is None), None)
    execution_source: dict[str, Any] | None = None
    if not opts.profile_query:
        execution_source = {
            "databaseName": database,
            "schemaName": schema,
            "tableName": table,
        }
    table_profile: dict[str, Any] = {
        "timestamp": timestamp,
        "executionSource": execution_source,
        "profileSample": getattr(table_stat, "profile_sample", None),
        "profileSampleType": getattr(table_stat, "profile_sample_type", None) or "PERCENTAGE",
        "sizeInByte": getattr(table_stat, "size_in_byte", None),
        "createDateTime": getattr(table_stat, "create_date_time", None),
        "customMetrics": getattr(table_stat, "custom_metrics", None),
    }
    if table_stat is not None:
        if table_stat.row_count is not None:
            table_profile["rowCount"] = table_stat.row_count
        if table_stat.column_count is not None:
            table_profile["columnCount"] = table_stat.column_count
    column_profile: list[dict[str, Any]] = []
    for stat in stats:
        if not stat.column_name:
            continue
        selected = opts.per_column_metrics.get(stat.column_name, opts.metrics)
        if selected is not None and not selected:
            # Every metric filtered out for this column: no entry, the
            # same outcome as the reader skipping the column outright.
            continue
        entry: dict[str, Any] = {
            "name": stat.column_name,
            "timestamp": timestamp,
            "executionSource": execution_source,
        }
        for metric, attr in _COLUMN_FIELD_BY_METRIC.items():
            if selected is None or metric in selected:
                entry[metric] = getattr(stat, attr)
        custom_metrics = getattr(stat, "custom_metrics", None)
        if custom_metrics:
            entry["customMetrics"] = list(custom_metrics)
        column_profile.append(entry)
    fqn = build_fqn(service, database, schema, table)
    return ProfileRecord(
        entity_type="table",
        fqn=fqn,
        profile_type="table",
        timestamp=timestamp,
        profile_data=dict(table_profile),
        table_profile=table_profile,
        column_profile=column_profile,
        system_profile=list(system_profile),
    )
