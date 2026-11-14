# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the remaining engines' query-log specs.

Each engine's spec is exercised through the shared base with a fake
DB-API factory: the formatted statement must name the engine's public
history view and carry the window bounds, and rows must convert to
``TableQueryRecord`` under the §3.3 row contract. Expectations come
from each engine's documented system views, not from pin text.
"""

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.databricks_query_log import DATABRICKS_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.databricks_usage import DatabricksUsageSource
from smartmetadata_ingestion.connectors.mssql_query_log import MSSQL_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.mssql_usage import MssqlUsageSource
from smartmetadata_ingestion.connectors.mysql_query_log import MYSQL_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.mysql_usage import MysqlUsageSource
from smartmetadata_ingestion.connectors.postgres_query_log import POSTGRES_SQL_TEMPLATE
from smartmetadata_ingestion.connectors.redshift_query_log import REDSHIFT_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.redshift_usage import RedshiftUsageSource
from smartmetadata_ingestion.connectors.snowflake_query_log import SNOWFLAKE_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.snowflake_usage import SnowflakeUsageSource
from smartmetadata_ingestion.connectors.timescale_query_log import TIMESCALE_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.timescale_usage import TimescaleUsageSource
from smartmetadata_ingestion.connectors.unitycatalog_query_log import UNITYCATALOG_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.unitycatalog_usage import UnityCatalogUsageSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.records import TableQueryRecord
from smartmetadata_ingestion.usage.query_log import (
    get_query_log_spec,
    load_query_log_specs,
    registered_query_log_engines,
)

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

ROW = (
    "SELECT * FROM shop.orders",
    "alice",
    "2026-11-13 09:00:00",
    "2026-11-13 09:00:01",
    1500.0,
    None,
    "SELECT",
    0,
    "shop",
    "public",
)


class FakeCursor:
    def __init__(self, rows: list[tuple], columns: list[str] | None = None) -> None:
        self._rows = rows
        self.statements: list[str] = []
        self.description = [(column, None) for column in (columns or COLUMNS)]

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


def _config(source_type: str, **overrides: Any) -> SourceConfig:
    payload: dict[str, Any] = {
        "type": source_type,
        "service_name": "svc",
        "connection": {"hostPort": "localhost:1234", "username": "u", "database": "db"},
        "queryLogDuration": 0,
    }
    payload.update(overrides)
    return SourceConfig.model_validate(payload)


def test_registry_loads_all_eight_engine_specs() -> None:
    load_query_log_specs()
    assert registered_query_log_engines() == (
        "databricks",
        "mssql",
        "mysql",
        "postgres",
        "redshift",
        "snowflake",
        "timescale",
        "unitycatalog",
    )
    assert get_query_log_spec("MySQL").dialect is Dialect.MYSQL
    assert get_query_log_spec("timescale").dialect is Dialect.POSTGRES
    assert get_query_log_spec("mssql").dialect is Dialect.TSQL
    assert get_query_log_spec("databricks").dialect is Dialect.DATABRICKS
    assert get_query_log_spec("unitycatalog").dialect is Dialect.DATABRICKS


def test_timescale_reuses_postgres_statement_shape() -> None:
    assert TIMESCALE_QUERY_LOG_SPEC.sql_template == POSTGRES_SQL_TEMPLATE
    assert TIMESCALE_QUERY_LOG_SPEC.uses_time_window is False
    assert TIMESCALE_QUERY_LOG_SPEC.max_duration_days == 6


def test_unitycatalog_reuses_databricks_statement_shape() -> None:
    assert UNITYCATALOG_QUERY_LOG_SPEC.sql_template == DATABRICKS_QUERY_LOG_SPEC.sql_template
    assert (
        UNITYCATALOG_QUERY_LOG_SPEC.statement_source_default
        == DATABRICKS_QUERY_LOG_SPEC.statement_source_default
        == "system.query.history"
    )


@pytest.mark.parametrize(
    ("source_cls", "source_type", "view_fragment"),
    [
        (MysqlUsageSource, "mysql-usage", "events_statements_history_long"),
        (SnowflakeUsageSource, "snowflake-usage", "SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY"),
        (RedshiftUsageSource, "redshift-usage", "STL_QUERY"),
        (MssqlUsageSource, "mssql-usage", "sys.dm_exec_query_stats"),
        (DatabricksUsageSource, "databricks-usage", "system.query.history"),
        (UnityCatalogUsageSource, "unitycatalog-usage", "system.query.history"),
    ],
)
def test_windowed_engine_queries_its_history_view(
    source_cls, source_type: str, view_fragment: str
) -> None:
    cursor = FakeCursor([ROW])
    source = source_cls(_config(source_type), connect=_factory(cursor))
    records = list(source.produce())
    assert len(records) == 1
    record = records[0]
    assert isinstance(record, TableQueryRecord)
    assert record.query == "SELECT * FROM shop.orders"
    assert record.user_name == "alice"
    assert record.duration == 1500.0
    assert record.database_name == "shop"
    assert record.database_schema == "public"
    assert len(cursor.statements) == 1
    statement = cursor.statements[0]
    assert view_fragment in statement
    # The day batch bounds are formatted into the statement.
    assert "00:00:00" in statement


def test_mysql_statement_converts_picosecond_timers() -> None:
    assert "TIMER_START / 1000000000000" in MYSQL_QUERY_LOG_SPEC.sql_template
    assert "TIMER_WAIT / 1000000000" in MYSQL_QUERY_LOG_SPEC.sql_template
    assert "global_status" in MYSQL_QUERY_LOG_SPEC.sql_template


def test_snowflake_lifecycle_types_match_exactly() -> None:
    cursor = FakeCursor(
        [
            (
                "INSERT INTO t VALUES (1)",
                "alice",
                None,
                None,
                None,
                None,
                "INSERT",
                0,
                None,
                None,
            ),
            (
                "ALTER TABLE t ADD COLUMN x INT",
                "alice",
                None,
                None,
                None,
                None,
                "ALTER_TABLE",
                0,
                None,
                None,
            ),
            (
                "CREATE TABLE t (a INT)",
                "alice",
                None,
                None,
                None,
                None,
                "CREATE_TABLE",
                0,
                None,
                None,
            ),
            (
                "TRUNCATE TABLE t",
                "alice",
                None,
                None,
                None,
                None,
                "TRUNCATE_TABLE",
                0,
                None,
                None,
            ),
            (
                "TRUNCATE TABLE t",
                "alice",
                None,
                None,
                None,
                None,
                "TRUNCATE",
                0,
                None,
                None,
            ),
            ("SELECT * FROM t", "alice", None, None, None, None, "SELECT", 0, None, None),
        ]
    )
    source = SnowflakeUsageSource(_config("snowflake-usage"), connect=_factory(cursor))
    records = list(source.produce())
    assert [record.exclude_usage for record in records] == [
        True,
        False,
        False,
        True,
        False,
        False,
    ]
    assert SNOWFLAKE_QUERY_LOG_SPEC.lifecycle_query_types == frozenset(
        {"DROP", "DELETE", "TRUNCATE_TABLE", "UPDATE", "ALTER", "INSERT", "MERGE"}
    )


def test_snowflake_statement_excludes_non_usage_query_types() -> None:
    cursor = FakeCursor([ROW])
    source = SnowflakeUsageSource(_config("snowflake-usage"), connect=_factory(cursor))
    list(source.produce())
    statement = cursor.statements[0]
    assert "QUERY_TYPE NOT IN (" in statement
    for excluded in ("CREATE_TABLE", "CREATE_TABLE_AS_SELECT", "COPY", "SHOW", "USE"):
        assert f"'{excluded}'" in statement
    assert "FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY" in statement


def test_snowflake_cost_uses_squared_credit_cost() -> None:
    cursor = FakeCursor([ROW])
    source = SnowflakeUsageSource(_config("snowflake-usage"), connect=_factory(cursor))
    list(source.produce())
    # Default creditCost 3.3, squared: 3.3 * 3.3 = 10.89.
    assert "CREDITS_USED_CLOUD_SERVICES * 10.89" in cursor.statements[0]

    cursor = FakeCursor([ROW])
    source = SnowflakeUsageSource(
        _config(
            "snowflake-usage",
            connection={"hostPort": "localhost:1234", "creditCost": 2.0},
        ),
        connect=_factory(cursor),
    )
    list(source.produce())
    assert "CREDITS_USED_CLOUD_SERVICES * 4" in cursor.statements[0]


def test_snowflake_account_usage_schema_is_configurable_and_validated() -> None:
    cursor = FakeCursor([ROW])
    source = SnowflakeUsageSource(
        _config(
            "snowflake-usage",
            connection={"hostPort": "localhost:1234", "accountUsageSchema": "MYDB.ACCOUNT_USAGE"},
        ),
        connect=_factory(cursor),
    )
    list(source.produce())
    assert "FROM MYDB.ACCOUNT_USAGE.QUERY_HISTORY" in cursor.statements[0]

    bad = SnowflakeUsageSource(
        _config(
            "snowflake-usage",
            connection={"hostPort": "localhost:1234", "accountUsageSchema": "x; DROP TABLE t"},
        ),
        connect=_factory(cursor),
    )
    with pytest.raises(WorkflowError, match="unsafe account usage schema"):
        list(bad.produce())


def test_snowflake_cost_comes_from_credits_used() -> None:
    cursor = FakeCursor(
        [("SELECT 1", "alice", None, None, 10.0, 0.25, "SELECT", 0, None, None)]
    )
    source = SnowflakeUsageSource(_config("snowflake-usage"), connect=_factory(cursor))
    assert list(source.produce())[0].cost == 0.25


def test_redshift_statement_reassembles_chunked_text() -> None:
    assert "LISTAGG" in REDSHIFT_QUERY_LOG_SPEC.sql_template
    assert "STL_QUERYTEXT" in REDSHIFT_QUERY_LOG_SPEC.sql_template
    assert REDSHIFT_QUERY_LOG_SPEC.max_duration_days == 5


def test_mssql_statement_uses_top_and_averages_elapsed_time() -> None:
    assert "TOP ({result_limit})" in MSSQL_QUERY_LOG_SPEC.sql_template
    assert "total_elapsed_time" in MSSQL_QUERY_LOG_SPEC.sql_template
    assert "sys.dm_exec_sql_text" in MSSQL_QUERY_LOG_SPEC.sql_template


def test_databricks_statement_source_is_configurable_and_validated() -> None:
    cursor = FakeCursor([ROW])
    source = DatabricksUsageSource(
        _config(
            "databricks-usage",
            connection={
                "hostPort": "localhost:1234",
                "queryHistoryTable": "custom.history",
            },
        ),
        connect=_factory(cursor),
    )
    list(source.produce())
    assert "FROM custom.history" in cursor.statements[0]

    bad = DatabricksUsageSource(
        _config(
            "databricks-usage",
            connection={
                "hostPort": "localhost:1234",
                "queryHistoryTable": "history; DROP TABLE t",
            },
        ),
        connect=_factory(cursor),
    )
    with pytest.raises(WorkflowError, match="unsafe query statement source"):
        list(bad.produce())


def test_databricks_ddl_does_not_mark_exclude_usage() -> None:
    # No lifecycle override: the base check applies, so DDL rows
    # read as ordinary usage.
    cursor = FakeCursor(
        [("CREATE TABLE t (a INT)", "alice", None, None, None, None, "DDL", 0, None, None)]
    )
    source = DatabricksUsageSource(_config("databricks-usage"), connect=_factory(cursor))
    assert list(source.produce())[0].exclude_usage is False
    assert DATABRICKS_QUERY_LOG_SPEC.lifecycle_query_types == frozenset()


def test_unitycatalog_ddl_does_not_mark_exclude_usage() -> None:
    cursor = FakeCursor(
        [("CREATE TABLE t (a INT)", "alice", None, None, None, None, "DDL", 0, None, None)]
    )
    source = UnityCatalogUsageSource(
        _config("unitycatalog-usage"), connect=_factory(cursor)
    )
    assert list(source.produce())[0].exclude_usage is False
    assert UNITYCATALOG_QUERY_LOG_SPEC.lifecycle_query_types == frozenset()


def test_redshift_lifecycle_patterns_read_query_text() -> None:
    # No statement type is reported, so CREATE/INSERT anywhere in
    # the text marks lifecycle — including inside a string literal,
    # which is the preserved reference behavior.
    cursor = FakeCursor(
        [
            ("CREATE TABLE t (a INT)", "alice", None, None, None, None, None, 0, "db", None),
            ("INSERT INTO t VALUES (1)", "alice", None, None, None, None, None, 0, "db", None),
            ("SELECT * FROM t", "alice", None, None, None, None, None, 0, "db", None),
            ("SELECT 'CREATE TABLE'", "alice", None, None, None, None, None, 0, "db", None),
        ]
    )
    source = RedshiftUsageSource(_config("redshift-usage"), connect=_factory(cursor))
    records = list(source.produce())
    assert [record.exclude_usage for record in records] == [True, True, False, True]


def test_timescale_source_reads_without_a_time_window() -> None:
    cursor = FakeCursor(
        [("SELECT 1", "alice", None, None, 5.0, None, None, 0, "db", None)],
    )
    source = TimescaleUsageSource(_config("timescale-usage"), connect=_factory(cursor))
    records = list(source.produce())
    assert len(records) == 1
    assert len(cursor.statements) == 1
    assert "pg_stat_statements" in cursor.statements[0]
