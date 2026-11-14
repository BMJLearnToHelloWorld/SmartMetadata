# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage workflow wiring: the runner dispatches ``lineage`` to
LineageWorkflow, the workflow binds its REST client into the
source, and a full run over a fake HTTP catalog writes lineage
edges and Query entities through the sink."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import unquote

import httpx

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    DatabaseRow,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
    ViewRow,
)
from smartmetadata_ingestion.connectors.postgres_lineage import PostgresLineageSource
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.workflow import LineageWorkflow
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord
from smartmetadata_ingestion.runner import run_workflow
from smartmetadata_ingestion.workflow import MetadataWorkflow

SERVICE = "svc"
DB = "db"
SCHEMA = "public"
ORDERS = f"{SERVICE}.{DB}.{SCHEMA}.orders"
TARGET = f"{SERVICE}.{DB}.{SCHEMA}.target"
ORDERS_V = f"{SERVICE}.{DB}.{SCHEMA}.orders_v"


def _server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="test-token"),
    )


def _workflow_config(**source_overrides: Any) -> WorkflowConfig:
    source_values: dict[str, Any] = {
        "type": "postgres-lineage",
        "service_name": SERVICE,
        "connection": {
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": DB,
            "databaseSchema": SCHEMA,
        },
    }
    source_values.update(source_overrides)
    return WorkflowConfig(
        workflow=WorkflowSettings(name="svc-lineage", type="lineage"),
        server=_server(),
        source=SourceConfig(**source_values),
    )


class _RecordingSource(LineageSource):
    """A lineage source that records the bound client and yields one
    canned edge, without touching any channel."""

    def __init__(self, config: SourceConfig) -> None:
        super().__init__(config, engine_key="postgres", dialect=Dialect.POSTGRES)
        self.bound_client: Any = None

    def bind_client(self, client) -> None:
        super().bind_client(client)
        self.bound_client = client

    def produce(self):
        yield LineageRecord(
            from_entity=LineageEndpoint(type="table", fqn=ORDERS),
            to_entity=LineageEndpoint(type="table", fqn=TARGET),
            source="QueryLineage",
            sql_query="SELECT 1",
        )


class _RecordingSink:
    def __init__(self) -> None:
        self.written: list[WorkflowRecord] = []

    def write(self, record: WorkflowRecord) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None

    def close(self) -> None:
        return None


def test_runner_dispatches_lineage_and_binds_the_client() -> None:
    assert issubclass(LineageWorkflow, MetadataWorkflow)
    config = _workflow_config()
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={}))
    client = RestClient(_server(), transport=transport)
    source = _RecordingSource(config.source)
    sink = _RecordingSink()
    report = run_workflow(config, client=client, source=source, sink=sink)
    assert source.bound_client is client
    assert report.succeeded == 1
    assert report.failed == 0
    assert len(sink.written) == 1
    client.close()


def test_full_lineage_run_over_fake_http_catalog(tmp_path) -> None:
    seen: list[tuple[str, str, Any]] = []
    tables = {
        ORDERS: {
            "id": "id-orders",
            "fullyQualifiedName": ORDERS,
            "name": "orders",
            "columns": [{"name": "id"}, {"name": "email"}],
        },
        TARGET: {
            "id": "id-target",
            "fullyQualifiedName": TARGET,
            "name": "target",
            "columns": [{"name": "id"}, {"name": "email"}],
        },
        ORDERS_V: {
            "id": "id-orders-v",
            "fullyQualifiedName": ORDERS_V,
            "name": "orders_v",
            "columns": [{"name": "id"}, {"name": "email"}],
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, path, body))
        if request.method == "GET" and path.startswith("/api/v1/tables/name/"):
            fqn = path[len("/api/v1/tables/name/"):]
            entity = tables.get(fqn)
            if entity is None:
                return httpx.Response(404, json={"message": "not found"})
            return httpx.Response(200, json=entity)
        if request.method == "GET" and path == "/api/v1/tables":
            return httpx.Response(200, json={"data": [], "paging": {}})
        if request.method == "GET" and path.startswith("/api/v1/queries/name/"):
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "GET" and path.startswith("/api/v1/lineage/"):
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "PUT" and path == "/api/v1/queries":
            return httpx.Response(200, json={"id": "query-id", "name": "query-name"})
        if request.method == "PUT" and path.startswith("/api/v1/lineage/"):
            return httpx.Response(200, json={})
        if request.method == "PUT" and path.startswith("/api/v1/queries/"):
            return httpx.Response(200, json={})
        return httpx.Response(404, json={"message": "unexpected"})

    log_file = tmp_path / "query_log.csv"
    log_file.write_text(
        "query_text,user_name,start_time,end_time,duration,cost\n"
        "INSERT INTO public.target (id) SELECT id FROM public.orders,alice,"
        "2026-11-13 09:00:00.000,,5,\n",
        encoding="utf-8",
    )
    config = _workflow_config(
        query_log_file_path=str(log_file),
        process_stored_procedure_lineage=False,
    )
    catalog = SequenceCatalogReader(
        databases=[DatabaseRow(DB)],
        schemas=[SchemaRow(DB, SCHEMA)],
        tables=[
            TableRow(DB, SCHEMA, "orders", "BASE TABLE"),
            TableRow(DB, SCHEMA, "orders_v", "VIEW"),
        ],
        views=[
            ViewRow(DB, SCHEMA, "orders_v", "SELECT id, email FROM public.orders"),
        ],
    )
    source = PostgresLineageSource(config.source, catalog=catalog)
    client = RestClient(_server(), transport=httpx.MockTransport(handler))
    report = run_workflow(config, client=client, source=source)
    client.close()

    assert report.failed == 0
    assert report.succeeded == 3
    methods_paths = [(method, path) for method, path, _ in seen]
    lineage_puts = [
        (method, path)
        for method, path in methods_paths
        if method == "PUT" and path.startswith("/api/v1/lineage/")
    ]
    assert len(lineage_puts) == 2
    query_puts = [
        body
        for method, path, body in seen
        if method == "PUT" and path == "/api/v1/queries"
    ]
    assert len(query_puts) == 1
    assert query_puts[0]["processedLineage"] is True
    assert query_puts[0]["service"] == SERVICE
    usage_links = [
        body
        for method, path, body in seen
        if method == "PUT" and path == "/api/v1/queries/query-id/usage"
    ]
    assert len(usage_links) == 2


def test_engine_gated_query_channel_counts_a_source_warning() -> None:
    # C-11/B-4: a lineage run whose only channel is engine-gated
    # reports one source-step warning for the skipped channel.
    config = _workflow_config(
        process_view_lineage=False,
        process_stored_procedure_lineage=False,
        process_cross_database_lineage=False,
    )
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={}))
    client = RestClient(_server(), transport=transport)
    source = LineageSource(config.source, engine_key="doris", dialect=Dialect.ANSI)
    sink = _RecordingSink()
    workflow = LineageWorkflow(config, client=client, source=source, sink=sink)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert sink.written == []
    assert workflow.source_status.warnings == 1
    assert workflow.processor_status.warnings == 0
    assert workflow.sink_status.warnings == 0
    client.close()
