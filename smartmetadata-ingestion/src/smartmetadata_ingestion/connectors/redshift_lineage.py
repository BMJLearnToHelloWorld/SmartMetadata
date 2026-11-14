# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Redshift lineage source: view/query channels over the live catalog
and the shared query-log base."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import redshift_common as redshift
from smartmetadata_ingestion.connectors.redshift_query_log import (
    REDSHIFT_QUERY_LOG_SPEC,
    redshift_connect_builder,
    redshift_engines,
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


@register_source("redshift-lineage")
class RedshiftLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: redshift.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
        query_log_connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        self._query_log_connect = query_log_connect
        super().__init__(
            config,
            engine_key="redshift",
            dialect=dialect_for_connection_type("redshift"),
            view_enumerator_factory=self._build_view_enumerator,
            query_log_source_factory=self._build_query_log_source,
        )

    def prepare(self) -> None:
        redshift.run_connection_test(self._config.connection or {})

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or redshift.CursorCatalogReader(
            self._connect or redshift.redshift_connect(raw),
            ingest_all=bool(raw.get("ingestAllDatabases")),
            entry_database=str(raw.get("database") or "") or None,
        )
        return MultiDatabaseViewEnumerator(catalog)

    def _build_query_log_source(self) -> QueryLogSource:
        return QueryLogSource(
            self._config,
            lineage_spec_for(REDSHIFT_QUERY_LOG_SPEC),
            redshift_connect_builder,
            redshift_engines,
            connect=self._query_log_connect,
        )
