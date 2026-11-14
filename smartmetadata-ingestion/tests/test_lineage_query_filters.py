# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage DML pre-filters: the lineage channel derives its own
query-log spec copy with a DML fragment; the registered usage specs
are never modified."""

from __future__ import annotations

from smartmetadata_ingestion.connectors.databricks_query_log import (
    DATABRICKS_QUERY_LOG_SPEC,
)
from smartmetadata_ingestion.connectors.mssql_query_log import MSSQL_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.mysql_query_log import MYSQL_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.postgres_query_log import POSTGRES_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.redshift_query_log import REDSHIFT_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.snowflake_query_log import SNOWFLAKE_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.timescale_query_log import TIMESCALE_QUERY_LOG_SPEC
from smartmetadata_ingestion.connectors.unitycatalog_query_log import (
    UNITYCATALOG_QUERY_LOG_SPEC,
)
from smartmetadata_ingestion.lineage.query_filters import lineage_spec_for


def test_postgres_fragment_uses_ilike_on_the_template_column() -> None:
    spec = lineage_spec_for(POSTGRES_QUERY_LOG_SPEC)
    assert "s.query ILIKE '%INSERT%SELECT%'" in spec.filters
    assert "s.query ILIKE '%CREATE%AS%SELECT%'" in spec.filters
    assert "s.query ILIKE '%MERGE%INTO%'" in spec.filters
    assert "s.query ILIKE '%UPDATE%FROM%'" in spec.filters
    assert "s.query ILIKE '%SELECT%INTO%FROM%'" in spec.filters


def test_timescale_matches_postgres() -> None:
    spec = lineage_spec_for(TIMESCALE_QUERY_LOG_SPEC)
    assert "s.query ILIKE '%INSERT%SELECT%'" in spec.filters
    assert "s.query ILIKE '%SELECT%INTO%FROM%'" in spec.filters


def test_mysql_fragment_wraps_column_in_upper() -> None:
    spec = lineage_spec_for(MYSQL_QUERY_LOG_SPEC)
    assert "UPPER(e.SQL_TEXT) LIKE '%INSERT%SELECT%'" in spec.filters
    assert "%SELECT%INTO%FROM%" not in spec.filters


def test_mssql_fragment_has_select_into() -> None:
    spec = lineage_spec_for(MSSQL_QUERY_LOG_SPEC)
    assert "UPPER(t.text) LIKE '%SELECT%INTO%FROM%'" in spec.filters


def test_snowflake_fragment_uses_query_text() -> None:
    spec = lineage_spec_for(SNOWFLAKE_QUERY_LOG_SPEC)
    assert "UPPER(QUERY_TEXT) LIKE '%MERGE%INTO%'" in spec.filters


def test_databricks_and_unitycatalog_share_statement_text() -> None:
    for registered in (DATABRICKS_QUERY_LOG_SPEC, UNITYCATALOG_QUERY_LOG_SPEC):
        spec = lineage_spec_for(registered)
        assert "UPPER(statement_text) LIKE '%CREATE%AS%SELECT%'" in spec.filters


def test_redshift_has_no_fragment() -> None:
    assert lineage_spec_for(REDSHIFT_QUERY_LOG_SPEC) is REDSHIFT_QUERY_LOG_SPEC


def test_snowflake_lineage_spec_replaces_usage_exclusions() -> None:
    # The lineage channel replaces the usage predicate with its DML
    # fragment: CTAS/COPY rows must reach the lineage parser.
    spec = lineage_spec_for(SNOWFLAKE_QUERY_LOG_SPEC)
    assert "QUERY_TYPE NOT IN" not in spec.filters
    assert "UPPER(QUERY_TEXT) LIKE '%CREATE%AS%SELECT%'" in spec.filters


def test_registered_specs_are_untouched() -> None:
    specs = (
        POSTGRES_QUERY_LOG_SPEC,
        TIMESCALE_QUERY_LOG_SPEC,
        MYSQL_QUERY_LOG_SPEC,
        MSSQL_QUERY_LOG_SPEC,
        SNOWFLAKE_QUERY_LOG_SPEC,
        DATABRICKS_QUERY_LOG_SPEC,
        UNITYCATALOG_QUERY_LOG_SPEC,
    )
    before = {spec.engine_key: spec.filters for spec in specs}
    for registered in specs:
        lineage_spec_for(registered)
    for registered in specs:
        assert registered.filters == before[registered.engine_key]


def test_derived_spec_keeps_everything_else() -> None:
    spec = lineage_spec_for(POSTGRES_QUERY_LOG_SPEC)
    assert spec is not POSTGRES_QUERY_LOG_SPEC
    assert spec.engine_key == POSTGRES_QUERY_LOG_SPEC.engine_key
    assert spec.sql_template == POSTGRES_QUERY_LOG_SPEC.sql_template
    assert spec.dialect == POSTGRES_QUERY_LOG_SPEC.dialect
    assert spec.max_duration_days == POSTGRES_QUERY_LOG_SPEC.max_duration_days
