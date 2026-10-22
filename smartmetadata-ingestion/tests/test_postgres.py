# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

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
