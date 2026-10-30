# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.databricks_common import (
    ColumnRow,
    DatabaseRow,
    LineageEdgeRow,
    SchemaRow,
    SequenceCatalogReader,
    SequenceLineageReader,
    SequenceUsageReader,
    TableRow,
    UsageEventRow,
    ViewRow,
    run_connection_test,
)
from smartmetadata_ingestion.connectors.unitycatalog import UnityCatalogSource
from smartmetadata_ingestion.connectors.unitycatalog_data_diff import UnityCatalogTableParameter
from smartmetadata_ingestion.connectors.unitycatalog_lineage import UnityCatalogLineageSource
from smartmetadata_ingestion.connectors.unitycatalog_usage import UnityCatalogUsageSource
from smartmetadata_ingestion.records import DatabaseServiceRecord, TableRecord, UsageRecord


def _conn(**extra):
    base = {
        "hostPort": "dbc-example.cloud.databricks.com",
        "authType": {"token": "dapi"},
        "catalog": "main",
        "includeMetricViews": True,
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        databases=[DatabaseRow("main"), DatabaseRow("system")],
        schemas=[SchemaRow("main", "default"), SchemaRow("main", "information_schema")],
        tables=[
            TableRow("main", "default", "ORDERS", "BASE TABLE"),
            TableRow("main", "default", "GMV", "METRIC_VIEW"),
            TableRow("main", "default", "ORDERS_V", "VIEW"),
        ],
        columns=[
            ColumnRow("main", "default", "ORDERS", "ID", "BIGINT", 1),
            ColumnRow("main", "default", "GMV", "VALUE", "DOUBLE", 1),
            ColumnRow("main", "default", "ORDERS_V", "ID", "BIGINT", 1),
        ],
        views=[ViewRow("main", "default", "ORDERS_V", "SELECT ID FROM default.ORDERS")],
    )


def test_unitycatalog_includes_metric_views_by_default() -> None:
    source = UnityCatalogSource(
        SourceConfig(
            type="unitycatalog",
            service_name="uc",
            connection=_conn(),
            include_databases=["main"],
            include_schemas=["default"],
            include_view_lineage=True,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "UnityCatalog"
    tables = [r.name for r in records if isinstance(r, TableRecord)]
    assert tables == ["ORDERS", "GMV", "ORDERS_V"]


def test_unitycatalog_can_skip_metric_views() -> None:
    source = UnityCatalogSource(
        SourceConfig(
            type="unitycatalog",
            service_name="uc",
            connection=_conn(includeMetricViews=False),
            include_databases=["main"],
            include_schemas=["default"],
        ),
        reader=_reader(),
    )
    tables = [r.name for r in source.produce() if isinstance(r, TableRecord)]
    assert tables == ["ORDERS", "ORDERS_V"]


def test_unitycatalog_http_path_optional_for_connection_test() -> None:
    steps = run_connection_test(_conn(), require_http_path=False)
    assert "CheckHostPort" in steps
    assert "CheckAuthType" in steps


def test_unitycatalog_lineage_usage_data_diff() -> None:
    edges = list(
        UnityCatalogLineageSource(
            SourceConfig(type="unitycatalog-lineage", service_name="uc", connection=_conn()),
            reader=SequenceLineageReader(
                [LineageEdgeRow("main", "default", "ORDERS", "main", "default", "GMV")]
            ),
        ).produce()
    )
    assert edges[0].to_entity.fqn == "uc.main.default.GMV"
    events = list(
        UnityCatalogUsageSource(
            SourceConfig(type="unitycatalog-usage", service_name="uc", connection=_conn()),
            reader=SequenceUsageReader(
                [UsageEventRow("main", "default", "ORDERS", "2026-10-29", 3)]
            ),
        ).produce()
    )
    assert events[0] == UsageRecord(
        entity_type="table", fqn="uc.main.default.ORDERS", date="2026-10-29", count=3
    )
    payload = UnityCatalogTableParameter.build(
        _conn(httpPath="/sql/1.0/warehouses/x"),
        catalog="main",
        schema="default",
        table="ORDERS",
    )
    assert payload["type"] == "UnityCatalog"
