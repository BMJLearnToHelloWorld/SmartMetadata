# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for the automation executor (ruling §4.4, U-4).

The live MySQL path (real pymysql against a protocol stub) is covered by
the step-4 gate; these tests pin the dispatch, the re-fetch authority and
the localhost retry with injected connection factories.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.automations.execute import (
    AutomationError,
    execute_automation_workflow,
)
from smartmetadata_ingestion.connectors import mysql_common
from smartmetadata_ingestion.errors import WorkflowError


class FakeCursor:
    def __init__(self) -> None:
        self.sql: str | None = None
        self.closed = False

    def execute(self, sql, params=()):  # type: ignore[no-untyped-def]
        self.sql = sql

    def fetchone(self):
        return (1,)

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


def _workflow(
    *,
    name: str = "test_conn",
    workflow_type: str = "TEST_CONNECTION",
    service_type: str = "MySQL",
    host_port: str = "db.example:3306",
    password: str = "secret",
) -> dict:
    return {
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


def test_unknown_service_type_fails(monkeypatch) -> None:
    _fake_mysql(monkeypatch, FakeCursor())
    with pytest.raises(AutomationError, match="NoSuchService"):
        execute_automation_workflow(
            _workflow(service_type="NoSuchService"), fetch_workflow=None
        )


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


def test_mysql_success_runs_select_1(monkeypatch) -> None:
    cursor = _fake_mysql(monkeypatch, FakeCursor())
    execute_automation_workflow(_workflow(), fetch_workflow=None)
    assert cursor.sql == "SELECT 1"
    assert cursor.closed is True


def test_mysql_localhost_retries_as_docker_host(monkeypatch) -> None:
    seen: list[str] = []

    def fake_connect(config):
        host_port = str(config.get("hostPort") or "")
        seen.append(host_port)
        if "localhost" in host_port:
            raise WorkflowError("connection refused")
        return lambda: FakeConnection(FakeCursor())

    monkeypatch.setattr(mysql_common, "mysql_connect", fake_connect)
    execute_automation_workflow(
        _workflow(host_port="localhost:3306"), fetch_workflow=None
    )
    assert seen == ["localhost:3306", "host.docker.internal:3306"]


def test_mysql_non_localhost_failure_does_not_retry(monkeypatch) -> None:
    seen: list[str] = []

    def fake_connect(config):
        seen.append(str(config.get("hostPort")))
        raise WorkflowError("connection refused")

    monkeypatch.setattr(mysql_common, "mysql_connect", fake_connect)
    with pytest.raises(WorkflowError, match="connection refused"):
        execute_automation_workflow(
            _workflow(host_port="db.example:3306"), fetch_workflow=None
        )
    assert seen == ["db.example:3306"]


def test_fetched_workflow_is_authoritative(monkeypatch) -> None:
    # The posted body is unexecutable (unknown type); the fetched workflow
    # carries the real MySQL connection and must be what runs.
    cursor = _fake_mysql(monkeypatch, FakeCursor())
    fetched = _workflow(service_type="MySQL", password="decrypted-pass")
    calls: list[tuple[str, dict]] = []

    def fetch(name, server_connection):
        calls.append((name, server_connection))
        return fetched

    execute_automation_workflow(
        _workflow(service_type="NoSuchService"), fetch_workflow=fetch
    )
    assert cursor.sql == "SELECT 1"
    assert calls[0][0] == "test_conn"
    assert calls[0][1]["securityConfig"]["jwtToken"] == "jwt"


def test_fetch_failure_is_a_500() -> None:
    def fetch(name, server_connection):
        raise AutomationError("server unreachable")

    with pytest.raises(AutomationError, match="server unreachable"):
        execute_automation_workflow(_workflow(), fetch_workflow=fetch)
