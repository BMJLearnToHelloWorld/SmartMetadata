# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MariaDB lineage source: view channel over the live catalog.

MariaDB's connection model declares only
``supportsViewLineageExtraction``, so the query channel warns and
skips; there is no query-log spec for this engine."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mariadb_common as mariadb
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import (
    SingleDatabaseViewEnumerator,
    ViewEnumerator,
)
from smartmetadata_ingestion.usage.query_log import ConnectFactory


@register_source("mariadb-lineage")
class MariaDBLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: mariadb.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        super().__init__(
            config,
            engine_key="mariadb",
            dialect=dialect_for_connection_type("mariadb"),
            view_enumerator_factory=self._build_view_enumerator,
        )

    def prepare(self) -> None:
        mariadb.run_connection_test(self._config.connection or {})

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or mariadb.CursorCatalogReader(
            self._connect or mariadb.mariadb_connect(raw)
        )
        database = str(raw.get("databaseName") or raw.get("database") or "default")
        return SingleDatabaseViewEnumerator(catalog, database)
