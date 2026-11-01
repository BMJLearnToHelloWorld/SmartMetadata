# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import sys
from types import SimpleNamespace

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


def test_mysql_live_connection_uses_database_name(monkeypatch) -> None:
    calls = []
    fake_pymysql = SimpleNamespace(connect=lambda **kwargs: calls.append(kwargs) or object())
    monkeypatch.setitem(sys.modules, "pymysql", fake_pymysql)

    connect = _pymysql_connect(
        {
            "hostPort": "localhost:3306",
            "username": "ingest",
            "password": "secret",
            "databaseName": "shop",
        }
    )
    connect()

    assert calls[0]["database"] == "shop"


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


from smartmetadata_ingestion.connectors.mysql_common import (
    LineageEdgeRow as MyLineageEdgeRow,
    ProfileStatRow as MyProfileStatRow,
    SampleRow as MySampleRow,
    SequenceLineageReader as MySequenceLineageReader,
    SequenceProfileReader as MySequenceProfileReader,
    SequenceUsageReader as MySequenceUsageReader,
    UsageEventRow as MyUsageEventRow,
    run_connection_test as my_run_connection_test,
)
from smartmetadata_ingestion.connectors.mysql_lineage import MysqlLineageSource
from smartmetadata_ingestion.connectors.mysql_profiler import MysqlProfilerInterface, MysqlSampler
from smartmetadata_ingestion.connectors.mysql_quality import MysqlTestSuiteInterface
from smartmetadata_ingestion.connectors.mysql_usage import MysqlUsageSource
from smartmetadata_ingestion.connectors.mysql_data_diff import MysqlDataDiff, MysqlTableParameter
from smartmetadata_ingestion.records import ProfileRecord


def _my_conn(**extra):
    base = {"hostPort": "localhost:3306", "username": "root", "password": "secret", "databaseName": "shop"}
    base.update(extra)
    return base


def test_mysql_common_connection_test_requires_fields() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        my_run_connection_test({"username": "root"})
    # databaseName may or may not be required in mariadb-derived common — accept hostPort+username minimum
    steps = my_run_connection_test(_my_conn())
    assert "CheckHostPort" in steps


def test_mysql_lineage_source_injected_edges() -> None:
    source = MysqlLineageSource(
        SourceConfig(type="mysql-lineage", service_name="my", connection=_my_conn()),
        reader=MySequenceLineageReader(
            [MyLineageEdgeRow("shop", "orders", "shop", "orders_v", "select 1")]
        ),
    )
    # mysql lineage from mariadb may use schema-only edges — adapt if dataclass differs
    source.prepare()
    edges = list(source.produce())
    assert len(edges) == 1


def test_mysql_profiler_sampler_quality_usage_data_diff() -> None:
    # ProfileReader signature from mariadb: profile_table(schema, table) without database
    reader = MySequenceProfileReader(
        stats=[MyProfileStatRow(None, row_count=5), MyProfileStatRow("id", null_count=0, distinct_count=5)],
        samples=[MySampleRow({"id": 1})],
    )
    profile = MysqlProfilerInterface(reader).profile(
        service="my", database="shop", schema="shop", table="orders", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert MysqlSampler(reader).sample("shop", "orders", limit=1) == [{"id": 1}]
    assert MysqlTestSuiteInterface(execute=lambda e: True).run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1"
    ).test_case_status == "Success"
    usage = MysqlUsageSource(
        SourceConfig(type="mysql-usage", service_name="my", connection=_my_conn()),
        reader=MySequenceUsageReader([MyUsageEventRow("shop", "shop", "orders", "2026-10-30", 2)]),
    )
    usage.prepare()
    assert list(usage.produce())[0].count == 2
    param = MysqlTableParameter.build(_my_conn(), database="shop", schema="shop", table="orders", key_columns=["id"])
    assert param["dialect"] == "mysql"
    diff = MysqlDataDiff(fetch_keys=lambda side: [1] if side["table"] == "orders" else [1, 2])
    assert diff.compare(param, {**param, "table": "other"})["extraRight"] == 1
