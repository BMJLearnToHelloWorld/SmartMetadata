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
from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import ProcessorConfig, SinkConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.processors.identity import build_processors
from smartmetadata_ingestion.records import (
    ColumnRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageEndpoint,
    LineageRecord,
    MessagingServiceRecord,
    SchemaRecord,
    TableRecord,
    TopicRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import MetadataRestSink, build_sink


def test_sink_sends_optional_fields(workflow_config) -> None:
    bodies: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.content.decode())
        return httpx.Response(200, json={"id": "1"})

    client = RestClient(workflow_config.server, transport=httpx.MockTransport(handler))
    sink = MetadataRestSink(client)
    sink.write(
        DatabaseServiceRecord(
            name="warehouse",
            service_type="Postgres",
            display_name="Warehouse",
            description="prod",
        )
    )
    sink.write(DatabaseRecord(name="analytics", service="warehouse", description="db"))
    sink.write(SchemaRecord(name="public", database="warehouse.analytics", description="s"))
    sink.write(
        TableRecord(
            name="orders",
            database_schema="warehouse.analytics.public",
            description="orders",
            columns=[
                ColumnRecord(
                    name="id",
                    data_type="INT",
                    data_type_display="integer",
                    description="pk",
                    ordinal_position=1,
                    data_length=None,
                )
            ],
        )
    )
    sink.write(
        LineageRecord(
            from_entity=LineageEndpoint(type="table", fqn="a"),
            to_entity=LineageEndpoint(type="table", fqn="b"),
            description="view",
            sql_query="SELECT 1",
        )
    )
    sink.write(
        MessagingServiceRecord(
            name="events",
            service_type="Kafka",
            display_name="Events",
        )
    )
    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=3,
            message_schema={"schemaType": "Avro", "schemaText": "{}"},
        )
    )
    sink.flush()
    assert any("displayName" in body for body in bodies)
    assert any("sqlQuery" in body for body in bodies)
    assert any("messageSchema" in body for body in bodies)
    assert any('"partitions": 3' in body or '"partitions":3' in body for body in bodies)
    assert build_sink(workflow_config, client).written == []


def test_unknown_processor_and_sink_are_rejected(workflow_config) -> None:
    workflow_config.processors = [ProcessorConfig(type="unknown")]
    with pytest.raises(WorkflowError, match="unsupported processor"):
        build_processors(workflow_config)
    workflow_config.sink = SinkConfig(type="metadata-rest")
    workflow_config.sink.type = "files"  # type: ignore[misc]
    with pytest.raises(WorkflowError, match="unsupported sink"):
        build_sink(workflow_config, client=None)  # type: ignore[arg-type]
