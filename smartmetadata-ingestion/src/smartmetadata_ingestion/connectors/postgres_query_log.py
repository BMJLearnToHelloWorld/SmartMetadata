# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Postgres query-log spec: history SQL, engine provider, registration.

Authored from PostgreSQL's own public view: ``pg_stat_statements``
carries normalized query text, the executing user's id, per-query
timing aggregates, and call counts — but no per-execution timestamps,
so this engine has no time window: its statement formats only the
result limit, filters, and statement source, and each row's analysis
date defaults to the run time. The statement source is the connection's
``queryStatementSource`` (a custom view when direct access to
``pg_stat_statements`` is restricted); it is shape-validated because
it is interpolated as an identifier.

View contract: the source must expose ``query``, ``userid``,
``mean_exec_time``, and ``calls`` columns with the
``pg_stat_statements`` meanings. ``duration`` is the mean execution
time: the view aggregates executions, so no per-execution duration
exists to report, and the mean is the honest per-execution figure.
"""

from __future__ import annotations

import re
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import postgres_common as postgres
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    ConnectBuilder,
    Engine,
    QueryLogSpec,
    fetch_rows,
    register_query_log_spec,
)

# pg_stat_statements keeps roughly a week of history; older queries
# cannot be retrieved, so the window clamps to 6 days.
POSTGRES_MAX_DURATION_DAYS = 6

# Dotted identifier parts, bare or double-quoted: the only shapes a
# statement-source name may take. Anything else (spaces, semicolons,
# comments) is rejected rather than interpolated into SQL. Shared
# with TimescaleDB, which reuses the postgres statement shape.
STATEMENT_SOURCE_PATTERN = re.compile(
    r'(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))*'
)

POSTGRES_SQL_TEMPLATE = (
    "SELECT s.query AS query_text, r.rolname AS user_name, "
    "NULL AS start_time, NULL AS end_time, "
    "s.mean_exec_time AS duration, NULL AS cost, "
    "NULL AS query_type, false AS aborted, "
    "current_database() AS database_name, NULL AS schema_name "
    "FROM {query_statement_source} s "
    "LEFT JOIN pg_roles r ON r.oid = s.userid "
    "WHERE s.query IS NOT NULL {filters} "
    "ORDER BY s.calls DESC LIMIT {result_limit}"
)

POSTGRES_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="postgres",
        sql_template=POSTGRES_SQL_TEMPLATE,
        dialect=Dialect.POSTGRES,
        uses_time_window=False,
        max_duration_days=POSTGRES_MAX_DURATION_DAYS,
        statement_source_key="queryStatementSource",
        statement_source_default="pg_stat_statements",
        statement_source_pattern=STATEMENT_SOURCE_PATTERN,
    )
)


def postgres_engines(
    config: SourceConfig, connect_builder: ConnectBuilder
) -> list[Engine]:
    """One engine per database when ingesting all databases, else one.

    With ``ingestAllDatabases``, the entry connection enumerates the
    databases and each gets its own engine (its own connection, since
    a Postgres connection is bound to one database). The entry
    database is only the discovery connection in that mode.
    """
    raw = config.connection or {}
    if not raw.get("ingestAllDatabases"):
        return [(config.service_name, connect_builder(raw))]
    entry_factory = connect_builder(raw)
    rows = fetch_rows(
        entry_factory,
        "SELECT datname FROM pg_database "
        "WHERE datistemplate = false AND datallowconn ORDER BY datname",
    )
    databases = [str(row.get("datname")) for row in rows if row.get("datname")]
    if not databases:
        raise WorkflowError("ingestAllDatabases found no connectable databases")
    return [
        (database, connect_builder({**raw, "database": database}))
        for database in databases
    ]


def postgres_connect_builder(connection: dict[str, Any]):
    """The postgres connect factory, as a spec-module-level builder."""
    return postgres.postgres_connect(connection)
