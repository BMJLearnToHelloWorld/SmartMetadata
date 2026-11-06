# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import base64

from smartmetadata_airflow_apis.app import create_app
from smartmetadata_airflow_apis.contracts import API_PREFIXES, ENDPOINTS
from smartmetadata_airflow_apis.store import MemoryDagStore

CREDS = ("admin", "admin-pass")


def _auth_headers() -> dict[str, str]:
    token = base64.b64encode(f"{CREDS[0]}:{CREDS[1]}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_contract_covers_java_client_paths() -> None:
    names = {e.name for e in ENDPOINTS}
    for required in {
        "health",
        "health-auth",
        "deploy",
        "trigger",
        "delete",
        "enable",
        "disable",
        "status",
        "kill",
        "last_dag_logs",
        "ip",
        "run_automation",
        "csrf-token",
    }:
        assert required in names


def test_health_auth_on_all_prefixes() -> None:
    # Retargeted (step 1): health-auth now requires Basic auth (ruling §2.2,
    # fail closed). Same strength: the version assertion stays, plus the
    # unauthenticated case must now be refused.
    client = create_app(credentials=CREDS).test_client()
    for prefix in API_PREFIXES:
        assert client.get(f"{prefix}/health-auth").status_code == 401
        res = client.get(f"{prefix}/health-auth", headers=_auth_headers())
        assert res.status_code == 200
        assert "version" in res.get_json()


def test_deploy_trigger_status_kill_lifecycle() -> None:
    # Retargeted (step 1): protected routes now require Basic auth; the
    # lifecycle itself is unchanged in this step (trigger shape is step 3).
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    deploy = client.post(
        f"{prefix}/deploy",
        json={"name": "ingest_demo", "pipelineType": "metadata"},
        headers=_auth_headers(),
    )
    assert deploy.status_code == 200

    trigger = client.post(
        f"{prefix}/trigger",
        json={"dag_id": "ingest_demo", "conf": {}},
        headers=_auth_headers(),
    )
    assert trigger.status_code == 200
    assert trigger.get_json()["pipelineState"] == "queued"

    status = client.get(
        f"{prefix}/status",
        query_string={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert status.status_code == 200
    assert len(status.get_json()) == 1

    disabled = client.post(
        f"{prefix}/disable",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert disabled.status_code == 200
    blocked = client.post(
        f"{prefix}/trigger",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert blocked.status_code == 404

    client.post(
        f"{prefix}/enable",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    client.post(
        f"{prefix}/trigger",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    killed = client.post(
        f"{prefix}/kill",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert killed.status_code == 200

    deleted = client.delete(
        f"{prefix}/delete",
        query_string={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert deleted.status_code == 200
