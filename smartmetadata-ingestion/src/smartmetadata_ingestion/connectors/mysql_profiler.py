# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Mysql profiler interface (OM connection schema supportsProfiler)."""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import mysql_common as mysql
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import ProfileRecord


class MysqlProfilerInterface:
    def __init__(self, reader: mysql.ProfileReader) -> None:
        self._reader = reader

    def profile(
        self,
        *,
        service: str,
        database: str,
        schema: str,
        table: str,
        timestamp: int,
    ) -> ProfileRecord:
        stats = list(self._reader.profile_table(schema, table))
        table_stat = next((s for s in stats if s.column_name is None), None)
        column_profile = [
            {
                "name": s.column_name,
                "nullCount": s.null_count,
                "distinctCount": s.distinct_count,
                "min": s.min_value,
                "max": s.max_value,
                "mean": s.mean,
            }
            for s in stats
            if s.column_name
        ]
        fqn = build_fqn(service, database, schema, table)
        return ProfileRecord(
            entity_type="table",
            fqn=fqn,
            profile_type="table",
            timestamp=timestamp,
            profile_data={
                "timestamp": timestamp,
                "rowCount": table_stat.row_count if table_stat else None,
            },
            table_profile={
                "timestamp": timestamp,
                "rowCount": table_stat.row_count if table_stat else None,
            },
            column_profile=column_profile,
        )


class MysqlSampler:
    """Official DefaultDatabaseSpec sampler_class surface (SQASampler equivalent)."""

    def __init__(self, reader: mysql.ProfileReader) -> None:
        self._reader = reader

    def sample(self, schema: str, table: str, *, limit: int = 50) -> list[dict[str, Any]]:
        return [dict(row.values) for row in self._reader.sample_table(schema, table, limit=limit)]
