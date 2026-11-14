# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Mysql lineage source: view/query channels over the live catalog
and the shared query-log base."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mysql_common as mysql
from smartmetadata_ingestion.connectors.mysql_query_log import (
    MYSQL_QUERY_LOG_SPEC,
    mysql_connect_builder,
    mysql_engines,
)
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.query_filters import lineage_spec_for
from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.lineage.view_lineage import (
    SingleDatabaseViewEnumerator,
    ViewEnumerator,
)
from smartmetadata_ingestion.usage.query_log import ConnectFactory, QueryLogSource


@register_source("mysql-lineage")
class MysqlLineageSource(LineageSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        catalog: mysql.CatalogReader | None = None,
        connect: ConnectFactory | None = None,
        query_log_connect: ConnectFactory | None = None,
    ) -> None:
        self._catalog = catalog
        self._connect = connect
        self._query_log_connect = query_log_connect
        super().__init__(
            config,
            engine_key="mysql",
            dialect=dialect_for_connection_type("mysql"),
            view_enumerator_factory=self._build_view_enumerator,
            query_log_source_factory=self._build_query_log_source,
        )

    def prepare(self) -> None:
        mysql.run_connection_test(self._config.connection or {})

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or mysql.CursorCatalogReader(
            self._connect or mysql.mysql_connect(raw)
        )
        database = str(raw.get("databaseName") or raw.get("database") or "default")
        return SingleDatabaseViewEnumerator(catalog, database)

    def _build_query_log_source(self) -> QueryLogSource:
        return QueryLogSource(
            self._config,
            lineage_spec_for(MYSQL_QUERY_LOG_SPEC),
            mysql_connect_builder,
            mysql_engines,
            connect=self._query_log_connect,
        )
