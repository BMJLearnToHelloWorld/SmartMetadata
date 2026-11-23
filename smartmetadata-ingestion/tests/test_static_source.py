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
    # "dashboard" used to be rejected here; since the lineage-demo lane it is
    # a supported kind (see test_parse_static_record_pipeline_dashboard_kinds),
    # so the rejection is pinned on a kind that is still unknown.
    with pytest.raises(WorkflowError, match="unsupported static record"):
        parse_static_record({"kind": "widget"}, default_service="demo")


def test_parse_static_record_database_service_kind() -> None:
    service = parse_static_record(
        {
            "kind": "databaseService",
            "name": "demo-doris",
            "serviceType": "Doris",
            "displayName": "Demo Doris (fake)",
            "description": "Fake Doris service for the lineage demo graph.",
            "connection": {
                "config": {
                    "type": "Doris",
                    "scheme": "doris",
                    "hostPort": "demo-doris:9030",
                    "username": "demo",
                    "supportsViewLineageExtraction": True,
                }
            },
        },
        default_service="demo",
    )
    assert service.kind == "databaseService"
    assert service.service_type == "Doris"
    assert service.display_name == "Demo Doris (fake)"
    assert service.connection == {
        "config": {
            "type": "Doris",
            "scheme": "doris",
            "hostPort": "demo-doris:9030",
            "username": "demo",
            "supportsViewLineageExtraction": True,
        }
    }


def test_parse_static_record_pipeline_dashboard_kinds() -> None:
    pipeline_service = parse_static_record(
        {"kind": "pipelineService", "name": "demo-airflow", "serviceType": "Airflow"},
        default_service="demo",
    )
    assert pipeline_service.kind == "pipelineService"
    assert pipeline_service.service_type == "Airflow"

    pipeline = parse_static_record(
        {
            "kind": "pipeline",
            "name": "demo_etl",
            "service": "demo-airflow",
            "scheduleInterval": "0 0 * * *",
        },
        default_service="demo",
    )
    assert pipeline.kind == "pipeline"
    assert pipeline.service == "demo-airflow"
    assert pipeline.schedule_interval == "0 0 * * *"

    dashboard_service = parse_static_record(
        {
            "kind": "dashboardService",
            "name": "demo-superset",
            "serviceType": "Superset",
        },
        default_service="demo",
    )
    assert dashboard_service.kind == "dashboardService"
    assert dashboard_service.service_type == "Superset"

    chart = parse_static_record(
        {
            "kind": "chart",
            "name": "demo_chart",
            "service": "demo-superset",
            "chartType": "Line",
        },
        default_service="demo",
    )
    assert chart.kind == "chart"
    assert chart.service == "demo-superset"
    assert chart.chart_type == "Line"

    dashboard = parse_static_record(
        {
            "kind": "dashboard",
            "name": "demo_dashboard",
            "service": "demo-superset",
            "charts": ["demo-superset.demo_chart"],
        },
        default_service="demo",
    )
    assert dashboard.kind == "dashboard"
    assert dashboard.service == "demo-superset"
    assert dashboard.charts == ["demo-superset.demo_chart"]


def test_build_source_and_identity_processor(workflow_config) -> None:
    workflow_config.source = SourceConfig(type="static", service_name="demo")
    source = build_source(workflow_config)
    assert isinstance(source, StaticSource)
    record = next(iter(source.produce()))
    assert IdentityProcessor().process(record) is record
    assert build_processors(workflow_config) == []


def test_build_source_rejects_unknown_type(workflow_config) -> None:
    workflow_config.source.type = "oracle"
    with pytest.raises(WorkflowError, match="unsupported source"):
        build_source(workflow_config)
