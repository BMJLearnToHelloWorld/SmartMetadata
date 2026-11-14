# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SourceConfig per-type knobs (capability batch 1, C-3): schema defaults,
typed nested models, and the bounds the schemas state."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from smartmetadata_ingestion.config import (
    DEFAULT_PROFILER_METRICS,
    DynamicSamplingConfig,
    ProfileSampleConfig,
    SourceConfig,
    StaticSamplingConfig,
)


def _source(**overrides):
    payload = {"type": "mysql", "serviceName": "svc"}
    payload.update(overrides)
    return SourceConfig.model_validate(payload)


def test_schema_defaults_match_the_pipeline_schemas() -> None:
    source = _source()
    assert source.mark_deleted_tables is True
    assert source.mark_deleted_stored_procedures is True
    assert source.mark_deleted_schemas is False
    assert source.mark_deleted_databases is False
    assert source.include_tables_enabled is True
    assert source.include_views is True
    assert source.include_tags is True
    assert source.include_ddl is False
    assert source.query_log_duration == 1
    assert source.result_limit == 1000
    assert source.stage_file_location == "/tmp/query_log"
    assert source.process_query_cost_analysis is True
    assert source.parsing_timeout_limit == 300
    assert source.query_parser_config is None
    assert source.process_view_lineage is True
    assert source.process_cross_database_lineage is False
    assert source.incremental_lineage_processing is True
    assert source.timeout_seconds == 43200
    assert source.thread_count is None
    assert source.metrics == list(DEFAULT_PROFILER_METRICS)
    assert source.confidence == 80
    assert source.sample_data_count == 50
    assert source.classification_language == "en"
    assert source.enable_auto_classification is True
    assert source.store_sample_data is False


def test_metrics_default_is_a_fresh_list_per_config() -> None:
    first, second = _source(), _source()
    first.metrics.append("histogram")
    assert "histogram" not in second.metrics


def test_camel_alias_spellings_follow_the_schemas() -> None:
    source = _source(includeDDL=True, includeUnDeployedPipelines=False)
    assert source.include_ddl is True
    assert source.include_undeployed_pipelines is False


def test_schema_bounds_are_enforced() -> None:
    with pytest.raises(ValidationError):
        _source(confidence=101)
    with pytest.raises(ValidationError):
        _source(confidence=-1)
    with pytest.raises(ValidationError):
        _source(sampleDataCount=0)
    with pytest.raises(ValidationError):
        _source(sampleDataCount=1001)
    with pytest.raises(ValidationError):
        _source(jsonSchemaSampleSize=0)
    with pytest.raises(ValidationError):
        _source(maxSchemaInferenceDepth=-1)
    assert _source(confidence=0, sampleDataCount=1000).confidence == 0


def test_query_parser_type_is_the_schema_enum() -> None:
    assert _source(queryParserConfig={"type": "SqlGlot"}).query_parser_config.type == "SqlGlot"
    assert _source(queryParserConfig={}).query_parser_config.type == "Auto"
    with pytest.raises(ValidationError):
        _source(queryParserConfig={"type": "SqlParse"})


def test_profile_sample_config_resolves_either_arm() -> None:
    static = ProfileSampleConfig.model_validate(
        {"sampleConfigType": "STATIC", "config": {"profileSample": 25}}
    )
    assert isinstance(static.config, StaticSamplingConfig)
    dynamic = ProfileSampleConfig.model_validate(
        {"config": {"thresholds": [{"rowCountThreshold": 100, "profileSample": 10}]}}
    )
    assert dynamic.sample_config_type == "DYNAMIC"
    assert isinstance(dynamic.config, DynamicSamplingConfig)
    # A static-shaped config stays valid under the DYNAMIC default: the
    # schema's oneOf does not consult sampleConfigType.
    crossed = ProfileSampleConfig.model_validate({"config": {"profileSample": 25}})
    assert isinstance(crossed.config, StaticSamplingConfig)
    with pytest.raises(ValidationError):
        ProfileSampleConfig.model_validate(
            {"config": {"profileSample": 25, "thresholds": [{"rowCountThreshold": 0}]}}
        )


def test_processing_engine_union_requires_spark_remote() -> None:
    assert _source(processingEngine={"type": "Native"}).processing_engine.type == "Native"
    spark = _source(
        processingEngine={"type": "Spark", "remote": "sc://host:15002"}
    ).processing_engine
    assert spark.remote == "sc://host:15002"
    with pytest.raises(ValidationError):
        _source(processingEngine={"type": "Spark"})
    with pytest.raises(ValidationError):
        _source(processingEngine={"type": "Flink"})


def test_owner_config_levels() -> None:
    owner = _source(
        ownerConfig={
            "default": "team-a",
            "database": {"db1": ["alice", "bob"]},
            "table": "carol",
        }
    ).owner_config
    assert owner.default == "team-a"
    assert owner.database == {"db1": ["alice", "bob"]}
    assert owner.table == "carol"
    assert owner.enable_inheritance is True


def test_nested_objects_reject_unknown_keys() -> None:
    with pytest.raises(ValidationError):
        _source(incremental={"enabled": True, "bogus": 1})
    with pytest.raises(ValidationError):
        _source(shardedTables={"enabled": True, "bogus": 1})


def test_dead_knob_is_carried_but_has_no_reader_contract() -> None:
    # processQueryCostAnalysis round-trips as a typed field; the batch-1
    # runners must not read it (D-C6). The test pins the carrying half.
    assert _source(processQueryCostAnalysis=False).process_query_cost_analysis is False
