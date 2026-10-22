#!/usr/bin/env python3
"""Fail if the clean-room ingestion package imports or depends on CCL trees.

Checks ``smartmetadata-ingestion/`` only:

1. ``pyproject.toml`` does not depend on ``openmetadata-ingestion``,
   ``metadata``, or ``openmetadata-airflow-apis``.
2. Python sources do not import those packages (including dynamic imports).
3. LICENSE is Apache-2.0 and does not contain Collate Community License text.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PACKAGE = REPO / "smartmetadata-ingestion"
SRC = PACKAGE / "src"
PYPROJECT = PACKAGE / "pyproject.toml"
LICENSE = PACKAGE / "LICENSE"

BANNED_MODULES = (
    "metadata",
    "openmetadata_ingestion",
    "openmetadata.ingestion",
    "openmetadata_airflow_apis",
)
BANNED_DEP_MARKERS = (
    "openmetadata-ingestion",
    "openmetadata_ingestion",
    "openmetadata-airflow-apis",
    "openmetadata_airflow_apis",
)
CCL_MARKERS = (
    "collate community license",
    "collate community licence",
)
IMPORT_PATTERN = re.compile(
    r"\b(?:import|from)\s+(metadata|openmetadata_ingestion|openmetadata\.ingestion|openmetadata_airflow_apis)\b"
)


def check_pyproject(errors: list[str]) -> None:
    if not PYPROJECT.is_file():
        errors.append(f"missing {PYPROJECT.relative_to(REPO)}")
        return
    text = PYPROJECT.read_text(encoding="utf-8").lower()
    for marker in BANNED_DEP_MARKERS:
        if marker in text:
            errors.append(f"{PYPROJECT.relative_to(REPO)} depends on banned package {marker}")


def check_license(errors: list[str]) -> None:
    if not LICENSE.is_file():
        errors.append(f"missing {LICENSE.relative_to(REPO)}")
        return
    text = LICENSE.read_text(encoding="utf-8")
    if "Apache License" not in text:
        errors.append(f"{LICENSE.relative_to(REPO)} is not Apache-2.0")
    lowered = text.lower()
    if any(marker in lowered for marker in CCL_MARKERS):
        errors.append(f"{LICENSE.relative_to(REPO)} contains Collate Community License text")


def module_is_banned(name: str | None) -> bool:
    if not name:
        return False
    return any(name == banned or name.startswith(f"{banned}.") for banned in BANNED_MODULES)


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def check_python_file(path: Path, errors: list[str]) -> None:
    relative = display_path(path)
    source = path.read_text(encoding="utf-8")
    if IMPORT_PATTERN.search(source):
        errors.append(f"{relative} mentions a banned CCL import")
        return
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        errors.append(f"{relative} is not valid Python: {exc}")
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if module_is_banned(alias.name):
                    errors.append(f"{relative} imports {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if module_is_banned(node.module):
                errors.append(f"{relative} imports from {node.module}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "__import__" and node.args:
                first = node.args[0]
                if isinstance(first, ast.Constant) and isinstance(first.value, str):
                    if module_is_banned(first.value):
                        errors.append(f"{relative} dynamically imports {first.value}")


def check_sources(errors: list[str]) -> None:
    if not SRC.is_dir():
        errors.append(f"missing {SRC.relative_to(REPO)}")
        return
    for path in sorted(SRC.rglob("*.py")):
        check_python_file(path, errors)


def main(argv: list[str] | None = None) -> int:
    del argv
    errors: list[str] = []
    if not PACKAGE.is_dir():
        print("CCL-free ingestion check FAILED:", file=sys.stderr)
        print("  - missing smartmetadata-ingestion/", file=sys.stderr)
        return 1
    check_pyproject(errors)
    check_license(errors)
    check_sources(errors)
    if errors:
        print("CCL-free ingestion check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PHASE6.md and ADR:2026-10-22-clean-room-ingestion-framework.",
            file=sys.stderr,
        )
        return 1
    print("CCL-free ingestion check passed.")
    print(f"  package: {PACKAGE.relative_to(REPO)}")
    print("  no CCL ingestion / airflow-apis imports or dependencies")
    return 0


if __name__ == "__main__":
    sys.exit(main())
