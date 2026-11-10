# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profiler window/hybrid metric family (Wave 3 serial point 6).

Percentile slots, IQR/NPS derivation, histogram binning and the
cardinalityDistribution CTE, driven through the live SqlProfileReader
against canned cursors — real predecessor values, never stub values.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.connectors import (
    mariadb_common,
    mysql_common,
    postgres_common,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    ProfileStatRow as PgProfileStatRow,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    SequenceProfileReader as PgSequenceProfileReader,
)
from smartmetadata_ingestion.connectors.postgres_profiler import PostgresProfilerInterface
from smartmetadata_ingestion.connectors.profile_sql import (
    _histogram_bins,
    format_large_string_numbers,
)


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


def _connect(cursor: FakeCursor):
    return lambda: FakeConnection(cursor)


def _postgres_script(
    *,
    score_row,
    label_row,
    score_unique=(1,),
    label_unique=(1,),
    histogram_rows=(3, 2),
    cardinality_rows=None,
):
    script = [
        ('GROUP BY "score"', [score_unique], None),
        ('GROUP BY "label"', [label_unique], None),
        ("SELECT COUNT(*) FROM", [(10,)], None),
        (
            "information_schema.columns",
            [("score", "integer"), ("label", "character varying")],
            None,
        ),
        ('COUNT(DISTINCT "score")', [score_row], None),
        ('COUNT(DISTINCT "label")', [label_row], None),
        ("COUNT(CASE WHEN", [histogram_rows], None),
    ]
    # The cardinality CTE contains GROUP BY <column>, so its needle must
    # precede the GROUP BY needles or the unique-count row wins.
    if cardinality_rows is not None:
        script.insert(0, ("WITH value_counts", cardinality_rows, None))
    return script


def test_percentile_slots_numeric_and_string() -> None:
    # Slot order: null, distinct, min, max, mean, values, nullMissing,
    # sum, stddev, median, firstQuartile, thirdQuartile, maxLength,
    # minLength.
    score_row = (0, 5, 1, 9, 5.0, 5, 0, 25, 3.0, 5, 3, 7, None, None)
    label_row = (0, 4, "a", "zz", None, 4, 0, 8, 1.0, 2, 1, 3, 2, 1)
    cursor = FakeCursor(_postgres_script(score_row=score_row, label_row=label_row))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    score, label = stats[1], stats[2]
    assert score.median == 5
    assert score.first_quartile == 3
    assert score.third_quartile == 7
    assert score.inter_quartile_range == 4
    assert score.non_parametric_skew == 0.0
    assert score.histogram == {
        "boundaries": ["1.000 to 5.678", "5.678 and up"],
        "frequencies": [3, 2],
    }
    assert score.cardinality_distribution is None
    # String column: median over the length, mean stays None (pre-existing
    # deviation), so NPS is None; all values unique, no CTE query runs.
    assert label.median == 2
    assert label.first_quartile == 1
    assert label.third_quartile == 3
    assert label.inter_quartile_range == 2
    assert label.non_parametric_skew is None
    assert label.histogram is None
    assert label.cardinality_distribution == {"allValuesUnique": True}
    assert not any("WITH value_counts" in sql for sql, _ in cursor.executed)
    score_sql = next(sql for sql, _ in cursor.executed if 'COUNT(DISTINCT "score")' in sql)
    assert 'percentile_cont(0.50) WITHIN GROUP (ORDER BY "score" ASC)' in score_sql
    assert 'percentile_cont(0.25) WITHIN GROUP (ORDER BY "score" ASC)' in score_sql
    assert 'percentile_cont(0.75) WITHIN GROUP (ORDER BY "score" ASC)' in score_sql
    label_sql = next(sql for sql, _ in cursor.executed if 'COUNT(DISTINCT "label")' in sql)
    assert (
        "percentile_cont(0.50) WITHIN GROUP "
        '(ORDER BY LENGTH(CAST("label" AS text)) ASC)' in label_sql
    )


def test_mysql_percentile_renders_row_number_subquery() -> None:
    score_row = (0, 5, 1, 9, 5.0, 5, 0, 25, 3.0, 5, 3, 7, None, None)
    cursor = FakeCursor(
        [
            ("GROUP BY `score`", [(1,)], None),
            ("SELECT COUNT(*) FROM", [(10,)], None),
            ("information_schema.columns", [("score", "int")], None),
            ("COUNT(DISTINCT `score`)", [score_row], None),
            ("COUNT(CASE WHEN", [(3, 2)], None),
        ]
    )
    reader = mysql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders")
    assert stats[1].median == 5
    assert stats[1].first_quartile == 3
    assert stats[1].third_quartile == 7
    sql = next(sql for sql, _ in cursor.executed if "COUNT(DISTINCT `score`)" in sql)
    assert "ROW_NUMBER() OVER (ORDER BY `score`)" in sql
    assert "ROUND(0.50 * temp.total_count)" in sql
    assert "FROM `mydb`.`orders`" in sql


def test_mariadb_percentile_slots_are_none_and_histogram_uses_sturges() -> None:
    # 11-value rows: MariaDB omits the three percentile slots.
    score_row = (0, 5, 1, 9, 5.0, 5, 0, 25, 3.0, None, None)
    label_row = (0, 4, "a", "zz", None, 4, 0, 8, 1.0, 2, 1)
    cursor = FakeCursor(
        [
            ("GROUP BY `score`", [(1,)], None),
            ("GROUP BY `label`", [(1,)], None),
            ("SELECT COUNT(*) FROM", [(10,)], None),
            ("information_schema.columns", [("score", "int"), ("label", "varchar")], None),
            ("COUNT(DISTINCT `score`)", [score_row], None),
            ("COUNT(DISTINCT `label`)", [label_row], None),
            # Sturges over 5 values: 4 bins.
            ("COUNT(CASE WHEN", [(2, 1, 1, 1)], None),
        ]
    )
    reader = mariadb_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders")
    assert stats[1].median is None
    assert stats[1].first_quartile is None
    assert stats[1].third_quartile is None
    assert stats[1].inter_quartile_range is None
    assert stats[1].non_parametric_skew is None
    assert stats[1].histogram == {
        "boundaries": [
            "1.000 to 3.000",
            "3.000 to 5.000",
            "5.000 to 7.000",
            "7.000 and up",
        ],
        "frequencies": [2, 1, 1, 1],
    }


def test_iqr_and_nps_missing_inputs_are_none() -> None:
    # Q3 missing -> IQR None; stddev 0 -> NPS None even with mean/median.
    score_row = (0, 5, 1, 9, 5.0, 5, 0, 25, 0.0, 5, 3, None, None, None)
    label_row = (0, 4, "a", "zz", None, 4, 0, 8, 1.0, 2, 1, 3, 2, 1)
    cursor = FakeCursor(
        _postgres_script(
            score_row=score_row,
            label_row=label_row,
            histogram_rows=(2, 1, 1, 1),
        )
    )
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    assert stats[1].inter_quartile_range is None
    assert stats[1].non_parametric_skew is None
    # IQR missing -> histogram falls back to Sturges (4 bins over 5 values).
    assert stats[1].histogram == {
        "boundaries": [
            "1.000 to 3.000",
            "3.000 to 5.000",
            "5.000 to 7.000",
            "7.000 and up",
        ],
        "frequencies": [2, 1, 1, 1],
    }


def test_histogram_bins_freedman_diaconis_sturges_and_cap() -> None:
    assert _histogram_bins(5, 10, 1, 10) == (2, pytest.approx(4.641588833612779))
    assert _histogram_bins(None, 10, 1, 10) == (5, pytest.approx(1.8))
    # IQR 0 -> width 1; (max-min)/1 = 0 bins -> the caller returns None.
    assert _histogram_bins(0, 10, 5, 5) == (0, 1.0)
    # Sturges over 100 -> capped at 100.
    assert _histogram_bins(0.01, 2**100, 0, 100) == (100, 1.0)


def test_format_large_string_numbers() -> None:
    assert format_large_string_numbers(0) == "0"
    assert format_large_string_numbers(999) == "999.000"
    assert format_large_string_numbers(2500) == "2.500K"
    assert format_large_string_numbers(1_000_000) == "1.000M"
    # Official magnitude is unclamped and labels 0.25 as "250.000T";
    # the port clamps it so small numbers render plain.
    assert format_large_string_numbers(0.25) == "0.250"
    assert format_large_string_numbers(10**15) == "1e15"


def test_histogram_returns_none_for_nan_bounds() -> None:
    score_row = (0, 5, float("nan"), float("nan"), 5.0, 5, 0, 25, 3.0, 5, 3, 7, None, None)
    label_row = (0, 4, "a", "zz", None, 4, 0, 8, 1.0, 2, 1, 3, 2, 1)
    # The canned histogram row is never consumed: NaN bounds return None
    # before any histogram query runs.
    cursor = FakeCursor(_postgres_script(score_row=score_row, label_row=label_row))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    assert stats[1].histogram is None


def test_cardinality_distribution_buckets_and_others() -> None:
    score_row = (0, 100, 1, 9, 5.0, 100, 0, 500, 3.0, 5, 3, 7, None, None)
    label_row = (0, 50, "a", "zz", None, 100, 0, 200, 1.0, 2, 1, 3, 2, 1)
    cardinality_rows = [("a", 40), ("b", 30), ("Others", 30)]
    cursor = FakeCursor(
        _postgres_script(
            score_row=score_row,
            label_row=label_row,
            histogram_rows=(20, 20, 20, 20, 20),
            cardinality_rows=cardinality_rows,
        )
    )
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    distribution = stats[2].cardinality_distribution
    assert distribution == {
        "categories": ["a", "b", "Others"],
        "counts": [40, 30, 30],
        "percentages": [40.0, 30.0, 30.0],
    }
    sql = next(sql for sql, _ in cursor.executed if "WITH value_counts" in sql)
    assert 'ROW_NUMBER() OVER (ORDER BY COUNT("label") DESC)' in sql
    assert "'Others'" in sql
    assert '"label" IS NOT NULL' in sql
    # 2% of 100 = threshold 2.0.
    assert "category_count >= 2.0" in sql


def test_cardinality_distribution_small_distinct_has_no_threshold() -> None:
    score_row = (0, 10, 1, 9, 5.0, 10, 0, 50, 3.0, 5, 3, 7, None, None)
    label_row = (0, 5, "a", "e", None, 10, 0, 10, 1.0, 2, 1, 3, 2, 1)
    cardinality_rows = [("a", 3), ("b", 2), ("c", 2), ("d", 2), ("e", 1)]
    cursor = FakeCursor(
        _postgres_script(
            score_row=score_row,
            label_row=label_row,
            histogram_rows=(5, 5),
            cardinality_rows=cardinality_rows,
        )
    )
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    distribution = stats[2].cardinality_distribution
    assert distribution == {
        "categories": ["a", "b", "c", "d", "e"],
        "counts": [3, 2, 2, 2, 1],
        "percentages": [30.0, 20.0, 20.0, 20.0, 10.0],
    }
    sql = next(sql for sql, _ in cursor.executed if "WITH value_counts" in sql)
    # Distinct <= 20 -> threshold 0, every category is kept.
    assert "category_count >= 0" in sql


def test_value_rank_never_lands_as_profile_field() -> None:
    reader = PgSequenceProfileReader(
        stats=[
            PgProfileStatRow(None, row_count=10),
            PgProfileStatRow(
                "score",
                median=5.0,
                first_quartile=3.0,
                third_quartile=7.0,
                inter_quartile_range=4.0,
                non_parametric_skew=0.0,
                histogram={"boundaries": ["1.000 to 5.678", "5.678 and up"], "frequencies": [3, 2]},
                cardinality_distribution={"allValuesUnique": True},
            ),
        ]
    )
    profile = PostgresProfilerInterface(reader).profile(
        service="warehouse",
        database="analytics",
        schema="public",
        table="orders",
        timestamp=1700000000000,
    )
    column = profile.column_profile[0]
    assert column["median"] == 5.0
    assert column["firstQuartile"] == 3.0
    assert column["thirdQuartile"] == 7.0
    assert column["interQuartileRange"] == 4.0
    assert column["nonParametricSkew"] == 0.0
    assert column["histogram"] == {
        "boundaries": ["1.000 to 5.678", "5.678 and up"],
        "frequencies": [3, 2],
    }
    assert column["cardinalityDistribution"] == {"allValuesUnique": True}
    assert "valueRank" not in column
