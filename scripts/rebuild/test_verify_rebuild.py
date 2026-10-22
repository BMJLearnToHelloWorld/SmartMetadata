"""Contract for the offline Phase 11 rebuild verification runner.

Run with ``python3 -m pytest scripts/rebuild/test_verify_rebuild.py`` (or
``python3 scripts/rebuild/test_verify_rebuild.py`` using unittest).
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify_rebuild.py")


def load_verify():
    spec = importlib.util.spec_from_file_location("verify_rebuild", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class VerifyRebuildContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file(), "scripts/rebuild/verify_rebuild.py must exist")

    def test_matrix_covers_required_offline_steps(self) -> None:
        verify = load_verify()
        ids = [step.id for step in verify.verify_steps()]
        for required in (
            "ui-test",
            "ui-build",
            "ingest-test",
            "ccl-ingestion",
            "mcp-test",
            "mcp-build",
            "ccl-dist",
            "ccl-mcp",
            "product-path-hints",
            "decision-records",
            "live-smoke-contract",
            "rebuild-ci-contract",
        ):
            self.assertIn(required, ids)

        commands = [" ".join(step.argv) for step in verify.verify_steps()]
        joined = "\n".join(commands)
        self.assertIn("check_ccl_free_dist.py", joined)
        self.assertIn("check_ccl_free_ingestion.py", joined)
        self.assertIn("check_ccl_free_mcp.py", joined)
        self.assertIn("check_product_path_hints.py", joined)
        self.assertIn("check_decision_records.py", joined)

    def test_default_matrix_does_not_start_a_live_catalog(self) -> None:
        verify = load_verify()
        joined = " ".join(" ".join(step.argv) for step in verify.default_steps(install=False))
        for forbidden in (
            "docker",
            "slim-dist",
            "openmetadata-server-start",
            "playwright",
            "ui_dev",
        ):
            self.assertNotIn(forbidden, joined)

    def test_skip_install_omits_install_steps(self) -> None:
        verify = load_verify()
        ids = [step.id for step in verify.default_steps(install=False)]
        self.assertFalse(any(step_id.endswith("-install") for step_id in ids))

    def test_require_tarball_passes_flag_to_dist_gate(self) -> None:
        verify = load_verify()
        dist = next(step for step in verify.verify_steps(require_tarball=True) if step.id == "ccl-dist")
        self.assertIn("--require-tarball", dist.argv)

    def test_run_step_returns_nonzero_for_failure(self) -> None:
        verify = load_verify()
        step = verify.Step(
            id="failing",
            argv=(sys.executable, "-c", "import sys; sys.exit(7)"),
        )
        self.assertEqual(verify.run_step(step, repo=Path(__file__).resolve().parents[2]), 7)

    def test_ui_engines_require_node_22(self) -> None:
        pkg_path = Path(__file__).resolve().parents[2] / "smartmetadata-ui" / "package.json"
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        engines = pkg["engines"]["node"]
        self.assertIn("22.22.2", engines)
        self.assertNotEqual(engines, ">=20")

    def test_node_runtime_lines_include_version(self) -> None:
        verify = load_verify()
        lines = "\n".join(verify.node_runtime_lines())
        self.assertIn("node:", lines)
        self.assertIn("npm:", lines)
        self.assertRegex(lines, r"v\d+")

    def test_list_mode_exits_zero_without_running_npm(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--list", "--skip-install"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("ui-test", completed.stdout)
        self.assertIn("ccl-dist", completed.stdout)
        self.assertIn("product-path-hints", completed.stdout)
        self.assertIn("decision-records", completed.stdout)
        self.assertIn("live-smoke-contract", completed.stdout)
        self.assertIn("rebuild-ci-contract", completed.stdout)


if __name__ == "__main__":
    unittest.main()
