# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from typing import Any

import httpx
import pytest
from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import ProcessorConfig, SourceConfig
from smartmetadata_ingestion.connectors.kafka import KafkaSource, SequenceTopicReader, TopicRow
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
)
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.progress import CollectingHook
from smartmetadata_ingestion.records import TableRecord
from smartmetadata_ingestion.runner import run_workflow


class RecordingTransport(httpx.BaseTransport):
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        body = request.content.decode() if request.content else ""
        self.calls.append({"method": request.method, "path": request.url.path, "body": body})
        if request.url.path.endswith("/boom"):
            return httpx.Response(500, text="nope")
        return httpx.Response(200, json={"id": "ok", "name": "written"})


def test_runner_writes_source_and_config_lineage(workflow_config) -> None:
    transport = RecordingTransport()
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("public")],
        tables=[TableRow("public", "orders", "BASE TABLE")],
        columns=[ColumnRow("public", "orders", "id", "integer", 1)],
    )
    hook = CollectingHook()
    report = run_workflow(
        workflow_config,
        client=RestClient(workflow_config.server, transport=transport),
        source=PostgresSource(workflow_config.source, reader=reader),
        hook=hook,
    )
    assert report.ok()
    assert report.succeeded == 5  # service, db, schema, table, configured lineage
    paths = [call["path"] for call in transport.calls]
    assert paths == [
        "/api/v1/services/databaseServices",
        "/api/v1/databases",
        "/api/v1/databaseSchemas",
        "/api/v1/tables",
        "/api/v1/lineage/table/name/warehouse.analytics.public.orders/"
        "table/name/warehouse.analytics.public.orders_v",
    ]
    assert '"serviceType":"Postgres"' in transport.calls[0]["body"]
    assert '"databaseSchema":"warehouse.analytics.public"' in transport.calls[3]["body"]
    assert hook.events[-1][1] == "written"


def test_runner_collects_errors_unless_fail_fast(workflow_config) -> None:
    class BoomSink:
        def write(self, record):
            if isinstance(record, TableRecord):
                raise RestError("table write failed", status_code=500)
            return None

        def flush(self) -> None:
            return None

    reader = SequenceCatalogReader(
        schemas=[SchemaRow("public")],
        tables=[TableRow("public", "orders", "BASE TABLE")],
        columns=[ColumnRow("public", "orders", "id", "integer", 1)],
    )
    report = run_workflow(
        workflow_config,
        source=PostgresSource(workflow_config.source, reader=reader),
        sink=BoomSink(),
    )
    assert report.failed == 1
    assert report.succeeded == 4
    assert report.failures[0].kind == "table"

    workflow_config.workflow.fail_fast = True
    with pytest.raises(RestError):
        run_workflow(
            workflow_config,
            source=PostgresSource(workflow_config.source, reader=reader),
            sink=BoomSink(),
        )


def test_runner_writes_kafka_topics(workflow_config) -> None:
    workflow_config.source = SourceConfig(
        type="kafka",
        service_name="events",
        connection={"bootstrapServers": "broker:9092"},
    )
    workflow_config.lineage = []
    transport = RecordingTransport()
    report = run_workflow(
        workflow_config,
        client=RestClient(workflow_config.server, transport=transport),
        source=KafkaSource(
            workflow_config.source,
            reader=SequenceTopicReader([TopicRow(name="orders", partitions=2)]),
        ),
    )
    assert report.ok()
    assert report.succeeded == 2
    paths = [call["path"] for call in transport.calls]
    assert paths == [
        "/api/v1/services/messagingServices",
        "/api/v1/topics",
    ]
    assert '"serviceType":"Kafka"' in transport.calls[0]["body"]
    assert '"partitions":2' in transport.calls[1]["body"].replace(" ", "")


def test_drop_processor_skips_records(workflow_config) -> None:
    workflow_config.source = SourceConfig(type="static", service_name="demo", records=[])
    workflow_config.lineage = []
    workflow_config.processors = [
        ProcessorConfig(type="dropKinds", options={"kinds": ["databaseService"]})
    ]
    transport = RecordingTransport()
    report = run_workflow(
        workflow_config,
        client=RestClient(workflow_config.server, transport=transport),
    )
    assert report.skipped == 1
    assert report.succeeded == 0
    assert transport.calls == []
