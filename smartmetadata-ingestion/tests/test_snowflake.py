# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest
from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.snowflake import (
    ColumnRow,
    CursorCatalogReader,
    DatabaseRow,
    SchemaRow,
    SequenceCatalogReader,
    SnowflakeSource,
    TableRow,
    ViewRow,
    _snowflake_connect,
    quote_snowflake_ident,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    SchemaRecord,
    TableRecord,
)


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[
            DatabaseRow("ANALYTICS"),
            DatabaseRow("SNOWFLAKE"),
            DatabaseRow("OTHER"),
        ],
        schemas=[
            SchemaRow("ANALYTICS", "PUBLIC"),
            SchemaRow("ANALYTICS", "INFORMATION_SCHEMA"),
            SchemaRow("OTHER", "PUBLIC"),
        ],
        tables=[
            TableRow("ANALYTICS", "PUBLIC", "ORDERS", "BASE TABLE", "fact"),
            TableRow("ANALYTICS", "PUBLIC", "ORDERS_V", "VIEW"),
            TableRow("OTHER", "PUBLIC", "SKIP", "BASE TABLE"),
        ],
        columns=[
            ColumnRow("ANALYTICS", "PUBLIC", "ORDERS", "ID", "NUMBER", 1),
            ColumnRow("ANALYTICS", "PUBLIC", "ORDERS", "EMAIL", "VARCHAR", 2, 256),
            ColumnRow("ANALYTICS", "PUBLIC", "ORDERS_V", "ID", "NUMBER", 1),
        ],
        views=[
            ViewRow("ANALYTICS", "PUBLIC", "ORDERS_V", "SELECT ID FROM PUBLIC.ORDERS"),
        ],
    )


def test_snowflake_source_emits_selected_database_tree() -> None:
    source = SnowflakeSource(
        SourceConfig(
            type="snowflake",
            service_name="warehouse",
            connection={"account": "xy12345", "username": "u", "warehouse": "COMPUTE_WH"},
            include_databases=["ANALYTICS"],
            include_schemas=["PUBLIC"],
            include_view_lineage=True,
        ),
        reader=_reader(),
    )
    records = list(source.produce())
    kinds = [record.kind for record in records]
    assert kinds == ["databaseService", "database", "schema", "table", "table", "lineage"]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Snowflake"
    assert service.connection["config"]["account"] == "xy12345"
    assert "password" not in service.connection["config"]
    database = records[1]
    assert isinstance(database, DatabaseRecord)
    assert database.name == "ANALYTICS"
    schema = records[2]
    assert isinstance(schema, SchemaRecord)
    assert schema.database == "warehouse.ANALYTICS"
    tables = [record for record in records if isinstance(record, TableRecord)]
    assert [table.name for table in tables] == ["ORDERS", "ORDERS_V"]
    assert tables[0].columns[0].data_type == "NUMBER"
    assert tables[0].columns[1].data_type == "VARCHAR"
    assert tables[1].table_type == "View"
    lineage = records[-1]
    assert isinstance(lineage, LineageRecord)
    assert lineage.from_entity.fqn == "warehouse.ANALYTICS.PUBLIC.ORDERS"
    assert lineage.to_entity.fqn == "warehouse.ANALYTICS.PUBLIC.ORDERS_V"


def test_snowflake_connection_database_restricts_scan() -> None:
    source = SnowflakeSource(
        SourceConfig(
            type="snowflake",
            service_name="warehouse",
            connection={"database": "ANALYTICS"},
            include_schemas=["PUBLIC"],
        ),
        reader=_reader(),
    )
    names = [record.name for record in source.produce() if isinstance(record, DatabaseRecord)]
    assert names == ["ANALYTICS"]


def test_quote_snowflake_ident_rejects_unsafe_names() -> None:
    assert quote_snowflake_ident("ANALYTICS") == '"ANALYTICS"'
    with pytest.raises(WorkflowError, match="unsafe"):
        quote_snowflake_ident('evil"; DROP')


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.sql = None
        self.params = None
        self.closed = False

    def execute(self, sql, params=()):
        self.sql = sql
        self.params = params

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


def test_snowflake_cursor_reader_scopes_information_schema() -> None:
    cursor = FakeCursor([("ANALYTICS",)])
    reader = CursorCatalogReader(lambda: FakeConnection(cursor))
    assert [row.name for row in reader.list_databases()] == ["ANALYTICS"]
    assert "INFORMATION_SCHEMA.DATABASES" in cursor.sql
    cursor.rows = [("ANALYTICS", "PUBLIC")]
    schemas = reader.list_schemas("ANALYTICS")
    assert schemas[0].name == "PUBLIC"
    assert '"ANALYTICS".INFORMATION_SCHEMA.SCHEMATA' in cursor.sql
    cursor.rows = [("ANALYTICS", "PUBLIC", "ORDERS", "BASE TABLE", None)]
    tables = reader.list_tables("ANALYTICS", "PUBLIC")
    assert tables[0].name == "ORDERS"
    assert cursor.params == ("PUBLIC",)
    cursor.rows = [("ANALYTICS", "PUBLIC", "ORDERS", "ID", "NUMBER", 1, None, None)]
    columns = reader.list_columns("ANALYTICS", "PUBLIC", "ORDERS")
    assert columns[0].name == "ID"
    cursor.rows = [("ANALYTICS", "PUBLIC", "ORDERS_V", "SELECT 1")]
    assert reader.list_views("ANALYTICS")[0].name == "ORDERS_V"
    assert cursor.closed is True


def test_snowflake_requires_account() -> None:
    with pytest.raises(WorkflowError, match="account"):
        _snowflake_connect({})


def test_snowflake_live_reader_requires_extra(monkeypatch) -> None:
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "snowflake.connector":
            raise ImportError("no snowflake")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(WorkflowError, match="smartmetadata-ingestion\\[snowflake\\]"):
        _snowflake_connect({"account": "xy12345"})
