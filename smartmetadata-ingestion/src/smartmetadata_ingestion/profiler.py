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
