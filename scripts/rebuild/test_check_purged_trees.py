"""Contract for the CCL-tree purge gate.

Run with ``python3 scripts/rebuild/test_check_purged_trees.py``.
Stdlib only.
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("check_purged_trees.py")


def load_gate():
    spec = importlib.util.spec_from_file_location("check_purged_trees", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class PurgedTreesContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file())

    def test_live_tree_passes(self) -> None:
        gate = load_gate()
        self.assertEqual(gate.main([]), 0)

    def test_reappeared_path_fails(self) -> None:
        gate = load_gate()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root / "pom.xml", "<project><modules></modules></project>\n")
            write(root / "Makefile", "slim-dist:\n\t@true\n")
            (root / "ingestion").mkdir()
            errors = gate.check_repo(root)
        self.assertTrue(any("ingestion" in item for item in errors), errors)

    def test_reactor_module_fails(self) -> None:
        gate = load_gate()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(
                root / "pom.xml",
                "<project><modules><module>openmetadata-ui</module></modules></project>\n",
            )
            write(root / "Makefile", "slim-dist:\n\t@true\n")
            errors = gate.check_repo(root)
        self.assertTrue(any("openmetadata-ui" in item for item in errors), errors)

    def test_makefile_include_fails(self) -> None:
        gate = load_gate()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root / "pom.xml", "<project><modules></modules></project>\n")
            write(root / "Makefile", "include ingestion/Makefile\n")
            errors = gate.check_repo(root)
        self.assertTrue(any("ingestion/Makefile" in item for item in errors), errors)

    def test_makefile_cd_ui_fails(self) -> None:
        gate = load_gate()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root / "pom.xml", "<project><modules></modules></project>\n")
            write(root / "Makefile", "ui:\n\tcd openmetadata-ui/src && yarn\n")
            errors = gate.check_repo(root)
        self.assertTrue(any("openmetadata-ui" in item for item in errors), errors)


if __name__ == "__main__":
    unittest.main()
