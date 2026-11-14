# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Temp-table graph behavior: hops compose through temp nodes into
catalog-table edges, or drop when they lead nowhere bound."""

from __future__ import annotations

from smartmetadata_ingestion.lineage.graphs import ComposedEdge, TempHop, TempTableGraph

SRC = "svc.db.public.source"
TGT = "svc.db.public.target"
TMP = "tmp_stage"


def _hop(from_key, to_key, columns=(), sql=None, from_bound=False, to_bound=False):
    return TempHop(
        from_key=from_key,
        to_key=to_key,
        columns=tuple(columns),
        sql_query=sql,
        from_bound=from_bound,
        to_bound=to_bound,
    )


def _by_pair(edges: list[ComposedEdge]) -> dict[tuple[str, str], ComposedEdge]:
    return {(edge.from_fqn, edge.to_fqn): edge for edge in edges}


def test_two_hop_chain_composes_with_chained_columns() -> None:
    graph = TempTableGraph()
    graph.add(
        _hop(SRC, TMP, [(f"{SRC}.id", f"{TMP}.id")], sql="q1", from_bound=True)
    )
    graph.add(
        _hop(TMP, TGT, [(f"{TMP}.id", f"{TGT}.id")], sql="q2", to_bound=True)
    )
    edges = _by_pair(graph.flush())
    assert list(edges) == [(SRC, TGT)]
    assert edges[(SRC, TGT)].columns == [(f"{SRC}.id", f"{TGT}.id")]
    assert edges[(SRC, TGT)].sql_query == "q2"


def test_unmatched_column_pairs_do_not_survive_elimination() -> None:
    graph = TempTableGraph()
    graph.add(
        _hop(
            SRC,
            TMP,
            [(f"{SRC}.id", f"{TMP}.id"), (f"{SRC}.email", f"{TMP}.email")],
            from_bound=True,
        )
    )
    graph.add(_hop(TMP, TGT, [(f"{TMP}.id", f"{TGT}.id")], to_bound=True))
    edges = _by_pair(graph.flush())
    assert edges[(SRC, TGT)].columns == [(f"{SRC}.id", f"{TGT}.id")]


def test_three_temp_hops_compose_transitively() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, "tmp1", [(f"{SRC}.a", "tmp1.a")], from_bound=True))
    graph.add(_hop("tmp1", "tmp2", [("tmp1.a", "tmp2.a")]))
    graph.add(_hop("tmp2", TGT, [("tmp2.a", f"{TGT}.a")], to_bound=True))
    edges = _by_pair(graph.flush())
    assert list(edges) == [(SRC, TGT)]
    assert edges[(SRC, TGT)].columns == [(f"{SRC}.a", f"{TGT}.a")]


def test_hop_to_nowhere_drops_without_an_edge() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, TMP, [(f"{SRC}.id", f"{TMP}.id")], from_bound=True))
    assert graph.flush() == []


def test_bound_to_bound_hop_passes_through_flush() -> None:
    graph = TempTableGraph()
    graph.add(
        _hop(
            SRC,
            TGT,
            [(f"{SRC}.id", f"{TGT}.id")],
            sql="direct",
            from_bound=True,
            to_bound=True,
        )
    )
    edges = graph.flush()
    assert len(edges) == 1
    assert edges[0].from_fqn == SRC and edges[0].to_fqn == TGT
    assert edges[0].sql_query == "direct"


def test_duplicate_hops_merge_column_pairs() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, TMP, [(f"{SRC}.id", f"{TMP}.id")], from_bound=True))
    graph.add(_hop(SRC, TMP, [(f"{SRC}.id", f"{TMP}.id")], from_bound=True))
    graph.add(_hop(TMP, TGT, [(f"{TMP}.id", f"{TGT}.id")], to_bound=True))
    edges = _by_pair(graph.flush())
    assert edges[(SRC, TGT)].columns == [(f"{SRC}.id", f"{TGT}.id")]


def test_self_hop_is_ignored() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, SRC, from_bound=True, to_bound=True))
    assert len(graph) == 0
    assert graph.flush() == []


def test_flush_empties_the_graph() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, TMP, from_bound=True))
    graph.add(_hop(TMP, TGT, to_bound=True))
    assert len(graph.flush()) == 1
    assert graph.flush() == []
    assert len(graph) == 0


def test_bound_claim_wins_over_temp_spelling() -> None:
    graph = TempTableGraph()
    graph.add(_hop(SRC, "stage", from_bound=True))
    graph.add(
        _hop(
            "stage",
            TGT,
            [("stage.id", f"{TGT}.id")],
            from_bound=True,
            to_bound=True,
        )
    )
    # "stage" was bound by the second hop, so it is a catalog node:
    # the first hop's edge survives as a direct edge, not eliminated.
    edges = _by_pair(graph.flush())
    assert ("stage", TGT) in edges
