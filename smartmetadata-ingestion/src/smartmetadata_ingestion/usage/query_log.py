# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared query-log source base for the usage/lineage chain.

One base, per-engine DATA: each engine module supplies a
:class:`QueryLogSpec` (history SQL template, filters, dialect,
lifecycle predicate, window shape) plus a connect builder and an
engine provider, and the base implements the shared contract —
window math, statement formatting, per-day batching, row
normalization, the CSV log-file path, and the failure semantics of
design-sql-parsing §3.3. No engine branches live here.

Failure semantics: a per-row problem warns and skips the row; a
per-engine history failure errors and skips that engine without
ending later engines; a batch that fills ``resultLimit`` warns once
per run; when EVERY engine fails, the source raises instead of
yielding zero records — a total read failure must never look like an
empty window.
"""

from __future__ import annotations

import csv
import logging
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.records import TableQueryRecord, WorkflowRecord

logger = logging.getLogger(__name__)

# A query-log row's start time may arrive in any of these shapes; the
# CSV path's documented shape comes first, ISO last as the catch-all.
_START_TIME_FORMATS = (
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
)

# Statement timestamps are naive UTC strings: engines compare them
# against timestamp columns, and the templates quote them.
_STATEMENT_TIME_FORMAT = "%Y-%m-%d %H:%M:%S"

ConnectFactory = Callable[[], Any]
ConnectBuilder = Callable[[dict[str, Any]], ConnectFactory]
Engine = tuple[str, ConnectFactory]
EngineProvider = Callable[[SourceConfig, ConnectBuilder], list[Engine]]


@dataclass(frozen=True)
class QueryLogSpec:
    """Per-engine query-log variation, as data.

    ``sql_template`` is formatted with ``start_time``, ``end_time``,
    ``filters``, ``result_limit``, ``query_statement_source``,
    ``account_usage``, ``credit_cost``, and ``time_column_name``; a
    template uses only the placeholders its engine needs. ``filters``
    is a predicate WITHOUT a leading AND — the base joins it with the
    user's ``filterCondition`` and prefixes the AND — so templates
    write ``... WHERE <conditions> {filters}``.
    ``lifecycle_query_types`` names the engine's lifecycle-relevant
    query types, matched EXACTLY (case-insensitive) against the row's
    ``query_type``: a suffixed type like ``ALTER_TABLE`` does NOT
    match ``ALTER``. ``lifecycle_query_text_patterns`` names engines
    whose lifecycle decision reads the query TEXT instead (matched
    with ``re.match``); either signal sets ``exclude_usage``.
    ``max_duration_days`` clamps the window for engines whose history
    cannot reach further back.
    ``statement_source_key``/``statement_source_default``/``statement_source_pattern``
    resolve a configurable history view/table name from the connection
    (the pattern is the injection guard: custom views are legitimate,
    so shape validation replaces an allowlist).
    ``account_usage_key``/``account_usage_default``/``account_usage_pattern``
    resolve a configurable account-usage schema name the same way,
    and ``credit_cost_key``/``credit_cost_default`` resolve the
    credit price knob used to scale query cost.
    """

    engine_key: str
    sql_template: str
    dialect: Dialect
    filters: str = ""
    uses_time_window: bool = True
    lifecycle_query_types: frozenset[str] = frozenset()
    lifecycle_query_text_patterns: tuple[re.Pattern[str], ...] = ()
    max_duration_days: int | None = None
    statement_source_key: str | None = None
    statement_source_default: str | None = None
    statement_source_pattern: re.Pattern[str] | None = None
    account_usage_key: str | None = None
    account_usage_default: str | None = None
    account_usage_pattern: re.Pattern[str] | None = None
    credit_cost_key: str | None = None
    credit_cost_default: float | None = None
    time_column_name: str | None = None


_SPECS: dict[str, QueryLogSpec] = {}


def register_query_log_spec(spec: QueryLogSpec) -> QueryLogSpec:
    """Register an engine's spec, keyed by its normalized engine key."""
    _SPECS[spec.engine_key.strip().lower()] = spec
    return spec


def get_query_log_spec(engine_key: str) -> QueryLogSpec:
    spec = _SPECS.get(engine_key.strip().lower())
    if spec is None:
        raise WorkflowError(f"no query-log spec registered for engine {engine_key!r}")
    return spec


def registered_query_log_engines() -> tuple[str, ...]:
    return tuple(sorted(_SPECS))


def load_query_log_specs() -> None:
    """Import the engine spec modules so they register themselves."""
    from smartmetadata_ingestion.connectors import databricks_query_log as _databricks  # noqa: F401
    from smartmetadata_ingestion.connectors import mssql_query_log as _mssql  # noqa: F401
    from smartmetadata_ingestion.connectors import mysql_query_log as _mysql  # noqa: F401
    from smartmetadata_ingestion.connectors import postgres_query_log as _postgres  # noqa: F401
    from smartmetadata_ingestion.connectors import redshift_query_log as _redshift  # noqa: F401
    from smartmetadata_ingestion.connectors import snowflake_query_log as _snowflake  # noqa: F401
    from smartmetadata_ingestion.connectors import timescale_query_log as _timescale  # noqa: F401
    from smartmetadata_ingestion.connectors import (
        unitycatalog_query_log as _unitycatalog,  # noqa: F401
    )


def query_window(
    duration_days: int,
    *,
    today: date | None = None,
    max_duration_days: int | None = None,
) -> tuple[datetime, datetime]:
    """The query-log window for a duration in days.

    Start = (today − duration) at 00:00 UTC, end = tomorrow at 00:00
    UTC. The window always covers duration + 1 calendar days: today is
    included, and the end is exclusive. ``max_duration_days`` clamps
    engines whose history cannot reach further back.
    """
    if duration_days < 0:
        raise WorkflowError("queryLogDuration must be >= 0")
    effective = duration_days
    if max_duration_days is not None:
        effective = min(effective, max_duration_days)
    anchor = today or datetime.now(timezone.utc).date()
    start = datetime.combine(
        anchor - timedelta(days=effective), time.min, tzinfo=timezone.utc
    )
    end = datetime.combine(anchor + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end


def day_batches(start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """One [day 00:00, next day 00:00) batch per calendar day in the window."""
    batches: list[tuple[datetime, datetime]] = []
    current = start
    while current < end:
        nxt = current + timedelta(days=1)
        batches.append((current, min(nxt, end)))
        current = nxt
    return batches


def single_engine_provider(
    config: SourceConfig, connect_builder: ConnectBuilder
) -> list[Engine]:
    """One engine: the connection's own database."""
    return [(config.service_name, connect_builder(config.connection or {}))]


def normalize_row(row: Any, columns: list[str]) -> dict[str, Any]:
    """Normalize one DB-API row to a lowercase-key dict.

    Drivers disagree on row shape (tuples vs mappings) and on column
    casing (Snowflake uppercases); consumers see only lowercase keys,
    exactly as the pin lowercases ``row._asdict()``.
    """
    if isinstance(row, Mapping):
        return {str(key).lower(): value for key, value in row.items()}
    values = list(row)
    if len(values) != len(columns):
        raise WorkflowError(
            f"query-log row has {len(values)} values for {len(columns)} columns"
        )
    return {column.lower(): value for column, value in zip(columns, values, strict=True)}


def fetch_rows(connect_factory: ConnectFactory, statement: str) -> list[dict[str, Any]]:
    """Execute a history statement through a DB-API factory and return
    normalized rows. The statement is executed exactly once, with no
    parameters: history SQL is fully formatted by the base."""
    with connect_factory() as connection:
        cursor = connection.cursor()
        try:
            cursor.execute(statement)
            if cursor.description is None:
                raise WorkflowError("query-log statement returned no columns")
            columns = [str(column[0]) for column in cursor.description]
            return [normalize_row(row, columns) for row in cursor.fetchall()]
        finally:
            cursor.close()


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _as_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _as_bool(value: Any) -> bool:
    """String-aware truth: CSV rows arrive as strings, and ``bool`` of
    a non-empty string is always true — the string ``"False"`` must
    parse as false, as must ``"0"`` and every other non-affirmative
    spelling."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"true", "1", "yes", "y", "t", "on"}


def parse_analysis_date(value: Any, *, now: datetime | None = None) -> str:
    """The row's analysis date as an ISO-8601 UTC string.

    ``start_time`` drives it; an absent or unparseable value defaults
    to now, because a query without a timestamp still happened — the
    stage truncates to the day, so the fallback only ever shifts the
    row into today's bucket.
    """
    fallback = now or datetime.now(timezone.utc)
    parsed: datetime | None = None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min)
    elif isinstance(value, str) and value.strip():
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            for fmt in _START_TIME_FORMATS:
                try:
                    parsed = datetime.strptime(text, fmt)
                except ValueError:
                    continue
                break
    if parsed is None:
        return fallback.isoformat()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def format_query_text(raw: str) -> str:
    """Unescape the ``\\n`` sequences query logs store for newlines."""
    return raw.replace("\\n", "\n")


class QueryLogSource:
    """Base source reading raw queries from one engine's query history.

    Subclasses are thin: they pass their engine's spec, connect
    builder, and engine provider, and override :meth:`prepare` with
    the engine's connection test. ``connect`` is the test seam — a
    zero-arg DB-API factory used as the single engine, bypassing the
    provider — so tests exercise the real SQL formatting and row
    conversion instead of a pre-aggregated reader.
    """

    def __init__(
        self,
        config: SourceConfig,
        spec: QueryLogSpec,
        connect_builder: ConnectBuilder,
        engine_provider: EngineProvider,
        *,
        connect: ConnectFactory | None = None,
    ) -> None:
        self._config = config
        self._spec = spec
        self._connect_builder = connect_builder
        self._engine_provider = engine_provider
        self._connect_override = connect
        if config.result_limit < 1:
            raise WorkflowError("resultLimit must be >= 1")
        if config.query_log_duration < 0:
            raise WorkflowError("queryLogDuration must be >= 0")
        self._truncation_warned = False
        self._engine_failures: list[str] = []

    @property
    def spec(self) -> QueryLogSpec:
        return self._spec

    @property
    def engine_failures(self) -> list[str]:
        """Engines whose history read failed, as ``label: error``."""
        return list(self._engine_failures)

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        if self._config.query_log_file_path:
            yield from self._produce_from_csv()
            return
        yield from self._produce_from_history()

    def parser_type(self):
        """The cascade mode for this source's queries, derived from the
        config shape: an absent ``queryParserConfig`` means Auto."""
        from smartmetadata_ingestion.lineage.parser import resolve_parser_type

        return resolve_parser_type(self._config.query_parser_config)

    def filters_clause(self) -> str:
        """The ``{filters}`` fragment: the engine predicate plus the
        user's ``filterCondition``, joined with AND and prefixed."""
        parts = [part for part in (self._spec.filters.strip(),) if part]
        condition = (self._config.filter_condition or "").strip()
        if condition:
            parts.append(f"({condition})")
        if not parts:
            return ""
        return " AND " + " AND ".join(parts)

    def statement_source(self) -> str:
        """The configured history view/table name, shape-validated."""
        key = self._spec.statement_source_key
        if key is None:
            return self._spec.statement_source_default or ""
        raw = (self._config.connection or {}).get(key)
        value = str(raw).strip() if raw else (self._spec.statement_source_default or "")
        pattern = self._spec.statement_source_pattern
        if pattern is not None and value and not pattern.fullmatch(value):
            raise WorkflowError(f"unsafe query statement source {value!r}")
        return value

    def account_usage(self) -> str:
        """The configured account-usage schema, shape-validated."""
        key = self._spec.account_usage_key
        if key is None:
            return self._spec.account_usage_default or ""
        raw = (self._config.connection or {}).get(key)
        value = str(raw).strip() if raw else (self._spec.account_usage_default or "")
        pattern = self._spec.account_usage_pattern
        if pattern is not None and value and not pattern.fullmatch(value):
            raise WorkflowError(f"unsafe account usage schema {value!r}")
        return value

    def credit_cost(self) -> str:
        """The squared credit-cost factor for the cost expression.

        The factor is creditCost × creditCost: the history view's
        credit column is scaled by the knob twice in the reference
        cost expression, and parity keeps the quirk — a custom
        creditCost changes the reported cost quadratically, as it
        does there. Formatted with ``:g`` so 3.3² renders ``10.89``.
        """
        key = self._spec.credit_cost_key
        raw = (self._config.connection or {}).get(key) if key else None
        value = raw if raw is not None else self._spec.credit_cost_default
        if value is None:
            return ""
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise WorkflowError(
                f"creditCost must be numeric, got {value!r}"
            ) from exc
        return f"{numeric * numeric:g}"

    def format_statement(
        self, *, start_time: str = "", end_time: str = ""
    ) -> str:
        """Format the engine template. Every placeholder is supplied;
        templates use only the ones their engine needs."""
        return self._spec.sql_template.format(
            start_time=start_time,
            end_time=end_time,
            filters=self.filters_clause(),
            result_limit=self._config.result_limit,
            query_statement_source=self.statement_source(),
            account_usage=self.account_usage(),
            credit_cost=self.credit_cost(),
            time_column_name=self._spec.time_column_name or "",
        )

    def _engines(self) -> list[Engine]:
        if self._connect_override is not None:
            return [(self._spec.engine_key, self._connect_override)]
        return self._engine_provider(self._config, self._connect_builder)

    def _produce_from_history(self) -> Iterable[TableQueryRecord]:
        engines = self._engines()
        if not engines:
            raise WorkflowError(
                f"no query-log engines resolved for {self._spec.engine_key}"
            )
        for label, factory in engines:
            try:
                yield from self._produce_from_engine(label, factory)
            except Exception as exc:
                # Per-engine isolation: this engine's history is
                # unreadable, but later engines still run.
                message = f"{label}: {exc}"
                self._engine_failures.append(message)
                logger.error("query-log read failed for engine %s: %s", label, exc)
        if len(self._engine_failures) == len(engines):
            detail = "; ".join(self._engine_failures)
            raise WorkflowError(
                f"all {len(engines)} query-log engine(s) failed: {detail}"
            )

    def _produce_from_engine(
        self, label: str, factory: ConnectFactory
    ) -> Iterable[TableQueryRecord]:
        start, end = query_window(
            self._config.query_log_duration,
            max_duration_days=self._spec.max_duration_days,
        )
        if self._spec.uses_time_window:
            batches = day_batches(start, end)
            for batch_start, batch_end in batches:
                statement = self.format_statement(
                    start_time=batch_start.strftime(_STATEMENT_TIME_FORMAT),
                    end_time=batch_end.strftime(_STATEMENT_TIME_FORMAT),
                )
                yield from self._produce_batch(label, factory, statement)
        else:
            statement = self.format_statement()
            yield from self._produce_batch(label, factory, statement)

    def _produce_batch(
        self, label: str, factory: ConnectFactory, statement: str
    ) -> Iterable[TableQueryRecord]:
        rows = fetch_rows(factory, statement)
        if len(rows) >= self._config.result_limit:
            self._warn_truncated_once(label)
        for row in rows:
            try:
                record = self._record_from_row(row)
            except Exception as exc:
                # Per-row isolation: one malformed row never aborts
                # the batch or the run.
                logger.warning("skipping malformed query-log row: %s", exc)
                continue
            if record is None:
                continue
            yield record

    def _warn_truncated_once(self, label: str) -> None:
        if self._truncation_warned:
            return
        self._truncation_warned = True
        logger.warning(
            "query log for engine %s filled resultLimit=%s in a batch; "
            "older queries in the window may be missing",
            label,
            self._config.result_limit,
        )

    def _record_from_row(self, row: dict[str, Any]) -> TableQueryRecord | None:
        raw_query = row.get("query_text")
        if raw_query is None:
            raise WorkflowError("query-log row has no query_text")
        query_text = format_query_text(str(raw_query))
        if not query_text.strip():
            logger.warning("skipping query-log row with empty query text")
            return None
        query_type = _as_text(row.get("query_type"))
        lifecycle = self._spec.lifecycle_query_types
        exclude_usage = bool(
            query_type and query_type.strip().upper() in lifecycle
        ) or any(
            pattern.match(query_text)
            for pattern in self._spec.lifecycle_query_text_patterns
        )
        return TableQueryRecord(
            query=query_text,
            service_name=self._config.service_name,
            query_type=query_type,
            exclude_usage=exclude_usage,
            dialect=self._spec.dialect.value,
            user_name=_as_text(row.get("user_name")),
            start_time=_as_text(row.get("start_time")),
            end_time=_as_text(row.get("end_time")),
            analysis_date=parse_analysis_date(row.get("start_time")),
            aborted=_as_bool(row.get("aborted", False)),
            database_name=_as_text(row.get("database_name")),
            database_schema=_as_text(row.get("schema_name")),
            duration=_as_number(row.get("duration")),
            cost=_as_number(row.get("cost")),
        )

    def _produce_from_csv(self) -> Iterable[TableQueryRecord]:
        path = Path(str(self._config.query_log_file_path))
        if not path.exists():
            raise WorkflowError(f"queryLogFilePath does not exist: {path}")
        if path.is_dir():
            files = sorted(path.glob("*.csv"))
            if not files:
                logger.warning("queryLogFilePath directory %s has no CSV files", path)
        else:
            files = [path]
        for csv_file in files:
            try:
                yield from self._produce_from_csv_file(csv_file)
            except Exception as exc:
                # CSV read failures warn and yield nothing for that
                # file; they do not raise, per the log-file contract.
                logger.warning("could not read query log file %s: %s", csv_file, exc)

    def _produce_from_csv_file(self, csv_file: Path) -> Iterable[TableQueryRecord]:
        with csv_file.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for raw_row in reader:
                row = {
                    str(key).strip().lower(): value
                    for key, value in raw_row.items()
                    if key is not None
                }
                try:
                    record = self._record_from_row(row)
                except Exception as exc:
                    logger.warning(
                        "skipping malformed row in %s: %s", csv_file, exc
                    )
                    continue
                if record is None:
                    continue
                yield record
