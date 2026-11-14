# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MSSQL query-log spec: history SQL, engine provider, registration.

Authored from SQL Server's own public DMVs:
``sys.dm_exec_query_stats`` carries per-plan execution aggregates
(creation/last-execution times, execution counts, total elapsed
time) and ``sys.dm_exec_sql_text`` carries the statement text and
database id.

The DMVs aggregate executions per cached plan: each row is one plan,
its start time is the plan's most recent execution, and its duration
is the average elapsed time in milliseconds — there are no
per-execution rows to report. The executing user is not recorded per
plan, so ``user_name`` stays NULL. Statement types are not reported;
the processor derives them from the leading keyword.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import mssql_common as mssql
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSpec,
    register_query_log_spec,
    single_engine_provider,
)

MSSQL_SQL_TEMPLATE = (
    "SELECT TOP ({result_limit}) t.text AS query_text, NULL AS user_name, "
    "s.last_execution_time AS start_time, NULL AS end_time, "
    "s.total_elapsed_time / NULLIF(s.execution_count, 0) / 1000.0 AS duration, "
    "NULL AS cost, NULL AS query_type, 0 AS aborted, "
    "DB_NAME(t.dbid) AS database_name, NULL AS schema_name "
    "FROM sys.dm_exec_query_stats s "
    "CROSS APPLY sys.dm_exec_sql_text(s.sql_handle) t "
    "WHERE t.text IS NOT NULL "
    "AND s.last_execution_time >= '{start_time}' AND s.last_execution_time < '{end_time}' "
    "{filters} "
    "ORDER BY s.last_execution_time DESC"
)

MSSQL_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="mssql",
        sql_template=MSSQL_SQL_TEMPLATE,
        dialect=Dialect.TSQL,
    )
)

mssql_engines = single_engine_provider


def mssql_connect_builder(connection: dict[str, Any]):
    """The MSSQL connect factory, as a spec-module-level builder."""
    return mssql.mssql_connect(connection)
