# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Prefect pipeline connector (Metadata + Connection only).

Official OM ``pipeline/prefect`` BaseSpec is Metadata + Connection.
Connection fields 1:1 with ``prefectConnection``: hostPort + authType
(cloudAuth|serverAuth) + optional numberOfStatus. No lineage/usage/sampler invent.
OSS ``plugins["prefect"] = {}`` — HTTP via shared httpx.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any
from urllib.parse import quote

import httpx

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.pipeline_common import (
    PipelineCatalogReader,
    PipelineRow,
    PipelineTaskRow,
    SequencePipelineCatalogReader,
    tasks_payload,
)
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import PipelineRecord, PipelineServiceRecord, WorkflowRecord

__all__ = [
    "PrefectSource",
    "PrefectHttpCatalogReader",
    "SequencePipelineCatalogReader",
    "PipelineRow",
    "PipelineTaskRow",
]


class PrefectHttpCatalogReader:
    """Reads flows from Prefect REST ``/flows/filter`` (Cloud or Server)."""

    def __init__(
        self,
        *,
        host_port: str,
        auth_type: dict[str, Any] | None = None,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        if not host_port or not str(host_port).strip():
            raise WorkflowError("prefect hostPort is required")
        auth = dict(auth_type or {})
        self._host = str(host_port).rstrip("/")
        self._auth = auth
        self._owns_client = client is None
        headers: dict[str, str] = {"Accept": "application/json"}
        auth_arg: httpx.Auth | tuple[str, str] | None = None
        api_key = auth.get("apiKey") or auth.get("api_key")
        account_id = auth.get("accountId") or auth.get("account_id")
        workspace_id = auth.get("workspaceId") or auth.get("workspace_id")
        if api_key and account_id and workspace_id:
            # Prefect Cloud workspace-scoped API base.
            self._base = (
                f"{self._host}/api/accounts/{quote(str(account_id), safe='')}"
                f"/workspaces/{quote(str(workspace_id), safe='')}"
            )
            headers["Authorization"] = f"Bearer {api_key}"
        else:
            # Self-hosted Prefect Server. hostPort may already include /api.
            if self._host.endswith("/api"):
                self._base = self._host
            else:
                self._base = f"{self._host}/api"
            auth_string = auth.get("authString") or auth.get("auth_string") or ""
            if isinstance(auth_string, str) and auth_string.strip() and ":" in auth_string:
                user, _, password = auth_string.partition(":")
                auth_arg = (user, password)
        self._client = client or httpx.Client(
            transport=transport,
            timeout=timeout_seconds,
            headers=headers,
            auth=auth_arg,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def list_pipelines(self) -> Sequence[PipelineRow]:
        offset = 0
        limit = 200
        rows: list[PipelineRow] = []
        while True:
            payload = self._post(
                f"{self._base}/flows/filter",
                body={"limit": limit, "offset": offset, "sort": "NAME_ASC"},
            )
            if not isinstance(payload, list):
                break
            if not payload:
                break
            for item in payload:
                if not isinstance(item, dict):
                    continue
                flow_id = item.get("id")
                name = item.get("name")
                if not name:
                    continue
                display = item.get("name")
                description = item.get("description")
                source_url = None
                if flow_id is not None:
                    source_url = f"{self._host}/flows/flow/{flow_id}"
                rows.append(
                    PipelineRow(
                        name=str(name),
                        display_name=str(display) if display else None,
                        description=str(description) if description else None,
                        source_url=source_url,
                    )
                )
            if len(payload) < limit:
                break
            offset += limit
        return rows

    def _post(self, url: str, *, body: dict[str, Any]) -> Any:
        response = self._client.post(url, json=body)
        response.raise_for_status()
        return response.json()


@register_source("prefect")
class PrefectSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: PipelineCatalogReader | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._transport = transport

    def prepare(self) -> None:
        reader = self._require_reader()
        try:
            reader.list_pipelines()
        finally:
            close = getattr(reader, "close", None)
            if callable(close) and reader is not self._reader:
                close()

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._require_reader()
        try:
            for pipeline in self._selected_pipelines(reader):
                yield PipelineRecord(
                    name=pipeline.name,
                    service=self._config.service_name,
                    display_name=pipeline.display_name,
                    description=pipeline.description,
                    source_url=pipeline.source_url,
                    concurrency=pipeline.concurrency,
                    pipeline_location=pipeline.pipeline_location,
                    schedule_interval=pipeline.schedule_interval,
                    tasks=tasks_payload(pipeline.tasks),
                )
        finally:
            close = getattr(reader, "close", None)
            if callable(close) and reader is not self._reader:
                close()

    def _service_record(self) -> PipelineServiceRecord:
        connection_config = _public_prefect_connection(
            dict(self._config.connection or {}),
            store_secrets=self._config.store_connection_secrets,
        )
        return PipelineServiceRecord(
            name=self._config.service_name,
            service_type="Prefect",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _require_reader(self) -> PipelineCatalogReader:
        if self._reader is not None:
            return self._reader
        raw = self._config.connection or {}
        host = raw.get("hostPort") or raw.get("host_port")
        if not host:
            raise WorkflowError("prefect source.connection.hostPort is required")
        auth = raw.get("authType") or raw.get("auth_type") or {}
        if not isinstance(auth, dict):
            auth = {}
        # Allow flattened cloud fields on connection root for YAML convenience.
        if not auth:
            if raw.get("apiKey") or raw.get("accountId"):
                auth = {
                    "apiKey": raw.get("apiKey"),
                    "accountId": raw.get("accountId"),
                    "workspaceId": raw.get("workspaceId"),
                }
            elif "authString" in raw or "auth_string" in raw:
                auth = {"authString": raw.get("authString") or raw.get("auth_string") or ""}
        if not auth and not (raw.get("apiKey") and raw.get("accountId")):
            # Server with empty auth is valid; require explicit authType {} or server key.
            if "authType" not in raw and "auth_type" not in raw:
                raise WorkflowError(
                    "prefect source.connection.authType is required "
                    "(cloudAuth apiKey+accountId+workspaceId or serverAuth)"
                )
        return PrefectHttpCatalogReader(
            host_port=str(host),
            auth_type=dict(auth),
            transport=self._transport,
        )

    def _selected_pipelines(self, reader: PipelineCatalogReader) -> list[PipelineRow]:
        include = self._config.include_pipelines
        exclude = self._config.exclude_pipelines
        selected: list[PipelineRow] = []
        for pipeline in reader.list_pipelines():
            if not is_selected(pipeline.name, include=include, exclude=exclude):
                continue
            selected.append(pipeline)
        return selected


def _public_prefect_connection(raw: dict[str, Any], *, store_secrets: bool = False) -> dict[str, Any]:
    """Emit official prefectConnection shape; omit secrets unless store_connection_secrets."""
    out: dict[str, Any] = {"type": "Prefect"}
    host = raw.get("hostPort") or raw.get("host_port")
    if host:
        out["hostPort"] = str(host)
    auth_raw = raw.get("authType") or raw.get("auth_type")
    auth_out: dict[str, Any] = {}
    if isinstance(auth_raw, dict) and auth_raw:
        account_id = auth_raw.get("accountId") or auth_raw.get("account_id")
        workspace_id = auth_raw.get("workspaceId") or auth_raw.get("workspace_id")
        api_key = auth_raw.get("apiKey") or auth_raw.get("api_key")
        auth_string = auth_raw.get("authString") or auth_raw.get("auth_string")
        if account_id is not None or workspace_id is not None or api_key is not None:
            if account_id is not None:
                auth_out["accountId"] = str(account_id)
            if workspace_id is not None:
                auth_out["workspaceId"] = str(workspace_id)
            if store_secrets and api_key is not None:
                auth_out["apiKey"] = str(api_key)
        else:
            # serverAuth — authString may be empty
            if store_secrets and auth_string is not None:
                auth_out["authString"] = str(auth_string)
            elif auth_string is not None and not store_secrets:
                # still emit key presence? omit secret; empty object marks server mode
                pass
            else:
                auth_out = {}
            # Distinguish server vs cloud: if only authString key family, keep empty authType {}
            if not auth_out and ("authString" in auth_raw or "auth_string" in auth_raw):
                auth_out = {}
    elif raw.get("apiKey") or raw.get("accountId"):
        if raw.get("accountId") is not None:
            auth_out["accountId"] = str(raw["accountId"])
        if raw.get("workspaceId") is not None:
            auth_out["workspaceId"] = str(raw["workspaceId"])
        if store_secrets and raw.get("apiKey") is not None:
            auth_out["apiKey"] = str(raw["apiKey"])
    elif "authString" in raw or "auth_type" in raw:
        if store_secrets and raw.get("authString") is not None:
            auth_out["authString"] = str(raw["authString"])
    if auth_raw is not None or auth_out or raw.get("accountId") or "authString" in raw:
        out["authType"] = auth_out
    number = raw.get("numberOfStatus") or raw.get("number_of_status")
    if number is not None:
        try:
            out["numberOfStatus"] = int(number)
        except (TypeError, ValueError):
            pass
    return out
