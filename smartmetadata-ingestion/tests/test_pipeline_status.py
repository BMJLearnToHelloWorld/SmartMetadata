# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.pipeline_status import (
    build_pipeline_status,
    final_pipeline_state,
    step_summary,
)
from smartmetadata_ingestion.progress import RecordFailure, RunReport, StepStatus


def test_step_summary_includes_sampled_failures() -> None:
    status = StepStatus(name="Source", records=3, filtered=1)
    status.failures.append(
        RecordFailure(label="t", kind="table", message="boom", stack_trace="trace")
    )
    summary = step_summary(status)
    assert summary["name"] == "Source"
    assert summary["records"] == 3
    assert summary["filtered"] == 1
    assert summary["errors"] == 1
    assert summary["failures"][0]["stackTrace"] == "trace"


def test_final_pipeline_state_matrix() -> None:
    ok = RunReport(workflow_name="w", succeeded=2)
    assert final_pipeline_state(ok) == "success"
    partial = RunReport(workflow_name="w", succeeded=1)
    partial.failures.append(RecordFailure(label="a", kind="t", message="x"))
    assert final_pipeline_state(partial) == "partialSuccess"
    failed = RunReport(workflow_name="w")
    failed.failures.append(RecordFailure(label="a", kind="t", message="x"))
    assert final_pipeline_state(failed) == "failed"
    assert final_pipeline_state(ok, stopped=True) == "stopped"


def test_build_pipeline_status_omits_triggered_by_and_running_steps() -> None:
    payload = build_pipeline_status(
        run_id="r1",
        pipeline_state="running",
        start_ms=10,
        timestamp_ms=11,
        steps=[StepStatus(name="Source")],
    )
    assert payload["runId"] == "r1"
    assert payload["pipelineState"] == "running"
    assert "status" not in payload
    assert "triggeredBy" not in payload

    final = build_pipeline_status(
        run_id="r1",
        pipeline_state="success",
        start_ms=10,
        timestamp_ms=20,
        end_ms=20,
        steps=[StepStatus(name="Source", records=1)],
    )
    assert final["endDate"] == 20
    assert final["status"][0]["name"] == "Source"
