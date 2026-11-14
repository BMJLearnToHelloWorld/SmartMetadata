# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.errors import WorkflowExecutionError
from smartmetadata_ingestion.reconcile import (
    enabled_reconcile_kinds,
    reconcile_stale,
    service_family_for_source_type,
)
from smartmetadata_ingestion.topology import SeenSet


class FakeClient:
    def __init__(
        self,
        *,
        fail_paths: set[str] | None = None,
        results: dict[str, dict] | None = None,
    ) -> None:
        self.calls: list[dict] = []
        self._fail_paths = fail_paths or set()
        self._results = results or {}

    def delete_stale(self, entity_path, **kwargs):
        self.calls.append({"path": entity_path, **kwargs})
        if entity_path in self._fail_paths:
            raise RuntimeError(f"deleteStale refused for {entity_path}")
        return self._results.get(entity_path, {"ok": True})


def _seen(**kinds: set[str]) -> SeenSet:
    seen = SeenSet()
    for kind, fqns in kinds.items():
        seen.by_kind[kind] = set(fqns)
    return seen


def _source(**overrides) -> SourceConfig:
    config = SourceConfig(type="postgres", service_name="svc")
    for key, value in overrides.items():
        setattr(config, key, value)
    return config


def test_reconcile_stale_calls_only_enabled_kinds() -> None:
    client = FakeClient()
    seen = _seen(
        table={"svc.db.public.t"},
        schema={"svc.db.public"},
        database={"svc.db"},
    )
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=seen,
        enabled_kinds={"table"},
        dry_run=True,
    )
    assert [item["path"] for item in results] == ["/v1/tables"]
    assert client.calls[0]["dry_run"] is True
    assert client.calls[0]["seen_fqns"] == ["svc.db.public.t"]
    assert client.calls[0]["scope_entity_type"] == "databaseService"


def test_reconcile_stale_includes_stored_procedures_when_seen() -> None:
    client = FakeClient()
    seen = _seen(
        table={"svc.db.public.t"},
        storedProcedure={"svc.db.public.sp"},
    )
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=seen,
        enabled_kinds={"table", "storedProcedure"},
    )
    assert [item["path"] for item in results] == [
        "/v1/tables",
        "/v1/storedProcedures",
    ]


def test_reconcile_stale_skips_empty_listings() -> None:
    # An enabled kind with nothing seen is never reconciled: the empty
    # listing cannot be told apart from a listing that never ran.
    client = FakeClient()
    seen = _seen(table={"svc.db.public.t"})
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=seen,
        enabled_kinds={"table", "schema", "database", "storedProcedure"},
    )
    assert [item["path"] for item in results] == ["/v1/tables"]
    assert len(client.calls) == 1


def test_reconcile_stale_attempts_all_kinds_then_fails() -> None:
    # One kind's failure does not skip the others, and the run fails:
    # a partially reconciled run must never report success.
    client = FakeClient(fail_paths={"/v1/tables"})
    seen = _seen(table={"svc.db.public.t"}, schema={"svc.db.public"})
    with pytest.raises(WorkflowExecutionError, match="table"):
        reconcile_stale(
            client,
            scope_fqn="svc",
            scope_entity_type="databaseService",
            seen=seen,
            enabled_kinds={"table", "schema"},
        )
    assert [call["path"] for call in client.calls] == [
        "/v1/tables",
        "/v1/databaseSchemas",
    ]


def test_reconcile_stale_fails_on_failed_request_entries() -> None:
    # A 200 deleteStale response can still carry per-entity failures
    # in failedRequest: the run fails, the failing entries are named,
    # and the remaining kinds are still attempted.
    client = FakeClient(
        results={
            "/v1/tables": {
                "successRequest": [{"request": "svc.db.public.kept", "status": 200}],
                "failedRequest": [
                    {
                        "request": "svc.db.public.gone",
                        "status": 500,
                        "message": "delete refused",
                    }
                ],
            },
            "/v1/databaseSchemas": {"successRequest": [], "failedRequest": []},
        }
    )
    seen = _seen(table={"svc.db.public.t"}, schema={"svc.db.public"})
    with pytest.raises(WorkflowExecutionError) as exc_info:
        reconcile_stale(
            client,
            scope_fqn="svc",
            scope_entity_type="databaseService",
            seen=seen,
            enabled_kinds={"table", "schema"},
        )
    assert "1 failed request" in str(exc_info.value)
    assert "svc.db.public.gone: delete refused" in str(exc_info.value)
    assert [call["path"] for call in client.calls] == [
        "/v1/tables",
        "/v1/databaseSchemas",
    ]


def test_reconcile_stale_accepts_empty_failed_request_list() -> None:
    # An explicit empty failedRequest list is a clean result: the kind
    # reconciles and its payload is reported.
    client = FakeClient(
        results={"/v1/tables": {"successRequest": [], "failedRequest": []}}
    )
    seen = _seen(table={"svc.db.public.t"})
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=seen,
        enabled_kinds={"table"},
    )
    assert [item["path"] for item in results] == ["/v1/tables"]


def test_enabled_kinds_follow_schema_defaults() -> None:
    # Schema defaults: tables, stored procedures, and the other
    # families' kinds reconcile; schemas and databases do not. Family
    # scoping happens in reconcile_stale (scope entity type), not here.
    assert enabled_reconcile_kinds(_source()) == {
        "table",
        "storedProcedure",
        "topic",
        "chart",
        "dashboard",
        "container",
        "pipeline",
    }


def test_enabled_kinds_skip_narrowed_listings() -> None:
    assert "table" not in enabled_reconcile_kinds(
        _source(include_tables=["^orders$"])
    )
    assert "table" not in enabled_reconcile_kinds(_source(exclude_tables=["^tmp_"]))
    assert "schema" not in enabled_reconcile_kinds(
        _source(mark_deleted_schemas=True, include_schemas=["public"])
    )
    assert "database" not in enabled_reconcile_kinds(
        _source(mark_deleted_databases=True, exclude_databases=["scratch"])
    )


def test_enabled_kinds_allow_default_schema_excludes() -> None:
    # The default system-schema excludes are not a narrowing: schemas
    # reconcile when only they are excluded.
    source = _source(mark_deleted_schemas=True)
    assert source.exclude_schemas == [
        "information_schema",
        "pg_catalog",
        "pg_toast",
    ]
    assert "schema" in enabled_reconcile_kinds(source)
    assert "schema" not in enabled_reconcile_kinds(
        _source(
            mark_deleted_schemas=True,
            exclude_schemas=["information_schema", "pg_catalog", "pg_toast", "archive"],
        )
    )


def test_enabled_kinds_skip_suppressed_listings() -> None:
    # includeTables=false leaves tables out of the seen set, and
    # includeViews=false leaves views (table-kind entities) out: either
    # makes the table listing partial.
    assert "table" not in enabled_reconcile_kinds(_source(include_tables_enabled=False))
    assert "table" not in enabled_reconcile_kinds(_source(include_views=False))
    assert "storedProcedure" not in enabled_reconcile_kinds(
        _source(include_stored_procedures_enabled=False)
    )


def test_enabled_kinds_skip_ancestor_pattern_narrowing() -> None:
    # A database or schema pattern narrows every descendant kind: the
    # run listed one parent, so service-scoped reconcile of tables or
    # procedures would delete entities it never saw.
    narrowed = _source(
        mark_deleted_schemas=True,
        mark_deleted_databases=True,
        include_databases=["^db1$"],
    )
    assert enabled_reconcile_kinds(narrowed) == {
        "topic",
        "chart",
        "dashboard",
        "container",
        "pipeline",
    }
    assert "table" not in enabled_reconcile_kinds(_source(exclude_databases=["scratch"]))
    assert "storedProcedure" not in enabled_reconcile_kinds(
        _source(exclude_databases=["scratch"])
    )
    assert "schema" not in enabled_reconcile_kinds(
        _source(mark_deleted_schemas=True, include_databases=["^db1$"])
    )
    assert "table" not in enabled_reconcile_kinds(_source(include_schemas=["^public$"]))
    assert "storedProcedure" not in enabled_reconcile_kinds(
        _source(include_schemas=["^public$"])
    )
    assert "table" not in enabled_reconcile_kinds(
        _source(exclude_schemas=["information_schema", "pg_catalog", "pg_toast", "archive"])
    )


def test_enabled_kinds_narrowing_does_not_flow_downward() -> None:
    # Narrowing flows from ancestors to descendants only: a schema
    # pattern leaves the database listing complete, and a table
    # pattern leaves schemas and procedures complete. The database
    # case needs a multi-database type: single-database sources gate
    # the database kind structurally, whatever the patterns say.
    source = _source(
        type="snowflake",
        connection={},
        mark_deleted_databases=True,
        include_schemas=["^public$"],
    )
    assert "database" in enabled_reconcile_kinds(source)
    assert "table" not in enabled_reconcile_kinds(source)
    source = _source(
        mark_deleted_schemas=True, include_tables=["^orders$"]
    )
    kinds = enabled_reconcile_kinds(source)
    assert "table" not in kinds
    assert "schema" in kinds
    assert "storedProcedure" in kinds


def test_enabled_kinds_default_schema_excludes_do_not_narrow_descendants() -> None:
    # The default system-schema excludes are not a narrowing at any
    # level: tables and procedures reconcile under them.
    source = _source()
    assert source.exclude_schemas == [
        "information_schema",
        "pg_catalog",
        "pg_toast",
    ]
    kinds = enabled_reconcile_kinds(source)
    assert "table" in kinds
    assert "storedProcedure" in kinds


@pytest.mark.parametrize(
    "source_type,connection",
    [
        ("snowflake", {"database": "ANALYTICS"}),
        ("databricks", {"catalog": "main"}),
        ("unitycatalog", {"catalog": "main"}),
        ("mssql", {"database": "db1"}),
        ("greenplum", {"database": "db1"}),
        ("timescale", {"database": "db1"}),
        ("redshift", {"database": "db1"}),
        ("mssql", {"database": "db1", "ingestAllDatabases": False}),
    ],
)
def test_enabled_kinds_skip_connection_database_narrowing(
    source_type: str, connection: dict
) -> None:
    # The connection restricts the run to one database (a fallback
    # include or an entry-database reader), so no database-family kind
    # reconciles at service scope.
    source = _source(
        type=source_type,
        connection=connection,
        mark_deleted_schemas=True,
        mark_deleted_databases=True,
    )
    assert enabled_reconcile_kinds(source) == {
        "topic",
        "chart",
        "dashboard",
        "container",
        "pipeline",
    }


@pytest.mark.parametrize("source_type", ["mssql", "greenplum", "timescale", "redshift"])
def test_enabled_kinds_entry_database_escape_lists_all_databases(source_type: str) -> None:
    # ingestAllDatabases cancels the entry-database narrowing: the
    # reader lists every database, so the listing is complete again.
    source = _source(
        type=source_type,
        connection={"database": "db1", "ingestAllDatabases": True},
        mark_deleted_schemas=True,
        mark_deleted_databases=True,
    )
    kinds = enabled_reconcile_kinds(source)
    assert "database" in kinds
    assert "schema" in kinds
    assert "table" in kinds
    assert "storedProcedure" in kinds


@pytest.mark.parametrize(
    "source_type,connection",
    [
        ("mysql", {"databaseSchema": "public"}),
        ("mysql", {"database_schema": "public"}),
        ("mariadb", {"databaseSchema": "public"}),
        ("doris", {"databaseSchema": "public"}),
        ("mssql", {"databaseSchema": "dbo"}),
        ("greenplum", {"databaseSchema": "public"}),
        ("timescale", {"databaseSchema": "public"}),
        ("redshift", {"databaseSchema": "public"}),
        ("databricks", {"databaseSchema": "default"}),
        ("unitycatalog", {"databaseSchema": "default"}),
    ],
)
def test_enabled_kinds_skip_connection_schema_narrowing(
    source_type: str, connection: dict
) -> None:
    # The connection restricts the run to one schema: schemas, tables,
    # and procedures are partial, while the database listing (for
    # multi-database types) stays complete.
    source = _source(
        type=source_type,
        connection=connection,
        mark_deleted_schemas=True,
        mark_deleted_databases=True,
    )
    kinds = enabled_reconcile_kinds(source)
    assert "schema" not in kinds
    assert "table" not in kinds
    assert "storedProcedure" not in kinds
    if source_type in {"mssql", "greenplum", "timescale", "redshift", "databricks", "unitycatalog"}:
        assert "database" in kinds


def test_enabled_kinds_single_database_sources_never_reconcile_databases() -> None:
    # Postgres/MySQL/MariaDB/Doris enumerate exactly one database, so
    # the database listing is never service-complete — but the schema,
    # table, and procedure listings within that database are complete.
    for source_type in ("postgres", "mysql", "mariadb", "doris"):
        source = _source(
            type=source_type,
            connection={},
            mark_deleted_schemas=True,
            mark_deleted_databases=True,
        )
        kinds = enabled_reconcile_kinds(source)
        assert "database" not in kinds
        assert "schema" in kinds
        assert "table" in kinds
        assert "storedProcedure" in kinds


def test_enabled_kinds_postgres_connection_database_does_not_narrow() -> None:
    # Postgres has no database/schema connection fallback: the
    # connection database names its one database, it does not narrow
    # a wider listing. Only the database kind stays gated (single
    # database), never the descendants.
    source = _source(
        type="postgres",
        connection={"database": "analytics"},
        mark_deleted_databases=True,
    )
    kinds = enabled_reconcile_kinds(source)
    assert "database" not in kinds
    assert "table" in kinds
    assert "storedProcedure" in kinds


def test_enabled_kinds_snowflake_has_no_schema_fallback() -> None:
    # Snowflake selects schemas from include_schemas only: a
    # databaseSchema connection value does not narrow anything.
    source = _source(
        type="snowflake",
        connection={"databaseSchema": "PUBLIC"},
        mark_deleted_schemas=True,
    )
    kinds = enabled_reconcile_kinds(source)
    assert "table" in kinds
    assert "schema" in kinds


def test_enabled_kinds_connection_scope_uses_base_source_type() -> None:
    # Usage/lineage-suffixed source types resolve to their base
    # connector's connection scope.
    source = _source(type="snowflake-usage", connection={"database": "ANALYTICS"})
    assert "table" not in enabled_reconcile_kinds(source)
    source = _source(type="mssql-lineage", connection={"databaseSchema": "dbo"})
    assert "table" not in enabled_reconcile_kinds(source)


def test_enabled_kinds_ignore_connection_keys_for_unlisted_types() -> None:
    # Types with no connection-scope entry narrow through patterns
    # only; their connection keys carry no listing meaning for the gate.
    source = _source(
        type="static",
        connection={"database": "db1", "databaseSchema": "public"},
    )
    kinds = enabled_reconcile_kinds(source)
    assert "table" in kinds
    assert "storedProcedure" in kinds


def test_service_family_for_source_type() -> None:
    assert service_family_for_source_type("postgres") == "databaseService"
    assert service_family_for_source_type("kafka") == "messagingService"
    assert service_family_for_source_type("redpanda") == "messagingService"
    assert service_family_for_source_type("superset") == "dashboardService"
    assert service_family_for_source_type("s3") == "storageService"
    assert service_family_for_source_type("prefect") == "pipelineService"
    assert service_family_for_source_type("postgres-usage") == "databaseService"
    assert service_family_for_source_type("mysql-lineage") == "databaseService"
    assert service_family_for_source_type("static") == "databaseService"


def test_enabled_kinds_reports_gate_skipped_kinds() -> None:
    skipped: list[str] = []
    enabled = enabled_reconcile_kinds(
        _source(
            include_tables=["^orders$"],
            mark_deleted_schemas=True,
            include_schemas=["public"],
        ),
        skipped=skipped,
    )
    assert "table" not in enabled
    assert "schema" not in enabled
    assert "storedProcedure" not in enabled
    # M-F1 ancestor gate: the schema narrowing also excludes
    # storedProcedure, whose ancestor levels include schema — the gate
    # reports every flag-on kind it excludes, not only kinds narrowed
    # at their own level.
    assert sorted(skipped) == ["schema", "storedProcedure", "table"]


def test_enabled_kinds_does_not_report_flag_off_kinds() -> None:
    # Schemas and databases default off: reconcile was never requested
    # for them, so they are not skips.
    skipped: list[str] = []
    enabled_reconcile_kinds(_source(), skipped=skipped)
    assert skipped == []


def test_reconcile_stale_reports_empty_listing_skips() -> None:
    client = FakeClient()
    skipped: list[str] = []
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=_seen(table={"svc.db.public.t"}),
        enabled_kinds={"table", "storedProcedure"},
        skipped=skipped,
    )
    assert [item["path"] for item in results] == ["/v1/tables"]
    assert skipped == ["storedProcedure"]
