# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unity Catalog query-log spec: history SQL, engine provider, registration.

Unity Catalog is queried through the same Databricks SQL surface, so
this engine reuses the Databricks history statement, window behavior,
and statement-source validation verbatim — only the engine key and
the registration differ. The Databricks module documents the table
contract. The shared Databricks connect factory serves both engines.
"""

from __future__ import annotations

from smartmetadata_ingestion.connectors.databricks_query_log import (
    DATABRICKS_SQL_TEMPLATE,
    DATABRICKS_STATEMENT_SOURCE_PATTERN,
    databricks_connect_builder,
    databricks_engines,
)
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.usage.query_log import QueryLogSpec, register_query_log_spec

UNITYCATALOG_QUERY_LOG_SPEC = register_query_log_spec(
    QueryLogSpec(
        engine_key="unitycatalog",
        sql_template=DATABRICKS_SQL_TEMPLATE,
        dialect=Dialect.DATABRICKS,
        statement_source_key="queryHistoryTable",
        statement_source_default="system.query.history",
        statement_source_pattern=DATABRICKS_STATEMENT_SOURCE_PATTERN,
    )
)

unitycatalog_engines = databricks_engines
unitycatalog_connect_builder = databricks_connect_builder
