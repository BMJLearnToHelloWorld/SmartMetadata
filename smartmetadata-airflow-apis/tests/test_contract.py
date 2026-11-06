# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Contract tests for the 13 Airflow plugin routes (ruling §2.1).

These pin the exact shapes the Java AirflowRESTClient expects: methods,
paths (three prefixes, all carrying the ``/openmetadata`` segment),
request bodies, success bodies and failure codes. They run against the
standalone Flask app with the in-memory backend; the production Airflow
backend must satisfy the same contract (see ruling §5.2).

Written first (step 0) and red until each implementation step lands.
"""

from __future__ import annotations

import base64
import uuid

import pytest

from smartmetadata_airflow_apis.app import create_app
from smartmetadata_airflow_apis.contracts import API_PREFIXES
from smartmetadata_airflow_apis.store import MemoryDagStore

CREDS = ("admin", "admin-pass")


def _auth_headers() -> dict[str, str]:
    token = base64.b64encode(f"{CREDS[0]}:{CREDS[1]}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _bad_auth_headers() -> dict[str, str]:
    token = base64.b64encode(b"admin:wrong-pass").decode()
    return {"Authorization": f"Basic {token}"}


def _pipeline(name: str = "my_pipeline", pipeline_type: str = "metadata") -> dict:
    return {
        "id": None,
        "name": name,
        "displayName": "MyPipeline",
        "description": "My Description",
        "pipelineType": pipeline_type,
        "fullyQualifiedName": f"service.{name}",
        "source": {
            "type": "mysql",
            "serviceName": "my_sql_test",
            "serviceConnection": {
                "config": {
                    "type": "MySQL",
                    "scheme": "mysql+pymysql",
                    "username": "openmetadata_user",
                    "authType": {"password": "openmetadata_password"},
                    "hostPort": "localhost:3306",
                }
            },
            "sourceConfig": {
                "config": {
                    "markDeletedTables": True,
                    "includeViews": True,
                    "generateSampleData": True,
                }
            },
        },
        "openMetadataServerConnection": {
            "hostPort": "http://openmetadata-server:8585/api",
            "authProvider": "no-auth",
            "securityConfig": None,
        },
        "airflowConfig": {
            "forceDeploy": True,
            "pausePipeline": False,
            "concurrency": 1,
            "retries": 3,
            "retryDelay": 300,
            "pipelineCatchup": False,
            "scheduleInterval": None,
            "pipelineTimeout": 60,
            "maxActiveRuns": 1,
            "workflowTimeout": 60,
        },
        "service": {"name": "my_sql_test", "type": "databaseService"},
        "deleted": False,
    }


@pytest.fixture()
def client():
    app = create_app(MemoryDagStore(), credentials=CREDS)
    return app.test_client()


def test_all_thirteen_routes_on_all_prefixes(client) -> None:
    for prefix in API_PREFIXES:
        assert "/openmetadata" in prefix
        assert client.get(f"{prefix}/health").status_code == 200
        assert client.get(f"{prefix}/health-auth", headers=_auth_headers()).status_code == 200
        assert client.get(f"{prefix}/csrf-token", headers=_auth_headers()).status_code == 200
        assert client.get(f"{prefix}/ip", headers=_auth_headers()).status_code == 200


def test_health_is_public_and_reports_release_version(client) -> None:
    for prefix in API_PREFIXES:
        res = client.get(f"{prefix}/health")
        assert res.status_code == 200
        body = res.get_json()
        assert body["status"] == "healthy"
        # U-1: the server compares major.minor against its own 2.0.0-SNAPSHOT.
        assert body["version"] == "2.0.0-SNAPSHOT"


def test_health_auth_requires_basic_auth(client) -> None:
    for prefix in API_PREFIXES:
        assert client.get(f"{prefix}/health-auth").status_code == 401
        assert client.get(f"{prefix}/health-auth", headers=_bad_auth_headers()).status_code == 401
        res = client.get(f"{prefix}/health-auth", headers=_auth_headers())
        assert res.status_code == 200
        # The server's version probe needs a "version" string on every prefix.
        assert res.get_json()["version"].startswith("2.0")


def test_read_only_user_gets_403_on_writes() -> None:
    from smartmetadata_airflow_apis.security import (
        READ,
        Authenticator,
        ExplicitCredentials,
        User,
    )

    class ReadOnlyAuthenticator(Authenticator):
        def authenticate(self, auth_header: str | None):  # type: ignore[no-untyped-def]
            user = super().authenticate(auth_header)
            if user is None:
                return None
            return User(username=user.username, permissions=frozenset({READ}))

    app = create_app(
        MemoryDagStore(),
        authenticator=ReadOnlyAuthenticator([ExplicitCredentials(*CREDS)]),
    )
    authed = app.test_client()
    # Reads pass; a write (deploy needs CREATE) is refused with 403.
    assert (
        authed.get("/api/v2/openmetadata/status", headers=_auth_headers()).status_code
        == 400  # missing dag_id, but auth passed
    )
    assert (
        authed.post(
            "/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers()
        ).status_code
        == 403
    )


def test_csrf_token_returns_a_token_for_authenticated_calls(client) -> None:
    res = client.get("/api/v2/openmetadata/csrf-token", headers=_auth_headers())
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body["csrf_token"], str) and body["csrf_token"]
    assert client.get("/api/v2/openmetadata/csrf-token").status_code == 401


def test_deploy_success_shape_and_validation(client) -> None:
    res = client.post(
        "/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers()
    )
    assert res.status_code == 200
    assert res.get_json() == {"message": "Workflow [my_pipeline] has been created"}

    # Empty body -> 400.
    assert (
        client.post(
            "/api/v2/openmetadata/deploy", json={}, headers=_auth_headers()
        ).status_code
        == 400
    )
    # Missing name -> 400.
    bad = _pipeline()
    del bad["name"]
    assert (
        client.post(
            "/api/v2/openmetadata/deploy", json=bad, headers=_auth_headers()
        ).status_code
        == 400
    )
    # Unknown pipeline type -> 400.
    assert (
        client.post(
            "/api/v2/openmetadata/deploy",
            json=_pipeline(pipeline_type="not_a_type"),
            headers=_auth_headers(),
        ).status_code
        == 400
    )
    # Validation errors never echo input values (no secret leakage).
    leaky = _pipeline()
    leaky["openMetadataServerConnection"]["securityConfig"] = {
        "jwtToken": "SECRET_JWT_VALUE_MUST_NOT_LEAK"
    }
    leaky["pipelineType"] = "not_a_type"
    res = client.post(
        "/api/v2/openmetadata/deploy", json=leaky, headers=_auth_headers()
    )
    assert res.status_code == 400
    assert "SECRET_JWT_VALUE_MUST_NOT_LEAK" not in res.get_data(as_text=True)


def test_trigger_status_lifecycle(client) -> None:
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    run_id = str(uuid.uuid4())
    res = client.post(
        "/api/v2/openmetadata/trigger",
        json={"dag_id": "my_pipeline", "conf": {"pipelineRunId": run_id}},
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert res.get_json()["message"].startswith("Workflow [my_pipeline] has been triggered")

    status = client.get(
        "/api/v2/openmetadata/status",
        query_string={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert status.status_code == 200
    runs = status.get_json()
    assert len(runs) == 1
    # runId converges with the server-minted UUID; timestamps are millis.
    assert runs[0]["runId"] == run_id
    assert runs[0]["pipelineState"] == "queued"
    assert isinstance(runs[0]["startDate"], int) and runs[0]["startDate"] > 0
    assert isinstance(runs[0]["timestamp"], int) and runs[0]["timestamp"] > 0

    # only_queued=true keeps QUEUED runs.
    queued = client.get(
        "/api/v2/openmetadata/status",
        query_string={"dag_id": "my_pipeline", "only_queued": "true"},
        headers=_auth_headers(),
    )
    assert len(queued.get_json()) == 1

    # Unknown dag -> 404; missing dag_id -> 400.
    assert (
        client.get(
            "/api/v2/openmetadata/status",
            query_string={"dag_id": "nope"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )
    assert (
        client.get("/api/v2/openmetadata/status", headers=_auth_headers()).status_code
        == 400
    )


def test_trigger_unknown_dag_is_500_and_missing_dag_id_is_400(client) -> None:
    assert (
        client.post(
            "/api/v2/openmetadata/trigger",
            json={"dag_id": "nope"},
            headers=_auth_headers(),
        ).status_code
        == 500
    )
    assert (
        client.post(
            "/api/v2/openmetadata/trigger", json={}, headers=_auth_headers()
        ).status_code
        == 400
    )


def test_enable_disable_toggle(client) -> None:
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    res = client.post(
        "/api/v2/openmetadata/disable",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert res.get_json() == {"message": "DAG [my_pipeline] has been disabled"}
    res = client.post(
        "/api/v2/openmetadata/enable",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert res.get_json() == {"message": "DAG [my_pipeline] has been enabled"}
    assert (
        client.post(
            "/api/v2/openmetadata/enable",
            json={"dag_id": "nope"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )


def test_trigger_on_disabled_dag_still_succeeds(client) -> None:
    # Official trigger has no paused check: trigger_dag creates the run and
    # it waits queued until unpaused. Retargeted from the old 404 (see
    # ruling §3.5 item 14).
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    client.post(
        "/api/v2/openmetadata/disable",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    res = client.post(
        "/api/v2/openmetadata/trigger",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert res.status_code == 200


def test_kill_marks_runs_failed(client) -> None:
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    # No runs yet -> 404.
    assert (
        client.post(
            "/api/v2/openmetadata/kill",
            json={"dag_id": "my_pipeline"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )
    client.post(
        "/api/v2/openmetadata/trigger",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    res = client.post(
        "/api/v2/openmetadata/kill",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert res.get_json() == {"message": "Workflow [my_pipeline] has been killed"}
    status = client.get(
        "/api/v2/openmetadata/status",
        query_string={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert status.get_json()[0]["pipelineState"] == "failed"
    assert (
        client.post(
            "/api/v2/openmetadata/kill",
            json={"dag_id": "nope"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )


def test_delete_removes_dag(client) -> None:
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    res = client.delete(
        "/api/v2/openmetadata/delete",
        query_string={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert res.status_code == 200
    assert res.get_json() == {"message": "DAG [my_pipeline] has been deleted"}
    assert (
        client.get(
            "/api/v2/openmetadata/status",
            query_string={"dag_id": "my_pipeline"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )
    # Unknown dag -> 500: official delete only returns 200 when the DB
    # records AND both files are deleted (ruling §0.3); DagNotFound yields
    # 0 records, so the delete is incomplete -> server error.
    assert (
        client.delete(
            "/api/v2/openmetadata/delete",
            query_string={"dag_id": "nope"},
            headers=_auth_headers(),
        ).status_code
        == 500
    )


def test_last_dag_logs_shape(client) -> None:
    client.post("/api/v2/openmetadata/deploy", json=_pipeline(), headers=_auth_headers())
    # No runs yet -> 404.
    assert (
        client.get(
            "/api/v2/openmetadata/last_dag_logs",
            query_string={"dag_id": "my_pipeline", "task_id": "ingestion_task"},
            headers=_auth_headers(),
        ).status_code
        == 404
    )
    # Unknown task on a dag with runs -> 400.
    client.post(
        "/api/v2/openmetadata/trigger",
        json={"dag_id": "my_pipeline"},
        headers=_auth_headers(),
    )
    assert (
        client.get(
            "/api/v2/openmetadata/last_dag_logs",
            query_string={"dag_id": "my_pipeline", "task_id": "not_a_task"},
            headers=_auth_headers(),
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/v2/openmetadata/last_dag_logs",
            query_string={"dag_id": "my_pipeline"},
            headers=_auth_headers(),
        ).status_code
        == 400
    )


def test_ip_returns_an_ip_or_unknown(client) -> None:
    res = client.get("/api/v2/openmetadata/ip", headers=_auth_headers())
    assert res.status_code == 200
    assert "ip" in res.get_json()


def _automation_workflow(
    *,
    name: str = "test_conn",
    workflow_type: str = "TEST_CONNECTION",
    service_type: str = "NoSuchService",
) -> dict:
    # Official Workflow shape (entity/automations/workflow.json): the
    # connection lives under request.connection.config.
    return {
        "name": name,
        "workflowType": workflow_type,
        "request": {
            "connection": {
                "config": {
                    "type": service_type,
                    "hostPort": "localhost:3306",
                }
            },
            "serviceType": "Database",
            "connectionType": service_type,
        },
        "openMetadataServerConnection": {
            "hostPort": "http://127.0.0.1:9/api",
            "authProvider": "no-auth",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
    }


def test_run_automation_validates_and_executes(client) -> None:
    # Malformed workflow -> 400.
    assert (
        client.post(
            "/api/v2/openmetadata/run_automation",
            json={},
            headers=_auth_headers(),
        ).status_code
        == 400
    )
    # Well-formed but unexecutable service type -> 500 (execution failure).
    # Body-direct fetcher (None): no server exists in this test, so the
    # 500 must come from the executor's type dispatch, not a fetch failure.
    direct_app = create_app(MemoryDagStore(), credentials=CREDS, automation_fetcher=None)
    direct = direct_app.test_client()
    res = direct.post(
        "/api/v2/openmetadata/run_automation",
        json=_automation_workflow(),
        headers=_auth_headers(),
    )
    assert res.status_code == 500
    assert res.get_json() == {"error": "An unexpected problem occurred"}
    # Non-TEST_CONNECTION workflow type -> 500 (no executor for it).
    res = direct.post(
        "/api/v2/openmetadata/run_automation",
        json=_automation_workflow(workflow_type="REVERSE_INGESTION"),
        headers=_auth_headers(),
    )
    assert res.status_code == 500
    assert res.get_json() == {"error": "An unexpected problem occurred"}
    # Request without a connection -> 500 (well-formed, unexecutable).
    body = _automation_workflow()
    del body["request"]["connection"]
    res = direct.post(
        "/api/v2/openmetadata/run_automation",
        json=body,
        headers=_auth_headers(),
    )
    assert res.status_code == 500
    assert res.get_json() == {"error": "An unexpected problem occurred"}


def test_server_errors_never_leak_internals(client) -> None:
    res = client.post(
        "/api/v2/openmetadata/trigger",
        json={"dag_id": "nope"},
        headers=_auth_headers(),
    )
    assert res.status_code == 500
    assert res.get_json() == {"error": "An unexpected problem occurred"}
