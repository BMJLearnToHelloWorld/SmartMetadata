# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""CSV input-contract lock (design §2 contract B, §6 test 1).

A CSV row's ``database_name``/``schema_name`` columns already carry
catalog-segment meaning: they enter the record verbatim, with no
reinterpretation keyed on the engine name. That is the regression
baseline the native-log fixes must not disturb — the MySQL swap, in
particular, applies to native history rows only and must never
reach file input. All tests drive the real file-reading production
path (``produce`` → CSV parsing → record production) with no
production function mocked; the last test carries the row through
the real parser and resolver to its catalog FQN.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.postgres_usage import PostgresUsageSource
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.parser import QueryParserType
from smartmetadata_ingestion.records import FieldSource, TableQueryRecord
from smartmetadata_ingestion.usage.processor import parse_sql_statement
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver


def _write_csv(tmp_path: Path, body: str) -> Path:
    csv_file = tmp_path / "log.csv"
    csv_file.write_text(body, encoding="utf-8")
    return csv_file


def _records(csv_file: Path, **overrides: Any) -> list[TableQueryRecord]:
    payload: dict[str, Any] = {
        "type": "postgres-usage",
        "service_name": "svc",
        "connection": {"hostPort": "localhost:5432", "username": "u"},
        "queryLogFilePath": str(csv_file),
    }
    payload.update(overrides)
    config = SourceConfig.model_validate(payload)
    source = PostgresUsageSource(config)
    records = list(source.produce())
    assert all(isinstance(record, TableQueryRecord) for record in records)
    return records


def test_csv_columns_enter_record_verbatim(tmp_path: Path) -> None:
    csv_file = _write_csv(
        tmp_path,
        "query_text,database_name,schema_name\n"
        "SELECT * FROM orders,warehouse,sales\n",
    )
    records = _records(csv_file)
    assert len(records) == 1
    assert records[0].query == "SELECT * FROM orders"
    assert records[0].database_name == "warehouse"
    assert records[0].database_schema == "sales"


def test_csv_values_are_never_reinterpreted(tmp_path: Path) -> None:
    csv_file = _write_csv(
        tmp_path,
        "query_text,database_name,schema_name\n"
        "SELECT * FROM a,sales,public\n"
        "SELECT * FROM b,warehouse,warehouse\n"
        "SELECT * FROM c,dev,dev\n",
    )
    records = _records(csv_file)
    # Each row keeps its own pair exactly as written — even values
    # that look like physical schema names stay in the database
    # segment. No engine-name-based reshaping is applied.
    assert [(r.database_name, r.database_schema) for r in records] == [
        ("sales", "public"),
        ("warehouse", "warehouse"),
        ("dev", "dev"),
    ]


def test_csv_empty_columns_mean_missing(tmp_path: Path) -> None:
    csv_file = _write_csv(
        tmp_path,
        "query_text,database_name,schema_name\nSELECT * FROM t,,\n",
    )
    records = _records(csv_file)
    assert len(records) == 1
    assert records[0].database_name is None
    assert records[0].database_schema is None


def test_csv_path_never_opens_a_history_connection(tmp_path: Path) -> None:
    csv_file = _write_csv(
        tmp_path,
        "query_text,database_name,schema_name\n"
        "SELECT * FROM orders,warehouse,sales\n",
    )
    config = SourceConfig.model_validate(
        {
            "type": "postgres-usage",
            "service_name": "svc",
            "connection": {"hostPort": "localhost:5432", "username": "u"},
            "queryLogFilePath": str(csv_file),
        }
    )

    def _must_not_connect():
        raise AssertionError("CSV production must not open a database connection")

    source = PostgresUsageSource(config, connect=_must_not_connect)
    records = list(source.produce())
    assert len(records) == 1
    assert records[0].database_name == "warehouse"


def test_csv_row_binds_to_its_own_columns_despite_coexisting_names(
    tmp_path: Path,
) -> None:
    """A CSV row binds through its own two columns, not a lookalike.

    Catalog holds both ``svc.warehouse.sales.orders`` and
    ``svc.warehouse.warehouse.orders``; a CSV row with
    ``database_name=warehouse, schema_name=sales`` and query
    ``SELECT * FROM orders`` must bind to the former. The row is
    produced through the real CSV path, parsed by the real parser,
    and resolved by the real resolver over an in-memory catalog.
    """

    class _FakeClient:
        def __init__(self, tables: dict[str, dict[str, Any]]) -> None:
            self._tables = tables

        def get_table_by_name(
            self, fqn: str, fields: str | None = None
        ) -> dict[str, Any]:
            entity = self._tables.get(fqn)
            if entity is None:
                raise RestError("not found", status_code=404)
            return entity

        def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
            schema_fqn = (extra_params or {}).get("databaseSchema", "")
            prefix = f"{schema_fqn}."
            return [e for fqn, e in self._tables.items() if fqn.startswith(prefix)]

    csv_file = _write_csv(
        tmp_path,
        "query_text,database_name,schema_name\n"
        "SELECT * FROM orders,warehouse,sales\n",
    )
    records = _records(csv_file)
    assert len(records) == 1
    parsed = parse_sql_statement(records[0], Dialect.POSTGRES, QueryParserType.AUTO)
    assert parsed is not None
    assert parsed.tables == [StructuredIdentifier.single("orders")]
    context = parsed.binding_context
    assert (context.database_name, context.database_schema) == ("warehouse", "sales")
    assert context.database_source is FieldSource.ROW_CSV
    assert context.schema_source is FieldSource.ROW_CSV

    def _table(fqn: str) -> dict[str, Any]:
        return {
            "id": f"id-{fqn}",
            "fullyQualifiedName": fqn,
            "name": fqn.rsplit(".", 1)[-1],
        }

    client = _FakeClient(
        {
            "svc.warehouse.sales.orders": _table("svc.warehouse.sales.orders"),
            "svc.warehouse.warehouse.orders": _table(
                "svc.warehouse.warehouse.orders"
            ),
        }
    )
    resolver = RestTableBindingResolver(client, "svc")  # type: ignore[arg-type]
    assert (
        resolver.resolve(parsed.tables[0], context=context)
        == "svc.warehouse.sales.orders"
    )
