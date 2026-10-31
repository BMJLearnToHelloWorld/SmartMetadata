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
from smartmetadata_ingestion.connectors.pipeline_common import PipelineRow, SequencePipelineCatalogReader
from smartmetadata_ingestion.connectors.prefect import PrefectHttpCatalogReader, PrefectSource
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources, registered_source_types
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import PipelineRecord, PipelineServiceRecord


def test_prefect_registered() -> None:
    load_builtin_sources()
    assert "prefect" in registered_source_types()
    source = get_source(
        "prefect",
        SourceConfig(
            type="prefect",
            service_name="pf",
            connection={
                "hostPort": "http://localhost:4200",
                "authType": {"authString": ""},
            },
        ),
        reader=SequencePipelineCatalogReader(),
    )
    assert isinstance(source, PrefectSource)


def test_prefect_source_emits_service_and_pipelines() -> None:
    source = PrefectSource(
        SourceConfig(
            type="prefect",
            service_name="pf-prod",
            connection={
                "hostPort": "https://api.prefect.cloud",
                "authType": {
                    "apiKey": "secret-key",
                    "accountId": "acct-1",
                    "workspaceId": "ws-1",
                },
                "numberOfStatus": 5,
            },
            include_pipelines=["etl_daily"],
        ),
        reader=SequencePipelineCatalogReader(
            pipelines=[
                PipelineRow(name="etl_daily", display_name="ETL Daily", description="nightly"),
                PipelineRow(name="other", display_name="Other"),
            ]
        ),
    )
    records = list(source.produce())
    service = records[0]
    assert isinstance(service, PipelineServiceRecord)
    assert service.service_type == "Prefect"
    assert service.connection["config"]["hostPort"] == "https://api.prefect.cloud"
    assert service.connection["config"]["numberOfStatus"] == 5
    auth = service.connection["config"]["authType"]
    assert auth["accountId"] == "acct-1"
    assert auth["workspaceId"] == "ws-1"
    assert "apiKey" not in auth
    pipelines = [r for r in records if isinstance(r, PipelineRecord)]
    assert [p.name for p in pipelines] == ["etl_daily"]
    assert pipelines[0].display_name == "ETL Daily"


def test_prefect_http_cloud_flows_filter() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("Authorization") == "Bearer key-1"
        assert "/api/accounts/acc/workspaces/ws/flows/filter" in str(request.url)
        return httpx.Response(
            200,
            json=[
                {"id": "f1", "name": "flow_a", "description": "A"},
                {"id": "f2", "name": "flow_b"},
            ],
        )

    reader = PrefectHttpCatalogReader(
        host_port="https://api.prefect.cloud",
        auth_type={"apiKey": "key-1", "accountId": "acc", "workspaceId": "ws"},
        transport=httpx.MockTransport(handler),
    )
    rows = reader.list_pipelines()
    reader.close()
    assert [r.name for r in rows] == ["flow_a", "flow_b"]
    assert rows[0].source_url and "f1" in rows[0].source_url


def test_prefect_http_server_basic_auth() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/flows/filter")
        assert request.headers.get("Authorization", "").startswith("Basic ")
        return httpx.Response(200, json=[])

    reader = PrefectHttpCatalogReader(
        host_port="http://prefect.local:4200",
        auth_type={"authString": "admin:secret"},
        transport=httpx.MockTransport(handler),
    )
    assert reader.list_pipelines() == []
    reader.close()


def test_prefect_requires_host() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        PrefectHttpCatalogReader(host_port=" ", auth_type={"authString": ""})
