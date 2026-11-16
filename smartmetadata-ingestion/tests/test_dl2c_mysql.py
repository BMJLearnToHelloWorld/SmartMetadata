# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Tests for the MySQL native-log context swap (design §5.2, §6 test 7).

``CURRENT_SCHEMA`` is the physical database a statement ran in — the
catalog schema segment — so the native history SQL aliases it into
``schema_name`` and leaves ``database_name`` NULL for the connection
defaults to fill. The swap lives in the SQL aliases alone: the
record-level walk-through proves it happens exactly once (a second
swap in row handling would flip the value back), and the CSV test
proves file rows never pass through it. Binding-level walk-throughs
(bare / qualified names resolving to catalog FQNs) belong to the
integrated tests once the binding resolver lands.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.mysql_query_log import (
    MYSQL_QUERY_LOG_SPEC,
    MYSQL_SQL_TEMPLATE,
)
from smartmetadata_ingestion.connectors.mysql_usage import MysqlUsageSource
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.records import FieldSource, TableQueryRecord

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


def _config(**overrides: Any) -> SourceConfig:
    payload: dict[str, Any] = {
        "type": "mysql-usage",
        "service_name": "svc",
        "connection": {"hostPort": "localhost:3306", "username": "u"},
        "queryLogDuration": 0,
    }
    payload.update(overrides)
    return SourceConfig.model_validate(payload)


def test_mysql_template_swaps_current_schema_into_schema_name() -> None:
    assert "e.CURRENT_SCHEMA AS schema_name" in MYSQL_SQL_TEMPLATE
    assert "NULL AS database_name" in MYSQL_SQL_TEMPLATE
    assert "CURRENT_SCHEMA AS database_name" not in MYSQL_SQL_TEMPLATE
    # Exactly once: the physical value is aliased a single time, and
    # each context segment is produced by exactly one expression.
    assert MYSQL_SQL_TEMPLATE.count("CURRENT_SCHEMA") == 1
    assert MYSQL_SQL_TEMPLATE.count("AS schema_name") == 1
    assert MYSQL_SQL_TEMPLATE.count("AS database_name") == 1


def test_mysql_template_keeps_history_shape() -> None:
    assert "events_statements_history_long" in MYSQL_SQL_TEMPLATE
    assert "TIMER_START / 1000000000000" in MYSQL_SQL_TEMPLATE
    assert "global_status" in MYSQL_SQL_TEMPLATE


def test_mysql_spec_marks_swapped_native_context() -> None:
    assert MYSQL_QUERY_LOG_SPEC.engine_key == "mysql"
    assert MYSQL_QUERY_LOG_SPEC.dialect is Dialect.MYSQL
    assert MYSQL_QUERY_LOG_SPEC.swapped_native_context is True


def test_mysql_history_rows_arrive_with_swapped_context() -> None:
    cursor = FakeCursor(
        [
            (
                "SELECT * FROM orders",
                "alice",
                "2026-11-16T00:00:00+00:00",
                "2026-11-16T00:00:01+00:00",
                1500.0,
                None,
                None,
                False,
                None,
                "sales",
            ),
            (
                "SELECT * FROM t",
                "alice",
                "2026-11-16T00:00:00+00:00",
                "2026-11-16T00:00:01+00:00",
                10.0,
                None,
                None,
                False,
                None,
                None,
            ),
        ]
    )
    source = MysqlUsageSource(_config(), connect=_factory(cursor))
    records = list(source.produce())
    assert len(cursor.statements) == 1
    assert "e.CURRENT_SCHEMA AS schema_name" in cursor.statements[0]
    assert len(records) == 2
    assert isinstance(records[0], TableQueryRecord)
    # The physical database lands in the schema segment and the
    # database segment stays empty for the defaults to fill: had row
    # handling swapped the values a second time, "sales" would be
    # back in database_name.
    assert records[0].database_name is None
    assert records[0].database_schema == "sales"
    # The source marks record the swap: the database segment was
    # contributed by no row value, while the schema value arrived
    # in the native row and was moved by the layer swap.
    assert records[0].database_source is FieldSource.MISSING
    assert records[0].schema_source is FieldSource.ROW_NATIVE_SWAPPED
    # A NULL CURRENT_SCHEMA leaves both segments missing.
    assert records[1].database_name is None
    assert records[1].database_schema is None
    assert records[1].database_source is FieldSource.MISSING
    assert records[1].schema_source is FieldSource.MISSING


def test_mysql_csv_rows_are_never_swapped(tmp_path: Path) -> None:
    csv_file = tmp_path / "log.csv"
    csv_file.write_text(
        "query_text,database_name,schema_name\n"
        "SELECT * FROM orders,warehouse,sales\n"
        "SELECT * FROM t,,\n",
        encoding="utf-8",
    )
    source = MysqlUsageSource(_config(queryLogFilePath=str(csv_file)))
    records = list(source.produce())
    assert len(records) == 2
    # CSV's two columns keep their own meaning: the file's database
    # value is never moved into the schema segment.
    assert records[0].database_name == "warehouse"
    assert records[0].database_schema == "sales"
    assert records[1].database_name is None
    assert records[1].database_schema is None
