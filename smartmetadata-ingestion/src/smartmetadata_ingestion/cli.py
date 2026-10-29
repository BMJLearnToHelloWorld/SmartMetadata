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
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command != "run":
        parser.error("unknown command")
    try:
        config = load_workflow_config(Path(args.config))
        report = run_workflow(config)
    except IngestError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    _print_report(report)
    return 0 if report.ok() else 1


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
                **(
                    {"stack_trace": item.stack_trace}
                    if item.stack_trace
                    else {}
                ),
            }
            for item in report.failures
        ],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
