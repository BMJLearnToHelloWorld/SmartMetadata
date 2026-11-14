# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profiler / TestSuite execution bindings.

Maps a ``source.type`` to the connector's profiler interface, test-suite
interface, live connect factory and live profile reader. A type with no entry
here has no profiler implementation and the workflows reject it explicitly
instead of silently running a metadata pass.

The sampler registry below maps the same types to their sample helpers
for the autoClassification workflow: each sampler reads rows through
the type's profile reader, and the registry records whether its
``sample`` takes the database name (most dialects) or only
schema + table (MySQL-family dialects, where schema and database are
the same thing).
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.connectors import (
    databricks_common,
    databricks_profiler,
    databricks_quality,
    doris_common,
    doris_profiler,
    doris_quality,
    greenplum_common,
    greenplum_profiler,
    greenplum_quality,
    mariadb_common,
    mariadb_profiler,
    mariadb_quality,
    mssql_common,
    mssql_profiler,
    mssql_quality,
    mysql_common,
    mysql_profiler,
    mysql_quality,
    postgres_common,
    postgres_profiler,
    postgres_quality,
    redshift_common,
    redshift_profiler,
    redshift_quality,
    snowflake_common,
    snowflake_profiler,
    snowflake_quality,
    timescale_common,
    timescale_profiler,
    timescale_quality,
    unitycatalog_profiler,
    unitycatalog_quality,
)


@dataclass(frozen=True)
class ProfilerBinding:
    profiler: type
    quality: type
    connect: Callable[[dict[str, Any]], Callable[[], Any]]
    profile_reader: type


PROFILER_BINDINGS: dict[str, ProfilerBinding] = {
    "databricks": ProfilerBinding(
        databricks_profiler.DatabricksProfilerInterface,
        databricks_quality.DatabricksTestSuiteInterface,
        databricks_common.databricks_connect,
        databricks_common.CursorProfileReader,
    ),
    "doris": ProfilerBinding(
        doris_profiler.DorisProfilerInterface,
        doris_quality.DorisTestSuiteInterface,
        doris_common.doris_connect,
        doris_common.CursorProfileReader,
    ),
    "greenplum": ProfilerBinding(
        greenplum_profiler.GreenplumProfilerInterface,
        greenplum_quality.GreenplumTestSuiteInterface,
        greenplum_common.greenplum_connect,
        greenplum_common.CursorProfileReader,
    ),
    "mariadb": ProfilerBinding(
        mariadb_profiler.MariaDBProfilerInterface,
        mariadb_quality.MariaDBTestSuiteInterface,
        mariadb_common.mariadb_connect,
        mariadb_common.CursorProfileReader,
    ),
    "mssql": ProfilerBinding(
        mssql_profiler.MssqlProfilerInterface,
        mssql_quality.MssqlTestSuiteInterface,
        mssql_common.mssql_connect,
        mssql_common.CursorProfileReader,
    ),
    "mysql": ProfilerBinding(
        mysql_profiler.MysqlProfilerInterface,
        mysql_quality.MysqlTestSuiteInterface,
        mysql_common.mysql_connect,
        mysql_common.CursorProfileReader,
    ),
    "postgres": ProfilerBinding(
        postgres_profiler.PostgresProfilerInterface,
        postgres_quality.PostgresTestSuiteInterface,
        postgres_common.postgres_connect,
        postgres_common.CursorProfileReader,
    ),
    "redshift": ProfilerBinding(
        redshift_profiler.RedshiftProfilerInterface,
        redshift_quality.RedshiftTestSuiteInterface,
        redshift_common.redshift_connect,
        redshift_common.CursorProfileReader,
    ),
    "snowflake": ProfilerBinding(
        snowflake_profiler.SnowflakeProfilerInterface,
        snowflake_quality.SnowflakeTestSuiteInterface,
        snowflake_common.snowflake_connect,
        snowflake_common.CursorProfileReader,
    ),
    "timescale": ProfilerBinding(
        timescale_profiler.TimescaleProfilerInterface,
        timescale_quality.TimescaleTestSuiteInterface,
        timescale_common.timescale_connect,
        timescale_common.CursorProfileReader,
    ),
    # Unity Catalog reuses the Databricks execution surface.
    "unitycatalog": ProfilerBinding(
        unitycatalog_profiler.UnityCatalogProfilerInterface,
        unitycatalog_quality.UnityCatalogTestSuiteInterface,
        databricks_common.databricks_connect,
        databricks_common.CursorProfileReader,
    ),
}


def profiler_binding(source_type: str) -> ProfilerBinding | None:
    return PROFILER_BINDINGS.get(source_type.strip().lower())


@dataclass(frozen=True)
class SamplerBinding:
    sampler: type
    takes_database: bool


SAMPLER_BINDINGS: dict[str, SamplerBinding] = {
    "databricks": SamplerBinding(
        databricks_profiler.DatabricksSamplerInterface, True
    ),
    "doris": SamplerBinding(doris_profiler.DorisSampleHelper, False),
    "greenplum": SamplerBinding(
        greenplum_profiler.GreenplumSampleHelper, True
    ),
    "mariadb": SamplerBinding(mariadb_profiler.MariaDBSampleHelper, False),
    "mssql": SamplerBinding(mssql_profiler.MssqlSampler, True),
    "mysql": SamplerBinding(mysql_profiler.MysqlSampler, False),
    "postgres": SamplerBinding(postgres_profiler.PostgresSampler, True),
    "redshift": SamplerBinding(redshift_profiler.RedshiftSampleHelper, True),
    "snowflake": SamplerBinding(snowflake_profiler.SnowflakeSampler, True),
    "timescale": SamplerBinding(timescale_profiler.TimescaleSampler, True),
    "unitycatalog": SamplerBinding(
        databricks_profiler.UnityCatalogSamplerInterface, True
    ),
}


def sampler_binding(source_type: str) -> SamplerBinding | None:
    return SAMPLER_BINDINGS.get(source_type.strip().lower())


def build_database_sampler(
    source_type: str, connection: dict[str, Any]
) -> tuple[Any, bool] | None:
    """Build the live sampler for a database source type, or None.

    Returns ``(sampler, takes_database)``: the caller passes
    ``(database, schema, table)`` when ``takes_database`` is true,
    else ``(schema, table)``. None when the type has no profiler
    binding or no sampler — the caller records the gap per entity
    instead of failing the run before enumeration.
    """
    binding = profiler_binding(source_type)
    sampler = sampler_binding(source_type)
    if binding is None or sampler is None:
        return None
    reader = binding.profile_reader(binding.connect(connection))
    return sampler.sampler(reader), sampler.takes_database
