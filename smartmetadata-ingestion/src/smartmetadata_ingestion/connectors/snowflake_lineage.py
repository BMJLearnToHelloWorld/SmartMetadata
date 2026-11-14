# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Snowflake lineage source: view/procedure/query channels over the
live catalog, the CALL-history provider, and the shared query-log
base. Snowflake is the first (and in this batch only) engine with a
stored-procedure provider."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import snowflake_common as snowflake
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.snowflake_query_log import (
    SNOWFLAKE_QUERY_LOG_SPEC,
    snowflake_connect_builder,
    snowflake_engines,
)
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.procedure_lineage import (
    ProcedureProvider,
    SnowflakeProcedureProvider,
)
from smartmetadata_ingestion.lineage.query_filters import lineage_spec_for
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import (
    MultiDatabaseViewEnumerator,
    ViewEnumerator,
)
from smartmetadata_ingestion.usage.query_log import ConnectFactory, QueryLogSource


@register_source("snowflake-lineage")
class SnowflakeLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: snowflake.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
        query_log_connect: ConnectFactory | None = None,
        procedure_connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        self._query_log_connect = query_log_connect
        self._procedure_connect = procedure_connect
        super().__init__(
            config,
            engine_key="snowflake",
            dialect=dialect_for_connection_type("snowflake"),
            view_enumerator_factory=self._build_view_enumerator,
            query_log_source_factory=self._build_query_log_source,
            procedure_provider_factory=self._build_procedure_provider,
        )

    def prepare(self) -> None:
        snowflake.run_connection_test(self._config.connection or {})

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or snowflake.CursorCatalogReader(
            self._connect or snowflake.snowflake_connect(raw),
            ingest_all=bool(raw.get("ingestAllDatabases")),
            entry_database=str(raw.get("database") or "") or None,
        )
        return MultiDatabaseViewEnumerator(catalog)

    def _build_query_log_source(self) -> QueryLogSource:
        return QueryLogSource(
            self._config,
            lineage_spec_for(SNOWFLAKE_QUERY_LOG_SPEC),
            snowflake_connect_builder,
            snowflake_engines,
            connect=self._query_log_connect,
        )

    def _build_procedure_provider(self) -> ProcedureProvider:
        raw = self._config.connection or {}
        return SnowflakeProcedureProvider(
            self._procedure_connect or snowflake.snowflake_connect(raw)
        )
