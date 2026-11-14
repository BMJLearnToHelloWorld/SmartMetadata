# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Databricks query-log spec: history SQL, engine provider, registration.

Authored from Databricks' own public table: ``system.query.history``
carries the statement text, user, start/end times, total duration in
milliseconds, the statement type, and the execution status. The
history table is the connection's ``queryHistoryTable`` (a custom
table when the default is not queryable); it is shape-validated
because it is interpolated as an identifier.

The history table records no database or schema per statement —
statements may span catalogs — so those stay NULL and binding
resolution falls back to the connection's defaults. There is no
lifecycle override: the base lifecycle check applies, so every
statement reads as ordinary usage.
"""

from __future__ import annotations

import re
from typing import Any

from smartmetadata_ingestion.connectors import databricks_common as databricks
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSpec,
    register_query_log_spec,
    single_engine_provider,
)

# Dotted identifier parts, bare, backtick-quoted (Spark SQL), or
# double-quoted: the only shapes a history-table name may take.
# Anything else is rejected rather than interpolated into SQL.
DATABRICKS_STATEMENT_SOURCE_PATTERN = re.compile(
    r"(?:`[^`]+`|\"[^\"]+\"|[A-Za-z_][\w$]*)"
    r"(?:\.(?:`[^`]+`|\"[^\"]+\"|[A-Za-z_][\w$]*))*"
)

DATABRICKS_SQL_TEMPLATE = (
    "SELECT statement_text AS query_text, user_name AS user_name, "
    "start_time AS start_time, end_time AS end_time, "
    "total_duration_ms AS duration, NULL AS cost, "
    "statement_type AS query_type, (execution_status = 'FAILED') AS aborted, "
    "NULL AS database_name, NULL AS schema_name "
    "FROM {query_statement_source} "
    "WHERE statement_text IS NOT NULL "
    "AND start_time >= '{start_time}' AND start_time < '{end_time}' "
    "{filters} "
    "ORDER BY start_time DESC LIMIT {result_limit}"
)

DATABRICKS_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="databricks",
        sql_template=DATABRICKS_SQL_TEMPLATE,
        dialect=Dialect.DATABRICKS,
        statement_source_key="queryHistoryTable",
        statement_source_default="system.query.history",
        statement_source_pattern=DATABRICKS_STATEMENT_SOURCE_PATTERN,
    )
)

databricks_engines = single_engine_provider


def databricks_connect_builder(connection: dict[str, Any]):
    """The Databricks connect factory, as a spec-module-level builder."""
    return databricks.databricks_connect(connection)
