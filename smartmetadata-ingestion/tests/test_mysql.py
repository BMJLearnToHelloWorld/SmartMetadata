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
from smartmetadata_ingestion.connectors.mysql import (
    ColumnRow,
    CursorCatalogReader,
    MysqlSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
    ViewRow,
    _pymysql_connect,
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
        schemas=[
            SchemaRow("app"),
            SchemaRow("mysql"),
            SchemaRow("hidden"),
        ],
        tables=[
            TableRow("app", "orders", "BASE TABLE", "order rows"),
            TableRow("app", "orders_v", "VIEW"),
            TableRow("hidden", "secret", "BASE TABLE"),
        ],
        columns=[
            ColumnRow("app", "orders", "id", "int", 1, comment="pk"),
            ColumnRow("app", "orders", "email", "varchar", 2, 128),
            ColumnRow("app", "orders_v", "id", "int", 1),
        ],
        views=[
            ViewRow("app", "orders_v", "SELECT id FROM app.orders"),
        ],
    )


def test_mysql_source_emits_hierarchy_and_view_lineage() -> None:
    source = MysqlSource(
        SourceConfig(
            type="mysql",
            service_name="oltp",
            connection={
                "hostPort": "localhost:3306",
                "username": "u",
                "databaseName": "shop",
            },
            include_schemas=["app"],
            include_view_lineage=True,
        ),
        reader=_reader(),
    )
    records = list(source.produce())
    kinds = [record.kind for record in records]
    assert kinds == ["databaseService", "database", "schema", "table", "table", "lineage"]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Mysql"
    assert service.connection is not None
    assert service.connection["config"]["type"] == "Mysql"
    assert "authType" not in service.connection["config"]
    database = records[1]
    assert isinstance(database, DatabaseRecord)
    assert database.name == "shop"
    schema = records[2]
    assert isinstance(schema, SchemaRecord)
    assert schema.database == "oltp.shop"
    tables = [record for record in records if isinstance(record, TableRecord)]
    assert [table.name for table in tables] == ["orders", "orders_v"]
    assert tables[0].columns[0].data_type == "INT"
    assert tables[0].columns[1].data_type == "VARCHAR"
    assert tables[0].columns[1].data_length == 128
    assert tables[0].description == "order rows"
    assert tables[1].table_type == "View"
    lineage = records[-1]
    assert isinstance(lineage, LineageRecord)
    assert lineage.from_entity.fqn == "oltp.shop.app.orders"
    assert lineage.to_entity.fqn == "oltp.shop.app.orders_v"


def test_mysql_database_schema_restricts_scan() -> None:
    source = MysqlSource(
        SourceConfig(
            type="mysql",
            service_name="oltp",
            connection={"databaseSchema": "app"},
        ),
        reader=_reader(),
    )
    names = [record.name for record in source.produce() if isinstance(record, SchemaRecord)]
    assert names == ["app"]


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


def test_mysql_cursor_reader_uses_information_schema() -> None:
    cursor = FakeCursor([("app",)])
    reader = CursorCatalogReader(lambda: FakeConnection(cursor))
    assert [row.name for row in reader.list_schemas()] == ["app"]
    assert "information_schema.schemata" in cursor.sql
    cursor.rows = [("app", "orders", "BASE TABLE", "")]
    tables = reader.list_tables("app")
    assert tables[0].name == "orders"
    assert "information_schema.tables" in cursor.sql
    cursor.rows = [("app", "orders", "id", "int", 1, None, "pk")]
    columns = reader.list_columns("app", "orders")
    assert columns[0].comment == "pk"
    cursor.rows = [("app", "orders_v", "SELECT 1")]
    assert reader.list_views()[0].name == "orders_v"
    assert cursor.closed is True


def test_mysql_live_reader_requires_extra(monkeypatch) -> None:
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "pymysql":
            raise ImportError("no pymysql")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(WorkflowError, match="smartmetadata-ingestion\\[mysql\\]"):
        _pymysql_connect({"hostPort": "localhost:3306"})
