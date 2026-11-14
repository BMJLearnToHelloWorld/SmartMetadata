# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Temp-table lineage graphs (design §3.7).

When ``enableTempTableLineage`` is set, hops through tables no
catalog entity binds to accumulate in a ``networkx`` directed graph
instead of being dropped: one query writes a temp table, a later
query reads it, and only the graph connects the two. Flushing
eliminates the temp nodes one by one, composing the hops on either
side into direct edges between catalog tables, chaining column
pairs through the temp table's columns. A hop whose endpoints never
both resolve to catalog tables yields no edge — temp tables are a
transit mechanism, never lineage endpoints themselves.

Column pairs chain on exact reference equality
(``temp_table.column``): a pair survives elimination only when the
outgoing hop consumes the exact column the incoming hop produced.
Hops with no chainable pairs still compose into a table-level edge
— the columns through the temp table are unknown, not absent.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx


@dataclass(frozen=True)
class TempHop:
    """One hop through (or into/out of) a temp table.

    ``from_key``/``to_key`` are catalog FQNs for bound tables and
    raw parsed names for temp tables; ``bound`` flags say which.
    ``columns`` are (from-column-ref, to-column-ref) pairs, each ref
    spelled ``<table-key>.<column>``. ``sql_query`` is the query
    that produced the hop — a composed edge carries the last hop's
    text, the query that wrote the final target.
    """

    from_key: str
    to_key: str
    columns: tuple[tuple[str, str], ...] = ()
    sql_query: str | None = None
    from_bound: bool = False
    to_bound: bool = False


@dataclass
class ComposedEdge:
    """A flushed edge between two catalog tables."""

    from_fqn: str
    to_fqn: str
    columns: list[tuple[str, str]] = field(default_factory=list)
    sql_query: str | None = None


def _chain_columns(
    incoming: tuple[tuple[str, str], ...],
    outgoing: tuple[tuple[str, str], ...],
) -> list[tuple[str, str]]:
    """Column pairs surviving elimination of the middle table: an
    incoming pair (a, temp.x) chains with an outgoing pair
    (temp.x, b) into (a, b). Pairs with no counterpart on the other
    side do not survive — their columns do not flow through."""
    outgoing_by_source = dict(outgoing)
    chained: list[tuple[str, str]] = []
    for source_ref, temp_ref in incoming:
        target_ref = outgoing_by_source.get(temp_ref)
        if target_ref is not None:
            chained.append((source_ref, target_ref))
    return chained


class TempTableGraph:
    """Accumulated temp-table hops, flushed to catalog-table edges."""

    def __init__(self) -> None:
        self._graph: nx.DiGraph = nx.DiGraph()

    def __len__(self) -> int:
        return self._graph.number_of_edges()

    def add(self, hop: TempHop) -> None:
        """Record one hop. A node seen bound once stays bound: the
        same name cannot be both a catalog table and a temp table
        within a run, and binding is the stronger claim."""
        graph = self._graph
        for key, bound in ((hop.from_key, hop.from_bound), (hop.to_key, hop.to_bound)):
            if key not in graph:
                graph.add_node(key, bound=bound)
            elif bound:
                graph.nodes[key]["bound"] = True
        if hop.from_key == hop.to_key:
            return
        existing = graph.get_edge_data(hop.from_key, hop.to_key, default=None)
        if existing is None:
            graph.add_edge(
                hop.from_key,
                hop.to_key,
                columns=list(hop.columns),
                sql_query=hop.sql_query,
            )
            return
        merged = list(dict.fromkeys([*existing["columns"], *hop.columns]))
        existing["columns"] = merged
        if hop.sql_query:
            existing["sql_query"] = hop.sql_query

    def flush(self) -> list[ComposedEdge]:
        """Eliminate temp nodes and return the composed edges.

        Each temp node is removed after composing every
        (incoming, outgoing) hop pair through it; bound-to-bound
        edges already in the graph pass through unchanged. The
        graph is emptied by flushing — a second flush yields
        nothing."""
        graph = self._graph
        temp_nodes = [node for node, bound in graph.nodes(data="bound") if not bound]
        for temp in temp_nodes:
            if temp not in graph:
                continue
            incoming = [
                (source, dict(data)) for source, _, data in graph.in_edges(temp, data=True)
            ]
            outgoing = [
                (target, dict(data)) for _, target, data in graph.out_edges(temp, data=True)
            ]
            for source, in_data in incoming:
                for target, out_data in outgoing:
                    if source == target:
                        continue
                    composed_columns = _chain_columns(
                        tuple(in_data["columns"]), tuple(out_data["columns"])
                    )
                    self._merge_composed(
                        source, target, composed_columns, out_data["sql_query"]
                    )
            graph.remove_node(temp)
        edges = [
            ComposedEdge(
                from_fqn=source,
                to_fqn=target,
                columns=list(data["columns"]),
                sql_query=data["sql_query"],
            )
            for source, target, data in graph.edges(data=True)
            if source != target
        ]
        graph.clear()
        return edges

    def _merge_composed(
        self,
        source: str,
        target: str,
        columns: list[tuple[str, str]],
        sql_query: str | None,
    ) -> None:
        """Add a composed edge, merging with any existing edge
        between the same pair (column pairs union, latest SQL wins)."""
        existing = self._graph.get_edge_data(source, target, default=None)
        if existing is None:
            self._graph.add_edge(source, target, columns=list(columns), sql_query=sql_query)
            return
        merged = list(dict.fromkeys([*existing["columns"], *columns]))
        existing["columns"] = merged
        if sql_query:
            existing["sql_query"] = sql_query
