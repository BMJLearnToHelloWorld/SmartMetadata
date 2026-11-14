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
from pathlib import Path
from typing import Any, Protocol

from ..client.rest import TABLES_PATH, RestClient
from ..errors import RestError, WorkflowError
from ..lineage.parser import TableColumn, TableColumnJoin
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

# A parsed name has at most database.schema.table parts; longer names
# (catalog-prefixed) resolve on their last three parts.
_MAX_NAME_PARTS = 3


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


class TableBindingResolver(Protocol):
    """Parsed table name → catalog table FQN, or ``None`` when the
    name cannot be bound. Implementations never invent an entity."""

    def resolve(
        self,
        parsed_name: str,
        *,
        database_name: str | None,
        database_schema: str | None,
    ) -> str | None: ...


class RestTableBindingResolver:
    """REST-based binding resolution (D-C8 item 5).

    Fallback chain, in order (mandatory parent-review item):

    1. Exact-FQN candidates. The parsed name's parts plus the row's
       database/schema context (falling back to the connection's
       default database/schema) form candidate FQNs
       ``service.database.schema.table``; each is looked up with GET
       ``/v1/tables/name/{fqn}`` and the first hit wins. A 404 moves
       to the next candidate; any other REST error propagates —
       server trouble must not degrade into silent skips.
    2. Schema-scoped case-insensitive match. When exact candidates
       fail but database + schema context is known, the schema's
       tables are listed once (``GET /v1/tables?databaseSchema=...``)
       and matched on the table name case-insensitively — parsed
       names keep query case, catalog names keep ingestion case, and
       the two differ on engines that fold case. The match must be
       unique; ambiguity skips with a warning rather than guessing.
    3. Unresolvable. ``None``: the stage skips the table with a
       throttled warning. No search-API fuzzy step exists in this
       batch — ranked search results would bind queries to the wrong
       table, which is worse than skipping; extending the chain is a
       deliberate follow-up, not a silent fallback.

    Candidates are tried most-specific first (row context before
    connection defaults), and lookups are cached per run.
    """

    def __init__(
        self,
        client: RestClient,
        service_name: str,
        *,
        default_database: str | None = None,
        default_schema: str | None = None,
    ) -> None:
        self._client = client
        self._service_name = service_name
        self._default_database = default_database
        self._default_schema = default_schema
        self._bindings = _BoundedCache(MAX_CACHED_BINDINGS)
        self._schema_listings = _BoundedCache(MAX_CACHED_SCHEMA_LISTINGS)
        self._warned: set[str] = set()
        self._skipped_count = 0

    @property
    def skipped_count(self) -> int:
        """Parsed names skipped as unresolvable so far this run — the
        binding-skip count the workflow folds into processor-step
        warnings (C-11/B-4). One per skipped binding attempt,
        including repeats of a name whose log warning was throttled."""
        return self._skipped_count

    def resolve(
        self,
        parsed_name: str,
        *,
        database_name: str | None,
        database_schema: str | None,
        quiet: bool = False,
    ) -> str | None:
        parts = parsed_name.split(".")[-_MAX_NAME_PARTS:]
        database = database_name or self._default_database
        schema = database_schema or self._default_schema
        for fqn in self._candidate_fqns(parts, database, schema):
            if self._lookup(fqn) is not None:
                return fqn
        if database and schema:
            resolved = self._resolve_case_insensitive(parts[-1], database, schema)
            if resolved is not None:
                return resolved
        self.warn_unresolved(parsed_name, quiet=quiet)
        return None

    def _candidate_fqns(
        self, parts: list[str], database: str | None, schema: str | None
    ) -> list[str]:
        """Candidate FQNs, most specific first. Three-part names carry
        their own database/schema; two-part names take the database
        from context; one-part names need both from context."""
        service = self._service_name
        if len(parts) == 3:
            return [f"{service}.{parts[0]}.{parts[1]}.{parts[2]}"]
        if len(parts) == 2:
            if not database:
                return []
            return [f"{service}.{database}.{parts[0]}.{parts[1]}"]
        if database and schema:
            return [f"{service}.{database}.{schema}.{parts[0]}"]
        return []

    def _lookup(self, fqn: str) -> dict[str, Any] | None:
        """The table entity for an FQN, or ``None`` on 404. Other
        REST errors propagate: absence is data, failure is failure."""
        cached = self._bindings.get(fqn)
        if cached is not _MISSING:
            return cached
        try:
            result = self._client.get_table_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                result = None
            else:
                raise
        self._bindings.set(fqn, result)
        return result

    def _resolve_case_insensitive(self, table_name: str, database: str, schema: str) -> str | None:
        schema_fqn = f"{self._service_name}.{database}.{schema}"
        matches = [
            item
            for item in self._list_schema_tables(schema_fqn)
            if str(item.get("name", "")).lower() == table_name.lower()
        ]
        if len(matches) == 1:
            fqn = matches[0].get("fullyQualifiedName")
            if isinstance(fqn, str) and fqn:
                return fqn
        elif len(matches) > 1:
            logger.warning(
                "Ambiguous table name %r in schema %s: %d case-insensitive matches; skipping",
                table_name,
                schema_fqn,
                len(matches),
            )
        return None

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

    def warn_unresolved(self, parsed_name: str, *, quiet: bool = False) -> None:
        """Record an unresolvable name, warning unless ``quiet``.

        Quiet probes (a cross-service resolver trying the own service
        first) neither warn nor count: the name may still resolve
        elsewhere, and a probe must not spend the name's one warning
        or inflate the skipped count. Callers that exhaust every
        resolver warn loudly through this same method."""
        if quiet:
            return
        self._skipped_count += 1
        if parsed_name in self._warned:
            return
        if len(self._warned) < MAX_WARNED_UNRESOLVED_NAMES:
            self._warned.add(parsed_name)
            logger.warning(
                "No catalog table matches parsed name %r under service %s; skipping its usage",
                parsed_name,
                self._service_name,
            )
        elif len(self._warned) == MAX_WARNED_UNRESOLVED_NAMES:
            self._warned.add("")
            logger.warning(
                "Further unresolvable table names will be counted, not logged "
                "(%d skipped so far)",
                self._skipped_count,
            )


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

    @property
    def binding_skips(self) -> int:
        """Binding-resolution skips observed by the stage's resolver —
        the count the workflow folds into processor-step warnings
        (C-11/B-4). A resolver without a skip counter (a test double
        behind the protocol) contributes zero."""
        return int(getattr(self._binding_resolver, "skipped_count", 0) or 0)

    def handle_batch(self, parsed_batch: list[ParsedData]) -> None:
        """Aggregate one batch and append it to the staging files."""
        usage: dict[tuple[str, str], _UsageAccumulator] = {}
        costs: dict[tuple[str, str], QueryCostAggregate] = {}
        for parsed in parsed_batch:
            self._handle_table_usage(parsed, usage)
            self._handle_query_cost(parsed, costs)
        self._dump(usage, costs)

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

    def _resolve_tables(self, parsed: ParsedData) -> dict[str, str]:
        """Parsed names → catalog FQNs for one record; unresolvable
        names are dropped (the resolver warned already)."""
        resolved: dict[str, str] = {}
        for name in parsed.tables:
            fqn = self._binding_resolver.resolve(
                name,
                database_name=parsed.database_name,
                database_schema=parsed.database_schema,
            )
            if fqn is not None:
                resolved[name] = fqn
        return resolved

    def _resolve_joins(
        self,
        parsed: ParsedData,
        parsed_name: str,
        resolved: dict[str, str],
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
        with zero cost and its duration still sums."""
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
