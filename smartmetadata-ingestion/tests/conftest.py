# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from smartmetadata_ingestion.config import WorkflowConfig, load_workflow_config

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def environ() -> dict[str, str]:
    return {
        "OM_API_URL": "http://catalog.test/api",
        "OM_JWT": "bot-token",
        "OM_EMAIL": "admin@open-metadata.org",
        "OM_PASSWORD": "admin",
        "PG_HOSTPORT": "localhost:5432",
        "PG_USER": "ingest",
        "PG_PASSWORD": "secret",
        "PG_DATABASE": "analytics",
    }


@pytest.fixture
def postgres_config_path(tmp_path: Path, environ: dict[str, str]) -> Path:
    payload = {
        "workflow": {"name": "warehouse-metadata", "type": "metadata"},
        "server": {
            "hostPort": "${OM_API_URL}",
            "auth": {"type": "jwt", "jwtToken": "${OM_JWT}"},
        },
        "source": {
            "type": "postgres",
            "serviceName": "warehouse",
            "connection": {
                "hostPort": "${PG_HOSTPORT}",
                "username": "${PG_USER}",
                "password": "${PG_PASSWORD}",
                "database": "${PG_DATABASE}",
            },
            "includeSchemas": ["public"],
            "includeViewLineage": True,
        },
        "sink": {"type": "metadata-rest"},
        "lineage": [
            {
                "fromEntity": {"type": "table", "fqn": "warehouse.analytics.public.orders"},
                "toEntity": {"type": "table", "fqn": "warehouse.analytics.public.orders_v"},
                "source": "Manual",
            }
        ],
    }
    path = tmp_path / "workflow.yaml"
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")
    return path


@pytest.fixture
def workflow_config(postgres_config_path: Path, environ: dict[str, str]) -> WorkflowConfig:
    return load_workflow_config(postgres_config_path, environ=environ)
