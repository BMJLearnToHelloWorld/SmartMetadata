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


from smartmetadata_ingestion.connectors.snowflake_common import (
    LineageEdgeRow as SfLineageEdgeRow,
    ProfileStatRow as SfProfileStatRow,
    SampleRow as SfSampleRow,
    SequenceLineageReader as SfSequenceLineageReader,
    SequenceProfileReader as SfSequenceProfileReader,
    SequenceUsageReader as SfSequenceUsageReader,
    UsageEventRow as SfUsageEventRow,
    run_connection_test as sf_run_connection_test,
)
from smartmetadata_ingestion.connectors.snowflake_lineage import SnowflakeLineageSource
from smartmetadata_ingestion.connectors.snowflake_profiler import (
    SnowflakeProfilerInterface,
    SnowflakeSampler,
)
from smartmetadata_ingestion.connectors.snowflake_quality import SnowflakeTestSuiteInterface
from smartmetadata_ingestion.connectors.snowflake_usage import SnowflakeUsageSource
from smartmetadata_ingestion.connectors.snowflake_data_diff import (
    SnowflakeDataDiff,
    SnowflakeTableParameter,
)
from smartmetadata_ingestion.records import ProfileRecord


def _sf_conn(**extra):
    base = {
        "account": "xy12345",
        "username": "analyst",
        "password": "secret",
        "warehouse": "COMPUTE_WH",
        "database": "ANALYTICS",
        "role": "SYSADMIN",
        "supportsSystemProfile": True,
        "supportsDataDiff": True,
    }
    base.update(extra)
    return base


def test_snowflake_common_connection_test_requires_fields() -> None:
    with pytest.raises(WorkflowError, match="account"):
        sf_run_connection_test({"username": "analyst", "warehouse": "W", "database": "D"})
    assert sf_run_connection_test(_sf_conn()) == [
        "CheckAccount",
        "CheckUsername",
        "CheckWarehouse",
        "CheckDatabase",
    ]


def test_snowflake_lineage_source_injected_edges() -> None:
    source = SnowflakeLineageSource(
        SourceConfig(type="snowflake-lineage", service_name="sf", connection=_sf_conn()),
        reader=SfSequenceLineageReader(
            [
                SfLineageEdgeRow(
                    "ANALYTICS", "PUBLIC", "ORDERS",
                    "ANALYTICS", "PUBLIC", "ORDERS_V",
                    "select 1",
                )
            ]
        ),
    )
    source.prepare()
    assert len(list(source.produce())) == 1


def test_snowflake_profiler_sampler_quality_usage_data_diff() -> None:
    reader = SfSequenceProfileReader(
        stats=[SfProfileStatRow(None, row_count=9), SfProfileStatRow("ID", null_count=0, distinct_count=9)],
        samples=[SfSampleRow({"ID": 1})],
    )
    profile = SnowflakeProfilerInterface(reader).profile(
        service="sf", database="ANALYTICS", schema="PUBLIC", table="ORDERS", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert SnowflakeSampler(reader).sample("ANALYTICS", "PUBLIC", "ORDERS", limit=1) == [{"ID": 1}]
    assert SnowflakeTestSuiteInterface(execute=lambda e: True).run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1"
    ).test_case_status == "Success"
    usage = SnowflakeUsageSource(
        SourceConfig(type="snowflake-usage", service_name="sf", connection=_sf_conn()),
        reader=SfSequenceUsageReader(
            [SfUsageEventRow("ANALYTICS", "PUBLIC", "ORDERS", "2026-10-30", 7)]
        ),
    )
    usage.prepare()
    assert list(usage.produce())[0].count == 7
    param = SnowflakeTableParameter.build(
        _sf_conn(privateKey="PEM"),
        database="ANALYTICS",
        schema="PUBLIC",
        table="ORDERS",
        key_columns=["ID"],
    )
    assert param["dialect"] == "snowflake"
    assert param["account"] == "xy12345"
    assert param["privateKey"] == "PEM"
    diff = SnowflakeDataDiff(fetch_keys=lambda side: [1, 2])
    assert diff.compare(param, param)["rowDiffCount"] == 0
