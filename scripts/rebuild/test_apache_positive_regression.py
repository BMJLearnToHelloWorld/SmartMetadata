"""Contract for the Apache positive-regression harness.

Run with ``python3 scripts/rebuild/test_apache_positive_regression.py``.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("check_apache_positive_regression.py")
REPO = Path(__file__).resolve().parents[2]


def load_checker():
    spec = importlib.util.spec_from_file_location("check_apache_positive_regression", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ApachePositiveRegressionContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file(), "scripts/rebuild/check_apache_positive_regression.py must exist")

    def test_live_tree_passes(self) -> None:
        checker = load_checker()
        errors = checker.run_checks()
        self.assertEqual(errors, [], errors)

    def test_list_mode_exits_zero(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--list"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("rest-client", completed.stdout)
        self.assertIn("mcp-apache-allowlist", completed.stdout)
        self.assertIn("airflow-route-contract", completed.stdout)

    def test_stage_order_drift_fails(self) -> None:
        checker = load_checker()
        original = checker.REQUIRED_STAGE_ORDER
        drifted = dict(original)
        drifted["lineage"] = 0  # child before parent = regression
        checker.REQUIRED_STAGE_ORDER = drifted
        try:
            errors = checker.run_checks()
        finally:
            checker.REQUIRED_STAGE_ORDER = original
        self.assertTrue(any("STAGE_ORDER" in item for item in errors), errors)

    def test_forbidden_mcp_tool_fails(self) -> None:
        checker = load_checker()
        original = checker.REQUIRED_MCP_TOOLS
        checker.REQUIRED_MCP_TOOLS = original + ("semantic_search",)
        try:
            errors = checker.run_checks()
        finally:
            checker.REQUIRED_MCP_TOOLS = original
        self.assertTrue(any("TOOL_NAMES" in item or "AI/RDF" in item for item in errors), errors)

    def test_entry_point_passes_on_repo(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT)],
            check=False,
            capture_output=True,
            text=True,
            cwd=REPO,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr + completed.stdout)
        self.assertIn("Apache positive regression ok", completed.stdout)


if __name__ == "__main__":
    unittest.main()

