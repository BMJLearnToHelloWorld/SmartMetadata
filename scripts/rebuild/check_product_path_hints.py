#!/usr/bin/env python3
"""Fail if the CCL-free product-path misuse guards are missing.

Checks docs, README, and the local-docker ack — not the shippable dist.
Dist exclusions stay with ``check_ccl_free_dist.py`` / Maven Enforcer
``ban-ccl-modules``; this script does not re-scan ``openmetadata-dist``.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRODUCT_PATH = Path("docs") / "rebuild" / "PRODUCT_PATH.md"
ADR = Path("docs") / "decisions" / "2026-10-22-ccl-trees-stay-reference-only.md"
DOCKER_COMMON = Path("docker") / "run_local_docker_common.sh"
README = Path("README.md")

REQUIRED_PRODUCT_PATH_MARKERS = (
    "smartmetadata-ui",
    "smartmetadata-ingestion",
    "smartmetadata-mcp",
    "slim-dist",
    "I_UNDERSTAND_CCL_INGESTION",
    "-i true",
    "quickstart",
    "openmetadata-airflow-apis",
    "openmetadata-ui-core-components",
    "reference-only",
)
DOCKER_ACK_MARKERS = (
    "I_UNDERSTAND_CCL_INGESTION",
    "require_ccl_ingestion_ack",
)


def read_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def check_repo(repo: Path) -> list[str]:
    errors: list[str] = []

    product_path = repo / PRODUCT_PATH
    product_text = read_text(product_path)
    if product_text is None:
        errors.append(f"missing {PRODUCT_PATH}")
    else:
        lowered = product_text.lower()
        for marker in REQUIRED_PRODUCT_PATH_MARKERS:
            if marker.lower() not in lowered:
                errors.append(f"{PRODUCT_PATH} must mention {marker!r}")

    if not (repo / ADR).is_file():
        errors.append(f"missing {ADR}")

    docker_text = read_text(repo / DOCKER_COMMON)
    if docker_text is None:
        errors.append(f"missing {DOCKER_COMMON}")
    else:
        for marker in DOCKER_ACK_MARKERS:
            if marker not in docker_text:
                errors.append(
                    f"{DOCKER_COMMON} must require {marker} before -i true starts CCL ingestion"
                )

    readme_text = read_text(repo / README)
    if readme_text is None:
        errors.append(f"missing {README}")
    elif "docs/rebuild/PRODUCT_PATH.md" not in readme_text:
        errors.append(f"{README} must point at {PRODUCT_PATH}")

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
        print("Product-path hint check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PRODUCT_PATH.md and "
            "ADR:2026-10-22-ccl-trees-stay-reference-only.",
            file=sys.stderr,
        )
        return 1
    print("Product-path hint check passed.")
    print(f"  product path: {PRODUCT_PATH}")
    print(f"  docker ack: {DOCKER_COMMON} requires I_UNDERSTAND_CCL_INGESTION")
    print("  dist scan: not this script (check_ccl_free_dist.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
