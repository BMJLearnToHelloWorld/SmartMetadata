# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Databricks lineage source (system.access.table_lineage edges)."""

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import databricks_common as dbx
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord


@register_source("databricks-lineage")
class DatabricksLineageSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: dbx.LineageReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader or (
            dbx.CursorLineageReader(connect) if connect is not None else None
        )

    def prepare(self) -> None:
        dbx.run_connection_test(
            self._config.connection or {},
            require_http_path=True,
        )

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        reader = self._require_reader()
        for edge in reader.list_edges():
            from_fqn = build_fqn(
                self._config.service_name,
                edge.source_catalog,
                edge.source_schema,
                edge.source_table,
            )
            to_fqn = build_fqn(
                self._config.service_name,
                edge.target_catalog,
                edge.target_schema,
                edge.target_table,
            )
            if from_fqn == to_fqn:
                continue
            yield LineageRecord(
                from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                source="QueryLineage",
                sql_query=edge.sql_query,
            )

    def _require_reader(self) -> dbx.LineageReader:
        if self._reader is not None:
            return self._reader
        return dbx.CursorLineageReader(
            dbx.databricks_connect(self._config.connection or {})
        )
