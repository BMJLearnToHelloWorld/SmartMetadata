# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""TimescaleDB query-log spec: history SQL, engine provider, registration.

TimescaleDB speaks the PostgreSQL wire protocol and exposes the same
``pg_stat_statements`` view, so this engine reuses the postgres
statement shape, window behavior, and statement-source validation
verbatim — only the engine key, the connect factory, and the
registration differ. The postgres module documents the view contract.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import timescale_common as timescale
from smartmetadata_ingestion.connectors.postgres_query_log import (
    POSTGRES_MAX_DURATION_DAYS,
    POSTGRES_SQL_TEMPLATE,
    STATEMENT_SOURCE_PATTERN,
    postgres_engines,
)
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import QueryLogSpec, register_query_log_spec

TIMESCALE_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="timescale",
        sql_template=POSTGRES_SQL_TEMPLATE,
        dialect=Dialect.POSTGRES,
        uses_time_window=False,
        max_duration_days=POSTGRES_MAX_DURATION_DAYS,
        statement_source_key="queryStatementSource",
        statement_source_default="pg_stat_statements",
        statement_source_pattern=STATEMENT_SOURCE_PATTERN,
    )
)

timescale_engines = postgres_engines


def timescale_connect_builder(connection: dict[str, Any]):
    """The TimescaleDB connect factory, as a spec-module-level builder."""
    return timescale.timescale_connect(connection)
