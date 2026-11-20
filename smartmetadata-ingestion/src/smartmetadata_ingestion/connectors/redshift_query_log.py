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
from dataclasses import replace
from typing import Any

from smartmetadata_ingestion.connectors import redshift_common as redshift
from smartmetadata_ingestion.connectors.redshift_common import RedshiftInstanceType
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
    "WHERE starttime >= '{start_time}' AND starttime < '{end_time}' "
    "LIMIT {result_limit}"
    "), "
    "deduped_querytext AS ("
    "SELECT DISTINCT t.* FROM STL_QUERYTEXT t "
    "INNER JOIN recent q ON t.query = q.query"
    "), "
    "full_queries AS ("
    "SELECT query, "
    "LISTAGG(t.text, '') WITHIN GROUP (ORDER BY t.sequence) AS query_text "
    "FROM deduped_querytext t "
    "WHERE t.text IS NOT NULL "
    "GROUP BY query"
    "), "
    "raw_scans AS ("
    "SELECT DISTINCT query, tbl FROM pg_catalog.stl_scan"
    "), "
    "scans AS ("
    "SELECT DISTINCT query, sti.database AS database_name, sti.schema AS schema_name "
    "FROM raw_scans s "
    "INNER JOIN pg_catalog.svv_table_info sti ON (s.tbl)::oid = sti.table_id"
    ") "
    "SELECT fq.query_text AS query_text, u.usename AS user_name, "
    "q.starttime AS start_time, q.endtime AS end_time, "
    "DATEDIFF(millisecond, q.starttime, q.endtime) AS duration, NULL AS cost, "
    "NULL AS query_type, q.aborted AS aborted, "
    "q.query AS query_id, "
    "s.database_name AS database_name, s.schema_name AS schema_name "
    "FROM recent q "
    "LEFT JOIN scans s ON s.query = q.query "
    "INNER JOIN full_queries fq ON q.query = fq.query "
    "INNER JOIN PG_USER u ON u.usesysid = q.userid "
    "WHERE 1 = 1 {filters} "
    "ORDER BY q.starttime DESC"
)

# Serverless history (D-L2c C): the pin's SYS_QUERY_HISTORY /
# SYS_QUERY_TEXT / SYS_QUERY_DETAIL shape (queries.py:90-159), with
# two product deviations. The terminal join is LEFT, not the pin's
# INNER (D-C1: the pin drops no-detail queries, but the log also
# feeds usage, so a dropped read query is silently lost data; a
# detail-less row keeps a (NULL, NULL) context). The detail split
# is a segment-count CASE, not the pin's bare COALESCE(SPLIT_PART,
# 'unknown') (D-C1: SPLIT_PART overruns yield '' not NULL, so the
# pin's 'unknown' is unreachable; a literal 'unknown' segment is
# defended with NULLIF, and a 2-segment value reads as (segment 1,
# NULL) — its second segment is the table name itself, not a schema).
REDSHIFT_SERVERLESS_SQL_TEMPLATE = (
    "WITH queries AS ("
    "SELECT * FROM SYS_QUERY_HISTORY "
    "WHERE start_time >= '{start_time}' AND start_time < '{end_time}' "
    "ORDER BY start_time DESC "
    "LIMIT {result_limit}"
    "), "
    "deduped_querytext AS ("
    "SELECT DISTINCT qt.* FROM SYS_QUERY_TEXT qt "
    "INNER JOIN queries q ON qt.query_id = q.query_id"
    "), "
    "full_queries AS ("
    "SELECT query_id, "
    "LISTAGG(CASE WHEN LEN(RTRIM(text)) = 0 THEN text ELSE RTRIM(text) END, '') "
    "WITHIN GROUP (ORDER BY sequence) AS query_text "
    "FROM deduped_querytext "
    "WHERE sequence < 327 "
    "GROUP BY query_id"
    "), "
    "query_detail AS ("
    "SELECT DISTINCT query_id, "
    "CASE WHEN table_name LIKE '%.%' "
    "THEN NULLIF(SPLIT_PART(table_name, '.', 1), 'unknown') END AS database_name, "
    "CASE WHEN table_name LIKE '%.%.%' "
    "THEN NULLIF(SPLIT_PART(table_name, '.', 2), 'unknown') END AS schema_name "
    "FROM SYS_QUERY_DETAIL "
    "WHERE LOWER(step_name) IN ('insert', 'merge', 'delete') "
    "AND table_name <> ''"
    ") "
    "SELECT fq.query_text AS query_text, RTRIM(u.usename) AS user_name, "
    "q.start_time AS start_time, q.end_time AS end_time, "
    "DATEDIFF(millisecond, q.start_time, q.end_time) AS duration, NULL AS cost, "
    "q.query_type AS query_type, NULL AS aborted, "
    "q.query_id AS query_id, "
    "qd.database_name AS database_name, qd.schema_name AS schema_name "
    "FROM queries q "
    "LEFT JOIN query_detail qd ON q.query_id = qd.query_id "
    "INNER JOIN full_queries fq ON q.query_id = fq.query_id "
    "INNER JOIN pg_catalog.pg_user u ON q.user_id = u.usesysid "
    "WHERE 1 = 1 {filters} "
    "ORDER BY q.start_time DESC"
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


def redshift_spec_for_instance(
    instance_type: RedshiftInstanceType,
) -> QueryLogSpec:
    """The query-log spec for one Redshift deployment kind: the
    registered spec with only the history template swapped (a copy —
    the registered spec is untouched). The provisioned template is
    the default; the serverless template applies after the
    ``prepare()`` preflight detects a serverless endpoint."""
    template = (
        REDSHIFT_SQL_TEMPLATE
        if instance_type is RedshiftInstanceType.PROVISIONED
        else REDSHIFT_SERVERLESS_SQL_TEMPLATE
    )
    return replace(REDSHIFT_QUERY_LOG_SPEC, sql_template=template)

redshift_engines = single_engine_provider


def redshift_connect_builder(connection: dict[str, Any]):
    """The Redshift connect factory, as a spec-module-level builder."""
    return redshift.redshift_connect(connection)
