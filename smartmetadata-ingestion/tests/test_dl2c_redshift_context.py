# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""D-L2c C: Redshift context alignment / row-cardinality tests.

Row cardinality (one execution fanning out to one row per scanned
context), the instance probe + privilege preflight, and the stage /
lineage dedupe that keeps counts from multiplying — all against
fake connections and a fake REST catalog, never a live cluster.

P-C5 is open by design: the 2-segment mapping (``db.tbl`` →
``(db, NULL)``) is the default rule; if live sampling proves the
second segment is really ``schema.table``, the rule flips only
after a stop-and-report, never here.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.redshift_common import RedshiftInstanceType
from smartmetadata_ingestion.connectors.redshift_lineage import RedshiftLineageSource
from smartmetadata_ingestion.connectors.redshift_query_log import (
    REDSHIFT_SERVERLESS_SQL_TEMPLATE,
    REDSHIFT_SQL_TEMPLATE,
)
from smartmetadata_ingestion.connectors.redshift_usage import RedshiftUsageSource
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.records import (
    BindingContext,
    FieldSource,
    LineageRecord,
    QueryRecord,
)
from smartmetadata_ingestion.usage.processor import ParsedData
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver, UsageStage

SERVICE = "svc"
DAY_MS = str(int(datetime(2026, 11, 13, tzinfo=timezone.utc).timestamp() * 1000))

COLUMNS = [
    "query_text",
    "user_name",
    "start_time",
    "end_time",
    "duration",
    "cost",
    "query_type",
    "aborted",
    "query_id",
    "database_name",
    "schema_name",
]

SQL_3PART = "INSERT INTO db.public.target SELECT id, email FROM db.public.orders"
SQL_2PART = "INSERT INTO public.target SELECT id, email FROM public.orders"


class _PgError(Exception):
    """A fake DB-API error carrying a SQLSTATE, like psycopg2's."""

    def __init__(self, pgcode: str) -> None:
        super().__init__(f"fake pg error {pgcode}")
        self.pgcode = pgcode


class _FakeCursor:
    """History rows plus probe behavior: the instance probe raises
    the configured error, the privilege probe returns the configured
    boolean row, history reads return the configured rows."""

    def __init__(
        self,
        rows: list[tuple],
        *,
        probe_error: Exception | None = None,
        privilege_row: tuple[bool, ...] | None = None,
    ) -> None:
        self._rows = rows
        self._probe_error = probe_error
        self._privilege_row = privilege_row
        self.statements: list[str] = []
        self._last_statement = ""
        self.description = [(column, None) for column in COLUMNS]

    def execute(self, statement: str, *args: Any) -> None:
        self.statements.append(statement)
        self._last_statement = statement
        if "stl_query LIMIT 1" in statement and self._probe_error is not None:
            raise self._probe_error

    def fetchall(self) -> list[tuple]:
        if "has_table_privilege" in self._last_statement:
            return [self._privilege_row] if self._privilege_row is not None else []
        return list(self._rows)

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


def _factory(cursor: _FakeCursor):
    def connect():
        return _FakeConnection(cursor)

    return connect


def _row(
    query_id: Any = 7,
    database: str | None = "db",
    schema: str | None = "public",
    query_text: str = "SELECT * FROM orders",
    duration: float | None = 1200.0,
    cost: float | None = None,
) -> tuple:
    return (
        query_text,
        "alice",
        "2026-11-16T00:00:00+00:00",
        "2026-11-16T00:00:01+00:00",
        duration,
        cost,
        None,
        False,
        query_id,
        database,
        schema,
    )


def _usage_config(**overrides: Any) -> SourceConfig:
    values: dict[str, Any] = {
        "type": "redshift-usage",
        "service_name": SERVICE,
        "connection": {"hostPort": "localhost:5439", "username": "u", "database": "db"},
        "queryLogDuration": 0,
    }
    values.update(overrides)
    return SourceConfig.model_validate(values)


def _usage_source(cursor: _FakeCursor, **overrides: Any) -> RedshiftUsageSource:
    return RedshiftUsageSource(_usage_config(**overrides), connect=_factory(cursor))


def _table(fqn: str) -> dict[str, Any]:
    return {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }


class _FakeRestClient:
    """In-memory catalog reads, prefix-scoped by the requested schema."""

    def __init__(self, tables: dict[str, dict[str, Any]] | None = None) -> None:
        self._tables = tables or {}

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        entity = self._tables.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_query_by_name(self, name: str, fields: str | None = None) -> dict[str, Any]:
        # No Query entity was ever stored: the incremental checker
        # treats a 404 as "not processed".
        raise RestError("not found", status_code=404)

    def get_stored_procedure_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        raise RestError("not found", status_code=404)

    def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
        schema_fqn = (extra_params or {}).get("databaseSchema", "")
        prefix = f"{schema_fqn}."
        return [e for fqn, e in self._tables.items() if fqn.startswith(prefix)]


def _ident(*parts: str) -> StructuredIdentifier:
    return StructuredIdentifier.from_parts([(part, False) for part in parts])


def _ctx(
    database: str | None = None,
    schema: str | None = None,
) -> BindingContext:
    return BindingContext(
        database_name=database,
        database_schema=schema,
        database_source=FieldSource.ROW_NATIVE if database else FieldSource.MISSING,
        schema_source=FieldSource.ROW_NATIVE if schema else FieldSource.MISSING,
    )


def _parsed(**overrides: Any) -> ParsedData:
    values: dict[str, Any] = {
        "tables": [_ident("shop", "orders")],
        "joins": {},
        "database_name": "shop",
        "database_schema": "public",
        "binding_context": _ctx("shop", "public"),
        "sql": "SELECT * FROM shop.orders WHERE total > 100",
        "query_type": "SELECT",
        "exclude_usage": False,
        "dialect": "redshift",
        "user_name": "alice",
        "date": DAY_MS,
        "service_name": SERVICE,
        "duration": 1.5,
        "cost": None,
        "masked_sql": "SELECT * FROM shop.orders WHERE total > ?",
        "query_hash": "deadbeef",
        "parser_name": "SqlGlot",
    }
    values.update(overrides)
    return ParsedData(**values)


class _DictResolver:
    """A mapping resolver, recording nothing but the mapping."""

    def __init__(self, mapping: dict[StructuredIdentifier, str]) -> None:
        self.mapping = mapping

    def resolve(
        self, name: StructuredIdentifier, *, context: BindingContext
    ) -> str | None:
        return self.mapping.get(name)


def _read_usage_lines(stage_dir: Path, file_name: str) -> list[dict[str, Any]]:
    lines = (stage_dir / file_name).read_text(encoding="utf-8").splitlines()
    return [json.loads(json.loads(line)) for line in lines]


def _read_cost_lines(stage_dir: Path, file_name: str) -> list[dict[str, Any]]:
    lines = (stage_dir / file_name).read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines]


# --- Row cardinality: production layer -------------------------------------


def test_same_query_same_context_dedupes_to_one_record() -> None:
    cursor = _FakeCursor([_row(), _row()])
    records = list(_usage_source(cursor).produce())
    assert len(records) == 1
    assert records[0].query_id == "7"
    assert records[0].database_name == "db"
    assert records[0].database_schema == "public"


def test_same_query_different_contexts_keep_separate_records() -> None:
    cursor = _FakeCursor([_row(schema="public"), _row(schema="staging")])
    records = list(_usage_source(cursor).produce())
    assert len(records) == 2
    assert {record.database_schema for record in records} == {"public", "staging"}
    assert all(record.query_id == "7" for record in records)


def test_same_text_different_query_ids_stay_separate() -> None:
    cursor = _FakeCursor([_row(query_id=7), _row(query_id=8)])
    records = list(_usage_source(cursor).produce())
    assert len(records) == 2
    assert {record.query_id for record in records} == {"7", "8"}


def test_csv_rows_carry_no_query_id_and_never_dedupe(tmp_path: Path) -> None:
    csv_file = tmp_path / "log.csv"
    csv_file.write_text(
        "query_text,user_name,start_time,end_time,duration,cost,query_type,aborted,database_name,schema_name\n"
        "SELECT * FROM orders,alice,2026-11-16T00:00:00+00:00,"
        "2026-11-16T00:00:01+00:00,1200,,SELECT,false,db,public\n"
        "SELECT * FROM orders,alice,2026-11-16T00:00:00+00:00,"
        "2026-11-16T00:00:01+00:00,1200,,SELECT,false,db,public\n",
        encoding="utf-8",
    )
    config = _usage_config(queryLogFilePath=str(csv_file))
    source = RedshiftUsageSource(config, connect=_factory(_FakeCursor([])))
    records = list(source.produce())
    assert len(records) == 2
    assert all(record.query_id is None for record in records)


# --- Counts must not multiply: stage layer ---------------------------------


def test_stage_counts_same_execution_once_per_table(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver({_ident("shop", "orders"): "svc.db.public.orders"}),
    )
    stage.handle_batch(
        [
            _parsed(query_id="q1", cost=2.0, duration=100.0),
            _parsed(query_id="q1", cost=2.0, duration=100.0),
        ]
    )
    record = _read_usage_lines(tmp_path, "svc_2026-11-13")[0]
    assert record["count"] == 1
    assert len(record["sqlQueries"]) == 1
    cost = _read_cost_lines(tmp_path, "svc_2026-11-13_query")[0]
    assert cost["count"] == 1
    assert cost["cost"] == 2.0
    assert cost["totalDuration"] == 100.0


def test_stage_counts_different_tables_once_each(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver(
            {
                _ident("shop", "orders"): "svc.db.public.orders",
                _ident("shop", "customers"): "svc.db.public.customers",
            }
        ),
    )
    stage.handle_batch(
        [
            _parsed(query_id="q1", tables=[_ident("shop", "orders")]),
            _parsed(query_id="q1", tables=[_ident("shop", "customers")]),
        ]
    )
    records = _read_usage_lines(tmp_path, "svc_2026-11-13")
    assert len(records) == 2
    assert all(record["count"] == 1 for record in records)
    assert {record["table"] for record in records} == {
        "svc.db.public.orders",
        "svc.db.public.customers",
    }


def test_stage_counts_two_executions_twice(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver({_ident("shop", "orders"): "svc.db.public.orders"}),
    )
    stage.handle_batch(
        [
            _parsed(query_id="q1", cost=2.0, duration=100.0),
            _parsed(query_id="q2", cost=2.0, duration=100.0),
        ]
    )
    record = _read_usage_lines(tmp_path, "svc_2026-11-13")[0]
    assert record["count"] == 2
    cost = _read_cost_lines(tmp_path, "svc_2026-11-13_query")[0]
    assert cost["count"] == 2
    assert cost["cost"] == 4.0
    assert cost["totalDuration"] == 200.0


def test_stage_id_less_records_keep_current_behavior(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver({_ident("shop", "orders"): "svc.db.public.orders"}),
    )
    stage.handle_batch([_parsed(), _parsed()])
    record = _read_usage_lines(tmp_path, "svc_2026-11-13")[0]
    assert record["count"] == 2
    cost = _read_cost_lines(tmp_path, "svc_2026-11-13_query")[0]
    assert cost["count"] == 2


def test_stage_dedupe_survives_batch_boundaries(tmp_path: Path) -> None:
    """One execution's context rows can straddle two handle_batch
    calls: the dedupe state is stage-instance level, not per batch."""
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver({_ident("shop", "orders"): "svc.db.public.orders"}),
    )
    stage.handle_batch([_parsed(query_id="q1", cost=2.0, duration=100.0)])
    stage.handle_batch([_parsed(query_id="q1", cost=2.0, duration=100.0)])
    record = _read_usage_lines(tmp_path, "svc_2026-11-13")[0]
    assert record["count"] == 1
    cost = _read_cost_lines(tmp_path, "svc_2026-11-13_query")[0]
    assert cost["count"] == 1


# --- Context mapping: record layer -----------------------------------------


def test_record_carries_scan_context_and_query_id() -> None:
    cursor = _FakeCursor([_row(query_id=99, database="analytics", schema="staging")])
    records = list(_usage_source(cursor).produce())
    assert len(records) == 1
    assert records[0].query_id == "99"
    assert records[0].database_name == "analytics"
    assert records[0].database_schema == "staging"


def test_no_scan_row_keeps_null_context_with_defaults_available() -> None:
    """D-C2 boundary: a (NULL, NULL) record still binds a 2-segment
    name through the connection defaults — the defaults chain is
    untouched by the session-database removal."""
    cursor = _FakeCursor([_row(database=None, schema=None)])
    records = list(_usage_source(cursor).produce())
    assert len(records) == 1
    assert records[0].database_name is None
    assert records[0].database_schema is None
    resolver = RestTableBindingResolver(
        _FakeRestClient({"svc.warehouse.public.orders": _table("svc.warehouse.public.orders")}),
        SERVICE,
        default_database="warehouse",
        default_schema="public",
    )
    from smartmetadata_ingestion.records import BindingContext as _BC

    assert (
        resolver.resolve(
            _ident("public", "orders"),
            context=_BC.from_record(records[0]),
        )
        == "svc.warehouse.public.orders"
    )


def test_no_scan_row_without_defaults_misses() -> None:
    cursor = _FakeCursor([_row(database=None, schema=None)])
    records = list(_usage_source(cursor).produce())
    resolver = RestTableBindingResolver(_FakeRestClient({}), SERVICE)
    from smartmetadata_ingestion.records import BindingContext as _BC

    assert (
        resolver.resolve(_ident("orders"), context=_BC.from_record(records[0])) is None
    )
    assert resolver.binding_counts["missing_both"] == 1


# --- Instance detection -----------------------------------------------------


def test_prepare_provisioned_selects_provisioned_template() -> None:
    cursor = _FakeCursor(
        [_row()], privilege_row=(True, True, True, True)
    )
    source = _usage_source(cursor)
    source.prepare()
    assert source.spec.sql_template == REDSHIFT_SQL_TEMPLATE
    assert source.spec.engine_key == "redshift"
    records = list(source.produce())
    assert len(records) == 1
    probe_statements = [
        s for s in cursor.statements if "stl_query LIMIT 1" in s
    ]
    assert len(probe_statements) == 1
    assert any("has_table_privilege" in s for s in cursor.statements)
    history = [s for s in cursor.statements if "FROM STL_QUERYTEXT t" in s]
    assert len(history) == 1
    assert cursor.statements.index(probe_statements[0]) < cursor.statements.index(
        history[0]
    )


def test_prepare_serverless_selects_serverless_template() -> None:
    cursor = _FakeCursor(
        [_row()],
        probe_error=_PgError("42P01"),
        privilege_row=(True, True, True),
    )
    source = _usage_source(cursor)
    source.prepare()
    assert source.spec.sql_template == REDSHIFT_SERVERLESS_SQL_TEMPLATE
    records = list(source.produce())
    assert len(records) == 1
    assert any("FROM SYS_QUERY_HISTORY" in s for s in cursor.statements)


def test_probe_connection_error_never_falls_back_to_serverless() -> None:
    cursor = _FakeCursor([], probe_error=ConnectionError("refused"))
    source = _usage_source(cursor)
    with pytest.raises(ConnectionError, match="refused"):
        source.prepare()


def test_probe_permission_error_never_falls_back_to_serverless() -> None:
    cursor = _FakeCursor([], probe_error=_PgError("42501"))
    source = _usage_source(cursor)
    with pytest.raises(_PgError):
        source.prepare()


def test_probe_runs_once_per_run_despite_two_day_batches() -> None:
    cursor = _FakeCursor(
        [_row()], privilege_row=(True, True, True, True)
    )
    source = _usage_source(cursor, queryLogDuration=1)
    source.prepare()
    list(source.produce())
    probe_statements = [
        s for s in cursor.statements if "stl_query LIMIT 1" in s
    ]
    privilege_statements = [
        s for s in cursor.statements if "has_table_privilege" in s
    ]
    history = [s for s in cursor.statements if "FROM STL_QUERYTEXT t" in s]
    assert len(probe_statements) == 1
    assert len(privilege_statements) == 1
    assert len(history) == 2


# --- Permission preflight ---------------------------------------------------


def test_preflight_missing_provisioned_view_fails_loud() -> None:
    cursor = _FakeCursor([], privilege_row=(True, True, True, False))
    source = _usage_source(cursor)
    with pytest.raises(WorkflowError, match="SVV_TABLE_INFO"):
        source.prepare()
    assert not any("FROM STL_QUERYTEXT t" in s for s in cursor.statements)


def test_preflight_missing_serverless_view_fails_loud() -> None:
    cursor = _FakeCursor(
        [],
        probe_error=_PgError("42P01"),
        privilege_row=(True, True, False),
    )
    source = _usage_source(cursor)
    with pytest.raises(WorkflowError, match="SYS_QUERY_DETAIL"):
        source.prepare()
    assert not any("FROM SYS_QUERY_HISTORY" in s for s in cursor.statements)


def test_preflight_detects_instance_type() -> None:
    from smartmetadata_ingestion.connectors.redshift_common import (
        detect_redshift_instance_type,
    )

    provisioned = _FakeCursor([])
    assert (
        detect_redshift_instance_type(_factory(provisioned))
        is RedshiftInstanceType.PROVISIONED
    )
    serverless = _FakeCursor([], probe_error=_PgError("42P01"))
    assert (
        detect_redshift_instance_type(_factory(serverless))
        is RedshiftInstanceType.SERVERLESS
    )


# --- Truncation warning -----------------------------------------------------


def test_truncation_warning_ignores_fanout(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Three rows for one execution under resultLimit=2 do not warn:
    only one distinct query id was returned, below the limit. The
    fake can only prove the Python-side criterion, not the database
    CTE cut — the test comment records that boundary."""
    cursor = _FakeCursor([_row(schema="public"), _row(schema="staging"), _row(schema="dev")])
    source = _usage_source(cursor, resultLimit=2)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.query_log"):
        records = list(source.produce())
    assert len(records) == 3
    assert not [r for r in caplog.records if "resultLimit" in r.message]


def test_truncation_warning_fires_on_distinct_query_count(
    caplog: pytest.LogCaptureFixture,
) -> None:
    cursor = _FakeCursor([_row(query_id=7), _row(query_id=8)])
    source = _usage_source(cursor, resultLimit=2)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.query_log"):
        records = list(source.produce())
    assert len(records) == 2
    assert len([r for r in caplog.records if "resultLimit" in r.message]) == 1


# --- Lineage dedupe ---------------------------------------------------------


def _lineage_config(**overrides: Any) -> SourceConfig:
    values: dict[str, Any] = {
        "type": "redshift-lineage",
        "service_name": SERVICE,
        "connection": {"hostPort": "localhost:5439", "username": "u", "database": "db"},
        "queryLogDuration": 0,
        "processViewLineage": False,
        "processStoredProcedureLineage": False,
        "processQueryLineage": True,
        "processCrossDatabaseLineage": False,
        "threads": 1,
    }
    values.update(overrides)
    return SourceConfig.model_validate(values)


def _catalog() -> dict[str, dict[str, Any]]:
    return {
        "svc.db.public.orders": _table("svc.db.public.orders"),
        "svc.db.public.target": _table("svc.db.public.target"),
        "svc.db1.public.orders": _table("svc.db1.public.orders"),
        "svc.db1.public.target": _table("svc.db1.public.target"),
        "svc.db2.public.orders": _table("svc.db2.public.orders"),
        "svc.db2.public.target": _table("svc.db2.public.target"),
    }


def _lineage_source(cursor: _FakeCursor, **overrides: Any) -> RedshiftLineageSource:
    return RedshiftLineageSource(
        _lineage_config(**overrides), query_log_connect=_factory(cursor)
    )


def _lineage_records(cursor: _FakeCursor, **overrides: Any) -> list[Any]:
    source = _lineage_source(cursor, **overrides)
    source.bind_client(_FakeRestClient(_catalog()))  # type: ignore[arg-type]
    return list(source.produce())


def test_lineage_same_execution_same_edge_emitted_once() -> None:
    cursor = _FakeCursor(
        [
            _row(query_id=7, database="db", schema="sch1", query_text=SQL_3PART),
            _row(query_id=7, database="db", schema="sch2", query_text=SQL_3PART),
        ]
    )
    records = _lineage_records(cursor)
    edges = [r for r in records if isinstance(r, LineageRecord)]
    queries = [r for r in records if isinstance(r, QueryRecord)]
    assert len(edges) == 1
    assert edges[0].from_entity.fqn == "svc.db.public.orders"
    assert edges[0].to_entity.fqn == "svc.db.public.target"
    assert len(queries) == 1


def test_lineage_same_execution_different_edges_both_emitted() -> None:
    cursor = _FakeCursor(
        [
            _row(query_id=7, database="db1", schema="public", query_text=SQL_2PART),
            _row(query_id=7, database="db2", schema="public", query_text=SQL_2PART),
        ]
    )
    records = _lineage_records(cursor)
    edges = [r for r in records if isinstance(r, LineageRecord)]
    queries = [r for r in records if isinstance(r, QueryRecord)]
    assert len(edges) == 2
    assert {e.from_entity.fqn for e in edges} == {
        "svc.db1.public.orders",
        "svc.db2.public.orders",
    }
    # One execution still yields one query record, even across edges.
    assert len(queries) == 1


def test_lineage_id_less_records_keep_current_behavior() -> None:
    cursor = _FakeCursor(
        [
            _row(query_id=None, database="db", schema="sch1", query_text=SQL_3PART),
            _row(query_id=None, database="db", schema="sch2", query_text=SQL_3PART),
        ]
    )
    records = _lineage_records(cursor)
    edges = [r for r in records if isinstance(r, LineageRecord)]
    queries = [r for r in records if isinstance(r, QueryRecord)]
    assert len(edges) == 2
    assert len(queries) == 2


# --- Lineage preflight ------------------------------------------------------
# The lineage prepare() wiring (instance probe + privilege preflight,
# cached for the lazily built query-log source) had no test
# execution: every lineage test above drives produce() without
# prepare(), so the provisioned template always won by default.


def _prepared_lineage_records(source: RedshiftLineageSource) -> list[Any]:
    source.bind_client(_FakeRestClient(_catalog()))  # type: ignore[arg-type]
    return list(source.produce())


def test_lineage_prepare_provisioned_selects_provisioned_template() -> None:
    cursor = _FakeCursor(
        [_row(query_id=7, database="db", schema="public", query_text=SQL_3PART)],
        privilege_row=(True, True, True, True),
    )
    source = _lineage_source(cursor)
    source.prepare()
    assert source._redshift_instance_type is RedshiftInstanceType.PROVISIONED
    records = _prepared_lineage_records(source)
    edges = [r for r in records if isinstance(r, LineageRecord)]
    assert len(edges) == 1
    assert edges[0].from_entity.fqn == "svc.db.public.orders"
    assert edges[0].to_entity.fqn == "svc.db.public.target"
    probe_statements = [s for s in cursor.statements if "stl_query LIMIT 1" in s]
    assert len(probe_statements) == 1
    history = [s for s in cursor.statements if "FROM STL_QUERYTEXT t" in s]
    assert len(history) == 1
    assert cursor.statements.index(probe_statements[0]) < cursor.statements.index(
        history[0]
    )


def test_lineage_prepare_serverless_selects_serverless_template() -> None:
    cursor = _FakeCursor(
        [_row(query_id=7, database="db", schema="public", query_text=SQL_3PART)],
        probe_error=_PgError("42P01"),
        privilege_row=(True, True, True),
    )
    source = _lineage_source(cursor)
    source.prepare()
    assert source._redshift_instance_type is RedshiftInstanceType.SERVERLESS
    records = _prepared_lineage_records(source)
    edges = [r for r in records if isinstance(r, LineageRecord)]
    assert len(edges) == 1
    assert edges[0].from_entity.fqn == "svc.db.public.orders"
    assert edges[0].to_entity.fqn == "svc.db.public.target"
    assert any("FROM SYS_QUERY_HISTORY" in s for s in cursor.statements)
    assert not any("FROM STL_QUERYTEXT t" in s for s in cursor.statements)


def test_lineage_prepare_missing_serverless_view_fails_loud() -> None:
    cursor = _FakeCursor(
        [],
        probe_error=_PgError("42P01"),
        privilege_row=(True, True, False),
    )
    source = _lineage_source(cursor)
    with pytest.raises(WorkflowError, match="SYS_QUERY_DETAIL"):
        source.prepare()
    assert not any("FROM SYS_QUERY_HISTORY" in s for s in cursor.statements)


def test_lineage_probe_runs_once_per_run_despite_two_day_batches() -> None:
    cursor = _FakeCursor(
        [_row(query_id=7, database="db", schema="public", query_text=SQL_3PART)],
        privilege_row=(True, True, True, True),
    )
    source = _lineage_source(cursor, queryLogDuration=1)
    source.prepare()
    _prepared_lineage_records(source)
    probe_statements = [s for s in cursor.statements if "stl_query LIMIT 1" in s]
    privilege_statements = [s for s in cursor.statements if "has_table_privilege" in s]
    history = [s for s in cursor.statements if "FROM STL_QUERYTEXT t" in s]
    assert len(probe_statements) == 1
    assert len(privilege_statements) == 1
    assert len(history) == 2
