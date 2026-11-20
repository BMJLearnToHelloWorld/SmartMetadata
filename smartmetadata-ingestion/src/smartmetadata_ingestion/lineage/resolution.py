# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage binding resolution: parsed names → catalog entities via REST.

The same-service table chain is the usage worker's
``RestTableBindingResolver`` (exact-FQN candidates, then a
schema-scoped unique case-insensitive match, then skip-with-warning;
D-C8 item 5, mandatory parent-review item) — composed here, never
duplicated. This module only ADDS what lineage needs beyond usage:

- cross-service candidates, tried after the own-service chain when
  ``processCrossDatabaseLineage`` names other services;
- table-column validation, so column lineage FQNs use the catalog's
  column spelling and never invent a column the catalog does not
  have;
- stored-procedure / UDF binding, for the procedure channel and for
  function-call column paths.

Fallback chain, in order (the documented design, D-C8 item 5):

1. Own service: the usage resolver's chain, unchanged.
2. Cross-database (only when enabled with names): the same
   exact-FQN candidates under each named service, in config order;
   no case-insensitive step across services — a fuzzy match in a
   foreign service would bind a query to the wrong catalog.
3. Unresolvable: ``None``. Callers skip with a warning, never
   invent an entity.

All resolution is serialized through one lock: lineage channels run
in worker threads, and the composed resolver's caches are not
thread-safe on their own.

UDF scope (D-C8 item 2): function bodies resolve through the same
stored-procedure reads as procedures (the catalog stores UDFs and
functions as stored-procedure entities). Until stored procedures are
cataloged (metadata C-8), every lookup misses and the call sites
contribute no UDF-expanded edges — a bounded, logged gap, not a
silent drop: the lookup is attempted and the miss is counted.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from collections.abc import Iterable
from typing import Any

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, RestClient
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.folding import fallback_eligible, fold_identifier
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.parser import (
    LINEAGE_PARSING_TIMEOUT,
    LineageParser,
    QueryParserType,
)
from smartmetadata_ingestion.records import BindingContext
from smartmetadata_ingestion.usage.stage import (
    BINDING_COUNT_KEYS,
    CandidateSource,
    RestTableBindingResolver,
    build_candidate,
    missing_count_key,
    new_binding_counts,
)

logger = logging.getLogger(__name__)

# Resolver caches are bounded (AGENTS.md: no unbounded caches). A run
# resolves each distinct table/procedure at most once; misses cache
# too, so a 404 is asked about once per run.
MAX_CACHED_TABLE_COLUMNS = 512
MAX_CACHED_PROCEDURES = 512
MAX_CACHED_PROCEDURE_LISTINGS = 128

# Unresolvable-procedure warnings are throttled like the usage
# resolver's table warnings: distinct names first, then counted.
MAX_WARNED_UNRESOLVED_PROCEDURES = 100

_MISSING: Any = object()


class _LockedCache:
    """A bounded LRU cache whose every access holds the owner's lock.

    Callers hold :class:`LineageBindingResolver`'s lock while calling
    these methods; the cache itself only enforces the size bound.
    """

    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._data: OrderedDict[str, Any] = OrderedDict()

    def get(self, key: str) -> Any:
        try:
            value = self._data.pop(key)
        except KeyError:
            return _MISSING
        self._data[key] = value
        return value

    def set(self, key: str, value: Any) -> None:
        self._data.pop(key, None)
        self._data[key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)


def candidate_fqns(
    service: str,
    name: StructuredIdentifier,
    context: BindingContext,
    *,
    default_database: str | None,
    default_schema: str | None,
) -> list[str]:
    """Candidate FQNs for a (folded) parsed name under one service:
    at most one, from the shared construction in
    :func:`build_candidate`, so cross-service attempts behave
    identically to own-service ones. Three-part names carry their
    own database/schema; two-part names take the database from
    context; one-part names need both from context; over-long names
    map to nothing — the caller skips them, never truncates (Q2).
    Folding-agnostic: the caller folds at the entry, and this
    function builds from the folded identifier it receives."""
    candidate = build_candidate(
        service,
        name,
        context,
        default_database=default_database,
        default_schema=default_schema,
    )
    return [candidate.fqn] if candidate.fqn is not None else []


def passes_filter(
    name: str,
    fqn: str,
    *,
    include: Iterable[str],
    exclude: Iterable[str],
    use_fqn_for_filtering: bool = False,
) -> bool:
    """Whether a catalog name passes an include/exclude pattern pair.

    The candidate is the bare name, or the full FQN when the pipeline
    asked for FQN filtering — the same choice the metadata sources
    make, applied here to views and procedures."""
    candidate = fqn if use_fqn_for_filtering else name
    return is_selected(candidate, include=include, exclude=exclude)


def view_parent_schema_tables(
    definition: str,
    dialect: Dialect,
    default_schema: str,
    *,
    timeout_seconds: float = LINEAGE_PARSING_TIMEOUT,
    parser_type: QueryParserType = QueryParserType.AUTO,
) -> list[tuple[str, str]]:
    """A view definition's source tables as (schema, table) pairs.

    Parser-based, replacing the deleted FROM/JOIN regex
    (``connectors/sql_views.py``, K-1): subqueries, CTEs, and aliases
    resolve through the cascade, and qualified names keep their own
    schema. Each source table contributes its structured identifier
    (via the parser's association verdict — never a flattened
    string): names with two or more segments contribute their last
    two segments, the database part being the caller's context
    (metadata view lineage stays same-database, as before);
    unqualified names take the default schema. An endpoint whose
    association is unconfirmed contributes nothing — its qualifier
    was never proven, so no parent is guessed for it. Order follows
    the parser's source-table order, deduplicated. An unparseable
    definition yields no parents — the parser absorbs bad SQL into
    empty views, never an exception."""
    parser = LineageParser(
        definition,
        dialect=dialect,
        timeout_seconds=timeout_seconds,
        parser_type=parser_type,
    )
    parents: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for table in parser.source_tables:
        association = parser.association_for(table)
        identifier = association.identifier if association is not None else None
        if identifier is None:
            continue
        if len(identifier) >= 2:
            key = (identifier.segments[-2].text, identifier.leaf.text)
        else:
            key = (default_schema, identifier.leaf.text)
        if key not in seen:
            seen.add(key)
            parents.append(key)
    return parents


class LineageBindingResolver:
    """Parsed-name → catalog-entity binding for the lineage channels."""

    def __init__(
        self,
        client: RestClient,
        service_name: str,
        *,
        default_database: str | None = None,
        default_schema: str | None = None,
        cross_database_service_names: Iterable[str] = (),
        process_cross_database_lineage: bool = False,
        engine_key: str | None = None,
    ) -> None:
        self._client = client
        self._service_name = service_name
        self._default_database = default_database
        self._default_schema = default_schema
        self._engine_key = engine_key
        self._tables = RestTableBindingResolver(
            client,
            service_name,
            default_database=default_database,
            default_schema=default_schema,
            engine_key=engine_key,
        )
        self._cross_services = [
            name.strip() for name in cross_database_service_names if name and name.strip()
        ]
        self._cross_enabled = process_cross_database_lineage and bool(self._cross_services)
        self._lock = threading.RLock()
        self._table_entities = _LockedCache(MAX_CACHED_TABLE_COLUMNS)
        self._columns = _LockedCache(MAX_CACHED_TABLE_COLUMNS)
        self._procedures = _LockedCache(MAX_CACHED_PROCEDURES)
        self._procedure_listings = _LockedCache(MAX_CACHED_PROCEDURE_LISTINGS)
        self._warned_procedures: set[StructuredIdentifier] = set()
        self._procedure_throttle_warned = False
        self._warned_cross_ambiguous: set[str] = set()
        self._cross_ambiguous_throttle_warned = False
        self._unresolved_tables = 0
        self._unresolved_procedures = 0
        self._unresolved_udfs = 0
        # Design §5.8 counters for the lineage-owned decision points
        # (procedure/UDF/column chains and cross-service attempts).
        # Own-service table attempts count inside the composed usage
        # resolver; binding_counts merges the two, never double.
        self._counts: dict[str, int] = {key: 0 for key in BINDING_COUNT_KEYS}
        self._fidelity_skips: dict[str, int] = {}

    @property
    def binding_counts(self) -> dict[str, Any]:
        """Design §5.8 per-key binding counts for this resolver: its
        own counters merged with the composed usage resolver's, as a
        fresh snapshot. Each decision point counts into exactly one
        of the two, so the merge is a plain sum."""
        with self._lock:
            counts = new_binding_counts()
            table_counts = self._tables.binding_counts
            for key in BINDING_COUNT_KEYS:
                counts[key] = self._counts[key] + table_counts[key]
            merged: dict[str, int] = dict(self._fidelity_skips)
            for branch, value in table_counts["fidelity_unproven_skip"].items():
                merged[branch] = merged.get(branch, 0) + value
            counts["fidelity_unproven_skip"] = merged
            return counts

    def note_unsupported_qualifier(self, count: int = 1) -> None:
        """Count names whose qualifier could not be proven faithful
        (extraction-level, reported by the lineage processor)."""
        with self._lock:
            self._counts["unsupported_qualifier"] += count

    def note_fidelity_skip(self, branch: str, count: int = 1) -> None:
        """Count queries/paths skipped because name fidelity was
        unproven, attributed to the winning parser branch."""
        with self._lock:
            self._fidelity_skips[branch] = self._fidelity_skips.get(branch, 0) + count

    def note_builtin_filtered(
        self, identifier: StructuredIdentifier, count: int = 1
    ) -> None:
        """Count a built-in function call filtered out of UDF
        candidates (D-L2c H). The selection layer dropped the name
        before any catalog lookup, so no UDF miss is recorded for it;
        the identifier is carried for the callback protocol only —
        the count needs no attribution. This changes the
        ``unresolved_udf_count`` baseline: ``COUNT(*)`` no longer
        counts as a UDF miss."""
        with self._lock:
            self._counts["builtin_function_filtered"] += count

    @property
    def unresolved_table_count(self) -> int:
        """Parsed table names that bound to no catalog table after
        every service was tried. An own-service miss that resolves
        cross-service is not counted — only the final outcome is."""
        return self._unresolved_tables

    @property
    def warning_count(self) -> int:
        """Binding skips that count as run warnings (C-11/B-4):
        finally-unresolved tables plus unresolved procedures. UDF
        misses are a subset of procedure misses (``resolve_udf``
        delegates to ``resolve_procedure``) and are NOT added again."""
        return self._unresolved_tables + self._unresolved_procedures

    @property
    def unresolved_procedure_count(self) -> int:
        """CALLs/UDF names that bound to no catalog procedure."""
        return self._unresolved_procedures

    @property
    def unresolved_udf_count(self) -> int:
        """Function names whose UDF lookup missed."""
        return self._unresolved_udfs

    def resolve_table(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
    ) -> str | None:
        """The catalog table FQN for a parsed name, or ``None``.

        Own service first (the usage chain), then each named
        cross-database service when enabled. A 404 moves to the next
        candidate; any other REST error propagates. Cross-service
        resolution stays explicit names, exact-only, source-service
        context reused — and that limitation is retained deliberately
        (design §3.6/Q8): no per-service context is added here. But
        the first hit no longer wins: every named service is probed,
        the hits are collected, and only a unique hit binds (D-L2c
        D, collect-then-judge). Config order now decides probe order
        and the order competing FQNs are listed in the ambiguity
        warning, not the binding outcome.
        """
        with self._lock:
            folded = fold_identifier(name, self._engine_key)
            resolved = self._tables.resolve(
                folded,
                context=context,
                quiet=self._cross_enabled,
            )
            if resolved is not None:
                return resolved
            if self._cross_enabled:
                # The effective default schema is read once, before
                # the loop, from the composed usage resolver: the
                # D-L2c E gate (schema-fallback suppression) applies
                # to cross-service candidates exactly as it does to
                # own-service ones, so the two paths can never
                # disagree about which default a name was built from.
                effective_schema = self._tables.effective_default_schema
                hits: list[
                    tuple[str, str, tuple[CandidateSource, CandidateSource]]
                ] = []
                for service in self._cross_services:
                    if service == self._service_name:
                        continue
                    candidate = build_candidate(
                        service,
                        folded,
                        context,
                        default_database=self._default_database,
                        default_schema=effective_schema,
                    )
                    if candidate.fqn is None:
                        continue
                    if self._table_lookup(candidate.fqn) is not None:
                        hits.append((service, candidate.fqn, candidate.sources))
                if len(hits) == 1:
                    self._count_default_bound(hits[0][2])
                    self._counts["cross_service_bound"] += 1
                    return hits[0][1]
                if len(hits) >= 2:
                    self._warn_cross_service_ambiguous(
                        folded, [fqn for _, fqn, _ in hits]
                    )
                    # The count is incremented after the warning so
                    # the throttle message ("skipped so far") counts
                    # only the skips before this one, not this one.
                    self._counts["cross_service_ambiguous"] += 1
                    # Do not call warn_unresolved here: the
                    # own-service quiet probe left a pending skip
                    # classification, and spending it would count
                    # this one skip twice (once under the probe's
                    # key, once as ambiguous). The ambiguity count
                    # above is the skip's only count.
                    self._tables.discard_pending_skip()
                    self._unresolved_tables += 1
                    return None
                # The own-service probe ran quiet; only now, with every
                # resolver exhausted, does the name earn its warning.
                # Inside the guard: with cross-service probing off the
                # probe already warned loudly and must not warn twice.
                # The loud warning consumes the probe's pending skip
                # classification, so the attempt counts exactly once.
                self._tables.warn_unresolved(folded, context=context)
            self._unresolved_tables += 1
            return None

    def _warn_cross_service_ambiguous(
        self, name: StructuredIdentifier, fqns: list[str]
    ) -> None:
        """Warn (throttled) that a parsed name matched exactly in
        more than one named service, so none was bound. The first
        hundred distinct names are logged with their competing FQNs,
        in config order; beyond that only the count speaks."""
        key = name.display()
        if key in self._warned_cross_ambiguous:
            return
        if len(self._warned_cross_ambiguous) < MAX_WARNED_UNRESOLVED_PROCEDURES:
            self._warned_cross_ambiguous.add(key)
            logger.warning(
                "Ambiguous cross-service table %r: %d exact matches (%s); skipping",
                key,
                len(fqns),
                ", ".join(fqns),
            )
        elif not self._cross_ambiguous_throttle_warned:
            self._cross_ambiguous_throttle_warned = True
            logger.warning(
                "Further ambiguous cross-service table names will be counted, "
                "not logged (%d skipped so far)",
                self._counts["cross_service_ambiguous"],
            )

    def table_exists(self, fqn: str) -> bool:
        """Whether a table FQN exists in the catalog (404 = absent)."""
        with self._lock:
            return self._table_lookup(fqn) is not None

    def table_columns(self, fqn: str) -> tuple[str, ...] | None:
        """The catalog column names for a table FQN, or ``None`` when
        the catalog says nothing about its columns (unknown table, or
        an entity with no column list). ``None`` means "unknown", not
        "no columns" — callers fall back to parsed names rather than
        dropping column lineage on an uninformative entity."""
        with self._lock:
            cached = self._columns.get(fqn)
            if cached is not _MISSING:
                return cached
            entity = self._table_lookup(fqn)
            columns = None
            if entity is not None:
                raw = entity.get("columns")
                if isinstance(raw, list) and raw:
                    names = [
                        str(column.get("name"))
                        for column in raw
                        if isinstance(column, dict) and column.get("name")
                    ]
                    columns = tuple(names) if names else None
            self._columns.set(fqn, columns)
            return columns

    def resolve_column(self, table_fqn: str, column_name: str) -> str | None:
        """The column FQN for a parsed column, or ``None`` when the
        catalog's column list contradicts it.

        A catalog match (case-insensitive, unique) yields the
        catalog's spelling; an unknown column list yields the parsed
        spelling; a known list with no match, or an ambiguous match,
        yields ``None`` — the mapping is dropped, never guessed."""
        with self._lock:
            columns = self.table_columns(table_fqn)
            if columns is None:
                return f"{table_fqn}.{column_name}"
            matches = [name for name in columns if name.lower() == column_name.lower()]
            if len(matches) == 1:
                return f"{table_fqn}.{matches[0]}"
            if len(matches) > 1:
                # Column-chain uniqueness failure: the same §h
                # ambiguity key as the table/procedure chains.
                self._counts["ambiguous"] += 1
                logger.warning(
                    "Ambiguous column %r on table %s: %d case-insensitive matches; "
                    "dropping the column mapping",
                    column_name,
                    table_fqn,
                    len(matches),
                )
            return None

    def resolve_procedure(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
    ) -> dict[str, Any] | None:
        """The catalog stored-procedure entity for a parsed CALL name,
        or ``None``. Exact-FQN candidate first, then a
        scope-constrained unique full-FQN case-insensitive match —
        the table chain's shape, applied to procedures, with the
        qualifier scope preserved. Unresolvable names warn
        (throttled) and count, never invent an entity."""
        with self._lock:
            folded = fold_identifier(name, self._engine_key)
            if len(folded) > 3:
                self._counts["unsupported_qualifier"] += 1
                self._warn_unresolved_procedure(folded, context=context)
                return None
            candidate = build_candidate(
                self._service_name,
                folded,
                context,
                default_database=self._default_database,
                default_schema=self._tables.effective_default_schema,
            )
            if candidate.fqn is None:
                self._counts[missing_count_key(candidate.sources)] += 1
                self._warn_unresolved_procedure(
                    folded, context=context, candidate_sources=candidate.sources
                )
                return None
            entity = self._procedure_lookup(candidate.fqn)
            if entity is not None:
                self._count_default_bound(candidate.sources)
                return entity
            if fallback_eligible(folded, self._engine_key):
                entity, ambiguous = self._resolve_procedure_case_insensitive(
                    candidate.fqn, candidate.database or "", candidate.schema or ""
                )
                if entity is not None:
                    self._count_default_bound(candidate.sources)
                    return entity
                if ambiguous:
                    self._counts["ambiguous"] += 1
                    self._warn_unresolved_procedure(
                        folded, context=context, candidate_sources=candidate.sources
                    )
                    return None
            self._counts["unresolved_404"] += 1
            self._warn_unresolved_procedure(
                folded, context=context, candidate_sources=candidate.sources
            )
            return None

    def resolve_udf(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
    ) -> dict[str, Any] | None:
        """The catalog entity for a function name appearing in a
        column path, or ``None``. UDFs and functions live in the
        stored-procedure catalog, so this is procedure binding under
        its UDF name; misses count separately so a run can report
        how many function call sites had no catalog body. Folding
        happens once, inside :meth:`resolve_procedure`."""
        with self._lock:
            entity = self.resolve_procedure(name, context=context)
            if entity is None:
                self._unresolved_udfs += 1
            return entity

    def _count_default_bound(
        self, sources: tuple[CandidateSource, CandidateSource]
    ) -> None:
        """Count a successful binding's default-supplied segments,
        per segment: qualifier and row segments are not counted."""
        if sources[0] is CandidateSource.DEFAULT:
            self._counts["default_bound_database"] += 1
        if sources[1] is CandidateSource.DEFAULT:
            self._counts["default_bound_schema"] += 1

    @staticmethod
    def procedure_code(entity: dict[str, Any]) -> str | None:
        """The procedure body's code text, or ``None`` when the entity
        carries none. The code block is ``storedProcedureCode.code``
        per the stored-procedure schema."""
        code_block = entity.get("storedProcedureCode")
        if not isinstance(code_block, dict):
            return None
        code = code_block.get("code")
        if isinstance(code, str) and code.strip():
            return code
        return None

    def _table_lookup(self, fqn: str) -> dict[str, Any] | None:
        """The table entity for an FQN, or ``None`` on 404. Other
        REST errors propagate: absence is data, failure is failure.
        Cached per run, misses included. A read failure is counted
        before it propagates — the count is a summary supplement,
        never a reason to swallow it."""
        cached = self._table_entities.get(fqn)
        if cached is not _MISSING:
            return cached
        try:
            result = self._client.get_table_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                result = None
            else:
                self._counts["read_failure"] += 1
                raise
        self._table_entities.set(fqn, result)
        return result

    def _procedure_lookup(self, fqn: str) -> dict[str, Any] | None:
        cached = self._procedures.get(fqn)
        if cached is not _MISSING:
            return cached
        try:
            result = self._client.get_stored_procedure_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                result = None
            else:
                self._counts["read_failure"] += 1
                raise
        self._procedures.set(fqn, result)
        return result

    def _resolve_procedure_case_insensitive(
        self, candidate_fqn: str, database: str, schema: str
    ) -> tuple[dict[str, Any] | None, bool]:
        """The unique full-FQN case-insensitive match within the
        candidate's own schema, or ``(None, ambiguous)``. The listing
        is scoped to the candidate's schema and the comparison spans
        the whole FQN, so a qualifier the exact step missed cannot
        silently change scope — the table fallback's shape, applied
        to procedures."""
        schema_fqn = f"{self._service_name}.{database}.{schema}"
        target = candidate_fqn.lower()
        matches = [
            item
            for item in self._list_schema_procedures(schema_fqn)
            if str(item.get("fullyQualifiedName", "")).lower() == target
        ]
        if len(matches) == 1:
            return matches[0], False
        if len(matches) > 1:
            logger.warning(
                "Ambiguous procedure name %r in schema %s: %d case-insensitive "
                "matches; skipping",
                candidate_fqn,
                schema_fqn,
                len(matches),
            )
            return None, True
        return None, False

    def _list_schema_procedures(self, schema_fqn: str) -> tuple[dict[str, Any], ...]:
        cached = self._procedure_listings.get(schema_fqn)
        if cached is not _MISSING:
            return cached
        result = tuple(
            self._client.iter_collection(
                STORED_PROCEDURES_PATH,
                limit=100,
                extra_params={"databaseSchema": schema_fqn},
            )
        )
        self._procedure_listings.set(schema_fqn, result)
        return result

    def _warn_unresolved_procedure(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext | None = None,
        candidate_sources: tuple[CandidateSource, CandidateSource] | None = None,
    ) -> None:
        """Count and (throttled) warn an unresolvable procedure name.
        The warning carries both provenance levels when the caller
        supplies them: each candidate segment's final source, and
        the row context's input-field sources (design §5.8)."""
        self._unresolved_procedures += 1
        if name in self._warned_procedures:
            return
        if len(self._warned_procedures) < MAX_WARNED_UNRESOLVED_PROCEDURES:
            self._warned_procedures.add(name)
            suffix = ""
            if context is not None:
                if candidate_sources is None:
                    detail = "no candidate"
                else:
                    detail = (
                        f"candidate database from {candidate_sources[0].value}, "
                        f"schema from {candidate_sources[1].value}"
                    )
                suffix = (
                    f" ({detail}; input sources "
                    f"database={context.database_source.value}, "
                    f"schema={context.schema_source.value})"
                )
            logger.warning(
                "No catalog procedure matches %r under service %s; skipping%s",
                name.display(),
                self._service_name,
                suffix,
            )
        elif not self._procedure_throttle_warned:
            self._procedure_throttle_warned = True
            logger.warning(
                "Further unresolvable procedure names will be counted, not logged "
                "(%d skipped so far)",
                self._unresolved_procedures,
            )
