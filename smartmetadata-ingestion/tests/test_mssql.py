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
from smartmetadata_ingestion.connectors.mssql import MssqlSource
from smartmetadata_ingestion.connectors.mssql_common import (
    ColumnRow,
    DatabaseRow,
    SchemaRow,
    SequenceCatalogReader,
    SequenceLineageReader,
    SequenceProfileReader,
    SequenceUsageReader,
    TableRow,
    ViewRow,
    LineageEdgeRow,
    ProfileStatRow,
    SampleRow,
    UsageEventRow,
    normalize_scheme,
    run_connection_test,
)
from smartmetadata_ingestion.connectors.mssql_data_diff import MssqlDataDiff, MssqlTableParameter
from smartmetadata_ingestion.connectors.mssql_lineage import MssqlLineageSource
from smartmetadata_ingestion.connectors.mssql_profiler import MssqlProfilerInterface, MssqlSampler
from smartmetadata_ingestion.connectors.mssql_quality import MssqlTestSuiteInterface
from smartmetadata_ingestion.connectors.mssql_usage import MssqlUsageSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    ProfileRecord,
    SchemaRecord,
    TableRecord,
    UsageRecord,
)


def _conn(**extra):
    base = {
        "hostPort": "localhost:1433",
        "username": "sa",
        "password": "Secret123!",
        "database": "AdventureWorks",
        "scheme": "mssql+pytds",
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[
            DatabaseRow("AdventureWorks"),
            DatabaseRow("msdb"),
            DatabaseRow("OtherDb"),
        ],
        schemas=[
            SchemaRow("AdventureWorks", "Sales"),
            SchemaRow("AdventureWorks", "sys"),
            SchemaRow("OtherDb", "dbo"),
        ],
        tables=[
            TableRow("AdventureWorks", "Sales", "Orders", "BASE TABLE"),
            TableRow("AdventureWorks", "Sales", "Orders_V", "VIEW"),
            TableRow("OtherDb", "dbo", "Skip", "BASE TABLE"),
        ],
        columns=[
            ColumnRow("AdventureWorks", "Sales", "Orders", "Id", "int", 1),
            ColumnRow("AdventureWorks", "Sales", "Orders", "Email", "nvarchar", 2, 256),
            ColumnRow("AdventureWorks", "Sales", "Orders_V", "Id", "int", 1),
        ],
        views=[
            ViewRow(
                "AdventureWorks",
                "Sales",
                "Orders_V",
                "SELECT Id FROM Sales.Orders",
            ),
        ],
    )


def test_mssql_scheme_and_connection_test() -> None:
    assert normalize_scheme({}) == "mssql+pytds"
    with pytest.raises(WorkflowError, match="unsupported mssql scheme"):
        normalize_scheme({"scheme": "mssql+bogus"})
    with pytest.raises(WorkflowError, match="database"):
        run_connection_test({"hostPort": "localhost:1433"})
    steps = run_connection_test(_conn())
    assert "CheckDatabase" in steps
    assert "CheckScheme" in steps


def test_mssql_metadata_tree_and_view_lineage() -> None:
    source = MssqlSource(
        SourceConfig(
            type="mssql",
            service_name="sqlserver",
            connection=_conn(),
            include_databases=["AdventureWorks"],
            include_schemas=["Sales"],
            include_view_lineage=True,
            store_connection_secrets=True,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    kinds = [r.kind for r in records]
    assert kinds[0] == "databaseService"
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Mssql"
    assert service.connection["config"]["scheme"] == "mssql+pytds"
    assert service.connection["config"]["password"] == "Secret123!"
    assert any(isinstance(r, DatabaseRecord) and r.name == "AdventureWorks" for r in records)
    assert not any(isinstance(r, DatabaseRecord) and r.name == "msdb" for r in records)
    schemas = [r for r in records if isinstance(r, SchemaRecord)]
    assert {s.name for s in schemas} == {"Sales"}
    tables = [r for r in records if isinstance(r, TableRecord)]
    assert {t.name for t in tables} == {"Orders", "Orders_V"}
    orders = next(t for t in tables if t.name == "Orders")
    assert orders.columns[0].data_type == "INT"
    lineage = [r for r in records if isinstance(r, LineageRecord)]
    assert len(lineage) == 1
    assert lineage[0].from_entity.fqn.endswith(".Sales.Orders")
    assert lineage[0].to_entity.fqn.endswith(".Sales.Orders_V")


def test_mssql_lineage_injected() -> None:
    source = MssqlLineageSource(
        SourceConfig(type="mssql-lineage", service_name="s", connection=_conn()),
        reader=SequenceLineageReader(
            [
                LineageEdgeRow(
                    "AdventureWorks",
                    "Sales",
                    "Orders",
                    "AdventureWorks",
                    "Sales",
                    "Orders_V",
                    "select 1",
                )
            ]
        ),
    )
    edges = list(source.produce())
    assert len(edges) == 1
    assert edges[0].source == "QueryLineage"


def test_mssql_usage() -> None:
    source = MssqlUsageSource(
        SourceConfig(type="mssql-usage", service_name="s", connection=_conn()),
        reader=SequenceUsageReader(
            [UsageEventRow("AdventureWorks", "Sales", "Orders", "2026-10-01", 7)]
        ),
    )
    source.prepare()
    records = list(source.produce())
    assert len(records) == 1
    assert isinstance(records[0], UsageRecord)
    assert records[0].date == "2026-10-01"
    assert records[0].count == 7


def test_mssql_profiler_sampler() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=5),
            ProfileStatRow("Id", null_count=0, distinct_count=5),
        ],
        samples=[SampleRow({"Id": 1})],
    )
    profile = MssqlProfilerInterface(reader).profile(
        service="s",
        database="AdventureWorks",
        schema="Sales",
        table="Orders",
        timestamp=1,
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.table_profile["rowCount"] == 5
    assert MssqlSampler(reader).sample("AdventureWorks", "Sales", "Orders") == [{"Id": 1}]


def test_mssql_data_diff_parameter_and_compare() -> None:
    param = MssqlTableParameter.build(
        _conn(),
        database="AdventureWorks",
        schema="Sales",
        table="Orders",
        key_columns=["Id"],
    )
    assert param["dialect"] == "mssql"
    assert param["keyColumns"] == ["Id"]
    other = dict(param)
    other["table"] = "Orders_V"
    result = MssqlDataDiff(
        fetch_keys=lambda p: {(1,), (2,)} if p["table"] == "Orders" else {(2,), (3,)}
    ).compare(param, other)
    assert result["rowDiffCount"] == 2
    assert result["extraLeft"] == 1
    assert result["extraRight"] == 1


def test_mssql_quality() -> None:
    iface = MssqlTestSuiteInterface(execute=lambda expr: False)
    result = iface.run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1", expected=True
    )
    assert result.test_case_status == "Failed"
