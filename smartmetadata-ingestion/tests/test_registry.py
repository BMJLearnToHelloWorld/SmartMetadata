# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig, WorkflowConfig
from smartmetadata_ingestion.connectors.base import StaticSource, build_source
from smartmetadata_ingestion.connectors.kafka import KafkaSource
from smartmetadata_ingestion.connectors.mysql import MysqlSource
from smartmetadata_ingestion.connectors.postgres import PostgresSource
from smartmetadata_ingestion.connectors.registry import (
    load_builtin_sources,
    registered_source_types,
)
from smartmetadata_ingestion.connectors.snowflake import SnowflakeSource


def test_builtin_source_types_are_registered() -> None:
    load_builtin_sources()
    assert set(registered_source_types()) >= {"static", "postgres", "mysql", "kafka", "snowflake"}


def test_build_source_selects_registered_connectors(workflow_config: WorkflowConfig) -> None:
    mapping = {
        "static": StaticSource,
        "postgres": PostgresSource,
        "mysql": MysqlSource,
        "kafka": KafkaSource,
        "snowflake": SnowflakeSource,
    }
    for type_name, expected in mapping.items():
        workflow_config.source = SourceConfig(type=type_name, service_name="demo")
        source = build_source(workflow_config)
        assert isinstance(source, expected)


def test_data_diff_modules_are_registered() -> None:
    import importlib

    from smartmetadata_ingestion.datadiff import datadiff_binding

    load_builtin_sources()
    stems = (
        "databricks",
        "mssql",
        "mysql",
        "postgres",
        "snowflake",
        "unitycatalog",
    )
    for stem in stems:
        module = importlib.import_module(f"smartmetadata_ingestion.connectors.{stem}_data_diff")
        assert any(name.endswith("TableParameter") for name in dir(module))
        assert any(name.endswith("DataDiff") for name in dir(module))
        binding = datadiff_binding(stem)
        assert binding is not None
        assert binding.parameter is not None
        assert binding.differ is not None
        assert callable(binding.connect)
        assert callable(binding.quote)
    assert datadiff_binding("kafka") is None
    assert datadiff_binding("redshift") is None
    assert datadiff_binding("static") is None


def test_profiler_quality_modules_are_registered() -> None:
    import importlib

    from smartmetadata_ingestion.profiler import profiler_binding

    load_builtin_sources()
    stems = (
        "databricks",
        "doris",
        "greenplum",
        "mariadb",
        "mssql",
        "mysql",
        "postgres",
        "redshift",
        "snowflake",
        "timescale",
        "unitycatalog",
    )
    for stem in stems:
        profiler_module = importlib.import_module(
            f"smartmetadata_ingestion.connectors.{stem}_profiler"
        )
        quality_module = importlib.import_module(
            f"smartmetadata_ingestion.connectors.{stem}_quality"
        )
        assert any(
            name.endswith("ProfilerInterface")
            or name.endswith("Sampler")
            or name.endswith("SampleHelper")
            for name in dir(profiler_module)
        )
        assert any(name.endswith("TestSuiteInterface") for name in dir(quality_module))
        binding = profiler_binding(stem)
        assert binding is not None
        assert binding.profiler is not None
        assert binding.quality is not None
        assert binding.profile_reader is not None
        assert callable(binding.connect)
    assert profiler_binding("kafka") is None
    assert profiler_binding("static") is None
