# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SQL dialect names and the connection-type → dialect mapping.

The mapping is factual data (each engine speaks one SQL dialect), not a
behavior choice: the parser cascade passes the dialect to the SqlGlot
and SqlFluff analyzers, and SqlParse ignores it. Unmapped connection
types default to ANSI, so a new connector parses with the generic
dialect instead of failing outright.
"""

from __future__ import annotations

from enum import Enum


class Dialect(str, Enum):
    """Dialect names understood by the parsing library's analyzers."""

    ANSI = "ansi"
    ATHENA = "athena"
    BIGQUERY = "bigquery"
    CLICKHOUSE = "clickhouse"
    DATABRICKS = "databricks"
    EXASOL = "exasol"
    HIVE = "hive"
    IMPALA = "impala"
    MARIADB = "mariadb"
    MYSQL = "mysql"
    ORACLE = "oracle"
    POSTGRES = "postgres"
    REDSHIFT = "redshift"
    SNOWFLAKE = "snowflake"
    SQLITE = "sqlite"
    STARROCKS = "starrocks"
    TERADATA = "teradata"
    TRINO = "trino"
    TSQL = "tsql"
    VERTICA = "vertica"


# Connection type (normalized: lowercased, separators stripped) → dialect.
# TimescaleDB speaks the PostgreSQL wire protocol and dialect, so it maps
# to postgres like the rest of the postgres family; Informix has no
# dedicated analyzer dialect and stays on the ANSI default.
CONNECTION_TYPE_DIALECTS: dict[str, Dialect] = {
    "postgres": Dialect.POSTGRES,
    "postgresql": Dialect.POSTGRES,
    "greenplum": Dialect.POSTGRES,
    "timescale": Dialect.POSTGRES,
    "timescaledb": Dialect.POSTGRES,
    "mysql": Dialect.MYSQL,
    "doris": Dialect.MYSQL,
    "singlestore": Dialect.MYSQL,
    "mariadb": Dialect.MARIADB,
    "mssql": Dialect.TSQL,
    "sqlserver": Dialect.TSQL,
    "azuresql": Dialect.TSQL,
    "fabric": Dialect.TSQL,
    "microsoftfabric": Dialect.TSQL,
    "snowflake": Dialect.SNOWFLAKE,
    "redshift": Dialect.REDSHIFT,
    "databricks": Dialect.DATABRICKS,
    "unitycatalog": Dialect.DATABRICKS,
    "athena": Dialect.ATHENA,
    "bigquery": Dialect.BIGQUERY,
    "clickhouse": Dialect.CLICKHOUSE,
    "exasol": Dialect.EXASOL,
    "hive": Dialect.HIVE,
    "impala": Dialect.IMPALA,
    "oracle": Dialect.ORACLE,
    "sqlite": Dialect.SQLITE,
    "starrocks": Dialect.STARROCKS,
    "teradata": Dialect.TERADATA,
    "trino": Dialect.TRINO,
    "vertica": Dialect.VERTICA,
}


def dialect_for_connection_type(connection_type: str | None) -> Dialect:
    """Resolve a service connection type to its dialect, defaulting to ANSI.

    The lookup is case- and separator-insensitive because connection type
    spellings vary across the service schemas (``AzureSQL``,
    ``UnityCatalog``) while the mapping keys are normalized.
    """
    if not connection_type:
        return Dialect.ANSI
    normalized = "".join(
        char for char in str(connection_type).lower() if char.isalnum()
    )
    return CONNECTION_TYPE_DIALECTS.get(normalized, Dialect.ANSI)
