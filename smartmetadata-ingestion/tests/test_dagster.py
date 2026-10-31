# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import httpx
import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.dagster import DagsterGraphqlCatalogReader, DagsterSource
from smartmetadata_ingestion.connectors.pipeline_common import PipelineRow, SequencePipelineCatalogReader
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources, registered_source_types
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import PipelineRecord, PipelineServiceRecord


def test_dagster_registered() -> None:
    load_builtin_sources()
    assert "dagster" in registered_source_types()
    source = get_source(
        "dagster",
        SourceConfig(type="dagster", service_name="dg", connection={"host": "http://localhost:3000"}),
        reader=SequencePipelineCatalogReader(),
    )
    assert isinstance(source, DagsterSource)


def test_dagster_source_emits_service_and_pipelines() -> None:
    source = DagsterSource(
        SourceConfig(
            type="dagster",
            service_name="dg-prod",
            connection={"host": "http://dagster:3000", "token": "secret", "timeout": 30},
            include_pipelines=["loc.job_a"],
        ),
        reader=SequencePipelineCatalogReader(
            pipelines=[
                PipelineRow(name="loc.job_a", display_name="job_a", description="A"),
                PipelineRow(name="loc.job_b", display_name="job_b"),
            ]
        ),
    )
    records = list(source.produce())
    service = records[0]
    assert isinstance(service, PipelineServiceRecord)
    assert service.service_type == "Dagster"
    assert service.connection["config"]["host"] == "http://dagster:3000"
    assert service.connection["config"]["timeout"] == 30
    assert "token" not in service.connection["config"]
    pipelines = [r for r in records if isinstance(r, PipelineRecord)]
    assert [p.name for p in pipelines] == ["loc.job_a"]


def test_dagster_graphql_jobs() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/graphql")
        assert request.headers.get("Authorization") == "Bearer tok"
        return httpx.Response(
            200,
            json={
                "data": {
                    "repositoriesOrError": {
                        "__typename": "RepositoryConnection",
                        "nodes": [
                            {
                                "name": "repo",
                                "location": {"name": "loc"},
                                "jobs": [
                                    {"name": "ingest", "description": "nightly"},
                                    {"name": "dbt"},
                                ],
                            }
                        ],
                    }
                }
            },
        )

    reader = DagsterGraphqlCatalogReader(
        host="http://dagster.test",
        token="tok",
        transport=httpx.MockTransport(handler),
    )
    rows = reader.list_pipelines()
    reader.close()
    assert [r.name for r in rows] == ["loc.ingest", "loc.dbt"]
    assert rows[0].display_name == "ingest"
    assert rows[0].tasks and rows[0].tasks[0].task_type == "Job"


def test_dagster_requires_host() -> None:
    with pytest.raises(WorkflowError, match="host"):
        DagsterGraphqlCatalogReader(host=" ")
