"""Contract for product-path docs and docker refusal after the CCL purge.

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
                "Official CCL trees are **purged**. See check_purged_trees.py.",
                "Capability gaps: PARITY.md.",
                "",
            ]
        ),
    )
    write(
        root / "docs" / "rebuild" / "PARITY.md",
        "# Parity\n",
    )
    write(
        root / "docs" / "decisions" / "2026-10-22-ccl-trees-are-purged.md",
        "# CCL trees are purged\n",
    )
    write(
        root / "docker" / "run_local_docker_common.sh",
        "refuse_purged_ccl_ingestion() {\n  echo purged\n  echo smartmetadata-ingest\n  exit 1\n}\n"
        '  if [[ $includeIngestion == "true" ]]; then\n'
        "    refuse_purged_ccl_ingestion\n"
        "  fi\n",
    )
    write(
        root / "README.md",
        "See [docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md).\n",
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

    def test_complete_tree_passes(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            errors = hints.check_repo(root)
        self.assertEqual(errors, [], errors)

    def test_reference_only_story_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            path = root / "docs" / "rebuild" / "PRODUCT_PATH.md"
            path.write_text(path.read_text(encoding="utf-8") + "\nreference-only leftover\n")
            errors = hints.check_repo(root)
        self.assertTrue(any("reference-only" in item for item in errors), errors)

    def test_does_not_parse_dist_pom(self) -> None:
        hints = load_hints()
        source = HINTS.read_text(encoding="utf-8")
        self.assertNotIn("openmetadata-dist/pom.xml", source)
        self.assertNotIn("binary.xml", source)
        self.assertIn("does not import the dist", (hints.__doc__ or "").lower() or "not")

    def test_live_tree_passes(self) -> None:
        hints = load_hints()
        self.assertEqual(hints.main([]), 0)


class CclIngestionDockerRefusal(unittest.TestCase):
    def test_entry_point_refuses_even_with_old_override(self) -> None:
        env = os.environ.copy()
        env["I_UNDERSTAND_CCL_INGESTION"] = "1"
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
        self.assertIn("purged", completed.stderr.lower())
        self.assertIn("smartmetadata-ingest", completed.stderr)

    def test_function_always_fails(self) -> None:
        env = os.environ.copy()
        completed = subprocess.run(
            [
                "bash",
                "-c",
                f"source {DOCKER_COMMON} && refuse_purged_ccl_ingestion",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("purged", completed.stderr.lower())
        self.assertIn("\033[0;31m", completed.stderr)


if __name__ == "__main__":
    unittest.main()
