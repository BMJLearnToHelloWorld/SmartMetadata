# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SQL parser cascade wrapper: one query in, parsed views out.

The parsing engine is the third-party ``collate-sqllineage`` library
(MIT); this module is only the glue around it — the cascade order, the
per-parser timeout, the failure collection, the query hash, masking,
and the T-SQL rewrite — written fresh from the behavioral spec
(design-sql-parsing §3.2). Nothing here copies the pin's parser glue.

Cascade: SqlGlot first, then SqlFluff, then SqlParse as the universal
fallback. ``QueryParserType`` selects which of the first two are tried;
SqlParse is always tried last. A candidate only wins when constructing
its runner AND forcing table enumeration plus column lineage succeeds
inside the timeout — lazy construction alone does not count, because
the library evaluates lazily and a broken parse only surfaces on
access. A failed query is recorded and skipped, never fatal: parsing
failures accumulate in the process-wide :class:`QueryParsingFailures`
and on the parser instance, and every view degrades to empty.

The public interface of this module is frozen for the lineage worker:
construction from (raw query, dialect, per-parser timeout, parser
type), ``query_hash``, ``masked_query``, and the parsed views below.
Later fixes must not change it without flagging the change.

D-L2c extension (flagged interface change): ``structured_extraction``
exposes the winning branch's names as structured identifiers — the
only name form binding may use — and ``table_aliases`` is keyed by
structured identifiers instead of cleaned strings. The string views
(``clean_table_list``, ``clean_table_name``) remain for display and
logging only and must never feed binding.
"""

from __future__ import annotations

import hashlib
import importlib
import logging
import re
import threading
import warnings
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from enum import Enum
from typing import Any, TypeVar

import sqlglot
from collate_sqllineage import SQLPARSE_DIALECT
from collate_sqllineage.core.models import Column, Table
from collate_sqllineage.core.parser.sqlfluff.analyzer import SqlFluffLineageAnalyzer
from collate_sqllineage.core.parser.sqlglot.analyzer import SqlGlotLineageAnalyzer
from collate_sqllineage.core.parser.sqlparse.analyzer import SqlParseLineageAnalyzer
from collate_sqllineage.runner import LineageRunner
from sqlglot import exp

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    EndpointAssociation,
    EndpointDescriptor,
    ExtractedName,
    ExtractionFailureReason,
    ExtractionResult,
    NameRole,
    StructuredIdentifier,
    associate_endpoints,
    extract_names,
    register_extractor,
)
from smartmetadata_ingestion.lineage.masking import mask_query
from smartmetadata_ingestion.lineage.sqlglot_extract import (
    effective_sqlglot_dialect,
    extract_sqlglot_names,
)
from smartmetadata_ingestion.lineage.tsql import rewrite_switch_statements

logger = logging.getLogger(__name__)

# Per-parser budget: a pathological query must fall through to the next
# analyzer instead of stalling the run. Memory limiting is deliberately
# absent — the pin's is commented out for performance overhead, and a
# timeout alone bounds the damage a single query can do.
LINEAGE_PARSING_TIMEOUT = 30

# Parser names as the cascade reports them. The SqlGlot spelling
# (capital G, lowercase lot) is the library analyzer's own name, kept
# verbatim so the suffixed query hash is stable.
PARSER_SQLGLOT = "SqlGlot"
PARSER_SQLFLUFF = "SqlFluff"
PARSER_SQLPARSE = "SqlParse"

T = TypeVar("T")


class QueryParserType(str, Enum):
    """Which analyzers the cascade tries. SqlParse is never selectable:
    it is the implicit universal fallback, tried last in every mode."""

    AUTO = "Auto"
    SQLGLOT = "SqlGlot"
    SQLFLUFF = "SqlFluff"


def resolve_parser_type(query_parser_config: Any | None) -> QueryParserType:
    """Derive the cascade mode from a pipeline's ``queryParserConfig``.

    An absent config means Auto — the usage schema has no
    ``queryParserConfig`` field, so usage always parses with Auto, and
    the code derives that from the config shape rather than hardcoding
    "usage = Auto" (D-C6). A present config carries its ``type`` as an
    attribute (the typed model), a mapping key, or a bare string.
    """
    if query_parser_config is None:
        return QueryParserType.AUTO
    raw: Any = query_parser_config
    if isinstance(raw, Mapping):
        raw = raw.get("type", raw.get("queryParserConfig"))
        if isinstance(raw, Mapping):
            raw = raw.get("type")
    elif not isinstance(raw, str):
        raw = getattr(raw, "type", None)
    if raw is None:
        return QueryParserType.AUTO
    if isinstance(raw, QueryParserType):
        return raw
    if isinstance(raw, str):
        for member in QueryParserType:
            if raw.strip().lower() == member.value.lower():
                return member
    raise ValueError(f"unknown query parser type {raw!r}")


def clean_raw_query(query: str | None) -> str:
    """Strip a raw query to a parseable form, filtering statement
    classes that carry no lineage.

    The text is stripped, its escaped newlines (``\\n`` sequences as
    query logs store them) are unescaped, and three statement classes
    are filtered out entirely (an empty result, so the query gets no
    parser): ``COPY`` data loads from filesystem paths, ``CREATE
    TRIGGER``, and ``CREATE FUNCTION``/``CREATE PROCEDURE``. Stage
    ``COPY INTO`` forms are kept: they move data between stages and
    tables, which is lineage. A query that cleans to nothing has no
    parser.

    Deliberately OMITTED pin transforms, with reasons: the Snowflake
    ``COPY GRANTS`` removal and the ``MERGE ... WHEN MATCHED`` tail
    strip are not applied, because the current SqlGlot analyzer
    parses both forms correctly — rewriting the text would only
    discard information the parser now uses.
    """
    if query is None:
        return ""
    cleaned = query.strip().replace("\\n", "\n").strip()
    if not cleaned:
        return ""
    if _COPY_STATEMENT.match(cleaned) and not (
        _STAGE_COPY_INTO_FROM.match(cleaned) or _STAGE_COPY_INTO_STAGE.match(cleaned)
    ):
        return ""
    if _CREATE_TRIGGER_STATEMENT.match(cleaned):
        return ""
    if _CREATE_ROUTINE_STATEMENT.match(cleaned):
        return ""
    return cleaned


# Statement-class filters for clean_raw_query, matched against the
# stripped text. COPY loads from paths yield filesystem Path objects
# the table views cannot name, so they are filtered; the two stage
# COPY INTO forms name stage locations the lineage graph can carry.
_COPY_STATEMENT = re.compile(r"\ACOPY\s+", re.IGNORECASE)
_STAGE_COPY_INTO_FROM = re.compile(r"\ACOPY\s+INTO\s+.*\s+FROM\s+@", re.IGNORECASE | re.DOTALL)
_STAGE_COPY_INTO_STAGE = re.compile(r"\ACOPY\s+INTO\s+@.*\s+FROM\s+", re.IGNORECASE | re.DOTALL)
_CREATE_TRIGGER_STATEMENT = re.compile(
    r"\ACREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+", re.IGNORECASE
)
_CREATE_ROUTINE_STATEMENT = re.compile(
    r"\ACREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+", re.IGNORECASE
)


def query_hash_of(raw_query: str | None) -> str:
    """First 8 hex chars of the MD5 of the raw query, as written.

    The hash is over the RAW query — before cleaning, rewriting, or
    masking — so the same logged statement always hashes the same way
    no matter which transforms the cascade applies.
    """
    return hashlib.md5((raw_query or "").encode("utf-8")).hexdigest()[:8]


def clean_table_name(table: Any) -> str:
    """The table's name as written, without the library's default-schema
    placeholder. DISPLAY ONLY — MUST NEVER BE USED FOR BINDING: the
    flattened string loses segment boundaries (a quoted ``sales.eu``
    schema and two segments render identically), quoted flags, and
    middle segments of over-long names, so any binding decision read
    off it can bind the wrong table. Binding uses
    ``LineageParser.structured_extraction``. This function survives
    for log messages, warnings, and the display-only
    ``clean_table_list`` view.

    Case is preserved from the query text (the library's ``str()``
    lowercases, which would break exact-FQN binding against
    catalogs that store uppercase names): the raw schema and table
    parts are joined, and the placeholder schema is dropped. Qualified
    names pass through unchanged.

    The function is total over the objects the library yields:
    filesystem-path locations (``COPY ... FROM '/tmp/f.csv'``) carry
    neither a schema nor a raw name, and their string form is the
    path itself. The COPY filter keeps such statements from parsing
    at all, but a path object reaching this function must not crash
    the whole query's table list — its name never binds to a catalog
    table, so downstream resolution skips it with a warning.
    """
    schema = getattr(table, "schema", None)
    if schema is None:
        return str(table)
    schema_name = schema.raw_name
    if not schema or not schema_name:
        return table.raw_name
    return f"{schema_name}.{table.raw_name}"


@dataclass(frozen=True)
class QueryParsingError:
    """One failed cascade attempt. The query itself is never stored —
    only its hash — because query text may carry literal values."""

    query_hash: str
    parser: str
    reason: str


class QueryParsingFailures:
    """Process-wide collection of parsing failures, never fatal.

    A failed query is skipped downstream; the record exists so a run
    can report how many queries failed to parse instead of silently
    losing them. Thread-safe: parsers run inside worker threads.
    """

    _instance: QueryParsingFailures | None = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._failures: list[QueryParsingError] = []
        self._lock = threading.Lock()

    @classmethod
    def instance(cls) -> QueryParsingFailures:
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def record(self, error: QueryParsingError) -> None:
        with self._lock:
            self._failures.append(error)

    def failures(self) -> list[QueryParsingError]:
        with self._lock:
            return list(self._failures)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


def query_parsing_failures() -> QueryParsingFailures:
    """The process-wide failure collection."""
    return QueryParsingFailures.instance()


@dataclass(frozen=True)
class TableColumn:
    """One ``table.column`` reference in a join comparison."""

    table: str
    column: str

    def to_dict(self) -> dict[str, str]:
        return {"table": self.table, "column": self.column}

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> TableColumn:
        """Inverse of :meth:`to_dict`, for reading staged joins back.

        FLAG (2026-11-14, usage stage): additive extension to the
        frozen parsing core — a new constructor, no signature or
        behavior change to existing API.
        """
        return cls(table=data["table"], column=data["column"])


@dataclass(frozen=True)
class TableColumnJoin:
    """A column of one table joined with columns of other tables.

    Serializes to the ``tableColumnJoin`` shape of the
    ``tableUsageCount`` spec schema (``tableColumn`` / ``joinedWith``).
    """

    table_column: TableColumn
    joined_with: tuple[TableColumn, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "tableColumn": self.table_column.to_dict(),
            "joinedWith": [column.to_dict() for column in self.joined_with],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TableColumnJoin:
        """Inverse of :meth:`to_dict`, for reading staged joins back.

        FLAG (2026-11-14, usage stage): additive extension to the
        frozen parsing core — a new constructor, no signature or
        behavior change to existing API.
        """
        return cls(
            table_column=TableColumn.from_dict(data["tableColumn"]),
            joined_with=tuple(TableColumn.from_dict(entry) for entry in data["joinedWith"]),
        )


@dataclass(frozen=True)
class ParsedTableColumn:
    """One ``table.column`` reference as parsed, before binding: the
    table is a structured identifier (segment boundaries and quoted
    flags intact), the column the written name. This type never
    reaches staging files — the stage resolves it into
    :class:`TableColumn` (a catalog FQN string) — so it carries no
    serialization: a resolved FQN is opaque output text, while a
    parsed name is structured input, and one type must not pretend
    to be both."""

    table: StructuredIdentifier
    column: str


@dataclass(frozen=True)
class ParsedTableColumnJoin:
    """A join comparison between parsed table columns, keyed by
    structured identity on both sides. The stage rewrites each side
    to its bound catalog FQN to produce a :class:`TableColumnJoin`."""

    table_column: ParsedTableColumn
    joined_with: tuple[ParsedTableColumn, ...] = ()


def _run_with_timeout(func: Callable[[], T], timeout_seconds: float) -> T:
    """Run ``func`` with a wall-clock budget, raising TimeoutError past it.

    A thread pool is the only portable timeout for CPU-bound parsing:
    signals only fire on the main thread, and parsers run on worker
    threads. A timed-out attempt keeps running in the background until
    it finishes; its result is discarded, which is exactly the
    fall-through semantics the cascade needs. A non-positive budget
    disables the timeout — a zero budget would otherwise fail every
    attempt before it starts.
    """
    if timeout_seconds is None or timeout_seconds <= 0:
        return func()
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func)
    try:
        result = future.result(timeout=timeout_seconds)
    except FutureTimeoutError as exc:
        # Do NOT wait for the runaway parse: shutting down with wait
        # would block until it finishes, defeating the timeout. The
        # thread is abandoned and its result discarded.
        executor.shutdown(wait=False, cancel_futures=True)
        raise TimeoutError(
            f"parsing exceeded the {timeout_seconds}s budget"
        ) from exc
    executor.shutdown(wait=True)
    return result


# Branch extractors owned by other leaves, mounted lazily by module
# path so this module never imports a module that does not exist yet:
# an absent branch module means that winner yields no names
# (fail-closed), never an import crash at parser construction time.
# The module paths and function names are frozen by the D-L2c
# interface contract (IMPL-DL2C-CONTRACT.md §b).
_OPTIONAL_EXTRACTOR_MODULES: tuple[tuple[str, str, str], ...] = (
    (
        PARSER_SQLFLUFF,
        "smartmetadata_ingestion.lineage.sqlfluff_extract",
        "extract_sqlfluff_names",
    ),
    (
        PARSER_SQLPARSE,
        "smartmetadata_ingestion.lineage.sqlparse_extract",
        "extract_sqlparse_names",
    ),
)

_extractors_registered = False


def _ensure_extractors_registered() -> None:
    """Mount every available branch extractor exactly once.
    Registration is idempotent, so a repeated call (or a race between
    worker threads) only rewrites the same entries. A branch module
    that exists but exposes no extractor function is logged and
    skipped: the branch then yields no names, which is the
    fail-closed outcome, made visible instead of silent."""
    global _extractors_registered
    if _extractors_registered:
        return
    register_extractor(PARSER_SQLGLOT, extract_sqlglot_names)
    for branch, module_name, func_name in _OPTIONAL_EXTRACTOR_MODULES:
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            continue
        extractor = getattr(module, func_name, None)
        if extractor is None:
            logger.warning(
                "branch extractor module %s exposes no %s; %s names will not bind",
                module_name,
                func_name,
                branch,
            )
            continue
        register_extractor(branch, extractor)
    _extractors_registered = True


class LineageParser:
    """Parse one query through the analyzer cascade.

    Construction runs the cascade eagerly: the winner (or its absence)
    is known immediately, and the parsed views below read cached
    results. Parsing never raises for a bad query — the views degrade
    to empty and the failures are recorded.
    """

    def __init__(
        self,
        query: str | None,
        dialect: Dialect = Dialect.ANSI,
        timeout_seconds: float = LINEAGE_PARSING_TIMEOUT,
        parser_type: QueryParserType = QueryParserType.AUTO,
    ) -> None:
        self.query = query or ""
        self.dialect = dialect if isinstance(dialect, Dialect) else Dialect(dialect)
        self.timeout_seconds = timeout_seconds
        self.parser_type = (
            parser_type
            if isinstance(parser_type, QueryParserType)
            else QueryParserType(parser_type)
        )
        self._clean_query = clean_raw_query(query)
        self._parse_text = self._clean_query
        if self.dialect is Dialect.TSQL and self._clean_query:
            self._parse_text = rewrite_switch_statements(self._clean_query)
        self._query_hash = query_hash_of(query)
        self._failures: list[QueryParsingError] = []
        self._runner: LineageRunner | None = None
        self._parser_name: str | None = None
        self._joins: dict[StructuredIdentifier, list[ParsedTableColumnJoin]] | None = None
        self._extraction: ExtractionResult | None = None
        self._associations: tuple[EndpointAssociation, ...] | None = None
        if self._parse_text:
            self._evaluate()
        try:
            self._masked_query = mask_query(self._parse_text, self.dialect)
        except Exception:
            logger.debug("masking failed; keeping clean query", exc_info=True)
            self._masked_query = self._parse_text

    @property
    def clean_query(self) -> str:
        return self._clean_query

    @property
    def query_hash(self) -> str:
        """First 8 hex chars of the MD5 of the raw query."""
        return self._query_hash

    @property
    def parser_name(self) -> str | None:
        """The winning analyzer's name, or None when all attempts failed."""
        return self._parser_name

    @property
    def suffixed_query_hash(self) -> str:
        """The query hash suffixed with the winning parser's name
        (``<md5-8>-SqlGlot``); the bare hash when no parser won."""
        if self._parser_name is None:
            return self._query_hash
        return f"{self._query_hash}-{self._parser_name}"

    @property
    def masked_query(self) -> str:
        """The parsed query text with literals masked; the clean query
        when masking fails. For T-SQL this is the post-rewrite text —
        the text the parser actually saw."""
        return self._masked_query

    @property
    def failures(self) -> list[QueryParsingError]:
        """This query's failed cascade attempts, in attempt order."""
        return list(self._failures)

    @property
    def source_tables(self) -> list[Table]:
        return list(self._runner.source_tables) if self._runner else []

    @property
    def target_tables(self) -> list[Table]:
        return list(self._runner.target_tables) if self._runner else []

    @property
    def intermediate_tables(self) -> list[Table]:
        return list(self._runner.intermediate_tables) if self._runner else []

    @property
    def involved_tables(self) -> list[Table]:
        """Source + intermediate + target tables, deduplicated by rendered name.

        Targets count as involved: a write-only query (``INSERT ...
        VALUES``, ``CREATE TABLE``) touches its target, and usage
        must count it. Callers that need sources only must use
        ``source_tables``/``intermediate_tables`` directly, not this
        view — it is the "touched tables" set, not the "read from"
        set."""
        by_name: dict[str, Table] = {}
        for table in self.source_tables:
            by_name.setdefault(str(table), table)
        for table in self.intermediate_tables:
            by_name.setdefault(str(table), table)
        for table in self.target_tables:
            by_name.setdefault(str(table), table)
        return [by_name[name] for name in sorted(by_name)]

    @property
    def clean_table_list(self) -> list[str]:
        """Deduped, cleaned names of every table the query touches.
        DISPLAY ONLY — binding must use ``structured_extraction``:
        these strings have already lost the segment and quoting
        information binding needs.

        The involved set already includes targets, so a query that
        only writes (or a CTAS target) still counts its target, and
        the usage stage counts every touched table. Sorted for
        determinism.
        """
        names = {clean_table_name(table) for table in self.involved_tables}
        return sorted(names)

    @property
    def column_lineage(self) -> list[tuple[Column, ...]]:
        """Column-level paths from source to target columns, one tuple
        per path (usually a source/target pair; longer for multi-hop
        paths through intermediate queries)."""
        if not self._runner:
            return []
        return list(self._runner.get_column_lineage())

    @property
    def table_aliases(self) -> dict[StructuredIdentifier, Table]:
        """Qualifier → table, keyed by structured identifiers: the
        table's confirmed structured identifier, plus single-segment
        keys for its alias text and leaf name so unqualified
        qualifiers resolve too. Alias and leaf keys carry
        ``quoted=False`` — the runner preserves no quoting for them —
        and qualifier comparison against these keys must go through
        the structured comparison (folding included) in
        ``lineage.folding``, never through string equality. First
        table wins on a colliding key: an ambiguous qualifier cannot
        be resolved reliably, and silently picking the last would
        hide it. A table whose association is unconfirmed contributes
        no identifier key: its qualifier must not resolve to a name
        that was never proven to be its own."""
        aliases: dict[StructuredIdentifier, Table] = {}
        associations = {
            id(table): association
            for table, association in zip(
                self.involved_tables, self.endpoint_associations, strict=True
            )
        }
        for table in self.involved_tables + self.target_tables:
            keys: list[StructuredIdentifier] = []
            alias = getattr(table, "alias", None)
            if alias:
                key = _structured_key(alias)
                if key is not None:
                    keys.append(key)
            association = associations.get(id(table))
            if association is not None and association.identifier is not None:
                keys.append(association.identifier)
            raw_name = getattr(table, "raw_name", None)
            if raw_name:
                key = _structured_key(raw_name)
                if key is not None:
                    keys.append(key)
            for key in keys:
                aliases.setdefault(key, table)
        return aliases

    @property
    def structured_extraction(self) -> ExtractionResult:
        """The winning branch's names as structured identifiers, with
        per-name fidelity marks. Computed lazily: extraction
        re-parses the query, and not every consumer needs names. The
        extraction runs on the exact text the winner parsed
        (``_parse_text``, post-T-SQL-rewrite) under the same timeout
        budget; a timeout or an extractor without a registered
        branch yields a failed result, never guessed names. A query
        no parser accepted yields an empty, non-failed result: there
        was nothing to extract, which the parse-failure collection
        already records, and it must not double-count as a fidelity
        skip."""
        if self._extraction is None:
            self._extraction = self._extract_structured()
        return self._extraction

    def _extract_structured(self) -> ExtractionResult:
        if self._parser_name is None or not self._parse_text:
            return ExtractionResult(branch=self._parser_name or "")
        _ensure_extractors_registered()
        try:
            return _run_with_timeout(
                lambda: extract_names(self._parser_name, self._parse_text, self.dialect),
                self.timeout_seconds,
            )
        except TimeoutError:
            return ExtractionResult(
                branch=self._parser_name,
                failed=True,
                failure_reason=ExtractionFailureReason.TIMEOUT,
            )
        except Exception:
            # The dispatcher already converts extractor failures to
            # failed results; this guards the timeout wrapper itself.
            logger.debug(
                "structured extraction failed for query %s", self._query_hash, exc_info=True
            )
            return ExtractionResult(
                branch=self._parser_name,
                failed=True,
                failure_reason=ExtractionFailureReason.EXTRACTOR_ERROR,
            )

    @property
    def endpoint_associations(self) -> tuple[EndpointAssociation, ...]:
        """Association verdicts for ``involved_tables``, in the same
        order: the structured identifier confirmed for each runner
        endpoint, or the reason confirmation failed. Association is
        by structural identity only — occurrence order is never
        consulted — so a verdict of unconfirmed means the endpoint's
        columns and edges must be skipped, not guessed."""
        if self._associations is None:
            self._associations = associate_endpoints(
                self._endpoint_descriptors(), self.structured_extraction.names
            )
        return self._associations

    def association_for(self, table: Table) -> EndpointAssociation | None:
        """The association verdict for one runner table object:
        identity first (column parents are the same objects the
        views yield), falling back to the rendered name when the
        object is a twin from another view. The fallback only locates
        the verdict — the verdict itself was confirmed structurally,
        and involved tables are deduplicated by rendered name, so
        the fallback cannot land on a different table. None when the
        table is not among the involved tables at all."""
        involved = self.involved_tables
        associations = self.endpoint_associations
        for index, candidate in enumerate(involved):
            if candidate is table:
                return associations[index]
        rendered = str(table)
        for index, candidate in enumerate(involved):
            if str(candidate) == rendered:
                return associations[index]
        return None

    def _endpoint_descriptors(self) -> list[EndpointDescriptor]:
        """Runner endpoints reduced to their lossy observables. Roles
        are grouped by rendered name: involved tables deduplicate by
        name, so the kept object's roles are the union over every
        view entry sharing its name (a table both read and written
        is both source and target). A placeholder schema renders as
        no schema; a schema-less path object renders its path as its
        raw name, which no extracted name can match, so it stays
        unconfirmed.

        The runner's intermediate view is not the extraction's
        INTERMEDIATE role: the runner lists a table there when one
        statement writes it and a later statement reads it (a
        temporary staging table), while INTERMEDIATE on the
        extraction side means a CTE reference — and CTE references
        never appear in any runner view (a CTE query's intermediate
        view is empty; the CTE name exists only on the extraction
        side). A runner-intermediate table is therefore both written
        and read by definition, so the view contributes both the
        SOURCE and TARGET roles; mapping it to INTERMEDIATE would
        match no extracted occurrence at all, since association
        never considers INTERMEDIATE occurrences as candidates."""
        role_views = (
            (frozenset({NameRole.SOURCE}), self.source_tables),
            (
                frozenset({NameRole.SOURCE, NameRole.TARGET}),
                self.intermediate_tables,
            ),
            (frozenset({NameRole.TARGET}), self.target_tables),
        )
        roles_by_name: dict[str, set[NameRole]] = {}
        for roles, tables in role_views:
            for table in tables:
                roles_by_name.setdefault(str(table), set()).update(roles)
        descriptors: list[EndpointDescriptor] = []
        for table in self.involved_tables:
            schema = getattr(table, "schema", None)
            schema_name = schema.raw_name if schema is not None and bool(schema) else None
            descriptors.append(
                EndpointDescriptor(
                    raw_name=getattr(table, "raw_name", None) or str(table),
                    schema_name=schema_name or None,
                    alias=getattr(table, "alias", None) or None,
                    roles=frozenset(roles_by_name.get(str(table), ())),
                )
            )
        return descriptors

    @property
    def table_joins(self) -> dict[StructuredIdentifier, list[ParsedTableColumnJoin]]:
        """Per-table join comparisons, keyed by structured identifier.

        Derived from equality comparisons between qualified columns of
        different tables in the parsed statements (JOIN … ON and WHERE
        alike — both express the same join). Pairs whose qualifier does
        not resolve to exactly one parsed table are skipped, never
        guessed. Joins are enrichment: extraction failure yields no joins, never a
        failed parse.
        """
        if self._joins is None:
            self._joins = self._extract_joins()
        return self._joins

    def _evaluate(self) -> None:
        attempts = self._attempt_order()
        for parser_name, build in attempts:
            try:
                runner = _run_with_timeout(build, self.timeout_seconds)
            except Exception as exc:
                self._record_failure(parser_name, exc)
                continue
            self._runner = runner
            self._parser_name = parser_name
            return
        if self._failures:
            logger.debug(
                "no parser accepted query %s: %s",
                self._query_hash,
                "; ".join(f"{f.parser}: {f.reason}" for f in self._failures),
            )

    def _attempt_order(self) -> list[tuple[str, Callable[[], LineageRunner]]]:
        """Enabled analyzers in cascade order. SqlParse is always last,
        in every mode — it is the universal fallback, not a choice."""
        order: list[tuple[str, Callable[[], LineageRunner]]] = []
        if self.parser_type in (QueryParserType.AUTO, QueryParserType.SQLGLOT):
            order.append((PARSER_SQLGLOT, self._build_sqlglot))
        if self.parser_type in (QueryParserType.AUTO, QueryParserType.SQLFLUFF):
            order.append((PARSER_SQLFLUFF, self._build_sqlfluff))
        order.append((PARSER_SQLPARSE, self._build_sqlparse))
        return order

    def _build_sqlglot(self) -> LineageRunner:
        return self._build_runner(SqlGlotLineageAnalyzer, self.dialect.value)

    def _build_sqlfluff(self) -> LineageRunner:
        return self._build_runner(SqlFluffLineageAnalyzer, self.dialect.value)

    def _build_sqlparse(self) -> LineageRunner:
        # SqlParse takes no dialect: the library's non-validating
        # dialect marker selects its analyzer. Its deprecation warning
        # is suppressed — the fallback is specified, not deprecated use.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            return self._build_runner(SqlParseLineageAnalyzer, SQLPARSE_DIALECT)

    def _build_runner(self, analyzer, dialect_name: str) -> LineageRunner:
        runner = LineageRunner(
            self._parse_text, dialect=dialect_name, analyzer=analyzer
        )
        # Force evaluation: construction is lazy, so a candidate only
        # counts as parsed when table enumeration and column lineage
        # both succeed. Any failure here falls through to the next
        # analyzer instead of surfacing as a half-parsed winner.
        _ = runner.source_tables
        _ = runner.target_tables
        _ = runner.intermediate_tables
        _ = runner.get_column_lineage()
        return runner

    def _record_failure(self, parser_name: str, exc: BaseException) -> None:
        error = QueryParsingError(
            query_hash=self._query_hash,
            parser=parser_name,
            reason=str(exc)[:500],
        )
        self._failures.append(error)
        query_parsing_failures().record(error)

    def _extract_joins(self) -> dict[StructuredIdentifier, list[ParsedTableColumnJoin]]:
        if not self._runner or not self._parse_text:
            return {}
        try:
            return _extract_table_joins(self._parse_text, self.dialect)
        except Exception:
            logger.debug("join extraction failed for query %s", self._query_hash, exc_info=True)
            return {}


def _structured_key(text: str) -> StructuredIdentifier | None:
    """A single-segment structured key for alias/leaf text, or None
    when the text cannot be a segment (empty, or the unquoted
    placeholder, which is not a name)."""
    try:
        return StructuredIdentifier.single(text)
    except ValueError:
        return None


def _structured_qualifier_map(
    names: tuple[ExtractedName, ...],
) -> dict[str, StructuredIdentifier]:
    """Lowercased qualifier text → structured identifier, for join
    resolution. Qualifiers in SQL are case-insensitive for unquoted
    names, so the map is keyed lowercase; a qualifier text resolving
    to two distinct identifiers is dropped entirely — an ambiguous
    qualifier resolves to nothing, and the pair is skipped rather
    than guessed. Only binding candidates contribute keys: an
    INTERMEDIATE (CTE) occurrence names no catalog table and must
    never resolve a qualifier. Function occurrences are retained
    deliberately — a qualifier can only match a leaf or alias text,
    so a function name in the map resolves exactly the qualifiers
    that spell it, which is harmless for qualifier resolution."""
    by_text: dict[str, set[StructuredIdentifier]] = {}
    for name in names:
        if not name.is_binding_candidate or name.identifier is None:
            continue
        texts = {name.identifier.leaf.text, name.identifier.display()}
        if name.alias:
            texts.add(name.alias)
        for text in texts:
            by_text.setdefault(text.lower(), set()).add(name.identifier)
    return {
        text: next(iter(identifiers))
        for text, identifiers in by_text.items()
        if len(identifiers) == 1
    }


def _extract_table_joins(
    parse_text: str, dialect: Dialect
) -> dict[StructuredIdentifier, list[ParsedTableColumnJoin]]:
    """Equality join pairs from the query's sqlglot AST, keyed by
    structured identifier.

    sqlglot is the only analyzer whose AST exposes join predicates
    directly, so joins are derived from a fresh sqlglot parse rather
    than the winning runner: when sqlglot cannot parse the dialect or
    the statement, there are simply no joins. The re-parse uses the
    winner's effective dialect — the same mapping the extraction
    uses — so a dialect the winner parses yields joins too, under
    the same dialect and the same cleaned SQL. Qualifiers resolve
    through the same extraction's names, so a join pair is only built
    when both qualifiers pin exactly one parsed table each. The
    extraction never raises — callers treat joins as enrichment.
    """
    extraction = extract_sqlglot_names(parse_text, dialect)
    if extraction.failed:
        return {}
    qualifier_map = _structured_qualifier_map(extraction.names)
    try:
        expressions = sqlglot.parse(
            parse_text, read=effective_sqlglot_dialect(dialect)
        )
    except Exception:
        return {}
    pairs: set[tuple[StructuredIdentifier, str, StructuredIdentifier, str]] = set()
    for expression in expressions:
        if expression is None:
            continue
        for equals in expression.find_all(exp.EQ):
            left = equals.args.get("this")
            right = equals.args.get("expression")
            if not isinstance(left, exp.Column) or not isinstance(right, exp.Column):
                continue
            left_qualifier = left.table.lower()
            right_qualifier = right.table.lower()
            if not left_qualifier or not right_qualifier:
                continue
            if left_qualifier == right_qualifier:
                continue
            left_table = qualifier_map.get(left_qualifier)
            right_table = qualifier_map.get(right_qualifier)
            if left_table is None or right_table is None:
                continue
            pair = (left_table, left.name, right_table, right.name)
            mirrored = (right_table, right.name, left_table, left.name)
            pairs.add(min(pair, mirrored, key=_join_pair_key))
    joins: dict[StructuredIdentifier, dict[str, set[tuple[StructuredIdentifier, str]]]] = {}
    for left_table, left_column, right_table, right_column in sorted(
        pairs, key=_join_pair_key
    ):
        joins.setdefault(left_table, {}).setdefault(left_column, set()).add(
            (right_table, right_column)
        )
        joins.setdefault(right_table, {}).setdefault(right_column, set()).add(
            (left_table, left_column)
        )
    result: dict[StructuredIdentifier, list[ParsedTableColumnJoin]] = {}
    for table in sorted(joins, key=lambda identifier: identifier.texts):
        entries = []
        for column in sorted(joins[table]):
            joined = tuple(
                ParsedTableColumn(table=partner_table, column=partner_column)
                for partner_table, partner_column in sorted(
                    joins[table][column], key=lambda ref: (ref[0].texts, ref[1])
                )
            )
            entries.append(
                ParsedTableColumnJoin(
                    table_column=ParsedTableColumn(table=table, column=column),
                    joined_with=joined,
                )
            )
        result[table] = entries
    return result


def _join_pair_key(
    pair: tuple[StructuredIdentifier, str, StructuredIdentifier, str],
) -> tuple[tuple[str, ...], str, tuple[str, ...], str]:
    """A join pair's sort key. Identifiers carry no ordering of their
    own (identity is not order), so pairs sort on segment texts."""
    left_table, left_column, right_table, right_column = pair
    return (left_table.texts, left_column, right_table.texts, right_column)
