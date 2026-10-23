#!/usr/bin/env python3
"""Refuse historical CCL/reference-stack execution unless explicitly acknowledged.

Product Make, ``scripts/dev_setup.sh``, historical ``run_local_docker.sh``,
and Collate quickstart compose must not run ``openmetadata-ui/``,
``ingestion/``, ``openmetadata-mcp/``, ``openmetadata-airflow-apis/``, or
``openmetadata-ui-core-components`` unless ``I_UNDERSTAND_REFERENCE_STACK=1``.

``I_UNDERSTAND_CCL_INGESTION`` is only for ``run_local_docker.sh -i true``
after the reference-stack hatch; it does not unlock Make or product Docker.

Stdlib only. Exit 0 when the hatch is set, 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import sys

ENV_NAME = "I_UNDERSTAND_REFERENCE_STACK"
PRODUCT_PATH = "docs/rebuild/PRODUCT_PATH.md"
RED = "\033[0;31m"
NC = "\033[0m"

SUBSTITUTES = {
    "yarn_start_dev_ui": "make ui_dev",
    "yarn_install_cache": "make ui_install",
    "yarn_start_e2e": "make ui_test (product UI). Playwright against openmetadata-ui is reference-only",
    "yarn_start_e2e_ui": "make ui_test (product UI). Playwright against openmetadata-ui is reference-only",
    "yarn_start_e2e_codegen": "make ui_test (product UI). Playwright against openmetadata-ui is reference-only",
    "install": "make ingest_install",
    "install_dev": "make ingest_install",
    "install_dev_env": "make ingest_install",
    "install_test": "make ingest_test",
    "install_all": "make ingest_install",
    "install_apis": "not a product package; see docs/rebuild/PRODUCT_PATH.md",
    "install_e2e_tests": "make ingest_test / make ui_test",
    "run_e2e_tests": "make ingest_test / make ui_test",
    "generate": "CCL pydantic/TS generate is reference-only; product ingest is smartmetadata-ingestion",
    "py_antlr": "CCL ingestion ANTLR generate is reference-only",
    "js_antlr": "CCL openmetadata-ui ANTLR generate is reference-only",
    "dev_setup": "make ui_install && make ingest_install && make mcp_install && make slim-dist",
    "dev_check": "make verify-rebuild",
    "compose-quickstart": "make docker-up",
    "run_local_docker": "make docker-up",
    "run_local_docker_rdf": "make docker-up",
    "unit_ingestion": "make ingest_test",
    "unit_ingestion_dev_env": "make ingest_test",
    "py_format": "format smartmetadata-ingestion/ (product) rather than ingestion/",
    "precommit_install": "product hooks: follow docs/rebuild/PRODUCT_PATH.md; do not install CCL ingestion hooks by default",
    "ui-checkstyle-all": "product UI is smartmetadata-ui; make ui_test / make ui_build",
    "playwright_affected": "product UI is smartmetadata-ui; historical Playwright is reference-only",
    "playwright_affected_run": "product UI is smartmetadata-ui; historical Playwright is reference-only",
    "snyk-ui-report": "scan smartmetadata-ui, not openmetadata-ui",
    "snyk-ingestion-report": "scan smartmetadata-ingestion, not ingestion/",
    "build-ingestion-base-local": "product ingest is smartmetadata-ingestion, not the CCL operator image",
    "update_typescript_types": "product UI is Vue in smartmetadata-ui/, not openmetadata-ui JSON2TS",
}


def substitute_for(target: str) -> str:
    if target in SUBSTITUTES:
        return SUBSTITUTES[target]
    if target.startswith("yarn_"):
        return "make ui_install / make ui_dev / make ui_test"
    if target.startswith("ui-checkstyle") or target.startswith("tsc-"):
        return "make ui_build (smartmetadata-ui)"
    if target.startswith("snyk-ingestion") or target.startswith("build-ingestion"):
        return "make ingest_install / make ingest_test"
    if "airflow" in target:
        return "openmetadata-airflow-apis is not a product package"
    return f"see {PRODUCT_PATH} (slim-dist, docker-up, ui_*, ingest_*, mcp_*)"


def hatch_set(env: dict[str, str] | None = None) -> bool:
    source = os.environ if env is None else env
    return source.get(ENV_NAME, "") == "1"


def refusal_message(target: str) -> str:
    substitute = substitute_for(target)
    return (
        f"{RED}========================================================================\n"
        f"ERROR: {target} executes the historical Collate Community License\n"
        f"/ reference stack. That is NOT the SmartMetadata product path.\n"
        f"\n"
        f"Product substitute: {substitute}\n"
        f"Product map: {PRODUCT_PATH}\n"
        f"\n"
        f"To run this reference-only command, export {ENV_NAME}=1\n"
        f"========================================================================{NC}\n"
    )


def allow_message(target: str) -> str:
    return (
        f"Proceeding with reference-stack target {target} because "
        f"{ENV_NAME}=1 is set.\n"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target",
        default="reference-stack",
        help="Make target, script, or compose wrapper being gated",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    target = args.target
    if hatch_set():
        sys.stderr.write(allow_message(target))
        return 0
    sys.stderr.write(refusal_message(target))
    return 1


if __name__ == "__main__":
    sys.exit(main())
