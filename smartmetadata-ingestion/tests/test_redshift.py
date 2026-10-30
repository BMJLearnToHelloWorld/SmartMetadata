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
from smartmetadata_ingestion.connectors.redshift import RedshiftSource
from smartmetadata_ingestion.connectors.redshift_common import (
    ColumnRow,
    DatabaseRow,
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
from smartmetadata_ingestion.connectors.redshift_lineage import RedshiftLineageSource
from smartmetadata_ingestion.connectors.redshift_profiler import (
    RedshiftProfilerInterface,
    RedshiftSampleHelper,
)
from smartmetadata_ingestion.connectors.redshift_quality import RedshiftTestSuiteInterface
from smartmetadata_ingestion.connectors.redshift_usage import RedshiftUsageSource
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
        "hostPort": "localhost:5439",
        "username": "admin",
        "password": "secret",
        "database": "analytics",
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[
            DatabaseRow("analytics"),
            DatabaseRow("template0"),
        ],
        schemas=[
            SchemaRow("analytics", "public"),
            SchemaRow("analytics", "pg_catalog"),
        ],
        tables=[
            TableRow("analytics", "public", "orders", "BASE TABLE", "fact"),
            TableRow("analytics", "public", "orders_v", "VIEW"),
        ],
        columns=[
            ColumnRow("analytics", "public", "orders", "id", "bigint", 1),
            ColumnRow("analytics", "public", "orders", "email", "varchar", 2, 256),
            ColumnRow("analytics", "public", "orders_v", "id", "bigint", 1),
        ],
        views=[
            ViewRow("analytics", "public", "orders_v", "SELECT id FROM public.orders"),
        ],
    )


def test_redshift_connection_test_requires_fields() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        run_connection_test({"username": "admin", "database": "analytics"})
    with pytest.raises(WorkflowError, match="username"):
        run_connection_test({"hostPort": "localhost:5439", "database": "analytics"})
    with pytest.raises(WorkflowError, match="database"):
        run_connection_test({"hostPort": "localhost:5439", "username": "admin"})
    assert run_connection_test(_conn()) == ["CheckHostPort", "CheckUsername", "CheckDatabase"]


def test_redshift_metadata_tree_and_view_lineage() -> None:
    source = RedshiftSource(
        SourceConfig(
            type="redshift",
            service_name="redshift-svc",
            connection=_conn(),
            include_schemas=["public"],
            include_view_lineage=True,
            store_connection_secrets=True,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Redshift"
    assert service.connection["config"]["type"] == "Redshift"
    assert service.connection["config"]["scheme"] == "redshift+psycopg2"
    assert service.connection["config"]["authType"]["password"] == "secret"
    assert isinstance(records[1], DatabaseRecord)
    assert records[1].name == "analytics"
    assert isinstance(records[2], SchemaRecord)
    assert records[2].name == "public"
    tables = [r for r in records if isinstance(r, TableRecord)]
    assert {t.name for t in tables} == {"orders", "orders_v"}
    orders = next(t for t in tables if t.name == "orders")
    assert orders.columns[0].data_type == "BIGINT"
    lineage = next(r for r in records if isinstance(r, LineageRecord))
    assert lineage.from_entity.fqn.endswith(".public.orders")
    assert lineage.to_entity.fqn.endswith(".public.orders_v")
    assert lineage.source == "ViewLineage"


def test_redshift_lineage_source_injected_edges() -> None:
    source = RedshiftLineageSource(
        SourceConfig(type="redshift-lineage", service_name="s", connection=_conn()),
        reader=SequenceLineageReader(
            [
                LineageEdgeRow(
                    "analytics", "public", "orders",
                    "analytics", "public", "orders_v",
                    "select 1",
                ),
            ]
        ),
    )
    source.prepare()
    edges = list(source.produce())
    assert len(edges) == 1
    assert isinstance(edges[0], LineageRecord)
    assert edges[0].sql_query == "select 1"


def test_redshift_profiler_and_sample() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=10),
            ProfileStatRow("id", null_count=0, distinct_count=10, min_value="1", max_value="10"),
        ],
        samples=[SampleRow({"id": 1}), SampleRow({"id": 2})],
    )
    profile = RedshiftProfilerInterface(reader).profile(
        service="s", database="analytics", schema="public", table="orders", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.table_profile["rowCount"] == 10
    assert profile.column_profile[0]["name"] == "id"
    samples = RedshiftSampleHelper(reader).sample("analytics", "public", "orders", limit=1)
    assert samples == [{"id": 1}]


def test_redshift_quality() -> None:
    iface = RedshiftTestSuiteInterface(execute=lambda expr: True)
    result = iface.run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1", expected=True
    )
    assert result.test_case_status == "Success"


def test_redshift_usage() -> None:
    from smartmetadata_ingestion.connectors.redshift_common import SequenceUsageReader, UsageEventRow
    source = RedshiftUsageSource(
        SourceConfig(type="redshift-usage", service_name="s", connection=_conn()),
        reader=SequenceUsageReader(
            [UsageEventRow("analytics", "public", "orders", "2026-10-30", 3)]
        ),
    )
    source.prepare()
    events = list(source.produce())
    assert len(events) == 1
    assert events[0].count == 3
    assert events[0].fqn.endswith(".public.orders")

