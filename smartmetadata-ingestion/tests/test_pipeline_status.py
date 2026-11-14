# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import time

import pytest

from smartmetadata_ingestion.pipeline_status import (
    build_pipeline_status,
    final_pipeline_state,
    step_summary,
)
from smartmetadata_ingestion.progress import (
    RecordFailure,
    RunReport,
    StepProgress,
    StepStatus,
)


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


def test_step_summary_reports_true_warnings_and_updates() -> None:
    status = StepStatus(name="Sink", records=2, warnings=3, updated_records=1)
    summary = step_summary(status)
    assert summary["warnings"] == 3
    assert summary["updated_records"] == 1


def test_step_status_warn_increments_warnings() -> None:
    status = StepStatus(name="Source")
    status.warn()
    status.warn(2)
    status.warn(0)
    assert status.warnings == 3
    assert step_summary(status)["warnings"] == 3


def test_step_status_warn_rejects_negative_counts() -> None:
    status = StepStatus(name="Source")
    with pytest.raises(ValueError, match="must not be negative"):
        status.warn(-1)
    assert status.warnings == 0


def test_step_summary_progress_map_and_eta() -> None:
    status = StepStatus(name="Source")
    status.set_total("table", 4)
    status.complete("table")
    # Nothing processed yet for schemas: no estimate is emitted.
    status.set_total("schema", 2)
    summary = step_summary(status)
    assert summary["progress"]["schema"] == {"total": 2, "processed": 0}
    # Nothing processed means no rate to extrapolate: no estimate.
    assert "estimatedRemainingSeconds" not in summary["progress"]["schema"]
    # Nothing left means no estimate either.
    status.complete("table", 3)
    assert "estimatedRemainingSeconds" not in step_summary(status)["progress"]["table"]
    status.progress["table"].processed = 1
    # With elapsed time against a known total, the estimate extrapolates
    # the observed rate: 10s for 1 of 4 leaves ~30s for the other 3.
    status.progress["table"].started_monotonic = time.monotonic() - 10
    summary = step_summary(status)
    eta = summary["progress"]["table"]["estimatedRemainingSeconds"]
    assert 25 <= eta <= 35


def test_step_summary_omits_empty_progress() -> None:
    assert "progress" not in step_summary(StepStatus(name="Processor"))


def test_step_progress_helpers_track_totals() -> None:
    status = StepStatus(name="Sink")
    status.expect("table")
    status.expect("table")
    status.complete("table")
    entry = status.progress["table"]
    assert isinstance(entry, StepProgress)
    assert (entry.total, entry.processed) == (2, 1)


def test_build_pipeline_status_includes_steps_while_running() -> None:
    payload = build_pipeline_status(
        run_id="r1",
        pipeline_state="running",
        start_ms=10,
        timestamp_ms=11,
        steps=[StepStatus(name="Source")],
    )
    assert payload["runId"] == "r1"
    assert payload["pipelineState"] == "running"
    # C-11: steps are present while running, not only when finished.
    assert payload["status"][0]["name"] == "Source"
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
