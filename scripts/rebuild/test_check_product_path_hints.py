"""Contract for product-path misuse guards.

Run with ``python3 scripts/rebuild/test_check_product_path_hints.py``.
Stdlib only — does not import the dist CCL scanner.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HINTS = Path(__file__).with_name("check_product_path_hints.py")
DOCKER_COMMON = REPO / "docker" / "run_local_docker_common.sh"


def load_hints():
    spec = importlib.util.spec_from_file_location("check_product_path_hints", HINTS)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {HINTS}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def complete_tree(root: Path) -> None:
    write(
        root / "docs" / "rebuild" / "PRODUCT_PATH.md",
        "\n".join(
            [
                "# Product path",
                "Product: make slim-dist + smartmetadata-ui + smartmetadata-ingestion + smartmetadata-mcp.",
                "Historical trees stay **reference-only**; do not delete them in this change.",
                "Do not demo with `./docker/run_local_docker.sh -i true` or Collate quickstart images.",
                "Override the docker ingestion path only with I_UNDERSTAND_CCL_INGESTION=1.",
                "VERIFY leftovers: openmetadata-airflow-apis header/LICENSE conflict;",
                "openmetadata-ui-core-components is not in dist.",
                "",
            ]
        ),
    )
    write(
        root / "docs" / "decisions" / "2026-10-22-ccl-trees-stay-reference-only.md",
        "# CCL trees stay reference-only\n",
    )
    write(
        root / "docker" / "run_local_docker_common.sh",
        "require_ccl_ingestion_ack() {\n  :\n}\n"
        "I_UNDERSTAND_CCL_INGESTION\n"
        '  if [[ $includeIngestion == "true" ]]; then\n'
        "    require_ccl_ingestion_ack\n"
        "  fi\n",
    )
    write(
        root / "README.md",
        "See [docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md).\n",
    )
    write(
        root / "openmetadata-dist" / "pom.xml",
        "<dependency><artifactId>openmetadata-ui</artifactId></dependency>\n",
    )


class ProductPathHintsContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(HINTS.is_file(), "scripts/rebuild/check_product_path_hints.py must exist")

    def test_empty_tree_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            errors = hints.check_repo(Path(tmp))
        self.assertTrue(errors)
        joined = "\n".join(errors)
        self.assertIn("PRODUCT_PATH.md", joined)

    def test_complete_tree_passes_even_if_dist_pom_lists_ui(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            errors = hints.check_repo(root)
        self.assertEqual(errors, [], errors)

    def test_does_not_parse_dist_pom(self) -> None:
        hints = load_hints()
        source = HINTS.read_text(encoding="utf-8")
        self.assertNotIn("openmetadata-dist/pom.xml", source)
        self.assertNotIn("binary.xml", source)
        self.assertIn("does not re-scan", (hints.__doc__ or "").lower())

    def test_missing_docker_ack_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "run_local_docker_common.sh").write_text(
                "includeIngestion=true\n", encoding="utf-8"
            )
            errors = hints.check_repo(root)
        self.assertTrue(any("I_UNDERSTAND_CCL_INGESTION" in item for item in errors), errors)

    def test_live_tree_passes(self) -> None:
        hints = load_hints()
        self.assertEqual(hints.main([]), 0)


class CclIngestionDockerAck(unittest.TestCase):
    def _stub_bin(self, tmp: Path) -> tuple[Path, dict[str, str]]:
        stub = tmp / "bin"
        stub.mkdir()
        log = tmp / "invoked.log"
        for name in ("docker", "mvn", "make", "curl"):
            script = stub / name
            script.write_text(
                f"#!/bin/bash\nprintf '%s ' '{name}' >> '{log}'\nprintf '%s\\n' \"$*\" >> '{log}'\nexit 0\n",
                encoding="utf-8",
            )
            script.chmod(0o755)
        env = os.environ.copy()
        env.pop("I_UNDERSTAND_CCL_INGESTION", None)
        env["PATH"] = f"{stub}{os.pathsep}{env.get('PATH', '')}"
        return log, env

    def test_entry_point_refuses_without_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log, env = self._stub_bin(Path(tmp))
            completed = subprocess.run(
                ["bash", str(REPO / "docker" / "run_local_docker.sh"), "-i", "true", "-s", "true"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
                cwd=str(REPO),
                timeout=8,
            )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)
        self.assertFalse(log.is_file(), log.read_text(encoding="utf-8") if log.is_file() else "")

    def test_refuses_without_env(self) -> None:
        env = os.environ.copy()
        env.pop("I_UNDERSTAND_CCL_INGESTION", None)
        completed = subprocess.run(
            [
                "bash",
                "-c",
                f"source {DOCKER_COMMON} && require_ccl_ingestion_ack",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn("\033[0;31m", completed.stderr)

    def test_allows_with_env(self) -> None:
        env = os.environ.copy()
        env["I_UNDERSTAND_CCL_INGESTION"] = "1"
        completed = subprocess.run(
            [
                "bash",
                "-c",
                f"source {DOCKER_COMMON} && require_ccl_ingestion_ack",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)


if __name__ == "__main__":
    unittest.main()
