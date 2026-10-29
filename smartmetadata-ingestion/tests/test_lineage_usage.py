# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import json

import httpx

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ColumnLineageSpec,
    EntityRefSpec,
    LineageEndpointConfig,
    LineageSpec,
    ServerConfig,
    SourceConfig,
    UsageSpec,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.connectors.base import parse_static_record
from smartmetadata_ingestion.records import (
    ColumnLineage,
    EntityRef,
    LineageEndpoint,
    LineageRecord,
    UsageRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import MetadataRestSink, _lineage_details
from smartmetadata_ingestion.topology import order_records
from smartmetadata_ingestion.workflow import MetadataWorkflow


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="bot-token"),
    )


def test_lineage_details_includes_columns_and_pipeline() -> None:
    record = LineageRecord(
        from_entity=LineageEndpoint(type="table", fqn="svc.db.s.a"),
        to_entity=LineageEndpoint(type="table", fqn="svc.db.s.b"),
        source="QueryLineage",
        sql_query="select a.id as bid from a",
        columns_lineage=[
            ColumnLineage(
                from_columns=["svc.db.s.a.id"],
                to_column="svc.db.s.b.bid",
                function="identity",
            )
        ],
        pipeline=EntityRef(type="pipeline", fully_qualified_name="airflow.etl.orders"),
    )
    details = _lineage_details(record)
    assert details["source"] == "QueryLineage"
    assert details["sqlQuery"].startswith("select")
    assert details["columnsLineage"][0]["fromColumns"] == ["svc.db.s.a.id"]
    assert details["columnsLineage"][0]["toColumn"] == "svc.db.s.b.bid"
    assert details["columnsLineage"][0]["function"] == "identity"
    assert details["pipeline"] == {
        "type": "pipeline",
        "fullyQualifiedName": "airflow.etl.orders",
    }


def test_put_usage_and_delete_lineage_paths() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode()) if request.content else None
        seen.append((request.method, request.url.path, body))
        return httpx.Response(200, json={"ok": True})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.put_usage_by_name("table", "svc.db.s.t", date="2026-10-28", count=7)
        client.delete_lineage_by_name("table", "a", "table", "b")
    assert seen[0][0:2] == ("PUT", "/api/v1/usage/table/name/svc.db.s.t")
    assert seen[0][2] == {"date": "2026-10-28", "count": 7}
    assert seen[1][0:2] == (
        "DELETE",
        "/api/v1/lineage/table/name/a/table/name/b",
    )


def test_sink_writes_usage_and_rich_lineage() -> None:
    calls: list[tuple] = []

    class Fake:
        def put_lineage(self, *args, **kwargs):
            calls.append(("lineage", args, kwargs))
            return {"ok": 1}

        def put_usage_by_name(self, entity_type, fqn, *, date, count):
            calls.append(("usage", entity_type, fqn, date, count))
            return {"ok": 1}

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        UsageRecord(entity_type="table", fqn="svc.db.s.t", date="2026-10-28", count=3)
    )
    sink.write(
        LineageRecord(
            from_entity=LineageEndpoint(type="table", fqn="a"),
            to_entity=LineageEndpoint(type="table", fqn="b"),
            columns_lineage=[ColumnLineage(from_columns=["a.c"], to_column="b.c")],
            pipeline=EntityRef(type="pipeline", fully_qualified_name="p.q"),
        )
    )
    assert calls[0] == ("usage", "table", "svc.db.s.t", "2026-10-28", 3)
    details = calls[1][1][4]
    assert "columnsLineage" in details
    assert details["pipeline"]["fullyQualifiedName"] == "p.q"


def test_order_puts_usage_before_lineage() -> None:
    usage = UsageRecord(fqn="t", date="2026-10-28", count=1)
    lineage = LineageRecord(
        from_entity=LineageEndpoint(type="table", fqn="a"),
        to_entity=LineageEndpoint(type="table", fqn="b"),
    )
    kinds = [r.kind for r in order_records([lineage, usage])]
    assert kinds == ["usage", "lineage"]


def test_static_and_config_usage_lineage() -> None:
    usage = parse_static_record(
        {
            "kind": "usage",
            "entityType": "table",
            "fqn": "svc.db.s.t",
            "date": "2026-10-28",
            "count": 2,
        },
        default_service="demo",
    )
    assert isinstance(usage, UsageRecord)
    assert usage.count == 2
    lin = parse_static_record(
        {
            "kind": "lineage",
            "fromEntity": {"type": "table", "fqn": "a"},
            "toEntity": {"type": "table", "fqn": "b"},
            "columnsLineage": [{"fromColumns": ["a.id"], "toColumn": "b.id"}],
            "pipeline": {"type": "pipeline", "fullyQualifiedName": "air.p"},
        },
        default_service="demo",
    )
    assert isinstance(lin, LineageRecord)
    assert lin.columns_lineage[0].to_column == "b.id"
    assert lin.pipeline is not None
    assert lin.pipeline.fully_qualified_name == "air.p"

    config = WorkflowConfig(
        workflow=WorkflowSettings(name="u"),
        server=_jwt_server(),
        source=SourceConfig(type="static", service_name="demo", records=[]),
        lineage=[
            LineageSpec(
                from_entity=LineageEndpointConfig(type="table", fqn="a"),
                to_entity=LineageEndpointConfig(type="table", fqn="b"),
                columns_lineage=[
                    ColumnLineageSpec(from_columns=["a.id"], to_column="b.id")
                ],
                pipeline=EntityRefSpec(type="pipeline", fully_qualified_name="air.p"),
            )
        ],
        usage=[UsageSpec(fqn="svc.db.s.t", date="2026-10-28", count=9)],
    )

    class RecSink:
        def __init__(self) -> None:
            self.items: list[object] = []

        def write(self, record):
            self.items.append(record)

        def flush(self) -> None:
            return None

    sink = RecSink()
    report = MetadataWorkflow(config, sink=sink).execute()
    assert report.ok()
    kinds = [getattr(i, "kind", None) for i in sink.items]
    assert "usage" in kinds
    assert "lineage" in kinds
    lin_out = next(i for i in sink.items if getattr(i, "kind", None) == "lineage")
    assert lin_out.columns_lineage[0].to_column == "b.id"
