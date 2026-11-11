# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for the automation executor (ruling §4.4, U-4).

The runner is definition-driven (ADR:2026-11-11-test-connection-failed-steps-are-results):
it fetches the TestConnectionDefinition from the server, runs its steps in
order against the MySQL checks, and patches the workflow with the result.
These tests pin that contract with injected connection factories, a fake
definition, and a recording patch — the live MySQL path (real pymysql
against a protocol stub) is covered by the step-4 gate.
"""

from __future__ import annotations

import pytest

import smartmetadata_ingestion.automations.execute as execute
from smartmetadata_ingestion.automations.execute import (
    AutomationError,
    UnsupportedServiceTypeError,
    execute_automation_workflow,
)
from smartmetadata_ingestion.connectors import mysql_common
from smartmetadata_ingestion.errors import WorkflowError

# Pin-faithful MySQL definition
# (openmetadata-service/.../json/data/testConnections/database/mysql.json).
MYSQL_DEFINITION = {
    "name": "Mysql",
    "steps": [
        {
            "name": "CheckAccess",
            "description": (
                "Validate that we can properly reach the database and "
                "authenticate with the given credentials."
            ),
            "errorMessage": "Failed to connect to mysql, please validate the credentials",
            "shortCircuit": True,
            "category": "ConnectionGate",
            "mandatory": True,
        },
        {
            "name": "GetSchemas",
            "description": "List all the schemas available to the user.",
            "errorMessage": (
                "Failed to fetch schemas, please validate if the user has "
                "enough privilege to fetch schemas."
            ),
            "mandatory": True,
        },
        {
            "name": "GetTables",
            "description": (
                "From a given schema, list the tables belonging to that schema. "
                "If no schema is specified, we'll list the tables of a random schema."
            ),
            "errorMessage": (
                "Failed to fetch tables, please validate if the user has "
                "enough privilege to fetch tables."
            ),
            "mandatory": True,
        },
        {
            "name": "GetViews",
            "description": (
                "From a given schema, list the views belonging to that schema. "
                "If no schema is specified, we'll list the tables of a random schema."
            ),
            "errorMessage": (
                "Failed to fetch views, please validate if user can access "
                "the mysql.general_log table to get query logs."
            ),
            "mandatory": False,
        },
        {
            "name": "GetQueries",
            "description": (
                "Check if we can access the mysql.general_log table to get query logs, "
                "These queries are analyzed in the usage & lineage workflow."
            ),
            "errorMessage": (
                "Failed to fetch queries, please validate if user can access "
                "the mysql.general_log table to get query logs."
            ),
            "mandatory": False,
        },
    ],
}


class FakeCursor:
    """Routes SQL to canned rows: schemata / tables / views / anything else."""

    def __init__(
        self,
        *,
        schemas=(("mydb",), ("information_schema",), ("mysql",)),
        tables=(("mydb", "orders", "BASE TABLE", ""),),
        views=(("mydb", "order_view", "SELECT 1"),),
    ):
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._views = list(views)
        self.statements: list[str] = []
        self.closed = False

    def execute(self, sql, params=()):  # type: ignore[no-untyped-def]
        self.statements.append(sql)

    def fetchone(self):
        return (1,)

    def fetchall(self):
        sql = self.statements[-1] if self.statements else ""
        if "information_schema.schemata" in sql:
            return list(self._schemas)
        if "information_schema.tables" in sql:
            return list(self._tables)
        if "information_schema.views" in sql:
            return list(self._views)
        return []

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def cursor(self) -> FakeCursor:
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


@pytest.fixture
def fake_definition(monkeypatch):
    """The executor fetches the definition from the server; tests fake it."""
    monkeypatch.setattr(
        execute,
        "fetch_test_connection_definition",
        lambda service_type, server_connection, *, client=None: MYSQL_DEFINITION,
    )


@pytest.fixture
def patch_calls(monkeypatch):
    """Record the workflow patches (status + step names + result status)."""
    calls: list[dict] = []

    def patch(workflow_id, result, status, server_connection, *, client=None):
        calls.append(
            {
                "workflow_id": workflow_id,
                "status": status,
                "steps": [step["name"] for step in result["steps"]],
                "result_status": result["status"],
            }
        )

    monkeypatch.setattr(execute, "patch_workflow_response", patch)
    return calls


def _workflow(
    *,
    name: str = "test_conn",
    workflow_type: str = "TEST_CONNECTION",
    service_type: str = "Mysql",
    host_port: str = "db.example:3306",
    password: str = "secret",
) -> dict:
    return {
        "id": "w1",
        "name": name,
        "workflowType": workflow_type,
        "request": {
            "connection": {
                "config": {
                    "type": service_type,
                    "hostPort": host_port,
                    "username": "ingest",
                    "authType": {"password": password},
                }
            },
            "serviceType": "Database",
            "connectionType": service_type,
        },
        "openMetadataServerConnection": {
            "hostPort": "http://server:8585/api",
            "authProvider": "no-auth",
            "securityConfig": {"jwtToken": "jwt"},
        },
    }


def _fake_mysql(monkeypatch, cursor: FakeCursor):
    """Point mysql_connect at a fake factory returning FakeConnection."""
    monkeypatch.setattr(
        mysql_common, "mysql_connect", lambda config: lambda: FakeConnection(cursor)
    )
    return cursor


def test_unknown_service_type_fails(monkeypatch, fake_definition) -> None:
    _fake_mysql(monkeypatch, FakeCursor())
    with pytest.raises(UnsupportedServiceTypeError, match="NoSuchService"):
        execute_automation_workflow(_workflow(service_type="NoSuchService"), fetch_workflow=None)


def test_non_test_connection_workflow_type_fails() -> None:
    with pytest.raises(AutomationError, match="REVERSE_INGESTION"):
        execute_automation_workflow(
            _workflow(workflow_type="REVERSE_INGESTION"), fetch_workflow=None
        )


def test_request_without_connection_fails() -> None:
    body = _workflow()
    del body["request"]["connection"]
    with pytest.raises(AutomationError, match="no connection"):
        execute_automation_workflow(body, fetch_workflow=None)


def test_mysql_success_runs_all_five_steps(monkeypatch, fake_definition, patch_calls) -> None:
    cursor = _fake_mysql(monkeypatch, FakeCursor())
    result = execute_automation_workflow(_workflow(), fetch_workflow=None)
    assert result["status"] == "Successful"
    assert [step["name"] for step in result["steps"]] == [
        "CheckAccess",
        "GetSchemas",
        "GetTables",
        "GetViews",
        "GetQueries",
    ]
    assert all(step["passed"] for step in result["steps"])
    assert all(step["status"] == "Passed" for step in result["steps"])
    assert result["steps"][0]["executedCommand"] == "SELECT 1"
    assert result["steps"][0]["resultSummary"] == "connection established"
    assert result["steps"][1]["resultSummary"] == "3 schemas enumerated"
    assert result["steps"][2]["resultSummary"] == (
        "1 table in schema 'mydb', auto-selected because no databaseSchema was configured"
    )
    assert result["steps"][3]["resultSummary"] == (
        "1 view in schema 'mydb', auto-selected because no databaseSchema was configured"
    )
    assert result["steps"][4]["resultSummary"] == "query history accessible"
    assert any("SELECT 1" in sql for sql in cursor.statements)
    assert cursor.closed is True
    # The workflow is patched after each step (Running) and finally (Successful).
    assert [call["status"] for call in patch_calls] == ["Running"] * 5 + ["Successful"]
    assert all(call["workflow_id"] == "w1" for call in patch_calls)
    assert patch_calls[-1]["result_status"] == "Successful"


def test_mysql_connection_failure_is_a_failed_result(
    monkeypatch, fake_definition, patch_calls
) -> None:
    # Retargeted (same strength): the non-localhost failure still does not
    # retry — but it is now a Failed test result, not an exception.
    seen: list[str] = []

    def fake_connect(config):
        seen.append(str(config.get("hostPort")))
        raise WorkflowError("connection refused")

    monkeypatch.setattr(mysql_common, "mysql_connect", fake_connect)
    result = execute_automation_workflow(
        _workflow(host_port="db.example:3306"), fetch_workflow=None
    )
    assert seen == ["db.example:3306"]
    assert result["status"] == "Failed"
    assert result["steps"][0]["name"] == "CheckAccess"
    assert result["steps"][0]["passed"] is False
    assert result["steps"][0]["status"] == "Failed"
    assert "connection refused" in (result["steps"][0]["errorLog"] or "")
    assert all(step["status"] == "Skipped" for step in result["steps"][1:])
    assert all(step["skipReason"] == "ConnectionNotEstablished" for step in result["steps"][1:])
    assert patch_calls[-1]["status"] == "Failed"


def test_mysql_localhost_retries_as_docker_host(monkeypatch, fake_definition, patch_calls) -> None:
    seen: list[str] = []

    def fake_connect(config):
        host_port = str(config.get("hostPort") or "")
        seen.append(host_port)
        if "localhost" in host_port:
            raise WorkflowError("connection refused")
        return lambda: FakeConnection(FakeCursor())

    monkeypatch.setattr(mysql_common, "mysql_connect", fake_connect)
    result = execute_automation_workflow(_workflow(host_port="localhost:3306"), fetch_workflow=None)
    assert seen == ["localhost:3306", "host.docker.internal:3306"]
    assert result["status"] == "Successful"


def test_fetched_workflow_is_authoritative(monkeypatch, fake_definition, patch_calls) -> None:
    # The posted body is unexecutable (unknown type); the fetched workflow
    # carries the real MySQL connection and must be what runs.
    cursor = _fake_mysql(monkeypatch, FakeCursor())
    fetched = _workflow(service_type="Mysql", password="decrypted-pass")
    calls: list[tuple[str, dict]] = []

    def fetch(name, server_connection):
        calls.append((name, server_connection))
        return fetched

    result = execute_automation_workflow(
        _workflow(service_type="NoSuchService"), fetch_workflow=fetch
    )
    assert result["status"] == "Successful"
    assert any("SELECT 1" in sql for sql in cursor.statements)
    assert calls[0][0] == "test_conn"
    assert calls[0][1]["securityConfig"]["jwtToken"] == "jwt"


def test_fetch_failure_is_a_500() -> None:
    def fetch(name, server_connection):
        raise AutomationError("server unreachable")

    with pytest.raises(AutomationError, match="server unreachable"):
        execute_automation_workflow(_workflow(), fetch_workflow=fetch)


def test_missing_check_is_skipped_not_a_crash(monkeypatch, fake_definition, patch_calls) -> None:
    _fake_mysql(monkeypatch, FakeCursor())
    definition = {
        "name": "Mysql",
        "steps": [
            {
                "name": "CheckAccess",
                "description": "reach the database",
                "category": "ConnectionGate",
                "mandatory": True,
            },
            {
                "name": "GetTags",
                "description": "no such check",
                "category": "Capability",
                "mandatory": True,
            },
        ],
    }
    monkeypatch.setattr(
        execute,
        "fetch_test_connection_definition",
        lambda service_type, server_connection, *, client=None: definition,
    )
    result = execute_automation_workflow(_workflow(), fetch_workflow=None)
    assert result["steps"][1]["status"] == "Skipped"
    assert result["steps"][1]["skipReason"] == "NotImplemented"
    assert result["steps"][1]["passed"] is False
    # A mandatory step that did not run fails the whole test.
    assert result["status"] == "Failed"


def test_empty_catalog_is_a_warning_not_a_failure(
    monkeypatch, fake_definition, patch_calls
) -> None:
    _fake_mysql(monkeypatch, FakeCursor(schemas=(), tables=(), views=()))
    result = execute_automation_workflow(_workflow(), fetch_workflow=None)
    assert result["status"] == "Successful"
    schemas = result["steps"][1]
    assert schemas["passed"] is True
    assert schemas["status"] == "Warning"
    assert schemas["resultSummary"] == "no schemas enumerated"
    assert (schemas["diagnosis"] or {}).get("title") == "No schemas visible in the database"
    tables = result["steps"][2]
    assert tables["passed"] is True
    assert tables["status"] == "Warning"
    assert tables["resultSummary"] == "no tables enumerated"
    views = result["steps"][3]
    assert views["passed"] is True
    assert views["status"] == "Passed"
    assert views["resultSummary"] == "no views enumerated"


def test_definition_without_steps_is_a_500(monkeypatch) -> None:
    _fake_mysql(monkeypatch, FakeCursor())
    monkeypatch.setattr(
        execute,
        "fetch_test_connection_definition",
        lambda service_type, server_connection, *, client=None: {
            "name": "Mysql",
            "steps": [],
        },
    )
    with pytest.raises(AutomationError, match="no steps"):
        execute_automation_workflow(_workflow(), fetch_workflow=None)


def test_patch_failure_does_not_fail_the_run(monkeypatch) -> None:
    """The write-back never raises (pin patch_automation_workflow_response)."""

    class _FailingClient:
        def patch_automation_workflow_response(self, *args, **kwargs):
            raise RuntimeError("server rejected the patch")

        def close(self) -> None:
            return None

    execute.patch_workflow_response(
        "w1",
        {"status": "Successful", "steps": []},
        "Successful",
        {"securityConfig": {"jwtToken": "jwt"}},
        client=_FailingClient(),
    )
