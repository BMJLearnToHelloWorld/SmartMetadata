#!/usr/bin/env python3
"""Fail if the CCL-free product-path misuse guards are missing.

Checks docs, README, Make execution isolation, and the local-docker ack —
not the shippable dist. Dist exclusions stay with
``check_ccl_free_dist.py`` / Maven Enforcer ``ban-ccl-modules``; this
script does not re-scan ``openmetadata-dist``.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRODUCT_PATH = Path("docs") / "rebuild" / "PRODUCT_PATH.md"
ADR = Path("docs") / "decisions" / "2026-10-22-ccl-trees-stay-reference-only.md"
ADR_MAKE = Path("docs") / "decisions" / "2026-10-22-product-make-is-rebuild-only.md"
DOCKER_COMMON = Path("docker") / "run_local_docker_common.sh"
README = Path("README.md")
MAKEFILE = Path("Makefile")
MAKEFILE_REFERENCE = Path("Makefile.reference")
REFERENCE_GUARD = Path("scripts") / "rebuild" / "require_reference_stack.py"
QUICKSTART_COMPOSE = Path("docker") / "docker-compose-quickstart" / "docker-compose.yml"
QUICKSTART_WRAPPER = Path("docker") / "docker-compose-quickstart" / "up.sh"
DEV_SETUP = Path("scripts") / "dev_setup.sh"
HATCH = "I_UNDERSTAND_REFERENCE_STACK"

REQUIRED_PRODUCT_PATH_MARKERS = (
    "smartmetadata-ui",
    "smartmetadata-ingestion",
    "smartmetadata-mcp",
    "slim-dist",
    "I_UNDERSTAND_CCL_INGESTION",
    "I_UNDERSTAND_REFERENCE_STACK",
    "-i true",
    "quickstart",
    "openmetadata-airflow-apis",
    "openmetadata-ui-core-components",
    "reference-only",
    "make help",
    "Makefile.reference",
)
DOCKER_ACK_MARKERS = (
    "I_UNDERSTAND_CCL_INGESTION",
    "require_ccl_ingestion_ack",
)
DOCKER_CALL_SITE = (
    'if [[ $includeIngestion == "true" ]]; then\n    require_ccl_ingestion_ack\n  fi'
)
CCL_RECIPE_NEEDLES = (
    "cd openmetadata-ui",
    "cd ingestion",
    "cd openmetadata-mcp",
    "cd openmetadata-airflow-apis",
    "cd openmetadata-ui-core-components",
    "pip install ingestion",
    'pip install "ingestion',
    "pip install $(INGESTION_DIR)",
)


def read_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _conditional_stack_push(stripped: str, stack: list[bool]) -> bool:
    if stripped.startswith("ifeq") and HATCH in stripped:
        stack.append(True)
        return True
    if stripped.startswith(("ifeq", "ifneq", "ifdef", "ifndef")):
        stack.append(False)
        return True
    return False


def ingestion_include_is_gated(makefile_text: str) -> list[str]:
    """Fail if ``include ingestion/Makefile`` is parsed on the product path."""
    errors: list[str] = []
    stack: list[bool] = []
    saw_gated_include = False
    for lineno, raw in enumerate(makefile_text.splitlines(), start=1):
        stripped = raw.split("#", 1)[0].strip()
        if _conditional_stack_push(stripped, stack):
            continue
        if stripped == "else" and stack:
            stack[-1] = not stack[-1]
            continue
        if stripped == "endif":
            if stack:
                stack.pop()
            continue
        if stripped == "include ingestion/Makefile":
            if stack and stack[-1]:
                saw_gated_include = True
            else:
                errors.append(
                    f"{MAKEFILE}:{lineno} includes ingestion/Makefile outside "
                    f"ifeq ($({HATCH}),1)"
                )
    if not saw_gated_include and not errors:
        errors.append(
            f"{MAKEFILE} must include ingestion/Makefile only inside "
            f"ifeq ($({HATCH}),1) so the escape hatch still works"
        )
    return errors


def product_makefile_body(makefile_text: str) -> str:
    """Makefile text with the reference-stack ifeq/else/endif block removed."""
    kept: list[str] = []
    stack: list[bool] = []
    for raw in makefile_text.splitlines():
        stripped = raw.split("#", 1)[0].strip()
        if _conditional_stack_push(stripped, stack):
            continue
        if stripped == "else" and stack:
            stack[-1] = not stack[-1]
            continue
        if stripped == "endif":
            if stack:
                stack.pop()
            continue
        if stack:
            continue
        kept.append(raw)
    return "\n".join(kept) + ("\n" if kept else "")


def check_makefile(repo: Path) -> list[str]:
    errors: list[str] = []
    makefile = repo / MAKEFILE
    text = read_text(makefile)
    if text is None:
        return [f"missing {MAKEFILE}"]
    if HATCH not in text:
        errors.append(f"{MAKEFILE} must mention {HATCH}")
    if "include Makefile.reference" not in text:
        errors.append(f"{MAKEFILE} must include Makefile.reference behind {HATCH}")
    errors.extend(ingestion_include_is_gated(text))
    body = product_makefile_body(text)
    for needle in CCL_RECIPE_NEEDLES:
        if needle in body:
            errors.append(
                f"{MAKEFILE} product recipes must not execute {needle!r}; "
                "move them to Makefile.reference behind the hatch"
            )
    if not (repo / MAKEFILE_REFERENCE).is_file():
        errors.append(f"missing {MAKEFILE_REFERENCE}")
    else:
        reference = (repo / MAKEFILE_REFERENCE).read_text(encoding="utf-8")
        if "yarn_start_dev_ui" not in reference:
            errors.append(f"{MAKEFILE_REFERENCE} must keep yarn_start_dev_ui for the hatch")
    guard = repo / REFERENCE_GUARD
    if not guard.is_file():
        errors.append(f"missing {REFERENCE_GUARD}")
    else:
        guard_text = guard.read_text(encoding="utf-8")
        if HATCH not in guard_text:
            errors.append(f"{REFERENCE_GUARD} must require {HATCH}")
        if "NOT the SmartMetadata product path" not in guard_text:
            errors.append(f"{REFERENCE_GUARD} must refuse with a product-path error")
    return errors


def check_root_workspaces(repo: Path) -> list[str]:
    root_pkg = repo / "package.json"
    if not root_pkg.is_file():
        return []
    try:
        pkg = json.loads(root_pkg.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"package.json is not valid JSON: {exc}"]
    workspaces = pkg.get("workspaces") or []
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages") or []
    errors: list[str] = []
    for item in workspaces:
        text = str(item)
        if "openmetadata-ui" in text or "openmetadata-ui-core-components" in text:
            errors.append(
                f"root package.json workspaces must not pull {text} into product installs"
            )
    return errors


def check_dev_setup_and_compose(repo: Path) -> list[str]:
    errors: list[str] = []
    dev_setup = read_text(repo / DEV_SETUP)
    if dev_setup is None:
        errors.append(f"missing {DEV_SETUP}")
    elif "require_reference_stack.py" not in dev_setup:
        errors.append(f"{DEV_SETUP} must call require_reference_stack.py before installing CCL trees")
    compose = read_text(repo / QUICKSTART_COMPOSE)
    if compose is None:
        errors.append(f"missing {QUICKSTART_COMPOSE}")
    elif "not a SmartMetadata product demo" not in compose:
        errors.append(
            f"{QUICKSTART_COMPOSE} must say it is not a SmartMetadata product demo"
        )
    wrapper = read_text(repo / QUICKSTART_WRAPPER)
    if wrapper is None:
        errors.append(f"missing {QUICKSTART_WRAPPER}")
    else:
        if "require_reference_stack.py" not in wrapper:
            errors.append(f"{QUICKSTART_WRAPPER} must call require_reference_stack.py")
        if "docker compose" not in wrapper:
            errors.append(f"{QUICKSTART_WRAPPER} must exec docker compose after the hatch")
    return errors


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
    if not (repo / ADR_MAKE).is_file():
        errors.append(f"missing {ADR_MAKE}")

    docker_text = read_text(repo / DOCKER_COMMON)
    if docker_text is None:
        errors.append(f"missing {DOCKER_COMMON}")
    else:
        for marker in DOCKER_ACK_MARKERS:
            if marker not in docker_text:
                errors.append(
                    f"{DOCKER_COMMON} must require {marker} before -i true starts CCL ingestion"
                )
        if DOCKER_CALL_SITE not in docker_text:
            errors.append(
                f"{DOCKER_COMMON} must call require_ccl_ingestion_ack when includeIngestion is true"
            )

    readme_text = read_text(repo / README)
    if readme_text is None:
        errors.append(f"missing {README}")
    elif "docs/rebuild/PRODUCT_PATH.md" not in readme_text:
        errors.append(f"{README} must point at {PRODUCT_PATH}")
    elif HATCH not in (readme_text or ""):
        errors.append(f"{README} must mention {HATCH}")

    errors.extend(check_makefile(repo))
    errors.extend(check_root_workspaces(repo))
    errors.extend(check_dev_setup_and_compose(repo))
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
            "ADR:2026-10-22-product-make-is-rebuild-only.",
            file=sys.stderr,
        )
        return 1
    print("Product-path hint check passed.")
    print(f"  product path: {PRODUCT_PATH}")
    print(f"  docker ack: {DOCKER_COMMON} requires I_UNDERSTAND_CCL_INGESTION")
    print(f"  make hatch: {MAKEFILE} requires {HATCH} before CCL recipes")
    print("  dist scan: not this script (check_ccl_free_dist.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
