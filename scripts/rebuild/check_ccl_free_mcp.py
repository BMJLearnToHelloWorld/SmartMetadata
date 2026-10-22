#!/usr/bin/env python3
"""Fail if the clean-room MCP package imports or depends on CCL MCP.

Checks ``smartmetadata-mcp/`` only:

1. ``package.json`` does not depend on ``openmetadata-mcp`` or
   ``@openmetadata/mcp``.
2. TypeScript sources do not mention official MCP module paths or the Java
   package ``org.openmetadata.mcp``.
3. LICENSE is Apache-2.0 and does not contain Collate Community License text.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PACKAGE = REPO / "smartmetadata-mcp"
SRC = PACKAGE / "src"
PACKAGE_JSON = PACKAGE / "package.json"
LICENSE = PACKAGE / "LICENSE"

BANNED_DEP_MARKERS = (
    "openmetadata-mcp",
    "@openmetadata/mcp",
    "org.openmetadata.mcp",
)
BANNED_SOURCE = re.compile(
    r"openmetadata-mcp|@openmetadata/mcp|org\.openmetadata\.mcp|openmetadata/mcp"
)
CCL_MARKERS = (
    "collate community license",
    "collate community licence",
)


def check_package_json(errors: list[str]) -> None:
    if not PACKAGE_JSON.is_file():
        errors.append(f"missing {PACKAGE_JSON.relative_to(REPO)}")
        return
    try:
        payload = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{PACKAGE_JSON.relative_to(REPO)} is not valid JSON: {exc}")
        return
    if payload.get("name") != "smartmetadata-mcp":
        errors.append(f"{PACKAGE_JSON.relative_to(REPO)} name must be smartmetadata-mcp")
    deps: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        block = payload.get(key) or {}
        if isinstance(block, dict):
            deps.update(block)
    for name in deps:
        lowered = name.lower()
        if lowered in {"openmetadata-mcp", "@openmetadata/mcp"} or "openmetadata-mcp" in lowered:
            errors.append(f"{PACKAGE_JSON.relative_to(REPO)} depends on banned package {name}")


def check_license(errors: list[str]) -> None:
    if not LICENSE.is_file():
        errors.append(f"missing {LICENSE.relative_to(REPO)}")
        return
    text = LICENSE.read_text(encoding="utf-8")
    if "Apache License" not in text:
        errors.append(f"{LICENSE.relative_to(REPO)} is not Apache-2.0")
    if any(marker in text.lower() for marker in CCL_MARKERS):
        errors.append(f"{LICENSE.relative_to(REPO)} contains Collate Community License text")


def check_sources(errors: list[str]) -> None:
    if not SRC.is_dir():
        errors.append(f"missing {SRC.relative_to(REPO)}")
        return
    for path in sorted(SRC.rglob("*.ts")):
        text = path.read_text(encoding="utf-8")
        if BANNED_SOURCE.search(text):
            errors.append(f"{path.relative_to(REPO)} mentions official CCL MCP")


def main(argv: list[str] | None = None) -> int:
    del argv
    errors: list[str] = []
    if not PACKAGE.is_dir():
        print("CCL-free MCP check FAILED:", file=sys.stderr)
        print("  - missing smartmetadata-mcp/", file=sys.stderr)
        return 1
    check_package_json(errors)
    check_license(errors)
    check_sources(errors)
    if errors:
        print("CCL-free MCP check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PHASE10.md and ADR:2026-10-22-clean-room-mcp-is-a-standalone-apache-package.",
            file=sys.stderr,
        )
        return 1
    print("CCL-free MCP check passed.")
    print(f"  package: {PACKAGE.relative_to(REPO)}")
    print("  no official openmetadata-mcp imports or dependencies")
    return 0


if __name__ == "__main__":
    sys.exit(main())
