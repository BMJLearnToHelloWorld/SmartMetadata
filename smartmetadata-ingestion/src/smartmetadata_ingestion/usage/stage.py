# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage stage (design §3.5, clean-room to the spec).

Aggregates ``ParsedData`` batches into staging files under
``stageFileLocation`` for the bulk sink:

- usage files ``{serviceName}_{date}`` — one double-encoded
  ``TableUsageCount`` JSON line per (table, day), with the table's
  ``sqlQueries`` attached from the per-table query map;
- cost files ``{serviceName}_{date}_query`` — one plain JSON line per
  (query hash, day) with the aggregated cost/count/duration.

The stage holds per-batch maps in memory and flushes to the files per
batch; it keeps no cross-batch state beyond the files (the resolvers'
bounded caches are read-through and never affect output). At
construction it cleans its own service's stale staging files
(:func:`init_staging_dir`), so a killed run's files are never
re-published by the next run.

Binding resolution is REST-based (D-C8 item 5 — see
:class:`RestTableBindingResolver` for the fallback chain, a mandatory
parent-review item). Parsed table names that cannot be bound to a
catalog table are skipped with a warning, never invented.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Protocol

from ..client.rest import TABLES_PATH, RestClient
from ..errors import RestError, WorkflowError
from ..lineage.folding import fallback_eligible, fold_identifier
from ..lineage.identifiers import StructuredIdentifier
from ..lineage.parser import TableColumn, TableColumnJoin
from ..records import BindingContext
from .processor import ParsedData

logger = logging.getLogger(__name__)

# Cost staging files carry the ``_query`` suffix; usage files have no
# suffix. The sink distinguishes the two kinds by this suffix alone.
COST_FILE_SUFFIX = "_query"

# Resolver caches are bounded (AGENTS.md: no unbounded caches). A run
# resolves each distinct table/user at most once; the caps cover a
# large catalog without growing with the query-log size.
MAX_CACHED_BINDINGS = 512
MAX_CACHED_SCHEMA_LISTINGS = 128
MAX_CACHED_USERS = 512

# Unresolvable-name warnings are throttled: the first distinct names
# are warned about individually, the rest only counted, so a log full
# of unresolvable temp tables cannot flood the run log.
MAX_WARNED_UNRESOLVED_NAMES = 100

_MISSING: Any = object()


class _BoundedCache:
    """A bounded LRU cache for resolver lookups (AGENTS.md: no
    unbounded caches). Misses cache too — a 404 is a result, and
    re-asking the server for every occurrence of an unresolvable name
    would multiply REST calls by the log size."""

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


class CandidateSource(str, Enum):
    """Where one segment of a binding candidate came from: the final
    candidate level of the D-L2c two-level provenance (design §5.8).
    Only the resolver sees qualifier, row context, and defaults
    together, so only it can attribute each segment; the attribution
    feeds warnings and the default-bound counts, and is never stored
    on the record."""

    QUALIFIER = "qualifier"
    ROW = "row"
    DEFAULT = "default"
    MISSING = "missing"


# Design §5.8 count keys with scalar counters. The fidelity skip is
# per winning parser branch, so it nests a dict under its key instead
# of a scalar (contract §h); see new_binding_counts for the shape.
BINDING_COUNT_KEYS: tuple[str, ...] = (
    "missing_database",
    "missing_schema",
    "missing_both",
    "unresolved_404",
    "ambiguous",
    "unsupported_qualifier",
    "read_failure",
    "default_bound_database",
    "default_bound_schema",
    "builtin_function_filtered",
    "cross_service_ambiguous",
    "cross_service_bound",
)


def new_binding_counts() -> dict[str, Any]:
    """A zeroed design §5.8 count snapshot, in the shape resolvers
    expose: one counter per key, with ``fidelity_unproven_skip``
    holding per-branch counts."""
    counts: dict[str, Any] = {key: 0 for key in BINDING_COUNT_KEYS}
    counts["fidelity_unproven_skip"] = {}
    return counts


@dataclass(frozen=True)
class _Candidate:
    """One exact-FQN candidate plus the provenance of its segments.

    ``fqn`` is ``None`` when no candidate can be constructed (a
    needed context segment is missing, or the name is over-long);
    ``sources`` still attributes each segment, with ``MISSING``
    marking the absent ones, so the skip can be classified without
    re-deriving the construction. ``database``/``schema`` are the
    candidate's own segments, for the scope-constrained fallback
    listing — carried explicitly because a built FQN string must
    never be split back apart."""

    fqn: str | None
    sources: tuple[CandidateSource, CandidateSource]
    database: str | None
    schema: str | None


def _effective_segment(
    row_value: str | None, default_value: str | None
) -> tuple[str | None, CandidateSource]:
    """A context segment from the row, else the connection default.
    Row context wins over defaults; an empty value counts as absent,
    matching the previous ``or`` chaining."""
    if row_value:
        return row_value, CandidateSource.ROW
    if default_value:
        return default_value, CandidateSource.DEFAULT
    return None, CandidateSource.MISSING


def build_candidate(
    service: str,
    name: StructuredIdentifier,
    context: BindingContext,
    *,
    default_database: str | None,
    default_schema: str | None,
) -> _Candidate:
    """The exact-FQN candidate for one structured name, shared by
    all three binding chains (design §5.5: one candidate
    construction). ``name`` must already be folded: folding is the
    caller's entry step, and this function is folding-agnostic.

    SQL qualifier segments are never overwritten by context or
    defaults: a 3-segment name carries its own database/schema, a
    2-segment name takes only the database from context, and a
    1-segment name takes both. An over-long name has no mapping —
    the caller skips it, never truncates it (Q2)."""
    texts = name.texts
    if len(texts) > 3:
        return _Candidate(None, (CandidateSource.MISSING, CandidateSource.MISSING), None, None)
    if len(texts) == 3:
        return _Candidate(
            f"{service}.{texts[0]}.{texts[1]}.{texts[2]}",
            (CandidateSource.QUALIFIER, CandidateSource.QUALIFIER),
            texts[0],
            texts[1],
        )
    database, database_source = _effective_segment(
        context.database_name, default_database
    )
    if len(texts) == 2:
        if database is None:
            return _Candidate(
                None, (CandidateSource.MISSING, CandidateSource.QUALIFIER), None, texts[0]
            )
        return _Candidate(
            f"{service}.{database}.{texts[0]}.{texts[1]}",
            (database_source, CandidateSource.QUALIFIER),
            database,
            texts[0],
        )
    schema, schema_source = _effective_segment(
        context.database_schema, default_schema
    )
    if database is None or schema is None:
        return _Candidate(None, (database_source, schema_source), database, schema)
    return _Candidate(
        f"{service}.{database}.{schema}.{texts[0]}",
        (database_source, schema_source),
        database,
        schema,
    )


def missing_count_key(sources: tuple[CandidateSource, CandidateSource]) -> str:
    """The §h missing-context count key for a candidate that could
    not be constructed: the two single-segment keys and the both
    key are mutually exclusive — a double miss counts only as
    ``missing_both``. Callers guarantee at least one segment is
    ``MISSING`` (no candidate exists)."""
    database_missing = sources[0] is CandidateSource.MISSING
    schema_missing = sources[1] is CandidateSource.MISSING
    if database_missing and schema_missing:
        return "missing_both"
    if database_missing:
        return "missing_database"
    return "missing_schema"


def stored_query_hash(stored_text: str) -> str:
    """The full MD5 hex of the stored query text, matching the
    server-side query checksum (``EntityUtil.hash`` over the stored
    text): the join key between staged cost records, staged queries,
    and created Query entities."""
    return hashlib.md5(stored_text.encode("utf-8")).hexdigest()


def stored_query_text(parsed: ParsedData) -> str:
    """The text that is stored for a query: masked, unless the record
    opted out of usage masking."""
    return parsed.sql if parsed.exclude_usage else parsed.masked_sql


def calendar_date(date_ms: str) -> str:
    """A millisecond timestamp string as a ``YYYY-MM-DD`` UTC date,
    for staging-file names and server date fields."""
    return datetime.fromtimestamp(int(date_ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


@dataclass
class TableUsageCount:
    """One staged usage line, shaped per the ``tableUsageCount`` spec
    schema. ``table`` is the resolved catalog FQN, ``date`` the day
    as a millisecond timestamp string, ``joins`` the column joins
    observed for the table (one entry per occurrence, so the sink can
    count them), ``sql_queries`` the distinct queries that touched
    the table (``CreateQueryRequest`` dicts)."""

    table: str
    date: str
    database_name: str | None
    database_schema: str | None
    count: int
    joins: list[TableColumnJoin]
    sql_queries: list[dict[str, Any]]
    service_name: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "table": self.table,
            "date": self.date,
            "databaseName": self.database_name,
            "databaseSchema": self.database_schema,
            "count": self.count,
            "joins": [join.to_dict() for join in self.joins],
            "sqlQueries": self.sql_queries,
            "serviceName": self.service_name,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TableUsageCount:
        return cls(
            table=data["table"],
            date=data["date"],
            database_name=data.get("databaseName"),
            database_schema=data.get("databaseSchema"),
            count=data["count"],
            joins=[TableColumnJoin.from_dict(entry) for entry in data.get("joins") or []],
            sql_queries=list(data.get("sqlQueries") or []),
            service_name=data["serviceName"],
        )


@dataclass
class QueryCostAggregate:
    """Cost/count/duration aggregated per (query hash, day). ``cost``
    is the SUM of execution costs — an execution with no cost value
    still counts as an execution and adds zero. ``count`` is the
    number of executions, and ``totalDuration`` the summed duration
    over all of them. This follows the reference stage code, which
    contradicts its own schema text ("avg"): the code is the
    behavior, so the code wins."""

    query_hash: str
    date: str
    query: str
    dialect: str
    cost_sum: float = 0.0
    count: int = 0
    total_duration: float = 0.0

    def add(self, cost: float | None, duration: float | None) -> None:
        self.cost_sum += cost or 0.0
        self.count += 1
        self.total_duration += duration or 0.0

    def to_line_dict(self) -> dict[str, Any]:
        return {
            "queryHash": self.query_hash,
            "date": self.date,
            "cost": self.cost_sum,
            "count": self.count,
            "query": self.query,
            "dialect": self.dialect,
            "totalDuration": self.total_duration,
        }


def _sources_suffix(
    sources: tuple[CandidateSource, CandidateSource] | None,
    context: BindingContext,
) -> str:
    """The two provenance levels for an unresolved-name warning:
    each candidate segment's final source (or the absence of a
    candidate), plus the row context's input-field sources."""
    if sources is None:
        detail = "no candidate"
    else:
        detail = (
            f"candidate database from {sources[0].value}, "
            f"schema from {sources[1].value}"
        )
    return (
        f" ({detail}; input sources database={context.database_source.value}, "
        f"schema={context.schema_source.value})"
    )


class TableBindingResolver(Protocol):
    """Parsed table name → catalog table FQN, or ``None`` when the
    name cannot be bound. Implementations never invent an entity.
    The name is structured (segment boundaries and quoting intact)
    and the row context arrives as one frozen
    :class:`BindingContext`, never as loose values."""

    def resolve(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
    ) -> str | None: ...


class RestTableBindingResolver:
    """REST-based binding resolution (D-C8 item 5).

    Fallback chain, in order (mandatory parent-review item):

    1. Exact-FQN candidate. The folded structured name's qualifier
       segments plus the row context (falling back to the
       connection's default database/schema) form one candidate FQN
       ``service.database.schema.table``; it is looked up with GET
       ``/v1/tables/name/{fqn}``. A 404 moves to the fallback; any
       other REST error propagates — server trouble must not
       degrade into silent skips. SQL qualifier segments are never
       overwritten by context or defaults.
    2. Scope-constrained case-insensitive match. When the exact
       candidate fails, the candidate FQN's OWN schema is listed
       once (``GET /v1/tables?databaseSchema=...``) and matched on
       the FULL FQN case-insensitively — the qualifier scope is
       preserved, so a name qualified into another database cannot
       bind into the default context. The match must be unique;
       ambiguity skips with a warning rather than guessing. Quoted
       segments on engines with established case-sensitive quoting
       never enter this step (design §5.5b).
    3. Unresolvable. ``None``: the stage skips the table with a
       throttled warning. No search-API fuzzy step exists in this
       batch — ranked search results would bind queries to the wrong
       table, which is worse than skipping; extending the chain is a
       deliberate follow-up, not a silent fallback.

    Over-long names (more than three segments) have no mapping and
    are skipped, never truncated (Q2). Binding counts (design §5.8)
    accumulate in :attr:`binding_counts`; the warning-fold count
    stays :attr:`skipped_count`.
    """

    def __init__(
        self,
        client: RestClient,
        service_name: str,
        *,
        default_database: str | None = None,
        default_schema: str | None = None,
        engine_key: str | None = None,
    ) -> None:
        self._client = client
        self._service_name = service_name
        self._default_database = default_database
        self._default_schema = default_schema
        self._engine_key = engine_key
        self._bindings = _BoundedCache(MAX_CACHED_BINDINGS)
        self._schema_listings = _BoundedCache(MAX_CACHED_SCHEMA_LISTINGS)
        self._warned: set[StructuredIdentifier] = set()
        self._throttle_warned = False
        self._skipped_count = 0
        self._counts: dict[str, int] = {key: 0 for key in BINDING_COUNT_KEYS}
        self._fidelity_skips: dict[str, int] = {}
        # The latest failed attempt's skip classification, held for
        # the loud warning that earns the count: a quiet probe must
        # not count a skip the cross-service chain may still rescue,
        # and only the probe saw whether the fallback was ambiguous.
        # Cleared on every resolve entry and consumed by the matching
        # loud warn_unresolved; a stale entry never counts twice.
        self._pending_skip: (
            tuple[
                StructuredIdentifier,
                BindingContext,
                str,
                tuple[CandidateSource, CandidateSource] | None,
            ]
            | None
        ) = None

    @property
    def effective_default_schema(self) -> str | None:
        """The default schema candidate construction may actually use.

        D-L2c E (full delete): always ``None``. The connection's
        ``databaseSchema`` is a scan range, not a binding default —
        using it as one mis-binds a bare name into the scan-range
        schema when the session actually used another schema. The
        raw value is still accepted and stored by the constructor
        (workflows and ``resolve_connection_defaults`` are
        untouched), but no candidate is ever built from it: a bare
        name with no row schema is a miss (``missing_schema`` /
        ``missing_both``), never a default-bound hit. The database
        default is unaffected — only the schema half is deleted."""
        return None

    def discard_pending_skip(self) -> None:
        """Drop the pending quiet-probe skip classification without
        counting or warning: the caller already counted the outcome
        under its own key (D-L2c D: cross-service ambiguity), and
        spending the pending entry would count one skip twice."""
        self._pending_skip = None

    @property
    def skipped_count(self) -> int:
        """Parsed names skipped as unresolvable so far this run — the
        binding-skip count the workflow folds into processor-step
        warnings (C-11/B-4). One per skipped binding attempt,
        including repeats of a name whose log warning was throttled."""
        return self._skipped_count

    @property
    def binding_counts(self) -> dict[str, Any]:
        """Design §5.8 per-key binding counts for this resolver: a
        fresh snapshot, so callers cannot mutate the counters. The
        lineage resolver merges this snapshot with its own counters;
        the workflows log it in their run summaries."""
        counts = new_binding_counts()
        counts.update(self._counts)
        counts["fidelity_unproven_skip"] = dict(self._fidelity_skips)
        return counts

    def note_unsupported_qualifier(self, count: int = 1) -> None:
        """Count names whose qualifier could not be proven faithful
        (extraction-level, reported by the processors)."""
        self._counts["unsupported_qualifier"] += count

    def note_fidelity_skip(self, branch: str, count: int = 1) -> None:
        """Count queries/paths skipped because name fidelity was
        unproven, attributed to the winning parser branch."""
        self._fidelity_skips[branch] = self._fidelity_skips.get(branch, 0) + count

    def resolve(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
        quiet: bool = False,
    ) -> str | None:
        # Fold once, at the entry: every later step — candidate
        # construction, fallback — uses only the folded identifier,
        # so an unquoted name resolves under its engine's folding
        # before any exact comparison happens (design §5.5b).
        folded = fold_identifier(name, self._engine_key)
        self._pending_skip = None
        if len(folded) > 3:
            self._pending_skip = (folded, context, "unsupported_qualifier", None)
            self.warn_unresolved(folded, context=context, quiet=quiet)
            return None
        candidate = build_candidate(
            self._service_name,
            folded,
            context,
            default_database=self._default_database,
            default_schema=self.effective_default_schema,
        )
        if candidate.fqn is None:
            self._pending_skip = (
                folded,
                context,
                missing_count_key(candidate.sources),
                candidate.sources,
            )
            self.warn_unresolved(folded, context=context, candidate_sources=None, quiet=quiet)
            return None
        if self._lookup(candidate.fqn) is not None:
            self._count_default_bound(candidate.sources)
            return candidate.fqn
        if fallback_eligible(folded, self._engine_key):
            resolved, ambiguous = self._resolve_case_insensitive(
                candidate.fqn, candidate.database or "", candidate.schema or ""
            )
            if resolved is not None:
                self._count_default_bound(candidate.sources)
                return resolved
            if ambiguous:
                self._pending_skip = (folded, context, "ambiguous", candidate.sources)
                self.warn_unresolved(
                    folded, context=context, candidate_sources=candidate.sources, quiet=quiet
                )
                return None
        self._pending_skip = (folded, context, "unresolved_404", candidate.sources)
        self.warn_unresolved(
            folded, context=context, candidate_sources=candidate.sources, quiet=quiet
        )
        return None

    def _candidate_fqns(
        self, name: StructuredIdentifier, context: BindingContext
    ) -> list[str]:
        """Candidate FQNs for a (folded) structured name: at most
        one — the shared construction in :func:`build_candidate`.
        Three-part names carry their own database/schema; two-part
        names take the database from context; one-part names need
        both from context; over-long names map to nothing."""
        candidate = build_candidate(
            self._service_name,
            name,
            context,
            default_database=self._default_database,
            default_schema=self.effective_default_schema,
        )
        return [candidate.fqn] if candidate.fqn is not None else []

    def _count_default_bound(
        self, sources: tuple[CandidateSource, CandidateSource]
    ) -> None:
        """Count a successful binding's default-supplied segments,
        per segment: qualifier and row segments are not counted."""
        if sources[0] is CandidateSource.DEFAULT:
            self._counts["default_bound_database"] += 1
        if sources[1] is CandidateSource.DEFAULT:
            self._counts["default_bound_schema"] += 1

    def _lookup(self, fqn: str) -> dict[str, Any] | None:
        """The table entity for an FQN, or ``None`` on 404. Other
        REST errors propagate: absence is data, failure is failure.
        A read failure is counted before it propagates — the count
        is a summary supplement, never a reason to swallow it."""
        cached = self._bindings.get(fqn)
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
        self._bindings.set(fqn, result)
        return result

    def _resolve_case_insensitive(
        self, candidate_fqn: str, database: str, schema: str
    ) -> tuple[str | None, bool]:
        """The unique full-FQN case-insensitive match within the
        candidate's own schema, or ``(None, ambiguous)``. The listing
        is scoped to the candidate's schema — never the row context
        alone — and the comparison spans the whole FQN, so a
        qualifier the exact step missed cannot silently change
        scope. ``ambiguous`` reports a multi-match so the caller can
        count the skip at the decision point."""
        schema_fqn = f"{self._service_name}.{database}.{schema}"
        target = candidate_fqn.lower()
        matches = [
            item
            for item in self._list_schema_tables(schema_fqn)
            if str(item.get("fullyQualifiedName", "")).lower() == target
        ]
        if len(matches) == 1:
            fqn = matches[0].get("fullyQualifiedName")
            if isinstance(fqn, str) and fqn:
                return fqn, False
            return None, False
        if len(matches) > 1:
            logger.warning(
                "Ambiguous table name %r in schema %s: %d case-insensitive matches; skipping",
                candidate_fqn,
                schema_fqn,
                len(matches),
            )
            return None, True
        return None, False

    def _list_schema_tables(self, schema_fqn: str) -> tuple[dict[str, Any], ...]:
        cached = self._schema_listings.get(schema_fqn)
        if cached is not _MISSING:
            return cached
        result = tuple(
            self._client.iter_collection(
                TABLES_PATH, limit=100, extra_params={"databaseSchema": schema_fqn}
            )
        )
        self._schema_listings.set(schema_fqn, result)
        return result

    def warn_unresolved(
        self,
        name: StructuredIdentifier,
        *,
        context: BindingContext,
        candidate_sources: tuple[CandidateSource, CandidateSource] | None = None,
        quiet: bool = False,
    ) -> None:
        """Record an unresolvable name, warning unless ``quiet``.

        Quiet probes (a cross-service resolver trying the own service
        first) neither warn nor count: the name may still resolve
        elsewhere, and a probe must not spend the name's one warning
        or inflate the skipped count. Callers that exhaust every
        resolver warn loudly through this same method, which then
        consumes the probe's pending skip classification so the
        attempt counts exactly once, under the outcome the probe
        actually saw. A direct call with no pending probe classifies
        from the candidate construction itself.

        The warning carries both provenance levels (design §5.8):
        each candidate segment's final source, and the row context's
        input-field sources."""
        if quiet:
            return
        folded = fold_identifier(name, self._engine_key)
        skip_key, sources = self._consume_pending(folded, context, candidate_sources)
        self._counts[skip_key] += 1
        self._skipped_count += 1
        if folded in self._warned:
            return
        if len(self._warned) < MAX_WARNED_UNRESOLVED_NAMES:
            self._warned.add(folded)
            logger.warning(
                "No catalog table matches parsed name %r under service %s; "
                "skipping its usage%s",
                folded.display(),
                self._service_name,
                _sources_suffix(sources, context),
            )
        elif not self._throttle_warned:
            self._throttle_warned = True
            logger.warning(
                "Further unresolvable table names will be counted, not logged "
                "(%d skipped so far)",
                self._skipped_count,
            )

    def _consume_pending(
        self,
        folded: StructuredIdentifier,
        context: BindingContext,
        candidate_sources: tuple[CandidateSource, CandidateSource] | None,
    ) -> tuple[str, tuple[CandidateSource, CandidateSource] | None]:
        """The skip classification for a loud warning: the pending
        probe outcome when it matches this name and context, else a
        fresh classification from the candidate construction. The
        pending entry is always cleared — a stale probe outcome must
        never be spent on a later, unrelated name."""
        pending = self._pending_skip
        self._pending_skip = None
        if (
            pending is not None
            and pending[0] == folded
            and pending[1] == context
        ):
            return pending[2], pending[3]
        candidate = build_candidate(
            self._service_name,
            folded,
            context,
            default_database=self._default_database,
            default_schema=self.effective_default_schema,
        )
        if candidate.fqn is None:
            if len(folded) > 3:
                return "unsupported_qualifier", None
            return missing_count_key(candidate.sources), candidate.sources
        if candidate_sources is not None:
            return "unresolved_404", candidate_sources
        return "unresolved_404", candidate.sources


class UserResolver:
    """Query user names → ``users`` FQNs and ``usedBy`` raw names.

    A name that exists in the catalog (GET ``/v1/users/name/{name}``)
    becomes BOTH a ``users`` FQN and a ``usedBy`` raw name: the
    reference sets both, and the two consumers differ — query
    ownership reads ``users``, lifecycle derivation reads ``usedBy``.
    A 404 keeps only the raw name in ``usedBy``. Other REST errors
    propagate. Results are cached per run."""

    def __init__(self, client: RestClient) -> None:
        self._client = client
        self._users = _BoundedCache(MAX_CACHED_USERS)

    def resolve(self, user_name: str) -> tuple[list[str], list[str]]:
        fqn = self._lookup(user_name)
        if fqn is not None:
            return [fqn], [user_name]
        return [], [user_name]

    def _lookup(self, user_name: str) -> str | None:
        cached = self._users.get(user_name)
        if cached is not _MISSING:
            return cached
        try:
            user = self._client.get_user_by_name(user_name)
        except RestError as exc:
            if exc.status_code == 404:
                self._users.set(user_name, None)
                return None
            raise
        fqn = user.get("fullyQualifiedName")
        result = fqn if isinstance(fqn, str) and fqn else None
        self._users.set(user_name, result)
        return result


@dataclass
class _UsageAccumulator:
    table: str
    date: str
    database_name: str | None
    database_schema: str | None
    service_name: str
    count: int = 0
    joins: list[TableColumnJoin] = field(default_factory=list)
    queries: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_record(self) -> TableUsageCount:
        return TableUsageCount(
            table=self.table,
            date=self.date,
            database_name=self.database_name,
            database_schema=self.database_schema,
            count=self.count,
            joins=self.joins,
            sql_queries=list(self.queries.values()),
            service_name=self.service_name,
        )


class UsageStage:
    """Aggregates parsed batches into staging files (design §3.5)."""

    def __init__(
        self,
        *,
        stage_dir: str | Path,
        service_name: str,
        binding_resolver: TableBindingResolver,
        user_resolver: UserResolver | None = None,
    ) -> None:
        self._stage_dir = init_staging_dir(stage_dir, service_name)
        self._service_name = service_name
        self._binding_resolver = binding_resolver
        self._user_resolver = user_resolver
        # D-L2c C row-cardinality dedupe: one execution (query id)
        # must count once per table and once for cost, however many
        # context rows it fanned out to. Instance-level, whole-run
        # state — one execution's rows can straddle batch boundaries.
        # Id-less records bypass dedupe, as they always have.
        self._seen_query_cost_ids: set[str] = set()
        self._seen_table_usage: set[tuple[str, str]] = set()

    @property
    def binding_skips(self) -> int:
        """Binding-resolution skips observed by the stage's resolver —
        the count the workflow folds into processor-step warnings
        (C-11/B-4). A resolver without a skip counter (a test double
        behind the protocol) contributes zero."""
        return int(getattr(self._binding_resolver, "skipped_count", 0) or 0)

    @property
    def binding_counts(self) -> dict[str, Any]:
        """Design §5.8 per-key binding counts from the stage's
        resolver, for the workflow's run summary. A resolver without
        a count snapshot (a test double behind the protocol)
        contributes zeros."""
        counts = getattr(self._binding_resolver, "binding_counts", None)
        if counts is None:
            return new_binding_counts()
        return dict(counts)

    def handle_batch(self, parsed_batch: list[ParsedData]) -> None:
        """Aggregate one batch and append it to the staging files."""
        usage: dict[tuple[str, str], _UsageAccumulator] = {}
        costs: dict[tuple[str, str], QueryCostAggregate] = {}
        for parsed in parsed_batch:
            self._forward_parse_counts(parsed)
            self._handle_table_usage(parsed, usage)
            self._handle_query_cost(parsed, costs)
        self._dump(usage, costs)

    def _forward_parse_counts(self, parsed: ParsedData) -> None:
        """Forward one record's extraction-level counts into the
        resolver's counters: names whose fidelity the parser could
        not prove, and queries whose whole extraction failed. The
        parse step has no resolver of its own, so the counts ride
        the parsed record and land here, once per record, whether
        or not any table bound."""
        resolver = self._binding_resolver
        if parsed.unsupported_name_count:
            note = getattr(resolver, "note_unsupported_qualifier", None)
            if note is not None:
                note(parsed.unsupported_name_count)
        if parsed.fidelity_skip_branch is not None:
            note = getattr(resolver, "note_fidelity_skip", None)
            if note is not None:
                note(parsed.fidelity_skip_branch)

    def _handle_table_usage(
        self,
        parsed: ParsedData,
        usage: dict[tuple[str, str], _UsageAccumulator],
    ) -> None:
        resolved = self._resolve_tables(parsed)
        if not resolved:
            return
        text = stored_query_text(parsed)
        query_hash = stored_query_hash(text)
        for parsed_name, fqn in resolved.items():
            if parsed.query_id is not None:
                usage_key = (parsed.query_id, fqn)
                if usage_key in self._seen_table_usage:
                    continue
                self._seen_table_usage.add(usage_key)
            key = (fqn, parsed.date)
            accumulator = usage.get(key)
            if accumulator is None:
                accumulator = _UsageAccumulator(
                    table=fqn,
                    date=parsed.date,
                    database_name=parsed.database_name,
                    database_schema=parsed.database_schema,
                    service_name=parsed.service_name,
                )
                usage[key] = accumulator
            accumulator.count += 1
            accumulator.joins.extend(self._resolve_joins(parsed, parsed_name, resolved))
            if query_hash not in accumulator.queries:
                accumulator.queries[query_hash] = self._build_query_request(parsed, text)

    def _resolve_tables(self, parsed: ParsedData) -> dict[StructuredIdentifier, str]:
        """Parsed names → catalog FQNs for one record; unresolvable
        names are dropped (the resolver warned already). The row
        context travels as the record's frozen binding context."""
        resolved: dict[StructuredIdentifier, str] = {}
        for name in parsed.tables:
            fqn = self._binding_resolver.resolve(name, context=parsed.binding_context)
            if fqn is not None:
                resolved[name] = fqn
        return resolved

    def _resolve_joins(
        self,
        parsed: ParsedData,
        parsed_name: StructuredIdentifier,
        resolved: dict[StructuredIdentifier, str],
    ) -> list[TableColumnJoin]:
        """The record's joins for one table, with table names
        rewritten to catalog FQNs. Join partners that cannot be
        bound drop out of ``joinedWith``; a join left with no
        partners drops entirely — a join to an unknown table cannot
        be published as a column FQN."""
        rewritten: list[TableColumnJoin] = []
        for join in parsed.joins.get(parsed_name, []):
            table_fqn = resolved.get(join.table_column.table)
            if table_fqn is None:
                continue
            partners = [
                TableColumn(table=resolved[partner.table], column=partner.column)
                for partner in join.joined_with
                if partner.table in resolved
            ]
            if not partners:
                continue
            rewritten.append(
                TableColumnJoin(
                    table_column=TableColumn(table=table_fqn, column=join.table_column.column),
                    joined_with=tuple(partners),
                )
            )
        return rewritten

    def _build_query_request(self, parsed: ParsedData, text: str) -> dict[str, Any]:
        """A ``CreateQueryRequest`` dict: the stored text, the
        statement type/duration/dialect, the run date, and the
        resolved user split (``users`` FQNs vs ``usedBy`` raw names).
        The name is deliberately omitted — the server derives it as
        the MD5 of the stored text."""
        request: dict[str, Any] = {
            "query": text,
            "exclude_usage": parsed.exclude_usage,
            "dialect": parsed.dialect,
            "queryDate": int(parsed.date),
            "service": parsed.service_name,
        }
        if parsed.query_type is not None:
            request["query_type"] = parsed.query_type
        if parsed.duration is not None:
            request["duration"] = parsed.duration
        if parsed.user_name and self._user_resolver is not None:
            users, used_by = self._user_resolver.resolve(parsed.user_name)
            if users:
                request["users"] = users
            if used_by:
                request["usedBy"] = used_by
        return request

    def _handle_query_cost(
        self,
        parsed: ParsedData,
        costs: dict[tuple[str, str], QueryCostAggregate],
    ) -> None:
        """Aggregate EVERY execution, cost-bearing or not: the
        reference stage aggregates per parsed record regardless of
        binding or cost presence, so a cost-less execution counts
        with zero cost and its duration still sums. One execution
        still counts once, however many context rows it fanned out
        to (D-L2c C): a repeated query id skips the whole add, so
        ``count`` cannot multiply either."""
        if parsed.query_id is not None:
            if parsed.query_id in self._seen_query_cost_ids:
                return
            self._seen_query_cost_ids.add(parsed.query_id)
        text = stored_query_text(parsed)
        key = (stored_query_hash(text), parsed.date)
        aggregate = costs.get(key)
        if aggregate is None:
            aggregate = QueryCostAggregate(
                query_hash=key[0],
                date=parsed.date,
                query=text,
                dialect=parsed.dialect,
            )
            costs[key] = aggregate
        aggregate.add(parsed.cost, parsed.duration)

    def _dump(
        self,
        usage: dict[tuple[str, str], _UsageAccumulator],
        costs: dict[tuple[str, str], QueryCostAggregate],
    ) -> None:
        self._stage_dir.mkdir(parents=True, exist_ok=True)
        usage_lines: dict[str, list[str]] = {}
        for accumulator in usage.values():
            record = accumulator.to_record()
            # Double-encoded per the §3.5 file contract: the record's
            # JSON dump, itself JSON-encoded as one line.
            line = json.dumps(json.dumps(record.to_dict()))
            usage_lines.setdefault(self._usage_file_name(record.date), []).append(line)
        for file_name, lines in usage_lines.items():
            self._append_lines(file_name, lines)
        cost_lines: dict[str, list[str]] = {}
        for aggregate in costs.values():
            line = json.dumps(aggregate.to_line_dict())
            cost_lines.setdefault(self._cost_file_name(aggregate.date), []).append(line)
        for file_name, lines in cost_lines.items():
            self._append_lines(file_name, lines)

    def _usage_file_name(self, date_ms: str) -> str:
        return f"{self._service_name}_{calendar_date(date_ms)}"

    def _cost_file_name(self, date_ms: str) -> str:
        return f"{self._service_name}_{calendar_date(date_ms)}{COST_FILE_SUFFIX}"

    def _append_lines(self, file_name: str, lines: list[str]) -> None:
        path = self._stage_dir / file_name
        with path.open("a", encoding="utf-8") as handle:
            for line in lines:
                handle.write(line + "\n")


def init_staging_dir(stage_dir: str | Path, service_name: str) -> Path:
    """Prepare the staging directory for one run: create it, and
    delete stale files this service owns from earlier runs.

    A killed run leaves staged files behind; without cleaning, the
    sink re-publishes them on the next run. Only FILES named
    ``{service}_*`` are removed — other services' files and
    subdirectories are left alone. Two concurrent runs of the SAME
    service sharing one location still race on cleaning, the same
    shape the reference accepts; per-run locations avoid it.
    Cleanup failure is fatal: staging into a directory whose stale
    files cannot be removed would silently re-publish them."""
    directory = Path(stage_dir)
    directory.mkdir(parents=True, exist_ok=True)
    prefix = f"{service_name}_"
    for path in directory.iterdir():
        if path.is_file() and path.name.startswith(prefix):
            try:
                path.unlink()
            except OSError as exc:
                raise WorkflowError(
                    f"could not clean stale staging file {path}: {exc}"
                ) from exc
    return directory


def resolve_stage_dir(stage_file_location: str | None) -> Path:
    """The staging directory for a run: the configured location, or a
    fresh temporary directory when none is configured. The directory
    is created lazily by the stage's first dump; the sink deletes it
    in ``close``."""
    if stage_file_location:
        return Path(stage_file_location)
    import tempfile

    return Path(tempfile.mkdtemp(prefix="query_log_"))
