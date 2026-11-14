# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Stored-procedure lineage channel (design §3.7 channel 2, §3.8).

The base behavior logs "not supported": connectors opt in by
supplying a :class:`ProcedureProvider` that reads CALL history from
the engine's public history views. Each CALL is matched to a
cataloged procedure, the procedure body's queries are parsed, and
the channel emits the body's table edges plus procedure-graph edges
(source tables → procedure → target tables). Body queries also emit
Query entities with ``triggeredBy`` pointing at the procedure.

Procedure support in this batch (bounded per-engine gaps, D-C8
item 3 — the provider contract is the extension point; a connector
without a provider logs "not supported" and the other channels run
unaffected):

- Snowflake: IMPLEMENTED. CALL history from
  ``SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY``, with window-narrowing
  retries on failure (the pin's cancelled-history-statement
  handling, reimplemented against the same public view).
- Postgres / TimescaleDB / MySQL / MariaDB / Doris / Greenplum /
  MSSQL / Redshift / Databricks / Unity Catalog: NO PROVIDER in
  this batch. Their CALL-history statements were not authored
  here; adding one is a new provider module, not a channel change.
  This is a recorded gap per engine, not a silent drop: the
  channel announces the missing provider in the run log.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.lineage.graphs import TempHop
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver, passes_filter
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord
from smartmetadata_ingestion.usage.query_log import (
    ConnectFactory,
    fetch_rows,
    query_window,
)

logger = logging.getLogger(__name__)

# CALL <name>(...) — the name is one to three dotted parts, each
# bare or double-quoted. The match runs on the statement text as
# logged; a CALL whose name cannot be read is skipped, never guessed.
_CALL_NAME = re.compile(
    r"\bCALL\s+((?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*)){0,2})",
    re.IGNORECASE,
)

# Window-narrowing attempts for the CALL-history read: the full
# window first, then progressively narrower tails. A history
# statement cancelled for its size succeeds on a smaller window;
# exhausting the attempts fails the channel loudly.
_NARROWING_DIVISORS = (1, 2, 4)

_STATEMENT_TIME_FORMAT = "%Y-%m-%d %H:%M:%S"


def extract_call_name(call_text: str) -> str | None:
    """The procedure name a CALL statement invokes, unquoted, or
    ``None`` when the statement names no procedure."""
    match = _CALL_NAME.search(call_text or "")
    if match is None:
        return None
    parts = []
    for part in match.group(1).split("."):
        stripped = part.strip()
        if stripped.startswith('"') and stripped.endswith('"'):
            stripped = stripped[1:-1].replace('""', '"')
        parts.append(stripped)
    name = ".".join(part for part in parts if part)
    return name or None


@dataclass(frozen=True)
class ProcedureCall:
    """One CALL from procedure history."""

    call_text: str
    database_name: str | None = None
    schema_name: str | None = None
    user_name: str | None = None
    start_time: str | None = None


class ProcedureProvider(Protocol):
    """Per-engine CALL-history read. Implementations own their SQL."""

    engine_key: str

    def iter_calls(
        self, *, duration_days: int, result_limit: int
    ) -> Iterable[ProcedureCall]: ...


@dataclass
class ProcedureOutcome:
    """Per-item counts, merged by the source in the main thread."""

    seen: int = 0
    skipped_filtered: int = 0
    skipped_unparseable: int = 0
    skipped_unresolved: int = 0
    skipped_no_code: int = 0
    edges: int = 0
    procedure_edges: int = 0
    queries: int = 0


class SnowflakeProcedureProvider:
    """Snowflake CALL history from the account-usage query history.

    Authored from Snowflake's own public view: ``QUERY_HISTORY``
    carries the statement type, so CALLs are selected by type with
    a text fallback for statements logged without one. The read
    retries with a narrowed window when the history statement
    fails — the same narrowing the pin applies to cancelled
    Snowflake history statements."""

    engine_key = "snowflake"

    CALL_HISTORY_SQL = (
        "SELECT QUERY_TEXT AS query_text, USER_NAME AS user_name, "
        "START_TIME AS start_time, "
        "DATABASE_NAME AS database_name, SCHEMA_NAME AS schema_name "
        "FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY "
        "WHERE QUERY_TEXT IS NOT NULL "
        "AND START_TIME >= '{start_time}' AND START_TIME < '{end_time}' "
        "AND (QUERY_TYPE = 'CALL' OR UPPER(TRIM(QUERY_TEXT)) LIKE 'CALL %') "
        "ORDER BY START_TIME DESC LIMIT {result_limit}"
    )

    def __init__(self, connect_factory: ConnectFactory) -> None:
        self._connect_factory = connect_factory

    def iter_calls(
        self, *, duration_days: int, result_limit: int
    ) -> Iterable[ProcedureCall]:
        rows = self._read_with_narrowing(duration_days, result_limit)
        for row in rows:
            call_text = row.get("query_text")
            if call_text is None or not str(call_text).strip():
                continue
            start_time = row.get("start_time")
            yield ProcedureCall(
                call_text=str(call_text),
                database_name=_as_text(row.get("database_name")),
                schema_name=_as_text(row.get("schema_name")),
                user_name=_as_text(row.get("user_name")),
                start_time=start_time.isoformat()
                if isinstance(start_time, datetime)
                else _as_text(start_time),
            )

    def _read_with_narrowing(
        self, duration_days: int, result_limit: int
    ) -> list[dict[str, object]]:
        """Execute the CALL-history read, narrowing the window on
        failure. The end stays fixed (tomorrow 00:00 UTC); only the
        start moves forward, so the newest CALLs are always the
        ones retried."""
        _, end = query_window(duration_days)
        failures: list[str] = []
        for divisor in _NARROWING_DIVISORS:
            narrowed_days = max(duration_days // divisor, 0)
            start, _ = query_window(narrowed_days)
            statement = self.CALL_HISTORY_SQL.format(
                start_time=start.strftime(_STATEMENT_TIME_FORMAT),
                end_time=end.strftime(_STATEMENT_TIME_FORMAT),
                result_limit=result_limit,
            )
            try:
                return fetch_rows(self._connect_factory, statement)
            except Exception as exc:
                failures.append(str(exc))
                logger.warning(
                    "Snowflake CALL-history read failed for a %d-day window: %s; "
                    "retrying with a narrower window",
                    narrowed_days,
                    exc,
                )
        raise WorkflowError(
            "Snowflake CALL-history read failed after window-narrowing retries: "
            + "; ".join(failures)
        )


def _as_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class ProcedureLineageChannel:
    """One CALL at a time: match, parse the body, emit body edges +
    procedure-graph edges + the body query entity."""

    def __init__(
        self,
        processor: QueryLineageProcessor,
        resolver: LineageBindingResolver,
        *,
        service_name: str,
        include_stored_procedures: list[str],
        exclude_stored_procedures: list[str],
        use_fqn_for_filtering: bool = False,
    ) -> None:
        self._processor = processor
        self._resolver = resolver
        self._service_name = service_name
        self._include = include_stored_procedures
        self._exclude = exclude_stored_procedures
        self._use_fqn = use_fqn_for_filtering

    def process_one(
        self, call: ProcedureCall
    ) -> tuple[list[WorkflowRecord], ProcedureOutcome, list[TempHop]]:
        outcome = ProcedureOutcome(seen=1)
        procedure_name = extract_call_name(call.call_text)
        if procedure_name is None:
            logger.warning("CALL statement names no procedure; skipping: %.80s", call.call_text)
            outcome.skipped_unparseable = 1
            return [], outcome, []
        if not self._selected(procedure_name, call):
            outcome.skipped_filtered = 1
            return [], outcome, []
        entity = self._resolver.resolve_procedure(
            procedure_name,
            database_name=call.database_name,
            database_schema=call.schema_name,
        )
        if entity is None:
            outcome.skipped_unresolved = 1
            return [], outcome, []
        code = self._resolver.procedure_code(entity)
        if code is None:
            logger.warning(
                "procedure %s has no stored code; skipping its lineage",
                entity.get("fullyQualifiedName") or procedure_name,
            )
            outcome.skipped_no_code = 1
            return [], outcome, []
        procedure_fqn = str(entity.get("fullyQualifiedName") or "")
        if not procedure_fqn:
            outcome.skipped_unresolved = 1
            return [], outcome, []
        processed = self._processor.process(
            code,
            database_name=call.database_name,
            database_schema=call.schema_name,
            emit_query_record=True,
            triggered_by_fqn=procedure_fqn,
            user_name=call.user_name,
            analysis_date=call.start_time,
        )
        records: list[WorkflowRecord] = []
        for edge in processed.edges:
            records.append(
                LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=edge.from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=edge.to_fqn),
                    source="CrossDatabaseLineage"
                    if edge.cross_database
                    else "QueryLineage",
                    sql_query=processed.masked_query,
                    columns_lineage=list(edge.columns),
                )
            )
        outcome.edges = len(records)
        sources = sorted({edge.from_fqn for edge in processed.edges})
        targets = sorted({edge.to_fqn for edge in processed.edges})
        for source_fqn in sources:
            records.append(
                LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=source_fqn),
                    to_entity=LineageEndpoint(
                        type="storedProcedure", fqn=procedure_fqn
                    ),
                    source="QueryLineage",
                    sql_query=processed.masked_query,
                )
            )
        for target_fqn in targets:
            records.append(
                LineageRecord(
                    from_entity=LineageEndpoint(
                        type="storedProcedure", fqn=procedure_fqn
                    ),
                    to_entity=LineageEndpoint(type="table", fqn=target_fqn),
                    source="QueryLineage",
                    sql_query=processed.masked_query,
                )
            )
        outcome.procedure_edges = len(records) - outcome.edges
        if processed.query_record is not None:
            records.append(processed.query_record)
            outcome.queries = 1
        return records, outcome, list(processed.temp_hops)

    def _selected(self, procedure_name: str, call: ProcedureCall) -> bool:
        """Whether the CALL passes the stored-procedure filter
        pattern. The candidate FQN uses the CALL's own database /
        schema context when present, so the pattern can match a
        qualified name."""
        parts = procedure_name.split(".")
        if len(parts) >= 3:
            candidate_fqn = build_fqn(
                self._service_name, parts[-3], parts[-2], parts[-1]
            )
            short_name = parts[-1]
        elif len(parts) == 2 and call.database_name:
            candidate_fqn = build_fqn(
                self._service_name, call.database_name, parts[0], parts[1]
            )
            short_name = parts[-1]
        elif call.database_name and call.schema_name:
            candidate_fqn = build_fqn(
                self._service_name, call.database_name, call.schema_name, parts[-1]
            )
            short_name = parts[-1]
        else:
            candidate_fqn = procedure_name
            short_name = procedure_name
        return passes_filter(
            short_name,
            candidate_fqn,
            include=self._include,
            exclude=self._exclude,
            use_fqn_for_filtering=self._use_fqn,
        )
