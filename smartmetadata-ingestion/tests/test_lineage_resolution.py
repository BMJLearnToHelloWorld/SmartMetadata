# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage binding resolution: the usage fallback chain (exact FQN
→ schema-scoped unique case-insensitive match → skip), extended
with cross-service candidates, column validation, and procedure /
UDF binding — all through a fake REST client."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.resolution import (
    LineageBindingResolver,
    candidate_fqns,
    passes_filter,
    view_parent_schema_tables,
)

SERVICE = "svc"
OTHER = "other_svc"


def _table(fqn: str, columns: list[str] | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }
    if columns is not None:
        entity["columns"] = [{"name": name} for name in columns]
    return entity


def _procedure(fqn: str, code: str | None = None) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }
    if code is not None:
        entity["storedProcedureCode"] = {"code": code, "language": "SQL"}
    return entity


class _FakeClient:
    """Catalog reads over in-memory entities. Absence is a 404;
    anything else the tests need is recorded for assertions."""

    def __init__(
        self,
        tables: dict[str, dict[str, Any]] | None = None,
        procedures: dict[str, dict[str, Any]] | None = None,
        *,
        fail_tables_with: int | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}
        self._fail_tables_with = fail_tables_with
        self.table_lookups: list[str] = []
        self.procedure_lookups: list[str] = []

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        self.table_lookups.append(fqn)
        if self._fail_tables_with is not None:
            raise RestError("boom", status_code=self._fail_tables_with)
        entity = self._tables.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_stored_procedure_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        self.procedure_lookups.append(fqn)
        entity = self._procedures.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
        schema_fqn = (extra_params or {}).get("databaseSchema", "")
        if path == TABLES_PATH:
            pool = self._tables
        elif path == STORED_PROCEDURES_PATH:
            pool = self._procedures
        else:  # pragma: no cover - the resolver only lists these two
            raise AssertionError(f"unexpected collection {path}")
        prefix = f"{schema_fqn}."
        return [e for fqn, e in pool.items() if fqn.startswith(prefix)]


def _resolver(
    client: _FakeClient,
    *,
    default_database: str | None = "db",
    default_schema: str | None = "public",
    cross_services: list[str] | None = None,
    cross_enabled: bool = False,
) -> LineageBindingResolver:
    return LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=default_database,
        default_schema=default_schema,
        cross_database_service_names=cross_services or [],
        process_cross_database_lineage=cross_enabled,
    )


def test_resolve_table_exact_fqn_three_part_name() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _resolver(client)
    assert resolver.resolve_table("db.public.orders") == "svc.db.public.orders"


def test_resolve_table_two_part_name_uses_context_database() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _resolver(client)
    assert (
        resolver.resolve_table("public.orders", database_name="db")
        == "svc.db.public.orders"
    )


def test_resolve_table_one_part_name_uses_context_database_and_schema() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _resolver(client)
    assert resolver.resolve_table("orders") == "svc.db.public.orders"


def test_resolve_table_case_insensitive_unique_match() -> None:
    client = _FakeClient({"svc.db.public.Orders": _table("svc.db.public.Orders")})
    resolver = _resolver(client)
    assert resolver.resolve_table("ORDERS") == "svc.db.public.Orders"


def test_resolve_table_ambiguous_case_insensitive_match_skips() -> None:
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.ORDERS": _table("svc.db.public.ORDERS"),
        }
    )
    resolver = _resolver(client)
    assert resolver.resolve_table("orders") is None


def test_resolve_table_unresolvable_returns_none() -> None:
    resolver = _resolver(_FakeClient())
    assert resolver.resolve_table("missing_table") is None


def test_resolve_table_non_404_error_propagates() -> None:
    resolver = _resolver(_FakeClient(fail_tables_with=500))
    try:
        resolver.resolve_table("orders")
    except RestError as exc:
        assert exc.status_code == 500
    else:  # pragma: no cover
        raise AssertionError("expected RestError")


def test_resolve_table_cross_service_exact_match() -> None:
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _resolver(client, cross_services=[OTHER], cross_enabled=True)
    assert resolver.resolve_table("db.public.orders") == "other_svc.db.public.orders"


def test_resolve_table_cross_service_disabled_never_leaves_own_service() -> None:
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _resolver(client, cross_services=[OTHER], cross_enabled=False)
    assert resolver.resolve_table("db.public.orders") is None


def test_resolve_table_cross_service_has_no_fuzzy_step() -> None:
    client = _FakeClient(
        {"other_svc.db.public.Orders": _table("other_svc.db.public.Orders")}
    )
    resolver = _resolver(client, cross_services=[OTHER], cross_enabled=True)
    assert resolver.resolve_table("ORDERS") is None


def test_cross_service_probe_stays_quiet_until_all_resolvers_fail(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _resolver(client, cross_services=[OTHER], cross_enabled=True)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve_table("db.public.orders") == "other_svc.db.public.orders"
    # The own-service miss warned about nothing: the name resolved
    # cross-service.
    assert "orders" not in caplog.text
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve_table("db.public.ghost") is None
    # Every resolver exhausted: the name earns its warning.
    assert "ghost" in caplog.text


def test_table_exists_distinguishes_404_from_presence() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _resolver(client)
    assert resolver.table_exists("svc.db.public.orders") is True
    assert resolver.table_exists("svc.db.public.missing") is False


def test_resolve_column_returns_catalog_spelling() -> None:
    client = _FakeClient(
        {"svc.db.public.orders": _table("svc.db.public.orders", ["ID", "Email"])}
    )
    resolver = _resolver(client)
    assert (
        resolver.resolve_column("svc.db.public.orders", "email")
        == "svc.db.public.orders.Email"
    )


def test_resolve_column_unknown_list_falls_back_to_parsed_spelling() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _resolver(client)
    assert (
        resolver.resolve_column("svc.db.public.orders", "email")
        == "svc.db.public.orders.email"
    )


def test_resolve_column_contradicted_by_catalog_drops() -> None:
    client = _FakeClient(
        {"svc.db.public.orders": _table("svc.db.public.orders", ["id"])}
    )
    resolver = _resolver(client)
    assert resolver.resolve_column("svc.db.public.orders", "email") is None


def test_resolve_column_ambiguous_case_variants_drop() -> None:
    client = _FakeClient(
        {"svc.db.public.orders": _table("svc.db.public.orders", ["ID", "Id"])}
    )
    resolver = _resolver(client)
    assert resolver.resolve_column("svc.db.public.orders", "id") is None


def test_resolve_procedure_exact_then_case_insensitive() -> None:
    client = _FakeClient(
        procedures={
            "svc.db.public.load_orders": _procedure(
                "svc.db.public.load_orders", "SELECT 1"
            ),
            "svc.db.public.CalcTotal": _procedure("svc.db.public.CalcTotal", "SELECT 1"),
        }
    )
    resolver = _resolver(client)
    assert (
        resolver.resolve_procedure("db.public.load_orders")["fullyQualifiedName"]
        == "svc.db.public.load_orders"
    )
    assert (
        resolver.resolve_procedure("calctotal")["fullyQualifiedName"]
        == "svc.db.public.CalcTotal"
    )


def test_resolve_procedure_unresolved_counts_and_warns_once() -> None:
    resolver = _resolver(_FakeClient())
    assert resolver.resolve_procedure("nope") is None
    assert resolver.resolve_procedure("nope") is None
    assert resolver.unresolved_procedure_count == 2


def test_resolve_udf_counts_misses_separately() -> None:
    client = _FakeClient(
        procedures={"svc.db.public.my_udf": _procedure("svc.db.public.my_udf", "SELECT 1")}
    )
    resolver = _resolver(client)
    assert resolver.resolve_udf("my_udf") is not None
    assert resolver.resolve_udf("missing_fn") is None
    assert resolver.unresolved_udf_count == 1
    assert resolver.unresolved_procedure_count == 1


def test_procedure_code_reads_the_code_block() -> None:
    assert (
        LineageBindingResolver.procedure_code(_procedure("svc.p", "SELECT 1"))
        == "SELECT 1"
    )
    assert LineageBindingResolver.procedure_code(_procedure("svc.p")) is None
    assert LineageBindingResolver.procedure_code({}) is None
    assert (
        LineageBindingResolver.procedure_code(
            {"storedProcedureCode": {"code": "  "}}
        )
        is None
    )


def test_candidate_fqns_most_specific_first() -> None:
    assert candidate_fqns(SERVICE, ["db", "public", "orders"], "other", "s") == [
        "svc.db.public.orders"
    ]
    assert candidate_fqns(SERVICE, ["public", "orders"], "db", None) == [
        "svc.db.public.orders"
    ]
    assert candidate_fqns(SERVICE, ["orders"], "db", "public") == [
        "svc.db.public.orders"
    ]
    assert candidate_fqns(SERVICE, ["orders"], None, None) == []


def test_passes_filter_name_vs_fqn_and_exclude_wins() -> None:
    assert (
        passes_filter("orders", "svc.db.public.orders", include=["ord.*"], exclude=[])
        is True
    )
    assert (
        passes_filter("orders", "svc.db.public.orders", include=["cust.*"], exclude=[])
        is False
    )
    assert (
        passes_filter(
            "orders",
            "svc.db.public.orders",
            include=["svc.*"],
            exclude=[],
            use_fqn_for_filtering=True,
        )
        is True
    )
    assert (
        passes_filter(
            "orders",
            "svc.db.public.orders",
            include=["svc.*"],
            exclude=[],
            use_fqn_for_filtering=False,
        )
        is False
    )
    assert (
        passes_filter(
            "orders", "svc.db.public.orders", include=[], exclude=["orders"]
        )
        is False
    )


def test_view_parent_schema_tables_resolves_cte_and_aliases() -> None:
    definition = (
        "SELECT o.id, c.name FROM raw.orders o "
        "JOIN raw.customers c ON c.id = o.customer_id"
    )
    parents = view_parent_schema_tables(definition, Dialect.POSTGRES, "public")
    assert sorted(parents) == [("raw", "customers"), ("raw", "orders")]


def test_view_parent_schema_tables_unqualified_uses_default_schema() -> None:
    parents = view_parent_schema_tables(
        "SELECT * FROM orders", Dialect.POSTGRES, "public"
    )
    assert parents == [("public", "orders")]


def test_view_parent_schema_tables_three_part_keeps_last_two() -> None:
    parents = view_parent_schema_tables(
        "SELECT * FROM warehouse.public.orders", Dialect.POSTGRES, "other"
    )
    assert parents == [("public", "orders")]


def test_view_parent_schema_tables_unparseable_yields_nothing() -> None:
    assert (
        view_parent_schema_tables("THIS IS NOT SQL AT ALL", Dialect.POSTGRES, "public")
        == []
    )


def test_view_parent_schema_tables_deduplicates() -> None:
    parents = view_parent_schema_tables(
        "SELECT * FROM public.a JOIN public.b ON true JOIN public.a ON true",
        Dialect.POSTGRES,
        "public",
    )
    assert sorted(parents) == [("public", "a"), ("public", "b")]


def test_unresolved_table_count_counts_final_outcome_only() -> None:
    # An own-service miss that resolves cross-service counts zero; a
    # name that fails everywhere counts once per attempt.
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _resolver(client, cross_services=[OTHER], cross_enabled=True)
    assert resolver.resolve_table("orders") == "other_svc.db.public.orders"
    assert resolver.resolve_table("ghost") is None
    assert resolver.resolve_table("ghost") is None
    assert resolver.unresolved_table_count == 2


def test_warning_count_adds_tables_and_procedures_once() -> None:
    # A UDF miss is a procedure miss too (resolve_udf delegates to
    # resolve_procedure), so it contributes once, not twice.
    resolver = _resolver(_FakeClient())
    assert resolver.resolve_table("ghost") is None
    assert resolver.resolve_procedure("missing_proc") is None
    assert resolver.resolve_udf("missing_fn") is None
    assert resolver.unresolved_table_count == 1
    assert resolver.unresolved_procedure_count == 2
    assert resolver.unresolved_udf_count == 1
    assert resolver.warning_count == 3
