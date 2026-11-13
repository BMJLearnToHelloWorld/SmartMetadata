# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for DorisChecks (pin ``test_connection_db_schema_sources``).

The checks run against an injected connect factory returning a fake
cursor, so no live Doris is needed; the executor-level dispatch (Doris
routes to DorisChecks) is covered in ``test_automation_execute.py``.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.automations import checks_common, mysql_checks
from smartmetadata_ingestion.automations.doris_checks import DorisChecks
from smartmetadata_ingestion.connectors import doris_common
from smartmetadata_ingestion.errors import WorkflowError


class FakeCursor:
    """Routes SQL to canned rows: schemata / tables / views / anything else."""

    def __init__(
        self,
        *,
        schemas=(("sales",), ("information_schema",), ("__internal_schema",)),
        tables=(("sales", "orders", "BASE TABLE", ""),),
        views=(("sales", "order_view", "SELECT 1"),),
        error: Exception | None = None,
    ):
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._views = list(views)
        self._error = error
        self.calls: list[tuple[str, tuple]] = []
        self.closed = False

    def execute(self, sql, params=()):  # type: ignore[no-untyped-def]
        self.calls.append((sql, params))
        if self._error is not None:
            raise self._error

    def fetchone(self):
        return (1,)

    def fetchall(self):
        sql = self.calls[-1][0] if self.calls else ""
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


def _config(**extra):
    base = {
        "hostPort": "db.example:9030",
        "username": "root",
        "password": "secret",
        "databaseName": "default",
    }
    base.update(extra)
    return base


def _checks(cursor: FakeCursor, **config_extra) -> DorisChecks:
    return DorisChecks(_config(**config_extra), connect=lambda: FakeConnection(cursor))


def test_checks_are_exactly_the_four_definition_steps() -> None:
    checks = DorisChecks(_config(), connect=lambda: FakeConnection(FakeCursor())).checks()
    assert list(checks) == ["CheckAccess", "GetSchemas", "GetTables", "GetViews"]
    assert "GetQueries" not in checks


def test_happy_path_summaries() -> None:
    cursor = FakeCursor()
    checks = _checks(cursor).checks()
    access = checks["CheckAccess"]()
    assert access.summary == "connection established"
    assert access.command == "SELECT 1"
    assert access.caveat is None
    schemas = checks["GetSchemas"]()
    assert schemas.summary == "3 schemas enumerated"
    assert schemas.caveat is None
    tables = checks["GetTables"]()
    assert tables.summary == (
        "1 table in schema 'sales', auto-selected because no databaseSchema was configured"
    )
    assert tables.caveat is None
    views = checks["GetViews"]()
    assert views.summary == (
        "1 view in schema 'sales', auto-selected because no databaseSchema was configured"
    )
    assert views.caveat is None
    assert cursor.closed is True


def test_configured_schema_is_used_without_auto_selection() -> None:
    cursor = FakeCursor()
    tables = _checks(cursor, databaseSchema="sales").get_tables()
    assert tables.summary == "1 table in schema 'sales'"
    tables_calls = [call for call in cursor.calls if "information_schema.tables" in call[0]]
    assert len(tables_calls) == 1
    assert tables_calls[0][1] == ("sales",)


def test_auto_selection_skips_doris_system_schemas() -> None:
    # __internal_schema is a Doris system schema (not a MySQL one): if
    # resolution used the MySQL set it would be auto-selected instead.
    cursor = FakeCursor(
        schemas=(("__internal_schema",), ("information_schema",), ("sales",)),
    )
    tables = _checks(cursor).get_tables()
    assert tables.summary == (
        "1 table in schema 'sales', auto-selected because no databaseSchema was configured"
    )


def test_connected_database_is_the_fallback_schema() -> None:
    cursor = FakeCursor(schemas=(("information_schema",), ("__internal_schema",)))
    tables = _checks(cursor).get_tables()
    assert tables.summary == "1 table in schema 'default'"


def test_no_schema_at_all_enumerates_nothing() -> None:
    cursor = FakeCursor(schemas=(("information_schema",),), tables=(), views=())
    checks = DorisChecks(
        {"hostPort": "db.example:9030", "username": "root"},
        connect=lambda: FakeConnection(cursor),
    )
    tables = checks.get_tables()
    assert tables.summary == "no tables enumerated"
    assert tables.caveat is not None
    assert tables.caveat.title == "No tables visible in the database"
    assert not [call for call in cursor.calls if "information_schema.tables" in call[0]]


def test_empty_schemas_carry_a_caveat_and_empty_views_do_not() -> None:
    cursor = FakeCursor(schemas=(), tables=(), views=())
    checks = DorisChecks(
        {"hostPort": "db.example:9030", "username": "root"},
        connect=lambda: FakeConnection(cursor),
    )
    schemas = checks.get_schemas()
    assert schemas.summary == "no schemas enumerated"
    assert schemas.caveat is not None
    assert schemas.caveat.title == "No schemas visible in the database"
    views = checks.get_views()
    assert views.summary == "no views enumerated"
    assert views.caveat is None


def test_empty_tables_carry_a_schema_scoped_caveat() -> None:
    cursor = FakeCursor(tables=())
    tables = _checks(cursor, databaseSchema="sales").get_tables()
    assert tables.summary == "0 tables in schema 'sales'"
    assert tables.caveat is not None
    assert tables.caveat.title == "No tables visible in schema 'sales'"


def test_views_are_filtered_to_the_resolved_schema() -> None:
    cursor = FakeCursor(
        views=(
            ("sales", "order_view", "SELECT 1"),
            ("other", "stray_view", "SELECT 2"),
        )
    )
    views = _checks(cursor, databaseSchema="sales").get_views()
    assert views.summary == "1 view in schema 'sales'"


def test_localhost_failure_retries_as_docker_host(monkeypatch) -> None:
    seen: list[str] = []

    def fake_connect(config):
        host_port = str(config.get("hostPort") or "")
        seen.append(host_port)
        if "localhost" in host_port:
            raise WorkflowError("connection refused")
        return lambda: FakeConnection(FakeCursor())

    monkeypatch.setattr(doris_common, "doris_connect", fake_connect)
    checks = DorisChecks(_config(hostPort="localhost:9030"))
    assert checks.check_access().summary == "connection established"
    assert seen == ["localhost:9030", "host.docker.internal:9030"]


def test_non_localhost_failure_does_not_retry(monkeypatch) -> None:
    seen: list[str] = []

    def fake_connect(config):
        seen.append(str(config.get("hostPort")))
        raise WorkflowError("connection refused")

    monkeypatch.setattr(doris_common, "doris_connect", fake_connect)
    checks = DorisChecks(_config())
    with pytest.raises(WorkflowError, match="connection refused"):
        checks.check_access()
    assert seen == ["db.example:9030"]


def test_fetch_failure_is_wrapped_as_a_workflow_error() -> None:
    cursor = FakeCursor(error=RuntimeError("boom"))
    with pytest.raises(WorkflowError, match="doris test connection failed: boom"):
        _checks(cursor).get_schemas()


def test_mysql_checks_reexport_the_shared_helpers() -> None:
    # The extraction moved Caveat/Evidence into checks_common; the
    # MySQL module re-exports them so existing imports keep working.
    assert mysql_checks.Caveat is checks_common.Caveat
    assert mysql_checks.Evidence is checks_common.Evidence
    assert "Caveat" in mysql_checks.__all__
    assert "Evidence" in mysql_checks.__all__
