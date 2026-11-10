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


def _script(
    *,
    wrap,
    sample_needle: str = "SELECT * FROM",
    percentiles: bool = True,
    histogram_frequencies: tuple[int, ...] = (6, 4),
) -> list:
    id_col = f"COUNT(DISTINCT {wrap('id')})"
    name_col = f"COUNT(DISTINCT {wrap('name')})"
    # Base selects, in slot order: null, distinct, min, max, mean,
    # values, nullMissing, sum, stddev, median, firstQuartile,
    # thirdQuartile, maxLength, minLength. MariaDB has no official
    # percentile compile, so its rows omit the three percentile slots.
    id_row = (0, 10, 1, 10, 5.5, 10, 0, 55, 2.87, 5.5, 3, 8, None, None)
    name_row = (1, 9, "a", "z", None, 9, 1, 27, 1.5, 3, 2, 4, 5, 1)
    if not percentiles:
        id_row = (0, 10, 1, 10, 5.5, 10, 0, 55, 2.87, None, None)
        name_row = (1, 9, "a", "z", None, 9, 1, 27, 1.5, 5, 1)
    return [
        (f"GROUP BY {wrap('id')}", [(1,)], None),
        (f"GROUP BY {wrap('name')}", [(1,)], None),
        ("SELECT COUNT(*) FROM", [(10,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        (id_col, [id_row], None),
        (name_col, [name_row], None),
        ("COUNT(CASE WHEN", [histogram_frequencies], None),
        (sample_needle, [("1", "a"), ("2", "b")], [("id",), ("name",)]),
    ]


def _connect(cursor: FakeCursor):
    return lambda: FakeConnection(cursor)


def _assert_profile(stats, cursor: FakeCursor, *, ident: str, window: bool = True) -> None:
    assert len(stats) == 3
    assert stats[0].column_name is None
    assert stats[0].row_count == 10
    assert stats[0].column_count == 2
    assert stats[0].column_names == ["id", "name"]
    assert stats[1].column_name == "id"
    assert stats[1].null_count == 0
    assert stats[1].distinct_count == 10
    # min/max are written back typed now, not stringified.
    assert stats[1].min_value == 1
    assert stats[1].max_value == 10
    assert stats[1].mean == 5.5
    assert stats[1].values_count == 10
    assert stats[1].null_missing_count == 0
    assert stats[1].sum_value == 55
    assert stats[1].stddev == 2.87
    assert stats[1].max_length is None
    assert stats[1].min_length is None
    assert stats[1].unique_count == 1
    assert stats[1].distinct_proportion == 1.0
    assert stats[1].unique_proportion == 0.1
    assert stats[1].null_proportion == 0.0
    assert stats[1].duplicate_count == 0
    assert stats[1].like_ratio is None
    assert stats[2].column_name == "name"
    assert stats[2].mean is None
    assert stats[2].values_count == 9
    assert stats[2].null_missing_count == 1
    assert stats[2].sum_value == 27
    assert stats[2].stddev == 1.5
    assert stats[2].max_length == 5
    assert stats[2].min_length == 1
    assert stats[2].unique_count == 1
    assert stats[2].distinct_proportion == 1.0
    assert stats[2].unique_proportion == pytest.approx(1 / 9)
    assert stats[2].null_proportion == pytest.approx(0.1)
    assert stats[2].duplicate_count == 0
    if window:
        # Window family: median/Q1/Q3, IQR, NPS, histogram on the numeric
        # column; length-median family and allValuesUnique cardinality on
        # the string column (mean is None there, so NPS is None).
        assert stats[1].median == 5.5
        assert stats[1].first_quartile == 3
        assert stats[1].third_quartile == 8
        assert stats[1].inter_quartile_range == 5
        assert stats[1].non_parametric_skew == 0.0
        assert stats[1].histogram == {
            "boundaries": ["1.000 to 5.642", "5.642 and up"],
            "frequencies": [6, 4],
        }
        assert stats[1].cardinality_distribution is None
        assert stats[2].median == 3
        assert stats[2].first_quartile == 2
        assert stats[2].third_quartile == 4
        assert stats[2].inter_quartile_range == 2
        assert stats[2].non_parametric_skew is None
        assert stats[2].histogram is None
        assert stats[2].cardinality_distribution == {"allValuesUnique": True}
    else:
        # MariaDB has no official percentile compile: the three slots stay
        # None, so the histogram falls back to Sturges bins (5 bins here).
        assert stats[1].median is None
        assert stats[1].first_quartile is None
        assert stats[1].third_quartile is None
        assert stats[1].inter_quartile_range is None
        assert stats[1].non_parametric_skew is None
        assert stats[1].histogram == {
            "boundaries": [
                "1.000 to 2.800",
                "2.800 to 4.600",
                "4.600 to 6.400",
                "6.400 to 8.200",
                "8.200 and up",
            ],
            "frequencies": [2, 3, 1, 2, 2],
        }
        assert stats[1].cardinality_distribution is None
        assert stats[2].median is None
        assert stats[2].first_quartile is None
        assert stats[2].third_quartile is None
        assert stats[2].inter_quartile_range is None
        assert stats[2].non_parametric_skew is None
        assert stats[2].histogram is None
        assert stats[2].cardinality_distribution == {"allValuesUnique": True}
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
    # Doris has the official percentile_approx compile; MariaDB has none
    # and fails closed on the three percentile slots (its histogram falls
    # back to Sturges bins).
    cursor = FakeCursor(_script(wrap=lambda name: f"`{name}`"))
    reader = doris_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders")
    _assert_profile(stats, cursor, ident="`mydb`.`orders`")
    cursor = FakeCursor(
        _script(
            wrap=lambda name: f"`{name}`",
            percentiles=False,
            histogram_frequencies=(2, 3, 1, 2, 2),
        )
    )
    reader = mariadb_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders")
    _assert_profile(stats, cursor, ident="`mydb`.`orders`", window=False)


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
