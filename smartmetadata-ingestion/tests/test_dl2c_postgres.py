# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Tests for the Postgres/Timescale ``dbid`` alignment (design §5.3).

``pg_stat_statements`` is a cross-database view, so the history
statement joins each row's ``dbid`` to ``pg_database`` for the
database name instead of stamping every row with the reading
connection's database. TimescaleDB reuses the same template and
engine provider, so the same change covers it. The multi-engine
``dbid`` filter is applied conditionally on ``ingestAllDatabases``
through the query-log base's connection-dependent filter hook;
the predicate text itself is frozen here and the single-engine
statement is locked filter-free.
"""

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.postgres_query_log import (
    POSTGRES_DBID_FILTER,
    POSTGRES_QUERY_LOG_SPEC,
    POSTGRES_SQL_TEMPLATE,
    STATEMENT_SOURCE_PATTERN,
    postgres_dbid_filter,
    postgres_engines,
)
from smartmetadata_ingestion.connectors.postgres_usage import PostgresUsageSource
from smartmetadata_ingestion.connectors.timescale_query_log import (
    TIMESCALE_QUERY_LOG_SPEC,
    timescale_engines,
)
from smartmetadata_ingestion.connectors.timescale_usage import TimescaleUsageSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TableQueryRecord
from smartmetadata_ingestion.usage.query_log import QueryLogSource

COLUMNS = [
    "query_text",
    "user_name",
    "start_time",
    "end_time",
    "duration",
    "cost",
    "query_type",
    "aborted",
    "database_name",
    "schema_name",
]


class FakeCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows
        self.statements: list[str] = []
        self.description = [(column, None) for column in COLUMNS]

    def execute(self, statement: str, *args: Any) -> None:
        self.statements.append(statement)

    def fetchall(self) -> list[tuple]:
        return list(self._rows)

    def close(self) -> None:
        return None


class FakeConnection:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def cursor(self) -> Any:
        return self._cursor


def _factory(cursor: Any):
    def connect():
        return FakeConnection(cursor)

    return connect


def _config(source_type: str = "postgres-usage", **overrides: Any) -> SourceConfig:
    payload: dict[str, Any] = {
        "type": source_type,
        "service_name": "svc",
        "connection": {"hostPort": "localhost:5432", "username": "u", "database": "db"},
    }
    payload.update(overrides)
    return SourceConfig.model_validate(payload)


def _history_row(query: str, database_name: str | None) -> tuple:
    return (query, "alice", None, None, 4.0, None, None, False, database_name, None)


def test_postgres_template_joins_pg_database_on_dbid() -> None:
    assert "JOIN pg_catalog.pg_database d ON s.dbid = d.oid" in POSTGRES_SQL_TEMPLATE
    assert "d.datname AS database_name" in POSTGRES_SQL_TEMPLATE
    assert "NULL AS schema_name" in POSTGRES_SQL_TEMPLATE
    assert "FROM {query_statement_source} s" in POSTGRES_SQL_TEMPLATE
    assert "LEFT JOIN pg_roles r ON r.oid = s.userid" in POSTGRES_SQL_TEMPLATE
    # No remnant of the connection-stamped name: the template must
    # not derive the database segment from the reading connection.
    assert "current_database()" not in POSTGRES_SQL_TEMPLATE


def test_postgres_database_name_has_a_single_dbid_source() -> None:
    # One derivation, from the row's own dbid: the same dbid read
    # from any engine necessarily yields the same database name.
    assert POSTGRES_SQL_TEMPLATE.count("AS database_name") == 1
    assert POSTGRES_SQL_TEMPLATE.count("dbid") == 1


def test_postgres_dbid_filter_text() -> None:
    assert POSTGRES_DBID_FILTER == (
        "s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())"
    )


@pytest.mark.parametrize(
    ("connection", "expected"),
    [
        ({}, ""),
        ({"ingestAllDatabases": None}, ""),
        ({"ingestAllDatabases": False}, ""),
        ({"ingestAllDatabases": True}, POSTGRES_DBID_FILTER),
    ],
)
def test_postgres_dbid_filter_applies_only_when_ingesting_all_databases(
    connection: dict[str, Any], expected: str
) -> None:
    assert postgres_dbid_filter(connection) == expected


def test_single_engine_statement_has_no_dbid_filter() -> None:
    cursor = FakeCursor([_history_row("SELECT * FROM orders", "appdb")])
    source = PostgresUsageSource(_config(), connect=_factory(cursor))
    records = list(source.produce())
    assert len(cursor.statements) == 1
    statement = cursor.statements[0]
    assert "JOIN pg_catalog.pg_database d ON s.dbid = d.oid" in statement
    assert POSTGRES_DBID_FILTER not in statement
    assert records[0].database_name == "appdb"


def test_history_rows_keep_their_own_database_names() -> None:
    cursor = FakeCursor(
        [
            _history_row("SELECT * FROM a", "appdb"),
            _history_row("SELECT * FROM b", "otherdb"),
        ]
    )
    source = PostgresUsageSource(_config(), connect=_factory(cursor))
    records = list(source.produce())
    assert [record.database_name for record in records] == ["appdb", "otherdb"]
    assert all(isinstance(record, TableQueryRecord) for record in records)
    assert all(record.database_schema is None for record in records)


def test_timescale_reuses_postgres_template_and_engines() -> None:
    assert TIMESCALE_QUERY_LOG_SPEC.sql_template is POSTGRES_SQL_TEMPLATE
    assert timescale_engines is postgres_engines
    assert TIMESCALE_QUERY_LOG_SPEC.statement_source_pattern is STATEMENT_SOURCE_PATTERN
    # Both specs wire the same filter function object: Timescale's
    # multi-engine statements carry the dbid predicate through the
    # identical hook, not a copy of it.
    assert TIMESCALE_QUERY_LOG_SPEC.conditional_filters is postgres_dbid_filter
    assert POSTGRES_QUERY_LOG_SPEC.conditional_filters is postgres_dbid_filter
    cursor = FakeCursor([_history_row("SELECT * FROM orders", "appdb")])
    source = TimescaleUsageSource(
        _config("timescale-usage"), connect=_factory(cursor)
    )
    records = list(source.produce())
    assert "JOIN pg_catalog.pg_database d ON s.dbid = d.oid" in cursor.statements[0]
    assert records[0].database_name == "appdb"


def test_statement_source_pattern_unchanged() -> None:
    assert POSTGRES_QUERY_LOG_SPEC.statement_source_key == "queryStatementSource"
    assert POSTGRES_QUERY_LOG_SPEC.statement_source_default == "pg_stat_statements"
    assert POSTGRES_QUERY_LOG_SPEC.statement_source_pattern is STATEMENT_SOURCE_PATTERN
    assert POSTGRES_QUERY_LOG_SPEC.uses_time_window is False
    assert POSTGRES_QUERY_LOG_SPEC.max_duration_days == 6
    assert STATEMENT_SOURCE_PATTERN.fullmatch("pg_stat_statements") is not None
    assert STATEMENT_SOURCE_PATTERN.fullmatch("my_schema.my_view") is not None
    assert STATEMENT_SOURCE_PATTERN.fullmatch('"weird name".stats') is not None
    assert STATEMENT_SOURCE_PATTERN.fullmatch("pg_stat_statements; DROP TABLE t") is None
    assert STATEMENT_SOURCE_PATTERN.fullmatch("a b") is None
    assert STATEMENT_SOURCE_PATTERN.fullmatch("") is None


def test_custom_source_without_dbid_fails_loudly() -> None:
    class RaisingCursor:
        def __init__(self) -> None:
            self.statements: list[str] = []

        def execute(self, statement: str, *args: Any) -> None:
            self.statements.append(statement)
            raise RuntimeError('column "s"."dbid" does not exist')

        def close(self) -> None:
            return None

    cursor = RaisingCursor()
    source = PostgresUsageSource(
        _config(connection={"queryStatementSource": "my_stats_view"}),
        connect=_factory(cursor),
    )
    with pytest.raises(WorkflowError) as excinfo:
        list(source.produce())
    # The SQL error surfaces as a failed run, never as silently
    # mislabeled rows: no fallback statement is issued.
    assert "dbid" in str(excinfo.value)
    assert len(source.engine_failures) == 1
    assert "dbid" in source.engine_failures[0]
    assert len(cursor.statements) == 1
    assert "my_stats_view" in cursor.statements[0]
    assert "JOIN pg_catalog.pg_database d ON s.dbid = d.oid" in cursor.statements[0]
    assert "current_database() AS database_name" not in cursor.statements[0]


def test_multi_engine_statements_carry_dbid_filter() -> None:
    """Every engine's history statement restricts the view to its own database.

    With ``ingestAllDatabases`` the provider enumerates two databases;
    each engine then reads the shared cross-database view, so each
    history statement must carry the ``dbid`` filter — otherwise the
    same row is counted once per engine. The enumeration statement
    itself is not a history read and carries no filter.
    """

    class MultiCursor:
        def __init__(self) -> None:
            self.statements: list[str] = []
            self.description: list[tuple] = []
            self._current: list[tuple] = []

        def execute(self, statement: str, *args: Any) -> None:
            self.statements.append(statement)
            if "SELECT datname FROM pg_database" in statement:
                self.description = [("datname", None)]
                self._current = [("db1",), ("db2",)]
            else:
                self.description = [(column, None) for column in COLUMNS]
                self._current = []

        def fetchall(self) -> list[tuple]:
            return list(self._current)

        def close(self) -> None:
            return None

    cursor = MultiCursor()
    seen_connections: list[dict[str, Any]] = []

    def builder(connection: dict[str, Any]):
        # The per-database premise of the dbid predicate: it
        # partitions by current_database(), which is only the
        # engine's own database when each engine connects to the
        # database it was enumerated for. The entry connection only
        # enumerates and keeps its own database.
        seen_connections.append(dict(connection))
        return _factory(cursor)

    source = QueryLogSource(
        _config(connection={"ingestAllDatabases": True, "database": "entry"}),
        POSTGRES_QUERY_LOG_SPEC,
        builder,
        postgres_engines,
    )
    records = list(source.produce())
    assert records == []
    assert [connection.get("database") for connection in seen_connections] == [
        "entry",
        "db1",
        "db2",
    ]
    assert len(cursor.statements) == 3
    history_statements = cursor.statements[1:]
    assert len(history_statements) == 2
    for statement in history_statements:
        assert POSTGRES_DBID_FILTER in statement


def test_timescale_multi_engine_statements_carry_dbid_filter() -> None:
    """Timescale's multi-engine run wires the same predicate through
    the same engine provider: each engine's history statement
    carries the dbid filter and connects to its own enumerated
    database. Only statements and wiring are asserted here — no
    predicate-filtering semantics are simulated."""

    class MultiCursor:
        def __init__(self) -> None:
            self.statements: list[str] = []
            self.description: list[tuple] = []
            self._current: list[tuple] = []

        def execute(self, statement: str, *args: Any) -> None:
            self.statements.append(statement)
            if "SELECT datname FROM pg_database" in statement:
                self.description = [("datname", None)]
                self._current = [("db1",), ("db2",)]
            else:
                self.description = [(column, None) for column in COLUMNS]
                self._current = []

        def fetchall(self) -> list[tuple]:
            return list(self._current)

        def close(self) -> None:
            return None

    cursor = MultiCursor()
    seen_connections: list[dict[str, Any]] = []

    def builder(connection: dict[str, Any]):
        seen_connections.append(dict(connection))
        return _factory(cursor)

    source = QueryLogSource(
        _config(
            "timescale-usage",
            connection={"ingestAllDatabases": True, "database": "entry"},
        ),
        TIMESCALE_QUERY_LOG_SPEC,
        builder,
        timescale_engines,
    )
    records = list(source.produce())
    assert records == []
    assert [connection.get("database") for connection in seen_connections] == [
        "entry",
        "db1",
        "db2",
    ]
    assert len(cursor.statements) == 3
    history_statements = cursor.statements[1:]
    assert len(history_statements) == 2
    for statement in history_statements:
        assert POSTGRES_DBID_FILTER in statement
