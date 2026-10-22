#!/usr/bin/env python3
"""Fail if purged Collate Community License trees reappear.

The product is Apache server core plus ``smartmetadata-ui/``,
``smartmetadata-ingestion/``, and ``smartmetadata-mcp/``. Official CCL
modules and Collate-image compose were deleted
(ADR:2026-10-22-ccl-trees-are-purged). This gate fails if those paths
return, if the root reactor lists them, or if the product Makefile still
includes ``ingestion/Makefile``.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT_POM = Path("pom.xml")
MAKEFILE = Path("Makefile")

PURGED_PATHS = (
    "ingestion",
    "openmetadata-ui",
    "openmetadata-mcp",
    "openmetadata-ui-core-components",
    "openmetadata-airflow-apis",
    "docker/docker-compose-quickstart",
    "docker/docker-compose-ingestion",
    "docker/docker-compose-openmetadata",
)
PURGED_MAVEN_MODULES = (
    "openmetadata-ui",
    "openmetadata-mcp",
    "openmetadata-ui-core-components",
)


def local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def pom_modules(pom: Path) -> list[str]:
    tree = ET.parse(pom)
    found: list[str] = []
    for el in tree.iter():
        if local_tag(el.tag) == "module" and el.text:
            found.append(el.text.strip())
    return found


def check_repo(repo: Path) -> list[str]:
    errors: list[str] = []
    for rel in PURGED_PATHS:
        path = repo / rel
        if path.exists():
            errors.append(f"purged path reappeared: {rel}")

    pom = repo / ROOT_POM
    if not pom.is_file():
        errors.append(f"missing {ROOT_POM}")
    else:
        modules = pom_modules(pom)
        for artifact in PURGED_MAVEN_MODULES:
            if artifact in modules:
                errors.append(f"{ROOT_POM} still lists <module>{artifact}</module>")

    makefile = repo / MAKEFILE
    if not makefile.is_file():
        errors.append(f"missing {MAKEFILE}")
    else:
        text = makefile.read_text(encoding="utf-8")
        if "include ingestion/Makefile" in text:
            errors.append(f"{MAKEFILE} still includes ingestion/Makefile")
        if "cd openmetadata-ui/" in text:
            errors.append(f"{MAKEFILE} still cds into purged openmetadata-ui/")
    return errors


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo",
        type=Path,
        default=REPO,
        help="repository root (defaults to this checkout)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    repo = args.repo.resolve()
    errors = check_repo(repo)
    if errors:
        print("Purged-tree check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PRODUCT_PATH.md and ADR:2026-10-22-ccl-trees-are-purged.",
            file=sys.stderr,
        )
        return 1
    print("Purged-tree check passed.")
    print("  missing:", ", ".join(PURGED_PATHS))
    print("  reactor: no CCL Maven modules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
