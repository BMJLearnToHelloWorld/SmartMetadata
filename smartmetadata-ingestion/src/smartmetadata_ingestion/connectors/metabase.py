# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#

"""Metabase dashboard connector.

Official OM ``dashboard/metabase`` BaseSpec is Metadata + Connection only.
Connection fields 1:1 with ``metabaseConnection``: hostPort + username/password
or apiKey. No lineage/usage invent.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.connectors.superset import (
    ChartRow,
    DashboardCatalogReader,
    DashboardRow,
    SequenceDashboardCatalogReader,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    WorkflowRecord,
)

# re-export for tests
__all__ = [
    "MetabaseSource",
    "MetabaseHttpCatalogReader",
    "SequenceDashboardCatalogReader",
    "ChartRow",
    "DashboardRow",
]


class MetabaseHttpCatalogReader:
    """Reads cards/dashboards from Metabase ``/api``."""

    def __init__(
        self,
        *,
        host_port: str,
        username: str | None = None,
        password: str | None = None,
        api_key: str | None = None,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        if not host_port.strip():
            raise WorkflowError("metabase hostPort is required")
        if not api_key and not (username and password):
            raise WorkflowError(
                "metabase connection requires apiKey or username+password"
            )
        self._base = host_port.rstrip("/")
        self._username = username
        self._password = password
        self._api_key = api_key
        self._session: str | None = None
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout_seconds, transport=transport)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def list_charts(self) -> Sequence[ChartRow]:
        payload = self._get(f"{self._base}/api/card")
        items = payload if isinstance(payload, list) else []
        rows: list[ChartRow] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            card_id = item.get("id")
            if card_id is None:
                continue
            name = str(card_id)
            display = item.get("name")
            display_type = item.get("display")
            rows.append(
                ChartRow(
                    name=name,
                    display_name=str(display) if display else None,
                    description=_as_str(item.get("description")),
                    chart_type=_map_chart_type(display_type),
                    source_url=f"{self._base}/question/{quote(str(card_id), safe='')}",
                )
            )
        return rows

    def list_dashboards(self) -> Sequence[DashboardRow]:
        payload = self._get(f"{self._base}/api/dashboard")
        items = payload if isinstance(payload, list) else []
        rows: list[DashboardRow] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            dash_id = item.get("id")
            if dash_id is None:
                continue
            detail = self._get(f"{self._base}/api/dashboard/{quote(str(dash_id), safe='')}")
            detail_obj = detail if isinstance(detail, dict) else item
            chart_names: list[str] = []
            for dashcard in detail_obj.get("dashcards") or detail_obj.get("ordered_cards") or []:
                if not isinstance(dashcard, dict):
                    continue
                card = dashcard.get("card") if isinstance(dashcard.get("card"), dict) else {}
                card_id = card.get("id") or dashcard.get("card_id")
                if card_id is not None:
                    chart_names.append(str(card_id))
            collection = detail_obj.get("collection") if isinstance(detail_obj.get("collection"), dict) else {}
            project = collection.get("name") or detail_obj.get("collection_id")
            display = detail_obj.get("name") or item.get("name")
            rows.append(
                DashboardRow(
                    name=str(dash_id),
                    display_name=str(display) if display else None,
                    description=_as_str(detail_obj.get("description") or item.get("description")),
                    source_url=f"{self._base}/dashboard/{quote(str(dash_id), safe='')}",
                    project=str(project) if project is not None else None,
                    chart_names=chart_names,
                )
            )
        return rows

    def _headers(self) -> dict[str, str]:
        if self._api_key:
            return {"X-API-KEY": self._api_key}
        if not self._session:
            response = self._client.post(
                f"{self._base}/api/session/",
                json={"username": self._username, "password": self._password},
                headers={"Content-Type": "application/json", "Accept": "*/*"},
            )
            if response.status_code >= 400:
                raise WorkflowError(
                    f"metabase session failed with HTTP {response.status_code}"
                )
            payload = response.json() if response.content else {}
            session = payload.get("id") if isinstance(payload, dict) else None
            if not session:
                raise WorkflowError("metabase session response missing id")
            self._session = str(session)
        return {"X-Metabase-Session": self._session}

    def _get(self, url: str) -> Any:
        response = self._client.get(url, headers=self._headers())
        if response.status_code >= 400:
            raise WorkflowError(f"GET {url} failed with HTTP {response.status_code}")
        if not response.content:
            return None
        return response.json()


@register_source("metabase")
class MetabaseSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: DashboardCatalogReader | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._transport = transport

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._reader or self._build_reader()
        charts = self._selected_charts(reader)
        chart_by_name = {chart.name: chart for chart in charts}
        for chart in charts:
            yield ChartRecord(
                name=chart.name,
                service=self._config.service_name,
                display_name=chart.display_name,
                description=chart.description,
                chart_type=chart.chart_type,
                source_url=chart.source_url,
            )
        for dashboard in self._selected_dashboards(reader):
            linked = [
                f"{self._config.service_name}.{name}"
                for name in dashboard.chart_names
                if name in chart_by_name
            ]
            yield DashboardRecord(
                name=dashboard.name,
                service=self._config.service_name,
                display_name=dashboard.display_name,
                description=dashboard.description,
                source_url=dashboard.source_url,
                project=dashboard.project,
                charts=linked or None,
            )

    def _service_record(self) -> DashboardServiceRecord:
        raw = dict(self._config.connection or {})
        connection_config = _public_metabase_connection(raw)
        return DashboardServiceRecord(
            name=self._config.service_name,
            service_type="Metabase",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _build_reader(self) -> DashboardCatalogReader:
        raw = dict(self._config.connection or {})
        host = str(raw.get("hostPort") or raw.get("host_port") or "").strip()
        api_key = raw.get("apiKey") or raw.get("api_key")
        return MetabaseHttpCatalogReader(
            host_port=host,
            username=_as_str(raw.get("username")),
            password=str(raw["password"]) if raw.get("password") else None,
            api_key=str(api_key) if api_key else None,
            transport=self._transport,
        )

    def _selected_charts(self, reader: DashboardCatalogReader) -> list[ChartRow]:
        include = self._config.include_charts
        exclude = self._config.exclude_charts
        selected: list[ChartRow] = []
        for chart in reader.list_charts():
            key = chart.display_name or chart.name
            if not is_selected(key, include=include, exclude=exclude) and not is_selected(
                chart.name, include=include, exclude=exclude
            ):
                continue
            selected.append(chart)
        return selected

    def _selected_dashboards(self, reader: DashboardCatalogReader) -> list[DashboardRow]:
        include = self._config.include_dashboards
        exclude = self._config.exclude_dashboards
        selected: list[DashboardRow] = []
        for dashboard in reader.list_dashboards():
            key = dashboard.display_name or dashboard.name
            if not is_selected(key, include=include, exclude=exclude) and not is_selected(
                dashboard.name, include=include, exclude=exclude
            ):
                continue
            selected.append(dashboard)
        return selected


def _public_metabase_connection(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"type": "Metabase"}
    host = raw.get("hostPort") or raw.get("host_port")
    if host:
        out["hostPort"] = str(host)
    if raw.get("username"):
        out["username"] = str(raw["username"])
    # password / apiKey omitted from catalog connection by default
    return out


def _map_chart_type(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).lower()
    mapping = {
        "line": "Line",
        "bar": "Bar",
        "row": "Bar",
        "pie": "Pie",
        "table": "Table",
        "area": "Area",
        "scatter": "Scatter",
        "funnel": "Other",
        "progress": "Other",
        "scalar": "Text",
        "smartscalar": "Text",
        "waterfall": "Other",
        "combo": "Other",
        "map": "Map",
        "sankey": "Graph",
    }
    return mapping.get(text, "Other")


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
