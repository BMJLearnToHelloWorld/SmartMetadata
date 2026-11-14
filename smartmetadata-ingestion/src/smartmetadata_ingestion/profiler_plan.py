# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Resolve per-table profiler plans from pipeline knobs + table entity.

Pure resolution: the pipeline ``SourceConfig`` knobs, the table entity's
``tableProfilerConfig``/``customMetrics``/``tags``/``tablePartition``,
and the global ``ProfilerConfiguration`` settings combine into one
``ProfilerTablePlan`` per table, which the workflow turns into reader
``ProfileOptions``. Nothing here touches a database or the network, so
every precedence rule is unit-testable from the schemas.

Precedence follows the pin's observable rules (verified against pin
behavior, implemented fresh here): the table entity's config overrides
the pipeline config; the global metric configuration filters first and
the table's per-column config second; an explicitly disabled partitioning
shadows auto-detection; sampling resolves table > pipeline > config-file
fallback. Every plumbed knob is honored here or rejected loudly at
prepare time — nothing is silently dropped.
ADR:2026-11-14-agent-capability-batch1
"""

from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from smartmetadata_ingestion.config import ProfileSampleConfig, SourceConfig
from smartmetadata_ingestion.connectors.profile_sql import (
    METRIC_TYPE_NAMES,
    SYSTEM_METRIC,
    TABLE_METRIC_NAMES,
    CustomMetricRequest,
    PartitionFilter,
    ProfileOptions,
    validate_pipeline_metrics,
)
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.data_quality.sampling import (
    StaticSampleConfig,
    resolve_dict_sample_config,
)
from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)

# The pin profiler interface clamps user thread counts to [1, 20]
# (MAX_THREADS); the fork applies the same bound so a runaway thread
# count cannot exhaust the source's connection pool.
MAX_PROFILE_THREADS = 20

# Column metric names: everything except the table-level metrics and the
# system selector. ``valueRank`` stays: it is harmless in a column set
# (the reader only uses it inside the cardinality CTE, never standalone).
_COLUMN_METRIC_NAMES: frozenset[str] = frozenset(
    METRIC_TYPE_NAMES - TABLE_METRIC_NAMES - {SYSTEM_METRIC}
)

# Partition-column data types, per the pin's auto-detection sets: only a
# temporal column trusts a TIME-UNIT report, only an integer column trusts
# an INTEGER-RANGE report — several engines report every partition key as
# TIME-UNIT even for integer/string keys.
_TIME_PARTITION_DATA_TYPES = frozenset({"DATE", "DATETIME", "TIMESTAMP", "TIMESTAMPZ"})
_INTEGER_PARTITION_DATA_TYPES = frozenset(
    {
        "TINYINT",
        "SMALLINT",
        "INT",
        "BIGINT",
        "BYTEINT",
        "LONG",
        "NUMBER",
        "NUMERIC",
        "DECIMAL",
    }
)

# Auto-detected TIME-UNIT windows, sized so even lagging tables yield
# non-empty samples: HOUR covers 24h, DAY covers 3 days, MONTH/YEAR exceed
# one full period. Unknown granularities fall back to 3 days.
_GRANULARITY_WINDOWS: dict[str, tuple[str, int]] = {
    "HOUR": ("HOUR", 24),
    "DAY": ("DAY", 3),
    "MONTH": ("DAY", 35),
    "YEAR": ("DAY", 370),
}

# Auto-detected INTEGER-RANGE bounds when the partition metadata carries
# no range of its own.
_DEFAULT_INTEGER_RANGE_START = 1
_DEFAULT_INTEGER_RANGE_END = 10000

_PARTITION_INTERVAL_UNITS = frozenset({"YEAR", "MONTH", "DAY", "HOUR"})

# Interval types the dataset predicate supports. INGESTION-TIME, ENUM,
# OTHER, and INJECTED have no predicate shape here: an explicit config
# naming one fails the table loudly instead of profiling unscoped.
_SUPPORTED_INTERVAL_TYPES = frozenset({"TIME-UNIT", "INTEGER-RANGE", "COLUMN-VALUE"})


@dataclass(frozen=True)
class SamplingPlan:
    """The sampling inputs for one table, in precedence order.

    The table entity's ``profileSampleConfig`` wins over the pipeline's,
    which wins over the config-file fallback. A level that is present
    wins even when it resolves to "no sampling": an explicit table-level
    choice (including an empty STATIC tier) overrides the pipeline, it
    does not fall through to it.
    """

    table_config: dict[str, Any] | None = None
    pipeline_config: ProfileSampleConfig | None = None
    fallback: StaticSampleConfig | None = None

    def resolve(self, row_count: int) -> StaticSampleConfig | None:
        if self.table_config is not None:
            return resolve_dict_sample_config(self.table_config, row_count)
        if self.pipeline_config is not None:
            return resolve_dict_sample_config(
                _dump_sample_config(self.pipeline_config), row_count
            )
        return self.fallback


def _dump_sample_config(config: ProfileSampleConfig) -> dict[str, Any]:
    """A typed pipeline sample config as the raw dict the shared resolver
    consumes. A DYNAMIC config with no arm takes the schema default
    (smart sampling on); a STATIC config with no arm has no sample value
    and resolves to no sampling."""
    dumped: dict[str, Any] = {"sampleConfigType": config.sample_config_type}
    if config.config is not None:
        dumped["config"] = config.config.model_dump(by_alias=True, exclude_none=True)
    elif config.sample_config_type == "DYNAMIC":
        dumped["config"] = {"smartSampling": True}
    return dumped


@dataclass(frozen=True)
class ProfilerTablePlan:
    """The resolved decisions for profiling one table."""

    metrics: frozenset[str] | None
    per_column_metrics: dict[str, frozenset[str] | None]
    compute_table_metrics: bool
    compute_column_metrics: bool
    include_columns: frozenset[str] | None
    exclude_columns: frozenset[str]
    sampling: SamplingPlan
    partition: PartitionFilter | None
    profile_query: str | None
    custom_metrics: tuple[CustomMetricRequest, ...]
    randomized: bool

    def to_options(self) -> ProfileOptions:
        return ProfileOptions(
            metrics=self.metrics,
            per_column_metrics=dict(self.per_column_metrics),
            compute_table_metrics=self.compute_table_metrics,
            compute_column_metrics=self.compute_column_metrics,
            include_columns=self.include_columns,
            exclude_columns=self.exclude_columns,
            sample_resolver=self.sampling.resolve,
            partition=self.partition,
            profile_query=self.profile_query,
            custom_metrics=self.custom_metrics,
            randomized=self.randomized,
        )


def validate_pipeline_config(source: SourceConfig) -> None:
    """Reject profiler pipeline configs the runner cannot honor.

    Spark has no runner, stored statistics have no implementation, and
    system profiles have no wired computer: each fails loudly here, at
    prepare time, instead of running a silently partial Native pass.
    Unknown metric names are configuration errors, never skipped names.
    """
    engine = source.processing_engine
    if engine is not None and engine.type == "Spark":
        raise WorkflowError(
            "profiler processingEngine 'Spark' has no runner; "
            "only the Native engine is supported"
        )
    if source.use_statistics:
        raise WorkflowError(
            "profiler useStatistics is not supported: no stored-statistics "
            "path exists, metrics are always computed live"
        )
    if source.timeout_seconds is not None and source.timeout_seconds <= 0:
        raise WorkflowError("profiler timeoutSeconds must be positive")
    metrics = validate_pipeline_metrics(source.metrics)
    if metrics is not None and SYSTEM_METRIC in metrics:
        raise WorkflowError(
            "profiler metric 'system' is not supported: no dialect has a "
            "wired system-profile computer (Redshift's is injectable-only)"
        )


def clamp_thread_count(thread_count: int | None) -> int | None:
    """Clamp a requested thread count to the pin's [1, 20] bound.

    ``None`` stays ``None`` (sequential execution). Callers compare the
    result with the request to warn when clamping changed anything.
    """
    if thread_count is None:
        return None
    return max(1, min(thread_count, MAX_PROFILE_THREADS))


def table_passes_classification_filter(
    source: SourceConfig, entity: dict[str, Any] | None
) -> bool:
    """Whether a table passes ``classificationFilterPattern``.

    Tag names match by default, tag FQNs when ``useFqnForFiltering`` —
    the pin's rule, which is what makes the AutoPilot Profiler Agent's
    Tier1/Tier2 scope match tags named ``Tier1``/``Tier2``. A table with
    no tags (or no catalog entity yet) passes only when the include list
    is empty: no tag can match a non-empty scope.
    """
    includes = source.include_classifications
    excludes = source.exclude_classifications
    if not includes and not excludes:
        return True
    tags = (entity or {}).get("tags") or []
    names = [_tag_match_name(tag, source.use_fqn_for_filtering) for tag in tags]
    names = [name for name in names if name]
    if any(not is_selected(name, include=[], exclude=excludes) for name in names):
        return False
    if not includes:
        return True
    return any(is_selected(name, include=includes, exclude=[]) for name in names)


def _tag_match_name(tag: Any, use_fqn: bool) -> str | None:
    if not isinstance(tag, dict):
        return None
    fqn = tag.get("tagFQN")
    if use_fqn:
        return fqn if isinstance(fqn, str) else None
    name = tag.get("name")
    if isinstance(name, str) and name:
        return name
    if isinstance(fqn, str) and fqn:
        return fqn.rsplit(".", 1)[-1].strip('"')
    return None


def resolve_table_plan(
    source: SourceConfig,
    entity: dict[str, Any] | None,
    global_settings: dict[str, Any] | None,
    *,
    fallback_sample: StaticSampleConfig | None = None,
    now: datetime | None = None,
) -> ProfilerTablePlan:
    """Resolve one table's plan from the pipeline knobs + entity + global
    config. ``entity=None`` means the table is not cataloged yet: only
    pipeline knobs apply, and the table-level overrides are absent."""
    table_config = _table_profiler_config(entity)
    entity_columns = _entity_columns(entity)
    metrics = validate_pipeline_metrics(source.metrics)
    per_column_metrics = {
        name: _resolve_column_metrics(
            name,
            data_type,
            pipeline_metrics=metrics,
            global_settings=global_settings,
            table_config=table_config,
        )
        for name, data_type in entity_columns.items()
    }
    include_columns, exclude_columns = _resolve_column_scope(table_config)
    current = now or datetime.now(timezone.utc)
    return ProfilerTablePlan(
        metrics=metrics,
        per_column_metrics=per_column_metrics,
        compute_table_metrics=_toggle(
            table_config, "computeTableMetrics", source.compute_table_metrics
        ),
        compute_column_metrics=_toggle(
            table_config, "computeColumnMetrics", source.compute_column_metrics
        ),
        include_columns=include_columns,
        exclude_columns=exclude_columns,
        sampling=SamplingPlan(
            table_config=_table_sample_config(table_config),
            pipeline_config=source.profile_sample_config,
            fallback=fallback_sample,
        ),
        partition=_resolve_partition(table_config, entity, source, now=current),
        profile_query=_profile_query(table_config),
        custom_metrics=_parse_custom_metrics(entity),
        randomized=bool(source.randomized_sample)
        or bool(table_config.get("randomizedSample") if table_config else False),
    )


def _table_profiler_config(entity: dict[str, Any] | None) -> dict[str, Any] | None:
    if not entity:
        return None
    config = entity.get("tableProfilerConfig")
    if config is None:
        return None
    if not isinstance(config, dict):
        raise WorkflowError("tableProfilerConfig must be an object")
    return config


def _table_sample_config(
    table_config: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not table_config:
        return None
    config = table_config.get("profileSampleConfig")
    if config is None:
        return None
    if not isinstance(config, dict):
        raise WorkflowError("tableProfilerConfig.profileSampleConfig must be an object")
    return config


def _entity_columns(entity: dict[str, Any] | None) -> dict[str, str | None]:
    """Top-level cataloged columns: name -> OM data type (upper-cased for
    global-config matching). Nested STRUCT children are not separate
    profiled columns."""
    columns: dict[str, str | None] = {}
    for column in (entity or {}).get("columns") or []:
        if not isinstance(column, dict):
            continue
        name = column.get("name")
        if not isinstance(name, str) or not name:
            continue
        data_type = column.get("dataType")
        columns[name] = data_type.upper() if isinstance(data_type, str) else None
    return columns


def _toggle(
    table_config: dict[str, Any] | None, key: str, pipeline_value: bool
) -> bool:
    if table_config and table_config.get(key) is not None:
        return bool(table_config[key])
    return pipeline_value


def _profile_query(table_config: dict[str, Any] | None) -> str | None:
    if not table_config:
        return None
    query = table_config.get("profileQuery")
    if not isinstance(query, str):
        return None
    stripped = query.strip()
    return stripped or None


def _resolve_column_scope(
    table_config: dict[str, Any] | None,
) -> tuple[frozenset[str] | None, frozenset[str]]:
    """Column membership from include/exclude lists.

    ``includeColumns`` restricts profiling to its named columns; an entry
    named ``all`` means every column (its metrics apply to all). Excludes
    win over includes. Nameless entries are inert.
    """
    include: frozenset[str] | None = None
    if table_config:
        names = {
            str(entry["columnName"])
            for entry in table_config.get("includeColumns") or []
            if isinstance(entry, dict) and entry.get("columnName")
        }
        if names:
            include = None if "all" in names else frozenset(names)
    exclude = frozenset(
        str(name)
        for name in (table_config.get("excludeColumns") or [] if table_config else [])
        if isinstance(name, str) and name
    )
    if include is not None:
        include = frozenset(name for name in include if name not in exclude)
    return include, exclude


def _resolve_column_metrics(
    column_name: str,
    data_type: str | None,
    *,
    pipeline_metrics: frozenset[str] | None,
    global_settings: dict[str, Any] | None,
    table_config: dict[str, Any] | None,
) -> frozenset[str] | None:
    """One column's effective metric set: pipeline set, restricted to
    column metrics, filtered by the global config first and the table's
    per-column config second (the pin MetricFilter order). ``None`` means
    "all column metrics"."""
    current = (
        frozenset(pipeline_metrics & _COLUMN_METRIC_NAMES)
        if pipeline_metrics is not None
        else None
    )
    current = _apply_global_config(current, data_type, global_settings)
    if current is not None and not current:
        return frozenset()
    return _apply_table_config(current, column_name, table_config)


def _apply_global_config(
    current: frozenset[str] | None,
    data_type: str | None,
    global_settings: dict[str, Any] | None,
) -> frozenset[str] | None:
    """Filter by the global ProfilerConfiguration's per-data-type entries.

    No config, no entries, no entry for the type, or an entry that is
    neither disabled nor metric-listed: the set passes through. A
    ``disabled`` entry empties the set. Otherwise the set intersects the
    entry's metric list. An unmappable column type passes through: with
    no OM data type there is nothing to match an entry against.
    """
    if global_settings is None or data_type is None:
        return current
    config_value = global_settings.get("configValue")
    entries = (
        config_value.get("metricConfiguration")
        if isinstance(config_value, dict)
        else None
    )
    if not entries:
        return current
    entry = next(
        (
            item
            for item in entries
            if isinstance(item, dict)
            and isinstance(item.get("dataType"), str)
            and item["dataType"].upper() == data_type
        ),
        None,
    )
    if entry is None:
        return current
    if entry.get("disabled") is True:
        return frozenset()
    listed = entry.get("metrics") or []
    if not listed:
        return current
    wanted = {str(name) for name in listed}
    base = current if current is not None else _COLUMN_METRIC_NAMES
    return frozenset(name for name in base if name in wanted)


def _apply_table_config(
    current: frozenset[str] | None,
    column_name: str,
    table_config: dict[str, Any] | None,
) -> frozenset[str] | None:
    """Filter by the table's includeColumns entry for this column.

    The first entry naming the column (or ``all``) wins; an entry with no
    metric list (or an empty one) passes the set through; otherwise the
    set intersects the listed names, matched case-insensitively. Names
    that match no computable metric simply do not survive the
    intersection — the pin's registry-lookup behavior for lists that
    name display fields (``valuesPercentage``, ``variance``) rather than
    metrics.
    """
    if not table_config:
        return current
    entries = table_config.get("includeColumns") or []
    entry = next(
        (
            item
            for item in entries
            if isinstance(item, dict)
            and item.get("columnName") in {column_name, "all"}
        ),
        None,
    )
    if entry is None:
        return current
    listed = entry.get("metrics") or []
    if not listed:
        return current
    wanted = {str(name).lower() for name in listed}
    base = current if current is not None else _COLUMN_METRIC_NAMES
    return frozenset(name for name in base if name.lower() in wanted)


def _parse_custom_metrics(
    entity: dict[str, Any] | None,
) -> tuple[CustomMetricRequest, ...]:
    """Registered custom metrics from the table entity. Name and
    expression are schema-required: a stored metric missing either is a
    configuration error, not a skipped metric."""
    custom_metrics = (entity or {}).get("customMetrics") or []
    parsed: list[CustomMetricRequest] = []
    for raw in custom_metrics:
        if not isinstance(raw, dict):
            raise WorkflowError("customMetrics entries must be objects")
        name = raw.get("name")
        expression = raw.get("expression")
        if not isinstance(name, str) or not name.strip():
            raise WorkflowError("custom metric requires a name")
        if not isinstance(expression, str) or not expression.strip():
            raise WorkflowError(f"custom metric {name!r} requires an expression")
        column_name = raw.get("columnName")
        parsed.append(
            CustomMetricRequest(
                name=name,
                column_name=column_name if isinstance(column_name, str) else None,
                expression=expression,
            )
        )
    return tuple(parsed)


def _resolve_partition(
    table_config: dict[str, Any] | None,
    entity: dict[str, Any] | None,
    source: SourceConfig,
    *,
    now: datetime,
) -> PartitionFilter | None:
    """Partition scope: explicit table config wins; otherwise auto-detect
    from the entity's tablePartition when enabled. An explicit config
    with partitioning disabled shadows auto-detection entirely.
    """
    partitioning = table_config.get("partitioning") if table_config else None
    if isinstance(partitioning, dict) and partitioning:
        if not partitioning.get("enablePartitioning"):
            return None
        return _partition_from_config(partitioning, now=now)
    if not source.enable_auto_partition_detection:
        return None
    return _infer_partition(entity, now=now)


def _partition_from_config(
    partitioning: dict[str, Any], *, now: datetime
) -> PartitionFilter:
    column = partitioning.get("partitionColumnName")
    if not isinstance(column, str) or not column.strip():
        raise WorkflowError("partitioning requires partitionColumnName")
    interval_type = partitioning.get("partitionIntervalType")
    if interval_type not in _SUPPORTED_INTERVAL_TYPES:
        raise WorkflowError(
            f"partition interval type {interval_type!r} is not supported; "
            "supported types are TIME-UNIT, INTEGER-RANGE, COLUMN-VALUE"
        )
    if interval_type == "COLUMN-VALUE":
        values = partitioning.get("partitionValues") or []
        if not isinstance(values, list) or not values:
            raise WorkflowError("COLUMN-VALUE partitioning requires partitionValues")
        return PartitionFilter(column=column, kind="column_value", values=tuple(values))
    if interval_type == "INTEGER-RANGE":
        start = partitioning.get("partitionIntegerRangeStart")
        end = partitioning.get("partitionIntegerRangeEnd")
        if not isinstance(start, int) or not isinstance(end, int):
            raise WorkflowError(
                "INTEGER-RANGE partitioning requires partitionIntegerRangeStart/End"
            )
        return PartitionFilter(
            column=column, kind="integer_range", range_start=start, range_end=end
        )
    interval = partitioning.get("partitionInterval")
    unit = partitioning.get("partitionIntervalUnit")
    if not isinstance(interval, int) or interval <= 0 or unit not in _PARTITION_INTERVAL_UNITS:
        raise WorkflowError(
            "TIME-UNIT partitioning requires a positive partitionInterval "
            "and a partitionIntervalUnit of YEAR, MONTH, DAY, or HOUR"
        )
    return PartitionFilter(
        column=column, kind="time_unit", cutoff=_subtract_interval(now, interval, unit)
    )


def _infer_partition(
    entity: dict[str, Any] | None, *, now: datetime
) -> PartitionFilter | None:
    """Infer a partition scope from the entity's tablePartition: the first
    partition column only. A TIME-UNIT report on a temporal column yields
    the granularity window; an INTEGER-RANGE report on an integer column
    yields the default range; anything else yields no scope (with a debug
    note, not a failure — auto-detection is best-effort by design)."""
    table_partition = (entity or {}).get("tablePartition") or {}
    columns = table_partition.get("columns") or []
    if not columns or not isinstance(columns[0], dict):
        return None
    first = columns[0]
    column_name = first.get("columnName")
    if not isinstance(column_name, str) or not column_name:
        return None
    column = _find_entity_column(entity, column_name)
    data_type = column.get("dataType") if column else None
    data_type = data_type.upper() if isinstance(data_type, str) else None
    interval_type = first.get("intervalType")
    if (
        interval_type == "TIME-UNIT"
        and column is not None
        and data_type in _TIME_PARTITION_DATA_TYPES
    ):
        unit, interval = _GRANULARITY_WINDOWS.get(
            str(first.get("interval") or "").upper(), ("DAY", 3)
        )
        logger.info(
            "auto-detected TIME-UNIT partitioning on column %r", column_name
        )
        return PartitionFilter(
            column=column_name,
            kind="time_unit",
            cutoff=_subtract_interval(now, interval, unit),
        )
    if (
        interval_type == "INTEGER-RANGE"
        and column is not None
        and data_type in _INTEGER_PARTITION_DATA_TYPES
    ):
        logger.info(
            "auto-detected INTEGER-RANGE partitioning on column %r", column_name
        )
        return PartitionFilter(
            column=column_name,
            kind="integer_range",
            range_start=_DEFAULT_INTEGER_RANGE_START,
            range_end=_DEFAULT_INTEGER_RANGE_END,
        )
    logger.debug(
        "cannot auto-detect partitioning: column %r has interval type %r and data type %r",
        column_name,
        interval_type,
        data_type,
    )
    return None


def _find_entity_column(
    entity: dict[str, Any] | None, column_name: str
) -> dict[str, Any] | None:
    """Find a cataloged column by name: exact match first, else a unique
    case-insensitive match (quoted identifiers can differ only by case)."""
    columns = [
        column
        for column in ((entity or {}).get("columns") or [])
        if isinstance(column, dict)
    ]
    for column in columns:
        if column.get("name") == column_name:
            return column
    matches = [
        column
        for column in columns
        if isinstance(column.get("name"), str)
        and column["name"].lower() == column_name.lower()
    ]
    return matches[0] if len(matches) == 1 else None


def _subtract_interval(now: datetime, interval: int, unit: str) -> datetime:
    """The TIME-UNIT cutoff: the current time minus the interval. Months
    and years use calendar arithmetic (a month is not 30 days)."""
    if unit == "HOUR":
        return now - timedelta(hours=interval)
    if unit == "DAY":
        return now - timedelta(days=interval)
    return _subtract_months(now, interval * 12 if unit == "YEAR" else interval)


def _subtract_months(moment: datetime, months: int) -> datetime:
    total = (moment.year * 12 + (moment.month - 1)) - months
    year, month_zero = divmod(total, 12)
    month = month_zero + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)
