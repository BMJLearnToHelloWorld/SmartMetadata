#!/usr/bin/env python3
"""Fail if the CCL-free product-path docs and docker refusal are missing.

Checks docs, README, and the local-docker refusal — not the shippable dist.
This script does not import the dist scanner.
Dist exclusions stay with ``check_ccl_free_dist.py`` / Maven Enforcer
``ban-ccl-modules``. Tree absence stays with ``check_purged_trees.py``.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRODUCT_PATH = Path("docs") / "rebuild" / "PRODUCT_PATH.md"
PARITY = Path("docs") / "rebuild" / "PARITY.md"
ADR = Path("docs") / "decisions" / "2026-10-22-ccl-trees-are-purged.md"
DOCKER_COMMON = Path("docker") / "run_local_docker_common.sh"
README = Path("README.md")

REQUIRED_PRODUCT_PATH_MARKERS = (
    "smartmetadata-ui",
    "smartmetadata-ingestion",
    "smartmetadata-mcp",
    "slim-dist",
    "purged",
    "check_purged_trees.py",
    "PARITY.md",
)
DOCKER_REFUSE_MARKERS = (
    "purged",
    "smartmetadata-ingest",
)
DOCKER_CALL_SITE = (
    'if [[ $includeIngestion == "true" ]]; then\n    refuse_purged_ccl_ingestion\n  fi'
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
        if "reference-only" in lowered:
            errors.append(f"{PRODUCT_PATH} must not describe a reference-only CCL tree")
        for marker in REQUIRED_PRODUCT_PATH_MARKERS:
            if marker.lower() not in lowered:
                errors.append(f"{PRODUCT_PATH} must mention {marker!r}")

    if not (repo / ADR).is_file():
        errors.append(f"missing {ADR}")
    if not (repo / PARITY).is_file():
        errors.append(f"missing {PARITY}")

    docker_text = read_text(repo / DOCKER_COMMON)
    if docker_text is None:
        errors.append(f"missing {DOCKER_COMMON}")
    else:
        if "I_UNDERSTAND_CCL_INGESTION" in docker_text:
            errors.append(
                f"{DOCKER_COMMON} must not offer an override to start purged CCL ingestion"
            )
        for marker in DOCKER_REFUSE_MARKERS:
            if marker not in docker_text:
                errors.append(f"{DOCKER_COMMON} must mention {marker!r} when refusing -i true")
        if DOCKER_CALL_SITE not in docker_text:
            errors.append(
                f"{DOCKER_COMMON} must call refuse_purged_ccl_ingestion when includeIngestion is true"
            )
        if "return 0" in docker_text.split("refuse_purged_ccl_ingestion", 1)[-1][:400]:
            errors.append(f"{DOCKER_COMMON} must not succeed from refuse_purged_ccl_ingestion")

    readme_text = read_text(repo / README)
    if readme_text is None:
        errors.append(f"missing {README}")
    else:
        if "docs/rebuild/PRODUCT_PATH.md" not in readme_text:
            errors.append(f"{README} must point at {PRODUCT_PATH}")
        if "reference-only" in readme_text.lower():
            errors.append(f"{README} must not describe a reference-only CCL tree")

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
            "See docs/rebuild/PRODUCT_PATH.md and ADR:2026-10-22-ccl-trees-are-purged.",
            file=sys.stderr,
        )
        return 1
    print("Product-path hint check passed.")
    print(f"  product path: {PRODUCT_PATH}")
    print(f"  docker: {DOCKER_COMMON} refuses -i true (CCL ingestion purged)")
    print("  dist scan: not this script (check_ccl_free_dist.py)")
    print("  tree scan: not this script (check_purged_trees.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
