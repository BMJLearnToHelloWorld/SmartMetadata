"""Contract for the lineage-demo verification script's edge handling.

Run with ``python3 -m pytest scripts/rebuild/test_verify_lineage_demo.py``
(or ``python3 scripts/rebuild/test_verify_lineage_demo.py`` using unittest).

The lineage API returns edge endpoints as entity-ID strings; ``_fqn`` used
to return "" for them, so every edge-pair check compared ("", "") and the
``fact_orders -> customer_features`` assertion failed even with the edges
present (live 2026-11-23). ``lineage_edges`` must resolve those IDs to
FQNs via the payload's own nodes before the checks run.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-lineage-demo.py")


def load_verify():
    spec = importlib.util.spec_from_file_location("verify_lineage_demo", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# A traversal payload shaped like the live GET /v1/lineage response:
# entity + nodes are dict refs with id/fullyQualifiedName; edge endpoints
# are entity-ID strings.
PREFIX = "lineage-demo.demo.public"


def _payload() -> dict:
    fact_id = "aaaaaaaa-0000-4000-8000-000000000001"
    feature_id = "aaaaaaaa-0000-4000-8000-000000000002"
    stg_id = "aaaaaaaa-0000-4000-8000-000000000003"
    return {
        "entity": {
            "id": fact_id,
            "type": "table",
            "fullyQualifiedName": f"{PREFIX}.fact_orders",
        },
        "nodes": [
            {
                "id": feature_id,
                "type": "table",
                "fullyQualifiedName": f"{PREFIX}.customer_features",
            },
            {
                "id": stg_id,
                "type": "table",
                "fullyQualifiedName": f"{PREFIX}.stg_orders",
            },
        ],
        "upstreamEdges": [
            {
                "fromEntity": stg_id,
                "toEntity": fact_id,
                "lineageDetails": {
                    "source": "PipelineLineage",
                    "pipeline": {
                        "fullyQualifiedName": "lineage-demo-airflow.demo_orders_etl"
                    },
                },
            },
        ],
        "downstreamEdges": [
            {
                "fromEntity": fact_id,
                "toEntity": feature_id,
                "lineageDetails": {
                    "source": "QueryLineage",
                    "columnsLineage": [
                        {
                            "fromColumns": [f"{PREFIX}.fact_orders.amount"],
                            "toColumn": f"{PREFIX}.customer_features.total_amount",
                            "function": "SUM",
                        }
                    ],
                },
            },
        ],
    }


class VerifyLineageDemoContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file(), "scripts/rebuild/verify-lineage-demo.py must exist")

    def test_fqn_passes_string_refs_through(self) -> None:
        verify = load_verify()
        self.assertEqual(verify._fqn("some-fqn"), "some-fqn")
        self.assertEqual(
            verify._fqn({"fullyQualifiedName": "a.b", "name": "b"}), "a.b"
        )
        self.assertEqual(verify._fqn({"name": "b"}), "b")
        self.assertEqual(verify._fqn(None), "")
        self.assertEqual(verify._fqn(42), "")

    def test_lineage_edges_resolve_string_endpoints_to_fqns(self) -> None:
        verify = load_verify()
        edges = verify.lineage_edges(_payload())
        pairs = {verify.edge_fqns(e) for e in edges}
        # The pair the live run failed on before the fix (compared ("", "")).
        self.assertIn(
            (f"{PREFIX}.fact_orders", f"{PREFIX}.customer_features"), pairs
        )
        self.assertIn((f"{PREFIX}.stg_orders", f"{PREFIX}.fact_orders"), pairs)

    def test_lineage_edges_keep_lineage_details(self) -> None:
        verify = load_verify()
        edges = {verify.edge_fqns(e): e for e in verify.lineage_edges(_payload())}
        pipe_edge = edges[(f"{PREFIX}.stg_orders", f"{PREFIX}.fact_orders")]
        self.assertEqual(
            pipe_edge["lineageDetails"]["source"], "PipelineLineage"
        )
        feature_edge = edges[(f"{PREFIX}.fact_orders", f"{PREFIX}.customer_features")]
        columns = feature_edge["lineageDetails"]["columnsLineage"]
        self.assertEqual(columns[0]["function"], "SUM")

    def test_lineage_edges_leave_unknown_ids_untouched(self) -> None:
        verify = load_verify()
        payload = _payload()
        payload["upstreamEdges"] = []
        payload["downstreamEdges"] = [
            {"fromEntity": "unknown-id", "toEntity": "also-unknown"}
        ]
        edges = verify.lineage_edges(payload)
        self.assertEqual(len(edges), 1)
        self.assertEqual(
            verify.edge_fqns(edges[0]), ("unknown-id", "also-unknown")
        )

    def test_lineage_edges_pass_dict_endpoints_through(self) -> None:
        verify = load_verify()
        payload = _payload()
        payload["upstreamEdges"] = []
        payload["downstreamEdges"] = [
            {
                "fromEntity": {
                    "type": "table",
                    "fullyQualifiedName": f"{PREFIX}.fact_orders",
                },
                "toEntity": {
                    "type": "table",
                    "fullyQualifiedName": f"{PREFIX}.customer_features",
                },
            }
        ]
        edges = verify.lineage_edges(payload)
        self.assertEqual(len(edges), 1)
        self.assertEqual(
            verify.edge_fqns(edges[0]),
            (f"{PREFIX}.fact_orders", f"{PREFIX}.customer_features"),
        )


if __name__ == "__main__":
    unittest.main()
