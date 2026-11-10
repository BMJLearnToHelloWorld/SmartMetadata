# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Wave 2 H track 2: the 21 (c) static / like / composed profiler metrics.

Covers the extended metric computation in ``profile_sql.SqlProfileReader``
across dialects (postgres / mysql / mssql / snowflake / databricks), the
parameter pass-through (bound parameters only, never interpolated), the
typed min/max write-back, the composed ratios, and the config channel from
``WorkflowConfig.profiler_metric_params`` through ``ProfilerWorkflow``.

ADR:2026-11-08-profiler-extended-metrics-static-like-composed
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import httpx
import pytest

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ProfilerMetricParamSpec,
    ServerConfig,
    SourceConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.connectors import (
    databricks_common,
    mssql_common,
    mysql_common,
    postgres_common,
    snowflake_common,
)
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    ProfileStatRow,
    SequenceProfileReader,
)
from smartmetadata_ingestion.connectors.postgres_profiler import (
    PostgresProfilerInterface,
)
from smartmetadata_ingestion.connectors.profile_sql import _typed_value
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.runner import run_workflow


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


# Base selects, in slot order: null, distinct, min, max, mean, values,
# nullMissing, sum, stddev, median, firstQuartile, thirdQuartile,
# maxLength, minLength.
ID_ROW = (0, 10, 1, 10, 5.5, 10, 0, 55, 2.87, 5.5, 3, 8, None, None)
NAME_ROW = (1, 9, "a", "z", None, 9, 1, 27, 1.5, 3, 2, 4, 5, 1)
# With all six parameterized metrics, in slot order: like, ilike, notLike,
# regex, notRegex, countInSet. (nullMissing 2 here: 1 null + 1 empty string.)
NAME_ROW_PARAMS = (1, 9, "a", "z", None, 9, 2, 27, 1.5, 3, 2, 4, 5, 1, 3, 3, 3, 3, 3, 3)
# MSSQL has no regex operator, so its SELECT has no regex/notRegex slots:
# 14 base + like, ilike, notLike, countInSet.
NAME_ROW_PARAMS_MSSQL = (1, 9, "a", "z", None, 9, 2, 27, 1.5, 3, 2, 4, 5, 1, 3, 3, 3, 3)
NAME_PARAMS = ("J%", "j%", "J%", "^J.*", "^J.*", "John", "Jane")


def _script(*, wrap, id_row=ID_ROW, name_row=NAME_ROW, id_unique=(1,), name_unique=(2,)):
    return [
        (f"GROUP BY {wrap('id')}", [id_unique], None),
        (f"GROUP BY {wrap('name')}", [name_unique], None),
        ("SELECT COUNT(*) FROM", [(10,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        (f"COUNT(DISTINCT {wrap('id')})", [id_row], None),
        (f"COUNT(DISTINCT {wrap('name')})", [name_row], None),
        # Histogram on the numeric column: IQR 5 over 10 values bins twice.
        ("COUNT(CASE WHEN", [(6, 4)], None),
    ]


def _main_sql(cursor: FakeCursor, needle: str) -> tuple[str, tuple]:
    return next((sql, p) for sql, p in cursor.executed if needle in sql)


def _assert_name_full(stats) -> None:
    name = stats[2]
    assert name.column_name == "name"
    assert name.values_count == 9
    assert name.null_missing_count == 2
    assert name.sum_value == 27
    assert name.stddev == 1.5
    assert name.max_length == 5
    assert name.min_length == 1
    assert name.like_count == 3
    assert name.ilike_count == 3
    # Official inverted CASE: notLike counts matching rows, like likeCount.
    assert name.not_like_count == 3
    assert name.regex_count == 3
    assert name.not_regex_count == 3
    assert name.count_in_set == 3
    assert name.unique_count == 2
    assert name.distinct_proportion == 1.0
    assert name.unique_proportion == pytest.approx(2 / 9)
    assert name.null_proportion == pytest.approx(0.1)
    assert name.duplicate_count == 0
    assert name.like_ratio == pytest.approx(1 / 3)
    assert name.ilike_ratio == pytest.approx(1 / 3)


def _name_params():
    return {
        "name": {
            "likeCount": {"expression": "J%"},
            "iLikeCount": {"expression": "j%"},
            "notLikeCount": {"expression": "J%"},
            "regexCount": {"expression": "^J.*"},
            "notRegexCount": {"expression": "^J.*"},
            "countInSet": {"values": ["John", "Jane"]},
        }
    }


def test_postgres_extended_metrics_with_params() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"', name_row=NAME_ROW_PARAMS))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders", metric_params=_name_params())
    assert len(stats) == 3
    table = stats[0]
    assert table.column_name is None
    assert table.row_count == 10
    assert table.column_count == 2
    assert table.column_names == ["id", "name"]
    id_stat = stats[1]
    assert id_stat.min_value == 1
    assert id_stat.max_value == 10
    assert id_stat.values_count == 10
    assert id_stat.unique_count == 1
    assert id_stat.distinct_proportion == 1.0
    assert id_stat.unique_proportion == 0.1
    assert id_stat.null_proportion == 0.0
    assert id_stat.duplicate_count == 0
    assert id_stat.like_count is None
    assert id_stat.like_ratio is None
    _assert_name_full(stats)
    sql, params = _main_sql(cursor, 'COUNT(DISTINCT "name")')
    assert "ILIKE" in sql
    assert '"name" ~ %s' in sql
    assert 'LENGTH(CAST("name" AS text))' in sql
    assert "STDDEV_POP" in sql
    assert params == NAME_PARAMS
    # No literal ever reaches the SQL text: everything is bound.
    assert "J%" not in sql
    assert "John" not in sql
    assert "^J" not in sql


def test_mysql_ilike_renders_like_and_regexp() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f"`{n}`", name_row=NAME_ROW_PARAMS))
    reader = mysql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("mydb", "orders", metric_params=_name_params())
    _assert_name_full(stats)
    sql, params = _main_sql(cursor, "COUNT(DISTINCT `name`)")
    assert "ILIKE" not in sql
    assert "`name` LIKE %s" in sql
    assert "`name` REGEXP %s" in sql
    assert "LENGTH(`name`)" in sql
    assert "STDDEV_POP" in sql
    assert params == NAME_PARAMS


def test_mssql_stddevp_len_like_and_no_regex() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f"[{n}]", name_row=NAME_ROW_PARAMS_MSSQL))
    reader = mssql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("db", "dbo", "orders", metric_params=_name_params())
    name = stats[2]
    assert name.like_count == 3
    assert name.ilike_count == 3
    assert name.not_like_count == 3
    # MSSQL has no regex operator: the metric resolves to None.
    assert name.regex_count is None
    assert name.not_regex_count is None
    assert name.count_in_set == 3
    assert name.like_ratio == pytest.approx(1 / 3)
    sql, params = _main_sql(cursor, "COUNT(DISTINCT [name])")
    assert "ILIKE" not in sql
    assert "REGEXP" not in sql
    assert "STDEVP(" in sql
    assert "LEN([name])" in sql
    # Only the supported metrics' params are bound, in slot order.
    assert params == ("J%", "j%", "J%", "John", "Jane")


def test_snowflake_regexp_like_ilike_len() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"', name_row=NAME_ROW_PARAMS))
    reader = snowflake_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("DB", "PUBLIC", "ORDERS", metric_params=_name_params())
    _assert_name_full(stats)
    sql, params = _main_sql(cursor, 'COUNT(DISTINCT "name")')
    assert "ILIKE" in sql
    assert 'REGEXP_LIKE("name", %s)' in sql
    assert 'LEN("name")' in sql
    assert "STDDEV_POP" in sql
    assert params == NAME_PARAMS


def test_databricks_regexp_like_length_qmark() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f"`{n}`", name_row=NAME_ROW_PARAMS))
    reader = databricks_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("catalog", "default", "orders", metric_params=_name_params())
    _assert_name_full(stats)
    sql, params = _main_sql(cursor, "COUNT(DISTINCT `name`)")
    assert "ILIKE" in sql
    assert "REGEXP_LIKE(`name`, ?)" in sql
    assert "LENGTH(`name`)" in sql
    assert params == NAME_PARAMS


def test_missing_params_resolve_to_none() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"'))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    name = stats[2]
    assert name.like_count is None
    assert name.ilike_count is None
    assert name.not_like_count is None
    assert name.regex_count is None
    assert name.not_regex_count is None
    assert name.count_in_set is None
    assert name.like_ratio is None
    assert name.ilike_ratio is None
    # Unparameterized metrics still compute.
    assert name.values_count == 9
    assert name.null_missing_count == 1
    assert name.max_length == 5


def test_invalid_params_raise() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"'))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    with pytest.raises(WorkflowError, match="unknown metric parameter"):
        reader.profile_table(
            "analytics",
            "public",
            "orders",
            metric_params={"name": {"likeRatio": {"expression": "J%"}}},
        )
    with pytest.raises(WorkflowError, match="requires a string expression"):
        reader.profile_table(
            "analytics",
            "public",
            "orders",
            metric_params={"name": {"likeCount": {"expression": 5}}},
        )
    with pytest.raises(WorkflowError, match="requires a non-empty values list"):
        reader.profile_table(
            "analytics",
            "public",
            "orders",
            metric_params={"name": {"countInSet": {"values": []}}},
        )
    with pytest.raises(WorkflowError, match="requires scalar values"):
        reader.profile_table(
            "analytics",
            "public",
            "orders",
            metric_params={"name": {"countInSet": {"values": [{"nested": 1}]}}},
        )
    with pytest.raises(WorkflowError, match="must be a mapping"):
        reader.profile_table(
            "analytics",
            "public",
            "orders",
            metric_params={"name": {"likeCount": "J%"}},
        )


def test_count_in_set_values_never_interpolated() -> None:
    evil = "x' OR '1'='1"
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"', name_row=NAME_ROW + (3,)))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table(
        "analytics",
        "public",
        "orders",
        metric_params={"name": {"countInSet": {"values": [evil, "Jane"]}}},
    )
    sql, params = _main_sql(cursor, 'COUNT(DISTINCT "name")')
    assert evil not in sql
    assert "IN (%s, %s)" in sql
    assert params == (evil, "Jane")
    assert stats[2].count_in_set == 3


def test_count_in_set_works_on_numeric_columns() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"', id_row=ID_ROW + (10,)))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table(
        "analytics",
        "public",
        "orders",
        metric_params={"id": {"countInSet": {"values": [1, 2]}}},
    )
    sql, params = _main_sql(cursor, 'COUNT(DISTINCT "id")')
    assert '"id" IN (%s, %s)' in sql
    assert params == (1, 2)
    assert stats[1].count_in_set == 10


def test_string_metrics_skipped_on_numeric_columns() -> None:
    cursor = FakeCursor(_script(wrap=lambda n: f'"{n}"'))
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table(
        "analytics",
        "public",
        "orders",
        metric_params={"id": {"likeCount": {"expression": "1%"}}},
    )
    # LIKE on a numeric column would fail the query; it resolves to None.
    assert stats[1].like_count is None
    assert stats[1].values_count == 10


def test_empty_table_ratios_are_none() -> None:
    cursor = FakeCursor(
        [
            ('GROUP BY "id"', [(0,)], None),
            ('GROUP BY "name"', [(0,)], None),
            ("SELECT COUNT(*) FROM", [(0,)], None),
            (
                "information_schema.columns",
                [("id", "integer"), ("name", "character varying")],
                None,
            ),
            (
                'COUNT(DISTINCT "id")',
                [(0, 0, None, None, None, 0, 0, None, None, None, None, None, None, None)],
                None,
            ),
            (
                'COUNT(DISTINCT "name")',
                [(0, 0, None, None, None, 0, 0, None, None, None, None, None, None, None)],
                None,
            ),
        ]
    )
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    assert stats[0].row_count == 0
    for stat in stats[1:]:
        assert stat.values_count == 0
        assert stat.distinct_proportion is None
        assert stat.unique_proportion is None
        assert stat.null_proportion is None
        assert stat.duplicate_count == 0
        assert stat.like_ratio is None
        # Empty table: no percentile, no IQR/NPS, no histogram, no
        # cardinality distribution — all resolve to None, never to a value.
        assert stat.median is None
        assert stat.first_quartile is None
        assert stat.third_quartile is None
        assert stat.inter_quartile_range is None
        assert stat.non_parametric_skew is None
        assert stat.histogram is None
        assert stat.cardinality_distribution is None


def test_mssql_deprecated_type_unique_count_skipped() -> None:
    cursor = FakeCursor(
        [
            ("SELECT COUNT(*) FROM", [(4,)], None),
            ("information_schema.columns", [("bio", "text")], None),
            (
                "COUNT(DISTINCT [bio])",
                [(0, 4, "a", "z", None, 4, 0, 12, 1.0, 3, 2, 4, 3, 1)],
                None,
            ),
        ]
    )
    reader = mssql_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("db", "dbo", "notes")
    assert stats[1].unique_count is None
    assert stats[1].values_count == 4
    # String column: length-median family; all values unique.
    assert stats[1].median == 3
    assert stats[1].first_quartile == 2
    assert stats[1].third_quartile == 4
    assert stats[1].inter_quartile_range == 2
    assert stats[1].cardinality_distribution == {"allValuesUnique": True}


def test_typed_min_max_normalization() -> None:
    assert _typed_value(3) == 3
    assert _typed_value(2.5) == 2.5
    assert _typed_value("abc") == "abc"
    assert _typed_value(Decimal("12.5")) == 12.5
    assert _typed_value(datetime.date(2026, 11, 8)) == "2026-11-08"
    assert _typed_value(datetime.datetime(2026, 11, 8, 9, 30)) == "2026-11-08T09:30:00"
    assert _typed_value(b"bytes") == "bytes"
    assert _typed_value(None) is None


def test_typed_min_max_through_reader() -> None:
    cursor = FakeCursor(
        [
            ('GROUP BY "id"', [(1,)], None),
            ("SELECT COUNT(*) FROM", [(2,)], None),
            ("information_schema.columns", [("id", "numeric")], None),
            (
                'COUNT(DISTINCT "id")',
                [
                    (
                        0,
                        2,
                        Decimal("1.5"),
                        Decimal("9.25"),
                        Decimal("5.375"),
                        2,
                        0,
                        Decimal("10.75"),
                        Decimal("3.9"),
                        Decimal("5.375"),
                        Decimal("3.0"),
                        Decimal("7.0"),
                        None,
                        None,
                    )
                ],
                None,
            ),
            # Histogram: IQR 4 over 2 values bins twice.
            ("COUNT(CASE WHEN", [(1, 1)], None),
        ]
    )
    reader = postgres_common.CursorProfileReader(_connect(cursor))
    stats = reader.profile_table("analytics", "public", "orders")
    assert stats[1].min_value == 1.5
    assert stats[1].max_value == 9.25
    assert stats[1].mean == 5.375
    assert stats[1].sum_value == 10.75
    assert stats[1].median == 5.375
    assert stats[1].first_quartile == 3.0
    assert stats[1].third_quartile == 7.0
    assert stats[1].inter_quartile_range == 4.0
    assert stats[1].histogram == {
        "boundaries": ["1.500 to 7.850", "7.850 and up"],
        "frequencies": [1, 1],
    }


def test_interface_maps_extended_keys() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=10, column_count=2, column_names=["id", "name"]),
            ProfileStatRow(
                "id",
                null_count=0,
                distinct_count=10,
                min_value=1,
                max_value=10,
                mean=5.5,
                values_count=10,
                count_in_set=2,
                max_length=None,
                min_length=None,
                stddev=2.87,
                sum_value=55,
                unique_count=1,
                null_missing_count=0,
                distinct_proportion=1.0,
                unique_proportion=0.1,
                null_proportion=0.0,
                duplicate_count=0,
            ),
        ]
    )
    interface = PostgresProfilerInterface(reader)
    profile = interface.profile(
        service="warehouse",
        database="analytics",
        schema="public",
        table="orders",
        timestamp=1700000000000,
    )
    assert profile.table_profile["columnCount"] == 2
    # columnNames has no server field (official drops it at TableProfile).
    assert "columnNames" not in profile.table_profile
    column = profile.column_profile[0]
    assert column["valuesCount"] == 10
    assert column["countInSet"] == 2
    assert column["likeCount"] is None
    assert column["stddev"] == 2.87
    assert column["sum"] == 55
    assert column["uniqueCount"] == 1
    assert column["nullMissingCount"] == 0
    assert column["distinctProportion"] == 1.0
    assert column["uniqueProportion"] == 0.1
    assert column["nullProportion"] == 0.0
    assert column["duplicateCount"] == 0
    # Wave 3 serial point 6 keys land with None for a row that carries none.
    assert column["median"] is None
    assert column["firstQuartile"] is None
    assert column["thirdQuartile"] is None
    assert column["interQuartileRange"] is None
    assert column["nonParametricSkew"] is None
    assert column["histogram"] is None
    assert column["cardinalityDistribution"] is None
    # valueRank has no ColumnProfile field; system is not in this batch.
    assert "valueRank" not in column
    assert "system" not in column


def test_wave3_metric_attributes_on_stat_row() -> None:
    row = ProfileStatRow("id")
    for attr in (
        "median",
        "first_quartile",
        "third_quartile",
        "histogram",
        "cardinality_distribution",
        "inter_quartile_range",
        "non_parametric_skew",
    ):
        assert hasattr(row, attr)
    # valueRank has no ColumnProfile field; system is not in this batch.
    for attr in ("value_rank", "system"):
        assert not hasattr(row, attr)


class _RecordingReader:
    """ProfileReader double recording the metric params it receives."""

    def __init__(self, stats) -> None:
        self._stats = list(stats)
        self.seen_metric_params = None
        self.seen_sample_config = None

    def profile_table(self, database, schema, table, *, metric_params=None, sample_config=None):
        self.seen_metric_params = metric_params
        self.seen_sample_config = sample_config
        return self._stats

    def sample_table(self, database, schema, table, *, limit=50):
        return []


class _CollectingSink:
    def __init__(self) -> None:
        self.written: list = []

    def write(self, record) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None


def _config(*, metric_params=None) -> WorkflowConfig:
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-profiler", type="profiler"),
        server=ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="jwt", jwt_token="<redacted>"),
        ),
        source=SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"database": "analytics"},
            include_schemas=["public"],
        ),
        profiler_metric_params=metric_params or [],
    )


def _postgres_source() -> PostgresSource:
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("public")],
        tables=[TableRow("public", "orders", "BASE TABLE")],
        columns=[
            ColumnRow("public", "orders", "id", "integer", 1),
            ColumnRow("public", "orders", "name", "character varying", 2),
        ],
    )
    return PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"database": "analytics"},
        ),
        reader=reader,
    )


def test_workflow_threads_config_params_to_reader() -> None:
    recording = _RecordingReader(
        [
            ProfileStatRow(None, row_count=10),
            ProfileStatRow("id"),
            ProfileStatRow("name"),
        ]
    )
    config = _config(
        metric_params=[
            ProfilerMetricParamSpec(column="name", like_count="J%", count_in_set=["John", "Jane"]),
        ]
    )
    report = run_workflow(
        config,
        client=RestClient(
            config.server,
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
        ),
        source=_postgres_source(),
        sink=_CollectingSink(),
        profile_reader=recording,
    )
    assert report.ok()
    assert recording.seen_metric_params == {
        "name": {
            "likeCount": {"expression": "J%"},
            "countInSet": {"values": ["John", "Jane"]},
        }
    }
    assert recording.seen_sample_config is None


def test_config_parses_camel_case_keys_and_rejects_empty_entry() -> None:
    config = WorkflowConfig.model_validate(
        {
            "workflow": {"name": "p", "type": "profiler"},
            "server": {
                "hostPort": "http://catalog.test/api",
                "auth": {"type": "jwt", "jwtToken": "x"},
            },
            "source": {"type": "postgres", "serviceName": "warehouse"},
            "profilerMetricParams": [{"column": "name", "likeCount": "J%", "countInSet": ["John"]}],
        }
    )
    assert config.profiler_metric_params[0].like_count == "J%"
    assert config.profiler_metric_params[0].count_in_set == ["John"]
    with pytest.raises(ValueError, match="at least one metric param"):
        ProfilerMetricParamSpec(column="name")
    with pytest.raises(ValueError, match="column is required"):
        ProfilerMetricParamSpec(column="  ", like_count="J%")
