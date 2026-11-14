# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx
import pytest

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.errors import WorkflowExecutionError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.pipeline_status import step_summary
from smartmetadata_ingestion.records import TableQueryRecord, UsageRecord
from smartmetadata_ingestion.runner import run_workflow
from smartmetadata_ingestion.usage import workflow as usage_workflow_module
from smartmetadata_ingestion.usage.processor import QueryParseFailure
from smartmetadata_ingestion.usage.query_log import QueryLogSource, QueryLogSpec
from smartmetadata_ingestion.usage.workflow import UsageWorkflow

TABLE_FQN = "warehouse.shop.public.orders"
TABLE_ID = "11111111-1111-1111-1111-111111111111"
QUERY_ID = "22222222-2222-2222-2222-222222222222"


def _server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="t"),
    )


def _config(
    stage_dir: Path, csv_path: Path | None = None, **source_overrides: Any
) -> WorkflowConfig:
    source_values: dict[str, Any] = {
        "type": "postgres-usage",
        "service_name": "warehouse",
        "connection": {
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": "shop",
            "databaseSchema": "public",
        },
        "stage_file_location": str(stage_dir),
    }
    if csv_path is not None:
        source_values["query_log_file_path"] = str(csv_path)
    source_values.update(source_overrides)
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-usage", type="usage"),
        server=_server(),
        source=SourceConfig(**source_values),
    )


class _StubSource:
    def __init__(self, records: list[Any]) -> None:
        self._records = records

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self):
        yield from self._records


def _catalog_handler(seen: list[tuple[str, str, Any]], *, fail_counts: bool = False):
    def handler(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, path, body))
        if request.method == "GET" and path == f"/api/v1/tables/name/{TABLE_FQN}":
            return httpx.Response(200, json={"id": TABLE_ID, "fullyQualifiedName": TABLE_FQN})
        if request.method == "GET" and path.startswith("/api/v1/users/name/"):
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "PUT" and path == "/api/v1/queries":
            return httpx.Response(200, json={"id": QUERY_ID, "fullyQualifiedName": "warehouse.q"})
        if fail_counts and request.method == "POST" and path.endswith(f"/usage/table/{TABLE_ID}"):
            return httpx.Response(500, json={"message": "boom"})
        return httpx.Response(200, json={})

    return handler


def test_usage_run_end_to_end_via_csv_and_runner(tmp_path: Path) -> None:
    csv_path = tmp_path / "query_log.csv"
    csv_path.write_text(
        "query_text,user_name,start_time,end_time,duration,cost,query_type,database_name,schema_name\n"
        "SELECT * FROM shop.public.orders WHERE total > 100,alice,"
        "2026-11-13 09:00:00.000,,5,,SELECT,shop,public\n"
        "SELECT 1,bob,2026-11-13 09:05:00.000,,,,\n",
        encoding="utf-8",
    )
    stage_dir = tmp_path / "staging"
    seen: list[tuple[str, str, Any]] = []
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler(seen)))
    report = run_workflow(_config(stage_dir, csv_path), client=client)

    assert report.failed == 0
    assert report.succeeded == 1  # one staged table published
    assert report.skipped == 1  # SELECT 1 touches no tables
    assert not stage_dir.exists()  # staging dir cleaned by close_steps

    counts = [call for call in seen if call[0] == "POST" and "/usage/table/" in call[1]]
    assert len(counts) == 1
    assert counts[0][2] == {"date": "2026-11-13", "count": 1}
    creates = [call for call in seen if call[0] == "PUT" and call[1] == "/api/v1/queries"]
    assert len(creates) == 1
    assert creates[0][2]["query"] == "SELECT * FROM shop.public.orders WHERE total > ?"
    used_by = [call for call in seen if call[0] == "PUT" and call[1].endswith("/usedBy")]
    assert used_by[0][2] == ["alice"]
    client.close()


def test_zero_publish_run_warns(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    csv_path = tmp_path / "query_log.csv"
    csv_path.write_text(
        "query_text,user_name,start_time\n"
        "SELECT 1,bob,2026-11-13 09:00:00.000\n",
        encoding="utf-8",
    )
    stage_dir = tmp_path / "staging"
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.workflow"):
        report = run_workflow(_config(stage_dir, csv_path), client=client)
    assert report.failed == 0
    assert report.succeeded == 0
    assert "scanned 1 queries but published no tables" in caplog.text
    client.close()


def test_zero_publish_run_counts_a_source_warning(tmp_path: Path) -> None:
    # C-11/B-4: the zero-publish shape counts one source-step warning
    # for the run — the queries touched no catalog tables, so no
    # binding skip accounts for it, and the run must not look clean.
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    source = _StubSource(
        [TableQueryRecord(query="SELECT 1", service_name="warehouse")]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert report.succeeded == 0
    assert workflow.source_status.warnings == 1
    assert workflow.processor_status.warnings == 0
    assert workflow.sink_status.warnings == 0
    assert step_summary(workflow.source_status)["warnings"] == 1
    client.close()


def test_dropped_join_counts_processor_warnings(tmp_path: Path) -> None:
    # C-11/B-4: joins dropped by catalog-column validation count as
    # binding skips on the processor step. The parser records the join
    # under both tables, so the unresolvable column drops once per
    # direction and nothing is published.
    customers_fqn = "warehouse.shop.public.customers"
    seen: list[tuple[str, str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, path, body))
        if request.method == "GET" and path == f"/api/v1/tables/name/{TABLE_FQN}":
            return httpx.Response(
                200,
                json={
                    "id": TABLE_ID,
                    "fullyQualifiedName": TABLE_FQN,
                    "columns": [{"name": "cust_id"}],
                },
            )
        if request.method == "GET" and path == f"/api/v1/tables/name/{customers_fqn}":
            return httpx.Response(
                200,
                json={
                    "id": "44444444-4444-4444-4444-444444444444",
                    "fullyQualifiedName": customers_fqn,
                    "columns": [{"name": "id"}],
                },
            )
        if request.method == "GET" and path.startswith("/api/v1/tables"):
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "GET" and path.startswith("/api/v1/users/name/"):
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "PUT" and path == "/api/v1/queries":
            return httpx.Response(
                200, json={"id": QUERY_ID, "fullyQualifiedName": "warehouse.q"}
            )
        return httpx.Response(200, json={})

    client = RestClient(_server(), transport=httpx.MockTransport(handler))
    source = _StubSource(
        [
            TableQueryRecord(
                query=(
                    "SELECT * FROM shop.public.orders "
                    "JOIN shop.public.customers ON orders.ghost = customers.id"
                ),
                service_name="warehouse",
                database_name="shop",
                database_schema="public",
                analysis_date="2026-11-13T09:00:00+00:00",
            )
        ]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert report.succeeded == 2
    assert workflow.processor_status.warnings == 2
    assert workflow.source_status.warnings == 0
    assert workflow.sink_status.warnings == 0
    assert [call for call in seen if call[0] == "PUT" and call[1].endswith("/joins")] == []
    client.close()


def test_engine_failures_surface_as_warnings(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    class _FailingEngineSource(_StubSource):
        engine_failures = ["engine-a: connection refused"]

    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    source = _FailingEngineSource(
        [
            TableQueryRecord(
                query="SELECT * FROM shop.public.orders",
                service_name="warehouse",
                database_name="shop",
                database_schema="public",
                analysis_date="2026-11-13T09:00:00+00:00",
            )
        ]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.workflow"):
        report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert report.succeeded == 1
    assert "published no tables" not in caplog.text
    assert (
        "query-log engines failed during the run: engine-a: connection refused"
        in caplog.text
    )
    client.close()


def test_usage_run_fails_loud_when_sink_write_fails(tmp_path: Path) -> None:
    csv_path = tmp_path / "query_log.csv"
    csv_path.write_text(
        "query_text,user_name,start_time\n"
        "SELECT * FROM shop.public.orders,alice,2026-11-13 09:00:00.000\n",
        encoding="utf-8",
    )
    stage_dir = tmp_path / "staging"
    seen: list[tuple[str, str, Any]] = []
    client = RestClient(
        _server(), transport=httpx.MockTransport(_catalog_handler(seen, fail_counts=True))
    )
    with pytest.raises(WorkflowExecutionError, match="usage sink failed"):
        run_workflow(_config(stage_dir, csv_path), client=client)
    assert not stage_dir.exists()  # cleaned even on failure
    client.close()


def test_unexpected_record_kind_is_recorded_not_silent(tmp_path: Path) -> None:
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    source = _StubSource(
        [UsageRecord(fqn=TABLE_FQN, date="2026-11-13", count=1)]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 1
    assert "unexpected record kind" in report.failures[0].message
    client.close()


def test_parse_failure_is_recorded_and_run_continues(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(record, dialect, parser_type):
        raise QueryParseFailure("boom")

    monkeypatch.setattr(usage_workflow_module, "parse_sql_statement", _boom)
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    source = _StubSource(
        [TableQueryRecord(query="SELECT * FROM shop.public.orders", service_name="warehouse")]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 1
    assert report.failures[0].kind == "tableQuery"
    assert report.succeeded == 0
    client.close()


def test_unresolvable_table_counts_a_processor_warning(tmp_path: Path) -> None:
    # C-11/B-4: the workflow itself increments warnings — a query whose
    # table binds to no catalog entity skips in the stage and reports
    # one processor-step warning, visible through the serializer.
    def handler(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        if request.method == "GET" and path.startswith("/api/v1/tables"):
            if path == "/api/v1/tables":
                return httpx.Response(200, json={"data": [], "paging": {}})
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "GET" and path.startswith("/api/v1/users/name/"):
            return httpx.Response(404, json={"message": "not found"})
        return httpx.Response(200, json={})

    client = RestClient(_server(), transport=httpx.MockTransport(handler))
    source = _StubSource(
        [
            TableQueryRecord(
                query="SELECT * FROM shop.public.ghost",
                service_name="warehouse",
                database_name="shop",
                database_schema="public",
            )
        ]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert workflow.processor_status.warnings == 1
    # The run also scanned a query and published nothing, so the
    # zero-publish rule counts one source-step warning alongside the
    # binding skip — the two events are distinct, not a double count.
    assert workflow.source_status.warnings == 1
    assert workflow.sink_status.warnings == 0
    assert step_summary(workflow.processor_status)["warnings"] == 1
    client.close()


class _FakeCursor:
    """A DB-API cursor over canned history rows, keyed by a substring
    of the executed statement."""

    def __init__(self, rows_by_statement: dict[str, list[tuple]], columns: list[str]) -> None:
        self._rows = rows_by_statement
        self.description = [(column, None) for column in columns]
        self._current: list[tuple] = []

    def execute(self, statement: str, *args: Any) -> None:
        for key, rows in self._rows.items():
            if key in statement:
                self._current = rows
                return
        self._current = []

    def fetchall(self) -> list[tuple]:
        return list(self._current)

    def close(self) -> None:
        return None


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> _FakeConnection:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def cursor(self) -> _FakeCursor:
        return self._cursor


def _connect_factory(cursor: _FakeCursor):
    def connect():
        return _FakeConnection(cursor)

    return connect


def test_failed_query_log_engine_counts_a_source_warning(tmp_path: Path) -> None:
    # C-11/B-4: a run where one of two engines fails still publishes
    # the good engine's queries and reports one source-step warning.
    columns = [
        "query_text",
        "user_name",
        "start_time",
        "end_time",
        "duration",
        "cost",
        "query_type",
        "database_name",
        "schema_name",
    ]
    cursor = _FakeCursor(
        {
            "history": [
                (
                    "SELECT * FROM shop.public.orders",
                    "alice",
                    "2026-11-13 09:00:00",
                    None,
                    5,
                    None,
                    "SELECT",
                    "shop",
                    "public",
                )
            ]
        },
        columns,
    )

    def failing_factory():
        raise RuntimeError("connection refused")

    def provider(config, builder):
        return [("bad", failing_factory), ("good", _connect_factory(cursor))]

    config = _config(tmp_path / "staging", query_log_duration=0)
    spec = QueryLogSpec(
        engine_key="postgres",
        sql_template="SELECT * FROM history WHERE start_time >= '{start_time}'",
        dialect=Dialect.POSTGRES,
    )
    source = QueryLogSource(
        config.source,
        spec,
        lambda connection: _connect_factory(cursor),
        provider,
    )
    seen: list[tuple[str, str, Any]] = []
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler(seen)))
    workflow = UsageWorkflow(config, client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert report.succeeded == 1
    assert workflow.source_status.warnings == 1
    assert workflow.processor_status.warnings == 0
    assert workflow.sink_status.warnings == 0
    client.close()


def test_usage_progress_entries_pair_totals_with_processed(tmp_path: Path) -> None:
    # T-F3: processor/sink progress must never emit total=0 with
    # processed>0 — every entry pairs its total with its completions.
    client = RestClient(_server(), transport=httpx.MockTransport(_catalog_handler([])))
    source = _StubSource(
        [
            TableQueryRecord(
                query="SELECT * FROM shop.public.orders",
                service_name="warehouse",
                database_name="shop",
                database_schema="public",
            ),
            TableQueryRecord(query="SELECT 1", service_name="warehouse"),
        ]
    )
    workflow = UsageWorkflow(_config(tmp_path / "staging"), client=client, source=source)
    report = workflow.execute()
    workflow.stop()
    assert report.failed == 0
    assert report.succeeded == 1
    assert report.skipped == 1
    for status in (
        workflow.source_status,
        workflow.processor_status,
        workflow.sink_status,
    ):
        for entry in status.progress.values():
            assert entry.total >= entry.processed
            assert not (entry.total == 0 and entry.processed > 0)
    source_entry = workflow.source_status.progress["tableQuery"]
    assert (source_entry.total, source_entry.processed) == (2, 2)
    processor_entry = workflow.processor_status.progress["tableQuery"]
    assert (processor_entry.total, processor_entry.processed) == (2, 2)
    sink_summary = step_summary(workflow.sink_status)
    assert sink_summary["progress"]["table"] == {"total": 1, "processed": 1}
    client.close()
