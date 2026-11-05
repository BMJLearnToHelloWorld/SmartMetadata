# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.connectors import (
    databricks_common,
    doris_common,
    greenplum_common,
    mariadb_common,
    mssql_common,
    mysql_common,
    postgres_common,
    redshift_common,
    snowflake_common,
    timescale_common,
)
from smartmetadata_ingestion.connectors.profile_sql import (
    is_numeric_type,
    quote_ansi,
    quote_mssql,
    quote_mysql,
)
from smartmetadata_ingestion.errors import WorkflowError


class FakeCursor:
    """DB-API cursor serving canned rows keyed by SQL substring."""

    def __init__(self, script: list[tuple[str, list, list | None]]) -> None:
        self._script = script
        self.executed: list[tuple[str, tuple]] = []
        self.description: list | None = None
        self._rows: list = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params or ()))
        for needle, rows, description in self._script:
            if needle in sql:
                self._rows = rows
                self.description = description
                return
        raise AssertionError(f"unexpected SQL: {sql}")

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def close(self) -> None:
        return None


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def cursor(self):
        return self._cursor


def _script(*, wrap, sample_needle: str = "SELECT * FROM") -> list:
    id_col = f"COUNT(DISTINCT {wrap('id')})"
    name_col = f"COUNT(DISTINCT {wrap('name')})"
    return [
        ("SELECT COUNT(*) FROM", [(10,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        (id_col, [(0, 10, "1", "10", 5.5)], None),
        (name_col, [(1, 9, "a", "z")], None),
        (sample_needle, [("1", "a"), ("2", "b")], [("id",), ("name",)]),
    ]


def _connect(cursor: FakeCursor):
    return lambda: FakeConnection(cursor)


def _assert_profile(stats, cursor: FakeCursor, *, ident: str) -> None:
    assert len(stats) == 3
    assert stats[0].column_name is None
    assert stats[0].row_count == 10
    assert stats[1].column_name == "id"
    assert stats[1].null_count == 0
    assert stats[1].distinct_count == 10
    assert stats[1].min_value == "1"
    assert stats[1].max_value == "10"
    assert stats[1].mean == 5.5
    assert stats[2].column_name == "name"
    assert stats[2].mean is None
    count_sql = next(sql for sql, _ in cursor.executed if sql.startswith("SELECT COUNT(*)"))
    assert ident in count_sql


def test_postgres_cursor_profile_reader() -> None:
    cursor = FakeCursor(_script(wrap=lambda name: f'"{name}"'))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    _assert_profile(stats, cursor, ident='"analytics"."public"."orders"')
    columns_sql, params = next(
        (sql, p) for sql, p in cursor.executed if "information_schema.columns" in sql
    )
    assert "%s" in columns_sql
    assert params == ("analytics", "public", "orders")
    samples = reader.sample_table("analytics", "public", "orders", limit=2)
    assert [row.values for row in samples] == [
        {"id": "1", "name": "a"},
        {"id": "2", "name": "b"},
    ]
    assert "LIMIT 2" in cursor.executed[-1][0]


def test_postgres_family_readers_share_dialect() -> None:
    for module in (greenplum_common, timescale_common, redshift_common):
        cursor = FakeCursor(_script(wrap=lambda name: f'"{name}"'))
        reader = module.CursorProfileReader(_connect(cursor))
        stats = reader.profile_table("analytics", "public", "orders")
        _assert_profile(stats, cursor, ident='"analytics"."public"."orders"')


def test_mysql_cursor_profile_reader() -> None:
    cursor = FakeCursor(_script(wrap=lambda name: f"`{name}`"))
    reader = mysql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders")
    _assert_profile(stats, cursor, ident="`mydb`.`orders`")
    _, params = next((sql, p) for sql, p in cursor.executed if "information_schema.columns" in sql)
    assert params == ("mydb", "orders")


def test_mysql_family_readers_share_dialect() -> None:
    for module in (mariadb_common, doris_common):
        cursor = FakeCursor(_script(wrap=lambda name: f"`{name}`"))
        reader = module.CursorProfileReader(_connect(cursor))
        stats = reader.profile_table("mydb", "orders")
        _assert_profile(stats, cursor, ident="`mydb`.`orders`")


def test_mssql_cursor_profile_reader() -> None:
    cursor = FakeCursor(_script(wrap=lambda name: f"[{name}]", sample_needle="SELECT TOP"))
    reader = mssql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("db", "dbo", "orders")
    _assert_profile(stats, cursor, ident="[db].[dbo].[orders]")
    columns_sql, params = next(
        (sql, p) for sql, p in cursor.executed if "information_schema.columns" in sql
    )
    assert "?" in columns_sql
    assert params == ("db", "dbo", "orders")
    samples = reader.sample_table("db", "dbo", "orders", limit=2)
    assert [row.values for row in samples] == [
        {"id": "1", "name": "a"},
        {"id": "2", "name": "b"},
    ]
    assert cursor.executed[-1][0].startswith("SELECT TOP (2) * FROM [db].[dbo].[orders]")


def test_snowflake_cursor_profile_reader() -> None:
    cursor = FakeCursor(_script(wrap=lambda name: f'"{name}"'))
    reader = snowflake_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("DB", "PUBLIC", "ORDERS")
    _assert_profile(stats, cursor, ident='"DB"."PUBLIC"."ORDERS"')


def test_databricks_cursor_profile_reader() -> None:
    cursor = FakeCursor(_script(wrap=lambda name: f"`{name}`"))
    reader = databricks_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("catalog", "default", "orders")
    _assert_profile(stats, cursor, ident="`catalog`.`default`.`orders`")
    columns_sql, params = next(
        (sql, p) for sql, p in cursor.executed if "information_schema.columns" in sql
    )
    assert "system.information_schema.columns" in columns_sql
    assert "?" in columns_sql
    assert params == ("catalog", "default", "orders")


def test_identifier_quoting_and_rejection() -> None:
    assert quote_ansi('a"b') == '"a""b"'
    assert quote_mysql("a`b") == "`a``b`"
    assert quote_mssql("a]b") == "[a]]b]"
    with pytest.raises(WorkflowError, match="unsafe identifier"):
        quote_ansi("a;b")


def test_numeric_type_detection() -> None:
    assert is_numeric_type("DOUBLE PRECISION")
    assert is_numeric_type("bigint")
    assert not is_numeric_type("character varying")
    assert not is_numeric_type(None)
