# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Databricks lineage source: view/query channels over the live
catalog and the shared query-log base. The former
``system.access.table_lineage`` read is replaced by the query-log
channel (cleanup K-7)."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import databricks_common as dbx
from smartmetadata_ingestion.connectors.databricks_query_log import (
    DATABRICKS_QUERY_LOG_SPEC,
    databricks_connect_builder,
    databricks_engines,
)
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.query_filters import lineage_spec_for
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import (
    MultiDatabaseViewEnumerator,
    ViewEnumerator,
)
from smartmetadata_ingestion.usage.query_log import ConnectFactory, QueryLogSource


@register_source("databricks-lineage")
class DatabricksLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: dbx.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
        query_log_connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        self._query_log_connect = query_log_connect
        super().__init__(
            config,
            engine_key="databricks",
            dialect=dialect_for_connection_type("databricks"),
            view_enumerator_factory=self._build_view_enumerator,
            query_log_source_factory=self._build_query_log_source,
        )

    def prepare(self) -> None:
        dbx.run_connection_test(
            self._config.connection or {},
            require_http_path=True,
        )

    def _build_view_enumerator(self) -> ViewEnumerator:
        catalog = self._catalog or dbx.CursorCatalogReader(
            self._connect
            or dbx.databricks_connect(self._config.connection or {})
        )
        return MultiDatabaseViewEnumerator(catalog)

    def _build_query_log_source(self) -> QueryLogSource:
        return QueryLogSource(
            self._config,
            lineage_spec_for(DATABRICKS_QUERY_LOG_SPEC),
            databricks_connect_builder,
            databricks_engines,
            connect=self._query_log_connect,
        )
