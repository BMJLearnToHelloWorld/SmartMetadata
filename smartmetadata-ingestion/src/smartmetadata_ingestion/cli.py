# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from smartmetadata_ingestion import __version__
from smartmetadata_ingestion.classification.models import install_models
from smartmetadata_ingestion.config import load_workflow_config
from smartmetadata_ingestion.errors import IngestError
from smartmetadata_ingestion.progress import RunReport
from smartmetadata_ingestion.runner import run_workflow


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="smartmetadata-ingest",
        description="Run a clean-room SmartMetadata ingestion workflow.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Run a workflow from a YAML or JSON config file")
    run.add_argument("--config", required=True, help="Path to the workflow config")
    classify = sub.add_parser(
        "classify",
        help="Run an autoClassification workflow from a YAML or JSON config file",
    )
    classify.add_argument("--config", required=True, help="Path to the workflow config")
    install = sub.add_parser(
        "install-classification-models",
        help="Provision the spaCy models the classification engine needs",
    )
    install.add_argument(
        "--languages",
        required=True,
        help="Comma-separated ClassificationLanguage identifiers to provision "
        "(e.g. en,es; 'any' provisions the English model)",
    )
    install.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the models that would be installed without installing them",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "install-classification-models":
            return _install_classification_models(args.languages, args.dry_run)
        config = load_workflow_config(Path(args.config))
        if args.command == "classify" and config.workflow.type != "autoClassification":
            raise IngestError(
                f"classify runs only autoClassification workflows; config "
                f"{args.config} declares type {config.workflow.type!r}"
            )
        report = run_workflow(config)
    except IngestError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    _print_report(report)
    return 0 if report.ok() else 1


def _install_classification_models(languages: str, dry_run: bool) -> int:
    """Provision spaCy models into the running environment.

    The images run this command at build time, so a deployed run never
    downloads a model at runtime. Segments are stripped but never
    silently dropped: an empty segment (a trailing or doubled comma,
    or a whitespace-only value) is a user error, not a shorter list.
    The completion report distinguishes the models this run installed
    from the models that were already available.
    """
    parsed = [language.strip() for language in languages.split(",")]
    if any(not language for language in parsed):
        print(
            f"error: --languages has an empty segment (got {languages!r}); "
            "name every language explicitly, e.g. --languages en,es",
            file=sys.stderr,
        )
        return 2
    outcome = install_models(parsed, dry_run=dry_run)
    if not dry_run:
        for model in outcome.installed:
            print(f"installed {model}")
        if outcome.already_available:
            print(f"already available: {', '.join(outcome.already_available)}")
    return 0


def _print_report(report: RunReport) -> None:
    payload = {
        "workflow": report.workflow_name,
        "succeeded": report.succeeded,
        "skipped": report.skipped,
        "failed": report.failed,
        "failures": [
            {
                "label": item.label,
                "kind": item.kind,
                "message": item.message,
                **({"stack_trace": item.stack_trace} if item.stack_trace else {}),
            }
            for item in report.failures
        ],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
