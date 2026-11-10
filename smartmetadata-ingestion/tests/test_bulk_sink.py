# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    SchemaRecord,
    TableRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import BulkMetadataRestSink


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def upsert_database_service(self, payload):
        self.calls.append(("svc", payload))
        return payload

    def bulk_upsert_databases(self, payloads):
        self.calls.append(("bulk_db", payloads))
        return {"n": len(payloads)}

    def bulk_upsert_schemas(self, payloads):
        self.calls.append(("bulk_schema", payloads))
        return {"n": len(payloads)}

    def bulk_upsert_tables(self, payloads):
        self.calls.append(("bulk_table", payloads))
        return {"n": len(payloads)}

    def bulk_upsert_topics(self, payloads):
        self.calls.append(("bulk_topic", payloads))
        return {"n": len(payloads)}

    def put_lineage(self, *args, **kwargs):
        self.calls.append(("lineage", args, kwargs))
        return {"ok": True}


def test_bulk_sink_buffers_until_flush() -> None:
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseServiceRecord(name="svc", service_type="Postgres"))
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(SchemaRecord(name="public", database="svc.db"))
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    assert not any(call[0].startswith("bulk_") for call in client.calls)
    sink.flush()
    kinds = [call[0] for call in client.calls]
    assert kinds == ["svc", "bulk_db", "bulk_schema", "bulk_table"]
    assert sink.seen.fqns("table") == ["svc.db.public.t"]


def test_bulk_sink_flushes_before_lineage() -> None:
    from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord

    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=50)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(
        TableRecord(
            name="t",
            database_schema="svc.db.public",
            columns=[],
        )
    )
    assert client.calls == []
    sink.write(
        LineageRecord(
            from_entity=LineageEndpoint(type="table", fqn="svc.db.public.t"),
            to_entity=LineageEndpoint(type="table", fqn="svc.db.public.t2"),
            source="Manual",
        )
    )
    kinds = [c[0] for c in client.calls]
    assert kinds.index("bulk_db") < kinds.index("lineage")
    assert kinds.index("bulk_table") < kinds.index("lineage")



def test_bulk_sink_single_writes_sampled_topic() -> None:
    from smartmetadata_ingestion.records import TopicRecord, TopicSampleData

    class SampleClient(FakeClient):
        def upsert_topic(self, payload):
            self.calls.append(("topic", payload))
            return {"id": "topic-uuid", **payload}

        def ingest_topic_sample_data(self, topic_id, payload):
            self.calls.append(("sample", topic_id, payload))
            return {"sampleData": payload}

    client = SampleClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=1,
            sample_data=TopicSampleData(messages=['{"id": 1}']),
        )
    )
    # The buffered database goes out first (flush), then the sampled topic
    # single-writes (upsert + sample PUT) instead of joining the bulk batch.
    kinds = [call[0] for call in client.calls]
    assert kinds == ["bulk_db", "topic", "sample"]
    assert client.calls[2] == ("sample", "topic-uuid", {"messages": ['{"id": 1}']})
