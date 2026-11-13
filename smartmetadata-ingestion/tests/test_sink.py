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
    PartitionColumnRecord,
    SchemaRecord,
    TablePartitionRecord,
    TableRecord,
    TopicRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import (
    BulkMetadataRestSink,
    MetadataRestSink,
    _table_payload,
    build_sink,
)


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


def test_table_payload_omits_data_length_when_none() -> None:
    payload = _table_payload(
        TableRecord(
            name="orders",
            database_schema="warehouse.analytics.public",
            columns=[
                ColumnRecord(name="body", data_type="TEXT", data_length=None),
                ColumnRecord(name="email", data_type="VARCHAR", data_length=20),
            ],
        )
    )
    assert "dataLength" not in payload["columns"][0]
    assert payload["columns"][1]["dataLength"] == 20


def test_unknown_processor_and_sink_are_rejected(workflow_config) -> None:
    workflow_config.processors = [ProcessorConfig(type="unknown")]
    with pytest.raises(WorkflowError, match="unsupported processor"):
        build_processors(workflow_config)
    workflow_config.sink = SinkConfig(type="metadata-rest")
    workflow_config.sink.type = "files"  # type: ignore[misc]
    with pytest.raises(WorkflowError, match="unsupported sink"):
        build_sink(workflow_config, client=None)  # type: ignore[arg-type]


def test_sink_writes_topic_sample_data_after_upsert(workflow_config) -> None:
    calls: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.content.decode()))
        return httpx.Response(200, json={"id": "topic-uuid", "name": "orders"})

    client = RestClient(workflow_config.server, transport=httpx.MockTransport(handler))
    sink = MetadataRestSink(client)
    from smartmetadata_ingestion.records import TopicSampleData

    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=1,
            sample_data=TopicSampleData(messages=['{"id": 1}', '{"id": 2}']),
        )
    )
    assert calls == [
        ("PUT", "/api/v1/topics", '{"name":"orders","service":"events","partitions":1}'),
        (
            "PUT",
            "/api/v1/topics/topic-uuid/sampleData",
            '{"messages":["{\\"id\\": 1}","{\\"id\\": 2}"]}',
        ),
    ]


def test_sink_skips_sample_write_when_messages_empty(workflow_config) -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(200, json={"id": "topic-uuid", "name": "orders"})

    client = RestClient(workflow_config.server, transport=httpx.MockTransport(handler))
    sink = MetadataRestSink(client)
    from smartmetadata_ingestion.records import TopicSampleData

    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=1,
            sample_data=TopicSampleData(messages=[]),
        )
    )
    assert calls == ["/api/v1/topics"]


def test_sink_skips_sample_write_when_upsert_has_no_id(workflow_config) -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(200, json={"name": "orders"})

    client = RestClient(workflow_config.server, transport=httpx.MockTransport(handler))
    sink = MetadataRestSink(client)
    from smartmetadata_ingestion.records import TopicSampleData

    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=1,
            sample_data=TopicSampleData(messages=['{"id": 1}']),
        )
    )
    assert calls == ["/api/v1/topics"]


def test_sink_sample_put_failure_fails_the_record(workflow_config) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/sampleData"):
            return httpx.Response(403, json={"message": "forbidden"})
        return httpx.Response(200, json={"id": "topic-uuid", "name": "orders"})

    client = RestClient(workflow_config.server, transport=httpx.MockTransport(handler))
    sink = MetadataRestSink(client)
    from smartmetadata_ingestion.errors import RestError
    from smartmetadata_ingestion.records import TopicSampleData

    with pytest.raises(RestError, match="403"):
        sink.write(
            TopicRecord(
                name="orders",
                service="events",
                partitions=1,
                sample_data=TopicSampleData(messages=['{"id": 1}']),
            )
        )


def test_table_payload_emits_children_array_type_and_partition() -> None:
    payload = _table_payload(
        TableRecord(
            name="events",
            database_schema="svc.db.sales",
            columns=[
                ColumnRecord(
                    name="tags",
                    data_type="ARRAY",
                    array_data_type="INT",
                ),
                ColumnRecord(
                    name="addr",
                    data_type="STRUCT",
                    children=[
                        ColumnRecord(name="s_id", data_type="INT", ordinal_position=0),
                        ColumnRecord(
                            name="s_name",
                            data_type="VARCHAR",
                            data_length=20,
                            ordinal_position=1,
                        ),
                    ],
                ),
            ],
            table_partition=TablePartitionRecord(
                columns=[
                    PartitionColumnRecord(column_name="dt", interval_type="TIME-UNIT"),
                ]
            ),
        )
    )
    assert payload["columns"][0]["arrayDataType"] == "INT"
    assert "children" not in payload["columns"][0]
    assert payload["columns"][1]["children"][0]["name"] == "s_id"
    assert payload["columns"][1]["children"][1]["dataLength"] == 20
    assert payload["tablePartition"] == {
        "columns": [{"columnName": "dt", "intervalType": "TIME-UNIT"}]
    }


def test_bulk_table_flush_sends_pending_database_and_schema_first() -> None:
    class FakeClient:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def bulk_upsert_databases(self, payloads):
            self.calls.append("database")
            return {"successRequest": [{"request": p} for p in payloads], "failedRequest": []}

        def bulk_upsert_schemas(self, payloads):
            self.calls.append("schema")
            return {"successRequest": [{"request": p} for p in payloads], "failedRequest": []}

        def bulk_upsert_tables(self, payloads):
            self.calls.append("table")
            return {"successRequest": [{"request": p} for p in payloads], "failedRequest": []}

    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=3)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(SchemaRecord(name="public", database="svc.db"))
    sink.write(TableRecord(name="t1", database_schema="svc.db.public", columns=[]))
    sink.write(TableRecord(name="t2", database_schema="svc.db.public", columns=[]))
    assert client.calls == []
    sink.write(TableRecord(name="t3", database_schema="svc.db.public", columns=[]))
    assert client.calls == ["database", "schema", "table"]

