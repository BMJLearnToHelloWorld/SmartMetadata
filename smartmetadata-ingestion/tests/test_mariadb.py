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
from smartmetadata_ingestion.connectors.mariadb import MariaDBSource
from smartmetadata_ingestion.connectors.mariadb_common import (
    ColumnRow,
    SchemaRow,
    SequenceCatalogReader,
    SequenceLineageReader,
    SequenceProfileReader,
    TableRow,
    ViewRow,
    LineageEdgeRow,
    ProfileStatRow,
    SampleRow,
    run_connection_test,
)
from smartmetadata_ingestion.connectors.mariadb_lineage import MariaDBLineageSource
from smartmetadata_ingestion.connectors.mariadb_profiler import (
    MariaDBProfilerInterface,
    MariaDBSampleHelper,
)
from smartmetadata_ingestion.connectors.mariadb_quality import MariaDBTestSuiteInterface
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    ProfileRecord,
    SchemaRecord,
    TableRecord,
)


def _conn(**extra):
    base = {
        "hostPort": "localhost:3306",
        "username": "root",
        "password": "secret",
        "databaseName": "default",
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        schemas=[
            SchemaRow("sales"),
            SchemaRow("information_schema"),
            SchemaRow("__internal_schema"),
        ],
        tables=[
            TableRow("sales", "orders", "BASE TABLE", "fact"),
            TableRow("sales", "orders_v", "VIEW"),
        ],
        columns=[
            ColumnRow("sales", "orders", "id", "bigint", 1),
            ColumnRow("sales", "orders", "email", "varchar", 2, 256),
            ColumnRow("sales", "orders_v", "id", "bigint", 1),
        ],
        views=[
            ViewRow("sales", "orders_v", "SELECT id FROM sales.orders"),
        ],
    )


def test_mariadb_connection_test_requires_host_and_user() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        run_connection_test({"username": "root"})
    with pytest.raises(WorkflowError, match="username"):
        run_connection_test({"hostPort": "localhost:3306"})
    assert run_connection_test(_conn()) == ["CheckHostPort", "CheckUsername"]


def test_mariadb_metadata_tree_and_view_lineage() -> None:
    source = MariaDBSource(
        SourceConfig(
            type="mariadb",
            service_name="mariadb-svc",
            connection=_conn(),
            include_schemas=["sales"],
            include_view_lineage=True,
            store_connection_secrets=True,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    kinds = [r.kind for r in records]
    assert kinds == [
        "databaseService",
        "database",
        "schema",
        "table",
        "table",
        "lineage",
    ]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "MariaDB"
    assert service.connection["config"]["type"] == "MariaDB"
    assert service.connection["config"]["scheme"] == "mysql+pymysql"
    assert service.connection["config"]["password"] == "secret"
    assert isinstance(records[1], DatabaseRecord)
    assert records[1].name == "default"
    assert isinstance(records[2], SchemaRecord)
    assert records[2].name == "sales"
    tables = [r for r in records if isinstance(r, TableRecord)]
    assert {t.name for t in tables} == {"orders", "orders_v"}
    orders = next(t for t in tables if t.name == "orders")
    assert orders.columns[0].data_type == "BIGINT"
    lineage = next(r for r in records if isinstance(r, LineageRecord))
    assert lineage.from_entity.fqn.endswith(".sales.orders")
    assert lineage.to_entity.fqn.endswith(".sales.orders_v")
    assert lineage.source == "ViewLineage"


def test_mariadb_lineage_source_injected_edges() -> None:
    source = MariaDBLineageSource(
        SourceConfig(type="mariadb-lineage", service_name="d", connection=_conn()),
        reader=SequenceLineageReader(
            [
                LineageEdgeRow("sales", "orders", "sales", "orders_v", "select 1"),
            ]
        ),
    )
    source.prepare()
    edges = list(source.produce())
    assert len(edges) == 1
    assert isinstance(edges[0], LineageRecord)
    assert edges[0].sql_query == "select 1"


def test_mariadb_profiler_and_sample() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=10),
            ProfileStatRow("id", null_count=0, distinct_count=10, min_value="1", max_value="10"),
        ],
        samples=[SampleRow({"id": 1}), SampleRow({"id": 2})],
    )
    profile = MariaDBProfilerInterface(reader).profile(
        service="d", database="default", schema="sales", table="orders", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.table_profile["rowCount"] == 10
    assert profile.column_profile[0]["name"] == "id"
    samples = MariaDBSampleHelper(reader).sample("sales", "orders", limit=1)
    assert samples == [{"id": 1}]


def test_mariadb_quality() -> None:
    iface = MariaDBTestSuiteInterface(execute=lambda expr: True)
    result = iface.run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1", expected=True
    )
    assert result.test_case_status == "Success"
