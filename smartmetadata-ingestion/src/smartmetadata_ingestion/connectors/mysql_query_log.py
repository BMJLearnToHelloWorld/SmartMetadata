# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MySQL query-log spec: history SQL, engine provider, registration.

Authored from MySQL's own public views:
``performance_schema.events_statements_history_long`` carries the
statement text, per-execution timers, error numbers, and the current
schema; ``performance_schema.threads`` supplies the executing user.

The history view's timers count picoseconds since server start, not
wall time, so start/end times are derived from the server uptime
(``performance_schema.global_status``): a timer value is that many
picoseconds after startup, and startup was ``uptime`` seconds ago.
Duration is ``TIMER_WAIT`` in milliseconds, matching the Query
schema's millisecond unit. Statement types are not reported by the
view; the processor derives them from the leading keyword.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import mysql_common as mysql
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSpec,
    register_query_log_spec,
    single_engine_provider,
)

# performance_schema timers count picoseconds since server start; the
# divisor converts a timer value to seconds for the uptime arithmetic
# below (start/end times derive from uptime minus the timer in seconds).
_PICOSECONDS_PER_SECOND = 1_000_000_000_000

MYSQL_SQL_TEMPLATE = (
    "SELECT e.SQL_TEXT AS query_text, t.PROCESSLIST_USER AS user_name, "
    f"DATE_SUB(NOW(6), INTERVAL (g.uptime - e.TIMER_START / {_PICOSECONDS_PER_SECOND}) "
    "SECOND) AS start_time, "
    f"DATE_SUB(NOW(6), INTERVAL (g.uptime - e.TIMER_END / {_PICOSECONDS_PER_SECOND}) "
    "SECOND) AS end_time, "
    "e.TIMER_WAIT / 1000000000 AS duration, NULL AS cost, "
    "NULL AS query_type, (e.MYSQL_ERRNO <> 0) AS aborted, "
    "e.CURRENT_SCHEMA AS database_name, NULL AS schema_name "
    "FROM performance_schema.events_statements_history_long e "
    "JOIN performance_schema.threads t ON t.THREAD_ID = e.THREAD_ID "
    "CROSS JOIN (SELECT VARIABLE_VALUE AS uptime FROM performance_schema.global_status "
    "WHERE VARIABLE_NAME = 'Uptime') g "
    "WHERE e.SQL_TEXT IS NOT NULL AND t.PROCESSLIST_USER IS NOT NULL "
    f"AND DATE_SUB(NOW(6), INTERVAL (g.uptime - e.TIMER_START / {_PICOSECONDS_PER_SECOND}) "
    "SECOND) "
    ">= '{start_time}' "
    f"AND DATE_SUB(NOW(6), INTERVAL (g.uptime - e.TIMER_START / {_PICOSECONDS_PER_SECOND}) "
    "SECOND) "
    "< '{end_time}' "
    "{filters} "
    "ORDER BY e.TIMER_START DESC LIMIT {result_limit}"
)

MYSQL_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="mysql",
        sql_template=MYSQL_SQL_TEMPLATE,
        dialect=Dialect.MYSQL,
    )
)

mysql_engines = single_engine_provider


def mysql_connect_builder(connection: dict[str, Any]):
    """The MySQL connect factory, as a spec-module-level builder."""
    return mysql.mysql_connect(connection)
