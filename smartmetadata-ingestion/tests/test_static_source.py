# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.base import StaticSource, build_source, parse_static_record
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.processors.identity import IdentityProcessor, build_processors
from smartmetadata_ingestion.records import DatabaseRecord, LineageRecord, TableRecord


def test_static_source_parses_fixture_records() -> None:
    source = StaticSource(
        SourceConfig(
            type="static",
            service_name="demo",
            records=[
                {"kind": "database", "name": "analytics"},
                {"kind": "schema", "name": "public", "database": "demo.analytics"},
                {
                    "kind": "table",
                    "name": "orders",
                    "databaseSchema": "demo.analytics.public",
                    "columns": [{"name": "id", "dataType": "INT"}],
                },
                {
                    "kind": "lineage",
                    "fromEntity": {"type": "table", "fqn": "demo.analytics.public.a"},
                    "toEntity": {"type": "table", "fqn": "demo.analytics.public.b"},
                },
            ],
        )
    )
    records = list(source.produce())
    assert records[0].kind == "databaseService"
    assert isinstance(records[1], DatabaseRecord)
    assert records[1].service == "demo"
    assert isinstance(records[3], TableRecord)
    assert records[3].columns[0].data_type == "INT"
    assert isinstance(records[4], LineageRecord)


def test_parse_static_record_rejects_unknown_kind() -> None:
    with pytest.raises(WorkflowError, match="unsupported static record"):
        parse_static_record({"kind": "dashboard"}, default_service="demo")


def test_build_source_and_identity_processor(workflow_config) -> None:
    workflow_config.source = SourceConfig(type="static", service_name="demo")
    source = build_source(workflow_config)
    assert isinstance(source, StaticSource)
    record = next(iter(source.produce()))
    assert IdentityProcessor().process(record) is record
    assert build_processors(workflow_config) == []


def test_build_source_rejects_unknown_type(workflow_config) -> None:
    workflow_config.source.type = "snowflake"  # type: ignore[misc]
    with pytest.raises(WorkflowError, match="unsupported source"):
        build_source(workflow_config)
