# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Stored-procedure channel: CALL-name extraction, the Snowflake
CALL-history provider (SQL shape + window-narrowing retries), and
the channel's body-edge + procedure-graph emission."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.procedure_lineage import (
    ProcedureCall,
    ProcedureLineageChannel,
    SnowflakeProcedureProvider,
    extract_call_name,
)
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.records import LineageRecord, QueryRecord

SERVICE = "svc"
DB = "db"
SCHEMA = "public"
ORDERS = f"{SERVICE}.{DB}.{SCHEMA}.orders"
TARGET = f"{SERVICE}.{DB}.{SCHEMA}.target"
PROC = f"{SERVICE}.{DB}.{SCHEMA}.load_orders"


def _table(fqn: str, columns: list[str] | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }
    if columns is not None:
        entity["columns"] = [{"name": name} for name in columns]
    return entity


class _FakeClient:
    def __init__(
        self,
        tables: dict[str, dict[str, Any]] | None = None,
        procedures: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        entity = self._tables.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_stored_procedure_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        entity = self._procedures.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
        schema_fqn = (extra_params or {}).get("databaseSchema", "")
        pool = self._tables if path == TABLES_PATH else self._procedures
        if path not in (TABLES_PATH, STORED_PROCEDURES_PATH):  # pragma: no cover
            raise AssertionError(f"unexpected collection {path}")
        prefix = f"{schema_fqn}."
        return [e for fqn, e in pool.items() if fqn.startswith(prefix)]


class _FakeCursor:
    def __init__(self, rows, columns, *, fail: Exception | None = None) -> None:
        self._rows = rows
        self._columns = columns
        self._fail = fail
        self.description = [(name, None) for name in columns]
        self.statements: list[str] = []

    def execute(self, statement: str) -> None:
        self.statements.append(statement)
        if self._fail is not None:
            raise self._fail

    def fetchall(self):
        return self._rows

    def close(self) -> None:
        return None


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def cursor(self) -> _FakeCursor:
        return self._cursor


# --- CALL-name extraction --------------------------------------------


def test_extract_call_name_variants() -> None:
    assert extract_call_name("CALL load_orders()") == "load_orders"
    assert extract_call_name("call public.load_orders(1, 'x')") == "public.load_orders"
    assert (
        extract_call_name("CALL db.public.load_orders()") == "db.public.load_orders"
    )
    assert extract_call_name('CALL "public"."load_orders"()') == "public.load_orders"
    assert extract_call_name("CALL   load_orders  ()") == "load_orders"


def test_extract_call_name_rejects_non_calls() -> None:
    assert extract_call_name("SELECT * FROM t") is None
    assert extract_call_name("") is None
    assert extract_call_name("RECALL load_orders()") is None


# --- Snowflake provider ----------------------------------------------


def _provider(rows, columns, *, failures: int = 0):
    """A provider whose connect factory fails the first ``failures``
    executions, then returns the rows. Statements are recorded."""
    statements: list[str] = []
    attempts = {"count": 0}

    def connect():
        attempts["count"] += 1
        fail = RuntimeError("cancelled") if attempts["count"] <= failures else None
        cursor = _FakeCursor(rows, columns, fail=fail)
        connection = _FakeConnection(cursor)
        orig_execute = cursor.execute

        def execute(statement: str) -> None:
            statements.append(statement)
            orig_execute(statement)

        cursor.execute = execute  # type: ignore[method-assign]
        return connection

    return SnowflakeProcedureProvider(connect), statements, attempts


def test_provider_reads_call_history_from_public_view() -> None:
    rows = [
        (
            "CALL load_orders()",
            "alice",
            datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc),
            "db",
            "public",
        )
    ]
    provider, statements, _ = _provider(
        rows, ["QUERY_TEXT", "USER_NAME", "START_TIME", "DATABASE_NAME", "SCHEMA_NAME"]
    )
    calls = list(provider.iter_calls(duration_days=1, result_limit=10))
    assert len(statements) == 1
    statement = statements[0]
    assert "SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY" in statement
    assert "QUERY_TYPE = 'CALL'" in statement
    assert "LIMIT 10" in statement
    assert len(calls) == 1
    assert calls[0].call_text == "CALL load_orders()"
    assert calls[0].user_name == "alice"
    assert calls[0].database_name == "db"
    assert calls[0].schema_name == "public"
    assert calls[0].start_time == "2026-11-13T09:00:00+00:00"


def test_provider_skips_rows_without_query_text() -> None:
    rows = [(None, "alice", None, "db", "public"), ("  ", "bob", None, "db", "public")]
    provider, _, _ = _provider(
        rows, ["QUERY_TEXT", "USER_NAME", "START_TIME", "DATABASE_NAME", "SCHEMA_NAME"]
    )
    assert list(provider.iter_calls(duration_days=1, result_limit=10)) == []


def test_provider_narrows_window_on_failure_then_succeeds() -> None:
    rows = [("CALL load_orders()", "alice", None, "db", "public")]
    provider, statements, _ = _provider(
        rows,
        ["QUERY_TEXT", "USER_NAME", "START_TIME", "DATABASE_NAME", "SCHEMA_NAME"],
        failures=2,
    )
    calls = list(provider.iter_calls(duration_days=4, result_limit=10))
    assert len(calls) == 1
    assert len(statements) == 3
    # The end stays fixed across retries; the start moves forward.
    ends = [s.split("START_TIME < '")[1].split("'")[0] for s in statements]
    assert len(set(ends)) == 1
    starts = [s.split("START_TIME >= '")[1].split("'")[0] for s in statements]
    assert starts[0] < starts[1] < starts[2]


def test_provider_exhausting_retries_fails_loudly() -> None:
    provider, statements, _ = _provider(
        [], ["QUERY_TEXT"], failures=10
    )
    with pytest.raises(WorkflowError, match="window-narrowing"):
        list(provider.iter_calls(duration_days=4, result_limit=10))
    assert len(statements) == 3


# --- procedure channel -----------------------------------------------


def _channel(
    client: _FakeClient,
    *,
    include: list[str] | None = None,
    exclude: list[str] | None = None,
) -> ProcedureLineageChannel:
    resolver = LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=DB,
        default_schema=SCHEMA,
    )
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.SNOWFLAKE
    )
    return ProcedureLineageChannel(
        processor,
        resolver,
        service_name=SERVICE,
        include_stored_procedures=include or [],
        exclude_stored_procedures=exclude or [],
    )


def _procedure_entity(code: str | None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": "proc-id",
        "fullyQualifiedName": PROC,
        "name": "load_orders",
    }
    if code is not None:
        entity["storedProcedureCode"] = {"code": code, "language": "SQL"}
    return entity


def test_channel_emits_body_edges_procedure_graph_and_query() -> None:
    body_sql = (
        "INSERT INTO public.target (id) SELECT id FROM public.orders WHERE id = 42"
    )
    masked_body = (
        "INSERT INTO public.target (id) SELECT id FROM public.orders WHERE id = ?"
    )
    client = _FakeClient(
        {ORDERS: _table(ORDERS, ["id"]), TARGET: _table(TARGET, ["id"])},
        {PROC: _procedure_entity(body_sql)},
    )
    channel = _channel(client)
    records, outcome, hops = channel.process_one(
        ProcedureCall(
            call_text="CALL load_orders()",
            database_name=DB,
            schema_name=SCHEMA,
            user_name="alice",
        )
    )
    assert hops == []
    assert outcome.seen == 1
    assert outcome.edges == 1
    assert outcome.procedure_edges == 2
    assert outcome.queries == 1
    lineage = [r for r in records if isinstance(r, LineageRecord)]
    assert len(lineage) == 3
    body = [r for r in lineage if r.to_entity.type == "table" and r.from_entity.type == "table"]
    assert len(body) == 1
    assert body[0].from_entity.fqn == ORDERS and body[0].to_entity.fqn == TARGET
    assert body[0].source == "QueryLineage"
    # Body edges carry the MASKED body query, not the CALL text.
    assert body[0].sql_query == masked_body
    graph_in = [r for r in lineage if r.to_entity.type == "storedProcedure"]
    graph_out = [r for r in lineage if r.from_entity.type == "storedProcedure"]
    assert len(graph_in) == 1 and graph_in[0].from_entity.fqn == ORDERS
    assert graph_in[0].to_entity.fqn == PROC
    assert graph_in[0].sql_query == masked_body
    assert len(graph_out) == 1 and graph_out[0].to_entity.fqn == TARGET
    assert graph_out[0].from_entity.fqn == PROC
    assert graph_out[0].sql_query == masked_body
    queries = [r for r in records if isinstance(r, QueryRecord)]
    assert len(queries) == 1
    assert queries[0].triggered_by_fqn == PROC
    assert queries[0].user_name == "alice"


def test_channel_skips_unparseable_unresolved_and_codeless_calls() -> None:
    client = _FakeClient(
        {ORDERS: _table(ORDERS, ["id"]), TARGET: _table(TARGET, ["id"])},
        {PROC: _procedure_entity(None)},
    )
    channel = _channel(client)
    _, outcome, _ = channel.process_one(ProcedureCall(call_text="SELECT 1"))
    assert outcome.skipped_unparseable == 1
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="CALL missing_proc()", database_name=DB, schema_name=SCHEMA)
    )
    assert outcome.skipped_unresolved == 1
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="CALL load_orders()", database_name=DB, schema_name=SCHEMA)
    )
    assert outcome.skipped_no_code == 1


def test_channel_applies_stored_procedure_filters() -> None:
    client = _FakeClient(
        {ORDERS: _table(ORDERS, ["id"]), TARGET: _table(TARGET, ["id"])},
        {PROC: _procedure_entity("SELECT 1")},
    )
    channel = _channel(client, exclude=["load.*"])
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="CALL load_orders()", database_name=DB, schema_name=SCHEMA)
    )
    assert outcome.skipped_filtered == 1
