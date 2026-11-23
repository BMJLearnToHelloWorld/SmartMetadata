# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Service-record secrets (§8.3 regression).

Live failure (2026-11-23): every metadata run, the sink PUTs the database
service back. The service-record builders omitted the secret unless
``store_connection_secrets`` was set, and the server's PUT unmask restores
only secrets present in the incoming config — so the PUT silently stripped
the stored password and the next usage/lineage run failed
``fe_sendauth: no password supplied``.

Pin sends the full connection on every service upsert
(``service_mixin.py`` ``get_create_service_from_source``,
``storeServiceConnection`` default true), so the record must always carry
the secret. These tests pin that contract at the builder level: with a raw
connection holding the secret and NO flag set, the secret is in the record.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import (
    databricks_common,
    doris_common,
    greenplum_common,
    mariadb_common,
    mssql_common,
    mysql_common,
    postgres_common,
    redshift_common,
    snowflake_common,
    timescale_common,
)
from smartmetadata_ingestion.connectors.dagster import _public_dagster_connection
from smartmetadata_ingestion.connectors.kafka import KafkaSource
from smartmetadata_ingestion.connectors.metabase import _public_metabase_connection
from smartmetadata_ingestion.connectors.prefect import _public_prefect_connection
from smartmetadata_ingestion.connectors.redpanda import _public_redpanda_connection
from smartmetadata_ingestion.connectors.s3 import _public_s3_connection
from smartmetadata_ingestion.connectors.superset import _public_superset_connection


def test_postgres_service_record_carries_password_by_default() -> None:
    config = postgres_common.build_service_connection_config(
        raw={
            "hostPort": "localhost:5432",
            "username": "u",
            "database": "analytics",
            "authType": {"password": "secret"},
        }
    )
    assert config is not None
    assert config["config"]["authType"]["password"] == "secret"


def test_postgres_service_record_carries_top_level_password() -> None:
    config = postgres_common.build_service_connection_config(
        raw={
            "hostPort": "localhost:5432",
            "username": "u",
            "database": "analytics",
            "password": "secret",
        }
    )
    assert config is not None
    assert config["config"]["authType"]["password"] == "secret"


@pytest.mark.parametrize(
    "module",
    [greenplum_common, timescale_common, redshift_common],
)
def test_postgres_family_service_record_carries_password_by_default(module) -> None:
    config = module.build_service_connection_config(
        raw={
            "hostPort": "localhost:5432",
            "username": "u",
            "database": "analytics",
            "authType": {"password": "secret"},
        }
    )
    assert config is not None
    assert config["config"]["authType"]["password"] == "secret"


def test_snowflake_service_record_carries_secrets_by_default() -> None:
    config = snowflake_common.build_service_connection_config(
        raw={
            "account": "xy12345",
            "username": "u",
            "warehouse": "COMPUTE_WH",
            "database": "ANALYTICS",
            "password": "secret",
            "privateKey": "key-material",
            "snowflakePrivatekeyPassphrase": "phrase",
        }
    )
    assert config is not None
    assert config["config"]["password"] == "secret"
    assert config["config"]["privateKey"] == "key-material"
    assert config["config"]["snowflakePrivatekeyPassphrase"] == "phrase"


@pytest.mark.parametrize(
    "module",
    [doris_common, mariadb_common, mssql_common],
)
def test_top_level_password_service_record_carries_password_by_default(module) -> None:
    config = module.build_service_connection_config(
        raw={
            "hostPort": "localhost:3306",
            "username": "u",
            "database": "db",
            "password": "secret",
        }
    )
    assert config is not None
    assert config["config"]["password"] == "secret"


def test_mysql_service_record_carries_top_level_password_by_default() -> None:
    config = mysql_common.build_service_connection_config(
        raw={
            "hostPort": "localhost:3306",
            "username": "u",
            "databaseName": "shop",
            "password": "secret",
        }
    )
    assert config is not None
    assert config["config"]["authType"]["password"] == "secret"


def test_databricks_service_record_carries_token_by_default() -> None:
    config = databricks_common.build_service_connection_config(
        service_type="Databricks",
        raw={
            "hostPort": "https://dbc-example.cloud.databricks.com",
            "httpPath": "/sql/1.0/warehouses/abc",
            "authType": {"token": "dapi-secret"},
            "catalog": "main",
        },
    )
    assert config is not None
    assert config["config"]["authType"]["token"] == "dapi-secret"


def test_dagster_service_record_carries_token_by_default() -> None:
    config = _public_dagster_connection(
        {"host": "http://dagster:3000", "token": "secret", "timeout": 30}
    )
    assert config["token"] == "secret"


def test_prefect_service_record_carries_api_key_by_default() -> None:
    config = _public_prefect_connection(
        {
            "hostPort": "https://api.prefect.cloud",
            "authType": {
                "apiKey": "secret-key",
                "accountId": "acct-1",
                "workspaceId": "ws-1",
            },
        }
    )
    assert config["authType"]["apiKey"] == "secret-key"
    assert config["authType"]["accountId"] == "acct-1"


def test_prefect_service_record_carries_server_auth_string_by_default() -> None:
    config = _public_prefect_connection(
        {"hostPort": "http://localhost:4200", "authType": {"authString": "admin:secret"}}
    )
    assert config["authType"]["authString"] == "admin:secret"


def test_kafka_service_record_carries_sasl_password_by_default() -> None:
    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="events",
            connection={
                "bootstrapServers": "broker:9092",
                "saslUsername": "u",
                "saslPassword": "secret",
                "basicAuthUserInfo": "u:secret",
            },
        )
    )
    record = source._service_record()
    assert record.connection is not None
    assert record.connection["config"]["saslPassword"] == "secret"
    assert record.connection["config"]["basicAuthUserInfo"] == "u:secret"


def test_redpanda_service_record_carries_sasl_password_by_default() -> None:
    config = _public_redpanda_connection(
        {
            "bootstrapServers": "redpanda:9092",
            "saslUsername": "u",
            "saslPassword": "secret",
            "basicAuthUserInfo": "u:secret",
        }
    )
    assert config["saslPassword"] == "secret"
    assert config["basicAuthUserInfo"] == "u:secret"


def test_s3_service_record_carries_secret_key_by_default() -> None:
    config = _public_s3_connection(
        {
            "awsConfig": {
                "awsRegion": "us-east-1",
                "awsAccessKeyId": "AKIA",
                "awsSecretAccessKey": "secret",
                "awsSessionToken": "token",
            },
            "bucketNames": ["departments"],
        }
    )
    assert config["awsConfig"]["awsSecretAccessKey"] == "secret"
    assert config["awsConfig"]["awsSessionToken"] == "token"


def test_superset_service_record_carries_password_by_default() -> None:
    config = _public_superset_connection(
        {
            "hostPort": "http://superset:8088",
            "connection": {"provider": "db", "username": "admin", "password": "secret"},
        }
    )
    assert config["connection"]["password"] == "secret"


def test_metabase_service_record_carries_password_and_api_key_by_default() -> None:
    config = _public_metabase_connection(
        {
            "hostPort": "http://metabase:3000",
            "username": "admin@x",
            "password": "secret",
            "apiKey": "mb-key",
        }
    )
    assert config["password"] == "secret"
    assert config["apiKey"] == "mb-key"


def test_service_record_without_secret_still_omits_auth_type() -> None:
    """No secret in the raw connection means nothing to carry — the absence
    of authType is correct only when there is no secret at all."""
    config = postgres_common.build_service_connection_config(
        raw={"hostPort": "localhost:5432", "username": "u", "database": "analytics"}
    )
    assert config is not None
    assert "authType" not in config["config"]
