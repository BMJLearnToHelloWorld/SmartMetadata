# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#

from __future__ import annotations

import httpx
import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.metabase import (
    MetabaseHttpCatalogReader,
    MetabaseSource,
)
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources, registered_source_types
from smartmetadata_ingestion.connectors.superset import (
    ChartRow,
    DashboardRow,
    SequenceDashboardCatalogReader,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ChartRecord, DashboardRecord, DashboardServiceRecord


def test_metabase_registered() -> None:
    load_builtin_sources()
    assert "metabase" in registered_source_types()
    source = get_source(
        "metabase",
        SourceConfig(type="metabase", service_name="mb", connection={"hostPort": "http://x", "apiKey": "k"}),
        reader=SequenceDashboardCatalogReader(),
    )
    assert isinstance(source, MetabaseSource)


def test_metabase_source_emits_service_charts_dashboards() -> None:
    source = MetabaseSource(
        SourceConfig(
            type="metabase",
            service_name="mb-prod",
            connection={"hostPort": "http://metabase:3000", "username": "admin@x", "password": "secret"},
            include_dashboards=["Finance"],
        ),
        reader=SequenceDashboardCatalogReader(
            charts=[
                ChartRow(name="101", display_name="ARR", chart_type="Line"),
                ChartRow(name="102", display_name="Extra", chart_type="Table"),
            ],
            dashboards=[
                DashboardRow(
                    name="9",
                    display_name="Finance",
                    project="Finance",
                    chart_names=["101"],
                    source_url="http://metabase:3000/dashboard/9",
                ),
                DashboardRow(name="8", display_name="Other", chart_names=["102"]),
            ],
        ),
    )
    records = list(source.produce())
    service = records[0]
    assert isinstance(service, DashboardServiceRecord)
    assert service.service_type == "Metabase"
    assert service.connection["config"]["hostPort"] == "http://metabase:3000"
    assert service.connection["config"]["username"] == "admin@x"
    assert "password" not in service.connection["config"]
    charts = [r for r in records if isinstance(r, ChartRecord)]
    dashboards = [r for r in records if isinstance(r, DashboardRecord)]
    assert [c.name for c in charts] == ["101", "102"]
    assert [d.name for d in dashboards] == ["9"]
    assert dashboards[0].charts == ["mb-prod.101"]
    assert dashboards[0].project == "Finance"


def test_metabase_http_api_key_and_session() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/api/card"):
            assert request.headers.get("X-API-KEY") == "key-1"
            return httpx.Response(
                200,
                json=[{"id": 1, "name": "Card A", "display": "bar", "description": "d"}],
            )
        if request.url.path.endswith("/api/dashboard"):
            return httpx.Response(200, json=[{"id": 5, "name": "Dash"}])
        if request.url.path.endswith("/api/dashboard/5"):
            return httpx.Response(
                200,
                json={
                    "id": 5,
                    "name": "Dash",
                    "collection": {"name": "Team"},
                    "dashcards": [{"card": {"id": 1}}],
                },
            )
        raise AssertionError(str(request.url))

    reader = MetabaseHttpCatalogReader(
        host_port="http://mb.test",
        api_key="key-1",
        transport=httpx.MockTransport(handler),
    )
    charts = reader.list_charts()
    dashboards = reader.list_dashboards()
    reader.close()
    assert charts[0].name == "1"
    assert charts[0].chart_type == "Bar"
    assert dashboards[0].chart_names == ["1"]
    assert dashboards[0].project == "Team"


def test_metabase_session_auth() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/api/session/"):
            body = request.read()
            assert b"admin" in body
            return httpx.Response(200, json={"id": "sess-9"})
        if request.url.path.endswith("/api/card"):
            assert request.headers.get("X-Metabase-Session") == "sess-9"
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/api/dashboard"):
            return httpx.Response(200, json=[])
        raise AssertionError(str(request.url))

    reader = MetabaseHttpCatalogReader(
        host_port="http://mb.test",
        username="admin",
        password="secret",
        transport=httpx.MockTransport(handler),
    )
    assert reader.list_charts() == []
    assert reader.list_dashboards() == []
    reader.close()


def test_metabase_requires_auth() -> None:
    with pytest.raises(WorkflowError, match="apiKey or username"):
        MetabaseHttpCatalogReader(host_port="http://mb.test")
