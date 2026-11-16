# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Tests for the shared connection-default naming rule (design §5.7).

The priority table is exercised row by row: every engine's database
and schema chains, falsy step-through, the ``schema`` compatibility
key, unknown engine keys, and engine-key normalization. The
delegation tests prove the four metadata ``_database_name`` methods
select through the same rule — including the one deliberate split:
Postgres keeps its required check in its own method while the shared
function returns ``None`` for binding to fill from SQL or row context
(design §0b). Expectations come from the frozen interface contract §d.
"""

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.doris import DorisSource
from smartmetadata_ingestion.connectors.mariadb import MariaDBSource
from smartmetadata_ingestion.connectors.mysql import MysqlSource
from smartmetadata_ingestion.connectors.postgres import PostgresSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.naming import resolve_connection_defaults


def _config(source_type: str, connection: dict[str, Any]) -> SourceConfig:
    return SourceConfig.model_validate(
        {"type": source_type, "service_name": "svc", "connection": connection}
    )


@pytest.mark.parametrize("engine", ["mysql", "mariadb", "doris"])
@pytest.mark.parametrize(
    ("connection", "expected"),
    [
        (
            {
                "databaseName": "warehouse",
                "database": "db",
                "databaseSchema": "sales",
                "schema": "other",
            },
            ("warehouse", "sales"),
        ),
        ({"database": "db"}, ("db", None)),
        ({"databaseSchema": "sales"}, ("default", "sales")),
        ({"schema": "compat"}, ("default", "compat")),
        ({}, ("default", None)),
        # Falsy values never shadow a later step in the chain.
        ({"databaseName": "", "database": "db"}, ("db", None)),
        ({"databaseName": None, "database": ""}, ("default", None)),
        ({"databaseSchema": "", "schema": "compat"}, ("default", "compat")),
        ({"databaseSchema": None, "schema": ""}, ("default", None)),
        ({"databaseName": 0, "database": "db"}, ("db", None)),
    ],
)
def test_mysql_family_priority_chains(
    engine: str, connection: dict[str, Any], expected: tuple[str | None, str | None]
) -> None:
    assert resolve_connection_defaults(connection, engine) == expected


@pytest.mark.parametrize("engine", ["mysql", "mariadb", "doris"])
def test_mysql_family_none_connection_yields_default_database(engine: str) -> None:
    assert resolve_connection_defaults(None, engine) == ("default", None)


@pytest.mark.parametrize(
    "engine", ["postgres", "timescale", "snowflake", "mssql", "redshift", "greenplum"]
)
@pytest.mark.parametrize(
    ("connection", "expected"),
    [
        ({"database": "db", "databaseSchema": "sales"}, ("db", "sales")),
        ({"database": "db", "schema": "compat"}, ("db", "compat")),
        ({}, (None, None)),
        ({"database": ""}, (None, None)),
        ({"database": None, "databaseSchema": "sales"}, (None, "sales")),
        ({"databaseSchema": "", "schema": "compat"}, (None, "compat")),
        # Other families' keys are not consulted: no guessing.
        ({"databaseName": "warehouse", "catalog": "cat"}, (None, None)),
    ],
)
def test_database_family_priority_chains(
    engine: str, connection: dict[str, Any], expected: tuple[str | None, str | None]
) -> None:
    assert resolve_connection_defaults(connection, engine) == expected


@pytest.mark.parametrize(
    "engine", ["postgres", "timescale", "snowflake", "mssql", "redshift", "greenplum"]
)
def test_database_family_none_connection_yields_no_defaults(engine: str) -> None:
    assert resolve_connection_defaults(None, engine) == (None, None)


def test_alias_engine_keys_share_database_family_rules() -> None:
    # Dialect spellings alias to the same chains as the spec/source keys.
    assert resolve_connection_defaults(
        {"database": "db", "databaseSchema": "sales"}, "postgresql"
    ) == ("db", "sales")
    assert resolve_connection_defaults(
        {"database": "db", "databaseSchema": "sales"}, "timescaledb"
    ) == ("db", "sales")
    # The dialect map's own spellings take the same postgres rule
    # for the same connection input.
    assert resolve_connection_defaults(
        {"database": "db", "databaseSchema": "sales"}, "PostgreSQL"
    ) == ("db", "sales")
    assert resolve_connection_defaults(
        {"database": "db", "databaseSchema": "sales"}, "TimescaleDB"
    ) == ("db", "sales")


@pytest.mark.parametrize("engine", ["databricks", "unitycatalog"])
@pytest.mark.parametrize(
    ("connection", "expected"),
    [
        ({"catalog": "cat", "databaseSchema": "sales"}, ("cat", "sales")),
        ({"catalog": "cat", "schema": "compat"}, ("cat", "compat")),
        ({}, (None, None)),
        ({"catalog": ""}, (None, None)),
        # The database-family keys do not name a catalog.
        ({"database": "db", "databaseName": "warehouse"}, (None, None)),
    ],
)
def test_catalog_family_priority_chains(
    engine: str, connection: dict[str, Any], expected: tuple[str | None, str | None]
) -> None:
    assert resolve_connection_defaults(connection, engine) == expected


@pytest.mark.parametrize("engine", ["databricks", "unitycatalog"])
def test_catalog_family_none_connection_yields_no_defaults(engine: str) -> None:
    assert resolve_connection_defaults(None, engine) == (None, None)


@pytest.mark.parametrize("engine", ["oracle", "trino", "clickhouse", "sqlite", ""])
def test_unknown_engine_key_yields_no_defaults(engine: str) -> None:
    connection = {
        "databaseName": "warehouse",
        "database": "db",
        "catalog": "cat",
        "databaseSchema": "sales",
        "schema": "compat",
    }
    assert resolve_connection_defaults(connection, engine) == (None, None)


@pytest.mark.parametrize(
    ("spelling", "connection", "expected"),
    [
        ("MySQL", {"databaseName": "warehouse"}, ("warehouse", None)),
        ("MariaDB", {"database": "db"}, ("db", None)),
        ("Doris", {}, ("default", None)),
        ("Postgres", {"database": "db"}, ("db", None)),
        ("Timescale", {"database": "db"}, ("db", None)),
        ("Snowflake", {"database": "db"}, ("db", None)),
        ("MSSQL", {"database": "db"}, ("db", None)),
        ("Redshift", {"database": "db"}, ("db", None)),
        ("Greenplum", {"database": "db"}, ("db", None)),
        ("Databricks", {"catalog": "cat"}, ("cat", None)),
        ("UnityCatalog", {"catalog": "cat"}, ("cat", None)),
    ],
)
def test_engine_key_spelling_is_normalized(
    spelling: str, connection: dict[str, Any], expected: tuple[str | None, str | None]
) -> None:
    assert resolve_connection_defaults(connection, spelling) == expected


def test_truthy_non_string_values_are_coerced_to_text() -> None:
    assert resolve_connection_defaults({"database": 123}, "postgres") == ("123", None)


@pytest.mark.parametrize(
    ("source_cls", "source_type", "engine", "connection", "expected"),
    [
        (MysqlSource, "mysql", "mysql", {"databaseName": "shop"}, "shop"),
        (MysqlSource, "mysql", "mysql", {"database": "db"}, "db"),
        (
            MysqlSource,
            "mysql",
            "mysql",
            {"databaseName": "shop", "database": "db"},
            "shop",
        ),
        (MysqlSource, "mysql", "mysql", {}, "default"),
        (MariaDBSource, "mariadb", "mariadb", {"databaseName": "shop"}, "shop"),
        (MariaDBSource, "mariadb", "mariadb", {}, "default"),
        (DorisSource, "doris", "doris", {"databaseName": "shop"}, "shop"),
        (DorisSource, "doris", "doris", {}, "default"),
        (PostgresSource, "postgres", "postgres", {"database": "db"}, "db"),
    ],
)
def test_database_name_delegates_to_shared_rule(
    source_cls: Any, source_type: str, engine: str, connection: dict[str, Any], expected: str
) -> None:
    source = source_cls(_config(source_type, connection))
    assert source._database_name() == expected
    database, _ = resolve_connection_defaults(connection, engine)
    assert source._database_name() == database


@pytest.mark.parametrize("connection", [{}, {"database": ""}, {"database": None}])
def test_postgres_database_name_keeps_required_check(
    connection: dict[str, Any],
) -> None:
    source = PostgresSource(_config("postgres", connection))
    with pytest.raises(WorkflowError) as excinfo:
        source._database_name()
    assert str(excinfo.value) == "postgres source.connection.database is required"


def test_postgres_required_check_is_not_shared_with_binding() -> None:
    # The shared rule returns None for the same empty connection the
    # metadata method rejects: binding defaults are optional and are
    # filled by SQL qualifiers or row context instead.
    assert resolve_connection_defaults({}, "postgres") == (None, None)
    source = PostgresSource(_config("postgres", {}))
    with pytest.raises(WorkflowError):
        source._database_name()
