# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#

"""Apache Superset dashboard connector (API mode).

Official OM ``dashboard/superset`` BaseSpec is Metadata + Connection only.
P0 lands API connection (provider/username/password) 1:1 with
``supersetApiConnection``; DB-backed Superset connection modes are deferred.
No lineage/usage invent (service_spec has neither).
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
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    WorkflowRecord,
)


@dataclass(frozen=True, slots=True)
class ChartRow:
    name: str
    display_name: str | None = None
    description: str | None = None
    chart_type: str | None = None
    source_url: str | None = None


@dataclass(frozen=True, slots=True)
class DashboardRow:
    name: str
    display_name: str | None = None
    description: str | None = None
    source_url: str | None = None
    project: str | None = None
    chart_names: list[str] = field(default_factory=list)
    published: bool = True


class DashboardCatalogReader(Protocol):
    def list_charts(self) -> Sequence[ChartRow]: ...

    def list_dashboards(self) -> Sequence[DashboardRow]: ...


class SequenceDashboardCatalogReader:
    def __init__(
        self,
        *,
        charts: Sequence[ChartRow] = (),
        dashboards: Sequence[DashboardRow] = (),
    ) -> None:
        self._charts = list(charts)
        self._dashboards = list(dashboards)

    def list_charts(self) -> Sequence[ChartRow]:
        return self._charts

    def list_dashboards(self) -> Sequence[DashboardRow]:
        return self._dashboards


class SupersetHttpCatalogReader:
    """Reads charts/dashboards from Superset REST ``/api/v1``."""

    def __init__(
        self,
        *,
        host_port: str,
        username: str,
        password: str,
        provider: str = "db",
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
        timeout_seconds: float = 30.0,
        include_draft: bool = True,
    ) -> None:
        if not host_port.strip():
            raise WorkflowError("superset hostPort is required")
        if not username or not password:
            raise WorkflowError("superset API connection requires username and password")
        self._base = host_port.rstrip("/")
        self._username = username
        self._password = password
        self._provider = provider or "db"
        self._include_draft = include_draft
        self._token: str | None = None
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout_seconds, transport=transport)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def list_charts(self) -> Sequence[ChartRow]:
        rows: list[ChartRow] = []
        for item in self._paginate("/api/v1/chart/"):
            chart_id = item.get("id")
            if chart_id is None:
                continue
            name = str(chart_id)
            slice_name = item.get("slice_name") or item.get("name")
            url = item.get("url")
            source_url = f"{self._base}{url}" if isinstance(url, str) and url.startswith("/") else (
                str(url) if url else None
            )
            viz = item.get("viz_type") or item.get("chart_type")
            rows.append(
                ChartRow(
                    name=name,
                    display_name=str(slice_name) if slice_name else None,
                    description=_as_str(item.get("description")),
                    chart_type=_map_chart_type(viz),
                    source_url=source_url,
                )
            )
        return rows

    def list_dashboards(self) -> Sequence[DashboardRow]:
        rows: list[DashboardRow] = []
        for item in self._paginate("/api/v1/dashboard/"):
            dash_id = item.get("id")
            if dash_id is None:
                continue
            published = bool(item.get("published", True))
            if not self._include_draft and not published:
                continue
            name = str(dash_id)
            title = item.get("dashboard_title") or item.get("title") or item.get("name")
            url = item.get("url")
            source_url = f"{self._base}{url}" if isinstance(url, str) and url.startswith("/") else (
                str(url) if url else None
            )
            chart_names = _chart_ids_from_dashboard(item)
            rows.append(
                DashboardRow(
                    name=name,
                    display_name=str(title) if title else None,
                    description=_as_str(item.get("description")),
                    source_url=source_url,
                    project=_as_str(item.get("status")),
                    chart_names=chart_names,
                    published=published,
                )
            )
        return rows

    def _paginate(self, path: str, *, page_size: int = 25) -> list[dict[str, Any]]:
        page = 0
        out: list[dict[str, Any]] = []
        total = None
        while True:
            q = quote(f"(page:{page},page_size:{page_size})", safe="(),:_")
            payload = self._get(f"{self._base}{path}?q={q}")
            if not isinstance(payload, dict):
                break
            if total is None:
                total = int(payload.get("count") or 0)
            result = payload.get("result") or []
            if isinstance(result, list):
                for item in result:
                    if isinstance(item, dict):
                        out.append(item)
            page += 1
            if not result or (total is not None and page * page_size > total):
                break
        return out

    def _login(self) -> str:
        if self._token:
            return self._token
        response = self._client.post(
            f"{self._base}/api/v1/security/login",
            json={
                "username": self._username,
                "password": self._password,
                "provider": self._provider,
                "refresh": True,
            },
        )
        if response.status_code >= 400:
            raise WorkflowError(
                f"superset login failed with HTTP {response.status_code}"
            )
        payload = response.json() if response.content else {}
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not token:
            raise WorkflowError("superset login response missing access_token")
        self._token = str(token)
        return self._token

    def _get(self, url: str) -> Any:
        token = self._login()
        response = self._client.get(url, headers={"Authorization": f"Bearer {token}"})
        if response.status_code >= 400:
            raise WorkflowError(f"GET {url} failed with HTTP {response.status_code}")
        if not response.content:
            return None
        return response.json()


@register_source("superset")
class SupersetSource:
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
        connection_config = _public_superset_connection(raw)
        return DashboardServiceRecord(
            name=self._config.service_name,
            service_type="Superset",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _build_reader(self) -> DashboardCatalogReader:
        raw = dict(self._config.connection or {})
        host = str(raw.get("hostPort") or raw.get("host_port") or "").strip()
        nested = raw.get("connection") if isinstance(raw.get("connection"), dict) else {}
        username = str(
            nested.get("username") or raw.get("username") or ""
        ).strip()
        password = str(nested.get("password") or raw.get("password") or "")
        provider = str(nested.get("provider") or raw.get("provider") or "db")
        return SupersetHttpCatalogReader(
            host_port=host,
            username=username,
            password=password,
            provider=provider,
            transport=self._transport,
            include_draft=True,
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


def _public_superset_connection(raw: dict[str, Any]) -> dict[str, Any]:
    """Emit official connection shape; omit secrets unless store_connection_secrets."""
    host = raw.get("hostPort") or raw.get("host_port")
    nested = raw.get("connection") if isinstance(raw.get("connection"), dict) else {}
    provider = nested.get("provider") or raw.get("provider") or "db"
    username = nested.get("username") or raw.get("username")
    out: dict[str, Any] = {"type": "Superset"}
    if host:
        out["hostPort"] = str(host)
    api: dict[str, Any] = {"provider": str(provider)}
    if username:
        api["username"] = str(username)
    # password intentionally omitted from stored catalog connection by default
    out["connection"] = api
    return out


def _chart_ids_from_dashboard(item: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for key in ("charts", "chart_ids", "position"):
        value = item.get(key)
        if isinstance(value, list):
            for entry in value:
                if isinstance(entry, (int, str)):
                    names.append(str(entry))
                elif isinstance(entry, dict) and entry.get("id") is not None:
                    names.append(str(entry["id"]))
        elif isinstance(value, dict):
            for meta in value.values():
                if not isinstance(meta, dict):
                    continue
                meta_id = meta.get("meta", {}).get("chartId") if isinstance(meta.get("meta"), dict) else None
                if meta_id is not None:
                    names.append(str(meta_id))
    # preserve order, unique
    seen: set[str] = set()
    ordered: list[str] = []
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        ordered.append(name)
    return ordered


def _map_chart_type(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).lower()
    mapping = {
        "line": "Line",
        "bar": "Bar",
        "pie": "Pie",
        "table": "Table",
        "area": "Area",
        "scatter": "Scatter",
        "histogram": "Histogram",
        "heatmap": "Heatmap",
        "box_plot": "BoxPlot",
        "big_number": "Text",
        "big_number_total": "Text",
    }
    return mapping.get(text, "Other")


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
