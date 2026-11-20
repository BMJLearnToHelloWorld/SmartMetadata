# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Redshift template lock (D-L2c C).

The provisioned history SQL now reads scan context through the
``stl_scan ⨝ svv_table_info`` join (one row per scanned table per
query), and a serverless template reads ``SYS_QUERY_DETAIL``; both
carry the execution id as ``query_id`` and cap the query count with
a ``LIMIT`` inside the query CTE. These tests lock the new SQL text,
the spec shape, and the no-scan row behavior (a detail-less row
still produces a ``(NULL, NULL)`` record — D-C2, a decided
deviation, not the old downgrade) so no silent change slips in.
"""

from __future__ import annotations

import re
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.redshift_query_log import (
    REDSHIFT_LIFECYCLE_QUERY_TEXT_PATTERNS,
    REDSHIFT_MAX_DURATION_DAYS,
    REDSHIFT_QUERY_LOG_SPEC,
    REDSHIFT_SERVERLESS_SQL_TEMPLATE,
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
    "query_id",
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
    template = REDSHIFT_SQL_TEMPLATE
    # The scan-join context read: three DISTINCT layers, joined on
    # the scan table id.
    assert "stl_scan" in template.lower()
    assert "svv_table_info" in template.lower()
    assert "(s.tbl)::oid = sti.table_id" in template
    assert "LEFT JOIN scans" in template
    assert template.count("SELECT DISTINCT") == 3
    # The LIMIT caps queries, not fanned-out rows: it sits inside
    # the recent CTE and nowhere else.
    assert template.count("LIMIT") == 1
    assert template.index("LIMIT") < template.index("deduped_querytext")
    assert "ORDER BY q.starttime DESC" in template
    # The execution id comes from the query side, never NULL on a
    # scan-less row.
    assert "q.query AS query_id" in template
    # The old context-less shape is gone: no session database, no
    # constant-NULL schema.
    assert "q.database AS database_name" not in template
    assert "NULL AS schema_name" not in template
    assert "LISTAGG" in template
    assert "STL_QUERY" in template
    assert "STL_QUERYTEXT" in template
    # {filters} stays on the outer query, over the reassembled text.
    assert "WHERE 1 = 1 {filters}" in template
    assert template.index("{filters}") > template.index("fq.query_text")


def test_redshift_serverless_sql_text_locked() -> None:
    template = REDSHIFT_SERVERLESS_SQL_TEMPLATE
    assert "SYS_QUERY_HISTORY" in template
    assert "SYS_QUERY_TEXT" in template
    assert "SYS_QUERY_DETAIL" in template
    assert "SPLIT_PART" in template
    assert "LOWER(step_name) IN ('insert', 'merge', 'delete')" in template
    # D-C1: the terminal join is LEFT, not the pin's INNER — a
    # detail-less query still produces one (NULL, NULL) row.
    assert "LEFT JOIN query_detail" in template
    assert "INNER JOIN query_detail" not in template
    # The LIMIT caps queries inside the queries CTE, nowhere else.
    assert template.count("LIMIT") == 1
    assert template.index("LIMIT") < template.index("deduped_querytext")
    assert "q.query_id AS query_id" in template
    # No 'unknown' is ever produced as a context value: the literal
    # appears only as the NULLIF comparison that maps it to NULL.
    assert "COALESCE" not in template
    assert "NULLIF(SPLIT_PART(table_name, '.', 1), 'unknown')" in template
    assert "NULLIF(SPLIT_PART(table_name, '.', 2), 'unknown')" in template
    # Segment-count CASE, pinned per column (D-C5): the database
    # CASE takes segment 1 on a one-dot name, the schema CASE takes
    # segment 2 on a two-dot name. A bare "both LIKEs exist" check
    # would stay green if the two were swapped, while every
    # 2-segment name silently flipped to (NULL, seg1) — so each
    # CASE is captured together with its LIKE, its segment number,
    # and its output column, and the database CASE must precede
    # the schema CASE.
    db_case = re.search(
        r"CASE WHEN table_name LIKE '([^']+)' "
        r"THEN NULLIF\(SPLIT_PART\(table_name, '\.', (\d+)\), 'unknown'\) "
        r"END AS database_name",
        template,
    )
    schema_case = re.search(
        r"CASE WHEN table_name LIKE '([^']+)' "
        r"THEN NULLIF\(SPLIT_PART\(table_name, '\.', (\d+)\), 'unknown'\) "
        r"END AS schema_name",
        template,
    )
    assert db_case is not None and schema_case is not None
    assert db_case.group(1) == "%.%"
    assert db_case.group(2) == "1"
    assert schema_case.group(1) == "%.%.%"
    assert schema_case.group(2) == "2"
    assert db_case.start() < schema_case.start()
    assert "WHERE 1 = 1 {filters}" in template


def test_redshift_templates_share_output_columns() -> None:
    """Both templates project the same eleven columns in the same
    order, so _record_from_row reads either branch identically."""
    def output_columns(template: str) -> list[str]:
        select = template[template.index("SELECT fq.query_text") :]
        return re.findall(r" AS (\w+)", select)

    assert output_columns(REDSHIFT_SQL_TEMPLATE) == COLUMNS
    assert output_columns(REDSHIFT_SERVERLESS_SQL_TEMPLATE) == COLUMNS


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


def test_redshift_rows_without_scan_carry_null_context() -> None:
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
                42,
                None,
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
    # D-C2, decided: a scan-less row keeps a (NULL, NULL) context
    # instead of falling back to the session database — the record
    # itself is kept, and a 2-segment name can still bind through
    # the connection defaults.
    assert records[0].query_id == "42"
    assert records[0].database_name is None
    assert records[0].database_schema is None
