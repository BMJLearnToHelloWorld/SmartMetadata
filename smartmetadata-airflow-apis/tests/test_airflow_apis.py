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
    # Retargeted (step 2/3): the trigger shape is the official one (ruling
    # §0.3/§2.1) — a message, not the run record; the run is visible via
    # status. Same strength: the message assertion stays, plus the status
    # now asserts the queued run with the converged runId. Also retargeted:
    # deploy needs a valid pipeline body (source + server connection, per
    # validation), and trigger on a disabled DAG succeeds (official trigger
    # has no paused check, ruling §3.5 item 14).
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    deploy = client.post(
        f"{prefix}/deploy",
        json={
            "name": "ingest_demo",
            "pipelineType": "metadata",
            "source": {"type": "mysql", "serviceName": "my_sql_test"},
            "openMetadataServerConnection": {
                "hostPort": "http://openmetadata-server:8585/api"
            },
        },
        headers=_auth_headers(),
    )
    assert deploy.status_code == 200

    trigger = client.post(
        f"{prefix}/trigger",
        json={"dag_id": "ingest_demo", "conf": {}},
        headers=_auth_headers(),
    )
    assert trigger.status_code == 200
    assert trigger.get_json()["message"].startswith(
        "Workflow [ingest_demo] has been triggered"
    )

    status = client.get(
        f"{prefix}/status",
        query_string={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert status.status_code == 200
    assert len(status.get_json()) == 1
    assert status.get_json()[0]["pipelineState"] == "queued"

    disabled = client.post(
        f"{prefix}/disable",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert disabled.status_code == 200
    # Official trigger has no paused check: the run is created and waits.
    retriggered = client.post(
        f"{prefix}/trigger",
        json={"dag_id": "ingest_demo"},
        headers=_auth_headers(),
    )
    assert retriggered.status_code == 200

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
