# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Plan resolution: pipeline knobs + table entity + global config.

Behavioral tests written from the pipeline schemas and the pin's
observable precedence rules (global filter first, table filter second;
table config overrides pipeline; explicit partitioning shadows
auto-detection). No database, no network.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from smartmetadata_ingestion.config import (
    DynamicSamplingConfig,
    DynamicSamplingThreshold,
    ProfileSampleConfig,
    SourceConfig,
    SparkEngineConfig,
    StaticSamplingConfig,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.profiler_plan import (
    SamplingPlan,
    clamp_thread_count,
    resolve_table_plan,
    table_passes_classification_filter,
    validate_pipeline_config,
)


def _source(**overrides) -> SourceConfig:
    values: dict = {"type": "postgres", "service_name": "warehouse"}
    values.update(overrides)
    return SourceConfig(**values)


def _entity(**overrides) -> dict:
    entity: dict = {
        "columns": [
            {"name": "id", "dataType": "INT"},
            {"name": "name", "dataType": "VARCHAR"},
        ],
    }
    entity.update(overrides)
    return entity


def _plan(source=None, entity=None, settings=None, **kwargs):
    return resolve_table_plan(
        source or _source(), entity, settings, **kwargs
    )


# --- metric filtering -----------------------------------------------------


def test_global_disabled_entry_empties_only_its_data_type() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [
                {"dataType": "INT", "disabled": True, "metrics": []},
            ]
        }
    }
    plan = _plan(source=_source(metrics=[]), entity=_entity(), settings=settings)
    assert plan.per_column_metrics["id"] == frozenset()
    assert plan.per_column_metrics["name"] is None


def test_global_entry_intersects_pipeline_set() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [
                {"dataType": "VARCHAR", "metrics": ["mean", "min", "max"]},
            ]
        }
    }
    source = _source(metrics=["mean", "min", "stddev"])
    plan = _plan(source=source, entity=_entity(), settings=settings)
    assert plan.per_column_metrics["name"] == frozenset({"mean", "min"})
    assert plan.per_column_metrics["id"] == frozenset({"mean", "min", "stddev"})


def test_global_entry_without_metrics_passes_through() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [{"dataType": "INT", "disabled": False}],
        }
    }
    plan = _plan(source=_source(metrics=["mean"]), entity=_entity(), settings=settings)
    assert plan.per_column_metrics["id"] == frozenset({"mean"})


def test_global_first_matching_entry_wins() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [
                {"dataType": "INT", "metrics": ["mean"]},
                {"dataType": "INT", "disabled": True},
            ]
        }
    }
    plan = _plan(entity=_entity(), settings=settings)
    assert plan.per_column_metrics["id"] == frozenset({"mean"})


def test_global_empty_set_skips_table_filter() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [{"dataType": "INT", "disabled": True}],
        }
    }
    entity = _entity(
        tableProfilerConfig={
            "includeColumns": [{"columnName": "id", "metrics": ["mean"]}],
        }
    )
    plan = _plan(entity=entity, settings=settings)
    assert plan.per_column_metrics["id"] == frozenset()


def test_table_entry_intersects_case_insensitively() -> None:
    entity = _entity(
        tableProfilerConfig={
            "includeColumns": [{"columnName": "name", "metrics": ["MEAN", "Min"]}],
        }
    )
    plan = _plan(source=_source(metrics=["mean", "min", "max"]), entity=entity)
    assert plan.per_column_metrics["name"] == frozenset({"mean", "min"})
    assert plan.per_column_metrics["id"] == frozenset({"mean", "min", "max"})


def test_table_all_entry_applies_to_every_column_first_match_wins() -> None:
    entity = _entity(
        tableProfilerConfig={
            "includeColumns": [
                {"columnName": "all", "metrics": ["mean"]},
                {"columnName": "id", "metrics": ["min"]},
            ],
        }
    )
    plan = _plan(entity=entity)
    assert plan.per_column_metrics["id"] == frozenset({"mean"})
    assert plan.per_column_metrics["name"] == frozenset({"mean"})


def test_table_entry_without_metrics_passes_through() -> None:
    entity = _entity(
        tableProfilerConfig={"includeColumns": [{"columnName": "id"}]},
    )
    plan = _plan(source=_source(metrics=["mean"]), entity=entity)
    assert plan.per_column_metrics["id"] == frozenset({"mean"})


def test_table_list_display_names_do_not_survive_intersection() -> None:
    entity = _entity(
        tableProfilerConfig={
            "includeColumns": [
                {"columnName": "id", "metrics": ["valuesPercentage", "variance", "mean"]},
            ],
        }
    )
    plan = _plan(entity=entity)
    assert plan.per_column_metrics["id"] == frozenset({"mean"})


def test_column_sets_drop_table_metrics_and_system() -> None:
    source = _source(metrics=["mean", "rowCount", "columnCount", "system"])
    plan = _plan(source=source, entity=_entity())
    assert plan.per_column_metrics["id"] == frozenset({"mean"})
    assert plan.metrics == frozenset({"mean", "rowCount", "columnCount", "system"})


def test_empty_pipeline_metrics_means_all() -> None:
    plan = _plan(source=_source(metrics=[]), entity=_entity())
    assert plan.metrics is None
    assert plan.per_column_metrics["id"] is None


def test_untyped_column_passes_global_filter() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [{"dataType": "INT", "disabled": True}],
        }
    }
    entity = {"columns": [{"name": "payload"}]}
    plan = _plan(source=_source(metrics=[]), entity=entity, settings=settings)
    assert plan.per_column_metrics["payload"] is None


# --- column membership ----------------------------------------------------


def test_include_columns_restrict_and_exclude_wins() -> None:
    entity = _entity(
        tableProfilerConfig={
            "includeColumns": [
                {"columnName": "id"},
                {"columnName": "name"},
            ],
            "excludeColumns": ["name"],
        }
    )
    plan = _plan(entity=entity)
    assert plan.include_columns == frozenset({"id"})
    assert plan.exclude_columns == frozenset({"name"})


def test_include_all_means_no_restriction() -> None:
    entity = _entity(
        tableProfilerConfig={"includeColumns": [{"columnName": "all"}]},
    )
    plan = _plan(entity=entity)
    assert plan.include_columns is None


def test_nameless_include_entries_are_inert() -> None:
    entity = _entity(
        tableProfilerConfig={"includeColumns": [{"metrics": ["mean"]}]},
    )
    plan = _plan(entity=entity)
    assert plan.include_columns is None


# --- toggles --------------------------------------------------------------


def test_table_toggles_override_pipeline() -> None:
    entity = _entity(
        tableProfilerConfig={"computeTableMetrics": False, "computeColumnMetrics": False},
    )
    plan = _plan(entity=entity)
    assert plan.compute_table_metrics is False
    assert plan.compute_column_metrics is False


def test_absent_table_toggles_keep_pipeline_values() -> None:
    source = _source(compute_table_metrics=False)
    plan = _plan(source=source, entity=_entity(tableProfilerConfig={}))
    assert plan.compute_table_metrics is False
    assert plan.compute_column_metrics is True


# --- sampling -------------------------------------------------------------


def test_sampling_table_config_beats_pipeline_and_fallback() -> None:
    table_config = {
        "profileSampleConfig": {
            "sampleConfigType": "STATIC",
            "config": {"profileSample": 25, "profileSampleType": "PERCENTAGE"},
        },
    }
    source = _source(
        profile_sample_config=ProfileSampleConfig(
            sample_config_type="STATIC",
            config=StaticSamplingConfig(
                profile_sample=50, profile_sample_type="PERCENTAGE"
            ),
        )
    )
    plan = _plan(
        source=source,
        entity=_entity(tableProfilerConfig=table_config),
        fallback_sample=StaticSampleConfig(10),
    )
    assert plan.sampling.resolve(1_000_000) == StaticSampleConfig(25)


def test_sampling_pipeline_beats_fallback_and_maps_rows() -> None:
    source = _source(
        profile_sample_config=ProfileSampleConfig(
            sample_config_type="STATIC",
            config=StaticSamplingConfig(profile_sample=100, profile_sample_type="ROWS"),
        )
    )
    plan = _plan(
        source=source,
        entity=_entity(),
        fallback_sample=StaticSampleConfig(10),
    )
    resolved = plan.sampling.resolve(1_000_000)
    assert resolved == StaticSampleConfig(100, sample_type="ROW_COUNT")


def test_sampling_dynamic_tiers_from_pipeline_thresholds() -> None:
    source = _source(
        profile_sample_config=ProfileSampleConfig(
            sample_config_type="DYNAMIC",
            config=DynamicSamplingConfig(
                smart_sampling=False,
                thresholds=[
                    DynamicSamplingThreshold(
                        row_count_threshold=1_000,
                        profile_sample=50,
                        profile_sample_type="PERCENTAGE",
                    ),
                    DynamicSamplingThreshold(
                        row_count_threshold=1_000_000,
                        profile_sample=10,
                        profile_sample_type="PERCENTAGE",
                    ),
                ],
            ),
        )
    )
    plan = _plan(source=source, entity=_entity())
    assert plan.sampling.resolve(500) is None
    assert plan.sampling.resolve(5_000) == StaticSampleConfig(50)
    assert plan.sampling.resolve(5_000_000) == StaticSampleConfig(10)


def test_sampling_dynamic_without_arm_uses_smart_tiers() -> None:
    source = _source(
        profile_sample_config=ProfileSampleConfig(sample_config_type="DYNAMIC")
    )
    plan = _plan(source=source, entity=_entity())
    assert plan.sampling.resolve(50_000) == StaticSampleConfig(100)
    assert plan.sampling.resolve(2_000_000) == StaticSampleConfig(10)


def test_sampling_fallback_only_when_nothing_else_present() -> None:
    plan = _plan(entity=_entity(), fallback_sample=StaticSampleConfig(10))
    assert plan.sampling.resolve(100) == StaticSampleConfig(10)
    plan = _plan(entity=_entity())
    assert plan.sampling.resolve(100) is None


def test_sampling_present_table_config_shadows_pipeline_even_when_empty() -> None:
    table_config = {
        "profileSampleConfig": {
            "sampleConfigType": "STATIC",
            "config": {},
        },
    }
    source = _source(
        profile_sample_config=ProfileSampleConfig(
            sample_config_type="STATIC",
            config=StaticSamplingConfig(
                profile_sample=50, profile_sample_type="PERCENTAGE"
            ),
        )
    )
    plan = _plan(source=source, entity=_entity(tableProfilerConfig=table_config))
    assert plan.sampling.resolve(1_000_000) is None


def test_sampling_plan_direct_construction() -> None:
    plan = SamplingPlan(fallback=StaticSampleConfig(5))
    assert plan.resolve(10) == StaticSampleConfig(5)


# --- partitions -----------------------------------------------------------


def test_partition_explicit_time_unit_cutoff() -> None:
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "created_at",
                "partitionIntervalType": "TIME-UNIT",
                "partitionInterval": 3,
                "partitionIntervalUnit": "DAY",
            },
        }
    )
    plan = _plan(entity=entity, now=now)
    assert plan.partition is not None
    assert plan.partition.column == "created_at"
    assert plan.partition.kind == "time_unit"
    assert plan.partition.cutoff == datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def test_partition_explicit_month_uses_calendar_math() -> None:
    now = datetime(2026, 3, 31, 12, 0, tzinfo=timezone.utc)
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "created_at",
                "partitionIntervalType": "TIME-UNIT",
                "partitionInterval": 1,
                "partitionIntervalUnit": "MONTH",
            },
        }
    )
    plan = _plan(entity=entity, now=now)
    assert plan.partition is not None
    assert plan.partition.cutoff == datetime(2026, 2, 28, 12, 0, tzinfo=timezone.utc)


def test_partition_explicit_integer_range_and_column_value() -> None:
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "id",
                "partitionIntervalType": "INTEGER-RANGE",
                "partitionIntegerRangeStart": 10,
                "partitionIntegerRangeEnd": 20,
            },
        }
    )
    plan = _plan(entity=entity)
    assert plan.partition is not None
    assert plan.partition.kind == "integer_range"
    assert (plan.partition.range_start, plan.partition.range_end) == (10, 20)

    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "name",
                "partitionIntervalType": "COLUMN-VALUE",
                "partitionValues": ["a", "b"],
            },
        }
    )
    plan = _plan(entity=entity)
    assert plan.partition is not None
    assert plan.partition.kind == "column_value"
    assert plan.partition.values == ("a", "b")


def test_partition_unsupported_interval_type_fails_loud() -> None:
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "created_at",
                "partitionIntervalType": "INGESTION-TIME",
            },
        }
    )
    with pytest.raises(WorkflowError, match="INGESTION-TIME"):
        _plan(entity=entity)


def test_partition_missing_column_and_bounds_fail_loud() -> None:
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionIntervalType": "TIME-UNIT",
                "partitionInterval": 1,
                "partitionIntervalUnit": "DAY",
            },
        }
    )
    with pytest.raises(WorkflowError, match="partitionColumnName"):
        _plan(entity=entity)
    entity = _entity(
        tableProfilerConfig={
            "partitioning": {
                "enablePartitioning": True,
                "partitionColumnName": "id",
                "partitionIntervalType": "INTEGER-RANGE",
            },
        }
    )
    with pytest.raises(WorkflowError, match="INTEGER-RANGE"):
        _plan(entity=entity)


def test_partition_explicitly_disabled_shadows_auto_detect() -> None:
    entity = _entity(
        columns=[{"name": "created_at", "dataType": "TIMESTAMP"}],
        tableProfilerConfig={"partitioning": {"enablePartitioning": False}},
        tablePartition={
            "columns": [
                {
                    "columnName": "created_at",
                    "intervalType": "TIME-UNIT",
                    "interval": "daily",
                }
            ]
        },
    )
    plan = _plan(entity=entity)
    assert plan.partition is None


def test_partition_auto_detect_time_unit_window() -> None:
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    entity = _entity(
        columns=[{"name": "created_at", "dataType": "TIMESTAMP"}],
        tablePartition={
            "columns": [
                {
                    "columnName": "created_at",
                    "intervalType": "TIME-UNIT",
                    "interval": "MONTH",
                }
            ]
        },
    )
    plan = _plan(entity=entity, now=now)
    assert plan.partition is not None
    assert plan.partition.kind == "time_unit"
    assert plan.partition.cutoff == datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)


def test_partition_auto_detect_unknown_granularity_falls_back_to_three_days() -> None:
    # The granularity lookup matches exact keys (HOUR/DAY/MONTH/YEAR);
    # a prose interval like "monthly" misses and takes the 3-day default.
    now = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)
    entity = _entity(
        columns=[{"name": "created_at", "dataType": "TIMESTAMP"}],
        tablePartition={
            "columns": [
                {
                    "columnName": "created_at",
                    "intervalType": "TIME-UNIT",
                    "interval": "monthly",
                }
            ]
        },
    )
    plan = _plan(entity=entity, now=now)
    assert plan.partition is not None
    assert plan.partition.cutoff == datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def test_partition_auto_detect_integer_range_defaults() -> None:
    entity = _entity(
        tablePartition={
            "columns": [
                {"columnName": "id", "intervalType": "INTEGER-RANGE"},
            ]
        },
    )
    plan = _plan(entity=entity)
    assert plan.partition is not None
    assert plan.partition.kind == "integer_range"
    assert (plan.partition.range_start, plan.partition.range_end) == (1, 10000)


def test_partition_auto_detect_ignores_wrong_type_and_unknown_column() -> None:
    entity = _entity(
        tablePartition={
            "columns": [
                {
                    "columnName": "name",
                    "intervalType": "TIME-UNIT",
                    "interval": "daily",
                }
            ]
        },
    )
    assert _plan(entity=entity).partition is None
    entity = _entity(
        tablePartition={
            "columns": [
                {
                    "columnName": "missing",
                    "intervalType": "TIME-UNIT",
                    "interval": "daily",
                }
            ]
        },
    )
    assert _plan(entity=entity).partition is None


def test_partition_auto_detect_uses_first_column_only() -> None:
    entity = _entity(
        columns=[
            {"name": "name", "dataType": "VARCHAR"},
            {"name": "created_at", "dataType": "TIMESTAMP"},
        ],
        tablePartition={
            "columns": [
                {"columnName": "name", "intervalType": "TIME-UNIT", "interval": "daily"},
                {
                    "columnName": "created_at",
                    "intervalType": "TIME-UNIT",
                    "interval": "daily",
                },
            ]
        },
    )
    assert _plan(entity=entity).partition is None


def test_partition_auto_detect_respects_knob() -> None:
    entity = _entity(
        columns=[{"name": "created_at", "dataType": "TIMESTAMP"}],
        tablePartition={
            "columns": [
                {
                    "columnName": "created_at",
                    "intervalType": "TIME-UNIT",
                    "interval": "daily",
                }
            ]
        },
    )
    source = _source(enable_auto_partition_detection=False)
    assert _plan(source=source, entity=entity).partition is None


# --- classification filter ------------------------------------------------


def test_classification_tier_names_match_by_default() -> None:
    source = _source(include_classifications=["Tier1", "Tier2"])
    entity = {"tags": [{"tagFQN": "Tier.Tier1", "name": "Tier1"}]}
    assert table_passes_classification_filter(source, entity) is True
    entity = {"tags": [{"tagFQN": "Tier.Tier3", "name": "Tier3"}]}
    assert table_passes_classification_filter(source, entity) is False


def test_classification_fqn_matching_when_flagged() -> None:
    source = _source(
        include_classifications=["Tier.Tier1"], use_fqn_for_filtering=True
    )
    entity = {"tags": [{"tagFQN": "Tier.Tier1", "name": "Tier1"}]}
    assert table_passes_classification_filter(source, entity) is True
    source = _source(include_classifications=["Tier1"], use_fqn_for_filtering=True)
    assert table_passes_classification_filter(source, entity) is False


def test_classification_name_derived_from_fqn_last_segment() -> None:
    source = _source(include_classifications=["Tier1"])
    entity = {"tags": [{"tagFQN": "Tier.Tier1"}]}
    assert table_passes_classification_filter(source, entity) is True


def test_classification_excludes_win_and_uncataloged_filtered() -> None:
    source = _source(
        include_classifications=["Tier.*"], exclude_classifications=["Tier1"]
    )
    entity = {"tags": [{"tagFQN": "Tier.Tier1", "name": "Tier1"}]}
    assert table_passes_classification_filter(source, entity) is False
    source = _source(include_classifications=["Tier1"])
    assert table_passes_classification_filter(source, None) is False
    assert table_passes_classification_filter(source, {}) is False


def test_classification_empty_patterns_pass_everything() -> None:
    assert table_passes_classification_filter(_source(), None) is True


# --- custom metrics -------------------------------------------------------


def test_custom_metrics_parsed_with_column_binding() -> None:
    entity = _entity(
        customMetrics=[
            {"name": "avg_age", "expression": "AVG(age)", "columnName": "id"},
            {"name": "total_rows", "expression": "COUNT(*)"},
        ]
    )
    plan = _plan(entity=entity)
    assert [(m.name, m.column_name, m.expression) for m in plan.custom_metrics] == [
        ("avg_age", "id", "AVG(age)"),
        ("total_rows", None, "COUNT(*)"),
    ]


def test_custom_metrics_missing_name_or_expression_fail_loud() -> None:
    with pytest.raises(WorkflowError, match="name"):
        _plan(entity=_entity(customMetrics=[{"expression": "COUNT(*)"}]))
    with pytest.raises(WorkflowError, match="expression"):
        _plan(entity=_entity(customMetrics=[{"name": "x"}]))


# --- profile query + randomized -------------------------------------------


def test_profile_query_trimmed_and_empty_treated_as_absent() -> None:
    entity = _entity(tableProfilerConfig={"profileQuery": "  SELECT * FROM t  "})
    assert _plan(entity=entity).profile_query == "SELECT * FROM t"
    entity = _entity(tableProfilerConfig={"profileQuery": "   "})
    assert _plan(entity=entity).profile_query is None


def test_randomized_is_pipeline_or_table() -> None:
    assert _plan(entity=_entity()).randomized is False
    assert _plan(source=_source(randomized_sample=True), entity=_entity()).randomized is True
    entity = _entity(tableProfilerConfig={"randomizedSample": True})
    assert _plan(entity=entity).randomized is True


# --- validation + clamping ------------------------------------------------


def test_validate_pipeline_config_rejects_unsupported_knobs() -> None:
    with pytest.raises(WorkflowError, match="Spark"):
        validate_pipeline_config(
            _source(processing_engine=SparkEngineConfig(type="Spark", remote="x"))
        )
    with pytest.raises(WorkflowError, match="useStatistics"):
        validate_pipeline_config(_source(use_statistics=True))
    with pytest.raises(WorkflowError, match="system"):
        validate_pipeline_config(_source(metrics=["mean", "system"]))
    with pytest.raises(WorkflowError, match="unknown"):
        validate_pipeline_config(_source(metrics=["mean", "bogusMetric"]))
    with pytest.raises(WorkflowError, match="timeoutSeconds"):
        validate_pipeline_config(_source(timeout_seconds=0))


def test_validate_pipeline_config_accepts_native_defaults() -> None:
    validate_pipeline_config(_source())
    validate_pipeline_config(_source(metrics=[]))


def test_clamp_thread_count() -> None:
    assert clamp_thread_count(None) is None
    assert clamp_thread_count(0) == 1
    assert clamp_thread_count(5) == 5
    assert clamp_thread_count(25) == 20


# --- options round-trip ---------------------------------------------------


def test_to_options_carries_plan_fields() -> None:
    entity = _entity(
        tableProfilerConfig={
            "computeTableMetrics": False,
            "profileQuery": "SELECT 1",
            "excludeColumns": ["name"],
        }
    )
    options = _plan(entity=entity).to_options()
    assert options.compute_table_metrics is False
    assert options.compute_column_metrics is True
    assert options.profile_query == "SELECT 1"
    assert options.exclude_columns == frozenset({"name"})
    assert options.sample_resolver is not None
    assert options.sample_resolver(100) is None
