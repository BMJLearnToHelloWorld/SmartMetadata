# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the shared query-log base and the Postgres spec.

The DB-API seam is a fake connect factory: tests exercise the real SQL
formatting, window math, and row conversion, never a pre-aggregated
reader. Expectations come from design-sql-parsing §3.3.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.postgres_query_log import (
    POSTGRES_QUERY_LOG_SPEC,
    postgres_engines,
)
from smartmetadata_ingestion.connectors.postgres_usage import PostgresUsageSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.records import TableQueryRecord
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSource,
    QueryLogSpec,
    day_batches,
    fetch_rows,
    normalize_row,
    query_window,
    single_engine_provider,
)


class FakeCursor:
    def __init__(self, rows_by_statement: dict[str, list[tuple]], columns: list[str]):
        self._rows = rows_by_statement
        self._columns = columns
        self.statements: list[str] = []
        self.description = [(column, None) for column in columns]
        self._current: list[tuple] = []

    def execute(self, statement: str, *args: Any) -> None:
        self.statements.append(statement)
        for key, rows in self._rows.items():
            if key in statement:
                self._current = rows
                return
        self._current = []

    def fetchall(self) -> list[tuple]:
        return list(self._current)

    def close(self) -> None:
        return None


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def cursor(self) -> FakeCursor:
        return self._cursor


def _factory(cursor: FakeCursor):
    def connect():
        return FakeConnection(cursor)

    return connect


COLUMNS = ["query_text", "user_name", "start_time", "end_time", "duration", "cost"]


def _config(**overrides: Any) -> SourceConfig:
    payload: dict[str, Any] = {
        "type": "postgres-usage",
        "service_name": "svc",
        "connection": {"hostPort": "localhost:5432", "username": "u", "database": "db"},
    }
    payload.update(overrides)
    return SourceConfig.model_validate(payload)


def _generic_spec(**overrides: Any) -> QueryLogSpec:
    payload: dict[str, Any] = {
        "engine_key": "generic",
        "sql_template": (
            "SELECT * FROM history WHERE start_time >= '{start_time}' "
            "AND end_time < '{end_time}' {filters} LIMIT {result_limit}"
        ),
        "dialect": Dialect.ANSI,
    }
    payload.update(overrides)
    return QueryLogSpec(**payload)


def test_query_window_covers_duration_plus_today() -> None:
    start, end = query_window(1, today=date(2026, 11, 14))
    assert start.isoformat() == "2026-11-13T00:00:00+00:00"
    assert end.isoformat() == "2026-11-15T00:00:00+00:00"
    assert [b[0].date().isoformat() for b in day_batches(start, end)] == [
        "2026-11-13",
        "2026-11-14",
    ]


def test_query_window_clamps_to_engine_maximum() -> None:
    start, end = query_window(30, today=date(2026, 11, 14), max_duration_days=6)
    assert start.isoformat() == "2026-11-08T00:00:00+00:00"
    assert end.isoformat() == "2026-11-15T00:00:00+00:00"


def test_query_window_rejects_negative_duration() -> None:
    with pytest.raises(WorkflowError):
        query_window(-1, today=date(2026, 11, 14))


def test_filters_clause_joins_engine_and_user_predicates() -> None:
    source = QueryLogSource(
        _config(filterCondition="user_name <> 'admin'"),
        _generic_spec(filters="query_type = 'SELECT'"),
        lambda connection: _factory(FakeCursor({}, COLUMNS)),
        single_engine_provider,
    )
    assert source.filters_clause() == (
        " AND query_type = 'SELECT' AND (user_name <> 'admin')"
    )
    plain = QueryLogSource(
        _config(),
        _generic_spec(),
        lambda connection: _factory(FakeCursor({}, COLUMNS)),
        single_engine_provider,
    )
    assert plain.filters_clause() == ""


def test_postgres_statement_has_no_time_window() -> None:
    source = PostgresUsageSource(_config())
    statement = source.format_statement()
    assert "pg_stat_statements" in statement
    assert "LIMIT 1000" in statement
    # The row contract still carries start/end columns (NULL: the view
    # has no timestamps), but no window literal reaches the statement.
    assert "NULL AS start_time, NULL AS end_time" in statement
    assert "2026-" not in statement
    assert "{start_time}" not in statement


def test_postgres_statement_source_custom_view_and_rejection() -> None:
    custom = PostgresUsageSource(
        _config(connection={"queryStatementSource": "my_schema.custom_view"})
    )
    assert "my_schema.custom_view" in custom.format_statement()
    unsafe = PostgresUsageSource(
        _config(connection={"queryStatementSource": "pg_stat_statements; DROP TABLE t"})
    )
    with pytest.raises(WorkflowError):
        unsafe.format_statement()


def test_normalize_row_lowercases_keys_for_tuples_and_mappings() -> None:
    assert normalize_row(("SELECT 1", "alice"), ["QUERY_TEXT", "USER_NAME"]) == {
        "query_text": "SELECT 1",
        "user_name": "alice",
    }
    assert normalize_row({"QUERY_TEXT": "SELECT 1"}, ["query_text"]) == {
        "query_text": "SELECT 1"
    }


def test_fetch_rows_reads_through_cursor_protocol() -> None:
    cursor = FakeCursor(
        {"history": [("SELECT 1", "alice", None, None, 3.5, None)]}, COLUMNS
    )
    rows = fetch_rows(_factory(cursor), "SELECT * FROM history")
    assert rows == [
        {
            "query_text": "SELECT 1",
            "user_name": "alice",
            "start_time": None,
            "end_time": None,
            "duration": 3.5,
            "cost": None,
        }
    ]
    assert cursor.statements == ["SELECT * FROM history"]


def test_history_rows_become_table_query_records() -> None:
    cursor = FakeCursor(
        {
            "history": [
                (
                    "SELECT *\\nFROM t WHERE x = 1",
                    "alice",
                    "2026-11-13 10:00:00.000",
                    "2026-11-13 10:00:01.000",
                    "12.5",
                    "0.25",
                )
            ]
        },
        COLUMNS,
    )
    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    records = list(source.produce())
    assert len(records) == 1
    record = records[0]
    assert isinstance(record, TableQueryRecord)
    assert record.query == "SELECT *\nFROM t WHERE x = 1"
    assert record.user_name == "alice"
    assert record.analysis_date == "2026-11-13T10:00:00+00:00"
    assert record.duration == 12.5
    assert record.cost == 0.25
    assert record.dialect == "ansi"
    assert record.service_name == "svc"
    assert record.exclude_usage is False


def test_lifecycle_query_types_mark_exclude_usage() -> None:
    columns = COLUMNS + ["query_type"]
    cursor = FakeCursor(
        {
            "history": [
                ("CREATE TABLE t (a INT)", "alice", None, None, None, None, "create"),
                ("SELECT * FROM t", "alice", None, None, None, None, "SELECT"),
            ]
        },
        columns,
    )
    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(lifecycle_query_types=frozenset({"CREATE"})),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    records = list(source.produce())
    assert records[0].query_type == "create"
    assert records[0].exclude_usage is True
    assert records[1].exclude_usage is False


def test_lifecycle_query_types_match_exactly_not_by_family() -> None:
    # Exact match: a suffixed type does not match the bare verb, so
    # ALTER_TABLE and ALTER_SESSION are ordinary usage, not lifecycle.
    columns = COLUMNS + ["query_type"]
    cursor = FakeCursor(
        {
            "history": [
                ("ALTER TABLE t ADD COLUMN x INT", "alice", None, None, None, None, "ALTER"),
                ("ALTER TABLE t ADD COLUMN x INT", "alice", None, None, None, None, "ALTER_TABLE"),
                ("ALTER SESSION SET X = 1", "alice", None, None, None, None, "alter_session"),
                ("TRUNCATE TABLE t", "alice", None, None, None, None, "TRUNCATE"),
            ]
        },
        columns,
    )
    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(lifecycle_query_types=frozenset({"ALTER", "TRUNCATE_TABLE"})),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    records = list(source.produce())
    assert [record.exclude_usage for record in records] == [True, False, False, False]


def test_lifecycle_query_text_patterns_mark_exclude_usage() -> None:
    # Engines without a statement type match the query TEXT instead.
    columns = COLUMNS + ["query_type"]
    cursor = FakeCursor(
        {
            "history": [
                ("CREATE TABLE t (a INT)", "alice", None, None, None, None, None),
                ("INSERT INTO t VALUES (1)", "alice", None, None, None, None, None),
                ("SELECT * FROM t", "alice", None, None, None, None, None),
            ]
        },
        columns,
    )
    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(
            lifecycle_query_text_patterns=(
                re.compile(r".*\s*CREATE", re.IGNORECASE),
                re.compile(r".*\s*INSERT", re.IGNORECASE),
            )
        ),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    records = list(source.produce())
    assert [record.exclude_usage for record in records] == [True, True, False]


def test_malformed_rows_warn_and_skip_without_aborting() -> None:
    cursor = FakeCursor(
        {
            "history": [
                ("SELECT 1", "alice", None, None, None, None),
                (None, "bob", None, None, None, None),
                ("   ", "carol", None, None, None, None),
                ("SELECT 2", "dave", None, None, None, None),
            ]
        },
        COLUMNS,
    )
    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    records = list(source.produce())
    assert [record.query for record in records] == ["SELECT 1", "SELECT 2"]


def test_per_engine_failure_skips_engine_and_later_engines_run() -> None:
    good_cursor = FakeCursor(
        {"history": [("SELECT 1", "alice", None, None, None, None)]}, COLUMNS
    )

    def failing_factory():
        raise RuntimeError("connection refused")

    def provider(config, builder):
        return [("bad", failing_factory), ("good", _factory(good_cursor))]

    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(),
        lambda connection: _factory(good_cursor),
        provider,
    )
    records = list(source.produce())
    assert [record.query for record in records] == ["SELECT 1"]
    assert len(source.engine_failures) == 1
    assert source.engine_failures[0].startswith("bad:")


def test_all_engines_failing_raises_instead_of_silent_empty() -> None:
    def failing_factory():
        raise RuntimeError("connection refused")

    source = QueryLogSource(
        _config(queryLogDuration=0),
        _generic_spec(),
        lambda connection: failing_factory,
        lambda config, builder: [("only", failing_factory)],
    )
    with pytest.raises(WorkflowError, match="all 1 query-log engine"):
        list(source.produce())


def test_truncation_warning_logged_once_per_run(
    caplog: pytest.LogCaptureFixture,
) -> None:
    cursor = FakeCursor(
        {
            "history": [
                ("SELECT 1", "alice", None, None, None, None),
                ("SELECT 2", "bob", None, None, None, None),
            ]
        },
        COLUMNS,
    )
    source = QueryLogSource(
        _config(queryLogDuration=1, resultLimit=2),
        _generic_spec(),
        lambda connection: _factory(cursor),
        single_engine_provider,
        connect=_factory(cursor),
    )
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.query_log"):
        records = list(source.produce())
    assert len(records) == 4  # two days, two rows each
    warnings = [r for r in caplog.records if "resultLimit" in r.message]
    assert len(warnings) == 1


def test_result_limit_and_duration_validated() -> None:
    with pytest.raises(WorkflowError, match="resultLimit"):
        QueryLogSource(
            _config(resultLimit=0),
            _generic_spec(),
            lambda connection: _factory(FakeCursor({}, COLUMNS)),
            single_engine_provider,
        )
    with pytest.raises(WorkflowError, match="queryLogDuration"):
        QueryLogSource(
            _config(queryLogDuration=-1),
            _generic_spec(),
            lambda connection: _factory(FakeCursor({}, COLUMNS)),
            single_engine_provider,
        )


def test_csv_file_path_reads_queries_and_defaults_start_time(tmp_path) -> None:
    csv_file = tmp_path / "log.csv"
    csv_file.write_text(
        "query_text,user_name,start_time,end_time,duration,cost\n"
        "SELECT * FROM t,alice,2026-11-13 09:00:00.000,,5,\n"
        "SELECT * FROM u,bob,,,,,\n",
        encoding="utf-8",
    )
    source = PostgresUsageSource(
        _config(queryLogFilePath=str(csv_file)),
    )
    records = list(source.produce())
    assert [record.query for record in records] == ["SELECT * FROM t", "SELECT * FROM u"]
    assert records[0].analysis_date == "2026-11-13T09:00:00+00:00"
    assert records[1].analysis_date is not None
    assert records[0].dialect == "postgres"


def test_csv_aborted_parses_strings_not_truthiness(tmp_path) -> None:
    # CSV values are strings; bool("False") is True, so the parse
    # must be string-aware: only affirmative spellings abort.
    csv_file = tmp_path / "log.csv"
    csv_file.write_text(
        "query_text,aborted\n"
        "SELECT * FROM a,False\n"
        "SELECT * FROM b,True\n"
        "SELECT * FROM c,0\n"
        "SELECT * FROM d,1\n"
        "SELECT * FROM e,\n",
        encoding="utf-8",
    )
    source = PostgresUsageSource(_config(queryLogFilePath=str(csv_file)))
    records = list(source.produce())
    assert [record.aborted for record in records] == [False, True, False, True, False]


def test_csv_directory_reads_sorted_csv_files(tmp_path) -> None:
    (tmp_path / "b.csv").write_text(
        "query_text\nSELECT * FROM b\n", encoding="utf-8"
    )
    (tmp_path / "a.csv").write_text(
        "query_text\nSELECT * FROM a\n", encoding="utf-8"
    )
    (tmp_path / "notes.txt").write_text("not a csv\n", encoding="utf-8")
    source = PostgresUsageSource(_config(queryLogFilePath=str(tmp_path)))
    records = list(source.produce())
    assert [record.query for record in records] == ["SELECT * FROM a", "SELECT * FROM b"]


def test_csv_missing_path_raises() -> None:
    source = PostgresUsageSource(_config(queryLogFilePath="/nonexistent/log.csv"))
    with pytest.raises(WorkflowError, match="does not exist"):
        list(source.produce())


def test_postgres_source_reads_through_connect_override() -> None:
    cursor = FakeCursor(
        {
            "pg_stat_statements": [
                ("SELECT * FROM orders", "alice", None, None, 4.0, None)
            ]
        },
        COLUMNS,
    )
    source = PostgresUsageSource(_config(), connect=_factory(cursor))
    source.prepare()
    records = list(source.produce())
    assert len(records) == 1
    assert records[0].query == "SELECT * FROM orders"
    assert records[0].user_name == "alice"
    assert "pg_stat_statements" in cursor.statements[0]
    assert "LIMIT 1000" in cursor.statements[0]


def test_postgres_engines_enumerate_databases_when_ingesting_all() -> None:
    entry_cursor = FakeCursor(
        {"pg_database": [("db1",), ("db2",)]}, ["datname"]
    )
    built: list[dict] = []

    def builder(connection: dict):
        built.append(connection)
        return _factory(entry_cursor)

    engines = postgres_engines(
        _config(connection={"ingestAllDatabases": True, "database": "entry"}),
        builder,
    )
    assert [label for label, _ in engines] == ["db1", "db2"]
    assert [connection["database"] for connection in built[1:]] == ["db1", "db2"]


def test_postgres_engines_single_database_by_default() -> None:
    factory = _factory(FakeCursor({}, COLUMNS))
    engines = postgres_engines(_config(), lambda connection: factory)
    assert len(engines) == 1


def test_usage_parser_type_derives_auto_from_absent_config() -> None:
    source = PostgresUsageSource(_config())
    assert source.parser_type().value == "Auto"


def test_postgres_spec_registered() -> None:
    assert POSTGRES_QUERY_LOG_SPEC.engine_key == "postgres"
    assert POSTGRES_QUERY_LOG_SPEC.dialect is Dialect.POSTGRES
    assert POSTGRES_QUERY_LOG_SPEC.uses_time_window is False
