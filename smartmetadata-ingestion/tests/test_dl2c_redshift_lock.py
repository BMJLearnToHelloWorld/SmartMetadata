# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Redshift status-quo lock (design §5.4, §6 test 9).

This batch deliberately does not change the Redshift history SQL:
the product reads no schema context (``NULL AS schema_name``) while
the reference reads database/schema through a scan join — but that
join fans one query out to one row per scanned table, so copying it
needs a row-cardinality design of its own and is a separate
follow-up. These tests lock the current SQL text, spec shape, and
row behavior so the downgrade stays visible and no silent change
slips in under this batch. The downgrade facts for the ADR are in
the Leaf D report.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.redshift_query_log import (
    REDSHIFT_LIFECYCLE_QUERY_TEXT_PATTERNS,
    REDSHIFT_MAX_DURATION_DAYS,
    REDSHIFT_QUERY_LOG_SPEC,
    REDSHIFT_SQL_TEMPLATE,
)
from smartmetadata_ingestion.connectors.redshift_usage import RedshiftUsageSource
from smartmetadata_ingestion.lineage.dialect import Dialect

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


def test_redshift_sql_text_locked() -> None:
    assert "q.database AS database_name, NULL AS schema_name" in REDSHIFT_SQL_TEMPLATE
    assert "STL_QUERY" in REDSHIFT_SQL_TEMPLATE
    assert "STL_QUERYTEXT" in REDSHIFT_SQL_TEMPLATE
    assert "LISTAGG" in REDSHIFT_SQL_TEMPLATE
    assert (
        "GROUP BY q.query, u.usename, q.starttime, q.endtime, q.aborted, q.database"
        in REDSHIFT_SQL_TEMPLATE
    )
    # The scan-join context read is NOT copied in this batch: none of
    # its views appear in the statement.
    lowered = REDSHIFT_SQL_TEMPLATE.lower()
    assert "stl_scan" not in lowered
    assert "svv_table_info" not in lowered
    assert "sys_query_detail" not in lowered


def test_redshift_spec_shape_locked() -> None:
    assert REDSHIFT_QUERY_LOG_SPEC.engine_key == "redshift"
    assert REDSHIFT_QUERY_LOG_SPEC.dialect is Dialect.REDSHIFT
    assert REDSHIFT_QUERY_LOG_SPEC.sql_template == REDSHIFT_SQL_TEMPLATE
    assert REDSHIFT_QUERY_LOG_SPEC.max_duration_days == REDSHIFT_MAX_DURATION_DAYS == 5
    assert REDSHIFT_QUERY_LOG_SPEC.uses_time_window is True
    assert REDSHIFT_QUERY_LOG_SPEC.statement_source_key is None
    assert (
        REDSHIFT_QUERY_LOG_SPEC.lifecycle_query_text_patterns
        == REDSHIFT_LIFECYCLE_QUERY_TEXT_PATTERNS
    )


def test_redshift_rows_carry_null_schema() -> None:
    cursor = FakeCursor(
        [
            (
                "SELECT * FROM orders",
                "alice",
                "2026-11-16T00:00:00+00:00",
                "2026-11-16T00:00:01+00:00",
                1200.0,
                None,
                None,
                False,
                "dev",
                None,
            )
        ]
    )
    config = SourceConfig.model_validate(
        {
            "type": "redshift-usage",
            "service_name": "svc",
            "connection": {"hostPort": "localhost:5439", "username": "u"},
            "queryLogDuration": 0,
        }
    )
    source = RedshiftUsageSource(config, connect=_factory(cursor))
    records = list(source.produce())
    assert len(cursor.statements) == 1
    assert "STL_QUERY" in cursor.statements[0]
    assert len(records) == 1
    assert records[0].database_name == "dev"
    # The downgrade, locked as behavior: no schema context is read.
    assert records[0].database_schema is None
