# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Snowflake query-log spec: history SQL, engine provider, registration.

Authored from Snowflake's own public view:
``SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY`` carries the query text,
user, start/end times, elapsed time in milliseconds, the statement
type, the execution status, and the cloud-services credits used.

``QUERY_TYPE`` values are underscore-joined (``CREATE_TABLE``,
``ALTER_SESSION``); lifecycle matching is EXACT, so a suffixed type
does not match the bare verb — ``ALTER_TABLE`` is not lifecycle, and
bare ``TRUNCATE`` is not either (only ``TRUNCATE_TABLE``). The
excluded types below are the statement classes whose rows carry no
table usage or lifecycle signal; they are filtered at the history
read, so a ``CREATE TABLE``/CTAS row never reaches the processor even
though targets now count as involved tables. Note the view lags
reality (account-usage latency): the most recent minutes of queries
may not appear yet in a run.
"""

from __future__ import annotations

import re
from typing import Any

from smartmetadata_ingestion.connectors import snowflake_common as snowflake
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSpec,
    register_query_log_spec,
    single_engine_provider,
)

# QUERY_TYPE values excluded from the history read, as data. The
# order follows the reference list; the predicate is built from this
# tuple so the SQL and the spec cannot drift apart.
SNOWFLAKE_EXCLUDED_QUERY_TYPES = (
    "ROLLBACK",
    "CREATE_USER",
    "CREATE_ROLE",
    "CREATE_NETWORK_POLICY",
    "ALTER_ROLE",
    "ALTER_NETWORK_POLICY",
    "ALTER_ACCOUNT",
    "DROP_SEQUENCE",
    "DROP_USER",
    "DROP_ROLE",
    "DROP_NETWORK_POLICY",
    "REVOKE",
    "UNLOAD",
    "USE",
    "ALTER_SESSION",
    "COPY",
    "COMMIT",
    "CREATE_TABLE",
    "PUT_FILES",
    "GET_FILES",
    "CREATE_TABLE_AS_SELECT",
    "SHOW",
    "DESCRIBE",
)

# Lifecycle-relevant QUERY_TYPE values, matched exactly. Only these
# mark a row exclude_usage; everything else reads as ordinary usage.
SNOWFLAKE_LIFECYCLE_QUERY_TYPES = frozenset(
    {"DROP", "DELETE", "TRUNCATE_TABLE", "UPDATE", "ALTER", "INSERT", "MERGE"}
)

# The account-usage schema is a dotted identifier path, bare or
# double-quoted per part; the pattern is the injection guard for the
# configurable schema name.
ACCOUNT_USAGE_PATTERN = re.compile(
    r'(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))*'
)

SNOWFLAKE_SQL_TEMPLATE = (
    "SELECT QUERY_TEXT AS query_text, USER_NAME AS user_name, "
    "START_TIME AS start_time, END_TIME AS end_time, "
    "TOTAL_ELAPSED_TIME AS duration, "
    "CREDITS_USED_CLOUD_SERVICES * {credit_cost} AS cost, "
    "QUERY_TYPE AS query_type, (EXECUTION_STATUS = 'FAILED') AS aborted, "
    "DATABASE_NAME AS database_name, SCHEMA_NAME AS schema_name "
    "FROM {account_usage}.QUERY_HISTORY "
    "WHERE QUERY_TEXT IS NOT NULL "
    "AND START_TIME >= '{start_time}' AND START_TIME < '{end_time}' "
    "{filters} "
    "ORDER BY START_TIME DESC LIMIT {result_limit}"
)

SNOWFLAKE_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="snowflake",
        sql_template=SNOWFLAKE_SQL_TEMPLATE,
        dialect=Dialect.SNOWFLAKE,
        filters="QUERY_TYPE NOT IN ({})".format(
            ", ".join(f"'{query_type}'" for query_type in SNOWFLAKE_EXCLUDED_QUERY_TYPES)
        ),
        lifecycle_query_types=SNOWFLAKE_LIFECYCLE_QUERY_TYPES,
        account_usage_key="accountUsageSchema",
        account_usage_default="SNOWFLAKE.ACCOUNT_USAGE",
        account_usage_pattern=ACCOUNT_USAGE_PATTERN,
        credit_cost_key="creditCost",
        credit_cost_default=3.3,
    )
)

snowflake_engines = single_engine_provider


def snowflake_connect_builder(connection: dict[str, Any]):
    """The Snowflake connect factory, as a spec-module-level builder."""
    return snowflake.snowflake_connect(connection)
