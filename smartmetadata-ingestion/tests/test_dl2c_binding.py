# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""D-L2c binding-chain tests (design §6 tests 2/3/11 + resolver
fallback/folding/over-segment rules): scope escape across all three
chains, the scan-range conditional-compat lock, cross-service limits,
engine folding, and the over-segment skip — all against a fake REST
catalog, never a live database."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.folding import fold_identifier
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.resolution import (
    LineageBindingResolver,
    candidate_fqns,
    view_parent_schema_tables,
)
from smartmetadata_ingestion.naming import resolve_connection_defaults
from smartmetadata_ingestion.records import BindingContext, FieldSource
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver

SERVICE = "svc"
OTHER = "other_svc"


def _ident(*parts: str, quoted: tuple[bool, ...] | None = None) -> StructuredIdentifier:
    flags = quoted if quoted is not None else tuple(False for _ in parts)
    return StructuredIdentifier.from_parts(zip(parts, flags, strict=True))


def _ctx(
    database: str | None = None,
    schema: str | None = None,
    database_source: FieldSource = FieldSource.MISSING,
    schema_source: FieldSource = FieldSource.MISSING,
) -> BindingContext:
    return BindingContext(
        database_name=database,
        database_schema=schema,
        database_source=database_source,
        schema_source=schema_source,
    )


def _table(fqn: str) -> dict[str, Any]:
    return {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }


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
    """In-memory catalog reads. Listings are scoped by the exact
    ``databaseSchema`` parameter the resolver asks for, and every
    listing request is recorded so tests can prove which schema a
    fallback actually scanned."""

    def __init__(
        self,
        tables: dict[str, dict[str, Any]] | None = None,
        procedures: dict[str, dict[str, Any]] | None = None,
        *,
        fail_tables_with: int | None = None,
        fail_procedures_with: int | None = None,
        loose_listings: list[dict[str, Any]] | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}
        self._fail_tables_with = fail_tables_with
        self._fail_procedures_with = fail_procedures_with
        # When set, listings return this pool verbatim instead of
        # prefix-scoping: the only way to prove the fallback compares
        # full FQNs rather than leaf names.
        self._loose_listings = loose_listings
        self.table_lookups: list[str] = []
        self.procedure_lookups: list[str] = []
        self.listed_schemas: list[str] = []

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
        if self._fail_procedures_with is not None:
            raise RestError("boom", status_code=self._fail_procedures_with)
        entity = self._procedures.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
        schema_fqn = (extra_params or {}).get("databaseSchema", "")
        self.listed_schemas.append(schema_fqn)
        if self._loose_listings is not None:
            return list(self._loose_listings)
        pool = self._tables if path == TABLES_PATH else self._procedures
        if path not in (TABLES_PATH, STORED_PROCEDURES_PATH):  # pragma: no cover
            raise AssertionError(f"unexpected collection {path}")
        prefix = f"{schema_fqn}."
        return [e for fqn, e in pool.items() if fqn.startswith(prefix)]


def _usage_resolver(
    client: _FakeClient,
    *,
    default_database: str | None = None,
    default_schema: str | None = None,
    engine_key: str | None = None,
) -> RestTableBindingResolver:
    return RestTableBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=default_database,
        default_schema=default_schema,
        engine_key=engine_key,
    )


def _lineage_resolver(
    client: _FakeClient,
    *,
    default_database: str | None = "db",
    default_schema: str | None = "public",
    cross_services: list[str] | None = None,
    cross_enabled: bool = False,
    engine_key: str | None = None,
) -> LineageBindingResolver:
    return LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=default_database,
        default_schema=default_schema,
        cross_database_service_names=cross_services or [],
        process_cross_database_lineage=cross_enabled,
        engine_key=engine_key,
    )


# --- §6 test 2: scope escape × three chains -------------------------------


def test_scope_escape_table_chain_skips_despite_context_trap() -> None:
    """``wrongdb.wrongschema.Orders`` must not bind into the default
    context: the fallback scans the candidate's own schema only, and
    the case-variant trap sitting in the default schema is never
    consulted as a match."""
    client = _FakeClient(
        {"svc.shop.public.orders": _table("svc.shop.public.orders")}
    )
    resolver = _usage_resolver(client, default_database="shop", default_schema="public")
    assert (
        resolver.resolve(_ident("wrongdb", "wrongschema", "Orders"), context=_ctx())
        is None
    )
    assert client.table_lookups == ["svc.wrongdb.wrongschema.Orders"]
    assert client.listed_schemas == ["svc.wrongdb.wrongschema"]


def test_scope_escape_procedure_chain_skips() -> None:
    client = _FakeClient(
        procedures={"svc.shop.public.orders": _procedure("svc.shop.public.orders")}
    )
    resolver = _lineage_resolver(
        client, default_database="shop", default_schema="public"
    )
    assert (
        resolver.resolve_procedure(
            _ident("wrongdb", "wrongschema", "Orders"), context=_ctx()
        )
        is None
    )
    assert client.procedure_lookups == ["svc.wrongdb.wrongschema.Orders"]
    assert client.listed_schemas == ["svc.wrongdb.wrongschema"]


def test_scope_escape_udf_chain_skips() -> None:
    client = _FakeClient(
        procedures={"svc.shop.public.orders": _procedure("svc.shop.public.orders")}
    )
    resolver = _lineage_resolver(
        client, default_database="shop", default_schema="public"
    )
    assert (
        resolver.resolve_udf(_ident("wrongdb", "wrongschema", "Orders"), context=_ctx())
        is None
    )
    assert resolver.unresolved_udf_count == 1


def test_same_schema_case_variant_still_binds_via_fallback() -> None:
    """The fallback survives: a name qualified into the schema that
    actually holds the case variant binds on the full-FQN
    case-insensitive match."""
    client = _FakeClient({"svc.db.public.Orders": _table("svc.db.public.Orders")})
    resolver = _usage_resolver(client)
    assert (
        resolver.resolve(_ident("db", "public", "orders"), context=_ctx())
        == "svc.db.public.Orders"
    )
    client2 = _FakeClient({"svc.db.public.Orders": _table("svc.db.public.Orders")})
    resolver2 = _usage_resolver(client2)
    assert (
        resolver2.resolve(_ident("orders"), context=_ctx("db", "public"))
        == "svc.db.public.Orders"
    )


def test_fallback_compares_full_fqn_not_leaf() -> None:
    """The fallback compares the whole FQN case-insensitively: a
    listing entry whose leaf matches but whose database segment
    differs must NOT bind (the old leaf-only comparison would have
    bound it), while a same-scope case variant does bind."""
    trap = _FakeClient(
        {}, loose_listings=[_table("svc.otherdb.public.Orders")]
    )
    resolver = _usage_resolver(trap)
    assert resolver.resolve(_ident("db", "public", "orders"), context=_ctx()) is None
    same_scope = _FakeClient(
        {}, loose_listings=[_table("svc.db.public.Orders")]
    )
    resolver2 = _usage_resolver(same_scope)
    assert (
        resolver2.resolve(_ident("db", "public", "orders"), context=_ctx())
        == "svc.db.public.Orders"
    )


def test_fallback_ambiguity_skips_and_counts() -> None:
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.ORDERS": _table("svc.db.public.ORDERS"),
        }
    )
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx("db", "public")) is None
    assert resolver.binding_counts["ambiguous"] == 1
    assert resolver.binding_counts["unresolved_404"] == 0


# --- §6 test 3: scan-range conditional compat (mechanism lock) -----------


def test_scan_range_default_no_longer_binds_bare_names() -> None:
    """D-L2c E (full delete): with no schema on the row, the
    scan-range default (``sales``) no longer supplies the schema,
    so a bare name misses even when the scan range holds an
    ``orders`` table. The old binding behavior (design §5.7
    conditional compat) is deleted, not narrowed: a bare name with
    no row schema is a miss + ``missing_schema``, and
    ``default_bound_schema`` stays 0. The database default is
    untouched — only the schema half is deleted."""
    client = _FakeClient(
        {
            "svc.warehouse.sales.orders": _table("svc.warehouse.sales.orders"),
            "svc.warehouse.public.orders": _table("svc.warehouse.public.orders"),
        }
    )
    resolver = _usage_resolver(client, default_schema="sales")
    context = _ctx(
        "warehouse", None, database_source=FieldSource.ROW_NATIVE
    )
    assert resolver.resolve(_ident("orders"), context=context) is None
    counts = resolver.binding_counts
    assert counts["missing_schema"] == 1
    assert counts["default_bound_schema"] == 0
    assert counts["default_bound_database"] == 0


def test_row_schema_still_binds_and_default_schema_never_consulted() -> None:
    """D-L2c E: only the default is deleted. A bare name whose
    schema comes from the row still binds, and the configured
    default schema is never consulted for it — not even to count:
    the bound table is the row-schema one, and
    ``default_bound_schema`` stays 0."""
    client = _FakeClient(
        {
            "svc.warehouse.sales.orders": _table("svc.warehouse.sales.orders"),
            "svc.warehouse.other.orders": _table("svc.warehouse.other.orders"),
        }
    )
    resolver = _usage_resolver(client, default_schema="other")
    context = _ctx(
        "warehouse", "sales", database_source=FieldSource.ROW_NATIVE
    )
    assert resolver.resolve(_ident("orders"), context=context) == (
        "svc.warehouse.sales.orders"
    )
    assert resolver.binding_counts["default_bound_schema"] == 0


def test_two_and_three_part_names_unaffected_by_schema_fallback_delete() -> None:
    """D-L2c E: names that carry their own schema (2-part) or both
    segments (3-part) are unaffected by the deletion — the default
    schema was never part of their construction."""
    client = _FakeClient(
        {
            "svc.warehouse.sales.orders": _table("svc.warehouse.sales.orders"),
            "svc.qdb.qschema.thing": _table("svc.qdb.qschema.thing"),
        }
    )
    resolver = _usage_resolver(client, default_schema="other")
    assert (
        resolver.resolve(_ident("sales", "orders"), context=_ctx("warehouse"))
        == "svc.warehouse.sales.orders"
    )
    assert (
        resolver.resolve(_ident("qdb", "qschema", "thing"), context=_ctx())
        == "svc.qdb.qschema.thing"
    )
    assert resolver.binding_counts["missing_schema"] == 0
    assert resolver.binding_counts["default_bound_schema"] == 0


# --- D-L2c B: schema-only connection (design §6.2) ------------------------


def test_schema_only_connection_binds_qualified_names_but_not_bare_name() -> None:
    """End-to-end lock for the D-L2c B removal: a connection carrying
    only the removed ``schema`` key contributes no default schema —
    ``resolve_connection_defaults`` yields ``(None, None)`` for
    Postgres — so the binding layer built from those defaults still
    binds a 2-segment name (schema from the qualifier, database from
    the row) and a 3-segment name (both segments qualified), while a
    bare name misses: ``missing_schema`` when the row supplies the
    database, ``missing_both`` when it supplies neither (the two keys
    are mutually exclusive per ``missing_count_key``). No segment of
    either successful binding is default-bound."""
    defaults = resolve_connection_defaults({"schema": "sales"}, "postgres")
    assert defaults == (None, None)
    client = _FakeClient(
        {"svc.warehouse.sales.orders": _table("svc.warehouse.sales.orders")}
    )
    resolver = _usage_resolver(
        client, default_database=defaults[0], default_schema=defaults[1]
    )
    assert (
        resolver.resolve(_ident("warehouse", "sales", "orders"), context=_ctx())
        == "svc.warehouse.sales.orders"
    )
    assert (
        resolver.resolve(_ident("sales", "orders"), context=_ctx("warehouse", None))
        == "svc.warehouse.sales.orders"
    )
    assert resolver.resolve(_ident("orders"), context=_ctx("warehouse", None)) is None
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_schema"] == 1
    assert counts["missing_both"] == 1
    assert counts["missing_database"] == 0
    assert counts["unresolved_404"] == 0
    assert counts["default_bound_database"] == 0
    assert counts["default_bound_schema"] == 0


# --- §6 test 11: cross-service limits (behavior record) ------------------


def test_cross_service_ambiguity_skips_and_counts(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """D-L2c D, rule 1 (collect-then-judge): with the same candidate
    under two named services, neither binds — the attempt is skipped,
    counted once as ambiguous, and the warning lists both competing
    FQNs. The old first-hit binding is gone."""
    client = _FakeClient(
        {
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
            "third_svc.db.public.orders": _table("third_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc"],
        cross_enabled=True,
    )
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.resolution"
    ):
        assert (
            resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
            is None
        )
    counts = resolver.binding_counts
    assert counts["cross_service_ambiguous"] == 1
    assert counts["cross_service_bound"] == 0
    assert counts["unresolved_404"] == 0
    assert counts["ambiguous"] == 0
    assert resolver.unresolved_table_count == 1
    assert "other_svc.db.public.orders" in caplog.text
    assert "third_svc.db.public.orders" in caplog.text


def test_cross_service_reuses_source_context_and_stays_exact_only() -> None:
    """Cross-service candidates reuse the source-service context
    (retained limitation — target-service context recomputation is a
    follow-up item, D-L2c D rule 2), and no case-insensitive step runs
    across services: a case-variant table under the other service does
    not bind."""
    client = _FakeClient(
        {"other_svc.db.public.Orders": _table("other_svc.db.public.Orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("ORDERS"), context=_ctx("db", "public")) is None
    )
    # The cross-service attempt probed the exact candidate only.
    assert "other_svc.db.public.ORDERS" in client.table_lookups
    assert client.listed_schemas == ["svc.db.public"]


def test_cross_service_disabled_never_leaves_own_service() -> None:
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _lineage_resolver(
        client, cross_services=[OTHER], cross_enabled=False
    )
    assert resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx()) is None
    assert client.table_lookups == ["svc.db.public.orders"]
    assert resolver.binding_counts["cross_service_ambiguous"] == 0
    assert resolver.binding_counts["cross_service_bound"] == 0


# --- Folding (§5.5b) ------------------------------------------------------


def test_postgres_unquoted_folds_before_exact() -> None:
    """An unquoted ``Orders`` on Postgres folds to ``orders`` before
    the exact candidate is built, so it does NOT hit a quoted
    mixed-case catalog object of the same spelling."""
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.orders": _table("svc.db.public.orders"),
        }
    )
    resolver = _usage_resolver(client, engine_key="postgres")
    assert (
        resolver.resolve(_ident("db", "public", "Orders"), context=_ctx())
        == "svc.db.public.orders"
    )
    assert client.table_lookups == ["svc.db.public.orders"]


def test_postgres_quoted_segment_never_folds_nor_falls_back() -> None:
    """A quoted ``Orders`` on Postgres keeps its spelling for the
    exact candidate and never enters the case-insensitive fallback
    (established case-sensitive quoting): with only the lowercase
    table cataloged, it misses outright and no listing runs."""
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client, engine_key="postgres")
    assert (
        resolver.resolve(
            _ident("db", "public", "Orders", quoted=(False, False, True)),
            context=_ctx(),
        )
        is None
    )
    assert client.table_lookups == ["svc.db.public.Orders"]
    assert client.listed_schemas == []


def test_snowflake_unquoted_folds_to_upper() -> None:
    client = _FakeClient({"svc.db.public.ORDERS": _table("svc.db.public.ORDERS")})
    resolver = _usage_resolver(client, engine_key="snowflake")
    assert (
        resolver.resolve(_ident("orders"), context=_ctx("db", "public"))
        == "svc.db.public.ORDERS"
    )
    assert client.table_lookups == ["svc.db.public.ORDERS"]


def test_redshift_unquoted_folds_quoted_keeps_spelling_and_may_fall_back() -> None:
    """Redshift unquoted segments fold to lowercase; a quoted segment
    keeps its spelling for exact matching but may still enter the
    fallback (unknown quoted handling — narrowed guarantee)."""
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client, engine_key="redshift")
    assert (
        resolver.resolve(_ident("Orders"), context=_ctx("db", "public"))
        == "svc.db.public.orders"
    )
    client2 = _FakeClient({"svc.db.public.ORDERS": _table("svc.db.public.ORDERS")})
    resolver2 = _usage_resolver(client2, engine_key="redshift")
    assert (
        resolver2.resolve(
            _ident("orders", quoted=(True,)), context=_ctx("db", "public")
        )
        == "svc.db.public.ORDERS"
    )


def test_unknown_engine_folds_nothing_and_fallback_stays_available() -> None:
    """MySQL's folding depends on unseen configuration, so nothing
    folds (narrowed guarantee); the exact miss still falls back."""
    client = _FakeClient({"svc.db.public.Orders": _table("svc.db.public.Orders")})
    resolver = _usage_resolver(client, engine_key="mysql")
    assert (
        resolver.resolve(_ident("ORDERS"), context=_ctx("db", "public"))
        == "svc.db.public.Orders"
    )
    assert client.table_lookups == ["svc.db.public.ORDERS"]


def test_folding_preserves_pre_fold_spelling_for_diagnostics() -> None:
    folded = fold_identifier(_ident("Orders"), "postgres")
    assert folded.texts == ("orders",)
    assert folded.segments[0].original == "Orders"
    assert folded.segments[0].pre_fold_text == "Orders"


# --- Over-segment names (§5.5/Q2) ----------------------------------------


def test_over_segment_table_name_skips_without_any_lookup() -> None:
    """A four-segment name has no mapping: it is skipped, never
    truncated to its last three segments, and no REST lookup runs."""
    client = _FakeClient(
        {"svc.db1.sch1.tbl1": _table("svc.db1.sch1.tbl1")}
    )
    resolver = _usage_resolver(client)
    assert (
        resolver.resolve(_ident("srv", "db1", "sch1", "tbl1"), context=_ctx()) is None
    )
    assert client.table_lookups == []
    assert client.listed_schemas == []
    assert resolver.binding_counts["unsupported_qualifier"] == 1


def test_over_segment_procedure_name_skips() -> None:
    client = _FakeClient(
        procedures={"svc.db.sch.proc": _procedure("svc.db.sch.proc")}
    )
    resolver = _lineage_resolver(client)
    assert (
        resolver.resolve_procedure(
            _ident("srv", "db", "sch", "proc"), context=_ctx()
        )
        is None
    )
    assert client.procedure_lookups == []
    assert resolver.binding_counts["unsupported_qualifier"] == 1


def test_candidate_fqns_structured_shapes() -> None:
    context = _ctx("rowdb", "rowschema")
    assert candidate_fqns(
        SERVICE, _ident("db", "public", "orders"), context,
        default_database="dflt", default_schema="dfltschema",
    ) == ["svc.db.public.orders"]
    assert candidate_fqns(
        SERVICE, _ident("public", "orders"), context,
        default_database="dflt", default_schema="dfltschema",
    ) == ["svc.rowdb.public.orders"]
    assert candidate_fqns(
        SERVICE, _ident("orders"), _ctx(),
        default_database="dflt", default_schema="dfltschema",
    ) == ["svc.dflt.dfltschema.orders"]
    assert candidate_fqns(
        SERVICE, _ident("orders"), _ctx(),
        default_database=None, default_schema=None,
    ) == []
    assert candidate_fqns(
        SERVICE, _ident("srv", "db", "sch", "tbl"), context,
        default_database="dflt", default_schema="dfltschema",
    ) == []


# --- Missing context, quiet probes, read failures -------------------------


def test_missing_context_keys_are_mutually_exclusive() -> None:
    resolver = _usage_resolver(_FakeClient())
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    assert resolver.resolve(_ident("orders"), context=_ctx("db", None)) is None
    assert resolver.resolve(_ident("public", "orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_both"] == 1
    assert counts["missing_schema"] == 1
    assert counts["missing_database"] == 1
    assert counts["unresolved_404"] == 0


def test_quiet_probe_counts_only_when_warned_loudly(
    caplog: pytest.LogCaptureFixture,
) -> None:
    resolver = _usage_resolver(_FakeClient())
    context = _ctx("db", "public")
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert (
            resolver.resolve(_ident("ghost"), context=context, quiet=True) is None
        )
    assert "ghost" not in caplog.text
    assert resolver.skipped_count == 0
    assert resolver.binding_counts["unresolved_404"] == 0
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        resolver.warn_unresolved(_ident("ghost"), context=context)
    assert "ghost" in caplog.text
    assert resolver.skipped_count == 1
    assert resolver.binding_counts["unresolved_404"] == 1


def test_quiet_ambiguous_probe_counts_ambiguous_only_when_warned_loudly(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A quiet probe that saw ambiguity must spend its count only
    when the loud warning consumes it — and under the ambiguous
    key, not 404. The fallback's own diagnostic line is logged
    during the probe (retained behavior); what stays quiet is the
    "No catalog table matches" warning."""
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.ORDERS": _table("svc.db.public.ORDERS"),
        }
    )
    resolver = _usage_resolver(client)
    context = _ctx("db", "public")
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve(_ident("orders"), context=context, quiet=True) is None
    assert "No catalog table matches" not in caplog.text
    assert resolver.skipped_count == 0
    assert resolver.binding_counts["ambiguous"] == 0
    assert resolver.binding_counts["unresolved_404"] == 0
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        resolver.warn_unresolved(_ident("orders"), context=context)
    assert "No catalog table matches" in caplog.text
    assert resolver.skipped_count == 1
    assert resolver.binding_counts["ambiguous"] == 1
    assert resolver.binding_counts["unresolved_404"] == 0


def test_quiet_missing_probe_counts_missing_key_only_when_warned_loudly() -> None:
    """A quiet probe that saw missing context must likewise count
    only on loud consumption, under the missing key the probe saw:
    both segments missing counts ``missing_both``; only the schema
    missing counts ``missing_schema`` — never 404."""
    resolver = _usage_resolver(_FakeClient())
    assert resolver.resolve(_ident("orders"), context=_ctx(), quiet=True) is None
    assert resolver.skipped_count == 0
    assert resolver.binding_counts["missing_both"] == 0
    resolver.warn_unresolved(_ident("orders"), context=_ctx())
    assert resolver.skipped_count == 1
    assert resolver.binding_counts["missing_both"] == 1
    assert resolver.binding_counts["unresolved_404"] == 0

    schema_only = _usage_resolver(_FakeClient())
    context = _ctx("db", None)
    assert (
        schema_only.resolve(_ident("orders"), context=context, quiet=True) is None
    )
    assert schema_only.binding_counts["missing_schema"] == 0
    schema_only.warn_unresolved(_ident("orders"), context=context)
    assert schema_only.binding_counts["missing_schema"] == 1
    assert schema_only.binding_counts["missing_both"] == 0
    assert schema_only.binding_counts["unresolved_404"] == 0


def test_cross_service_success_counts_default_bound_segments() -> None:
    """A cross-service hit built from the connection defaults counts
    each default-supplied segment: a 2-part name takes its database
    from the defaults, so the cross-service candidate construction
    must attribute it to ``default``. (D-L2c E: the schema default
    is deleted, so the database segment is the only default-supplied
    one left; a bare name can no longer bind this way.)"""
    client = _FakeClient(
        {"other_svc.dflt.public.orders": _table("other_svc.dflt.public.orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database="dflt",
        default_schema="dfltsch",
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("public", "orders"), context=_ctx())
        == "other_svc.dflt.public.orders"
    )
    assert client.table_lookups == [
        "svc.dflt.public.orders",
        "other_svc.dflt.public.orders",
    ]
    counts = resolver.binding_counts
    assert counts["default_bound_database"] == 1
    assert counts["default_bound_schema"] == 0
    assert counts["cross_service_bound"] == 1
    assert counts["cross_service_ambiguous"] == 0
    assert counts["unresolved_404"] == 0
    assert resolver.unresolved_table_count == 0


def test_cross_service_bare_name_misses_without_schema_default() -> None:
    """D×E: after the schema fallback is deleted, a bare name
    cannot be built into a candidate on any service — not
    own-service, not cross-service — even though the catalog holds
    the table under the old default schema. Both paths miss in the
    same way: no lookup is issued anywhere, ``missing_schema`` +1."""
    client = _FakeClient(
        {"other_svc.dflt.dfltsch.orders": _table("other_svc.dflt.dfltsch.orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database="dflt",
        default_schema="dfltsch",
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert resolver.resolve_table(_ident("orders"), context=_ctx()) is None
    assert client.table_lookups == []
    counts = resolver.binding_counts
    assert counts["missing_schema"] == 1
    assert counts["cross_service_bound"] == 0
    assert counts["cross_service_ambiguous"] == 0
    assert resolver.unresolved_table_count == 1


def test_procedure_fallback_compares_full_fqn_and_counts_ambiguity() -> None:
    """The procedure fallback compares whole FQNs like the table
    chain: a loose listing entry whose leaf matches but whose
    database differs must not bind (it counts 404), while two
    same-scope case variants count ``ambiguous`` exactly once."""
    trap = _FakeClient(
        {}, loose_listings=[_procedure("svc.otherdb.public.Orders")]
    )
    resolver = _lineage_resolver(trap)
    assert (
        resolver.resolve_procedure(_ident("db", "public", "orders"), context=_ctx())
        is None
    )
    assert trap.procedure_lookups == ["svc.db.public.orders"]
    assert trap.listed_schemas == ["svc.db.public"]
    assert resolver.binding_counts["unresolved_404"] == 1
    assert resolver.binding_counts["ambiguous"] == 0

    ambiguous_client = _FakeClient(
        procedures={
            "svc.db.public.Orders": _procedure("svc.db.public.Orders"),
            "svc.db.public.ORDERS": _procedure("svc.db.public.ORDERS"),
        }
    )
    ambiguous = _lineage_resolver(ambiguous_client)
    assert (
        ambiguous.resolve_procedure(_ident("orders"), context=_ctx("db", "public"))
        is None
    )
    assert ambiguous.binding_counts["ambiguous"] == 1
    assert ambiguous.binding_counts["unresolved_404"] == 0


def test_cross_service_success_leaves_no_pending_pollution() -> None:
    """An own-service quiet probe that saw ambiguity, rescued
    cross-service, counts nothing — and its pending classification
    must not leak into the next attempt: the next ghost counts
    exactly one 404 and zero ambiguity."""
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.ORDERS": _table("svc.db.public.ORDERS"),
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("orders"), context=_ctx("db", "public"))
        == "other_svc.db.public.orders"
    )
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 0
    assert counts["ambiguous"] == 0
    assert counts["missing_both"] == 0
    assert counts["missing_database"] == 0
    assert counts["missing_schema"] == 0
    assert counts["unsupported_qualifier"] == 0
    assert counts["read_failure"] == 0
    assert counts["default_bound_database"] == 0
    assert counts["default_bound_schema"] == 0
    assert resolver.unresolved_table_count == 0

    assert (
        resolver.resolve_table(_ident("ghost"), context=_ctx("db", "public")) is None
    )
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 1
    assert counts["ambiguous"] == 0
    assert resolver.unresolved_table_count == 1


def test_cross_service_success_counts_no_skip() -> None:
    """An own-service quiet probe rescued cross-service counts
    neither a skip nor a 404: only the final outcome counts."""
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
        == "other_svc.db.public.orders"
    )
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 0
    assert counts["missing_both"] == 0
    assert resolver.unresolved_table_count == 0


def test_cross_service_three_services_ambiguous_lists_all_three(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Three exact hits across three named services still skip, and
    the warning lists all three competing FQNs."""
    client = _FakeClient(
        {
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
            "third_svc.db.public.orders": _table("third_svc.db.public.orders"),
            "fourth_svc.db.public.orders": _table("fourth_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc", "fourth_svc"],
        cross_enabled=True,
    )
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.resolution"
    ):
        assert (
            resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
            is None
        )
    assert resolver.binding_counts["cross_service_ambiguous"] == 1
    assert resolver.unresolved_table_count == 1
    assert "other_svc.db.public.orders" in caplog.text
    assert "third_svc.db.public.orders" in caplog.text
    assert "fourth_svc.db.public.orders" in caplog.text


def test_cross_service_single_hit_among_misses_binds() -> None:
    """One exact hit and one 404 bind the hit: ambiguity needs two
    hits, not two probes."""
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc"],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
        == "other_svc.db.public.orders"
    )
    counts = resolver.binding_counts
    assert counts["cross_service_bound"] == 1
    assert counts["cross_service_ambiguous"] == 0
    assert resolver.unresolved_table_count == 0


def test_cross_service_no_hit_keeps_miss_path() -> None:
    """Zero cross-service hits keep the existing miss path: the
    pending probe classification is spent exactly once, under the
    probe's own key, with no ambiguity count."""
    client = _FakeClient({})
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc"],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "ghost"), context=_ctx()) is None
    )
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 1
    assert counts["cross_service_ambiguous"] == 0
    assert counts["cross_service_bound"] == 0
    assert resolver.unresolved_table_count == 1


def test_cross_service_ambiguity_verdict_ignores_config_order(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Config order no longer decides the outcome: swapping the
    service list still skips, and only the warning's listing order
    follows the config order."""
    tables = {
        "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
        "third_svc.db.public.orders": _table("third_svc.db.public.orders"),
    }
    first = _lineage_resolver(
        _FakeClient(tables),
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc"],
        cross_enabled=True,
    )
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.resolution"
    ):
        assert (
            first.resolve_table(_ident("db", "public", "orders"), context=_ctx())
            is None
        )
    assert first.binding_counts["cross_service_ambiguous"] == 1
    assert caplog.text.index("other_svc.db.public.orders") < caplog.text.index(
        "third_svc.db.public.orders"
    )
    caplog.clear()
    swapped = _lineage_resolver(
        _FakeClient(tables),
        default_database=None,
        default_schema=None,
        cross_services=["third_svc", OTHER],
        cross_enabled=True,
    )
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.lineage.resolution"
    ):
        assert (
            swapped.resolve_table(_ident("db", "public", "orders"), context=_ctx())
            is None
        )
    assert swapped.binding_counts["cross_service_ambiguous"] == 1
    assert caplog.text.index("third_svc.db.public.orders") < caplog.text.index(
        "other_svc.db.public.orders"
    )


def test_cross_service_own_service_hit_never_probes_cross_services() -> None:
    """An own-service hit never enters the cross-service loop: no
    cross-service FQN is looked up and no cross-service count moves."""
    client = _FakeClient(
        {
            "svc.db.public.orders": _table("svc.db.public.orders"),
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
        == "svc.db.public.orders"
    )
    assert client.table_lookups == ["svc.db.public.orders"]
    assert resolver.binding_counts["cross_service_bound"] == 0
    assert resolver.binding_counts["cross_service_ambiguous"] == 0


def test_cross_service_ambiguity_leaves_no_pending_pollution() -> None:
    """An ambiguity skip discards the own-service probe's pending
    classification instead of spending it: the next ghost counts
    exactly one 404, with no ambiguity residue and no ambiguity
    count on the second attempt."""
    client = _FakeClient(
        {
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
            "third_svc.db.public.orders": _table("third_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER, "third_svc"],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx()) is None
    )
    assert resolver.binding_counts["cross_service_ambiguous"] == 1
    assert resolver.binding_counts["unresolved_404"] == 0
    assert (
        resolver.resolve_table(_ident("db", "public", "ghost"), context=_ctx()) is None
    )
    counts = resolver.binding_counts
    assert counts["cross_service_ambiguous"] == 1
    assert counts["unresolved_404"] == 1
    assert counts["ambiguous"] == 0
    assert resolver.unresolved_table_count == 2


def test_cross_service_three_part_hit_binds_without_default_segments() -> None:
    """A 3-part name carries its own segments, so a cross-service hit
    binds with no default-supplied segment — only the path count
    moves."""
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _lineage_resolver(
        client,
        default_database="dflt",
        default_schema="dfltsch",
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_table(_ident("db", "public", "orders"), context=_ctx())
        == "other_svc.db.public.orders"
    )
    counts = resolver.binding_counts
    assert counts["cross_service_bound"] == 1
    assert counts["default_bound_database"] == 0
    assert counts["default_bound_schema"] == 0


def test_procedure_chain_has_no_cross_service_path() -> None:
    """D-L2c D, rule 3 (verified fact): ``resolve_procedure`` never
    probes another service, even with cross-service enabled and a
    same-named procedure sitting under the other service — only the
    own-service FQN is looked up."""
    client = _FakeClient(
        procedures={
            "other_svc.db.public.orders": _procedure("other_svc.db.public.orders")
        }
    )
    resolver = _lineage_resolver(
        client,
        default_database=None,
        default_schema=None,
        cross_services=[OTHER],
        cross_enabled=True,
    )
    assert (
        resolver.resolve_procedure(_ident("db", "public", "orders"), context=_ctx())
        is None
    )
    assert client.procedure_lookups == ["svc.db.public.orders"]


def test_read_failure_counts_then_propagates() -> None:
    resolver = _usage_resolver(_FakeClient(fail_tables_with=500))
    with pytest.raises(RestError):
        resolver.resolve(_ident("db", "public", "orders"), context=_ctx())
    assert resolver.binding_counts["read_failure"] == 1
    lineage = _lineage_resolver(_FakeClient(fail_tables_with=500))
    with pytest.raises(RestError):
        lineage.resolve_table(_ident("db", "public", "orders"), context=_ctx())
    assert lineage.binding_counts["read_failure"] == 1


def test_unresolved_warning_carries_both_provenance_levels(
    caplog: pytest.LogCaptureFixture,
) -> None:
    resolver = _usage_resolver(_FakeClient(), default_database="db")
    context = _ctx(
        None, None,
        database_source=FieldSource.MISSING,
        schema_source=FieldSource.MISSING,
    )
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve(_ident("public", "ghost"), context=context) is None
    assert "candidate database from default" in caplog.text
    assert "schema from qualifier" in caplog.text
    assert "input sources database=missing" in caplog.text
    assert "schema=missing" in caplog.text


def test_default_bound_counted_per_segment_per_success() -> None:
    """Per-segment default-bound counting after D-L2c E: the database
    default still supplies its segment (a 2-part name binds through
    it), but the schema default is deleted — a bare name misses
    instead of binding through it, so ``default_bound_schema``
    stays 0."""
    client = _FakeClient(
        {
            "svc.dflt.public.orders": _table("svc.dflt.public.orders"),
            "svc.rowdb.rowschema.items": _table("svc.rowdb.rowschema.items"),
            "svc.qdb.qschema.thing": _table("svc.qdb.qschema.thing"),
        }
    )
    resolver = _usage_resolver(
        client, default_database="dflt", default_schema="dfltsch"
    )
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    assert (
        resolver.resolve(_ident("public", "orders"), context=_ctx())
        == "svc.dflt.public.orders"
    )
    assert (
        resolver.resolve(_ident("items"), context=_ctx("rowdb", "rowschema"))
        == "svc.rowdb.rowschema.items"
    )
    assert (
        resolver.resolve(_ident("qdb", "qschema", "thing"), context=_ctx())
        == "svc.qdb.qschema.thing"
    )
    counts = resolver.binding_counts
    assert counts["default_bound_database"] == 1
    assert counts["default_bound_schema"] == 0
    assert counts["missing_schema"] == 1


# --- view_parent_schema_tables (structured, via association) --------------


def test_view_parents_keep_quoted_dot_schema_whole() -> None:
    parents = view_parent_schema_tables(
        'SELECT * FROM "sales.eu".orders', Dialect.POSTGRES, "public"
    )
    assert parents == [("sales.eu", "orders")]


def test_view_parents_use_last_two_segments_and_default_schema() -> None:
    assert view_parent_schema_tables(
        "SELECT * FROM warehouse.public.orders", Dialect.POSTGRES, "other"
    ) == [("public", "orders")]
    assert view_parent_schema_tables(
        "SELECT * FROM orders", Dialect.POSTGRES, "public"
    ) == [("public", "orders")]
    assert view_parent_schema_tables(
        "SELECT * FROM srv.db1.sch1.tbl1", Dialect.POSTGRES, "public"
    ) == [("sch1", "tbl1")]


def test_view_parents_resolve_cte_and_aliases_and_deduplicate() -> None:
    parents = view_parent_schema_tables(
        "SELECT o.id, c.name FROM raw.orders o "
        "JOIN raw.customers c ON c.id = o.customer_id",
        Dialect.POSTGRES,
        "public",
    )
    assert sorted(parents) == [("raw", "customers"), ("raw", "orders")]
    assert view_parent_schema_tables(
        "THIS IS NOT SQL AT ALL", Dialect.POSTGRES, "public"
    ) == []


def test_view_parents_skip_unconfirmed_sources_but_keep_confirmed_self_join() -> None:
    """A parseable source whose association is unconfirmed
    contributes no parent: the dynamic identifier's qualifier was
    never proven, so no parent is guessed for it (fail-closed).
    A self-join confirmed at table level contributes its parent
    exactly once, despite the two aliases."""
    assert view_parent_schema_tables(
        "SELECT * FROM IDENTIFIER('foo' || 'bar')", Dialect.SNOWFLAKE, "public"
    ) == []
    assert view_parent_schema_tables(
        "SELECT * FROM public.orders a JOIN public.orders b ON a.id = b.id",
        Dialect.POSTGRES,
        "public",
    ) == [("public", "orders")]
