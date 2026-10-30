# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MSSQL usage source (OM MssqlUsageSource via query log / injected reader)."""

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mssql_common as mssql
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import UsageRecord, WorkflowRecord


@register_source("mssql-usage")
class MssqlUsageSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: mssql.UsageReader | None = None,
    ) -> None:
        self._config = config
        self._reader = reader

    def prepare(self) -> None:
        mssql.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        if self._reader is None:
            return
        for event in self._reader.list_usage():
            fqn = build_fqn(
                self._config.service_name,
                event.database,
                event.schema_name,
                event.table_name,
            )
            yield UsageRecord(
                entity_type="table",
                fqn=fqn,
                date=str(event.date)[:10],
                count=int(event.count),
            )
