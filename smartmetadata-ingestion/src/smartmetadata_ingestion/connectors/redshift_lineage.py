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
from smartmetadata_ingestion.connectors.redshift_common import RedshiftInstanceType
from smartmetadata_ingestion.connectors.redshift_query_log import (
    redshift_connect_builder,
    redshift_engines,
    redshift_spec_for_instance,
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
        # D-L2c C: the instance type detected by prepare(); the
        # query-log source is built lazily at produce time, so the
        # template selection reads this cache. None (prepare never
        # ran) means the provisioned template, as before.
        self._redshift_instance_type: RedshiftInstanceType | None = None
        super().__init__(
            config,
            engine_key="redshift",
            dialect=dialect_for_connection_type("redshift"),
            view_enumerator_factory=self._build_view_enumerator,
            query_log_source_factory=self._build_query_log_source,
        )

    def prepare(self) -> None:
        redshift.run_connection_test(self._config.connection or {})
        # File-based query log: no live instance to preflight. The
        # default PROVISIONED template from _build_query_log_source
        # already covers CSV reads (QueryLogSource.produce reads the
        # file and returns before any history read), and a live
        # preflight would demand the redshift driver for a read that
        # never touches the database. Same guard as RedshiftUsageSource
        # (#257); live history reads still preflight below.
        if self._config.query_log_file_path:
            return
        # D-L2c C preflight, before any history read: detect the
        # instance type and probe that branch's privileges (loud on
        # a miss). The result is cached for the lazily built
        # query-log source.
        raw = self._config.connection or {}
        connect_factory = self._query_log_connect or redshift.redshift_connect(raw)
        self._redshift_instance_type = redshift.redshift_query_preflight(
            connect_factory
        )

    def _build_view_enumerator(self) -> ViewEnumerator:
        raw = self._config.connection or {}
        catalog = self._catalog or redshift.CursorCatalogReader(
            self._connect or redshift.redshift_connect(raw),
            ingest_all=bool(raw.get("ingestAllDatabases")),
            entry_database=str(raw.get("database") or "") or None,
        )
        return MultiDatabaseViewEnumerator(catalog)

    def _build_query_log_source(self) -> QueryLogSource:
        spec = redshift_spec_for_instance(
            self._redshift_instance_type or RedshiftInstanceType.PROVISIONED
        )
        return QueryLogSource(
            self._config,
            lineage_spec_for(spec),
            redshift_connect_builder,
            redshift_engines,
            connect=self._query_log_connect,
        )
