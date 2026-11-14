# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage bulk sink (design §3.6, clean-room to the spec).

Reads the stage's files and performs the five writes:

1. daily usage counts — ``POST /v1/usage/table/{id}``;
2. query entities + ``usage``/``users``/``usedBy`` links — ``PUT
   /v1/queries`` + ``PUT /v1/queries/{id}/usage|users|usedBy``;
3. frequently-joined-with column joins — ``PUT /v1/tables/{id}/joins``,
   with join columns validated against the catalog;
4. table lifecycle — JSON-Patch REPLACING the whole ``lifeCycle``
   with the fresh per-run derivation;
5. query cost records — ``POST /v1/queryCostRecord``.

Counts are aggregated per (table, day) across all staged lines before
write 1; joins are counted per column pair across all staged lines.
A failed write is recorded and the sink moves on to the next group,
so one bad table cannot hide the rest of the run — but the run is
still failed: :meth:`UsageBulkSink.run` returns a report whose
``failures`` the workflow turns into a loud error. Cost records whose
query was never created are skipped with a warning, never invented.
``close`` deletes only the staging files this run owns, then asks the
server to recompute usage percentiles; both steps warn on failure
instead of raising.
"""

import glob
import json
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from ..client.rest import RestClient
from ..errors import RestError
from .stage import COST_FILE_SUFFIX, TableUsageCount, calendar_date, stored_query_hash

logger = logging.getLogger(__name__)

# Lifecycle aspect mapping, as data. Exact query-type sets are tried
# first, then query-text patterns in aspect order. The exact match is
# what keeps bare TRUNCATE out of "updated" (only TRUNCATE_TABLE
# maps); the text fallback is what maps suffixed types like
# CREATE_TABLE to "created". SHOW/DESCRIBE read as accesses. DROP
# maps to nothing: a dropped table is gone, and patching lifecycle
# onto it is meaningless.
_LIFECYCLE_EXACT_TYPES: dict[str, frozenset[str]] = {
    "created": frozenset({"CREATE"}),
    "updated": frozenset({"DELETE", "TRUNCATE_TABLE", "UPDATE", "ALTER", "INSERT", "MERGE"}),
    "accessed": frozenset({"SHOW", "DESCRIBE", "SELECT"}),
}
_LIFECYCLE_TEXT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("created", re.compile(r".*\s*CREATE", re.IGNORECASE)),
    (
        "updated",
        re.compile(r".*\s*(UPDATE|INSERT|DELETE|MERGE|TRUNCATE_TABLE|ALTER)", re.IGNORECASE),
    ),
    ("accessed", re.compile(r".*\s*(SELECT|SHOW|DESCRIBE)", re.IGNORECASE)),
)

# Entity types whose usage percentiles close() recomputes, in wire
# form: the server path takes the lowercase entity name.
PERCENTILE_ENTITIES = ("table", "database")

# Per-run caches are bounded (AGENTS.md: no unbounded caches): one
# entry per distinct user/partner table, evicted oldest-first.
MAX_CACHED_USER_REFS = 512
MAX_CACHED_PARTNER_TABLES = 512


def _lifecycle_aspect(query_type: str, query_text: str) -> str | None:
    """The lifecycle aspect for one staged query: an exact match on
    the query type first, then the ordered query-text patterns.
    The exact match is what keeps bare TRUNCATE unmapped; the text
    fallback is what maps suffixed types like CREATE_TABLE."""
    normalized = query_type.strip().upper()
    for aspect, types in _LIFECYCLE_EXACT_TYPES.items():
        if normalized in types:
            return aspect
    for aspect, pattern in _LIFECYCLE_TEXT_PATTERNS:
        if pattern.match(query_text):
            return aspect
    return None


def _catalog_columns(table: dict[str, Any]) -> list[str] | None:
    """The table entity's column names, or ``None`` when the entity
    carries no column list. An absent list means the column set is
    unknown — joins fall back to parsed spellings rather than
    dropping every join; a present list (even empty) is validated
    against."""
    columns = table.get("columns")
    if not isinstance(columns, list):
        return None
    return [
        str(column["name"])
        for column in columns
        if isinstance(column, dict) and isinstance(column.get("name"), str)
    ]


def _match_column(parsed: str, catalog: list[str] | None) -> str | None:
    """The catalog spelling of a parsed column name: a unique
    case-insensitive match wins; an unknown catalog list keeps the
    parsed spelling; a known list with no match, or an ambiguous
    match, yields ``None`` — the join is dropped, never guessed.
    This mirrors the lineage column resolver's contract."""
    if catalog is None:
        return parsed
    matches = [name for name in catalog if name.lower() == parsed.lower()]
    if len(matches) == 1:
        return matches[0]
    return None


@dataclass
class SinkReport:
    """Outcome of a sink run: published counts plus every failure
    encountered. ``failures`` is empty on a clean run."""

    tables_published: int = 0
    queries_published: int = 0
    joins_published: int = 0
    lifecycle_patched: int = 0
    cost_records_published: int = 0
    cost_records_skipped: int = 0
    failures: list[str] = field(default_factory=list)


@dataclass
class _TableUsage:
    count: int = 0
    queries: dict[str, dict[str, Any]] = field(default_factory=dict)
    joins: Counter[tuple[str, str, str]] = field(default_factory=Counter)


def _append_fqn_segment(fqn: str, segment: str) -> str:
    """Append one segment to an FQN, quoting segments that contain
    dots or quotes so the result still parses as one segment."""
    if "." in segment or '"' in segment:
        quoted = segment.replace('"', '""')
        return f'{fqn}."{quoted}"'
    return f"{fqn}.{segment}"


class UsageBulkSink:
    """Publishes staged usage files with the five writes of §3.6."""

    def __init__(self, client: RestClient, *, stage_dir: str | Path, service_name: str) -> None:
        self._client = client
        self._stage_dir = Path(stage_dir)
        self._service_name = service_name
        self._created_queries: dict[str, tuple[str, str]] = {}
        self._usage_puts: set[tuple[str, str]] = set()
        self._users_puts: set[str] = set()
        self._used_by_puts: set[str] = set()
        self._user_refs: dict[str, dict[str, Any] | None] = {}
        self._partner_tables: dict[str, dict[str, Any] | None] = {}
        self._join_drops = 0

    @property
    def join_drops(self) -> int:
        """Joins dropped by catalog-column validation so far this run —
        the binding-skip count the workflow folds into processor-step
        warnings (C-11/B-4). One per dropped join, including repeats."""
        return self._join_drops

    def run(self) -> SinkReport:
        """Publish table usage, then query costs. Costs run second:
        they resolve their queries against the entities created by
        the usage pass."""
        report = SinkReport()
        self.handle_table_usage(report)
        self.handle_query_cost(report)
        return report

    def close(self) -> None:
        """Delete the staging files this run owns, then ask the
        server to recompute usage percentiles. Both steps warn on
        failure instead of raising: cleanup must not mask the run's
        real outcome, and close() is idempotent — a second close
        finds nothing to delete and re-posts harmlessly."""
        self._delete_owned_staging_files()
        self._post_percentiles()

    def _delete_owned_staging_files(self) -> None:
        """Delete ``{service}_*`` files in the staging directory and
        remove the directory when it empties. Other services' files
        and subdirectories are left alone, and a directory that
        still holds them is not removed."""
        if not self._stage_dir.exists():
            return
        prefix = f"{self._service_name}_"
        try:
            entries = list(self._stage_dir.iterdir())
        except OSError as exc:
            logger.warning("Failed to list staging directory %s: %s", self._stage_dir, exc)
            return
        for path in entries:
            if path.is_file() and path.name.startswith(prefix):
                try:
                    path.unlink()
                except OSError as exc:
                    logger.warning("Failed to delete staging file %s: %s", path, exc)
        try:
            self._stage_dir.rmdir()
        except OSError:
            pass

    def _post_percentiles(self) -> None:
        """The two percentile POSTs, for today (local date). A
        failure is logged and never fatal: percentiles are a
        derived view, and close() may run after the client context
        has closed."""
        today = date.today().isoformat()
        for entity in PERCENTILE_ENTITIES:
            try:
                self._client.compute_percentile(entity, today)
            except Exception as exc:
                logger.warning(
                    "Percentile computation for %s failed: %s", entity, exc
                )

    def handle_table_usage(self, report: SinkReport) -> None:
        """Aggregate staged usage lines per (table, day) and perform
        writes 1–4 for each group."""
        aggregated = self._aggregate_usage(report)
        for (fqn, date_ms), usage in sorted(aggregated.items()):
            self._publish_table_usage(fqn, date_ms, usage, report)

    def handle_query_cost(self, report: SinkReport) -> None:
        """Publish each staged cost record (write 5)."""
        for path in self._cost_files():
            for line_number, line in self._read_lines(path, report):
                self._publish_cost_record(path, line_number, line, report)

    def _usage_files(self) -> list[Path]:
        pattern = str(self._stage_dir / f"{glob.escape(self._service_name)}_*")
        return sorted(
            path
            for path in (Path(p) for p in glob.glob(pattern))
            if path.is_file() and not path.name.endswith(COST_FILE_SUFFIX)
        )

    def _cost_files(self) -> list[Path]:
        pattern = str(self._stage_dir / f"{glob.escape(self._service_name)}_*{COST_FILE_SUFFIX}")
        return sorted(path for path in (Path(p) for p in glob.glob(pattern)) if path.is_file())

    def _read_lines(self, path: Path, report: SinkReport):
        try:
            handle = path.open(encoding="utf-8")
        except OSError as exc:
            report.failures.append(f"{path}: cannot read staging file: {exc}")
            return
        with handle:
            for line_number, line in enumerate(handle, start=1):
                if line.strip():
                    yield line_number, line

    def _aggregate_usage(self, report: SinkReport) -> dict[tuple[str, str], _TableUsage]:
        aggregated: dict[tuple[str, str], _TableUsage] = {}
        for path in self._usage_files():
            for line_number, line in self._read_lines(path, report):
                try:
                    # Usage lines are double-encoded per the §3.5 file
                    # contract: a JSON string containing the record JSON.
                    record = TableUsageCount.from_dict(json.loads(json.loads(line)))
                except (json.JSONDecodeError, KeyError, TypeError) as exc:
                    report.failures.append(f"{path}:{line_number}: corrupt staged line: {exc}")
                    continue
                key = (record.table, record.date)
                usage = aggregated.setdefault(key, _TableUsage())
                usage.count += record.count
                for query in record.sql_queries:
                    query_hash = stored_query_hash(str(query.get("query", "")))
                    usage.queries.setdefault(query_hash, query)
                for join in record.joins:
                    for partner in join.joined_with:
                        usage.joins[
                            (
                                join.table_column.column,
                                partner.table,
                                partner.column,
                            )
                        ] += 1
        return aggregated

    def _publish_table_usage(
        self,
        fqn: str,
        date_ms: str,
        usage: _TableUsage,
        report: SinkReport,
    ) -> None:
        try:
            # The default GET carries the table's columns, which
            # join validation reads; no fields filter is applied.
            table = self._client.get_table_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                report.failures.append(f"{fqn}: staged table is no longer in the catalog")
            else:
                report.failures.append(f"{fqn}: failed to resolve table: {exc}")
            return
        table_id = str(table.get("id", ""))
        if not table_id:
            report.failures.append(f"{fqn}: catalog table has no id")
            return
        day = calendar_date(date_ms)
        failures_before = len(report.failures)
        self._write_counts(fqn, table_id, day, usage.count, report)
        self._write_queries(fqn, table_id, usage, report)
        self._write_joins(fqn, table_id, day, usage, table, report)
        self._write_lifecycle(fqn, table_id, usage, report)
        if len(report.failures) == failures_before:
            report.tables_published += 1

    def _write_counts(
        self,
        fqn: str,
        table_id: str,
        date: str,
        count: int,
        report: SinkReport,
    ) -> None:
        try:
            self._client.post_table_usage(table_id, date=date, count=count)
        except Exception as exc:
            report.failures.append(f"{fqn}: usage counts write failed: {exc}")

    def _write_queries(
        self,
        fqn: str,
        table_id: str,
        usage: _TableUsage,
        report: SinkReport,
    ) -> None:
        for query_hash, request in usage.queries.items():
            try:
                query_id = self._ensure_query(query_hash, request, report)
            except Exception as exc:
                report.failures.append(f"{fqn}: query create failed: {exc}")
                continue
            try:
                self._link_query(query_hash, query_id, table_id, request)
            except Exception as exc:
                report.failures.append(f"{fqn}: query link failed: {exc}")

    def _ensure_query(
        self,
        query_hash: str,
        request: dict[str, Any],
        report: SinkReport,
    ) -> str:
        """Create (or reuse) the Query entity for a staged request.
        The server derives the query name from the stored text, so
        the same text always resolves to the same entity; the cache
        keeps a run to one create per distinct query."""
        cached = self._created_queries.get(query_hash)
        if cached is not None:
            return cached[0]
        created = self._client.upsert_query(dict(request))
        query_id = str(created.get("id", ""))
        if not query_id:
            raise ValueError("query create response has no id")
        query_fqn = str(created.get("fullyQualifiedName", ""))
        self._created_queries[query_hash] = (query_id, query_fqn)
        report.queries_published += 1
        return query_id

    def _link_query(
        self,
        query_hash: str,
        query_id: str,
        table_id: str,
        request: dict[str, Any],
    ) -> None:
        if (query_hash, table_id) not in self._usage_puts:
            self._client.add_query_usage(query_id, [{"id": table_id, "type": "table"}])
            self._usage_puts.add((query_hash, table_id))
        users = request.get("users") or []
        if users and query_hash not in self._users_puts:
            self._client.add_query_users(query_id, list(users))
            self._users_puts.add(query_hash)
        used_by = request.get("usedBy") or []
        if used_by and query_hash not in self._used_by_puts:
            self._client.add_query_used_by(query_id, list(used_by))
            self._used_by_puts.add(query_hash)

    def _write_joins(
        self,
        fqn: str,
        table_id: str,
        date: str,
        usage: _TableUsage,
        table: dict[str, Any],
        report: SinkReport,
    ) -> None:
        """Publish the table's joins with both column sides
        validated against the catalog: the source column against
        this table's columns, the partner column against the
        partner table's columns (fetched once per run). Unresolvable
        columns drop their join with a warning; a table left with
        no valid joins publishes nothing."""
        if not usage.joins:
            return
        try:
            grouped = self._validated_joins(fqn, usage, table)
        except Exception as exc:
            report.failures.append(f"{fqn}: join validation failed: {exc}")
            return
        if not grouped:
            return
        body = {
            "startDate": date,
            "dayCount": 1,
            "columnJoins": [
                {"columnName": column, "joinedWith": entries}
                for column, entries in sorted(grouped.items())
            ],
            "directTableJoins": [],
        }
        try:
            self._client.put_table_joins(table_id, body)
            report.joins_published += 1
        except Exception as exc:
            report.failures.append(f"{fqn}: joins write failed: {exc}")

    def _validated_joins(
        self,
        fqn: str,
        usage: _TableUsage,
        table: dict[str, Any],
    ) -> dict[str, list[dict[str, Any]]]:
        columns = _catalog_columns(table)
        grouped: dict[str, list[dict[str, Any]]] = {}
        for (column, partner_table, partner_column), join_count in sorted(
            usage.joins.items()
        ):
            source_column = _match_column(column, columns)
            if source_column is None:
                logger.warning(
                    "Dropping join on table %s: column %r is not in the catalog",
                    fqn,
                    column,
                )
                self._join_drops += 1
                continue
            partner = self._partner_column_fqn(partner_table, partner_column)
            if partner is None:
                logger.warning(
                    "Dropping join on table %s: partner column %s.%s is not in the catalog",
                    fqn,
                    partner_table,
                    partner_column,
                )
                self._join_drops += 1
                continue
            grouped.setdefault(source_column, []).append(
                {"fullyQualifiedName": partner, "joinCount": join_count}
            )
        return grouped

    def _partner_column_fqn(self, partner_table: str, partner_column: str) -> str | None:
        """The partner column's FQN with catalog spelling, or ``None``
        when the partner table is gone or its column unresolvable.
        Partner entities are fetched once per run (bounded cache);
        a 404 drops the join, any other REST error propagates."""
        if partner_table in self._partner_tables:
            partner = self._partner_tables[partner_table]
        else:
            try:
                partner = self._client.get_table_by_name(partner_table)
            except RestError as exc:
                if exc.status_code == 404:
                    partner = None
                else:
                    raise
            if len(self._partner_tables) >= MAX_CACHED_PARTNER_TABLES:
                self._partner_tables.pop(next(iter(self._partner_tables)))
            self._partner_tables[partner_table] = partner
        if partner is None:
            return None
        matched = _match_column(partner_column, _catalog_columns(partner))
        if matched is None:
            return None
        return _append_fqn_segment(partner_table, matched)

    def _write_lifecycle(
        self,
        fqn: str,
        table_id: str,
        usage: _TableUsage,
        report: SinkReport,
    ) -> None:
        """REPLACE the table's whole lifeCycle with the fresh
        per-run derivation. Derivation failures are recorded like
        patch failures: a table whose lifecycle cannot be derived
        must not silently keep a stale one."""
        try:
            derived = self._derive_lifecycle(usage)
        except Exception as exc:
            report.failures.append(f"{fqn}: lifecycle derivation failed: {exc}")
            return
        if not derived:
            return
        try:
            self._client.patch_table_life_cycle(table_id, derived)
            report.lifecycle_patched += 1
        except Exception as exc:
            report.failures.append(f"{fqn}: lifecycle patch failed: {exc}")

    def _derive_lifecycle(self, usage: _TableUsage) -> dict[str, dict[str, Any]]:
        """The fresh lifeCycle for one table: the latest staged
        query per aspect, first-seen winning ties. The winning
        query contributes its user: a resolved ``users`` FQN
        becomes ``accessedBy`` (an entity reference), else the raw
        ``usedBy`` name becomes ``accessedByAProcess``. Tables with
        no derived aspect are not patched at all — there is no
        empty lifeCycle to replace with."""
        derived: dict[str, dict[str, Any]] = {}
        winners: dict[str, dict[str, Any]] = {}
        for request in usage.queries.values():
            aspect = _lifecycle_aspect(
                str(request.get("query_type", "")), str(request.get("query", ""))
            )
            if aspect is None:
                continue
            timestamp = request.get("queryDate")
            if not isinstance(timestamp, int):
                continue
            current = derived.get(aspect)
            if current is not None and timestamp <= int(current["timestamp"]):
                continue
            derived[aspect] = {"timestamp": timestamp}
            winners[aspect] = request
        for aspect, request in winners.items():
            self._attach_accessed_by(derived[aspect], request)
        return derived

    def _attach_accessed_by(
        self, details: dict[str, Any], request: dict[str, Any]
    ) -> None:
        """Attach the winning query's user to one lifecycle aspect:
        the ``users`` FQN as an entity reference when it resolves,
        else the raw ``usedBy`` name as the accessing process. With
        both present the entity reference wins; when the FQN cannot
        be resolved to a reference, the raw name still attributes
        the access instead of losing it."""
        users = request.get("users") or []
        if users:
            reference = self._user_reference(str(users[0]))
            if reference is not None:
                details["accessedBy"] = reference
                return
        used_by = request.get("usedBy") or []
        if used_by:
            details["accessedByAProcess"] = str(used_by[0])

    def _user_reference(self, user_fqn: str) -> dict[str, Any] | None:
        """The entity reference for a user FQN, or ``None`` when the
        user is gone or has no id. Lookups are cached per run
        (bounded); a 404 yields ``None``, any other REST error
        propagates."""
        if user_fqn in self._user_refs:
            return self._user_refs[user_fqn]
        try:
            user = self._client.get_user_by_name(user_fqn)
        except RestError as exc:
            if exc.status_code == 404:
                user = None
            else:
                raise
        reference: dict[str, Any] | None = None
        if user is not None:
            user_id = user.get("id")
            if isinstance(user_id, str) and user_id:
                reference = {
                    "id": user_id,
                    "type": "user",
                    "fullyQualifiedName": user_fqn,
                }
        if len(self._user_refs) >= MAX_CACHED_USER_REFS:
            self._user_refs.pop(next(iter(self._user_refs)))
        self._user_refs[user_fqn] = reference
        return reference

    def _publish_cost_record(
        self, path: Path, line_number: int, line: str, report: SinkReport
    ) -> None:
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            report.failures.append(f"{path}:{line_number}: corrupt staged cost line: {exc}")
            return
        query_hash = str(record.get("queryHash", ""))
        created = self._created_queries.get(query_hash)
        if created is None:
            # The query was never created — its tables were
            # unresolvable or its writes failed. Skip with a warning
            # rather than inventing a query reference.
            logger.warning(
                "Skipping cost record for query hash %s: no Query entity was created",
                query_hash,
            )
            report.cost_records_skipped += 1
            return
        query_id, query_fqn = created
        try:
            body: dict[str, Any] = {
                "timestamp": int(record["date"]),
                "queryReference": {
                    "id": query_id,
                    "type": "query",
                    "fullyQualifiedName": query_fqn,
                },
                "cost": record["cost"],
                "count": record["count"],
            }
        except (KeyError, TypeError, ValueError) as exc:
            report.failures.append(
                f"{path}:{line_number}: malformed staged cost record for hash {query_hash}: {exc}"
            )
            return
        if record.get("totalDuration") is not None:
            body["totalDuration"] = record["totalDuration"]
        try:
            self._client.post_query_cost_record(body)
            report.cost_records_published += 1
        except Exception as exc:
            report.failures.append(
                f"{path}:{line_number}: query cost write failed for hash {query_hash}: {exc}"
            )
