#!/usr/bin/env python3
"""Run the offline Phase 11 rebuild verification matrix.

Runs the product-package tests, the three CCL-free gates, the product-path
hint check, the decision-record check, and the Apache positive-regression lock. Does **not** start Docker, MySQL,
Elasticsearch, Airflow, or a live catalog, and does not build
``openmetadata-dist`` unless ``--require-tarball`` is passed.

See ``docs/rebuild/PHASE11.md``, ``docs/rebuild/VERIFY_RUNTIME.md``,
ADR:2026-10-22-rebuild-verify-is-offline, and
ADR:2026-10-22-rebuild-ci-is-a-separate-workflow.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PYTHON = sys.executable


@dataclass(frozen=True)
class Step:
    id: str
    argv: tuple[str, ...]
    cwd: str | None = None


def npm_argv(*args: str) -> tuple[str, ...]:
    # Resolve at run time so ``--list`` works on hosts without Node.
    return ("npm", *args)


def _tool_version(argv: tuple[str, ...]) -> str:
    completed = subprocess.run(list(argv), check=False, capture_output=True, text=True)
    printed = (completed.stdout or completed.stderr).strip()
    return printed.splitlines()[0] if printed else "unavailable"


def node_runtime_lines() -> list[str]:
    """Report the Node that ``npm test`` will invoke (PATH after setup-node)."""
    node = shutil.which("node") or "not-on-PATH"
    npm = shutil.which("npm") or "not-on-PATH"
    return [
        f"  node: {_tool_version(('node', '-v'))} ({node})",
        f"  npm: {_tool_version(('npm', '-v'))} ({npm})",
    ]


def install_steps() -> list[Step]:
    return [
        Step(id="ui-install", argv=npm_argv("ci"), cwd="smartmetadata-ui"),
        Step(
            id="ingest-install",
            argv=(PYTHON, "-m", "pip", "install", "-e", "smartmetadata-ingestion/[dev]"),
        ),
        Step(id="mcp-install", argv=npm_argv("ci"), cwd="smartmetadata-mcp"),
        Step(
            id="airflow-apis-install",
            argv=(PYTHON, "-m", "pip", "install", "-e", "smartmetadata-airflow-apis/[test]"),
        ),
    ]


def verify_steps(*, require_tarball: bool = False) -> list[Step]:
    dist_argv = [PYTHON, "scripts/rebuild/check_ccl_free_dist.py"]
    if require_tarball:
        dist_argv.append("--require-tarball")
    return [
        Step(id="ui-test", argv=npm_argv("test"), cwd="smartmetadata-ui"),
        Step(id="ui-build", argv=npm_argv("run", "build"), cwd="smartmetadata-ui"),
        Step(id="ingest-test", argv=(PYTHON, "-m", "pytest"), cwd="smartmetadata-ingestion"),
        Step(
            id="ccl-ingestion",
            argv=(PYTHON, "scripts/rebuild/check_ccl_free_ingestion.py"),
        ),
        Step(id="mcp-test", argv=npm_argv("test"), cwd="smartmetadata-mcp"),
        Step(id="mcp-build", argv=npm_argv("run", "build"), cwd="smartmetadata-mcp"),
        Step(id="ccl-dist", argv=tuple(dist_argv)),
        Step(id="ccl-mcp", argv=(PYTHON, "scripts/rebuild/check_ccl_free_mcp.py")),
        Step(
            id="product-path-hints",
            argv=(PYTHON, "scripts/rebuild/check_product_path_hints.py"),
        ),
        Step(
            id="reference-stack-contract",
            argv=(PYTHON, "scripts/rebuild/test_require_reference_stack.py"),
        ),
        Step(
            id="decision-records",
            argv=(PYTHON, "scripts/harness/check_decision_records.py"),
        ),
        Step(
            id="live-smoke-contract",
            argv=(PYTHON, "scripts/rebuild/test_live_smoke.py"),
        ),
        Step(
            id="rebuild-ci-contract",
            argv=(PYTHON, "scripts/rebuild/test_rebuild_workflows.py"),
        ),
        Step(
            id="pr-hygiene-contract",
            argv=(PYTHON, "scripts/rebuild/test_pr_hygiene_workflows.py"),
        ),
        Step(
            id="apache-positive-regression",
            argv=(PYTHON, "scripts/rebuild/check_apache_positive_regression.py"),
        ),
        Step(
            id="apache-positive-regression-contract",
            argv=(PYTHON, "scripts/rebuild/test_apache_positive_regression.py"),
        ),
        Step(
            id="airflow-apis-test",
            argv=(PYTHON, "-m", "pytest"),
            cwd="smartmetadata-airflow-apis",
        ),
    ]


def node_modules_ready(package_dir: Path) -> bool:
    return (package_dir / "node_modules").is_dir()


def ingestion_importable() -> bool:
    probe = subprocess.run(
        [PYTHON, "-c", "import smartmetadata_ingestion"],
        check=False,
        capture_output=True,
    )
    return probe.returncode == 0


def airflow_apis_importable() -> bool:
    probe = subprocess.run(
        [PYTHON, "-c", "import flask; import smartmetadata_airflow_apis"],
        check=False,
        capture_output=True,
    )
    return probe.returncode == 0


def needed_install_steps() -> list[Step]:
    needed: list[Step] = []
    by_id = {step.id: step for step in install_steps()}
    if not node_modules_ready(REPO / "smartmetadata-ui"):
        needed.append(by_id["ui-install"])
    if not ingestion_importable():
        needed.append(by_id["ingest-install"])
    if not node_modules_ready(REPO / "smartmetadata-mcp"):
        needed.append(by_id["mcp-install"])
    if not airflow_apis_importable():
        needed.append(by_id["airflow-apis-install"])
    return needed


def default_steps(*, install: bool | None = None, require_tarball: bool = False) -> list[Step]:
    if install is True:
        prefix = install_steps()
    elif install is False:
        prefix = []
    else:
        prefix = needed_install_steps()
    return [*prefix, *verify_steps(require_tarball=require_tarball)]


def run_step(step: Step, *, repo: Path) -> int:
    cwd = repo / step.cwd if step.cwd else repo
    printable = " ".join(step.argv)
    print(f"==> {step.id}: {printable}", flush=True)
    print(f"    cwd: {cwd}", flush=True)
    completed = subprocess.run(list(step.argv), cwd=cwd, check=False)
    if completed.returncode != 0:
        print(f"==> {step.id} FAILED (exit {completed.returncode})", file=sys.stderr, flush=True)
    else:
        print(f"==> {step.id} ok", flush=True)
    return completed.returncode


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    install = parser.add_mutually_exclusive_group()
    install.add_argument(
        "--install",
        action="store_true",
        help="always run ui/ingest/mcp install steps first",
    )
    install.add_argument(
        "--skip-install",
        action="store_true",
        help="never run install steps (fail if packages are missing)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="print the steps that would run and exit 0",
    )
    parser.add_argument(
        "--require-tarball",
        action="store_true",
        help="fail the dist gate if openmetadata-dist/target/*.tar.gz is missing",
    )
    return parser.parse_args(argv)


def selected_steps(args: argparse.Namespace) -> list[Step]:
    if args.install:
        install: bool | None = True
    elif args.skip_install:
        install = False
    else:
        install = None
    return default_steps(install=install, require_tarball=args.require_tarball)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    steps = selected_steps(args)
    if args.list:
        for step in steps:
            where = step.cwd or "."
            print(f"{step.id}\t{where}\t{' '.join(step.argv)}")
        return 0

    print("SmartMetadata rebuild verify (offline, no live catalog)")
    print(f"  repo: {REPO}")
    print(f"  steps: {', '.join(step.id for step in steps)}")
    for line in node_runtime_lines():
        print(line)
    if os.environ.get("CI"):
        print("  CI=1: still offline — live server/UI paths are Job C in docs/rebuild/VERIFY_RUNTIME.md")

    for step in steps:
        code = run_step(step, repo=REPO)
        if code != 0:
            print(
                "See docs/rebuild/VERIFY_RUNTIME.md. Live catalog is GitHub Actions Job C, "
                "not this command.",
                file=sys.stderr,
            )
            return code

    print("Rebuild verify passed.")
    print("  " + ", ".join(step.id for step in steps))
    return 0


if __name__ == "__main__":
    sys.exit(main())
