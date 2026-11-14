# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Redshift query-log spec: history SQL, engine provider, registration.

Authored from Redshift's own public views: ``STL_QUERY`` carries the
query id, user, database, start/end times, and aborted flag;
``STL_QUERYTEXT`` carries the statement text in sequence-ordered
chunks, reassembled with ``LISTAGG``; ``PG_USER`` supplies the user
name. Duration is the start/end difference in milliseconds; the
views report no statement type or cost, so those stay NULL and the
processor derives the type from the leading keyword. Lifecycle
detection reads the query TEXT (CREATE/INSERT patterns), since no
statement type is reported to match against.

The window filter applies in a CTE before the text join, so the
chunk reassembly only scans the window's queries. STL tables retain
only a few days of history (disk-dependent, documented as roughly
two to five days), so the window clamps to the documented upper
bound: older batches would read empty.
"""

from __future__ import annotations

import re
from typing import Any

from smartmetadata_ingestion.connectors import redshift_common as redshift
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import (
    QueryLogSpec,
    register_query_log_spec,
    single_engine_provider,
)

# STL retention is documented as roughly two to five days; older
# queries cannot be retrieved, so the window clamps to five days.
REDSHIFT_MAX_DURATION_DAYS = 5

# Lifecycle detection reads the query text: the views report no
# statement type. The patterns match CREATE/INSERT anywhere in the
# text (re.match with a leading wildcard), including inside string
# literals — the reference behavior, preserved exactly.
REDSHIFT_LIFECYCLE_QUERY_TEXT_PATTERNS = (
    re.compile(r".*\s*CREATE", re.IGNORECASE),
    re.compile(r".*\s*INSERT", re.IGNORECASE),
)

REDSHIFT_SQL_TEMPLATE = (
    "WITH recent AS ("
    "SELECT query, userid, database, starttime, endtime, aborted FROM STL_QUERY "
    "WHERE starttime >= '{start_time}' AND starttime < '{end_time}'"
    ") "
    "SELECT LISTAGG(t.text, '') WITHIN GROUP (ORDER BY t.sequence) AS query_text, "
    "u.usename AS user_name, "
    "q.starttime AS start_time, q.endtime AS end_time, "
    "DATEDIFF(millisecond, q.starttime, q.endtime) AS duration, NULL AS cost, "
    "NULL AS query_type, q.aborted AS aborted, "
    "q.database AS database_name, NULL AS schema_name "
    "FROM recent q "
    "JOIN PG_USER u ON u.usesysid = q.userid "
    "JOIN STL_QUERYTEXT t ON t.query = q.query "
    "WHERE t.text IS NOT NULL {filters} "
    "GROUP BY q.query, u.usename, q.starttime, q.endtime, q.aborted, q.database "
    "ORDER BY q.starttime DESC LIMIT {result_limit}"
)

REDSHIFT_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="redshift",
        sql_template=REDSHIFT_SQL_TEMPLATE,
        dialect=Dialect.REDSHIFT,
        lifecycle_query_text_patterns=REDSHIFT_LIFECYCLE_QUERY_TEXT_PATTERNS,
        max_duration_days=REDSHIFT_MAX_DURATION_DAYS,
    )
)

redshift_engines = single_engine_provider


def redshift_connect_builder(connection: dict[str, Any]):
    """The Redshift connect factory, as a spec-module-level builder."""
    return redshift.redshift_connect(connection)
