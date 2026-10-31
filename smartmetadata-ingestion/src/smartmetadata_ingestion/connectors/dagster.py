# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Dagster pipeline connector (Metadata + Connection only).

Official OM ``pipeline/dagster`` BaseSpec is Metadata + Connection.
Connection fields 1:1 with ``dagsterConnection``: host (required) + token/timeout/
stripAssetKeyPrefixLength. No lineage/usage/sampler invent.
OSS ``plugins["dagster"]`` pins ``dagster_graphql>=1.8.0`` (+ postgres commons in
upstream setup.py); P0 GraphQL reads use shared httpx (BehaviorMatched unit).
Live dagster_graphql client path remains Partial.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

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
    "DagsterSource",
    "DagsterGraphqlCatalogReader",
    "SequencePipelineCatalogReader",
    "PipelineRow",
    "PipelineTaskRow",
]

_REPOSITORIES_QUERY = """
query SmartMetadataRepositories {
  repositoriesOrError {
    __typename
    ... on RepositoryConnection {
      nodes {
        name
        location {
          name
        }
        jobs {
          name
          description
        }
      }
    }
    ... on PythonError {
      message
    }
  }
}
""".strip()


class DagsterGraphqlCatalogReader:
    """Reads jobs via Dagster GraphQL ``repositoriesOrError`` (httpx)."""

    def __init__(
        self,
        *,
        host: str,
        token: str | None = None,
        timeout_seconds: float = 1000.0,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        if not host or not str(host).strip():
            raise WorkflowError("dagster host is required")
        self._host = str(host).rstrip("/")
        self._graphql_url = self._host if self._host.endswith("/graphql") else f"{self._host}/graphql"
        self._owns_client = client is None
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if token:
            headers["Dagster-Cloud-Api-Token"] = str(token)
            headers["Authorization"] = f"Bearer {token}"
        self._client = client or httpx.Client(
            transport=transport,
            timeout=timeout_seconds,
            headers=headers,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def list_pipelines(self) -> Sequence[PipelineRow]:
        payload = self._graphql(_REPOSITORIES_QUERY)
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            errors = payload.get("errors") if isinstance(payload, dict) else None
            raise WorkflowError(f"dagster graphql repositoriesOrError failed: {errors or payload}")
        block = data.get("repositoriesOrError")
        if not isinstance(block, dict):
            return []
        typename = block.get("__typename")
        if typename == "PythonError":
            raise WorkflowError(f"dagster graphql PythonError: {block.get('message')}")
        nodes = block.get("nodes") or []
        rows: list[PipelineRow] = []
        for repo in nodes:
            if not isinstance(repo, dict):
                continue
            repo_name = str(repo.get("name") or "repo")
            location = repo.get("location") if isinstance(repo.get("location"), dict) else {}
            location_name = str(location.get("name") or "")
            jobs = repo.get("jobs") or []
            for job in jobs:
                if not isinstance(job, dict):
                    continue
                name = job.get("name")
                if not name:
                    continue
                # Prefer location/repo-qualified name when multiple repos share job names.
                qualified = str(name)
                if location_name:
                    qualified = f"{location_name}.{name}"
                elif repo_name:
                    qualified = f"{repo_name}.{name}"
                description = job.get("description")
                source_url = f"{self._host}/locations/{location_name}/jobs/{name}" if location_name else None
                rows.append(
                    PipelineRow(
                        name=qualified,
                        display_name=str(name),
                        description=str(description) if description else None,
                        source_url=source_url,
                        pipeline_location=location_name or None,
                        tasks=(
                            PipelineTaskRow(
                                name=str(name),
                                display_name=str(name),
                                description=str(description) if description else None,
                                task_type="Job",
                            ),
                        ),
                    )
                )
        return rows

    def _graphql(self, query: str, variables: dict[str, Any] | None = None) -> Any:
        body: dict[str, Any] = {"query": query}
        if variables:
            body["variables"] = variables
        response = self._client.post(self._graphql_url, json=body)
        response.raise_for_status()
        return response.json()


@register_source("dagster")
class DagsterSource:
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
        connection_config = _public_dagster_connection(
            dict(self._config.connection or {}),
            store_secrets=self._config.store_connection_secrets,
        )
        return PipelineServiceRecord(
            name=self._config.service_name,
            service_type="Dagster",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _require_reader(self) -> PipelineCatalogReader:
        if self._reader is not None:
            return self._reader
        raw = self._config.connection or {}
        host = raw.get("host") or raw.get("hostPort") or raw.get("host_port")
        if not host:
            raise WorkflowError("dagster source.connection.host is required")
        token = raw.get("token")
        timeout = raw.get("timeout", 1000)
        try:
            timeout_seconds = float(timeout)
        except (TypeError, ValueError):
            timeout_seconds = 1000.0
        return DagsterGraphqlCatalogReader(
            host=str(host),
            token=str(token) if token else None,
            timeout_seconds=timeout_seconds,
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


def _public_dagster_connection(raw: dict[str, Any], *, store_secrets: bool = False) -> dict[str, Any]:
    """Emit official dagsterConnection shape; omit token unless store_connection_secrets."""
    out: dict[str, Any] = {"type": "Dagster"}
    host = raw.get("host") or raw.get("hostPort") or raw.get("host_port")
    if host:
        out["host"] = str(host)
    if store_secrets and raw.get("token") is not None:
        out["token"] = str(raw["token"])
    timeout = raw.get("timeout")
    if timeout is not None:
        try:
            out["timeout"] = int(timeout)
        except (TypeError, ValueError):
            pass
    strip = raw.get("stripAssetKeyPrefixLength") or raw.get("strip_asset_key_prefix_length")
    if strip is not None:
        try:
            out["stripAssetKeyPrefixLength"] = int(strip)
        except (TypeError, ValueError):
            pass
    return out
