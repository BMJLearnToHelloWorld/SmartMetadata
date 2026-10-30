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
from smartmetadata_ingestion.connectors.databricks import DatabricksSource
from smartmetadata_ingestion.connectors.databricks_common import (
    AUTH_AZURE,
    AUTH_OAUTH,
    AUTH_PAT,
    ColumnRow,
    DatabaseRow,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
    ViewRow,
    classify_auth,
    server_hostname,
    run_connection_test,
)
from smartmetadata_ingestion.connectors.databricks_data_diff import DatabricksTableParameter
from smartmetadata_ingestion.connectors.databricks_lineage import DatabricksLineageSource
from smartmetadata_ingestion.connectors.databricks_profiler import (
    DatabricksProfilerInterface,
    DatabricksSamplerInterface,
)
from smartmetadata_ingestion.connectors.databricks_quality import DatabricksTestSuiteInterface
from smartmetadata_ingestion.connectors.databricks_usage import DatabricksUsageSource
from smartmetadata_ingestion.connectors.databricks_common import (
    LineageEdgeRow,
    ProfileStatRow,
    SampleRow,
    SequenceLineageReader,
    SequenceProfileReader,
    SequenceUsageReader,
    UsageEventRow,
)
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


def _pat_conn(**extra):
    base = {
        "hostPort": "https://dbc-example.cloud.databricks.com",
        "httpPath": "/sql/1.0/warehouses/abc",
        "authType": {"token": "dapi-secret"},
        "catalog": "main",
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[
            DatabaseRow("main"),
            DatabaseRow("system"),
            DatabaseRow("other"),
        ],
        schemas=[
            SchemaRow("main", "default"),
            SchemaRow("main", "information_schema"),
            SchemaRow("other", "default"),
        ],
        tables=[
            TableRow("main", "default", "ORDERS", "BASE TABLE", "fact"),
            TableRow("main", "default", "ORDERS_V", "VIEW"),
            TableRow("other", "default", "SKIP", "BASE TABLE"),
        ],
        columns=[
            ColumnRow("main", "default", "ORDERS", "ID", "BIGINT", 1),
            ColumnRow("main", "default", "ORDERS", "EMAIL", "STRING", 2, 256),
            ColumnRow("main", "default", "ORDERS_V", "ID", "BIGINT", 1),
        ],
        views=[
            ViewRow("main", "default", "ORDERS_V", "SELECT ID FROM default.ORDERS"),
        ],
    )


def test_databricks_metadata_tree_and_view_lineage() -> None:
    source = DatabricksSource(
        SourceConfig(
            type="databricks",
            service_name="lakehouse",
            connection=_pat_conn(),
            include_databases=["main"],
            include_schemas=["default"],
            include_view_lineage=True,
            store_connection_secrets=False,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    kinds = [r.kind for r in records]
    assert kinds == ["databaseService", "database", "schema", "table", "table", "lineage"]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Databricks"
    assert service.connection["config"]["hostPort"].startswith("https://")
    assert service.connection["config"]["httpPath"].startswith("/sql/")
    assert "token" not in service.connection["config"].get("authType", {})
    tables = [r for r in records if isinstance(r, TableRecord)]
    assert [t.name for t in tables] == ["ORDERS", "ORDERS_V"]
    assert tables[0].columns[0].data_type == "BIGINT"
    assert tables[0].columns[1].data_type == "STRING"
    lineage = records[-1]
    assert isinstance(lineage, LineageRecord)
    assert lineage.from_entity.fqn == "lakehouse.main.default.ORDERS"
    assert lineage.to_entity.fqn == "lakehouse.main.default.ORDERS_V"


def test_databricks_connection_requires_http_path() -> None:
    with pytest.raises(WorkflowError, match="httpPath"):
        run_connection_test(
            {"hostPort": "dbc.example.com", "authType": {"token": "x"}},
            require_http_path=True,
        )


def test_auth_classification() -> None:
    assert classify_auth({"token": "t"}) == AUTH_PAT
    assert classify_auth({"clientId": "a", "clientSecret": "b"}) == AUTH_OAUTH
    assert (
        classify_auth(
            {
                "azureClientId": "a",
                "azureClientSecret": "b",
                "azureTenantId": "c",
            }
        )
        == AUTH_AZURE
    )
    assert server_hostname("https://dbc.example.com/") == "dbc.example.com"


def test_databricks_lineage_and_usage_sources() -> None:
    lineage = DatabricksLineageSource(
        SourceConfig(
            type="databricks-lineage",
            service_name="lakehouse",
            connection=_pat_conn(),
        ),
        reader=SequenceLineageReader(
            [
                LineageEdgeRow("main", "default", "ORDERS", "main", "default", "ORDERS_V"),
            ]
        ),
    )
    edges = list(lineage.produce())
    assert len(edges) == 1
    assert edges[0].source == "QueryLineage"
    assert edges[0].from_entity.fqn.endswith("ORDERS")

    usage = DatabricksUsageSource(
        SourceConfig(
            type="databricks-usage",
            service_name="lakehouse",
            connection=_pat_conn(queryHistoryTable="system.query.history"),
        ),
        reader=SequenceUsageReader(
            [UsageEventRow("main", "default", "ORDERS", "2026-10-30", 7)]
        ),
    )
    events = list(usage.produce())
    assert events == [
        UsageRecord(entity_type="table", fqn="lakehouse.main.default.ORDERS", date="2026-10-30", count=7)
    ]


def test_profiler_sampler_quality_data_diff() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(column_name=None, row_count=10),
            ProfileStatRow(column_name="ID", null_count=0, distinct_count=10),
        ],
        samples=[SampleRow(values={"ID": 1})],
    )
    profile = DatabricksProfilerInterface(reader).profile(
        service="lakehouse",
        database="main",
        schema="default",
        table="ORDERS",
        timestamp=1,
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.profile_data["rowCount"] == 10
    assert DatabricksSamplerInterface(reader).sample("main", "default", "ORDERS") == [{"ID": 1}]
    result = DatabricksTestSuiteInterface(execute=lambda expr: True).run_test_case(
        test_case_fqn="suite.case",
        timestamp=1,
        expression="1=1",
        expected=True,
    )
    assert result.test_case_status == "Success"
    payload = DatabricksTableParameter.build(
        _pat_conn(), catalog="main", schema="default", table="ORDERS"
    )
    assert payload["type"] == "Databricks"
    assert payload["authKind"] == AUTH_PAT
