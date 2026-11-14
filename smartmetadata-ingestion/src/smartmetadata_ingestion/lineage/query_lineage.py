# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Query lineage processing: parse → resolve → edges + Query entity.

One parsed query (or view definition, or procedure-body query)
becomes table edges carrying column lineage, plus — for the query
channel — a ``QueryRecord`` marking the query processed. The
behavioral contract is design §3.7's ``get_lineage_by_query``
equivalent, written fresh from the spec:

- sources, intermediates, and targets resolve against catalog
  entities through the lineage binding resolver; unresolvable
  names are skipped with a warning, never invented — unless temp
  table lineage is enabled, in which case hops through them go to
  the temp-table graph;
- column lineage is first-class: every column path the parser
  reports contributes a ``fromColumns → toColumn`` mapping on its
  edge, with column names validated against the catalog;
- a query with no involved tables contributes nothing; a query
  whose targets bind to nothing contributes no Query entity, so a
  later run — after the catalog catches up — can still process it;
- incremental re-runs skip queries whose Query entity already
  reports ``processedLineage`` and whose every edge is still
  intact (the REST adaptation of the pin's checksum skip, D-C8
  item 1 — verified against the server API: Query entities carry
  ``processedLineage`` and are addressable by the MD5 checksum of
  the stored text, and lineage reads return the edge graph).

Edge ``sqlQuery`` carries the MASKED query text (literals replaced
with ``?``): stored lineage must not leak query-log values. The raw
text is used only for the incremental checksum and the Query entity
itself. Temp-hop SQL is masked the same way — hops become edges.

Edges come from the parser's column paths, not from a cartesian
product of the query's tables: consecutive path pairs are the hops,
endpoint pairs are the direct edges, and only a query with no
column paths at all falls back to source × target pairing (the
parser gives no finer structure to partition such a query with).
Function-call pseudo-columns (``FN(args)`` with no output alias or
column list) contribute no column mapping — no catalog column can
be named for them — but the function name is resolved as a UDF and
its body, when cataloged, is parsed once for additional edges
(D-C8 item 2).

The pin's ``_replace_target_table`` mechanism (rewriting a view
definition's target table in place) is deliberately omitted: the
view outcome it exists to produce — edges landing on the enumerated
view — is already covered by ``target_override_fqn``, which pins
every target binding to the enumerated view. No separate
replacement step is needed, and inventing one would only add a
second way to rewrite edges.
"""

from __future__ import annotations

import hashlib
import logging
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.graphs import TempHop
from smartmetadata_ingestion.lineage.parser import (
    LINEAGE_PARSING_TIMEOUT,
    LineageParser,
    QueryParserType,
    clean_table_name,
)
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.records import ColumnLineage, QueryRecord

logger = logging.getLogger(__name__)

# A column path element shaped like a function call: the parser
# bakes the call into the target column name when neither an alias
# nor an INSERT column list names the output column.
_FUNCTION_COLUMN = re.compile(r"\A([A-Za-z_][\w$]*)\s*\(")

# UDF bodies are parsed at most one level deep: a UDF calling
# another UDF does not recurse, so a cyclic catalog cannot loop the
# run.
MAX_UDF_EXPANSION_DEPTH = 1

# Incremental decisions cached per run, misses included: the same
# query text repeats across log batches, and each decision costs a
# Query read plus a lineage read.
MAX_CACHED_INCREMENTAL_DECISIONS = 1000


def pairs_to_column_lineage(
    pairs: list[tuple[str, str]],
) -> list[ColumnLineage]:
    """Column pairs → ``ColumnLineage`` entries, grouped by target
    column so several source columns feeding one target become one
    entry with several ``fromColumns``. Order is deterministic:
    targets sorted, sources in first-seen order."""
    grouped: dict[str, list[str]] = {}
    for from_column, to_column in pairs:
        targets = grouped.setdefault(to_column, [])
        if from_column not in targets:
            targets.append(from_column)
    return [
        ColumnLineage(from_columns=grouped[to_column], to_column=to_column)
        for to_column in sorted(grouped)
    ]


def _fqn_service(fqn: str) -> str:
    """The service segment of an FQN, respecting quoted parts."""
    if fqn.startswith('"'):
        end = fqn.find('"', 1)
        return fqn[1:end] if end > 0 else fqn
    return fqn.split(".", 1)[0]


def _analysis_date_ms(analysis_date: str | None) -> int | None:
    """An ISO analysis timestamp as epoch milliseconds, or ``None``
    when absent/unparseable (the sink then omits ``queryDate``)."""
    if not analysis_date:
        return None
    try:
        parsed = datetime.fromisoformat(analysis_date.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


@dataclass
class LineageEdge:
    """One resolved edge, before record assembly."""

    from_fqn: str
    to_fqn: str
    columns: list[ColumnLineage] = field(default_factory=list)
    sql_query: str | None = None
    cross_database: bool = False


@dataclass
class ProcessedQuery:
    """The outcome of processing one SQL text."""

    edges: list[LineageEdge] = field(default_factory=list)
    temp_hops: list[TempHop] = field(default_factory=list)
    query_record: QueryRecord | None = None
    parsed: bool = False
    skipped_incremental: bool = False
    unbound_tables: list[str] = field(default_factory=list)
    udf_expansions: int = 0
    masked_query: str = ""


class IncrementalChecker:
    """Already-processed detection via REST (D-C8 item 1).

    A query is skipped only when BOTH hold: its Query entity (found
    by the MD5 checksum of the stored text) reports
    ``processedLineage``, AND every expected edge is still present
    in its target's lineage graph. Either check failing means the
    query is processed again — re-PUTting intact edges is harmless,
    while skipping a query whose edges were deleted would lose
    lineage silently.
    """

    def __init__(self, client: RestClient) -> None:
        self._client = client
        self._decisions: OrderedDict[str, bool] = OrderedDict()

    def lookup_processed(self, query_text: str) -> bool:
        """Whether the Query entity for this text reports lineage
        already processed. A missing entity, or one without the
        flag, means "not processed". Other REST errors propagate."""
        query_hash = hashlib.md5(query_text.encode("utf-8")).hexdigest()
        try:
            entity = self._client.get_query_by_name(query_hash)
        except RestError as exc:
            if exc.status_code == 404:
                return False
            raise
        return bool(entity.get("processedLineage"))

    def edges_intact(self, query_text: str, edges: list[LineageEdge]) -> bool:
        """Whether EVERY expected edge is still present in the
        catalog's lineage graphs for its target table. One graph
        fetch per distinct target FQN; cached per query text: the
        same query repeats in a log, and the graph does not change
        underneath a single run's reads."""
        if not edges:
            return True
        query_hash = hashlib.md5(query_text.encode("utf-8")).hexdigest()
        cached = self._decisions.get(query_hash)
        if cached is not None:
            return cached
        graphs: dict[str, dict[str, Any] | None] = {}
        intact = True
        for edge in edges:
            if edge.to_fqn not in graphs:
                graphs[edge.to_fqn] = self._fetch_graph(edge.to_fqn)
            if not self._edge_present_in(edge, graphs[edge.to_fqn]):
                intact = False
                break
        self._decisions[query_hash] = intact
        while len(self._decisions) > MAX_CACHED_INCREMENTAL_DECISIONS:
            self._decisions.popitem(last=False)
        return intact

    def _fetch_graph(self, to_fqn: str) -> dict[str, Any] | None:
        """The upstream graph for one target table, or ``None`` when
        the table has no lineage graph (404). Other REST errors
        propagate: absence is data, failure is failure."""
        try:
            return self._client.get_lineage_by_name(
                "table", to_fqn, upstream_depth=1, downstream_depth=0
            )
        except RestError as exc:
            if exc.status_code == 404:
                return None
            raise

    def _edge_present_in(self, edge: LineageEdge, graph: dict[str, Any] | None) -> bool:
        if graph is None:
            return False
        entity = graph.get("entity") or {}
        nodes = graph.get("nodes") or []
        id_by_fqn = {
            str(node.get("fullyQualifiedName")): str(node.get("id"))
            for node in nodes
            if isinstance(node, dict) and node.get("fullyQualifiedName") and node.get("id")
        }
        target_id = str(entity.get("id", ""))
        source_id = id_by_fqn.get(edge.from_fqn)
        if not target_id or source_id is None:
            return False
        for upstream in graph.get("upstreamEdges") or []:
            if not isinstance(upstream, dict):
                continue
            if str(upstream.get("fromEntity")) == source_id and str(
                upstream.get("toEntity")
            ) == target_id:
                return True
        return False


class QueryLineageProcessor:
    """Parse one SQL text into resolved edges (+ optional Query entity)."""

    def __init__(
        self,
        resolver: LineageBindingResolver,
        *,
        service_name: str,
        dialect: Dialect,
        timeout_seconds: float = LINEAGE_PARSING_TIMEOUT,
        parser_type: QueryParserType = QueryParserType.AUTO,
        enable_temp_table_lineage: bool = False,
        incremental_checker: IncrementalChecker | None = None,
    ) -> None:
        self._resolver = resolver
        self._service_name = service_name
        self._dialect = dialect
        self._timeout_seconds = timeout_seconds
        self._parser_type = parser_type
        self._temp_enabled = enable_temp_table_lineage
        self._checker = incremental_checker

    def process(
        self,
        sql_text: str,
        *,
        database_name: str | None = None,
        database_schema: str | None = None,
        emit_query_record: bool = False,
        incremental: bool = False,
        target_override_fqn: str | None = None,
        triggered_by_fqn: str | None = None,
        user_name: str | None = None,
        query_type: str | None = None,
        duration: float | None = None,
        analysis_date: str | None = None,
        exclude_usage: bool = False,
        _udf_depth: int = 0,
        _seen_udfs: set[str] | None = None,
    ) -> ProcessedQuery:
        """Process one SQL text. ``target_override_fqn`` pins the
        target (view channel: the enumerated view, whatever the
        definition names). ``incremental`` enables the
        already-processed skip, which needs the checker configured."""
        result = ProcessedQuery()
        seen_udfs = _seen_udfs if _seen_udfs is not None else set()
        already_processed = False
        if incremental and self._checker is not None:
            already_processed = self._checker.lookup_processed(sql_text)
        parser = LineageParser(
            sql_text,
            dialect=self._dialect,
            timeout_seconds=self._timeout_seconds,
            parser_type=self._parser_type,
        )
        # Edge SQL is the MASKED text; the raw text stays with the
        # incremental checksum and the Query entity only.
        edge_sql = parser.masked_query
        result.masked_query = edge_sql
        involved = parser.involved_tables
        targets = parser.target_tables
        if not involved and not targets:
            return result
        bindings = self._bind_tables(
            parser, database_name=database_name, database_schema=database_schema
        )
        if target_override_fqn is not None:
            for table in targets:
                bindings[clean_table_name(table)] = target_override_fqn
        result.unbound_tables = sorted(
            name for name, fqn in bindings.items() if fqn is None
        )
        result.parsed = True
        edge_pairs: dict[tuple[str, str], list[tuple[str, str]]] = {}
        hops: list[TempHop] = []
        paths = parser.column_lineage
        extra_edges: list[LineageEdge] = []
        extra_hops: list[TempHop] = []
        if paths:
            result.udf_expansions = self._process_paths(
                parser, bindings, edge_sql, edge_pairs, hops, _udf_depth, extra_edges,
                extra_hops, seen_udfs, database_name, database_schema,
            )
        else:
            self._process_cartesian(
                parser, bindings, target_override_fqn, edge_sql, edge_pairs, hops
            )
        for extra in extra_edges:
            key = (extra.from_fqn, extra.to_fqn)
            edge_pairs.setdefault(key, [])
            for column in extra.columns:
                for from_column in column.from_columns:
                    pair = (from_column, column.to_column)
                    if pair not in edge_pairs[key]:
                        edge_pairs[key].append(pair)
        hops.extend(extra_hops)
        result.temp_hops = hops
        result.edges = self._assemble_edges(edge_pairs, edge_sql)
        if already_processed and self._checker is not None:
            if not result.edges and not hops:
                result.skipped_incremental = True
                result.query_record = None
                return result
            if self._checker.edges_intact(sql_text, result.edges):
                result.skipped_incremental = True
                result.edges = []
                result.temp_hops = []
                result.query_record = None
                return result
        if emit_query_record and self._should_emit_record(
            parser, bindings, target_override_fqn, result
        ):
            result.query_record = QueryRecord(
                query=sql_text,
                service_name=self._service_name,
                dialect=self._dialect.value,
                query_type=query_type,
                duration=duration,
                query_date_ms=_analysis_date_ms(analysis_date),
                user_name=user_name,
                exclude_usage=exclude_usage,
                processed_lineage=True,
                triggered_by_fqn=triggered_by_fqn,
                table_fqns=sorted({fqn for fqn in bindings.values() if fqn}),
            )
        return result

    def _bind_tables(
        self,
        parser: LineageParser,
        *,
        database_name: str | None,
        database_schema: str | None,
    ) -> dict[str, str | None]:
        bindings: dict[str, str | None] = {}
        for name in parser.clean_table_list:
            bindings[name] = self._resolver.resolve_table(
                name,
                database_name=database_name,
                database_schema=database_schema,
            )
        return bindings

    def _process_paths(
        self,
        parser: LineageParser,
        bindings: dict[str, str | None],
        edge_sql: str,
        edge_pairs: dict[tuple[str, str], list[tuple[str, str]]],
        hops: list[TempHop],
        udf_depth: int,
        extra_edges: list[LineageEdge],
        extra_hops: list[TempHop],
        seen_udfs: set[str],
        database_name: str | None,
        database_schema: str | None,
    ) -> int:
        """Process the parser's column paths; returns the number of
        UDF bodies that expanded into additional edges or hops."""
        expansions = 0
        for path in parser.column_lineage:
            if len(path) < 2:
                continue
            tables = [clean_table_name(column.parent) for column in path]
            columns = [column.raw_name for column in path]
            expansions += self._expand_udfs(
                columns, udf_depth, extra_edges, extra_hops, seen_udfs,
                database_name, database_schema,
            )
            for index in range(len(path) - 1):
                self._process_pair(
                    tables[index],
                    columns[index],
                    tables[index + 1],
                    columns[index + 1],
                    bindings,
                    edge_sql,
                    edge_pairs,
                    hops,
                    consecutive=True,
                )
            if len(path) > 2:
                self._process_pair(
                    tables[0],
                    columns[0],
                    tables[-1],
                    columns[-1],
                    bindings,
                    edge_sql,
                    edge_pairs,
                    hops,
                    consecutive=False,
                )
        return expansions

    def _process_pair(
        self,
        from_table: str,
        from_column: str,
        to_table: str,
        to_column: str,
        bindings: dict[str, str | None],
        edge_sql: str,
        edge_pairs: dict[tuple[str, str], list[tuple[str, str]]],
        hops: list[TempHop],
        *,
        consecutive: bool,
    ) -> None:
        """One (from, to) table pair from a column path: a direct
        edge when both sides bind, a temp hop when one side does
        not and temp lineage is enabled, dropped otherwise. An
        endpoint pair (non-consecutive) is only ever a direct edge:
        temp hops are consecutive by construction, and the graph
        composes them."""
        from_fqn = bindings.get(from_table)
        to_fqn = bindings.get(to_table)
        if from_fqn is not None and to_fqn is not None:
            if from_fqn == to_fqn:
                return
            key = (from_fqn, to_fqn)
            pair = self._column_pair(from_fqn, from_column, to_fqn, to_column)
            edge_pairs.setdefault(key, [])
            if pair is not None and pair not in edge_pairs[key]:
                edge_pairs[key].append(pair)
            return
        if not consecutive or not self._temp_enabled:
            return
        if from_table == to_table:
            return
        hop_pair = self._hop_pair(
            from_table, from_fqn, from_column, to_table, to_fqn, to_column
        )
        hops.append(
            TempHop(
                from_key=from_fqn or from_table,
                to_key=to_fqn or to_table,
                columns=(hop_pair,) if hop_pair is not None else (),
                sql_query=edge_sql,
                from_bound=from_fqn is not None,
                to_bound=to_fqn is not None,
            )
        )

    def _process_cartesian(
        self,
        parser: LineageParser,
        bindings: dict[str, str | None],
        target_override_fqn: str | None,
        edge_sql: str,
        edge_pairs: dict[tuple[str, str], list[tuple[str, str]]],
        hops: list[TempHop],
    ) -> None:
        """Source × target pairing for a query with no column paths.
        No column mappings exist to attach; the table edges still do.
        Sources are the source + intermediate tables only:
        ``involved_tables`` also carries targets, and pairing targets
        against targets would invent edges between written tables."""
        sources = []
        seen_sources: set[str] = set()
        for table in parser.source_tables + parser.intermediate_tables:
            name = clean_table_name(table)
            if name not in seen_sources:
                seen_sources.add(name)
                sources.append(name)
        target_names = [clean_table_name(table) for table in parser.target_tables]
        if target_override_fqn is not None and not target_names:
            target_names = ["__override__"]
            bindings["__override__"] = target_override_fqn
        for source_name in sources:
            source_fqn = bindings.get(source_name)
            for target_name in target_names:
                target_fqn = bindings.get(target_name)
                if source_fqn is not None and target_fqn is not None:
                    if source_fqn != target_fqn:
                        edge_pairs.setdefault((source_fqn, target_fqn), [])
                elif self._temp_enabled and source_name != target_name:
                    hops.append(
                        TempHop(
                            from_key=source_fqn or source_name,
                            to_key=target_fqn or target_name,
                            columns=(),
                            sql_query=edge_sql,
                            from_bound=source_fqn is not None,
                            to_bound=target_fqn is not None,
                        )
                    )

    def _column_pair(
        self,
        from_fqn: str,
        from_column: str,
        to_fqn: str,
        to_column: str,
    ) -> tuple[str, str] | None:
        """A validated column pair, or ``None`` when either end
        cannot name a catalog column: star columns, function-call
        pseudo-columns, and names the catalog contradicts."""
        if from_column in ("", "*") or to_column in ("", "*"):
            return None
        if "(" in from_column or "(" in to_column:
            return None
        from_ref = self._resolver.resolve_column(from_fqn, from_column)
        to_ref = self._resolver.resolve_column(to_fqn, to_column)
        if from_ref is None or to_ref is None:
            return None
        return (from_ref, to_ref)

    def _hop_pair(
        self,
        from_table: str,
        from_fqn: str | None,
        from_column: str,
        to_table: str,
        to_fqn: str | None,
        to_column: str,
    ) -> tuple[str, str] | None:
        """A hop's column pair, spelled for graph chaining: bound
        sides use catalog column FQNs, temp sides use
        ``<raw-name>.<column>`` so the hop that writes a temp table
        and the hop that reads it chain on identical spellings."""
        if from_column in ("", "*") or to_column in ("", "*"):
            return None
        if "(" in from_column or "(" in to_column:
            return None
        if from_fqn is not None:
            from_ref = self._resolver.resolve_column(from_fqn, from_column)
            if from_ref is None:
                return None
        else:
            from_ref = f"{from_table}.{from_column}"
        if to_fqn is not None:
            to_ref = self._resolver.resolve_column(to_fqn, to_column)
            if to_ref is None:
                return None
        else:
            to_ref = f"{to_table}.{to_column}"
        return (from_ref, to_ref)

    def _expand_udfs(
        self,
        columns: list[str],
        udf_depth: int,
        extra_edges: list[LineageEdge],
        extra_hops: list[TempHop],
        seen_udfs: set[str],
        database_name: str | None,
        database_schema: str | None,
    ) -> int:
        """Resolve function names in a column path as UDFs and parse
        cataloged bodies once for additional edges. The query's
        database/schema context threads through: a bare function
        name resolves in the query's schema, not the connection
        defaults alone. A body that is a scalar expression (no
        tables) adds nothing; a body that queries tables adds its
        edges to this query's result. Depth 0 only — nested UDF
        calls do not recurse. Returns the number of bodies that
        expanded into edges or hops."""
        if udf_depth >= MAX_UDF_EXPANSION_DEPTH:
            return 0
        names: list[str] = []
        for column in columns:
            match = _FUNCTION_COLUMN.match(column)
            if match and match.group(1) not in names and match.group(1) not in seen_udfs:
                names.append(match.group(1))
        if not names:
            return 0
        expansions = 0
        for name in names:
            seen_udfs.add(name)
            entity = self._resolver.resolve_udf(
                name, database_name=database_name, database_schema=database_schema
            )
            if entity is None:
                continue
            code = self._resolver.procedure_code(entity)
            if code is None:
                continue
            expanded = self.process(
                code,
                database_name=database_name,
                database_schema=database_schema,
                emit_query_record=False,
                incremental=False,
                _udf_depth=udf_depth + 1,
                _seen_udfs=seen_udfs,
            )
            if expanded.edges or expanded.temp_hops:
                expansions += 1
            extra_edges.extend(expanded.edges)
            extra_hops.extend(expanded.temp_hops)
        return expansions

    def _assemble_edges(
        self,
        edge_pairs: dict[tuple[str, str], list[tuple[str, str]]],
        sql_text: str,
    ) -> list[LineageEdge]:
        edges: list[LineageEdge] = []
        for (from_fqn, to_fqn), pairs in sorted(edge_pairs.items()):
            cross = (
                _fqn_service(from_fqn) != self._service_name
                or _fqn_service(to_fqn) != self._service_name
            )
            edges.append(
                LineageEdge(
                    from_fqn=from_fqn,
                    to_fqn=to_fqn,
                    columns=pairs_to_column_lineage(pairs),
                    sql_query=sql_text,
                    cross_database=cross,
                )
            )
        return edges

    @staticmethod
    def _should_emit_record(
        parser: LineageParser,
        bindings: dict[str, str | None],
        target_override_fqn: str | None,
        result: ProcessedQuery,
    ) -> bool:
        """Whether this query earns a Query entity: it produced
        edges or temp hops, or it is a target-less query (a plain
        SELECT) with at least one bound source. A query whose
        targets exist but bound to nothing earns none — a later run
        must still be able to process it."""
        if result.edges or result.temp_hops:
            return True
        if parser.target_tables or target_override_fqn is not None:
            return False
        return any(fqn is not None for fqn in bindings.values())
