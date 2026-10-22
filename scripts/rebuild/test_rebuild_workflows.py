"""Contract for the SmartMetadata rebuild GitHub Actions surface.

Fails if the dedicated workflow reuses Collate / official Playwright /
ingestion-image jobs, or if Job C assumes Docker on a contributor laptop.
"""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "smartmetadata-rebuild.yml"
STATIC_SMOKE = REPO / "scripts" / "rebuild" / "static-smoke.yaml"


class RebuildWorkflowContract(unittest.TestCase):
    def test_workflow_exists(self) -> None:
        self.assertTrue(WORKFLOW.is_file(), f"missing {WORKFLOW.relative_to(REPO)}")

    def test_separate_surface_does_not_call_upstream_product_ci(self) -> None:
        executable = "\n".join(
            line
            for line in WORKFLOW.read_text(encoding="utf-8").splitlines()
            if line.lstrip() and not line.lstrip().startswith("#")
        )
        for forbidden in (
            "openmetadata-ui/src/main/resources/ui",
            "yarn_install",
            "yarn install",
            "docker-openmetadata-ingestion",
            "playwright-e2e-reusable",
            "playwright-postgresql-e2e",
            "run_local_docker",
            "-i true",
            "maven-build-collate",
        ):
            self.assertNotIn(
                forbidden,
                executable,
                f"rebuild workflow must not reuse upstream CI path {forbidden!r}",
            )

    def test_job_a_runs_offline_verify_rebuild(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("make verify-rebuild", text)
        self.assertIn("pull_request", text)
        self.assertIn("verify-rebuild:", text)

    def test_job_a_pins_node_22_lts_and_prints_version(self) -> None:
        """vite 8 / undici 8 cannot boot vitest forks on Node 20 (decompress.bind)."""
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn('node-version: "22"', text)
        self.assertNotIn('node-version: "20"', text)
        self.assertIn("node -v", text)
        self.assertIn("actions/setup-node@v5", text)

    def test_job_b_builds_slim_dist_tarball(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("make slim-dist", text)
        self.assertIn("check_ccl_free_dist.py --require-tarball", text)
        self.assertIn("Java 21", text)
        self.assertIn("Maven", text)

    def test_job_c_uses_gha_service_containers_not_laptop_docker(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("live-smoke:", text)
        self.assertIn("workflow_dispatch", text)
        self.assertIn("\n    services:\n", text)
        self.assertIn("mysql:", text)
        self.assertIn("elasticsearch:", text)
        self.assertNotIn("docker compose", text)
        self.assertNotIn("docker-compose", text)
        self.assertIn("secrets.OM_JWT", text)
        self.assertIn("# TODO", text)

    def test_static_smoke_fixture_uses_bootstrap_login(self) -> None:
        self.assertTrue(STATIC_SMOKE.is_file())
        text = STATIC_SMOKE.read_text(encoding="utf-8")
        self.assertIn("type: static", text)
        self.assertIn("type: login", text)
        self.assertNotIn("${OM_JWT}", text)
        self.assertIn("kind: table", text)

    def test_workflow_is_contents_read_only(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("contents: read", text)
        self.assertNotIn("pull_request_target", text)


if __name__ == "__main__":
    unittest.main()
