# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.datadiff import (
    SqlKeyFetcher,
    build_side,
    compare_key_sets,
    datadiff_binding,
)
from smartmetadata_ingestion.errors import WorkflowError


class FakeCursor:
    def __init__(self, owner: FakeConnect) -> None:
        self._owner = owner

    def execute(self, sql: str, params: Any = None) -> None:
        self._owner.executed.append(sql)

    def fetchall(self) -> list[tuple[Any, ...]]:
        return list(self._owner.rows)

    def close(self) -> None:
        return None


class FakeConnection:
    def __init__(self, owner: FakeConnect) -> None:
        self._owner = owner

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *exc: Any) -> bool:
        return False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self._owner)


class FakeConnect:
    """Fake DB-API connect factory: records SQL, returns configured rows."""

    def __init__(self, rows: list[tuple[Any, ...]]) -> None:
        self.rows = rows
        self.executed: list[str] = []

    def __call__(self) -> FakeConnection:
        return FakeConnection(self)


def _fetcher(stem: str, connect: Any) -> SqlKeyFetcher:
    binding = datadiff_binding(stem)
    assert binding is not None
    return SqlKeyFetcher(connect, quote=binding.quote, ident_style=binding.ident_style)


@pytest.mark.parametrize(
    "stem,database,schema,table,key,expected",
    [
        (
            "postgres",
            "warehouse",
            "public",
            "orders",
            "id",
            'SELECT DISTINCT "id" FROM "warehouse"."public"."orders"',
        ),
        (
            "mysql",
            "warehouse",
            "public",
            "orders",
            "id",
            "SELECT DISTINCT `id` FROM `public`.`orders`",
        ),
        (
            "mssql",
            "warehouse",
            "dbo",
            "orders",
            "id",
            "SELECT DISTINCT [id] FROM [warehouse].[dbo].[orders]",
        ),
        (
            "snowflake",
            "ANALYTICS",
            "PUBLIC",
            "ORDERS",
            "ID",
            'SELECT DISTINCT "ID" FROM "ANALYTICS"."PUBLIC"."ORDERS"',
        ),
        (
            "databricks",
            "main",
            "default",
            "ORDERS",
            "ID",
            "SELECT DISTINCT `ID` FROM `main`.`default`.`ORDERS`",
        ),
        (
            "unitycatalog",
            "main",
            "default",
            "ORDERS",
            "ID",
            "SELECT DISTINCT `ID` FROM `main`.`default`.`ORDERS`",
        ),
    ],
)
def test_keys_sql_per_dialect(
    stem: str, database: str, schema: str, table: str, key: str, expected: str
) -> None:
    fetcher = _fetcher(stem, FakeConnect([]))
    assert fetcher.keys_sql(database, schema, table, [key]) == expected


def test_keys_sql_multi_column_and_where_clause() -> None:
    fetcher = _fetcher("postgres", FakeConnect([]))
    assert fetcher.keys_sql(
        "warehouse", "public", "orders", ["id", "tenant"], where_clause="id > 0"
    ) == ('SELECT DISTINCT "id", "tenant" FROM "warehouse"."public"."orders" WHERE id > 0')


def test_fetch_keys_returns_tuples_and_records_sql() -> None:
    connect = FakeConnect([(1,), (2,)])
    fetcher = _fetcher("postgres", connect)
    assert fetcher.fetch_keys("warehouse", "public", "orders", ["id"]) == [(1,), (2,)]
    assert connect.executed == ['SELECT DISTINCT "id" FROM "warehouse"."public"."orders"']


def test_keys_sql_rejects_missing_database_for_three_part() -> None:
    fetcher = _fetcher("postgres", FakeConnect([]))
    with pytest.raises(WorkflowError, match="database is required"):
        fetcher.keys_sql(None, "public", "orders", ["id"])


def test_keys_sql_rejects_empty_key_columns() -> None:
    fetcher = _fetcher("postgres", FakeConnect([]))
    with pytest.raises(WorkflowError, match="key_columns are required"):
        fetcher.keys_sql("warehouse", "public", "orders", [])


def test_keys_sql_rejects_unsafe_identifier() -> None:
    fetcher = _fetcher("postgres", FakeConnect([]))
    with pytest.raises(WorkflowError, match="unsafe identifier"):
        fetcher.keys_sql("warehouse", "public", "orders", ["id; DROP TABLE orders"])


def test_build_side_per_connector() -> None:
    cases = [
        (
            "postgres",
            {
                "hostPort": "localhost:5432",
                "username": "ingest",
                "password": "secret",
                "database": "warehouse",
            },
            "warehouse",
            "Postgres",
            "postgres",
        ),
        (
            "mysql",
            {"hostPort": "localhost:3306", "username": "ingest", "password": "secret"},
            "warehouse",
            "Mysql",
            "mysql",
        ),
        (
            "mssql",
            {
                "hostPort": "localhost:1433",
                "username": "sa",
                "password": "secret",
                "database": "warehouse",
            },
            "warehouse",
            "Mssql",
            "mssql",
        ),
        (
            "snowflake",
            {
                "account": "xy12345",
                "username": "ingest",
                "warehouse": "COMPUTE_WH",
                "database": "ANALYTICS",
            },
            "ANALYTICS",
            "Snowflake",
            "snowflake",
        ),
        (
            "databricks",
            {
                "hostPort": "https://dbc.example.com",
                "httpPath": "/sql/1.0/warehouses/abc",
                "authType": {"token": "dapi"},
            },
            "main",
            "Databricks",
            None,
        ),
        (
            "unitycatalog",
            {
                "hostPort": "https://dbc.example.com",
                "httpPath": "/sql/1.0/warehouses/abc",
                "authType": {"token": "dapi"},
            },
            "main",
            "UnityCatalog",
            None,
        ),
    ]
    for stem, connection, database, expected_type, expected_dialect in cases:
        binding = datadiff_binding(stem)
        assert binding is not None
        schema = "default" if stem in {"snowflake", "databricks", "unitycatalog"} else "public"
        side = build_side(
            binding,
            connection,
            database=database,
            schema=schema,
            table="orders",
            key_columns=["id"],
        )
        assert side["type"] == expected_type
        assert side["keyColumns"] == ["id"]
        if expected_dialect is not None:
            assert side["dialect"] == expected_dialect
        if stem in {"databricks", "unitycatalog"}:
            assert side["catalog"] == "main"


def test_compare_key_sets() -> None:
    diff = compare_key_sets([(1,), (2,)], [(2,), (3,)])
    assert (diff.extra_left, diff.extra_right, diff.common, diff.total) == (1, 1, 1, 2)
    assert compare_key_sets([], []).total == 0
    # Duplicate keys in the input collapse: sets, not multisets.
    assert compare_key_sets([(1,), (1,)], [(1,)]).total == 0
