# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""D-L2c A: unique-candidate discovery (DRAFT-A §7, T-1–T-23 + prep §1.8).

A bare (1-segment, double-missing) name is resolved by enumerating the
own service's tables by leaf name (REST ``tableRegex``) and binding
only when exactly one candidate survives the client's case-sensitive
exact-leaf verification. Two or more candidates — or a first page
already full at CAP+1 — skip as ambiguous; zero candidates fall back
to the existing ``missing_both`` path. All against a fake REST
catalog, never a live database.

Two design-table readings are corrected here, with reasons in
``~/workspace/work/dl2c-a/BENCHMARK.md`` §5 (T-17) and in the T-2/T-3
test comments (key labels): the counts follow ``build_candidate`` /
the pending-skip mechanism, not the swapped labels in the DRAFT-A
table."""

from __future__ import annotations

import logging
import re
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, TABLES_PATH
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.parser import QueryParserType
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.records import BindingContext, FieldSource, TableQueryRecord
from smartmetadata_ingestion.usage.processor import parse_sql_statement
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver

SERVICE = "svc"
OTHER = "other_svc"

CAP = 10


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


def _leaf(fqn: str) -> str:
    return fqn.rsplit(".", 1)[-1]


class _FakeClient:
    """In-memory catalog reads with server-faithful discovery semantics.

    ``iter_collection`` understands ``service`` + ``tableRegex`` +
    ``limit``: it filters by service prefix, applies the regex to the
    leaf name the way the server does (unanchored regular expression,
    case-insensitive), and yields in pages of ``limit`` — recording
    each page fetch so tests can prove the resolver stops after one
    page. ``loose_listings`` returns its pool verbatim (duplicates
    included) instead of filtering: the stand-in for a server that
    returned more than the strict set, proving the client's exact-leaf
    verification excludes the noise."""

    def __init__(
        self,
        tables: dict[str, dict[str, Any]] | None = None,
        procedures: dict[str, dict[str, Any]] | None = None,
        *,
        fail_tables_with: int | None = None,
        fail_listings_with: int | None = None,
        loose_listings: list[dict[str, Any]] | None = None,
    ) -> None:
        self._tables = tables or {}
        self._procedures = procedures or {}
        self._fail_tables_with = fail_tables_with
        self._fail_listings_with = fail_listings_with
        self._loose_listings = loose_listings
        self.table_lookups: list[str] = []
        self.procedure_lookups: list[str] = []
        self.listed_schemas: list[str] = []
        self.discovery_requests: list[dict[str, Any]] = []
        self.discovery_pages = 0
        self.discovery_items_pulled = 0

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
        params = extra_params or {}
        if self._fail_listings_with is not None:
            raise RestError("boom", status_code=self._fail_listings_with)
        if "tableRegex" in params:
            self.discovery_requests.append(
                {
                    "service": params.get("service"),
                    "regex": params["tableRegex"],
                    "limit": limit,
                }
            )
            if self._loose_listings is not None:
                pool = list(self._loose_listings)
            else:
                regex = params["tableRegex"]
                service = params.get("service") or ""
                pool = [
                    entity
                    for fqn, entity in self._tables.items()
                    if fqn.startswith(f"{service}.")
                    and re.search(regex, _leaf(fqn), re.IGNORECASE)
                ]
            for start in range(0, len(pool), limit):
                self.discovery_pages += 1
                for item in pool[start : start + limit]:
                    self.discovery_items_pulled += 1
                    yield item
            return
        schema_fqn = params.get("databaseSchema", "")
        self.listed_schemas.append(schema_fqn)
        if self._loose_listings is not None:
            yield from self._loose_listings
            return
        pool = self._tables if path == TABLES_PATH else self._procedures
        if path not in (TABLES_PATH, STORED_PROCEDURES_PATH):  # pragma: no cover
            raise AssertionError(f"unexpected collection {path}")
        prefix = f"{schema_fqn}."
        for fqn, entity in pool.items():
            if fqn.startswith(prefix):
                yield entity


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
    default_database: str | None = None,
    default_schema: str | None = None,
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


def _discovery_regexes(client: _FakeClient) -> list[str]:
    return [request["regex"] for request in client.discovery_requests]


# --- T-1: unique candidate binds -------------------------------------------


def test_t01_unique_candidate_binds_with_audit_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    counts = resolver.binding_counts
    assert counts["discovery_bound"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_ambiguous"] == 0
    assert counts["missing_both"] == 0
    # The binding comes from the listing, not from a by-name lookup.
    assert client.table_lookups == []
    assert client.discovery_requests == [
        {"service": SERVICE, "regex": "^orders$", "limit": CAP + 1}
    ]
    assert "svc.db.public.orders" in caplog.text
    assert "discovery" in caplog.text
    assert "orders" in caplog.text


# --- T-2 / T-3: single-miss shapes never discover ---------------------------
#
# DRAFT-A §7 labels T-2 "row has schema → missing_schema" and T-3 "row
# has database → missing_database"; the labels are swapped against
# build_candidate (a row that supplies the database leaves only the
# schema missing, and vice versa — locked by
# test_missing_context_keys_are_mutually_exclusive). The tests below
# assert the code's keys: row database present → missing_schema, row
# schema present → missing_database. Either way discovery never runs.


def test_t02_row_database_present_misses_schema_without_discovery() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx("db", None)) is None
    counts = resolver.binding_counts
    assert counts["missing_schema"] == 1
    assert counts["discovery_attempted"] == 0
    assert client.discovery_requests == []


def test_t03_row_schema_present_misses_database_without_discovery() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx(None, "public")) is None
    counts = resolver.binding_counts
    assert counts["missing_database"] == 1
    assert counts["discovery_attempted"] == 0
    assert client.discovery_requests == []


# --- M-1 (review): E-corner discovery triggers -----------------------------
#
# BENCHMARK.md §3: after the E full delete, `default_schema` is only a
# scan-range value — `effective_default_schema` always returns `None` —
# so a double-missing row with a `default_schema` set still counts
# `missing_both` and discovery still fires. Before E, the same name
# bound by default and never discovered. The first test locks that
# post-E trigger (binding from the enumeration, not from the scan-range
# value: the unique table sits in another schema); the second locks
# the remaining single-missing form, `default_database` present.
# Neither shape had a direct test before this section.


def test_default_schema_scan_range_value_still_discovers() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client, default_schema="sales")
    assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    counts = resolver.binding_counts
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 1
    assert counts["missing_both"] == 0
    # The binding comes from the listing, not from a by-name lookup
    # into the scan-range schema.
    assert client.table_lookups == []
    assert client.discovery_requests == [
        {"service": SERVICE, "regex": "^orders$", "limit": CAP + 1}
    ]


def test_default_database_present_is_single_missing_without_discovery() -> None:
    client = _FakeClient({"svc.shop.public.orders": _table("svc.shop.public.orders")})
    resolver = _usage_resolver(client, default_database="shop")
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_schema"] == 1
    assert counts["discovery_attempted"] == 0
    assert client.discovery_requests == []


# --- T-4 / T-5: qualified names never discover ------------------------------


def test_t04_two_part_miss_does_not_discover() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("public", "ghost"), context=_ctx("db")) is None
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 1
    assert counts["discovery_attempted"] == 0
    assert client.discovery_requests == []


def test_t05_three_part_miss_does_not_discover() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("db", "public", "ghost"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 1
    assert counts["discovery_attempted"] == 0
    assert client.discovery_requests == []


# --- T-6: zero candidates fall back to missing_both -------------------------


def test_t06_zero_candidates_fall_back_to_missing_both() -> None:
    resolver = _usage_resolver(_FakeClient())
    assert resolver.resolve(_ident("ghost"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_both"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 0
    assert counts["discovery_ambiguous"] == 0


# --- T-7 / T-9: ambiguity skips, loud warning lists competitors ------------


def test_t07_two_candidates_skip_as_ambiguous(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient(
        {
            "svc.db.public.orders": _table("svc.db.public.orders"),
            "svc.other.public.orders": _table("svc.other.public.orders"),
        }
    )
    resolver = _usage_resolver(client)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["discovery_ambiguous"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 0
    assert counts["missing_both"] == 0
    assert "svc.db.public.orders" in caplog.text
    assert "svc.other.public.orders" in caplog.text


def test_t09_same_leaf_in_two_databases_is_ambiguous() -> None:
    client = _FakeClient(
        {
            "svc.db1.public.orders": _table("svc.db1.public.orders"),
            "svc.db2.public.orders": _table("svc.db2.public.orders"),
        }
    )
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["discovery_ambiguous"] == 1
    assert counts["discovery_attempted"] == 1


# --- T-8: CAP+1 truncation is ambiguous after exactly one page -------------


def test_t08_cap_plus_one_is_ambiguous_after_one_page() -> None:
    tables = {
        f"svc.db{i:02d}.sch.orders": _table(f"svc.db{i:02d}.sch.orders")
        for i in range(25)
    }
    client = _FakeClient(tables)
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["discovery_ambiguous"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 0
    # The first page already held CAP+1 items: the resolver stopped
    # there and never asked for a second page, even though 25 match.
    assert client.discovery_requests == [
        {"service": SERVICE, "regex": "^orders$", "limit": CAP + 1}
    ]
    assert client.discovery_pages == 1
    assert client.discovery_items_pulled == CAP + 1


# --- T-10: duplicate FQN entries deduplicate to a unique bind --------------


def test_t10_duplicate_fqn_deduplicates_to_unique_bind() -> None:
    fqn = "svc.db.public.orders"
    client = _FakeClient({}, loose_listings=[_table(fqn), _table(fqn)])
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) == fqn
    counts = resolver.binding_counts
    assert counts["discovery_bound"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_ambiguous"] == 0


# --- T-11 / T-12 / T-13: client-side exact-leaf verification ---------------


def test_t11_substring_names_do_not_count_as_candidates() -> None:
    """The server may return leaf-substring noise; the client's exact
    verification excludes it, so zero candidates remain."""
    client = _FakeClient(
        {},
        loose_listings=[
            _table("svc.db.public.orders2"),
            _table("svc.db.public.myorders"),
        ],
    )
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_both"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 0
    assert counts["discovery_ambiguous"] == 0


def test_t11b_exact_candidate_binds_among_substring_noise() -> None:
    client = _FakeClient(
        {},
        loose_listings=[
            _table("svc.db.public.orders"),
            _table("svc.db.public.orders2"),
            _table("svc.db.public.myorders"),
        ],
    )
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    assert resolver.binding_counts["discovery_bound"] == 1


def test_t12_case_variant_does_not_count_for_unquoted_pg_name() -> None:
    """PG unquoted ``Orders`` folds to ``orders``; the server's
    case-insensitive match returns the quoted-created ``Orders``,
    but the case-sensitive verification excludes it."""
    client = _FakeClient({"svc.db.public.Orders": _table("svc.db.public.Orders")})
    resolver = _usage_resolver(client, engine_key="postgres")
    assert resolver.resolve(_ident("Orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["missing_both"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["discovery_bound"] == 0


def test_t13_quoted_leaf_matches_only_its_own_spelling() -> None:
    """Quoted ``"Orders"`` on PG keeps its spelling and binds only
    the ``Orders`` table, not the lowercase one the server also
    returns (case-insensitive match)."""
    client = _FakeClient(
        {
            "svc.db.public.Orders": _table("svc.db.public.Orders"),
            "svc.db.public.orders": _table("svc.db.public.orders"),
        }
    )
    resolver = _usage_resolver(client, engine_key="postgres")
    assert (
        resolver.resolve(_ident("Orders", quoted=(True,)), context=_ctx())
        == "svc.db.public.Orders"
    )
    assert resolver.binding_counts["discovery_bound"] == 1


# --- T-14 / T-15: discovery results cache (positive and negative) -----------


def test_t14_positive_discovery_result_is_cached() -> None:
    client = _FakeClient({"svc.db.public.orders": _table("svc.db.public.orders")})
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    assert len(client.discovery_requests) == 1
    assert resolver.binding_counts["discovery_attempted"] == 2
    assert resolver.binding_counts["discovery_bound"] == 2
    # The bound FQN's list item also seeded the exact-lookup cache:
    # a later qualified resolve needs no by-name request.
    assert (
        resolver.resolve(_ident("db", "public", "orders"), context=_ctx())
        == "svc.db.public.orders"
    )
    assert client.table_lookups == []


def test_t15_negative_discovery_result_is_cached() -> None:
    client = _FakeClient()
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("ghost"), context=_ctx()) is None
    assert resolver.resolve(_ident("ghost"), context=_ctx()) is None
    assert len(client.discovery_requests) == 1
    assert resolver.binding_counts["discovery_attempted"] == 2
    assert resolver.binding_counts["missing_both"] == 2


# --- T-16 / T-17 / T-18: cross-service interaction --------------------------


def test_t16_own_service_discovery_hit_never_probes_cross_services(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A discovery bind inside the quiet own-service probe ends the
    attempt: no cross-service FQN is looked up — and the bound
    audit warning is still recorded (it is not quiet-gated)."""
    client = _FakeClient(
        {
            "svc.db.public.orders": _table("svc.db.public.orders"),
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client, cross_services=[OTHER], cross_enabled=True
    )
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert (
            resolver.resolve_table(_ident("orders"), context=_ctx())
            == "svc.db.public.orders"
        )
    assert client.table_lookups == []
    assert resolver.binding_counts["cross_service_bound"] == 0
    assert resolver.binding_counts["cross_service_ambiguous"] == 0
    assert "svc.db.public.orders" in caplog.text
    assert "discovery" in caplog.text


def test_t17_own_service_discovery_ambiguity_survives_cross_service_exhaustion(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """DRAFT-A T-17's literal scenario ("own-service discovery
    ambiguity, then a cross-service exact hit") cannot happen, for
    a structural reason: discovery only fires for a 1-segment name
    with both context segments missing and no default database —
    and ``build_candidate`` for such a name is ``None`` under EVERY
    service, because the cross-service loop reuses the same context
    and defaults (``resolution.py``: ``if candidate.fqn is None:
    continue``). No cross-service candidate can ever rescue a
    discovery-eligible name, so there is no rescue to count.

    What is reachable — and what this test locks — is the pending
    path through the lineage chain: the quiet own-service probe
    sees discovery ambiguity, the cross-service loop exhausts
    without a candidate, and only then does the loud warning consume
    the pending ``discovery_ambiguous`` exactly once (not
    ``missing_both``), listing the competitors. The same
    "one attempt counts once, under its final outcome" rule that
    DRAFT-A §3.6.4 states — and that
    ``test_cross_service_success_counts_no_skip`` locks for the
    fallback ambiguity — therefore also governs discovery: had a
    rescue been possible, the pending verdict would have been
    discarded with nothing counted. See BENCHMARK.md §5."""
    client = _FakeClient(
        {
            "svc.db1.public.orders": _table("svc.db1.public.orders"),
            "svc.db2.public.orders": _table("svc.db2.public.orders"),
            "other_svc.db.public.orders": _table("other_svc.db.public.orders"),
        }
    )
    resolver = _lineage_resolver(
        client, cross_services=[OTHER], cross_enabled=True
    )
    with caplog.at_level(logging.WARNING):
        assert resolver.resolve_table(_ident("orders"), context=_ctx()) is None
    counts = resolver.binding_counts
    assert counts["discovery_ambiguous"] == 1
    assert counts["discovery_attempted"] == 1
    assert counts["missing_both"] == 0
    assert counts["cross_service_bound"] == 0
    assert counts["cross_service_ambiguous"] == 0
    assert resolver.unresolved_table_count == 1
    # The loud warning — not a quiet-probe warning — lists the
    # competitors, and no exact lookup ran anywhere: a double-missing
    # bare name has no candidate on any service.
    assert "svc.db1.public.orders" in caplog.text
    assert "svc.db2.public.orders" in caplog.text
    assert client.table_lookups == []
    # The consumed pending discovery must not pollute the next
    # attempt: the next ghost counts exactly one 404.
    assert (
        resolver.resolve_table(_ident("db", "public", "ghost"), context=_ctx()) is None
    )
    counts = resolver.binding_counts
    assert counts["unresolved_404"] == 1
    assert counts["discovery_ambiguous"] == 1
    assert resolver.unresolved_table_count == 2


def test_t18_cross_service_loop_never_discovers() -> None:
    """A 1-segment name with no context cannot be built into a
    candidate on any service, so the cross-service loop issues no
    discovery request of its own: the only discovery attempt is the
    own-service one."""
    client = _FakeClient(
        {"other_svc.db.public.orders": _table("other_svc.db.public.orders")}
    )
    resolver = _lineage_resolver(
        client, cross_services=[OTHER], cross_enabled=True
    )
    assert resolver.resolve_table(_ident("orders"), context=_ctx()) is None
    assert [request["service"] for request in client.discovery_requests] == [SERVICE]
    assert resolver.binding_counts["discovery_attempted"] == 1
    assert resolver.binding_counts["missing_both"] == 1


# --- T-19: counting identity ------------------------------------------------


def test_t19_counting_identity_holds() -> None:
    client = _FakeClient(
        {
            "svc.db.public.orders": _table("svc.db.public.orders"),
            "svc.db1.public.items": _table("svc.db1.public.items"),
            "svc.db2.public.items": _table("svc.db2.public.items"),
        }
    )
    resolver = _usage_resolver(client)
    assert resolver.resolve(_ident("orders"), context=_ctx()) == "svc.db.public.orders"
    assert resolver.resolve(_ident("items"), context=_ctx()) is None
    assert resolver.resolve(_ident("ghost"), context=_ctx()) is None
    counts = resolver.binding_counts
    attempted = counts["discovery_attempted"]
    bound = counts["discovery_bound"]
    ambiguous = counts["discovery_ambiguous"]
    derived_zero = attempted - bound - ambiguous
    assert attempted == 3
    assert bound == 1
    assert ambiguous == 1
    assert derived_zero == 1
    # The derived zero-candidate count equals the missing_both
    # increment: the 0-candidate discovery still counts as a miss.
    assert counts["missing_both"] == derived_zero


# --- T-20: counts and logging ------------------------------------------------


def test_t20_bound_warning_text_and_throttle(
    caplog: pytest.LogCaptureFixture,
) -> None:
    tables = {
        f"svc.db.public.t{i:03d}": _table(f"svc.db.public.t{i:03d}")
        for i in range(101)
    }
    client = _FakeClient(tables)
    resolver = _usage_resolver(client)
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        for i in range(101):
            assert (
                resolver.resolve(_ident(f"t{i:03d}"), context=_ctx())
                == f"svc.db.public.t{i:03d}"
            )
    counts = resolver.binding_counts
    assert counts["discovery_bound"] == 101
    assert counts["discovery_attempted"] == 101
    assert counts["discovery_ambiguous"] == 0
    bound_warnings = [
        record
        for record in caplog.records
        if "discovery" in record.getMessage()
        and "svc.db.public.t" in record.getMessage()
    ]
    assert len(bound_warnings) == 100
    assert "svc.db.public.t000" in bound_warnings[0].getMessage()


# --- T-21: discovery read failure propagates --------------------------------


def test_t21_discovery_read_failure_counts_then_propagates() -> None:
    resolver = _usage_resolver(_FakeClient(fail_listings_with=500))
    with pytest.raises(RestError):
        resolver.resolve(_ident("orders"), context=_ctx())
    counts = resolver.binding_counts
    assert counts["read_failure"] == 1
    # A failed enumeration is a read failure, not a discovery
    # outcome: it must not enter the attempted/bound/ambiguous
    # identity as a zero-candidate miss.
    assert counts["discovery_attempted"] == 0
    assert counts["missing_both"] == 0


# --- T-22: calling-side guarantee (CTE names never enter resolve) -----------


def test_t22_usage_cte_name_never_reaches_discovery() -> None:
    """``WITH x AS (…) SELECT * FROM x``: the CTE name ``x`` is an
    INTERMEDIATE, so the usage parser keeps it out of
    ``ParsedData.tables`` — only the real source ``real_t`` is
    resolved, and only ``real_t`` ever attempts discovery."""
    record = TableQueryRecord(
        query="WITH x AS (SELECT * FROM real_t) SELECT * FROM x",
        service_name=SERVICE,
    )
    parsed = parse_sql_statement(record, Dialect.POSTGRES, QueryParserType.AUTO)
    assert parsed is not None
    assert [name.texts for name in parsed.tables] == [("real_t",)]
    client = _FakeClient({"svc.db.public.real_t": _table("svc.db.public.real_t")})
    resolver = _usage_resolver(client)
    for name in parsed.tables:
        resolver.resolve(name, context=parsed.binding_context)
    assert _discovery_regexes(client) == ["^real_t$"]
    assert resolver.binding_counts["discovery_attempted"] == 1
    assert resolver.binding_counts["discovery_bound"] == 1


def test_t22_lineage_cte_name_never_reaches_discovery() -> None:
    client = _FakeClient({"svc.db.public.real_t": _table("svc.db.public.real_t")})
    resolver = _lineage_resolver(client)
    processor = QueryLineageProcessor(resolver, service_name=SERVICE, dialect=Dialect.POSTGRES)
    processed = processor.process(
        "WITH x AS (SELECT * FROM real_t) SELECT * FROM x", context=_ctx()
    )
    assert processed is not None
    assert _discovery_regexes(client) == ["^real_t$"]
    assert resolver.binding_counts["discovery_attempted"] == 1


# --- T-23: regex escaping ----------------------------------------------------


def test_t23_leaf_with_regex_metachar_is_escaped() -> None:
    client = _FakeClient({"svc.db.public.a$b": _table("svc.db.public.a$b")})
    resolver = _usage_resolver(client, engine_key="postgres")
    assert (
        resolver.resolve(_ident("a$b", quoted=(True,)), context=_ctx())
        == "svc.db.public.a$b"
    )
    assert client.discovery_requests == [
        {"service": SERVICE, "regex": "^a\\$b$", "limit": CAP + 1}
    ]
    assert resolver.binding_counts["discovery_bound"] == 1
