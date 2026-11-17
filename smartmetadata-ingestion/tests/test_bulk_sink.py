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
    ChartRecord,
    ContainerRecord,
    DashboardRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    PipelineRecord,
    SchemaRecord,
    StoredProcedureRecord,
    TableRecord,
    TopicRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import BulkMetadataRestSink


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def upsert_database_service(self, payload):
        self.calls.append(("svc", payload))
        return payload

    def bulk_upsert_databases(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_db", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_schemas(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_schema", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_tables(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_table", payloads))
        return _bulk_result(payloads)


    def bulk_upsert_topics(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_topic", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_stored_procedures(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_procedure", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_charts(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_chart", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_dashboards(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_dashboard", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_containers(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_container", payloads))
        return _bulk_result(payloads)

    def bulk_upsert_pipelines(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_pipeline", payloads))
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

    def bulk_upsert_databases(self, payloads, *, override_metadata: bool = False) -> dict:
        return self._bulk("database", payloads)

    def bulk_upsert_schemas(self, payloads, *, override_metadata: bool = False) -> dict:
        return self._bulk("schema", payloads)

    def bulk_upsert_tables(self, payloads, *, override_metadata: bool = False) -> dict:
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

    def bulk_upsert_tables(self, payloads, *, override_metadata: bool = False):
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


# -- D-S2/D-S3: single shared buffer, depth-ordered grouped flush -----------
# Depths are derived from the pin topology trees: depth = tree layer x 100
# + stage index within the node, minimum across topologies. These tests pin
# the derived table, the emitted group order, and the stable-sort tie rule
# (kinds sharing a depth keep first-arrival order).


def test_bulk_sink_kind_depth_table() -> None:
    assert BulkMetadataRestSink._KIND_DEPTH == {
        "topic": 100,
        "database": 101,
        "chart": 101,
        "container": 101,
        "pipeline": 101,
        "dashboard": 103,
        "schema": 201,
        "storedProcedure": 300,
        "table": 301,
    }
    # The verified constraint: the storedProcedure group goes out before
    # the table group.
    assert (
        BulkMetadataRestSink._KIND_DEPTH["storedProcedure"]
        < BulkMetadataRestSink._KIND_DEPTH["table"]
    )


def test_bulk_sink_flush_groups_follow_depth_order() -> None:
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    # Scrambled arrival across all nine buffered kinds.
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    sink.write(DashboardRecord(name="d", service="svc"))
    sink.write(PipelineRecord(name="p", service="svc"))
    sink.write(SchemaRecord(name="public", database="svc.db"))
    sink.write(ChartRecord(name="c", service="svc"))
    sink.write(
        StoredProcedureRecord(
            name="sp",
            database_schema="svc.db.public",
            stored_procedure_type="StoredProcedure",
            language="SQL",
            code="SELECT 1",
        )
    )
    sink.write(ContainerRecord(name="ct", service="svc"))
    sink.write(TopicRecord(name="tp", service="svc"))
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.flush()
    # Depth order; the four depth-101 kinds keep first-arrival order
    # (pipeline, chart, container, database).
    kinds = [call[0] for call in client.calls]
    assert kinds == [
        "bulk_topic",
        "bulk_pipeline",
        "bulk_chart",
        "bulk_container",
        "bulk_db",
        "bulk_dashboard",
        "bulk_schema",
        "bulk_procedure",
        "bulk_table",
    ]
    # One bulk call per group, each carrying its single payload.
    assert all(len(call[1]) == 1 for call in client.calls)


def test_bulk_sink_equal_depth_groups_keep_arrival_order() -> None:
    # Chart, database and container all sit at depth 101: whichever
    # arrives first goes out first.
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(ChartRecord(name="c", service="svc"))
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(ContainerRecord(name="ct", service="svc"))
    sink.flush()
    assert [call[0] for call in client.calls] == [
        "bulk_chart",
        "bulk_db",
        "bulk_container",
    ]

    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(ContainerRecord(name="ct", service="svc"))
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(ChartRecord(name="c", service="svc"))
    sink.flush()
    assert [call[0] for call in client.calls] == [
        "bulk_container",
        "bulk_db",
        "bulk_chart",
    ]


def test_bulk_sink_groups_keep_arrival_order_within_group() -> None:
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(TableRecord(name="t1", database_schema="svc.db.public", columns=[]))
    sink.write(SchemaRecord(name="s1", database="svc.db"))
    sink.write(TableRecord(name="t2", database_schema="svc.db.public", columns=[]))
    sink.write(SchemaRecord(name="s2", database="svc.db"))
    sink.write(TableRecord(name="t3", database_schema="svc.db.public", columns=[]))
    sink.flush()
    assert [call[0] for call in client.calls] == ["bulk_schema", "bulk_table"]
    schema_names = [p["name"] for p in client.calls[0][1]]
    table_names = [p["name"] for p in client.calls[1][1]]
    assert schema_names == ["s1", "s2"]
    assert table_names == ["t1", "t2", "t3"]


def test_bulk_sink_group_exception_isolates_remaining_groups() -> None:
    class ExplodingSchemaClient(FakeClient):
        def bulk_upsert_schemas(self, payloads, *, override_metadata: bool = False):
            raise RuntimeError("schema endpoint down")

    client = ExplodingSchemaClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(SchemaRecord(name="s1", database="svc.db"))
    sink.write(SchemaRecord(name="s2", database="svc.db"))
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    # A group failure never raises out of the flush.
    result = sink.flush()
    assert result is not None
    # The database and table groups still went out and landed.
    assert [call[0] for call in client.calls] == ["bulk_db", "bulk_table"]
    assert result.succeeded == {"database": 1, "table": 1}
    # The failed group is counted per payload, each with the group's error.
    assert [f.label for f in result.failed] == [
        "schema:svc.db.s1",
        "schema:svc.db.s2",
    ]
    assert all("schema endpoint down" in f.error for f in result.failed)


def test_bulk_sink_malformed_response_isolates_group() -> None:
    class MalformedTableClient(FakeClient):
        def bulk_upsert_tables(self, payloads, *, override_metadata: bool = False):
            self.calls.append(("bulk_table", payloads))
            return {"successRequest": 5}

    client = MalformedTableClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(TableRecord(name="t1", database_schema="svc.db.public", columns=[]))
    sink.write(TableRecord(name="t2", database_schema="svc.db.public", columns=[]))
    # Response recording shares the group's isolation boundary: the
    # malformed table response fails only the table group, and the
    # database group still lands.
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {"database": 1}
    assert [f.label for f in result.failed] == [
        "table:svc.db.public.t1",
        "table:svc.db.public.t2",
    ]


def test_bulk_sink_write_trip_failure_is_recorded_not_raised() -> None:
    client = BulkResultClient(fail_kinds=frozenset({"table"}))
    sink = BulkMetadataRestSink(client, batch_size=2)
    sink.write(TableRecord(name="t1", database_schema="svc.db.public", columns=[]))
    # The second write trips the buffer; the failing flush is recorded,
    # not raised, and the sink stays usable afterwards.
    sink.write(TableRecord(name="t2", database_schema="svc.db.public", columns=[]))
    result = sink.take_flush_result()
    assert result is not None
    assert result.succeeded == {}
    assert [f.label for f in result.failed] == [
        "table:svc.db.public.t1",
        "table:svc.db.public.t2",
    ]
    sink.write(DatabaseRecord(name="db", service="svc"))
    result = sink.flush()
    assert result is not None
    assert result.succeeded == {"database": 1}
    assert result.failed == []


def test_bulk_sink_default_batch_size_is_100() -> None:
    client = FakeClient()
    sink = BulkMetadataRestSink(client)
    for index in range(99):
        sink.write(TableRecord(name=f"t{index}", database_schema="svc.db.public", columns=[]))
    assert client.calls == []
    sink.write(TableRecord(name="t99", database_schema="svc.db.public", columns=[]))
    assert len(client.calls) == 1
    assert client.calls[0][0] == "bulk_table"
    assert len(client.calls[0][1]) == 100
    result = sink.take_flush_result()
    assert result is not None
    assert result.succeeded == {"table": 100}


def test_bulk_sink_buffers_container_and_pipeline() -> None:
    # D-S4/F7: container and pipeline stay buffered groups.
    client = FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    assert sink.buffers(ContainerRecord(name="ct", service="svc")) is True
    assert sink.buffers(PipelineRecord(name="p", service="svc")) is True
    sink.write(ContainerRecord(name="ct", service="svc"))
    sink.write(PipelineRecord(name="p", service="svc"))
    assert client.calls == []
    sink.flush()
    assert [call[0] for call in client.calls] == [
        "bulk_container",
        "bulk_pipeline",
    ]


def test_bulk_sink_sampled_topic_flush_uses_depth_order() -> None:
    from smartmetadata_ingestion.records import TopicSampleData

    class SampleClient(FakeClient):
        def upsert_topic(self, payload):
            self.calls.append(("topic", payload))
            return {"id": "topic-uuid", **payload}

        def ingest_topic_sample_data(self, topic_id, payload):
            self.calls.append(("sample", topic_id, payload))
            return {"sampleData": payload}

    client = SampleClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    sink.write(SchemaRecord(name="public", database="svc.db"))
    sink.write(
        TopicRecord(
            name="orders",
            service="events",
            partitions=1,
            sample_data=TopicSampleData(messages=['{"id": 1}']),
        )
    )
    # The pending buffer flushes in depth order (schema before table),
    # then the sampled topic single-writes (upsert + sample PUT).
    kinds = [call[0] for call in client.calls]
    assert kinds == ["bulk_schema", "bulk_table", "topic", "sample"]
