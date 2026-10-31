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
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources, registered_source_types
from smartmetadata_ingestion.connectors.superset import (
    ChartRow,
    DashboardRow,
    SequenceDashboardCatalogReader,
    SupersetHttpCatalogReader,
    SupersetSource,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ChartRecord, DashboardRecord, DashboardServiceRecord


def test_superset_registered() -> None:
    load_builtin_sources()
    assert "superset" in registered_source_types()
    source = get_source(
        "superset",
        SourceConfig(type="superset", service_name="bi", connection={"hostPort": "http://x"}),
        reader=SequenceDashboardCatalogReader(),
    )
    assert isinstance(source, SupersetSource)


def test_superset_source_emits_service_charts_dashboards() -> None:
    source = SupersetSource(
        SourceConfig(
            type="superset",
            service_name="superset-prod",
            connection={
                "hostPort": "http://superset:8088",
                "connection": {"provider": "db", "username": "admin", "password": "secret"},
            },
            include_dashboards=["Sales"],
            include_charts=["Orders"],
        ),
        reader=SequenceDashboardCatalogReader(
            charts=[
                ChartRow(name="1", display_name="Orders", chart_type="Bar"),
                ChartRow(name="2", display_name="Ignored", chart_type="Pie"),
            ],
            dashboards=[
                DashboardRow(
                    name="10",
                    display_name="Sales",
                    chart_names=["1", "2"],
                    source_url="http://superset:8088/superset/dashboard/10/",
                ),
                DashboardRow(name="11", display_name="Other", chart_names=["2"]),
            ],
        ),
    )
    records = list(source.produce())
    assert records[0].kind == "dashboardService"
    service = records[0]
    assert isinstance(service, DashboardServiceRecord)
    assert service.service_type == "Superset"
    assert service.connection["config"]["hostPort"] == "http://superset:8088"
    assert service.connection["config"]["connection"]["provider"] == "db"
    assert service.connection["config"]["connection"]["username"] == "admin"
    assert "password" not in service.connection["config"]["connection"]
    charts = [r for r in records if isinstance(r, ChartRecord)]
    dashboards = [r for r in records if isinstance(r, DashboardRecord)]
    assert [c.name for c in charts] == ["1"]
    assert [d.name for d in dashboards] == ["10"]
    assert dashboards[0].charts == ["superset-prod.1"]


def test_superset_http_reader_login_and_pages() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        if request.url.path.endswith("/security/login"):
            return httpx.Response(200, json={"access_token": "tok"})
        if "/chart/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "count": 1,
                    "result": [
                        {
                            "id": 7,
                            "slice_name": "Revenue",
                            "viz_type": "line",
                            "url": "/explore/?slice_id=7",
                        }
                    ],
                },
            )
        if "/dashboard/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "count": 1,
                    "result": [
                        {
                            "id": 3,
                            "dashboard_title": "Ops",
                            "published": True,
                            "url": "/superset/dashboard/3/",
                            "charts": [7],
                        }
                    ],
                },
            )
        raise AssertionError(str(request.url))

    reader = SupersetHttpCatalogReader(
        host_port="http://superset.test",
        username="admin",
        password="secret",
        provider="db",
        transport=httpx.MockTransport(handler),
    )
    charts = reader.list_charts()
    dashboards = reader.list_dashboards()
    reader.close()
    assert charts[0].name == "7"
    assert charts[0].chart_type == "Line"
    assert dashboards[0].name == "3"
    assert dashboards[0].chart_names == ["7"]
    assert any(c.startswith("POST") for c in calls)


def test_superset_http_login_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "nope"})

    reader = SupersetHttpCatalogReader(
        host_port="http://superset.test",
        username="admin",
        password="bad",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(WorkflowError, match="login failed"):
        reader.list_charts()
    reader.close()
