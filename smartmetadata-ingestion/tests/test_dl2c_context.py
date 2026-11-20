# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""D-L2c context-passing tests (design §6 test 12 + §6 test 10
call-point assertions): record source marking at production,
``BindingContext`` threading through the usage and lineage chains,
extraction-level count forwarding, and the shared naming call points
— against a fake REST catalog and the real parser, never a live
database."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.parser import (
    ParsedTableColumn,
    ParsedTableColumnJoin,
    QueryParserType,
)
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.records import BindingContext, FieldSource, TableQueryRecord
from smartmetadata_ingestion.usage import workflow as usage_workflow_module
from smartmetadata_ingestion.usage.processor import ParsedData, parse_sql_statement
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSource,
    QueryLogSpec,
    single_engine_provider,
)
from smartmetadata_ingestion.usage.stage import (
    RestTableBindingResolver,
    UsageStage,
    new_binding_counts,
)
from smartmetadata_ingestion.usage.workflow import UsageWorkflow

SERVICE = "svc"
DB = "db"
SCHEMA = "public"
ORDERS = f"{SERVICE}.{DB}.{SCHEMA}.orders"
CUSTOMERS = f"{SERVICE}.{DB}.{SCHEMA}.customers"
TARGET = f"{SERVICE}.{DB}.{SCHEMA}.target"
TARGET2 = f"{SERVICE}.{DB}.{SCHEMA}.target2"
DAY_MS = str(int(datetime(2026, 11, 13, tzinfo=timezone.utc).timestamp() * 1000))


def _ident(*parts: str) -> StructuredIdentifier:
    return StructuredIdentifier.from_parts(zip(parts, (False,) * len(parts), strict=True))


def _ctx(
    database: str | None = None,
    schema: str | None = None,
    database_source: FieldSource = FieldSource.MISSING,
    schema_source: FieldSource = FieldSource.MISSING,
) -> BindingContext:
    return BindingContext(
        database_name=database,
        database_schema=schema,
        database_source=database_source,
        schema_source=schema_source,
    )


def _table(fqn: str, columns: list[str] | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }
    if columns is not None:
        entity["columns"] = [{"name": name} for name in columns]
    return entity


def _procedure(fqn: str, code: str | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }
    if code is not None:
        entity["storedProcedureCode"] = {"code": code, "language": "SQL"}
    return entity


class _FakeClient:
    """In-memory catalog reads, prefix-scoped by the requested schema."""

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


def _catalog() -> dict[str, dict[str, Any]]:
    return {
        ORDERS: _table(ORDERS, ["id", "email", "customer_id"]),
        CUSTOMERS: _table(CUSTOMERS, ["id", "name"]),
        TARGET: _table(TARGET, ["id", "email"]),
        TARGET2: _table(TARGET2, ["id"]),
    }


def _record(
    query: str,
    database_name: str | None = None,
    database_schema: str | None = None,
    database_source: FieldSource = FieldSource.MISSING,
    schema_source: FieldSource = FieldSource.MISSING,
) -> TableQueryRecord:
    return TableQueryRecord(
        query=query,
        service_name=SERVICE,
        database_name=database_name,
        database_schema=database_schema,
        database_source=database_source,
        schema_source=schema_source,
    )


def _usage_resolver(client: _FakeClient, **kwargs: Any) -> RestTableBindingResolver:
    return RestTableBindingResolver(client, SERVICE, **kwargs)  # type: ignore[arg-type]


def _lineage_resolver(client: _FakeClient, **kwargs: Any) -> LineageBindingResolver:
    kwargs.setdefault("default_database", DB)
    kwargs.setdefault("default_schema", SCHEMA)
    return LineageBindingResolver(client, SERVICE, **kwargs)  # type: ignore[arg-type]


def _processor(
    client: _FakeClient, **resolver_kwargs: Any
) -> tuple[LineageBindingResolver, QueryLineageProcessor]:
    resolver = _lineage_resolver(client, **resolver_kwargs)
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.POSTGRES
    )
    return resolver, processor


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
        "dialect": "postgres",
        "user_name": "alice",
        "date": DAY_MS,
        "service_name": "warehouse",
        "duration": 1.5,
        "cost": None,
        "masked_sql": "SELECT * FROM shop.orders WHERE total > ?",
        "query_hash": "deadbeef",
        "parser_name": "SqlGlot",
    }
    values.update(overrides)
    return ParsedData(**values)


class _DictResolver:
    """The new protocol as a mapping, recording the contexts it saw."""

    def __init__(self, mapping: dict[StructuredIdentifier, str]) -> None:
        self.mapping = mapping
        self.calls: list[tuple[StructuredIdentifier, BindingContext]] = []

    def resolve(
        self, name: StructuredIdentifier, *, context: BindingContext
    ) -> str | None:
        self.calls.append((name, context))
        return self.mapping.get(name)


def _read_usage_lines(stage_dir: Path, file_name: str) -> list[dict[str, Any]]:
    lines = (stage_dir / file_name).read_text(encoding="utf-8").splitlines()
    # Usage lines are double-encoded: a JSON string holding the record JSON.
    return [json.loads(json.loads(line)) for line in lines]


# --- record source fields + BindingContext ---------------------------------


def test_from_record_carries_values_and_sources() -> None:
    record = _record(
        "SELECT 1", "shop", "public", FieldSource.ROW_NATIVE, FieldSource.ROW_CSV
    )
    context = BindingContext.from_record(record)
    assert context.database_name == "shop"
    assert context.database_schema == "public"
    assert context.database_source is FieldSource.ROW_NATIVE
    assert context.schema_source is FieldSource.ROW_CSV


def test_record_defaults_both_sources_missing() -> None:
    record = TableQueryRecord(query="SELECT 1", service_name=SERVICE)
    assert record.database_source is FieldSource.MISSING
    assert record.schema_source is FieldSource.MISSING
    context = BindingContext.from_record(record)
    assert context.database_source is FieldSource.MISSING
    assert context.schema_source is FieldSource.MISSING


def test_record_round_trip_preserves_sources() -> None:
    record = _record(
        "SELECT 1", "shop", "public", FieldSource.ROW_NATIVE_SWAPPED, FieldSource.ROW_CSV
    )
    restored = TableQueryRecord.model_validate(record.model_dump())
    assert restored == record
    assert restored.database_source is FieldSource.ROW_NATIVE_SWAPPED
    assert restored.schema_source is FieldSource.ROW_CSV


def test_binding_context_is_frozen() -> None:
    context = _ctx("shop", "public")
    with pytest.raises(AttributeError):
        context.database_name = "other"  # type: ignore[misc]


# --- _record_from_row source marking ----------------------------------------


def _query_log_source(
    spec: QueryLogSpec | None = None, **config_overrides: Any
) -> QueryLogSource:
    payload: dict[str, Any] = {
        "type": "postgres-usage",
        "service_name": SERVICE,
        "connection": {},
    }
    payload.update(config_overrides)
    config = SourceConfig.model_validate(payload)
    return QueryLogSource(
        config,
        spec
        or QueryLogSpec(
            engine_key="probe", sql_template="SELECT 1", dialect=Dialect.POSTGRES
        ),
        lambda connection: None,  # type: ignore[arg-type]
        single_engine_provider,
    )


def _row(database_name: Any, schema_name: Any) -> dict[str, Any]:
    return {
        "query_text": "SELECT * FROM orders",
        "database_name": database_name,
        "schema_name": schema_name,
    }


def test_native_row_marks_both_fields_row_native() -> None:
    record = _query_log_source()._record_from_row(_row("shop", "public"))
    assert record is not None
    assert record.database_source is FieldSource.ROW_NATIVE
    assert record.schema_source is FieldSource.ROW_NATIVE


def test_native_row_missing_value_marks_missing() -> None:
    record = _query_log_source()._record_from_row(_row("shop", None))
    assert record is not None
    assert record.database_source is FieldSource.ROW_NATIVE
    assert record.schema_source is FieldSource.MISSING
    record = _query_log_source()._record_from_row(_row(None, None))
    assert record is not None
    assert record.database_source is FieldSource.MISSING
    assert record.schema_source is FieldSource.MISSING


def test_csv_row_marks_both_fields_row_csv() -> None:
    record = _query_log_source()._record_from_row(_row("shop", "public"), from_csv=True)
    assert record is not None
    assert record.database_source is FieldSource.ROW_CSV
    assert record.schema_source is FieldSource.ROW_CSV


def test_swapped_spec_native_row_marks_schema_swapped() -> None:
    spec = QueryLogSpec(
        engine_key="probe",
        sql_template="SELECT 1",
        dialect=Dialect.POSTGRES,
        swapped_native_context=True,
    )
    record = _query_log_source(spec)._record_from_row(_row(None, "sales"))
    assert record is not None
    assert record.database_source is FieldSource.MISSING
    assert record.schema_source is FieldSource.ROW_NATIVE_SWAPPED
    record = _query_log_source(spec)._record_from_row(_row(None, None))
    assert record is not None
    assert record.database_source is FieldSource.MISSING
    assert record.schema_source is FieldSource.MISSING


def test_swapped_spec_csv_row_is_unaffected() -> None:
    spec = QueryLogSpec(
        engine_key="probe",
        sql_template="SELECT 1",
        dialect=Dialect.POSTGRES,
        swapped_native_context=True,
    )
    record = _query_log_source(spec)._record_from_row(
        _row("shop", "public"), from_csv=True
    )
    assert record is not None
    assert record.database_source is FieldSource.ROW_CSV
    assert record.schema_source is FieldSource.ROW_CSV


def test_csv_file_path_marks_row_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "query_log.csv"
    csv_path.write_text(
        "query_text,user_name,start_time,end_time,duration,cost,query_type,"
        "database_name,schema_name\n"
        "SELECT * FROM shop.public.orders,alice,2026-11-13 09:00:00.000,,5,,"
        "SELECT,shop,public\n",
        encoding="utf-8",
    )
    source = _query_log_source(query_log_file_path=str(csv_path))
    records = list(source.produce())
    assert len(records) == 1
    assert records[0].database_source is FieldSource.ROW_CSV
    assert records[0].schema_source is FieldSource.ROW_CSV


def test_history_path_marks_row_native() -> None:
    columns = [
        "query_text",
        "user_name",
        "start_time",
        "end_time",
        "duration",
        "cost",
        "query_type",
        "aborted",
        "database_name",
        "schema_name",
    ]
    rows = [
        (
            "SELECT * FROM shop.public.orders",
            "alice",
            None,
            None,
            5.0,
            None,
            "SELECT",
            False,
            "shop",
            "public",
        )
    ]

    class _Cursor:
        description = [(column,) for column in columns]

        def execute(self, statement: str) -> None:
            return None

        def fetchall(self) -> list[tuple]:
            return rows

        def close(self) -> None:
            return None

    class _Connection:
        def __enter__(self) -> _Connection:
            return self

        def __exit__(self, *exc: Any) -> None:
            return None

        def cursor(self) -> _Cursor:
            return _Cursor()

    config = SourceConfig.model_validate(
        {"type": "postgres-usage", "service_name": SERVICE, "connection": {}}
    )
    spec = QueryLogSpec(
        engine_key="probe",
        sql_template="SELECT 1",
        dialect=Dialect.POSTGRES,
        uses_time_window=False,
    )
    source = QueryLogSource(
        config,
        spec,
        lambda connection: None,  # type: ignore[arg-type]
        single_engine_provider,
        connect=lambda: _Connection(),
    )
    records = list(source.produce())
    assert len(records) == 1
    assert records[0].database_source is FieldSource.ROW_NATIVE
    assert records[0].schema_source is FieldSource.ROW_NATIVE


# --- parse_sql_statement: structured names + context ------------------------


def test_parse_yields_structured_tables_sorted_and_deduped() -> None:
    parsed = parse_sql_statement(
        _record("SELECT * FROM public.orders, public.customers"),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == [_ident("public", "customers"), _ident("public", "orders")]
    assert all(isinstance(table, StructuredIdentifier) for table in parsed.tables)
    self_join = parse_sql_statement(
        _record("SELECT * FROM public.orders a JOIN public.orders b ON a.id = b.id"),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert self_join is not None
    assert self_join.tables == [_ident("public", "orders")]


def test_parse_carries_binding_context_from_record() -> None:
    record = _record(
        "SELECT * FROM public.orders",
        "shop",
        "public",
        FieldSource.ROW_NATIVE,
        FieldSource.ROW_NATIVE,
    )
    parsed = parse_sql_statement(record, Dialect.POSTGRES, QueryParserType.AUTO)
    assert parsed is not None
    assert parsed.binding_context == BindingContext.from_record(record)
    # The retained row-context fields still carry the same values for staging.
    assert parsed.database_name == "shop"
    assert parsed.database_schema == "public"


def test_parse_joins_keyed_by_structured_identifier() -> None:
    parsed = parse_sql_statement(
        _record(
            "SELECT * FROM public.orders o "
            "JOIN public.customers c ON o.customer_id = c.id"
        ),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.joins
    assert all(isinstance(key, StructuredIdentifier) for key in parsed.joins)
    pairs = {
        (join.table_column, partner)
        for joins in parsed.joins.values()
        for join in joins
        for partner in join.joined_with
    }
    assert (
        ParsedTableColumn(_ident("public", "orders"), "customer_id"),
        ParsedTableColumn(_ident("public", "customers"), "id"),
    ) in pairs


def test_parse_excludes_cte_name_from_tables() -> None:
    parsed = parse_sql_statement(
        _record(
            "WITH recent AS (SELECT id FROM public.orders) "
            "SELECT * FROM recent JOIN public.customers ON recent.id = customers.id"
        ),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == [_ident("public", "customers"), _ident("public", "orders")]


def test_parse_dynamic_identifier_counts_unsupported_and_binds_nothing() -> None:
    parsed = parse_sql_statement(
        _record("SELECT * FROM IDENTIFIER('foo' || 'bar')"),
        Dialect.SNOWFLAKE,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == []
    assert parsed.unsupported_name_count == 1
    assert parsed.fidelity_skip_branch is None


def test_parse_failed_extraction_marks_fidelity_skip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("extractor down")

    monkeypatch.setattr(
        "smartmetadata_ingestion.lineage.parser.extract_names", _boom
    )
    parsed = parse_sql_statement(
        _record("SELECT * FROM public.orders"),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == []
    assert parsed.joins == {}
    assert parsed.fidelity_skip_branch
    assert parsed.unsupported_name_count == 0


def test_parse_no_tables_returns_none() -> None:
    assert (
        parse_sql_statement(_record("SELECT 1"), Dialect.POSTGRES, QueryParserType.AUTO)
        is None
    )


# --- stage: count forwarding + structured migration -------------------------


def test_stage_forwards_unsupported_count_even_with_no_tables(
    tmp_path: Path,
) -> None:
    resolver = _usage_resolver(_FakeClient())
    stage = UsageStage(
        stage_dir=tmp_path, service_name=SERVICE, binding_resolver=resolver
    )
    stage.handle_batch([_parsed(tables=[], unsupported_name_count=2)])
    assert resolver.binding_counts["unsupported_qualifier"] == 2


def test_stage_forwards_fidelity_skip_branch(tmp_path: Path) -> None:
    resolver = _usage_resolver(_FakeClient())
    stage = UsageStage(
        stage_dir=tmp_path, service_name=SERVICE, binding_resolver=resolver
    )
    stage.handle_batch([_parsed(tables=[], fidelity_skip_branch="SqlGlot")])
    assert resolver.binding_counts["fidelity_unproven_skip"] == {"SqlGlot": 1}


def test_stage_binding_counts_are_zeros_for_protocol_doubles(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name=SERVICE,
        binding_resolver=_DictResolver({}),  # type: ignore[arg-type]
    )
    assert stage.binding_counts == new_binding_counts()


def test_stage_resolves_structured_tables_and_rewrites_joins(tmp_path: Path) -> None:
    orders = _ident("shop", "orders")
    customers = _ident("shop", "customers")
    ghost = _ident("shop", "ghost")
    joins = {
        orders: [
            ParsedTableColumnJoin(
                table_column=ParsedTableColumn(orders, "cust_id"),
                joined_with=(
                    ParsedTableColumn(customers, "id"),
                    ParsedTableColumn(ghost, "id"),
                ),
            )
        ]
    }
    resolver = _DictResolver(
        {
            orders: "warehouse.shop.public.orders",
            customers: "warehouse.shop.public.customers",
        }
    )
    stage = UsageStage(
        stage_dir=tmp_path, service_name="warehouse", binding_resolver=resolver  # type: ignore[arg-type]
    )
    parsed = _parsed(tables=[orders, customers], joins=joins)
    stage.handle_batch([parsed])
    record = _read_usage_lines(tmp_path, "warehouse_2026-11-13")[0]
    assert record["table"] == "warehouse.shop.public.orders"
    assert record["joins"] == [
        {
            "tableColumn": {"table": "warehouse.shop.public.orders", "column": "cust_id"},
            "joinedWith": [{"table": "warehouse.shop.public.customers", "column": "id"}],
        }
    ]
    # The resolver saw the record's frozen context, not loose values.
    assert resolver.calls
    assert all(context is parsed.binding_context for _, context in resolver.calls)


def test_binding_counts_snapshot_shape_has_all_thirteen_keys() -> None:
    counts = _usage_resolver(_FakeClient()).binding_counts
    assert counts == {
        "missing_database": 0,
        "missing_schema": 0,
        "missing_both": 0,
        "unresolved_404": 0,
        "ambiguous": 0,
        "unsupported_qualifier": 0,
        "fidelity_unproven_skip": {},
        "read_failure": 0,
        "default_bound_database": 0,
        "default_bound_schema": 0,
        "builtin_function_filtered": 0,
        "cross_service_ambiguous": 0,
        "cross_service_bound": 0,
    }
    lineage_counts = _lineage_resolver(_FakeClient()).binding_counts
    assert lineage_counts == counts


# --- QueryLineageProcessor: context threading --------------------------------


def test_process_with_context_emits_edge_with_column_lineage() -> None:
    _, processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(
        "INSERT INTO public.target (id, email) SELECT id, email FROM public.orders",
        context=_ctx(DB, SCHEMA),
        emit_query_record=True,
    )
    assert processed.parsed is True
    assert len(processed.edges) == 1
    edge = processed.edges[0]
    assert edge.from_fqn == ORDERS and edge.to_fqn == TARGET
    pairs = {
        (mapping.from_columns[0], mapping.to_column) for mapping in edge.columns
    }
    assert pairs == {
        (f"{ORDERS}.id", f"{TARGET}.id"),
        (f"{ORDERS}.email", f"{TARGET}.email"),
    }
    assert processed.query_record is not None
    assert processed.query_record.processed_lineage is True


def test_process_self_join_skips_unconfirmed_paths_and_counts_branch() -> None:
    from smartmetadata_ingestion.lineage.parser import LineageParser

    sql = (
        "INSERT INTO public.target SELECT a.id, b.email "
        "FROM public.orders a JOIN public.orders b ON a.id = b.id"
    )
    branch = LineageParser(
        sql, dialect=Dialect.POSTGRES
    ).structured_extraction.branch
    resolver, processor = _processor(_FakeClient(_catalog()))
    processed = processor.process(sql, context=_ctx(DB, SCHEMA))
    assert processed.parsed is True
    assert processed.edges == []
    assert resolver.binding_counts["fidelity_unproven_skip"] == {branch: 2}


def test_process_uppercase_udf_expands_into_body_edges() -> None:
    procedures = {
        f"{SERVICE}.{DB}.{SCHEMA}.my_udf": _procedure(
            f"{SERVICE}.{DB}.{SCHEMA}.my_udf",
            "INSERT INTO public.target2 (id) SELECT id FROM public.customers",
        )
    }
    _, processor = _processor(_FakeClient(_catalog(), procedures))
    processed = processor.process(
        "INSERT INTO public.target SELECT MY_UDF(public.orders.id) FROM public.orders",
        context=_ctx(DB, SCHEMA),
    )
    assert processed.udf_expansions == 1
    pairs = {(edge.from_fqn, edge.to_fqn) for edge in processed.edges}
    assert (ORDERS, TARGET) in pairs
    assert (CUSTOMERS, TARGET2) in pairs


def test_process_dynamic_identifier_counts_unsupported_and_emits_nothing() -> None:
    resolver = _lineage_resolver(_FakeClient(_catalog()))
    processor = QueryLineageProcessor(
        resolver, service_name=SERVICE, dialect=Dialect.SNOWFLAKE
    )
    processed = processor.process(
        "SELECT * FROM IDENTIFIER('foo' || 'bar')", context=_ctx(DB, SCHEMA)
    )
    assert processed.edges == []
    assert resolver.binding_counts["unsupported_qualifier"] == 1


def test_process_target_override_lands_on_override_fqn() -> None:
    tables = _catalog()
    other = f"{SERVICE}.{DB}.{SCHEMA}.other"
    tables[other] = _table(other, ["id"])
    _, processor = _processor(_FakeClient(tables))
    processed = processor.process(
        "INSERT INTO public.other SELECT * FROM public.orders",
        context=_ctx(DB, SCHEMA),
        target_override_fqn=TARGET,
    )
    assert [(edge.from_fqn, edge.to_fqn) for edge in processed.edges] == [
        (ORDERS, TARGET)
    ]
    assert processed.unbound_tables == []


# --- §6 test 10: both call points share the naming function ------------------


class _StubSource:
    def __init__(self, records: list[Any]) -> None:
        self._records = records

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self):  # type: ignore[no-untyped-def]
        yield from self._records


def _server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="<redacted>"),
    )


def _workflow_config(stage_dir: Path, **source_overrides: Any) -> WorkflowConfig:
    source_values: dict[str, Any] = {
        "type": "postgres-usage",
        "service_name": SERVICE,
        "connection": {"database": "shop", "databaseSchema": "public"},
        "stage_file_location": str(stage_dir),
    }
    source_values.update(source_overrides)
    return WorkflowConfig(
        workflow=WorkflowSettings(name="svc-usage", type="usage"),
        server=_server(),
        source=SourceConfig(**source_values),
    )


def test_both_call_points_invoke_same_naming_function(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from smartmetadata_ingestion.lineage import source as lineage_source_module

    calls: list[tuple[dict[str, Any], str]] = []

    def recorder(connection: dict[str, Any], engine_key: str):
        calls.append((dict(connection), engine_key))
        return ("recdb", "recschema")

    monkeypatch.setattr(
        usage_workflow_module, "resolve_connection_defaults", recorder
    )
    monkeypatch.setattr(
        lineage_source_module, "resolve_connection_defaults", recorder
    )
    connection = {"database": "shop", "databaseSchema": "public"}
    workflow = UsageWorkflow(
        _workflow_config(tmp_path, connection=connection),
        client=object(),  # type: ignore[arg-type]
        source=_StubSource([]),  # type: ignore[arg-type]
    )
    stage_resolver = workflow._stage._binding_resolver  # type: ignore[union-attr]
    assert stage_resolver._default_database == "recdb"
    assert stage_resolver._default_schema == "recschema"
    assert stage_resolver._engine_key == "postgres"
    lineage_config = SourceConfig.model_validate(
        {
            "type": "postgres-lineage",
            "service_name": SERVICE,
            "connection": dict(connection),
        }
    )
    lineage_source = LineageSource(
        lineage_config,
        engine_key="postgres",
        dialect=Dialect.POSTGRES,
        client=_FakeClient(),  # type: ignore[arg-type]
    )
    lineage_resolver, _ = lineage_source._build_processing(_FakeClient())  # type: ignore[arg-type]
    assert lineage_resolver._default_database == "recdb"
    assert lineage_resolver._default_schema == "recschema"
    assert lineage_resolver._engine_key == "postgres"
    assert calls == [(connection, "postgres"), (connection, "postgres")]


def _lineage_source_with_connection(connection: dict[str, Any]) -> LineageSource:
    lineage_config = SourceConfig.model_validate(
        {
            "type": "postgres-lineage",
            "service_name": SERVICE,
            "connection": dict(connection),
        }
    )
    return LineageSource(
        lineage_config,
        engine_key="postgres",
        dialect=Dialect.POSTGRES,
        client=_FakeClient(),  # type: ignore[arg-type]
    )


_SCHEMA_WARNING = 'connection key "schema" is no longer read'
_SCHEMA_WARNING_TARGET = 'move its value to "databaseSchema"'


def test_usage_workflow_warns_when_connection_has_schema_key(
    caplog: pytest.LogCaptureFixture, tmp_path: Path
) -> None:
    # D-L2c B: the removed ``schema`` key is only detected, never used.
    # The warning names the key and its declared replacement, and the
    # resolver still gets the post-removal default (``None`` here — the
    # ``schema`` value contributes nothing).
    connection = {"database": "shop", "schema": "compat"}
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.usage.workflow"
    ):
        workflow = UsageWorkflow(
            _workflow_config(tmp_path, connection=connection),
            client=object(),  # type: ignore[arg-type]
            source=_StubSource([]),  # type: ignore[arg-type]
        )
    assert _SCHEMA_WARNING in caplog.text
    assert _SCHEMA_WARNING_TARGET in caplog.text
    resolver = workflow._stage._binding_resolver  # type: ignore[union-attr]
    assert resolver._default_database == "shop"
    assert resolver._default_schema is None


def test_lineage_source_warns_when_connection_has_schema_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    lineage_source = _lineage_source_with_connection(
        {"database": "shop", "schema": "compat"}
    )
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.source"
    ):
        resolver, _ = lineage_source._build_processing(_FakeClient())  # type: ignore[arg-type]
    assert _SCHEMA_WARNING in caplog.text
    assert _SCHEMA_WARNING_TARGET in caplog.text
    assert resolver._default_database == "shop"
    assert resolver._default_schema is None


@pytest.mark.parametrize(
    "connection",
    [
        {"database": "shop", "databaseSchema": "public"},
        {"database": "shop", "schema": ""},
        {"database": "shop", "schema": None},
    ],
)
def test_usage_workflow_does_not_warn_without_truthy_schema_key(
    caplog: pytest.LogCaptureFixture, tmp_path: Path, connection: dict[str, Any]
) -> None:
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.usage.workflow"
    ):
        UsageWorkflow(
            _workflow_config(tmp_path, connection=connection),
            client=object(),  # type: ignore[arg-type]
            source=_StubSource([]),  # type: ignore[arg-type]
        )
    assert _SCHEMA_WARNING not in caplog.text


@pytest.mark.parametrize(
    "connection",
    [
        {"database": "shop", "databaseSchema": "public"},
        {"database": "shop", "schema": ""},
        {"database": "shop", "schema": None},
    ],
)
def test_lineage_source_does_not_warn_without_truthy_schema_key(
    caplog: pytest.LogCaptureFixture, connection: dict[str, Any]
) -> None:
    lineage_source = _lineage_source_with_connection(connection)
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.source"
    ):
        lineage_source._build_processing(_FakeClient())  # type: ignore[arg-type]
    assert _SCHEMA_WARNING not in caplog.text


def test_usage_workflow_warns_at_most_once_per_run(
    caplog: pytest.LogCaptureFixture, tmp_path: Path
) -> None:
    # ``prepare`` runs once per workflow construction; a second call is
    # short-circuited by the ``_prepared`` guard, so the warning is
    # emitted at most once per run with no throttling state.
    connection = {"database": "shop", "schema": "compat"}
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.usage.workflow"
    ):
        workflow = UsageWorkflow(
            _workflow_config(tmp_path, connection=connection),
            client=object(),  # type: ignore[arg-type]
            source=_StubSource([]),  # type: ignore[arg-type]
        )
        workflow.prepare()
    assert caplog.text.count(_SCHEMA_WARNING) == 1


def test_usage_engine_key_comes_from_query_log_spec(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[str] = []

    def recorder(connection: dict[str, Any], engine_key: str):
        calls.append(engine_key)
        return (None, None)

    monkeypatch.setattr(
        usage_workflow_module, "resolve_connection_defaults", recorder
    )
    spec = QueryLogSpec(
        engine_key="snowflake", sql_template="SELECT 1", dialect=Dialect.SNOWFLAKE
    )
    source_config = SourceConfig.model_validate(
        {"type": "postgres-usage", "service_name": SERVICE, "connection": {}}
    )
    query_log_source = QueryLogSource(
        source_config,
        spec,
        lambda connection: None,  # type: ignore[arg-type]
        single_engine_provider,
    )
    workflow = UsageWorkflow(
        _workflow_config(tmp_path),
        client=object(),  # type: ignore[arg-type]
        source=query_log_source,  # type: ignore[arg-type]
    )
    # The spec key wins over the connection type: the source's own
    # spec names the engine this run reads.
    assert workflow._stage._binding_resolver._engine_key == "snowflake"  # type: ignore[union-attr]
    assert calls == ["snowflake"]


@pytest.mark.parametrize(
    "source_type", ["postgres-usage", "postgres-lineage"]
)
def test_usage_engine_key_strips_pipeline_suffix(
    source_type: str, tmp_path: Path
) -> None:
    workflow = UsageWorkflow(
        _workflow_config(tmp_path, type=source_type),
        client=object(),  # type: ignore[arg-type]
        source=_StubSource([]),  # type: ignore[arg-type]
    )
    assert workflow._stage._binding_resolver._engine_key == "postgres"  # type: ignore[union-attr]


# --- LineageSummary fold-in ---------------------------------------------------


def test_lineage_source_summary_folds_binding_counts(
    caplog: pytest.LogCaptureFixture,
) -> None:
    records = [
        _record(
            "INSERT INTO public.target SELECT * FROM public.orders",
            DB,
            SCHEMA,
            FieldSource.ROW_NATIVE,
            FieldSource.ROW_NATIVE,
        ),
        _record(
            "INSERT INTO public.target SELECT * FROM public.ghost",
            DB,
            SCHEMA,
            FieldSource.ROW_NATIVE,
            FieldSource.ROW_NATIVE,
        ),
    ]
    config = SourceConfig.model_validate(
        {
            "type": "postgres-lineage",
            "service_name": SERVICE,
            "connection": {"database": DB, "databaseSchema": SCHEMA},
            "process_view_lineage": False,
            "process_stored_procedure_lineage": False,
            "process_query_lineage": True,
            "process_cross_database_lineage": False,
            "incremental_lineage_processing": False,
        }
    )
    source = LineageSource(
        config,
        engine_key="postgres",
        dialect=Dialect.POSTGRES,
        client=_FakeClient(_catalog()),  # type: ignore[arg-type]
        query_log_source=_StubSource(records),  # type: ignore[arg-type]
    )
    with caplog.at_level(logging.INFO, logger="smartmetadata_ingestion.lineage.source"):
        produced = list(source.produce())
    assert produced
    assert source.summary.queries_seen == 2
    assert source.summary.binding_counts["unresolved_404"] == 1
    assert "bindingCounts=" in caplog.text
    assert "'unresolved_404': 1" in caplog.text

# --- parse_sql_statement: fidelity callback on the None path (D-L2c I) -----


def _boom_extraction(*args: Any, **kwargs: Any) -> Any:
    raise RuntimeError("extractor down")


def test_parse_none_with_failed_extraction_calls_fidelity_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # D-L2c I: winner exists (SqlGlot), involved is empty, extraction
    # fails — the None return must still count the fidelity skip
    # through the callback, since no ParsedData exists to carry it.
    monkeypatch.setattr(
        "smartmetadata_ingestion.lineage.parser.extract_names", _boom_extraction
    )
    calls: list[str] = []
    parsed = parse_sql_statement(
        _record("SELECT 1"),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
        on_fidelity_skip=calls.append,
    )
    assert parsed is None
    assert calls == ["SqlGlot"]


def test_parse_none_with_failed_extraction_without_callback_is_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # No callback, no behavior change: still None, still no raise.
    monkeypatch.setattr(
        "smartmetadata_ingestion.lineage.parser.extract_names", _boom_extraction
    )
    parsed = parse_sql_statement(
        _record("SELECT 1"), Dialect.POSTGRES, QueryParserType.AUTO
    )
    assert parsed is None


def test_parse_failed_extraction_with_tables_does_not_call_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # When tables exist the fidelity skip rides the ParsedData, so
    # the callback must not fire on the non-None path.
    monkeypatch.setattr(
        "smartmetadata_ingestion.lineage.parser.extract_names", _boom_extraction
    )
    calls: list[str] = []
    parsed = parse_sql_statement(
        _record("SELECT * FROM public.orders"),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
        on_fidelity_skip=calls.append,
    )
    assert parsed is not None
    assert parsed.tables == []
    assert parsed.fidelity_skip_branch
    assert calls == []
