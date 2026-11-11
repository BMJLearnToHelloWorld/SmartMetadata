# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.errors import RestError
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
        return _bulk_result(payloads)

    def bulk_upsert_schemas(self, payloads):
        self.calls.append(("bulk_schema", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_tables(self, payloads):
        self.calls.append(("bulk_table", payloads))
        return _bulk_result(payloads)


    def bulk_upsert_topics(self, payloads):
        self.calls.append(("bulk_topic", payloads))
        return _bulk_result(payloads)

    def put_lineage(self, *args, **kwargs):
        self.calls.append(("lineage", args, kwargs))
        return {"ok": True}


def _bulk_result(payloads: list[dict]) -> dict:
    """A real BulkOperationResult shape: one success entry per payload."""
    return {
        "status": "success",
        "successRequest": [
            {"request": p, "status": 200, "message": "ok"} for p in payloads
        ],
        "failedRequest": [],
    }


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


# -- P-01: flush-result reporting -------------------------------------------
# The sink counts only truly-flushed records: a bulk response is read from
# its BulkOperationResult shape (successRequest/failedRequest), and a
# whole-batch HTTP error becomes one per-record failure.


def test_bulk_sink_take_flush_result_drains() -> None:
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseRecord(name="db", service="svc"))
    # Nothing flushed yet: no result to drain.
    assert sink.take_flush_result() is None
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {"database": 1}
    assert result.failed == []
    # Drained: a second take is empty.
    assert sink.take_flush_result() is None


def test_bulk_sink_buffers_reports_buffered_kinds() -> None:
    from smartmetadata_ingestion.records import (
        LineageEndpoint,
        LineageRecord,
        TopicRecord,
        TopicSampleData,
    )

    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    assert sink.buffers(DatabaseRecord(name="db", service="svc")) is True
    assert sink.buffers(TopicRecord(name="t", service="svc")) is True
    # A sampled topic is written immediately, not buffered.
    assert (
        sink.buffers(
            TopicRecord(
                name="t",
                service="svc",
                sample_data=TopicSampleData(messages=['{"id": 1}']),
            )
        )
        is False
    )
    # Service and lineage records are written immediately.
    assert sink.buffers(DatabaseServiceRecord(name="svc", service_type="Postgres")) is False
    assert (
        sink.buffers(
            LineageRecord(
                from_entity=LineageEndpoint(type="table", fqn="a"),
                to_entity=LineageEndpoint(type="table", fqn="b"),
                source="Manual",
            )
        )
        is False
    )


class BulkResultClient(FakeClient):
    """Fake client answering bulk calls with BulkOperationResult shapes."""

    def __init__(
        self,
        *,
        fail_kinds: frozenset[str] = frozenset(),
        fail_names: frozenset[str] = frozenset(),
    ) -> None:
        super().__init__()
        self.fail_kinds = fail_kinds
        self.fail_names = fail_names

    def _bulk(self, kind: str, payloads: list[dict]) -> dict:
        if kind in self.fail_kinds:
            raise RestError(
                f"PUT /v1/{kind}s/bulk failed with HTTP 400: Invalid request format",
                status_code=400,
            )
        failed = [p for p in payloads if p.get("name") in self.fail_names]
        succeeded = [p for p in payloads if p not in failed]
        return {
            "status": "partialSuccess" if failed else "success",
            "successRequest": [
                {"request": p, "status": 200, "message": "ok"} for p in succeeded
            ],
            "failedRequest": [
                {"request": p, "status": 400, "message": f"bad {p.get('name')}"}
                for p in failed
            ],
        }

    def bulk_upsert_databases(self, payloads: list[dict]) -> dict:
        return self._bulk("database", payloads)

    def bulk_upsert_schemas(self, payloads: list[dict]) -> dict:
        return self._bulk("schema", payloads)

    def bulk_upsert_tables(self, payloads: list[dict]) -> dict:
        return self._bulk("table", payloads)


def test_bulk_sink_counts_only_true_successes() -> None:
    client = BulkResultClient(fail_names=frozenset({"orders_v"}))
    sink = BulkMetadataRestSink(client, batch_size=10)
    for name in ("orders", "orders_v", "items"):
        sink.write(TableRecord(name=name, database_schema="svc.db.public", columns=[]))
    result = sink.flush()
    assert result is not None
    # Only the two landed tables count as succeeded; the failed payload
    # is reported per record, with its label and the server's message.
    assert result.succeeded == {"table": 2}
    assert len(result.failed) == 1
    assert result.failed[0].kind == "table"
    assert result.failed[0].label == "table:svc.db.public.orders_v"
    assert "orders_v" in result.failed[0].error


def test_bulk_sink_flush_400_fails_each_payload() -> None:
    # The live incident shape: a whole-batch 400 is one RestError, but
    # each buffered payload becomes one per-record failure.
    client = BulkResultClient(fail_kinds=frozenset({"table"}))
    sink = BulkMetadataRestSink(client, batch_size=10)
    for name in ("t1", "t2"):
        sink.write(TableRecord(name=name, database_schema="svc.db.public", columns=[]))
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {}
    assert [f.label for f in result.failed] == [
        "table:svc.db.public.t1",
        "table:svc.db.public.t2",
    ]


class NoListBulkResponseClient(FakeClient):
    """Fake client whose bulk tables call returns a response with no result lists."""

    def __init__(self, response: object) -> None:
        super().__init__()
        self.response = response

    def bulk_upsert_tables(self, payloads):
        self.calls.append(("bulk_table", payloads))
        return self.response


def test_bulk_sink_response_without_result_lists_fails_closed() -> None:
    # A bulk response with neither successRequest nor failedRequest (e.g.
    # `{}`) must not count anything as landed: one failure per payload,
    # zero succeeded.
    client = NoListBulkResponseClient({})
    sink = BulkMetadataRestSink(client, batch_size=10)
    for name in ("t1", "t2"):
        sink.write(TableRecord(name=name, database_schema="svc.db.public", columns=[]))
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {}
    assert [f.label for f in result.failed] == [
        "table:svc.db.public.t1",
        "table:svc.db.public.t2",
    ]


def test_bulk_sink_empty_body_response_fails_closed() -> None:
    # RestClient.request() returns None for a 200 with an empty body;
    # that must fail closed the same way as a list-less dict.
    client = NoListBulkResponseClient(None)
    sink = BulkMetadataRestSink(client, batch_size=10)
    for name in ("t1", "t2"):
        sink.write(TableRecord(name=name, database_schema="svc.db.public", columns=[]))
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {}
    assert [f.label for f in result.failed] == [
        "table:svc.db.public.t1",
        "table:svc.db.public.t2",
    ]
