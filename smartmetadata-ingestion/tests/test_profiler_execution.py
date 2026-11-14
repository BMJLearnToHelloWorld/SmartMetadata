# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profiler execution: the reader honors resolved plans, and the workflow
isolates per-table failures, threads compute, enforces the timeout, and
fails loud on un-runnable configs.

Reader tests drive a real ``CursorProfileReader`` over a canned cursor
and assert on the SQL issued plus the built record; workflow tests drive
``run_workflow`` with sequence readers and an injected table fetcher.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime

import pytest

from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    SparkEngineConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    CursorProfileReader,
    ProfileStatRow,
)
from smartmetadata_ingestion.connectors.profile_sql import (
    CustomMetricRequest,
    PartitionFilter,
    ProfileOptions,
    build_profile_record,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
from smartmetadata_ingestion.errors import WorkflowError, WorkflowExecutionError
from smartmetadata_ingestion.profiler_plan import resolve_table_plan
from smartmetadata_ingestion.runner import run_workflow

_AGGREGATE_ROW = (0, 0, None, None, None, 0, 0, None, None, None, None, None, None, None)


class FakeCursor:
    """DB-API cursor serving canned rows keyed by SQL substring."""

    def __init__(self, script: list[tuple[str, list, list | None]]) -> None:
        self._script = [
            ("pg_total_relation_size", [(16384, datetime(2026, 1, 2, 3, 4, 5))], None),
            *script,
        ]
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

    def close(self):
        return None


class _Connection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def close(self):
        return None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _connect(cursor: FakeCursor):
    return lambda: _Connection(cursor)


def _empty_table_script() -> list[tuple[str, list, list | None]]:
    return [
        ('GROUP BY "id"', [(0,)], None),
        ('GROUP BY "name"', [(0,)], None),
        ("SELECT COUNT(*) FROM", [(0,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        ('COUNT(DISTINCT "id")', [_AGGREGATE_ROW], None),
        ('COUNT(DISTINCT "name")', [_AGGREGATE_ROW], None),
    ]


def _profile(
    cursor: FakeCursor, options: ProfileOptions | None = None
):
    reader = CursorProfileReader(_connect(cursor))
    stats = list(
        reader.profile_table("analytics", "public", "orders", options=options)
    )
    record = build_profile_record(
        stats,
        service="warehouse",
        database="analytics",
        schema="public",
        table="orders",
        timestamp=1_700_000_000_000,
        options=options,
    )
    return stats, record


def _sql_for(cursor: FakeCursor, needle: str) -> list[tuple[str, tuple]]:
    return [(sql, params) for sql, params in cursor.executed if needle in sql]


# --- reader: metric gating + toggles ---------------------------------------


def test_metrics_selection_limits_output_keys_and_queries() -> None:
    script = [
        ("SELECT COUNT(*) FROM", [(0,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        ('AVG("id")', [(5.0,)], None),
        ("SELECT NULL FROM", [(None,)], None),
    ]
    cursor = FakeCursor(script)
    _, record = _profile(cursor, ProfileOptions(metrics=frozenset({"mean"})))
    for entry in record.column_profile:
        assert set(entry) == {"name", "timestamp", "executionSource", "mean"}
    assert not _sql_for(cursor, "GROUP BY")


def test_per_column_metrics_filter_one_column_only() -> None:
    script = _empty_table_script() + [('AVG("id")', [(5.0,)], None)]
    cursor = FakeCursor(script)
    options = ProfileOptions(per_column_metrics={"id": frozenset({"mean"})})
    _, record = _profile(cursor, options)
    by_name = {entry["name"]: entry for entry in record.column_profile}
    assert set(by_name["id"]) == {"name", "timestamp", "executionSource", "mean"}
    assert "nullCount" in by_name["name"]


def test_composed_selection_writes_prerequisites_through_plan_path() -> None:
    # The plan path carries the closure, and the write-back carries the
    # effective set: selecting only distinctProportion writes its
    # prerequisites too (pin parity — the pin writes every computed
    # result without filtering back to the requested names), and computes
    # nothing outside the closure.
    script = [
        ("SELECT COUNT(*) FROM", [(10,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        ('COUNT(DISTINCT "id")', [(4, 10)], None),
        ('COUNT(DISTINCT "name")', [(2, 10)], None),
    ]
    cursor = FakeCursor(script)
    source = SourceConfig(
        type="postgres", service_name="warehouse", metrics=["distinctProportion"]
    )
    entity = {
        "columns": [
            {"name": "id", "dataType": "INT"},
            {"name": "name", "dataType": "VARCHAR"},
        ],
    }
    _, record = _profile(cursor, resolve_table_plan(source, entity, None).to_options())
    assert len(record.column_profile) == 2
    for entry in record.column_profile:
        assert set(entry) == {
            "name",
            "timestamp",
            "executionSource",
            "distinctCount",
            "valuesCount",
            "distinctProportion",
        }
    by_name = {entry["name"]: entry for entry in record.column_profile}
    assert by_name["id"]["distinctProportion"] == pytest.approx(0.4)
    assert by_name["name"]["distinctProportion"] == pytest.approx(0.2)
    assert not _sql_for(cursor, "AVG(")


def test_table_only_selection_writes_no_column_entries() -> None:
    # An uncataloged table falls back to the pipeline set, so a
    # table-only selection must skip the column query entirely — the
    # same outcome the plan resolver produces for cataloged tables —
    # instead of rendering an empty SELECT list.
    script = [
        ("SELECT COUNT(*) FROM", [(42,)], None),
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
    ]
    cursor = FakeCursor(script)
    _, record = _profile(cursor, ProfileOptions(metrics=frozenset({"rowCount"})))
    assert record.table_profile["rowCount"] == 42
    assert record.column_profile == []
    assert all("SELECT  FROM" not in sql for sql, _ in cursor.executed)


def test_value_rank_only_selection_writes_no_column_entries() -> None:
    # valueRank only ranks values inside the cardinality CTE; alone it
    # selects no column computation and must not crash the table.
    script = [
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
    ]
    cursor = FakeCursor(script)
    _, record = _profile(cursor, ProfileOptions(metrics=frozenset({"valueRank"})))
    assert record.column_profile == []
    assert record.table_profile.get("rowCount") is None
    assert all("SELECT  FROM" not in sql for sql, _ in cursor.executed)


def test_unique_count_only_selection_skips_empty_aggregate_select() -> None:
    # uniqueCount runs its own grouped query, outside the SELECT list:
    # selecting it alone must skip the empty aggregate SELECT and still
    # run the grouped query.
    script = [
        (
            "information_schema.columns",
            [("id", "integer"), ("name", "character varying")],
            None,
        ),
        ('GROUP BY "id"', [(3,)], None),
        ('GROUP BY "name"', [(7,)], None),
    ]
    cursor = FakeCursor(script)
    _, record = _profile(cursor, ProfileOptions(metrics=frozenset({"uniqueCount"})))
    by_name = {entry["name"]: entry for entry in record.column_profile}
    assert set(by_name["id"]) == {"name", "timestamp", "executionSource", "uniqueCount"}
    assert by_name["id"]["uniqueCount"] == 3
    assert by_name["name"]["uniqueCount"] == 7
    assert all("SELECT  FROM" not in sql for sql, _ in cursor.executed)


def test_table_metrics_off_skips_stats_and_counts() -> None:
    cursor = FakeCursor(_empty_table_script())
    _, record = _profile(cursor, ProfileOptions(compute_table_metrics=False))
    assert not _sql_for(cursor, "pg_total_relation_size")
    assert "rowCount" not in record.table_profile
    assert "columnCount" not in record.table_profile
    assert record.table_profile["sizeInByte"] is None
    assert len(record.column_profile) == 2


def test_column_metrics_off_writes_table_only() -> None:
    cursor = FakeCursor(_empty_table_script())
    _, record = _profile(cursor, ProfileOptions(compute_column_metrics=False))
    assert record.column_profile == []
    assert not _sql_for(cursor, "COUNT(DISTINCT")


def test_both_toggles_off_fails_loud() -> None:
    cursor = FakeCursor(_empty_table_script())
    with pytest.raises(WorkflowError, match="no profile data computed"):
        _profile(
            cursor,
            ProfileOptions(
                compute_table_metrics=False, compute_column_metrics=False
            ),
        )


def test_all_columns_filtered_with_table_metrics_off_fails_loud() -> None:
    cursor = FakeCursor(_empty_table_script())
    with pytest.raises(WorkflowError, match="no profile data computed"):
        _profile(
            cursor,
            ProfileOptions(
                compute_table_metrics=False,
                exclude_columns=frozenset({"id", "name"}),
            ),
        )


def test_empty_per_column_set_skips_column_entirely() -> None:
    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(per_column_metrics={"id": frozenset()})
    _, record = _profile(cursor, options)
    assert [entry["name"] for entry in record.column_profile] == ["name"]
    assert not _sql_for(cursor, 'COUNT(DISTINCT "id")')


# --- reader: partitions + sampling + profileQuery --------------------------


def test_time_unit_partition_predicate_is_bound() -> None:
    cursor = FakeCursor(_empty_table_script())
    cutoff = datetime(2026, 11, 11, 12, 0)
    options = ProfileOptions(
        partition=PartitionFilter(column="created_at", kind="time_unit", cutoff=cutoff)
    )
    _profile(cursor, options)
    aggregate = _sql_for(cursor, 'COUNT(DISTINCT "id")')
    assert aggregate
    sql, params = aggregate[0]
    assert '"created_at" >= %s' in sql
    assert cutoff in params


def test_integer_range_and_column_value_predicates_are_bound() -> None:
    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(
        partition=PartitionFilter(
            column="id", kind="integer_range", range_start=10, range_end=20
        )
    )
    _profile(cursor, options)
    sql, params = _sql_for(cursor, 'COUNT(DISTINCT "id")')[0]
    assert '"id" BETWEEN %s AND %s' in sql
    assert params[-2:] == (10, 20)

    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(
        partition=PartitionFilter(
            column="name", kind="column_value", values=("a", "b")
        )
    )
    _profile(cursor, options)
    sql, params = _sql_for(cursor, 'COUNT(DISTINCT "id")')[0]
    assert '"name" IN (%s, %s)' in sql
    assert params[-2:] == ("a", "b")


def test_sample_resolver_feeds_profile_sample_fields() -> None:
    seen: list[int] = []

    def _resolver(row_count: int):
        seen.append(row_count)
        return StaticSampleConfig(50)

    cursor = FakeCursor(_empty_table_script())
    _, record = _profile(cursor, ProfileOptions(sample_resolver=_resolver))
    assert seen == [0]
    assert record.table_profile["profileSample"] == 50
    assert record.table_profile["profileSampleType"] == "PERCENTAGE"


def test_unsampled_run_defaults_sample_type_to_percentage() -> None:
    cursor = FakeCursor(_empty_table_script())
    _, record = _profile(cursor, ProfileOptions())
    assert record.table_profile["profileSample"] is None
    assert record.table_profile["profileSampleType"] == "PERCENTAGE"


def test_randomized_row_count_sample_orders_randomly() -> None:
    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(
        sample_resolver=lambda _rc: StaticSampleConfig(100, sample_type="ROW_COUNT"),
        randomized=True,
    )
    _profile(cursor, options)
    assert any("RANDOM()" in sql for sql, _ in cursor.executed)

    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(
        sample_resolver=lambda _rc: StaticSampleConfig(100, sample_type="ROW_COUNT"),
    )
    _profile(cursor, options)
    assert not any("RANDOM()" in sql for sql, _ in cursor.executed)


def test_profile_query_defines_dataset_and_nulls_execution_source() -> None:
    script = _empty_table_script() + [
        (
            "SELECT id, name FROM orders",
            [],
            [("id",), ("name",), ("mystery",)],
        ),
        ('GROUP BY "mystery"', [(0,)], None),
        ('COUNT(DISTINCT "mystery")', [_AGGREGATE_ROW], None),
    ]
    cursor = FakeCursor(script)
    _, record = _profile(
        cursor, ProfileOptions(profile_query="SELECT id, name FROM orders")
    )
    aggregate = _sql_for(cursor, 'COUNT(DISTINCT "id")')[0][0]
    assert "(SELECT id, name FROM orders) AS _sample" in aggregate
    assert record.table_profile["executionSource"] is None
    by_name = {entry["name"]: entry for entry in record.column_profile}
    assert set(by_name) == {"id", "name", "mystery"}
    # The unknown column keeps no type, so its type-gated metrics are None.
    assert by_name["mystery"]["mean"] is None
    assert by_name["mystery"]["executionSource"] is None


def test_profile_query_with_no_columns_fails_loud() -> None:
    script = _empty_table_script() + [("SELECT 1", [], [])]
    cursor = FakeCursor(script)
    with pytest.raises(WorkflowError, match="no columns"):
        _profile(cursor, ProfileOptions(profile_query="SELECT 1"))


# --- reader: custom metrics + full shape -----------------------------------


def test_custom_metrics_evaluated_over_dataset() -> None:
    script = _empty_table_script() + [
        ("SELECT AVG(age) FROM", [(42.0,)], None),
        ("SELECT MAX(id) FROM", [(7,)], None),
    ]
    cursor = FakeCursor(script)
    options = ProfileOptions(
        custom_metrics=(
            CustomMetricRequest("avg_age", None, "AVG(age)"),
            CustomMetricRequest("max_id", "id", "MAX(id)"),
        )
    )
    _, record = _profile(cursor, options)
    assert record.table_profile["customMetrics"] == [
        {"name": "avg_age", "value": 42.0}
    ]
    by_name = {entry["name"]: entry for entry in record.column_profile}
    assert by_name["id"]["customMetrics"] == [{"name": "max_id", "value": 7.0}]
    assert "customMetrics" not in by_name["name"]


def test_custom_metric_bound_to_unprofiled_column_fails_loud() -> None:
    cursor = FakeCursor(_empty_table_script())
    options = ProfileOptions(
        custom_metrics=(CustomMetricRequest("x", "ghost", "COUNT(*)"),)
    )
    with pytest.raises(WorkflowError, match="not profiled"):
        _profile(cursor, options)


def test_full_shape_carries_stats_and_execution_source() -> None:
    cursor = FakeCursor(_empty_table_script())
    _, record = _profile(cursor, ProfileOptions())
    assert record.table_profile["sizeInByte"] == 16384
    assert record.table_profile["createDateTime"] == "2026-01-02T03:04:05"
    assert record.table_profile["executionSource"] == {
        "databaseName": "analytics",
        "schemaName": "public",
        "tableName": "orders",
    }
    assert record.profile_data == record.table_profile
    assert record.column_profile[0]["executionSource"] == {
        "databaseName": "analytics",
        "schemaName": "public",
        "tableName": "orders",
    }


# --- workflow --------------------------------------------------------------


class _StubClient:
    def __init__(self, settings=None) -> None:
        self._settings = settings

    def get_table_by_name(self, fqn, *, fields=None):
        return {}

    def get_profiler_config_settings(self):
        return self._settings


class _CollectingSink:
    def __init__(self) -> None:
        self.written: list = []

    def write(self, record) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None


class _TableReader:
    """ProfileReader double keyed by table name, with failure injection."""

    def __init__(self, *, fail_tables=frozenset(), delay=0.0) -> None:
        self._fail_tables = set(fail_tables)
        self._delay = delay
        self.seen: list[str] = []
        self.seen_options: dict[str, ProfileOptions | None] = {}
        self._lock = threading.Lock()
        self._active = 0
        self.max_active = 0

    def profile_table(
        self, database, schema, table, *, metric_params=None, sample_config=None, options=None
    ):
        with self._lock:
            self._active += 1
            self.max_active = max(self.max_active, self._active)
        try:
            if self._delay:
                time.sleep(self._delay)
            self.seen.append(table)
            self.seen_options[table] = options
            if table in self._fail_tables:
                raise RuntimeError(f"boom on {table}")
            return [
                ProfileStatRow(None, row_count=10, column_count=2),
                ProfileStatRow("id"),
                ProfileStatRow("name"),
            ]
        finally:
            with self._lock:
                self._active -= 1

    def sample_table(self, database, schema, table, *, limit=50):
        return []


def _workflow_config(table_names: list[str], source_overrides=None) -> WorkflowConfig:
    values: dict = {"type": "postgres", "service_name": "warehouse"}
    values.update(source_overrides or {})
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-profiler", type="profiler"),
        server=ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="jwt", jwt_token="<redacted>"),
        ),
        source=SourceConfig(**values),
    )


def _catalog_source(table_names: list[str]) -> PostgresSource:
    return PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"database": "analytics"},
        ),
        reader=SequenceCatalogReader(
            schemas=[SchemaRow("public")],
            tables=[TableRow("public", name, "BASE TABLE") for name in table_names],
            columns=[
                ColumnRow("public", name, "id", "integer", 1)
                for name in table_names
            ]
            + [
                ColumnRow("public", name, "name", "character varying", 2)
                for name in table_names
            ],
        ),
    )


def _run(table_names, *, reader, fetcher=None, client=None, source_overrides=None):
    sink = _CollectingSink()
    report = run_workflow(
        _workflow_config(table_names, source_overrides),
        client=client or _StubClient(),
        source=_catalog_source(table_names),
        sink=sink,
        profile_reader=reader,
        table_fetcher=fetcher,
    )
    return report, sink


def test_workflow_isolates_one_failure_and_passes_threshold() -> None:
    tables = ["t1", "t2", "t3", "t4", "t5"]
    reader = _TableReader(fail_tables={"t3"})
    report, sink = _run(tables, reader=reader, fetcher=lambda fqn: None)
    # The run passes the 80% threshold (no exception), but the report
    # still carries the isolated failure: ok() requires zero failures.
    assert report.succeeded == 4
    assert len(report.failures) == 1
    assert [record.fqn for record in sink.written] == [
        f"warehouse.analytics.public.{name}" for name in ("t1", "t2", "t4", "t5")
    ]


def test_workflow_below_threshold_raises_after_writing_successes() -> None:
    tables = ["t1", "t2", "t3", "t4", "t5"]
    reader = _TableReader(fail_tables={"t2", "t3"})
    sink = _CollectingSink()
    with pytest.raises(WorkflowExecutionError, match="3 of 5"):
        run_workflow(
            _workflow_config(tables),
            client=_StubClient(),
            source=_catalog_source(tables),
            sink=sink,
            profile_reader=reader,
            table_fetcher=lambda fqn: None,
        )
    assert len(sink.written) == 3


def test_workflow_fetch_failure_isolates_to_its_table() -> None:
    tables = ["t1", "t2", "t3", "t4", "t5"]

    def _fetcher(fqn):
        if fqn.endswith("t3"):
            raise RuntimeError("catalog down")
        return None

    reader = _TableReader()
    report, sink = _run(tables, reader=reader, fetcher=_fetcher)
    assert report.succeeded == 4
    assert len(report.failures) == 1
    assert len(sink.written) == 4
    assert "t3" not in reader.seen


def test_workflow_fetch_failure_majority_trips_threshold() -> None:
    # Four of five tables fail before compute: the denominator counts
    # them, so 1 of 5 trips the threshold instead of computing 1 of 1.
    # The one success is still written before the raise.
    tables = ["t1", "t2", "t3", "t4", "t5"]

    def _fetcher(fqn):
        if fqn.endswith("t1"):
            return None
        raise RuntimeError("catalog down")

    reader = _TableReader()
    sink = _CollectingSink()
    with pytest.raises(WorkflowExecutionError, match="1 of 5"):
        run_workflow(
            _workflow_config(tables),
            client=_StubClient(),
            source=_catalog_source(tables),
            sink=sink,
            profile_reader=reader,
            table_fetcher=_fetcher,
        )
    assert len(sink.written) == 1
    assert reader.seen == ["t1"]


def test_workflow_plan_failure_majority_trips_threshold() -> None:
    # A stored custom metric without an expression fails plan resolution
    # for its table only; a majority of such tables trips the threshold.
    tables = ["t1", "t2", "t3", "t4", "t5"]

    def _fetcher(fqn):
        if fqn.endswith("t1"):
            return None
        return {"customMetrics": [{"name": "broken"}]}

    reader = _TableReader()
    sink = _CollectingSink()
    with pytest.raises(WorkflowExecutionError, match="1 of 5"):
        run_workflow(
            _workflow_config(tables),
            client=_StubClient(),
            source=_catalog_source(tables),
            sink=sink,
            profile_reader=reader,
            table_fetcher=_fetcher,
        )
    assert len(sink.written) == 1
    assert reader.seen == ["t1"]


def test_workflow_filtered_tables_do_not_count_toward_threshold() -> None:
    # Two tables fetch-fail, one is classification-filtered, two succeed:
    # the denominator is 4 (the filtered table is scope, not failure), so
    # the raise counts 2 of 4 attempted tables, not 2 of 5 enumerated.
    tables = ["t1", "t2", "t3", "t4", "t5"]

    def _fetcher(fqn):
        name = fqn.rsplit(".", 1)[-1]
        if name in {"t4", "t5"}:
            raise RuntimeError("catalog down")
        tag = "Tier1" if name in {"t1", "t2"} else "Tier3"
        return {"tags": [{"tagFQN": f"Tier.{tag}", "name": tag}]}

    reader = _TableReader()
    sink = _CollectingSink()
    with pytest.raises(WorkflowExecutionError, match="2 of 4"):
        run_workflow(
            _workflow_config(tables, {"include_classifications": ["Tier1"]}),
            client=_StubClient(),
            source=_catalog_source(tables),
            sink=sink,
            profile_reader=reader,
            table_fetcher=_fetcher,
        )
    assert len(sink.written) == 2
    assert reader.seen == ["t1", "t2"]


def test_workflow_honors_classification_scope() -> None:
    entities = {
        "t1": {"tags": [{"tagFQN": "Tier.Tier1", "name": "Tier1"}]},
        "t2": {"tags": [{"tagFQN": "Tier.Tier3", "name": "Tier3"}]},
    }
    reader = _TableReader()
    report, sink = _run(
        ["t1", "t2"],
        reader=reader,
        fetcher=lambda fqn: entities[fqn.rsplit(".", 1)[-1]],
        source_overrides={"include_classifications": ["Tier1"]},
    )
    assert report.ok()
    assert reader.seen == ["t1"]
    assert len(sink.written) == 1


def test_workflow_global_config_disables_column() -> None:
    settings = {
        "configValue": {
            "metricConfiguration": [{"dataType": "INT", "disabled": True}],
        }
    }
    entity = {
        "columns": [
            {"name": "id", "dataType": "INT"},
            {"name": "name", "dataType": "VARCHAR"},
        ],
    }
    reader = _TableReader()
    report, sink = _run(
        ["t1"],
        reader=reader,
        fetcher=lambda fqn: entity,
        client=_StubClient(settings),
    )
    assert report.ok()
    assert [entry["name"] for entry in sink.written[0].column_profile] == ["name"]


def test_workflow_threads_compute() -> None:
    tables = ["t1", "t2", "t3", "t4"]
    reader = _TableReader(delay=0.2)
    report, sink = _run(
        tables, reader=reader, fetcher=lambda fqn: None,
        source_overrides={"thread_count": 4},
    )
    assert report.ok()
    assert len(sink.written) == 4
    assert reader.max_active > 1


def test_workflow_timeout_fails_the_table_not_the_run_shape() -> None:
    reader = _TableReader(delay=2.0)
    sink = _CollectingSink()
    with pytest.raises(WorkflowExecutionError, match="0 of 1"):
        run_workflow(
            _workflow_config(["t1"], {"timeout_seconds": 1}),
            client=_StubClient(),
            source=_catalog_source(["t1"]),
            sink=sink,
            profile_reader=reader,
            table_fetcher=lambda fqn: None,
        )
    assert sink.written == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"processing_engine": SparkEngineConfig(type="Spark", remote="x")},
        {"use_statistics": True},
        {"metrics": ["mean", "system"]},
        {"metrics": ["bogusMetric"]},
        {"timeout_seconds": 0},
    ],
)
def test_workflow_rejects_unrunnable_config_loudly(overrides) -> None:
    with pytest.raises(WorkflowError):
        _run(
            ["t1"],
            reader=_TableReader(),
            fetcher=lambda fqn: None,
            source_overrides=overrides,
        )


def test_workflow_writeback_carries_full_shape() -> None:
    class _ShapedReader(_TableReader):
        def profile_table(
            self, database, schema, table, *, metric_params=None, sample_config=None, options=None
        ):
            self.seen.append(table)
            return [
                ProfileStatRow(
                    None,
                    row_count=10,
                    column_count=2,
                    size_in_byte=16384,
                    create_date_time="2026-01-02T03:04:05Z",
                    profile_sample=50,
                    profile_sample_type="PERCENTAGE",
                    custom_metrics=[{"name": "avg_age", "value": 42.0}],
                ),
                ProfileStatRow("id"),
            ]

    report, sink = _run(["t1"], reader=_ShapedReader(), fetcher=lambda fqn: None)
    assert report.ok()
    record = sink.written[0]
    assert record.table_profile["sizeInByte"] == 16384
    assert record.table_profile["createDateTime"] == "2026-01-02T03:04:05Z"
    assert record.table_profile["profileSample"] == 50
    assert record.table_profile["profileSampleType"] == "PERCENTAGE"
    assert record.table_profile["customMetrics"] == [
        {"name": "avg_age", "value": 42.0}
    ]
    assert record.table_profile["executionSource"] == {
        "databaseName": "analytics",
        "schemaName": "public",
        "tableName": "t1",
    }
    assert record.profile_data == record.table_profile
