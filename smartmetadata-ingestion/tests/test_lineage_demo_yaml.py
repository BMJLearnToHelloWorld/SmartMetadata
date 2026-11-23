# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Static-source contract for scripts/rebuild/lineage-demo.yaml.

Loads the demo seed the way ``smartmetadata-ingest run`` would (same
``StaticSource`` + ``parse_static_record`` path, no live server) and pins the
graph the live stage later asserts over the traversal API:
14 demo tables (11 MySQL + 3 Doris), 15 edges, 10 column-lineage edges,
2 pipeline-attributed edges, 1 dashboard endpoint, a 3-hop raw -> dim ->
fact -> feature chain, a Doris mirror (MySQL mart -> Doris -> view -> mart),
and no cycles.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import yaml
from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.base import StaticSource
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    DatabaseServiceRecord,
    LineageRecord,
    PipelineRecord,
    PipelineServiceRecord,
    TableRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import _lineage_details

DEMO_YAML = Path(__file__).resolve().parents[2] / "scripts" / "rebuild" / "lineage-demo.yaml"
PREFIX = "lineage-demo.demo.public"
DPREFIX = "lineage-demo-doris.demo.public"


def _table(name: str) -> str:
    return f"{PREFIX}.{name}"


def _doris_table(name: str) -> str:
    return f"{DPREFIX}.{name}"


TABLES = [
    "raw_customers",
    "stg_customers",
    "dim_customers",
    "raw_orders",
    "stg_orders",
    "raw_payments",
    "stg_payments",
    "fact_orders",
    "shop_raw_customer",
    "shop_dim_customer",
    "customer_features",
    "doris_dim_customers",
    "doris_fact_orders",
    "doris_v_customer_orders",
]

# (from_fqn, to_fqn, source) for every demo edge, in YAML order.
EDGES = [
    (_table("raw_customers"), _table("stg_customers"), "QueryLineage"),
    (_table("stg_customers"), _table("dim_customers"), "QueryLineage"),
    (_table("raw_orders"), _table("stg_orders"), "QueryLineage"),
    (_table("stg_orders"), _table("fact_orders"), "PipelineLineage"),
    (_table("raw_payments"), _table("stg_payments"), "QueryLineage"),
    (_table("stg_payments"), _table("fact_orders"), "Manual"),
    (_table("shop_raw_customer"), _table("shop_dim_customer"), "DbtLineage"),
    (_table("shop_dim_customer"), _table("fact_orders"), "PipelineLineage"),
    (_table("fact_orders"), _table("customer_features"), "QueryLineage"),
    (_table("fact_orders"), "lineage-demo-superset.demo_orders_dashboard", "DashboardLineage"),
    (_table("dim_customers"), _doris_table("doris_dim_customers"), "QueryLineage"),
    (_table("fact_orders"), _doris_table("doris_fact_orders"), "QueryLineage"),
    (
        _doris_table("doris_dim_customers"),
        _doris_table("doris_v_customer_orders"),
        "QueryLineage",
    ),
    (
        _doris_table("doris_fact_orders"),
        _doris_table("doris_v_customer_orders"),
        "QueryLineage",
    ),
    (_doris_table("doris_v_customer_orders"), _table("customer_features"), "QueryLineage"),
]


def _load_records() -> tuple[dict, list]:
    raw = yaml.safe_load(DEMO_YAML.read_text(encoding="utf-8"))
    source = StaticSource(
        SourceConfig(
            type=raw["source"]["type"],
            service_name=raw["source"]["serviceName"],
            records=raw["source"]["records"],
        )
    )
    return raw, list(source.produce())


def test_demo_yaml_is_marked_demo_data() -> None:
    text = DEMO_YAML.read_text(encoding="utf-8")
    assert "DEMO / FAKE DATA" in text
    assert "NOT REAL DATA" in text
    assert "lineage-demo" in text


def test_demo_yaml_produces_expected_records() -> None:
    _, records = _load_records()
    by_kind: dict[str, list] = {}
    for record in records:
        by_kind.setdefault(record.kind, []).append(record)

    assert isinstance(records[0], DatabaseServiceRecord)
    assert records[0].name == "lineage-demo"
    assert records[0].service_type == "CustomDatabase"

    # The Doris service is the second databaseService record (the first is
    # the auto-yielded default service above); its connection is the fake
    # placeholder the live stage applies, no password stored.
    services = by_kind["databaseService"]
    assert [s.name for s in services] == ["lineage-demo", "lineage-demo-doris"]
    doris = services[1]
    assert doris.service_type == "Doris"
    assert doris.display_name == "Lineage Demo Doris (fake)"
    assert doris.connection == {
        "config": {
            "type": "Doris",
            "scheme": "doris",
            "hostPort": "lineage-demo-doris:9030",
            "username": "demo",
            "supportsViewLineageExtraction": True,
        }
    }

    assert [(r.name, r.service) for r in by_kind["database"]] == [
        ("demo", "lineage-demo"),
        ("demo", "lineage-demo-doris"),
    ]
    assert [r.database for r in by_kind["schema"]] == [
        "lineage-demo.demo",
        "lineage-demo-doris.demo",
    ]

    tables = by_kind["table"]
    assert isinstance(tables[0], TableRecord)
    assert [t.name for t in tables] == TABLES
    assert [t.database_schema for t in tables] == [PREFIX] * 11 + [DPREFIX] * 3
    assert all(t.table_type == "Regular" for t in tables if t.name != "doris_v_customer_orders")
    view = next(t for t in tables if t.name == "doris_v_customer_orders")
    assert view.table_type == "View"
    assert view.schema_definition is not None
    assert view.schema_definition.startswith("CREATE VIEW doris_v_customer_orders AS SELECT")

    assert [r.name for r in by_kind["pipelineService"]] == ["lineage-demo-airflow"]
    assert isinstance(by_kind["pipelineService"][0], PipelineServiceRecord)
    assert [r.name for r in by_kind["pipeline"]] == [
        "demo_orders_etl",
        "demo_customer_etl",
    ]
    assert isinstance(by_kind["pipeline"][0], PipelineRecord)
    assert all(r.service == "lineage-demo-airflow" for r in by_kind["pipeline"])
    assert [r.name for r in by_kind["dashboardService"]] == ["lineage-demo-superset"]
    assert isinstance(by_kind["dashboardService"][0], DashboardServiceRecord)
    assert [r.name for r in by_kind["chart"]] == ["demo_orders_by_day"]
    assert isinstance(by_kind["chart"][0], ChartRecord)
    assert [r.name for r in by_kind["dashboard"]] == ["demo_orders_dashboard"]
    assert isinstance(by_kind["dashboard"][0], DashboardRecord)
    assert by_kind["dashboard"][0].charts == ["lineage-demo-superset.demo_orders_by_day"]


def test_demo_yaml_lineage_edges() -> None:
    _, records = _load_records()
    edges = [r for r in records if isinstance(r, LineageRecord)]
    assert [(e.from_entity.fqn, e.to_entity.fqn, e.source) for e in edges] == EDGES

    column_edges = [e for e in edges if e.columns_lineage]
    assert len(column_edges) == 10
    first = column_edges[0]
    assert first.from_entity.fqn == _table("raw_customers")
    assert [(c.from_columns, c.to_column) for c in first.columns_lineage] == [
        ([_table("raw_customers.customer_id")], _table("stg_customers.customer_id")),
        (
            [_table("raw_customers.customer_name")],
            _table("stg_customers.customer_name"),
        ),
    ]
    features = next(
        e
        for e in edges
        if e.from_entity.fqn == _table("fact_orders")
        and e.to_entity.fqn == _table("customer_features")
    )
    assert [(c.from_columns, c.to_column, c.function) for c in features.columns_lineage] == [
        ([_table("fact_orders.customer_id")], _table("customer_features.customer_id"), None),
        (
            [_table("fact_orders.amount")],
            _table("customer_features.total_amount"),
            "SUM",
        ),
    ]

    # Doris mirror edges carry column lineage too: the MySQL mart feeds the
    # Doris tables, the Doris tables feed the view (SUM into total_amount),
    # and the view feeds the mart back.
    doris_dim = next(e for e in edges if e.to_entity.fqn == _doris_table("doris_dim_customers"))
    assert [(c.from_columns, c.to_column) for c in doris_dim.columns_lineage] == [
        (
            [_table("dim_customers.customer_id")],
            _doris_table("doris_dim_customers.customer_id"),
        ),
        (
            [_table("dim_customers.customer_name")],
            _doris_table("doris_dim_customers.customer_name"),
        ),
        ([_table("dim_customers.email")], _doris_table("doris_dim_customers.email")),
    ]
    doris_view_in = next(
        e
        for e in edges
        if e.from_entity.fqn == _doris_table("doris_fact_orders")
        and e.to_entity.fqn == _doris_table("doris_v_customer_orders")
    )
    assert [(c.from_columns, c.to_column, c.function) for c in doris_view_in.columns_lineage] == [
        (
            [_doris_table("doris_fact_orders.customer_id")],
            _doris_table("doris_v_customer_orders.customer_id"),
            None,
        ),
        (
            [_doris_table("doris_fact_orders.amount")],
            _doris_table("doris_v_customer_orders.total_amount"),
            "SUM",
        ),
    ]
    doris_view_out = next(
        e for e in edges if e.from_entity.fqn == _doris_table("doris_v_customer_orders")
    )
    assert doris_view_out.to_entity.fqn == _table("customer_features")
    assert [(c.from_columns, c.to_column) for c in doris_view_out.columns_lineage] == [
        (
            [_doris_table("doris_v_customer_orders.customer_id")],
            _table("customer_features.customer_id"),
        ),
        (
            [_doris_table("doris_v_customer_orders.order_count")],
            _table("customer_features.order_count"),
        ),
        (
            [_doris_table("doris_v_customer_orders.total_amount")],
            _table("customer_features.total_amount"),
        ),
    ]

    pipeline_edges = [e for e in edges if e.pipeline is not None]
    assert len(pipeline_edges) == 2
    assert {e.pipeline.fully_qualified_name for e in pipeline_edges} == {
        "lineage-demo-airflow.demo_orders_etl",
        "lineage-demo-airflow.demo_customer_etl",
    }

    dashboard_edges = [e for e in edges if e.to_entity.type == "dashboard"]
    assert len(dashboard_edges) == 1
    assert dashboard_edges[0].from_entity.fqn == _table("fact_orders")
    assert dashboard_edges[0].source == "DashboardLineage"


def test_demo_yaml_lineage_wire_payloads() -> None:
    """put_lineage bodies the sink will send for the attributed edges."""
    _, records = _load_records()
    edges = [r for r in records if isinstance(r, LineageRecord)]
    pipeline_edge = next(e for e in edges if e.from_entity.fqn == _table("stg_orders"))
    assert _lineage_details(pipeline_edge) == {
        "source": "PipelineLineage",
        "sqlQuery": "SELECT order_id, customer_id, amount FROM stg_orders",
        "pipeline": {
            "type": "pipeline",
            "fullyQualifiedName": "lineage-demo-airflow.demo_orders_etl",
        },
    }
    column_edge = next(e for e in edges if e.from_entity.fqn == _table("shop_raw_customer"))
    assert _lineage_details(column_edge) == {
        "source": "DbtLineage",
        "sqlQuery": (
            "SELECT customer_id, first_name || ' ' || last_name AS full_name FROM shop_raw_customer"
        ),
        "columnsLineage": [
            {
                "fromColumns": [_table("shop_raw_customer.customer_id")],
                "toColumn": _table("shop_dim_customer.customer_id"),
            }
        ],
    }


def test_demo_yaml_edges_reference_declared_entities() -> None:
    _, records = _load_records()
    declared: set[tuple[str, str]] = set()
    for record in records:
        if isinstance(record, TableRecord):
            declared.add(("table", f"{record.database_schema}.{record.name}"))
        elif isinstance(record, DashboardRecord):
            declared.add(("dashboard", f"{record.service}.{record.name}"))
        elif isinstance(record, PipelineRecord):
            declared.add(("pipeline", f"{record.service}.{record.name}"))
    edges = [r for r in records if isinstance(r, LineageRecord)]
    for edge in edges:
        assert (edge.from_entity.type, edge.from_entity.fqn) in declared
        assert (edge.to_entity.type, edge.to_entity.fqn) in declared
        if edge.pipeline is not None:
            assert ("pipeline", edge.pipeline.fully_qualified_name) in declared


def _bfs(start: str, adjacency: dict[str, list[str]], max_depth: int) -> dict[str, int]:
    seen = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if seen[node] >= max_depth:
            continue
        for nxt in adjacency.get(node, []):
            if nxt not in seen:
                seen[nxt] = seen[node] + 1
                queue.append(nxt)
    return seen


def test_demo_graph_hops_and_acyclic() -> None:
    _, records = _load_records()
    edges = [r for r in records if isinstance(r, LineageRecord)]
    downstream: dict[str, list[str]] = {}
    upstream: dict[str, list[str]] = {}
    for edge in edges:
        downstream.setdefault(edge.from_entity.fqn, []).append(edge.to_entity.fqn)
        upstream.setdefault(edge.to_entity.fqn, []).append(edge.from_entity.fqn)

    # 3-hop chain: shop_raw_customer -> shop_dim_customer -> fact_orders
    # -> customer_features (and -> dashboard).
    hops = _bfs(_table("shop_raw_customer"), downstream, 3)
    assert hops[_table("customer_features")] == 3
    assert hops["lineage-demo-superset.demo_orders_dashboard"] == 3
    # 2-hop jaffle chain, both directions.
    assert _bfs(_table("raw_customers"), downstream, 3)[_table("dim_customers")] == 2
    assert _bfs(_table("dim_customers"), upstream, 3)[_table("raw_customers")] == 2
    # Doris mirror: dim_customers gains a downstream path through the Doris
    # view to the mart (it had no outgoing edge before), and fact_orders
    # reaches the Doris view in 2 hops.
    assert _bfs(_table("dim_customers"), downstream, 3)[_table("customer_features")] == 3
    assert _bfs(_table("fact_orders"), downstream, 3)[_doris_table("doris_v_customer_orders")] == 2
    # Fan-in: customer_features sees 8 MySQL tables upstream at depth 3
    # (dim_customers joins via the Doris view) plus the 3 Doris tables.
    fan_in = _bfs(_table("customer_features"), upstream, 3)
    assert fan_in[_table("shop_raw_customer")] == 3
    assert fan_in[_table("raw_orders")] == 3
    assert fan_in[_table("raw_payments")] == 3
    assert fan_in[_table("dim_customers")] == 3
    assert fan_in[_doris_table("doris_v_customer_orders")] == 1
    assert fan_in[_doris_table("doris_dim_customers")] == 2
    assert fan_in[_doris_table("doris_fact_orders")] == 2
    assert len([f for f in fan_in if f.startswith(PREFIX)]) == 9  # centre + 8
    assert len([f for f in fan_in if f.startswith(DPREFIX)]) == 3

    # Acyclic: no node is reachable from itself (the upstream sample's dbt
    # cycle is deliberately NOT reproduced). _bfs seeds the start node, so
    # reachability-from-self needs a successors-only walk.
    nodes = {e.from_entity.fqn for e in edges} | {e.to_entity.fqn for e in edges}
    for node in nodes:
        reached: set[str] = set()
        queue: deque[str] = deque(downstream.get(node, []))
        while queue:
            current = queue.popleft()
            if current in reached:
                continue
            reached.add(current)
            queue.extend(downstream.get(current, []))
        assert node not in reached, f"cycle through {node}"
