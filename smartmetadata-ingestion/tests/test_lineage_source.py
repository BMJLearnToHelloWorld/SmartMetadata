# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""LineageSource orchestration: channel order, toggles, gates,
chunking/threads, temp-graph flush, and per-engine connector
wiring — against a fake catalog and canned enumerators."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.mariadb_common import (
    SchemaRow as MariaSchemaRow,
)
from smartmetadata_ingestion.connectors.mariadb_common import (
    SequenceCatalogReader as MariaSequenceCatalogReader,
)
from smartmetadata_ingestion.connectors.mariadb_common import (
    TableRow as MariaTableRow,
)
from smartmetadata_ingestion.connectors.mariadb_common import (
    ViewRow as MariaViewRow,
)
from smartmetadata_ingestion.connectors.mariadb_lineage import MariaDBLineageSource
from smartmetadata_ingestion.connectors.postgres_common import (
    DatabaseRow,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
    ViewRow,
)
from smartmetadata_ingestion.connectors.postgres_lineage import PostgresLineageSource
from smartmetadata_ingestion.connectors.snowflake_lineage import SnowflakeLineageSource
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.procedure_lineage import (
    ProcedureCall,
    SnowflakeProcedureProvider,
)
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import ViewItem
from smartmetadata_ingestion.records import LineageRecord, QueryRecord, TableQueryRecord

SERVICE = "svc"
DB = "db"
SCHEMA = "public"
ORDERS = f"{SERVICE}.{DB}.{SCHEMA}.orders"
TARGET = f"{SERVICE}.{DB}.{SCHEMA}.target"
ORDERS_V = f"{SERVICE}.{DB}.{SCHEMA}.orders_v"


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
        queries: dict[str, dict[str, Any]] | None = None,
        lineage_graphs: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}
        self._queries = queries or {}
        self._lineage_graphs = lineage_graphs or {}

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

    def get_query_by_name(self, name: str) -> dict[str, Any]:
        entity = self._queries.get(name)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_lineage_by_name(
        self, entity_type: str, fqn: str, *, upstream_depth=1, downstream_depth=1
    ) -> dict[str, Any]:
        graph = self._lineage_graphs.get(fqn)
        if graph is None:
            raise RestError("not found", status_code=404)
        return graph

    def delete_lineage_by_source(self, entity_type: str, fqn: str, source: str):
        return None


def _catalog() -> dict[str, dict[str, Any]]:
    return {
        ORDERS: _table(ORDERS, ["id", "email"]),
        TARGET: _table(TARGET, ["id", "email"]),
        ORDERS_V: _table(ORDERS_V, ["id", "email"]),
    }


def _config(**overrides: Any) -> SourceConfig:
    values: dict[str, Any] = {
        "type": "postgres-lineage",
        "service_name": SERVICE,
        "connection": {"database": DB, "databaseSchema": SCHEMA},
    }
    values.update(overrides)
    return SourceConfig(**values)


class _ListEnumerator:
    def __init__(self, views: list[ViewItem]) -> None:
        self._views = views

    def iter_views(self):
        yield from self._views


class _ListQueryLog:
    def __init__(self, records: list[TableQueryRecord]) -> None:
        self._records = records

    def produce(self):
        yield from self._records


class _ListProvider:
    engine_key = "test"

    def __init__(self, calls: list[ProcedureCall]) -> None:
        self._calls = calls

    def iter_calls(self, *, duration_days: int, result_limit: int):
        yield from self._calls


def _source(
    client: _FakeClient,
    config: SourceConfig,
    *,
    engine_key: str = "postgres",
    views: list[ViewItem] | None = None,
    query_records: list[TableQueryRecord] | None = None,
    calls: list[ProcedureCall] | None = None,
    provider: Any | None = None,
) -> LineageSource:
    return LineageSource(
        config,
        engine_key=engine_key,
        dialect=Dialect.POSTGRES,
        client=client,  # type: ignore[arg-type]
        view_enumerator=_ListEnumerator(views or []),
        query_log_source=_ListQueryLog(query_records or []),
        procedure_provider=provider if provider is not None else _ListProvider(calls or []),
    )


def _view(name: str = "orders_v", definition: str = "SELECT id FROM public.orders") -> ViewItem:
    return ViewItem(database=DB, schema=SCHEMA, name=name, definition=definition)


def _query(sql: str) -> TableQueryRecord:
    return TableQueryRecord(
        query=sql,
        service_name=SERVICE,
        database_name=DB,
        database_schema=SCHEMA,
    )


def test_view_channel_only_when_other_toggles_off() -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_query_lineage=False, process_stored_procedure_lineage=False
    )
    source = _source(client, config, views=[_view()])
    records = list(source.produce())
    assert len(records) == 1
    assert isinstance(records[0], LineageRecord)
    assert records[0].source == "ViewLineage"
    assert source.summary.views_seen == 1
    assert source.summary.view_edges == 1
    assert source.summary.channels_attempted == ["view"]


def test_query_channel_emits_edges_then_query_record() -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_view_lineage=False, process_stored_procedure_lineage=False
    )
    source = _source(
        client,
        config,
        query_records=[
            _query("INSERT INTO public.target (id) SELECT id FROM public.orders")
        ],
    )
    records = list(source.produce())
    assert len(records) == 2
    assert isinstance(records[0], LineageRecord)
    assert records[0].source == "QueryLineage"
    assert isinstance(records[1], QueryRecord)
    assert source.summary.queries_seen == 1
    assert source.summary.query_edges == 1
    assert source.summary.query_records == 1


def test_query_channel_edges_carry_masked_sql() -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_view_lineage=False, process_stored_procedure_lineage=False
    )
    sql = "INSERT INTO public.target (id) SELECT id FROM public.orders WHERE id = 42"
    source = _source(client, config, query_records=[_query(sql)])
    records = list(source.produce())
    lineage = [r for r in records if isinstance(r, LineageRecord)]
    assert len(lineage) == 1
    assert (
        lineage[0].sql_query
        == "INSERT INTO public.target (id) SELECT id FROM public.orders WHERE id = ?"
    )
    queries = [r for r in records if isinstance(r, QueryRecord)]
    assert len(queries) == 1
    assert queries[0].query == sql


def test_all_channels_disabled_produces_nothing_with_warning(caplog) -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_view_lineage=False,
        process_query_lineage=False,
        process_stored_procedure_lineage=False,
        process_cross_database_lineage=False,
    )
    source = _source(client, config, views=[_view()])
    with caplog.at_level(logging.WARNING):
        assert list(source.produce()) == []
    assert "all lineage channels are disabled" in caplog.text


def test_produce_without_client_fails_loudly() -> None:
    source = LineageSource(
        _config(),
        engine_key="postgres",
        dialect=Dialect.POSTGRES,
        view_enumerator=_ListEnumerator([_view()]),
    )
    with pytest.raises(WorkflowError, match="no REST client"):
        list(source.produce())


def test_threads_below_one_fails_loudly() -> None:
    client = _FakeClient(_catalog())
    source = _source(client, _config(threads=0), views=[_view()])
    with pytest.raises(WorkflowError, match="threads"):
        list(source.produce())


def test_query_channel_gated_off_for_undeclared_engine(caplog) -> None:
    client = _FakeClient(_catalog())
    config = _config(process_stored_procedure_lineage=False)
    source = _source(
        client,
        config,
        engine_key="doris",
        views=[_view()],
        query_records=[_query("INSERT INTO public.target SELECT * FROM public.orders")],
    )
    with caplog.at_level(logging.WARNING):
        records = list(source.produce())
    assert len(records) == 1  # view edge only; query channel skipped
    assert records[0].source == "ViewLineage"
    assert "does not declare supportsLineageExtraction" in caplog.text
    assert source.summary.queries_seen == 0


def test_cross_database_enabled_but_unnamed_warns(caplog) -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_view_lineage=False,
        process_query_lineage=False,
        process_stored_procedure_lineage=False,
        process_cross_database_lineage=True,
        cross_database_service_names=[],
    )
    source = _source(client, config)
    with caplog.at_level(logging.WARNING):
        assert list(source.produce()) == []
    assert "crossDatabaseServiceNames is empty" in caplog.text
    assert source.summary.channels_attempted == ["crossDatabase"]


def test_procedure_channel_without_provider_warns_and_continues(caplog) -> None:
    client = _FakeClient(_catalog())
    config = _config(process_query_lineage=False)
    source = LineageSource(
        config,
        engine_key="postgres",
        dialect=Dialect.POSTGRES,
        client=client,  # type: ignore[arg-type]
        view_enumerator=_ListEnumerator([_view()]),
        query_log_source=_ListQueryLog([]),
    )
    with caplog.at_level(logging.WARNING):
        records = list(source.produce())
    assert len(records) == 1
    assert "not supported for engine postgres" in caplog.text


def test_procedure_channel_with_provider_emits_graph() -> None:
    proc = f"{SERVICE}.{DB}.{SCHEMA}.load_orders"
    client = _FakeClient(
        _catalog(),
        {
            proc: {
                "id": "proc-id",
                "fullyQualifiedName": proc,
                "name": "load_orders",
                "storedProcedureCode": {
                    "code": "INSERT INTO public.target (id) SELECT id FROM public.orders",
                    "language": "SQL",
                },
            }
        },
    )
    config = _config(process_view_lineage=False, process_query_lineage=False)
    source = _source(
        client,
        config,
        calls=[
            ProcedureCall(
                call_text="CALL load_orders()", database_name=DB, schema_name=SCHEMA
            )
        ],
    )
    records = list(source.produce())
    assert len(records) == 4  # body edge + 2 graph edges + query record
    assert source.summary.procedure_edges == 3
    assert source.summary.procedure_queries == 1


def test_empty_view_channel_warns_but_run_succeeds(caplog) -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_query_lineage=False, process_stored_procedure_lineage=False
    )
    source = _source(client, config, views=[])
    with caplog.at_level(logging.WARNING):
        assert list(source.produce()) == []
    assert "found no views" in caplog.text


def test_temp_graph_flushes_composed_edge_at_end() -> None:
    client = _FakeClient(_catalog())
    config = _config(
        process_view_lineage=False,
        process_stored_procedure_lineage=False,
        enable_temp_table_lineage=True,
    )
    sql = (
        "INSERT INTO tmp_stage SELECT * FROM public.orders; "
        "INSERT INTO public.target SELECT * FROM tmp_stage"
    )
    source = _source(client, config, query_records=[_query(sql)])
    records = list(source.produce())
    assert source.summary.temp_edges == 1
    flushed = records[-1]
    assert isinstance(flushed, LineageRecord)
    assert flushed.from_entity.fqn == ORDERS
    assert flushed.to_entity.fqn == TARGET
    assert flushed.source == "QueryLineage"
    assert flushed.sql_query == sql


def test_chunking_processes_more_than_one_chunk_with_threads() -> None:
    tables = _catalog()
    views = []
    for index in range(205):
        name = f"view_{index}"
        views.append(_view(name=name))
        tables[f"{SERVICE}.{DB}.{SCHEMA}.{name}"] = _table(
            f"{SERVICE}.{DB}.{SCHEMA}.{name}", ["id"]
        )
    client = _FakeClient(tables)
    config = _config(
        process_query_lineage=False,
        process_stored_procedure_lineage=False,
        threads=2,
    )
    source = _source(client, config, views=views)
    records = list(source.produce())
    assert len(records) == 205
    assert source.summary.views_seen == 205
    assert source.summary.view_edges == 205
    assert source.summary.timed_out_items == 0
    assert source.summary.failed_items == 0


# --- connector wiring ------------------------------------------------


def _pg_catalog() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[DatabaseRow(DB)],
        schemas=[SchemaRow(DB, SCHEMA)],
        tables=[
            TableRow(DB, SCHEMA, "orders", "BASE TABLE"),
            TableRow(DB, SCHEMA, "orders_v", "VIEW"),
        ],
        views=[
            ViewRow(DB, SCHEMA, "orders_v", "SELECT id, email FROM public.orders"),
        ],
    )


def test_postgres_connector_wires_view_and_csv_query_channels(tmp_path) -> None:
    log_file = tmp_path / "query_log.csv"
    log_file.write_text(
        "query_text,user_name,start_time,end_time,duration,cost\n"
        "INSERT INTO public.target (id) SELECT id FROM public.orders,alice,"
        "2026-11-13 09:00:00.000,,5,\n",
        encoding="utf-8",
    )
    config = _config(
        query_log_file_path=str(log_file),
        process_stored_procedure_lineage=False,
    )
    client = _FakeClient(_catalog())
    source = PostgresLineageSource(config, catalog=_pg_catalog())
    source.bind_client(client)  # type: ignore[arg-type]
    records = list(source.produce())
    kinds = [r.kind for r in records]
    assert kinds == ["lineage", "lineage", "query"]
    assert records[0].source == "ViewLineage"
    assert records[1].source == "QueryLineage"
    assert source.summary.views_seen == 1
    assert source.summary.query_records == 1


def test_mariadb_connector_runs_view_channel_only(caplog) -> None:
    catalog = MariaSequenceCatalogReader(
        schemas=[MariaSchemaRow(SCHEMA)],
        tables=[
            MariaTableRow(SCHEMA, "orders", "BASE TABLE"),
            MariaTableRow(SCHEMA, "orders_v", "VIEW"),
        ],
        views=[MariaViewRow(SCHEMA, "orders_v", "SELECT id FROM public.orders")],
    )
    config = SourceConfig(
        type="mariadb-lineage",
        service_name=SERVICE,
        connection={"databaseName": DB},
        process_stored_procedure_lineage=False,
    )
    client = _FakeClient(_catalog())
    source = MariaDBLineageSource(config, catalog=catalog)
    source.bind_client(client)  # type: ignore[arg-type]
    with caplog.at_level(logging.WARNING):
        records = list(source.produce())
    assert len(records) == 1
    assert records[0].source == "ViewLineage"
    assert "does not declare supportsLineageExtraction" in caplog.text


def test_snowflake_connector_wires_procedure_provider() -> None:
    proc = f"{SERVICE}.{DB}.{SCHEMA}.load_orders"
    client = _FakeClient(
        _catalog(),
        {
            proc: {
                "id": "proc-id",
                "fullyQualifiedName": proc,
                "name": "load_orders",
                "storedProcedureCode": {
                    "code": "INSERT INTO public.target (id) SELECT id FROM public.orders",
                    "language": "SQL",
                },
            }
        },
    )

    class _Cursor:
        description = [
            ("QUERY_TEXT", None),
            ("USER_NAME", None),
            ("START_TIME", None),
            ("DATABASE_NAME", None),
            ("SCHEMA_NAME", None),
        ]

        def execute(self, statement: str) -> None:
            self.statement = statement

        def fetchall(self):
            return [("CALL load_orders()", "alice", None, DB, SCHEMA)]

        def close(self) -> None:
            return None

    class _Connection:
        def __enter__(self):
            return self

        def __exit__(self, *exc) -> bool:
            return False

        def cursor(self):
            return _Cursor()

    config = _config(
        process_view_lineage=False,
        process_query_lineage=False,
    )
    source = SnowflakeLineageSource(
        config, catalog=_pg_catalog(), procedure_connect=_Connection
    )
    source.bind_client(client)  # type: ignore[arg-type]
    records = list(source.produce())
    assert len(records) == 4
    assert source.summary.procedure_queries == 1
    assert SnowflakeProcedureProvider.engine_key == "snowflake"
