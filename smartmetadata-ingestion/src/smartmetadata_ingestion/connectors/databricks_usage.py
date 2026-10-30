# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Databricks usage source (query history → daily UsageRecord)."""

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import databricks_common as dbx
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import UsageRecord, WorkflowRecord


@register_source("databricks-usage")
class DatabricksUsageSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: dbx.UsageReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._connect = connect

    def prepare(self) -> None:
        dbx.run_connection_test(
            self._config.connection or {},
            require_http_path=True,
        )

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        reader = self._require_reader()
        for event in reader.list_usage():
            if not event.catalog or not event.schema_name or not event.table_name:
                continue
            yield UsageRecord(
                entity_type="table",
                fqn=build_fqn(
                    self._config.service_name,
                    event.catalog,
                    event.schema_name,
                    event.table_name,
                ),
                date=event.date,
                count=int(event.count),
            )

    def _require_reader(self) -> dbx.UsageReader:
        if self._reader is not None:
            return self._reader
        history = (self._config.connection or {}).get("queryHistoryTable") or "system.query.history"
        connect = self._connect or dbx.databricks_connect(self._config.connection or {})
        return dbx.CursorUsageReader(connect, query_history_table=str(history))
