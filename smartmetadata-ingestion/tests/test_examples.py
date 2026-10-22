# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from pathlib import Path

from smartmetadata_ingestion.config import load_workflow_config

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"

ENV = {
    "OM_JWT": "bot-token",
    "PG_USER": "ingest",
    "PG_PASSWORD": "secret",
    "PG_DATABASE": "analytics",
    "MYSQL_USER": "ingest",
    "MYSQL_PASSWORD": "secret",
    "MYSQL_DATABASE": "shop",
    "SNOWFLAKE_ACCOUNT": "xy12345",
    "SNOWFLAKE_USER": "ingest",
    "SNOWFLAKE_PASSWORD": "secret",
    "SNOWFLAKE_WAREHOUSE": "COMPUTE_WH",
    "SNOWFLAKE_DATABASE": "ANALYTICS",
    "SNOWFLAKE_ROLE": "SYSADMIN",
}


def test_example_configs_expand_and_validate() -> None:
    expected = {
        "postgres-metadata.yaml": "postgres",
        "mysql-metadata.yaml": "mysql",
        "kafka-topics.yaml": "kafka",
        "snowflake-metadata.yaml": "snowflake",
    }
    for name, source_type in expected.items():
        config = load_workflow_config(EXAMPLES / name, environ=ENV)
        assert config.source.type == source_type
        assert config.server.auth.jwt_token == "bot-token"
        assert config.source.store_connection_secrets is False
