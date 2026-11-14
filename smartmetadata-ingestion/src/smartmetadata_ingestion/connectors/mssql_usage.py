# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MSSQL usage source: query history → raw TableQuery records."""

from __future__ import annotations

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mssql_common as mssql
from smartmetadata_ingestion.connectors.mssql_query_log import (
    MSSQL_QUERY_LOG_SPEC,
    mssql_connect_builder,
    mssql_engines,
)
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.usage.query_log import ConnectFactory, QueryLogSource


@register_source("mssql-usage")
class MssqlUsageSource(QueryLogSource):
    def __init__(
        self,
        config: SourceConfig,
        *,
        connect: ConnectFactory | None = None,
    ) -> None:
        super().__init__(
            config,
            MSSQL_QUERY_LOG_SPEC,
            mssql_connect_builder,
            mssql_engines,
            connect=connect,
        )

    def prepare(self) -> None:
        mssql.run_connection_test(self._config.connection or {})
