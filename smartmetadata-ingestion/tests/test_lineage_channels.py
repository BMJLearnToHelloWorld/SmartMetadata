# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Query processor + view channel behavior, against a fake catalog.

The fake client answers the REST reads the channels need; the
parser is real, so the tests assert observable outcomes of parsing
+ binding + assembly, not mock wiring."""

from __future__ import annotations

import hashlib
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.query_lineage import (
    IncrementalChecker,
    LineageEdge,
    QueryLineageProcessor,
)
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.lineage.view_lineage import (
    ViewItem,
    ViewLineageChannel,
    wrap_view_definition,
)
from smartmetadata_ingestion.records import LineageRecord, QueryRecord
from smartmetadata_ingestion.sinks.metadata_rest import MetadataRestSink

SERVICE = "svc"
DB = "db"
SCHEMA = "public"
ORDERS = f"{SERVICE}.{DB}.{SCHEMA}.orders"
CUSTOMERS = f"{SERVICE}.{DB}.{SCHEMA}.customers"
ORDERS_V = f"{SERVICE}.{DB}.{SCHEMA}.orders_v"
TARGET = f"{SERVICE}.{DB}.{SCHEMA}.target"
TARGET2 = f"{SERVICE}.{DB}.{SCHEMA}.target2"


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
        users: dict[str, dict[str, Any]] | None = None,
        *,
        delete_lineage_status: int | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}
        self._queries = queries or {}
        self._lineage_graphs = lineage_graphs or {}
        self._users = users or {}
        self._delete_lineage_status = delete_lineage_status
        self.deleted_lineage: list[tuple[str, str, str]] = []
        self.upserted_queries: list[dict[str, Any]] = []
        self.query_usages: list[tuple[str, list]] = []
        self.query_users: list[tuple[str, list]] = []
        self.query_used_by: list[tuple[str, list]] = []
        self.put_lineages: list[dict[str, Any]] = []

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
        self.deleted_lineage.append((entity_type, fqn, source))
        if self._delete_lineage_status is not None:
            raise RestError("delete failed", status_code=self._delete_lineage_status)
        return None

    def get_user_by_name(self, name: str) -> dict[str, Any]:
        entity = self._users.get(name)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def upsert_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.upserted_queries.append(payload)
        return {"id": "query-id", "name": "query-name"}

    def add_query_usage(self, query_id: str, table_refs: list) -> None:
        self.query_usages.append((query_id, table_refs))

    def add_query_users(self, query_id: str, user_fqns: list) -> None:
        self.query_users.append((query_id, user_fqns))

    def add_query_used_by(self, query_id: str, names: list) -> None:
        self.query_used_by.append((query_id, names))

    def put_lineage(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.put_lineages.append(payload)
        return payload


def _catalog() -> dict[str, dict[str, Any]]:
    return {
        ORDERS: _table(ORDERS, ["id", "email", "customer_id"]),
        CUSTOMERS: _table(CUSTOMERS, ["id", "name"]),
        ORDERS_V: _table(ORDERS_V, ["id", "email"]),
        TARGET: _table(TARGET, ["id", "email"]),
        TARGET2: _table(TARGET2, ["id"]),
    }


def _processor(
    client: _FakeClient,
    *,
    temp_enabled: bool = False,
    checker: IncrementalChecker | None = None,
) -> QueryLineageProcessor:
    resolver = LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=DB,
        default_schema=SCHEMA,
    )
    return QueryLineageProcessor(
        resolver,
        service_name=SERVICE,
        dialect=Dialect.POSTGRES,
        enable_temp_table_lineage=temp_enabled,
        incremental_checker=checker,
    )


def _channel(
    client: _FakeClient,
    processor: QueryLineageProcessor,
    resolver: LineageBindingResolver,
    *,
    override: bool = False,
    incremental: bool = True,
    include_tables: list[str] | None = None,
    exclude_tables: list[str] | None = None,
) -> ViewLineageChannel:
    return ViewLineageChannel(
        processor,
        resolver,
        client,  # type: ignore[arg-type]
        service_name=SERVICE,
        override_view_lineage=override,
        incremental_lineage_processing=incremental,
        include_databases=[],
        exclude_databases=[],
        include_schemas=[],
        exclude_schemas=[],
        include_tables=include_tables or [],
        exclude_tables=exclude_tables or [],
    )


def _resolver(client: _FakeClient) -> LineageBindingResolver:
    return LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=DB,
        default_schema=SCHEMA,
    )


def _lineage_graph(from_fqn: str, to_fqn: str, sql_query: str) -> dict[str, Any]:
    return {
        "entity": {"id": f"id-{to_fqn}", "fullyQualifiedName": to_fqn},
        "nodes": [
            {"id": f"id-{from_fqn}", "fullyQualifiedName": from_fqn},
            {"id": f"id-{to_fqn}", "fullyQualifiedName": to_fqn},
        ],
        "upstreamEdges": [
            {
                "fromEntity": f"id-{from_fqn}",
                "toEntity": f"id-{to_fqn}",
                "lineageDetails": {"sqlQuery": sql_query},
            }
        ],
        "downstreamEdges": [],
    }


# --- query processor -------------------------------------------------


def test_insert_select_yields_edge_with_column_lineage() -> None:
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "INSERT INTO public.target (id, email) "
        "SELECT id, email FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
        emit_query_record=True,
    )
    assert processed.parsed is True
    assert len(processed.edges) == 1
    edge = processed.edges[0]
    assert edge.from_fqn == ORDERS and edge.to_fqn == TARGET
    assert edge.cross_database is False
    pairs = {
        (mapping.from_columns[0], mapping.to_column) for mapping in edge.columns
    }
    assert pairs == {
        (f"{ORDERS}.id", f"{TARGET}.id"),
        (f"{ORDERS}.email", f"{TARGET}.email"),
    }
    assert processed.query_record is not None
    assert processed.query_record.processed_lineage is True
    assert sorted(processed.query_record.table_fqns) == [ORDERS, TARGET]


def test_plain_select_emits_query_record_without_edges() -> None:
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "SELECT id FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
        emit_query_record=True,
    )
    assert processed.edges == []
    assert processed.query_record is not None
    assert processed.query_record.table_fqns == [ORDERS]


def test_query_with_no_tables_contributes_nothing() -> None:
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "SELECT 1", emit_query_record=True, database_name=DB, database_schema=SCHEMA
    )
    assert processed.parsed is False
    assert processed.edges == [] and processed.query_record is None


def test_unbound_target_earns_no_query_record() -> None:
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "INSERT INTO public.missing (id) SELECT id FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
        emit_query_record=True,
    )
    assert processed.parsed is True
    assert processed.edges == []
    assert processed.query_record is None
    assert processed.unbound_tables == ["public.missing"]


def test_star_columns_keep_the_edge_without_mappings() -> None:
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "INSERT INTO public.target SELECT * FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
    )
    assert len(processed.edges) == 1
    assert processed.edges[0].columns == []


def test_function_pseudo_column_keeps_edge_and_counts_unresolved_udf() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    processed = processor.process(
        "INSERT INTO public.target SELECT MY_UDF(public.orders.id) FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
    )
    assert len(processed.edges) == 1
    assert processed.edges[0].columns == []
    assert resolver.unresolved_udf_count == 1


def test_edge_sql_is_masked_while_query_record_keeps_raw_text() -> None:
    sql = (
        "INSERT INTO public.target (id) "
        "SELECT id FROM public.orders WHERE email = 'alice@example.com'"
    )
    processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, emit_query_record=True
    )
    assert len(processed.edges) == 1
    masked = (
        "INSERT INTO public.target (id) "
        "SELECT id FROM public.orders WHERE email = ?"
    )
    assert processed.edges[0].sql_query == masked
    assert processed.masked_query == masked
    assert processed.query_record is not None
    assert processed.query_record.query == sql


def test_udf_resolves_in_query_schema_context() -> None:
    # The UDF lives in a non-default schema; the query's own
    # database/schema context — not the connection defaults — is
    # what resolves the bare function name.
    procedures = {
        "svc.otherdb.otherschema.my_udf": {
            "id": "udf-id",
            "fullyQualifiedName": "svc.otherdb.otherschema.my_udf",
            "name": "my_udf",
            "storedProcedureCode": {
                "code": "INSERT INTO db.public.target2 (id) "
                "SELECT id FROM db.public.customers",
                "language": "SQL",
            },
        }
    }
    client = _FakeClient(_catalog(), procedures)
    processor = _processor(client)
    processed = processor.process(
        "INSERT INTO db.public.target "
        "SELECT my_udf(db.public.orders.id) FROM db.public.orders",
        database_name="otherdb",
        database_schema="otherschema",
    )
    assert processed.udf_expansions == 1
    pairs = {(edge.from_fqn, edge.to_fqn) for edge in processed.edges}
    assert (CUSTOMERS, TARGET2) in pairs


def test_cataloged_udf_body_expands_into_edges() -> None:
    procedures = {
        f"{SERVICE}.{DB}.{SCHEMA}.my_udf": {
            "id": "udf-id",
            "fullyQualifiedName": f"{SERVICE}.{DB}.{SCHEMA}.my_udf",
            "name": "my_udf",
            "storedProcedureCode": {
                "code": "INSERT INTO public.target2 (id) "
                "SELECT id FROM public.customers",
                "language": "SQL",
            },
        }
    }
    client = _FakeClient(_catalog(), procedures)
    processor = _processor(client)
    processed = processor.process(
        "INSERT INTO public.target SELECT my_udf(public.orders.id) FROM public.orders",
        database_name=DB,
        database_schema=SCHEMA,
    )
    assert processed.udf_expansions == 1
    pairs = {(edge.from_fqn, edge.to_fqn) for edge in processed.edges}
    assert (ORDERS, TARGET) in pairs
    assert (CUSTOMERS, TARGET2) in pairs


def test_temp_hops_accumulate_only_when_enabled() -> None:
    sql = (
        "INSERT INTO tmp_stage SELECT * FROM public.orders; "
        "INSERT INTO public.target SELECT * FROM tmp_stage"
    )
    disabled = _processor(_FakeClient(_catalog())).process(
        sql, database_name=DB, database_schema=SCHEMA
    )
    assert disabled.temp_hops == []
    enabled = _processor(_FakeClient(_catalog()), temp_enabled=True).process(
        sql, database_name=DB, database_schema=SCHEMA
    )
    assert len(enabled.temp_hops) == 2
    assert {hop.from_key for hop in enabled.temp_hops} == {ORDERS, "tmp_stage"}
    assert {hop.to_key for hop in enabled.temp_hops} == {"tmp_stage", TARGET}


def test_cross_database_edge_is_flagged() -> None:
    tables = _catalog()
    tables["other_svc.db.public.remote"] = _table("other_svc.db.public.remote", ["id"])
    client = _FakeClient(tables)
    resolver = LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=DB,
        default_schema=SCHEMA,
        cross_database_service_names=["other_svc"],
        process_cross_database_lineage=True,
    )
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    processed = processor.process(
        "INSERT INTO public.target (id) SELECT id FROM db.public.remote",
        database_name=DB,
        database_schema=SCHEMA,
    )
    assert len(processed.edges) == 1
    assert processed.edges[0].from_fqn == "other_svc.db.public.remote"
    assert processed.edges[0].cross_database is True


def test_edges_intact_checks_every_edge_not_just_the_first() -> None:
    sql = "SELECT 1"
    edges = [
        LineageEdge(from_fqn=ORDERS, to_fqn=TARGET),
        LineageEdge(from_fqn=ORDERS, to_fqn=TARGET2),
    ]
    # First edge intact, second gone: not intact.
    client = _FakeClient(
        _catalog(),
        lineage_graphs={
            TARGET: _lineage_graph(ORDERS, TARGET, sql),
            TARGET2: _lineage_graph(CUSTOMERS, TARGET2, sql),
        },
    )
    assert IncrementalChecker(client).edges_intact(sql, edges) is False  # type: ignore[arg-type]
    # Both intact: intact.
    client = _FakeClient(
        _catalog(),
        lineage_graphs={
            TARGET: _lineage_graph(ORDERS, TARGET, sql),
            TARGET2: _lineage_graph(ORDERS, TARGET2, sql),
        },
    )
    assert IncrementalChecker(client).edges_intact(sql, edges) is True  # type: ignore[arg-type]


def test_incremental_skip_when_processed_and_edge_intact() -> None:
    sql = (
        "INSERT INTO public.target (id) SELECT id FROM public.orders"
    )
    query_hash = hashlib.md5(sql.encode("utf-8")).hexdigest()
    client = _FakeClient(
        _catalog(),
        queries={query_hash: {"processedLineage": True}},
        lineage_graphs={TARGET: _lineage_graph(ORDERS, TARGET, sql)},
    )
    processor = _processor(
        client, checker=IncrementalChecker(client)  # type: ignore[arg-type]
    )
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, incremental=True
    )
    assert processed.skipped_incremental is True
    assert processed.edges == []


def test_incremental_reprocesses_when_edge_is_gone() -> None:
    sql = "INSERT INTO public.target (id) SELECT id FROM public.orders"
    query_hash = hashlib.md5(sql.encode("utf-8")).hexdigest()
    client = _FakeClient(
        _catalog(),
        queries={query_hash: {"processedLineage": True}},
        lineage_graphs={TARGET: _lineage_graph(CUSTOMERS, TARGET, sql)},
    )
    processor = _processor(
        client, checker=IncrementalChecker(client)  # type: ignore[arg-type]
    )
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, incremental=True
    )
    assert processed.skipped_incremental is False
    assert len(processed.edges) == 1


def test_incremental_reprocesses_when_second_edge_is_gone() -> None:
    sql = (
        "INSERT INTO public.target (id) SELECT id FROM public.orders; "
        "INSERT INTO public.target2 (id) SELECT id FROM public.customers"
    )
    query_hash = hashlib.md5(sql.encode("utf-8")).hexdigest()
    client = _FakeClient(
        _catalog(),
        queries={query_hash: {"processedLineage": True}},
        lineage_graphs={TARGET: _lineage_graph(ORDERS, TARGET, sql)},
    )
    processor = _processor(
        client, checker=IncrementalChecker(client)  # type: ignore[arg-type]
    )
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, incremental=True
    )
    # The target2 graph is missing, so the second edge is not
    # intact: the query reprocesses with both edges.
    assert processed.skipped_incremental is False
    assert len(processed.edges) == 2


def test_incremental_skips_when_all_edges_intact() -> None:
    sql = (
        "INSERT INTO public.target (id) SELECT id FROM public.orders; "
        "INSERT INTO public.target2 (id) SELECT id FROM public.customers"
    )
    query_hash = hashlib.md5(sql.encode("utf-8")).hexdigest()
    client = _FakeClient(
        _catalog(),
        queries={query_hash: {"processedLineage": True}},
        lineage_graphs={
            TARGET: _lineage_graph(ORDERS, TARGET, sql),
            TARGET2: _lineage_graph(CUSTOMERS, TARGET2, sql),
        },
    )
    processor = _processor(
        client, checker=IncrementalChecker(client)  # type: ignore[arg-type]
    )
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, incremental=True
    )
    assert processed.skipped_incremental is True
    assert processed.edges == []


def test_incremental_reprocesses_when_query_not_flagged() -> None:
    sql = "INSERT INTO public.target (id) SELECT id FROM public.orders"
    query_hash = hashlib.md5(sql.encode("utf-8")).hexdigest()
    client = _FakeClient(
        _catalog(),
        queries={query_hash: {"processedLineage": False}},
        lineage_graphs={TARGET: _lineage_graph(ORDERS, TARGET, sql)},
    )
    processor = _processor(
        client, checker=IncrementalChecker(client)  # type: ignore[arg-type]
    )
    processed = processor.process(
        sql, database_name=DB, database_schema=SCHEMA, incremental=True
    )
    assert processed.skipped_incremental is False
    assert len(processed.edges) == 1


def test_incremental_checker_non_404_errors_propagate() -> None:
    class _FailingClient(_FakeClient):
        def get_query_by_name(self, name: str) -> dict[str, Any]:
            raise RestError("boom", status_code=500)

    checker = IncrementalChecker(_FakeClient())  # type: ignore[arg-type]
    failing = IncrementalChecker(_FailingClient())  # type: ignore[arg-type]
    assert checker.lookup_processed("SELECT 1") is False
    with pytest.raises(RestError):
        failing.lookup_processed("SELECT 1")


# --- view channel ----------------------------------------------------


def test_wrap_view_definition_leaves_create_alone() -> None:
    assert wrap_view_definition("SELECT * FROM t").startswith("CREATE VIEW __lineage_view__ AS ")
    assert wrap_view_definition("CREATE VIEW v AS SELECT 1") == "CREATE VIEW v AS SELECT 1"


def test_view_channel_emits_view_lineage_with_original_definition() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver)
    definition = "SELECT id, email FROM public.orders"
    records, outcome, hops = channel.process_one(
        ViewItem(database=DB, schema=SCHEMA, name="orders_v", definition=definition)
    )
    assert outcome.edges == 1 and outcome.seen == 1
    assert hops == []
    assert len(records) == 1
    record = records[0]
    assert isinstance(record, LineageRecord)
    assert record.source == "ViewLineage"
    assert record.sql_query == definition
    assert record.from_entity.fqn == ORDERS
    assert record.to_entity.fqn == ORDERS_V
    assert {
        (m.from_columns[0], m.to_column) for m in record.columns_lineage
    } == {
        (f"{ORDERS}.id", f"{ORDERS_V}.id"),
        (f"{ORDERS}.email", f"{ORDERS_V}.email"),
    }


def test_view_channel_skips_empty_definition_and_uncataloged_view() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver)
    _, outcome, _ = channel.process_one(
        ViewItem(database=DB, schema=SCHEMA, name="orders_v", definition="  ")
    )
    assert outcome.skipped_empty == 1
    _, outcome, _ = channel.process_one(
        ViewItem(database=DB, schema=SCHEMA, name="ghost", definition="SELECT 1")
    )
    assert outcome.skipped_not_cataloged == 1


def test_view_channel_filter_selection() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(
        client, processor, resolver, include_tables=["orders.*"], exclude_tables=[]
    )
    view = ViewItem(database=DB, schema=SCHEMA, name="orders_v", definition="SELECT 1")
    assert channel.selected(view) is True
    channel = _channel(
        client, processor, resolver, include_tables=[], exclude_tables=["orders.*"]
    )
    assert channel.selected(view) is False


def test_view_channel_override_deletes_before_writing() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver, override=True)
    _, outcome, _ = channel.process_one(
        ViewItem(
            database=DB,
            schema=SCHEMA,
            name="orders_v",
            definition="SELECT id FROM public.orders",
        )
    )
    assert outcome.overrides_deleted == 1
    assert client.deleted_lineage == [("table", ORDERS_V, "ViewLineage")]


def test_view_channel_override_tolerates_missing_lineage() -> None:
    client = _FakeClient(_catalog(), delete_lineage_status=404)
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver, override=True)
    records, outcome, _ = channel.process_one(
        ViewItem(
            database=DB,
            schema=SCHEMA,
            name="orders_v",
            definition="SELECT id FROM public.orders",
        )
    )
    assert outcome.edges == 1 and len(records) == 1


def test_view_channel_override_skips_delete_when_no_edges() -> None:
    client = _FakeClient(_catalog())
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver, override=True)
    _, outcome, _ = channel.process_one(
        ViewItem(
            database=DB,
            schema=SCHEMA,
            name="orders_v",
            definition="SELECT 1",
        )
    )
    # A definition that parsed to no edges must not wipe the
    # lineage the run cannot replace.
    assert outcome.overrides_deleted == 0
    assert client.deleted_lineage == []


def test_view_channel_override_propagates_server_errors() -> None:
    client = _FakeClient(_catalog(), delete_lineage_status=500)
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver, override=True)
    with pytest.raises(RestError):
        channel.process_one(
            ViewItem(
                database=DB,
                schema=SCHEMA,
                name="orders_v",
                definition="SELECT id FROM public.orders",
            )
        )


def test_view_channel_incremental_skip_requires_matching_stored_sql() -> None:
    definition = "SELECT id FROM public.orders"
    client = _FakeClient(
        _catalog(),
        lineage_graphs={ORDERS_V: _lineage_graph(ORDERS, ORDERS_V, definition)},
    )
    resolver = _resolver(client)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(client, processor, resolver, incremental=True)
    records, outcome, _ = channel.process_one(
        ViewItem(database=DB, schema=SCHEMA, name="orders_v", definition=definition)
    )
    assert outcome.skipped_incremental == 1 and records == []

    stale = _FakeClient(
        _catalog(),
        lineage_graphs={
            ORDERS_V: _lineage_graph(ORDERS, ORDERS_V, "SELECT other FROM public.orders")
        },
    )
    resolver = _resolver(stale)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    channel = _channel(stale, processor, resolver, incremental=True)
    records, outcome, _ = channel.process_one(
        ViewItem(database=DB, schema=SCHEMA, name="orders_v", definition=definition)
    )
    assert outcome.skipped_incremental == 0 and len(records) == 1


# --- QueryRecord sink write ------------------------------------------


def test_sink_writes_query_record_with_links_and_user() -> None:
    client = _FakeClient(
        _catalog(),
        users={"alice": {"fullyQualifiedName": "alice", "name": "alice"}},
    )
    sink = MetadataRestSink(client)  # type: ignore[arg-type]
    record = QueryRecord(
        query="INSERT INTO public.target SELECT * FROM public.orders",
        service_name=SERVICE,
        dialect="postgres",
        user_name="alice",
        table_fqns=[ORDERS, TARGET],
    )
    sink.write(record)
    assert len(client.upserted_queries) == 1
    payload = client.upserted_queries[0]
    assert "name" not in payload
    assert payload["service"] == SERVICE
    assert payload["processedLineage"] is True
    assert payload["query"].startswith("INSERT INTO")
    assert sorted(ref["id"] for _, refs in client.query_usages for ref in refs) == [
        f"id-{ORDERS}",
        f"id-{TARGET}",
    ]
    assert client.query_users == [("query-id", ["alice"])]
    # A resolved user sets BOTH users and usedBy.
    assert client.query_used_by == [("query-id", ["alice"])]


def test_sink_query_record_skips_unresolvable_table_and_unknown_user() -> None:
    client = _FakeClient(_catalog())
    sink = MetadataRestSink(client)  # type: ignore[arg-type]
    record = QueryRecord(
        query="SELECT 1",
        service_name=SERVICE,
        user_name="ghost",
        table_fqns=[ORDERS, f"{SERVICE}.{DB}.{SCHEMA}.missing"],
    )
    sink.write(record)
    assert len(client.query_usages) == 1
    assert client.query_users == []
    assert client.query_used_by == [("query-id", ["ghost"])]


def test_sink_query_record_carries_triggered_by_procedure() -> None:
    client = _FakeClient(_catalog())
    sink = MetadataRestSink(client)  # type: ignore[arg-type]
    record = QueryRecord(
        query="SELECT 1",
        service_name=SERVICE,
        triggered_by_fqn=f"{SERVICE}.{DB}.{SCHEMA}.load_orders",
    )
    sink.write(record)
    assert client.upserted_queries[0]["triggeredBy"] == {
        "type": "storedProcedure",
        "fullyQualifiedName": f"{SERVICE}.{DB}.{SCHEMA}.load_orders",
    }
