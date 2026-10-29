# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import json

from smartmetadata_ingestion.cli import _print_report
from smartmetadata_ingestion.progress import RecordFailure, RunReport


def test_cli_report_includes_stack_trace_when_present(capsys) -> None:
    report = RunReport(
        workflow_name="demo",
        failures=[
            RecordFailure(
                label="t",
                kind="table",
                message="boom",
                stack_trace="Traceback (most recent call last):\n  boom\n",
            )
        ],
    )
    _print_report(report)
    payload = json.loads(capsys.readouterr().out)
    assert payload["failures"][0]["stack_trace"].startswith("Traceback")


def test_cli_report_omits_stack_trace_key_when_absent(capsys) -> None:
    report = RunReport(
        workflow_name="demo",
        failures=[RecordFailure(label="t", kind="table", message="boom")],
    )
    _print_report(report)
    payload = json.loads(capsys.readouterr().out)
    assert "stack_trace" not in payload["failures"][0]
