# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Greenplum lineage source: view channel over the live catalog.

Greenplum's connection model declares only
``supportsViewLineageExtraction``, so the query channel warns and
skips; there is no query-log spec for this engine."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import greenplum_common as greenplum
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import (
    MultiDatabaseViewEnumerator,
    ViewEnumerator,
)
from smartmetadata_ingestion.usage.query_log import ConnectFactory


@register_source("greenplum-lineage")
class GreenplumLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: greenplum.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        super().__init__(
            config,
            engine_key="greenplum",
            dialect=dialect_for_connection_type("greenplum"),
            view_enumerator_factory=self._build_view_enumerator,
        )

    def prepare(self) -> None:
        greenplum.run_connection_test(self._config.connection or {})

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or greenplum.CursorCatalogReader(
            self._connect or greenplum.greenplum_connect(raw),
            ingest_all=bool(raw.get("ingestAllDatabases")),
            entry_database=str(raw.get("database") or "") or None,
        )
        return MultiDatabaseViewEnumerator(catalog)
