# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Greenplum profiler interface (schema supportsProfiler / service_spec)."""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import greenplum_common as greenplum
from smartmetadata_ingestion.connectors.profile_sql import (
    MetricParamsByColumn,
    ProfileOptions,
    build_profile_record,
)
from smartmetadata_ingestion.data_quality.sampling import StaticSampleConfig
from smartmetadata_ingestion.records import ProfileRecord


class GreenplumProfilerInterface:
    def __init__(self, reader: greenplum.ProfileReader) -> None:
        self._reader = reader

    def profile(
        self,
        *,
        service: str,
        database: str,
        schema: str,
        table: str,
        timestamp: int,
        metric_params: MetricParamsByColumn | None = None,
        sample_config: StaticSampleConfig | None = None,
        options: ProfileOptions | None = None,
    ) -> ProfileRecord:
        stats = list(
            self._reader.profile_table(
                database,
                schema,
                table,
                metric_params=metric_params,
                sample_config=sample_config,
                options=options,
            )
        )
        return build_profile_record(
            stats,
            service=service,
            database=database,
            schema=schema,
            table=table,
            timestamp=timestamp,
            options=options,
        )


class GreenplumSampleHelper:
    """Optional sample helper for profiler paths; not a service_spec sampler_class."""

    def __init__(self, reader: greenplum.ProfileReader) -> None:
        self._reader = reader

    def sample(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> list[dict[str, Any]]:
        return [
            dict(row.values)
            for row in self._reader.sample_table(database, schema, table, limit=limit)
        ]

