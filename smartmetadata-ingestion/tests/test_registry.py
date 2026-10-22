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
