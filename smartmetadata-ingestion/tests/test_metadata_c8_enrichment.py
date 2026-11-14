# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from smartmetadata_ingestion.config import (
    IncrementalConfig,
    OwnerConfig,
    SourceConfig,
)
from smartmetadata_ingestion.connectors import databricks_common
from smartmetadata_ingestion.connectors.ddl import (
    quote_backtick_ident,
    require_ddl_support,
    table_ddl_for_database_schema,
    table_ddl_for_schema,
)
from smartmetadata_ingestion.connectors.json_schema import (
    attach_json_schemas_for_schema,
    infer_json_children,
    quote_double_ident,
    require_json_sampling_support,
)
from smartmetadata_ingestion.connectors.mssql import MssqlSource
from smartmetadata_ingestion.connectors.mysql import (
    CursorCatalogReader as MysqlCursorReader,
)
from smartmetadata_ingestion.connectors.mysql import (
    MysqlSource,
)
from smartmetadata_ingestion.connectors.mysql import (
    SchemaRow as MysqlSchemaRow,
)
from smartmetadata_ingestion.connectors.mysql import (
    SequenceCatalogReader as MysqlSequenceReader,
)
from smartmetadata_ingestion.connectors.mysql import (
    TableRow as MysqlTableRow,
)
from smartmetadata_ingestion.connectors.owners import (
    owner_names_resolver,
    resolve_owner_names,
)
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow as PgColumnRow,
)
from smartmetadata_ingestion.connectors.postgres import (
    CursorCatalogReader as PgCursorReader,
)
from smartmetadata_ingestion.connectors.postgres import (
    PostgresSource,
)
from smartmetadata_ingestion.connectors.postgres import (
    SchemaRow as PgSchemaRow,
)
from smartmetadata_ingestion.connectors.postgres import (
    SequenceCatalogReader as PgSequenceReader,
)
from smartmetadata_ingestion.connectors.postgres import (
    TableRow as PgTableRow,
)
from smartmetadata_ingestion.connectors.snowflake import (
    CursorCatalogReader as SnowflakeCursorReader,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ColumnRecord, TableRecord
from smartmetadata_ingestion.workflow import MetadataWorkflow


def _owners(**overrides) -> list[str]:
    config = OwnerConfig(**overrides)
    return resolve_owner_names(
        config,
        include_owners=True,
        service_name="svc",
        database_name="db",
        schema_name="public",
        entity_name="orders",
    )


def test_owner_resolution_returns_empty_without_config_or_flag() -> None:
    assert (
        resolve_owner_names(
            None,
            include_owners=True,
            service_name="svc",
            database_name="db",
            schema_name="public",
            entity_name="orders",
        )
        == []
    )
    assert (
        resolve_owner_names(
            OwnerConfig(default="alice"),
            include_owners=False,
            service_name="svc",
            database_name="db",
            schema_name="public",
            entity_name="orders",
        )
        == []
    )


def test_owner_resolution_prefers_most_specific_level() -> None:
    assert _owners(default="dflt", service="svc-owner") == ["svc-owner"]
    assert _owners(default="dflt", database="db-owner") == ["db-owner"]
    assert _owners(database="db-owner", database_schema="sch-owner") == ["sch-owner"]
    assert _owners(database_schema="sch-owner", table="tbl-owner") == ["tbl-owner"]


def test_owner_resolution_matches_maps_by_name_and_fqn() -> None:
    assert _owners(table={"orders": "alice"}) == ["alice"]
    assert _owners(table={"svc.db.public.orders": ["alice", "bob"]}) == ["alice", "bob"]
    assert _owners(database_schema={"public": "carol"}) == ["carol"]
    assert _owners(database_schema={"svc.db.public": "carol"}) == ["carol"]
    assert _owners(database={"db": "dan"}) == ["dan"]
    assert _owners(database={"svc.db": "dan"}) == ["dan"]
    assert _owners(table={"other": "alice"}, database_schema={"public": "carol"}) == ["carol"]


def test_owner_resolution_without_inheritance_checks_only_entity_level() -> None:
    config = OwnerConfig(
        default="dflt", database_schema={"public": "carol"}, enable_inheritance=False
    )
    assert (
        resolve_owner_names(
            config,
            include_owners=True,
            service_name="svc",
            database_name="db",
            schema_name="public",
            entity_name="orders",
        )
        == []
    )
    config = OwnerConfig(table={"orders": "alice"}, enable_inheritance=False)
    assert (
        resolve_owner_names(
            config,
            include_owners=True,
            service_name="svc",
            database_name="db",
            schema_name="public",
            entity_name="orders",
        )
        == ["alice"]
    )


def test_owner_resolution_explicit_empty_list_stops_inheritance() -> None:
    assert _owners(table={"orders": []}, default="dflt") == []


def test_owner_resolution_falls_through_table_map_for_procedures() -> None:
    config = OwnerConfig(table={"orders": "alice"}, database_schema={"public": "carol"})
    assert (
        resolve_owner_names(
            config,
            include_owners=True,
            service_name="svc",
            database_name="db",
            schema_name="public",
            entity_name="calc_total",
        )
        == ["carol"]
    )


def test_owner_names_resolver_binds_one_scope() -> None:
    config = OwnerConfig(
        table={"orders": "alice"}, database_schema={"public": "carol", "audit": "dan"}
    )
    public = owner_names_resolver(
        config,
        include_owners=True,
        service_name="svc",
        database_name="db",
        schema_name="public",
    )
    audit = owner_names_resolver(
        config,
        include_owners=True,
        service_name="svc",
        database_name="db",
        schema_name="audit",
    )
    assert public("orders") == ["alice"]
    assert public("calc_total") == ["carol"]
    assert audit("calc_total") == ["dan"]
    assert audit("orders") == ["alice"]


def test_quote_backtick_ident_escapes_backticks() -> None:
    assert quote_backtick_ident("orders") == "`orders`"
    assert quote_backtick_ident("we`ird") == "`we``ird`"
    assert quote_double_ident('we"ird') == '"we""ird"'


class _BareReader:
    pass


def test_ddl_helpers_fail_loud_only_when_enabled() -> None:
    require_ddl_support(_BareReader(), "Postgres", enabled=False)
    with pytest.raises(WorkflowError, match="Postgres"):
        require_ddl_support(_BareReader(), "Postgres", enabled=True)
    assert (
        table_ddl_for_schema(
            _BareReader(), "Postgres", schema_name="s", table_name="t", enabled=False
        )
        is None
    )
    with pytest.raises(WorkflowError, match="Postgres"):
        table_ddl_for_schema(
            _BareReader(), "Postgres", schema_name="s", table_name="t", enabled=True
        )
    with pytest.raises(WorkflowError, match="Snowflake"):
        table_ddl_for_database_schema(
            _BareReader(), "Snowflake", "db", schema_name="s", table_name="t", enabled=True
        )


class _FakeCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, sql: str, params: tuple = ()) -> None:
        self.executed.append((sql, params))

    def fetchall(self) -> list[tuple]:
        return self._rows

    def close(self) -> None:
        pass


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> _FakeConnection:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def cursor(self) -> _FakeCursor:
        return self._cursor


def _connect(cursor: _FakeCursor):
    def _factory():
        return _FakeConnection(cursor)

    return _factory


def test_mysql_cursor_reader_shows_create_table() -> None:
    cursor = _FakeCursor([("orders", "CREATE TABLE `orders` (id INT)")])
    ddl = MysqlCursorReader(_connect(cursor)).get_table_ddl("app", "orders")
    assert ddl == "CREATE TABLE `orders` (id INT)"
    sql, _ = cursor.executed[0]
    assert sql == "SHOW CREATE TABLE `app`.`orders`"


def test_snowflake_cursor_reader_uses_get_ddl() -> None:
    cursor = _FakeCursor([("CREATE TABLE ORDERS (ID NUMBER)",)])
    ddl = SnowflakeCursorReader(_connect(cursor)).get_table_ddl("ANALYTICS", "PUBLIC", "ORDERS")
    assert ddl == "CREATE TABLE ORDERS (ID NUMBER)"
    sql, params = cursor.executed[0]
    assert sql == "SELECT GET_DDL('TABLE', %s)"
    assert params == ('"ANALYTICS"."PUBLIC"."ORDERS"',)


def test_databricks_cursor_reader_shows_create_table() -> None:
    cursor = _FakeCursor([("CREATE TABLE `db`.`public`.`orders` (id INT)",)])
    ddl = databricks_common.CursorCatalogReader(_connect(cursor)).get_table_ddl(
        "db", "public", "orders"
    )
    assert ddl is not None and ddl.startswith("CREATE TABLE")
    sql, _ = cursor.executed[0]
    assert sql == "SHOW CREATE TABLE `db`.`public`.`orders`"


def test_mysql_source_emits_ddl_and_lifecycle_when_present() -> None:
    reader = MysqlSequenceReader(
        schemas=[MysqlSchemaRow("app")],
        tables=[
            MysqlTableRow(
                "app", "orders", "BASE TABLE", created_ms=1000, updated_ms=2000
            )
        ],
        columns=[],
        views=[],
        ddls={("app", "orders"): "CREATE TABLE orders (id INT)"},
    )
    source = MysqlSource(
        SourceConfig(
            type="mysql",
            service_name="warehouse",
            connection={"hostPort": "localhost:3306", "username": "u", "database": "app"},
            include_ddl=True,
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert tables[0].schema_definition == "CREATE TABLE orders (id INT)"
    assert tables[0].life_cycle is not None
    assert tables[0].life_cycle.created is not None
    assert tables[0].life_cycle.created.timestamp == 1000
    assert tables[0].life_cycle.updated is not None
    assert tables[0].life_cycle.updated.timestamp == 2000


def test_mysql_source_without_ddl_leaves_definition_empty() -> None:
    reader = MysqlSequenceReader(
        schemas=[MysqlSchemaRow("app")],
        tables=[MysqlTableRow("app", "orders", "BASE TABLE")],
        columns=[],
        views=[],
    )
    source = MysqlSource(
        SourceConfig(
            type="mysql",
            service_name="warehouse",
            connection={"hostPort": "localhost:3306", "username": "u", "database": "app"},
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert tables[0].schema_definition is None
    assert tables[0].life_cycle is None


def test_postgres_source_with_include_ddl_fails_loud() -> None:
    reader = PgSequenceReader(schemas=[PgSchemaRow("public")], tables=[], columns=[], views=[])
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
            include_ddl=True,
        ),
        reader=reader,
    )
    with pytest.raises(WorkflowError, match="Postgres"):
        list(source.produce())


def test_mysql_cursor_reader_maps_table_timestamps() -> None:
    created = datetime(2024, 1, 1, tzinfo=timezone.utc)
    updated = datetime(2024, 2, 1, tzinfo=timezone.utc)
    cursor = _FakeCursor([("app", "orders", "BASE TABLE", "", created, updated)])
    rows = MysqlCursorReader(_connect(cursor)).list_tables("app")
    assert rows[0].created_ms == 1704067200000
    assert rows[0].updated_ms == 1706745600000


def test_infer_json_children_merges_keys_and_sorts_names() -> None:
    children = infer_json_children(
        ['{"b": 1, "a": "x"}', {"a": "y", "c": True}],
        depth_cap=None,
        children_cap=None,
    )
    assert [(child.name, child.data_type) for child in children] == [
        ("a", "VARCHAR"),
        ("b", "BIGINT"),
        ("c", "BOOLEAN"),
    ]
    assert [child.ordinal_position for child in children] == [1, 2, 3]


def test_infer_json_children_applies_depth_and_children_caps() -> None:
    values = ['{"a": {"x": 1, "y": 2}, "b": 1, "c": 1}']
    assert infer_json_children(values, depth_cap=0, children_cap=None) == []
    assert infer_json_children(values, depth_cap=None, children_cap=0) == []
    children = infer_json_children(values, depth_cap=1, children_cap=None)
    assert children[0].children == []
    children = infer_json_children(values, depth_cap=2, children_cap=2)
    assert [child.name for child in children] == ["a", "b"]
    assert [child.name for child in children[0].children or []] == ["x", "y"]


def test_infer_json_children_widens_mixed_types() -> None:
    children = infer_json_children(
        [{"n": 1}, {"n": 1.5}, {"s": "a"}, {"s": 1}, {"u": None}],
        depth_cap=None,
        children_cap=None,
    )
    by_name = {child.name: child.data_type for child in children}
    assert by_name["n"] == "DOUBLE"
    assert by_name["s"] == "JSON"
    assert by_name["u"] == "JSON"


def test_infer_json_children_handles_arrays_and_bad_samples() -> None:
    children = infer_json_children(
        ['{"tags": ["a", "b"], "items": [{"id": 1}]}', "not json", None, 42],
        depth_cap=None,
        children_cap=None,
    )
    by_name = {child.name: child for child in children}
    assert sorted(by_name) == ["items", "tags"]
    assert by_name["tags"].data_type == "ARRAY"
    assert by_name["tags"].array_data_type == "VARCHAR"
    assert by_name["items"].data_type == "ARRAY"
    assert by_name["items"].array_data_type == "STRUCT"
    assert [child.name for child in by_name["items"].children or []] == ["id"]


def test_json_attach_helpers_fail_loud_only_when_enabled() -> None:
    config = SourceConfig(type="postgres", service_name="svc")
    require_json_sampling_support(_BareReader(), "Mssql", enabled=False)
    with pytest.raises(WorkflowError, match="Mssql"):
        require_json_sampling_support(_BareReader(), "Mssql", enabled=True)
    columns = [ColumnRecord(name="payload", data_type="JSON")]
    attach_json_schemas_for_schema(_BareReader(), "Mssql", "s", "t", columns, config)
    assert columns[0].children is None


def test_postgres_source_infers_json_children_from_samples() -> None:
    reader = PgSequenceReader(
        schemas=[PgSchemaRow("public")],
        tables=[PgTableRow("public", "events", "BASE TABLE")],
        columns=[PgColumnRow("public", "events", "payload", "jsonb", 1)],
        views=[],
        samples={("public", "events", "payload"): ['{"user": "alice", "n": 1}']},
    )
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
            extract_json_schema=True,
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    column = tables[0].columns[0]
    assert column.data_type == "JSON"
    assert [(child.name, child.data_type) for child in column.children or []] == [
        ("n", "BIGINT"),
        ("user", "VARCHAR"),
    ]


def test_postgres_source_without_extraction_leaves_json_columns_flat() -> None:
    reader = PgSequenceReader(
        schemas=[PgSchemaRow("public")],
        tables=[PgTableRow("public", "events", "BASE TABLE")],
        columns=[PgColumnRow("public", "events", "payload", "jsonb", 1)],
        views=[],
        samples={("public", "events", "payload"): ['{"user": "alice"}']},
    )
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert tables[0].columns[0].children is None


def test_mssql_source_with_extraction_fails_loud() -> None:
    from smartmetadata_ingestion.connectors import mssql_common

    reader = mssql_common.SequenceCatalogReader(
        databases=[mssql_common.DatabaseRow("db")],
        schemas=[mssql_common.SchemaRow("db", "dbo")],
        tables=[],
        columns=[],
        views=[],
    )
    source = MssqlSource(
        SourceConfig(
            type="mssql",
            service_name="warehouse",
            connection={"hostPort": "localhost:1433", "username": "u"},
            extract_json_schema=True,
        ),
        reader=reader,
    )
    with pytest.raises(WorkflowError, match="Mssql"):
        list(source.produce())


def test_postgres_cursor_reader_samples_column_values() -> None:
    cursor = _FakeCursor([('{"a": 1}',), ('{"a": 2}',)])
    values = PgCursorReader(_connect(cursor)).sample_column_values(
        "public", "events", "payload", 10
    )
    assert values == ['{"a": 1}', '{"a": 2}']
    sql, params = cursor.executed[0]
    assert sql == 'SELECT "payload" FROM "public"."events" WHERE "payload" IS NOT NULL LIMIT %s'
    assert params == (10,)


class _StubClient:
    def close(self) -> None:
        pass


class _StubSource:
    def prepare(self) -> None:
        pass

    def produce(self):
        return iter([])

    def close(self) -> None:
        pass


class _StubSink:
    def write(self, record) -> None:
        pass

    def flush(self):
        return None

    def close(self) -> None:
        pass


def test_incremental_enabled_fails_metadata_workflow_construction(workflow_config) -> None:
    config = workflow_config.model_copy(
        update={
            "source": workflow_config.source.model_copy(
                update={"incremental": IncrementalConfig(enabled=True)}
            )
        }
    )
    with pytest.raises(WorkflowError, match="incremental"):
        MetadataWorkflow(config, client=_StubClient(), source=_StubSource(), sink=_StubSink())


def test_incremental_disabled_and_non_metadata_types_construct(workflow_config) -> None:
    disabled = workflow_config.model_copy(
        update={
            "source": workflow_config.source.model_copy(
                update={"incremental": IncrementalConfig(enabled=False)}
            )
        }
    )
    workflow = MetadataWorkflow(
        disabled, client=_StubClient(), source=_StubSource(), sink=_StubSink()
    )
    assert workflow._prepared is True
    lineage = workflow_config.model_copy(
        update={
            "workflow": workflow_config.workflow.model_copy(update={"type": "lineage"}),
            "source": workflow_config.source.model_copy(
                update={"incremental": IncrementalConfig(enabled=True)}
            ),
        }
    )
    workflow = MetadataWorkflow(
        lineage, client=_StubClient(), source=_StubSource(), sink=_StubSink()
    )
    assert workflow._prepared is True
