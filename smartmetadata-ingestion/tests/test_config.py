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
from smartmetadata_ingestion.config import load_workflow_config
from smartmetadata_ingestion.errors import WorkflowError


def test_host_port_appends_api_when_path_missing(tmp_path: Path) -> None:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "http://localhost:8585",
                    "auth": {"type": "jwt", "jwtToken": "t"},
                },
                "source": {"type": "static", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )
    config = load_workflow_config(path, environ={})
    assert config.server.host_port == "http://localhost:8585/api"


def test_expands_env_and_defaults(tmp_path: Path) -> None:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "${OM_API_URL:-http://localhost:8585/api}",
                    "auth": {"type": "jwt", "jwtToken": "${OM_JWT}"},
                },
                "source": {"type": "static", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )
    config = load_workflow_config(path, environ={"OM_JWT": "token-1"})
    assert config.server.host_port == "http://localhost:8585/api"
    assert config.server.auth.jwt_token == "token-1"
    assert config.source.store_connection_secrets is False


def test_missing_required_secret_fails(tmp_path: Path) -> None:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "http://localhost:8585/api",
                    "auth": {"type": "jwt", "jwtToken": "${OM_JWT}"},
                },
                "source": {"type": "static", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(WorkflowError, match="OM_JWT"):
        load_workflow_config(path, environ={})


def test_login_auth_requires_email_and_password(tmp_path: Path) -> None:
    path = tmp_path / "wf.json"
    path.write_text(
        '{"workflow":{"name":"demo"},'
        '"server":{"hostPort":"http://localhost:8585/api","auth":{"type":"login","email":"a@b.c"}},'
        '"source":{"type":"static","serviceName":"demo"}}',
        encoding="utf-8",
    )
    with pytest.raises(WorkflowError, match="password"):
        load_workflow_config(path, environ={})


def test_source_type_is_lowercased(tmp_path: Path) -> None:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "http://localhost:8585/api",
                    "auth": {"type": "jwt", "jwtToken": "t"},
                },
                "source": {"type": "MySQL", "serviceName": "oltp"},
            }
        ),
        encoding="utf-8",
    )
    config = load_workflow_config(path, environ={})
    assert config.source.type == "mysql"


def test_rejects_unknown_suffix(tmp_path: Path) -> None:
    path = tmp_path / "wf.txt"
    path.write_text("workflow: {}", encoding="utf-8")
    with pytest.raises(WorkflowError, match="unsupported config suffix"):
        load_workflow_config(path, environ={})
