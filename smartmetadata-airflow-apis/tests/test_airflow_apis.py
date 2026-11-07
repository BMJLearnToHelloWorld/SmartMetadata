# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import base64
from typing import Any

import pytest

from smartmetadata_airflow_apis.app import create_app
from smartmetadata_airflow_apis.contracts import API_PREFIXES, ENDPOINTS
from smartmetadata_airflow_apis.store import MemoryDagStore

CREDS = ("admin", "admin-pass")


def _auth_headers() -> dict[str, str]:
    token = base64.b64encode(f"{CREDS[0]}:{CREDS[1]}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


class _RecordingStore(MemoryDagStore):
    """Memory store that records whether deploy was ever called."""

    def __init__(self) -> None:
        super().__init__()
        self.deploy_calls: list[dict] = []

    def deploy(self, pipeline: dict) -> str:
        self.deploy_calls.append(pipeline)
        return super().deploy(pipeline)


def _deploy_body(source_config: dict | None = None, name: str = "scope_demo") -> dict:
    # Entity form (ruling §3.1, fix-round): top-level sourceConfig +
    # service reference; the deploy validation requires the entity
    # fields (sourceConfig, service, airflowConfig, jwtToken), so the
    # scope tests below only ever fail on the scope itself.
    return {
        "name": name,
        "pipelineType": "metadata",
        "service": {"type": "databaseService", "name": "my_sql_test"},
        "sourceConfig": {"config": source_config or {}},
        "openMetadataServerConnection": {
            "hostPort": "http://openmetadata-server:8585/api",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
        "airflowConfig": {},
    }


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
            "service": {"type": "databaseService", "name": "my_sql_test"},
            "sourceConfig": {"config": {}},
            "openMetadataServerConnection": {
                "hostPort": "http://openmetadata-server:8585/api",
                "securityConfig": {"jwtToken": "test-jwt"},
            },
            "airflowConfig": {},
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


# --- Deploy-time scope validation (ruling §4.2, fix-round B-1) -----------
# T-1 (tableFilterPattern), T-2 (includeViews false) and non-literal
# schema/database patterns must fail at deploy with a 400 naming only
# the field location — before any file is written, so no broken DAG file
# is left behind for the dag-processor to trip over.


@pytest.mark.parametrize(
    ("config", "field", "leaked"),
    [
        (
            {"tableFilterPattern": {"includes": ["orders"]}},
            "sourceConfig.config.tableFilterPattern",
            "orders",
        ),
        (
            {"tableFilterPattern": {"excludes": ["tmp_*"]}},
            "sourceConfig.config.tableFilterPattern",
            "tmp_*",
        ),
        (
            {"includeViews": False},
            "sourceConfig.config.includeViews",
            "False",
        ),
        (
            {"schemaFilterPattern": {"includes": ["prod.*"]}},
            "sourceConfig.config.schemaFilterPattern",
            "prod.*",
        ),
        (
            {"schemaFilterPattern": {"includes": ["^my.db$"]}},
            "sourceConfig.config.schemaFilterPattern",
            "my.db",
        ),
        (
            {"databaseFilterPattern": {"includes": ["db|other"]}},
            "sourceConfig.config.databaseFilterPattern",
            "db|other",
        ),
        (
            {"schemaFilterPattern": {"excludes": [".*"]}},
            "sourceConfig.config.schemaFilterPattern",
            ".*",
        ),
        (
            {"schemaFilterPattern": "sales"},
            "sourceConfig.config.schemaFilterPattern",
            "sales",
        ),
        (
            {"databaseFilterPattern": "analytics"},
            "sourceConfig.config.databaseFilterPattern",
            "analytics",
        ),
        (
            {"tableFilterPattern": "orders"},
            "sourceConfig.config.tableFilterPattern",
            "orders",
        ),
    ],
)
def test_deploy_rejects_out_of_scope_config_before_writing(
    config: dict, field: str, leaked: str
) -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=_deploy_body(config),
        headers=_auth_headers(),
    )
    assert res.status_code == 400
    error = res.get_json()["error"]
    assert field in error
    # §2.3: the error names only the field location — never the value.
    assert leaked not in error
    # Nothing was written: the store's deploy never ran.
    assert store.deploy_calls == []


def test_deploy_scope_reports_all_violations() -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=_deploy_body(
            {
                "tableFilterPattern": {"includes": ["orders"]},
                "includeViews": False,
                "schemaFilterPattern": {"includes": ["prod.*"]},
            }
        ),
        headers=_auth_headers(),
    )
    assert res.status_code == 400
    error = res.get_json()["error"]
    assert "sourceConfig.config.tableFilterPattern" in error
    assert "sourceConfig.config.includeViews" in error
    assert "sourceConfig.config.schemaFilterPattern" in error
    assert store.deploy_calls == []


@pytest.mark.parametrize(
    "config",
    [
        {},
        {"schemaFilterPattern": {"includes": ["sales"]}},
        {"schemaFilterPattern": {"includes": ["^sales$"]}},
        {"schemaFilterPattern": {"includes": [".*"]}},
        {"schemaFilterPattern": {"includes": [".*"], "excludes": ["tmp"]}},
        {"databaseFilterPattern": {"includes": ["analytics"]}},
        {"databaseFilterPattern": {"excludes": ["^staging$"]}},
        {"includeViews": True},
        {"tableFilterPattern": {}},
        {"tableFilterPattern": {"includes": [], "excludes": []}},
    ],
)
def test_deploy_accepts_expressible_scope(config: dict) -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=_deploy_body(config),
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert len(store.deploy_calls) == 1


# --- Entity-form deploy (ruling §3.1, fix-round) ---------------------------
# The deploy body is the IngestionPipeline entity the server sends
# (top-level sourceConfig + service). The stored config is the entity
# as sent; the old workflow-config form (top-level "source", no
# sourceConfig/service) is rejected, and so is an entity missing a
# required field — all before any file is written.


def test_deploy_accepts_entity_form_and_stores_it_verbatim() -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=_deploy_body(),
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert len(store.deploy_calls) == 1
    stored = store.deploy_calls[0]
    assert stored["sourceConfig"] == {"config": {}}
    assert stored["service"] == {"type": "databaseService", "name": "my_sql_test"}
    assert "source" not in stored


def test_deploy_rejects_workflow_config_form() -> None:
    # The old shape: top-level "source", no top-level sourceConfig or
    # service. The official deploy route parses the payload as the
    # entity, so this form is rejected — not silently accepted.
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json={
            "name": "scope_demo",
            "pipelineType": "metadata",
            "source": {
                "type": "mysql",
                "serviceName": "my_sql_test",
                "sourceConfig": {"config": {}},
            },
            "openMetadataServerConnection": {
                "hostPort": "http://openmetadata-server:8585/api",
                "securityConfig": {"jwtToken": "test-jwt"},
            },
            "airflowConfig": {},
        },
        headers=_auth_headers(),
    )
    assert res.status_code == 400
    assert "Missing: sourceConfig" in res.get_json()["error"]
    assert store.deploy_calls == []


@pytest.mark.parametrize(
    ("mutate", "field"),
    [
        (lambda b: b.pop("service"), "Missing: service"),
        (lambda b: b.pop("sourceConfig"), "Missing: sourceConfig"),
        (
            lambda b: b["openMetadataServerConnection"].pop("securityConfig"),
            "Missing: openMetadataServerConnection.securityConfig",
        ),
        (
            lambda b: b["openMetadataServerConnection"].__setitem__(
                "securityConfig", {}
            ),
            "Missing: openMetadataServerConnection.securityConfig.jwtToken",
        ),
        (lambda b: b.pop("airflowConfig"), "Missing: airflowConfig"),
    ],
)
def test_deploy_rejects_entity_missing_required_field(mutate: Any, field: str) -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    body = _deploy_body()
    mutate(body)
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=body,
        headers=_auth_headers(),
    )
    assert res.status_code == 400
    assert field in res.get_json()["error"]
    assert store.deploy_calls == []


# --- Raw pipeline names at the dag_id boundary (ruling §1.5, fix-round B-5) ---
# Official cleans every request dag_id at the API boundary
# (get_request_dag_id / get_arg_dag_id -> clean_dag_id); the server sends
# the raw pipeline name (AirflowRESTClient puts ingestionPipeline.getName()
# as DAG_ID). A pipeline whose name needs cleaning must answer under its
# raw name on every dag_id route.


def test_dag_id_routes_accept_raw_pipeline_name() -> None:
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    deploy = client.post(
        f"{prefix}/deploy", json=_deploy_body(name="my.pipe"), headers=_auth_headers()
    )
    assert deploy.status_code == 200
    assert "[my_pipe]" in deploy.get_json()["message"]

    # Trigger under the raw name, as the server sends it.
    trigger = client.post(
        f"{prefix}/trigger", json={"dag_id": "my.pipe"}, headers=_auth_headers()
    )
    assert trigger.status_code == 200
    message = trigger.get_json()["message"]
    assert message.startswith("Workflow [my_pipe] has been triggered")
    triggered_run_id = message.rsplit(" ", 1)[-1]

    # Status under the raw name sees the run the trigger created, with the
    # run id derived from the cleaned dag id.
    status = client.get(
        f"{prefix}/status", query_string={"dag_id": "my.pipe"}, headers=_auth_headers()
    )
    assert status.status_code == 200
    runs = status.get_json()
    assert len(runs) == 1
    assert runs[0]["runId"] == triggered_run_id

    # Enable/disable under the raw name, too.
    assert (
        client.post(
            f"{prefix}/disable", json={"dag_id": "my.pipe"}, headers=_auth_headers()
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{prefix}/enable", json={"dag_id": "my.pipe"}, headers=_auth_headers()
        ).status_code
        == 200
    )


def test_delete_accepts_raw_pipeline_name() -> None:
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    deploy = client.post(
        f"{prefix}/deploy", json=_deploy_body(name="my.pipe"), headers=_auth_headers()
    )
    assert deploy.status_code == 200
    deleted = client.delete(
        f"{prefix}/delete",
        query_string={"dag_id": "my.pipe"},
        headers=_auth_headers(),
    )
    assert deleted.status_code == 200
    # The DAG is gone: status under the raw name is a 404 now.
    status = client.get(
        f"{prefix}/status", query_string={"dag_id": "my.pipe"}, headers=_auth_headers()
    )
    assert status.status_code == 404


def test_kill_accepts_raw_pipeline_name() -> None:
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    assert (
        client.post(
            f"{prefix}/deploy",
            json=_deploy_body(name="my.pipe"),
            headers=_auth_headers(),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{prefix}/trigger", json={"dag_id": "my.pipe"}, headers=_auth_headers()
        ).status_code
        == 200
    )
    killed = client.post(
        f"{prefix}/kill", json={"dag_id": "my.pipe"}, headers=_auth_headers()
    )
    assert killed.status_code == 200
    status = client.get(
        f"{prefix}/status", query_string={"dag_id": "my.pipe"}, headers=_auth_headers()
    )
    assert status.status_code == 200
    assert status.get_json()[0]["pipelineState"] == "failed"


def test_last_dag_logs_accepts_raw_pipeline_name() -> None:
    store = MemoryDagStore()
    client = create_app(store, credentials=CREDS).test_client()
    prefix = "/api/v1/openmetadata"

    assert (
        client.post(
            f"{prefix}/deploy",
            json=_deploy_body(name="my.pipe"),
            headers=_auth_headers(),
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{prefix}/trigger", json={"dag_id": "my.pipe"}, headers=_auth_headers()
        ).status_code
        == 200
    )
    store.set_log("my_pipe", "ingestion_task", "hello logs")
    logs = client.get(
        f"{prefix}/last_dag_logs",
        query_string={"dag_id": "my.pipe", "task_id": "ingestion_task"},
        headers=_auth_headers(),
    )
    assert logs.status_code == 200
    assert logs.get_json()["ingestion_task"] == "hello logs"


# --- Malformed sourceConfig/config/includes shapes (fix-round N-11) --------
# Same failure family as N-10, one level up: a malformed shape must be a
# 400 naming only the field location, before any file is written — never
# a 500 at DAG-parse time (sourceConfig), a 200 that writes a broken DAG
# (config), or a silent wrong scope (string includes iterated per char).


def _deploy_body_with_source_config(source_config: Any) -> dict:
    body = _deploy_body()
    body["sourceConfig"] = source_config
    return body


@pytest.mark.parametrize(
    ("source_config", "field"),
    [
        ("oops", "sourceConfig"),
        (["x"], "sourceConfig"),
        ({"config": "oops"}, "sourceConfig.config"),
        (
            {"config": {"schemaFilterPattern": {"includes": "sales"}}},
            "sourceConfig.config.schemaFilterPattern",
        ),
        (
            {"config": {"databaseFilterPattern": {"excludes": "staging"}}},
            "sourceConfig.config.databaseFilterPattern",
        ),
        (
            {"config": {"schemaFilterPattern": {"includes": 123}}},
            "sourceConfig.config.schemaFilterPattern",
        ),
    ],
)
def test_deploy_rejects_malformed_source_config_shapes(
    source_config: Any, field: str
) -> None:
    store = _RecordingStore()
    client = create_app(store, credentials=CREDS).test_client()
    res = client.post(
        "/api/v1/openmetadata/deploy",
        json=_deploy_body_with_source_config(source_config),
        headers=_auth_headers(),
    )
    assert res.status_code == 400
    error = res.get_json()["error"]
    assert field in error
    # Nothing was written: no DAG file exists to be parsed, so the
    # malformed shape can no longer fail — or silently mis-scope, as a
    # string includes would by iterating per character — at DAG-parse time.
    assert store.deploy_calls == []
