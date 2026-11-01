# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.errors import WorkflowError

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
    ViewRow,
    parse_view_parents,
)
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
            SchemaRow("public"),
            SchemaRow("pg_catalog"),
            SchemaRow("hidden"),
        ],
        tables=[
            TableRow("public", "orders", "BASE TABLE"),
            TableRow("public", "orders_v", "VIEW"),
            TableRow("hidden", "secret", "BASE TABLE"),
        ],
        columns=[
            ColumnRow("public", "orders", "id", "integer", 1),
            ColumnRow("public", "orders", "email", "character varying", 2, 128),
            ColumnRow("public", "orders_v", "id", "integer", 1),
        ],
        views=[
            ViewRow("public", "orders_v", "SELECT id FROM public.orders"),
        ],
    )


def test_postgres_source_emits_hierarchy_and_view_lineage() -> None:
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"hostPort": "localhost:5432", "username": "u", "database": "analytics"},
            include_schemas=["public"],
            include_view_lineage=True,
        ),
        reader=_reader(),
    )
    records = list(source.produce())
    kinds = [record.kind for record in records]
    assert kinds == ["databaseService", "database", "schema", "table", "table", "lineage"]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Postgres"
    assert service.connection is not None
    assert "authType" not in service.connection["config"]
    database = records[1]
    assert isinstance(database, DatabaseRecord)
    assert database.name == "analytics"
    schema = records[2]
    assert isinstance(schema, SchemaRecord)
    assert schema.database == "warehouse.analytics"
    tables = [record for record in records if isinstance(record, TableRecord)]
    assert [table.name for table in tables] == ["orders", "orders_v"]
    assert tables[0].columns[0].data_type == "INT"
    assert tables[0].columns[1].data_type == "VARCHAR"
    assert tables[0].columns[1].data_length == 128
    assert tables[1].table_type == "View"
    lineage = records[-1]
    assert isinstance(lineage, LineageRecord)
    assert lineage.from_entity.fqn == "warehouse.analytics.public.orders"
    assert lineage.to_entity.fqn == "warehouse.analytics.public.orders_v"
    assert lineage.source == "ViewLineage"


def test_store_connection_secrets_is_opt_in() -> None:
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "password": "secret",
                "database": "analytics",
            },
            store_connection_secrets=True,
            include_schemas=["public"],
        ),
        reader=_reader(),
    )
    service = next(iter(source.produce()))
    assert isinstance(service, DatabaseServiceRecord)
    assert service.connection["config"]["authType"]["password"] == "secret"


def test_parse_view_parents_reads_from_and_join() -> None:
    sql = 'SELECT * FROM public.orders JOIN "other" o ON o.id = orders.id'
    assert parse_view_parents(sql, "public") == [("public", "orders"), ("public", "other")]


# --- OM DefaultDatabaseSpec full-chain BehaviorMatched (unit) ---
from smartmetadata_ingestion.connectors.postgres_common import (
    ColumnRow as PgColumnRow,
    DatabaseRow as PgDatabaseRow,
    LineageEdgeRow as PgLineageEdgeRow,
    ProfileStatRow as PgProfileStatRow,
    SampleRow as PgSampleRow,
    SchemaRow as PgSchemaRow,
    SequenceCatalogReader as PgSequenceCatalogReader,
    SequenceLineageReader as PgSequenceLineageReader,
    SequenceProfileReader as PgSequenceProfileReader,
    SequenceUsageReader as PgSequenceUsageReader,
    TableRow as PgTableRow,
    UsageEventRow as PgUsageEventRow,
    ViewRow as PgViewRow,
    run_connection_test as pg_run_connection_test,
)
from smartmetadata_ingestion.connectors.postgres_lineage import PostgresLineageSource
from smartmetadata_ingestion.connectors.postgres_profiler import (
    PostgresProfilerInterface,
    PostgresSampler,
)
from smartmetadata_ingestion.connectors.postgres_quality import PostgresTestSuiteInterface
from smartmetadata_ingestion.connectors.postgres_usage import PostgresUsageSource
from smartmetadata_ingestion.connectors.postgres_data_diff import (
    PostgresDataDiff,
    PostgresTableParameter,
)
from smartmetadata_ingestion.records import ProfileRecord, UsageRecord


def _pg_conn(**extra):
    base = {
        "hostPort": "localhost:5432",
        "username": "admin",
        "password": "secret",
        "database": "warehouse",
    }
    base.update(extra)
    return base


def test_postgres_common_connection_test_requires_fields() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        pg_run_connection_test({"username": "admin", "database": "warehouse"})
    assert pg_run_connection_test(_pg_conn()) == ["CheckHostPort", "CheckUsername", "CheckDatabase"]


def test_postgres_lineage_source_injected_edges() -> None:
    source = PostgresLineageSource(
        SourceConfig(type="postgres-lineage", service_name="pg", connection=_pg_conn()),
        reader=PgSequenceLineageReader(
            [
                PgLineageEdgeRow(
                    "warehouse", "public", "orders",
                    "warehouse", "public", "orders_v",
                    "select 1",
                )
            ]
        ),
    )
    source.prepare()
    edges = list(source.produce())
    assert len(edges) == 1
    assert edges[0].sql_query == "select 1"


def test_postgres_profiler_sampler_quality_usage_data_diff() -> None:
    reader = PgSequenceProfileReader(
        stats=[
            PgProfileStatRow(None, row_count=10),
            PgProfileStatRow("id", null_count=0, distinct_count=10, min_value="1", max_value="10"),
        ],
        samples=[PgSampleRow({"id": 1}), PgSampleRow({"id": 2})],
    )
    profile = PostgresProfilerInterface(reader).profile(
        service="pg", database="warehouse", schema="public", table="orders", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.table_profile["rowCount"] == 10
    assert PostgresSampler(reader).sample("warehouse", "public", "orders", limit=1) == [{"id": 1}]

    dq = PostgresTestSuiteInterface(execute=lambda expr: True)
    assert dq.run_test_case(test_case_fqn="tc", timestamp=1, expression="select 1").test_case_status == "Success"

    usage = PostgresUsageSource(
        SourceConfig(type="postgres-usage", service_name="pg", connection=_pg_conn()),
        reader=PgSequenceUsageReader([PgUsageEventRow("warehouse", "public", "orders", "2026-10-30", 4)]),
    )
    usage.prepare()
    events = list(usage.produce())
    assert len(events) == 1 and events[0].count == 4

    param = PostgresTableParameter.build(
        _pg_conn(), database="warehouse", schema="public", table="orders", key_columns=["id"]
    )
    assert param["dialect"] == "postgres" and param["type"] == "Postgres"
    diff = PostgresDataDiff(fetch_keys=lambda side: [1, 2] if side["table"] == "orders" else [2, 3])
    result = diff.compare(param, {**param, "table": "orders_copy"})
    assert result["rowDiffCount"] == 2
