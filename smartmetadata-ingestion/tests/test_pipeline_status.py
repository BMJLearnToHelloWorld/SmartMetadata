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


def _report(succeeded: int, failures: int) -> RunReport:
    report = RunReport(workflow_name="w", succeeded=succeeded)
    for index in range(failures):
        report.failures.append(
            RecordFailure(label=f"a{index}", kind="t", message="x")
        )
    return report


def _step(records: int, failures: int, *, updated: int = 0) -> StepStatus:
    status = StepStatus(name="S", records=records, updated_records=updated)
    for index in range(failures):
        status.failures.append(
            RecordFailure(label=f"a{index}", kind="t", message="x")
        )
    return status


def test_final_pipeline_state_matrix() -> None:
    # Report-only callers (no step data) are judged as a single step
    # under the threshold rule: 100% success, >=90% partialSuccess,
    # below 90% failed, and stopped wins over all.
    assert final_pipeline_state(_report(2, 0)) == "success"
    assert final_pipeline_state(_report(0, 0)) == "success"
    assert final_pipeline_state(_report(9, 1)) == "partialSuccess"
    assert final_pipeline_state(_report(1, 1)) == "failed"
    assert final_pipeline_state(_report(0, 1)) == "failed"
    assert final_pipeline_state(_report(2, 0), stopped=True) == "stopped"
    assert final_pipeline_state(_report(9, 1), stopped=True) == "stopped"


def test_final_pipeline_state_threshold_boundaries() -> None:
    # Exactly at the threshold is partialSuccess; one point below is
    # failed. Exact fractions decide the boundary, not float rounding.
    assert final_pipeline_state(_report(90, 10)) == "partialSuccess"
    assert final_pipeline_state(_report(89, 11)) == "failed"
    assert final_pipeline_state(_report(90, 10), success_threshold=91) == "failed"
    assert final_pipeline_state(_report(90, 10), success_threshold=90) == "partialSuccess"
    assert final_pipeline_state(_report(1, 0), success_threshold=100) == "success"
    assert final_pipeline_state(_report(99, 1), success_threshold=100) == "failed"


def test_final_pipeline_state_uses_mean_of_step_rates() -> None:
    # The workflow rate is the MEAN of the steps' rates (D-S5/F1), not
    # the minimum and not the report totals: a 60% sink step averaged
    # with two clean steps rates 86.7% and fails at 90, while an 80%
    # sink step averages 93.3% and reports partialSuccess.
    clean = _step(5, 0)
    assert (
        final_pipeline_state(
            _report(0, 0), steps=[clean, _step(0, 0), _step(3, 2)]
        )
        == "failed"
    )
    assert (
        final_pipeline_state(
            _report(0, 0), steps=[clean, _step(0, 0), _step(4, 1)]
        )
        == "partialSuccess"
    )
    assert (
        final_pipeline_state(
            _report(0, 0), steps=[clean, _step(0, 0), _step(5, 0)]
        )
        == "success"
    )


def test_final_pipeline_state_mean_boundary_is_exact() -> None:
    # Three steps at exactly 90% each average exactly 90%: the mean
    # must not slip below the threshold through float summation.
    steps = [_step(9, 1), _step(9, 1), _step(9, 1)]
    assert final_pipeline_state(_report(0, 0), steps=steps) == "partialSuccess"
    assert (
        final_pipeline_state(_report(0, 0), steps=steps, success_threshold=91)
        == "failed"
    )


def test_final_pipeline_state_empty_step_rates_full() -> None:
    # A step with no records and no failures rates 100% and pulls the
    # mean up; it never drags a clean run below the threshold.
    from smartmetadata_ingestion.pipeline_status import step_success_rate

    assert step_success_rate(_step(0, 0)) == 1.0
    assert (
        final_pipeline_state(_report(0, 0), steps=[_step(0, 0), _step(0, 0)])
        == "success"
    )
    assert (
        final_pipeline_state(_report(0, 0), steps=[_step(0, 0), _step(9, 1)])
        == "partialSuccess"
    )


def test_final_pipeline_state_counts_updated_records_as_success() -> None:
    # The step success count is records + updated_records (B-12): a
    # step with only updates and one failure rates 4/5, not 1/2.
    from smartmetadata_ingestion.pipeline_status import step_success_rate

    assert step_success_rate(_step(0, 1, updated=4)) == pytest.approx(0.8)
    assert step_success_rate(_step(0, 2)) == pytest.approx(1 / 3)


def test_final_pipeline_state_threshold_is_per_workflow_type() -> None:
    # The same step mix at an 86.7% mean is partialSuccess under an
    # 80 threshold (profiler) and failed under the generic 90: the
    # hook value, not the rule, differs between workflow types.
    steps = [_step(10, 0), _step(0, 0), _step(3, 2)]
    assert (
        final_pipeline_state(_report(0, 0), steps=steps, success_threshold=80)
        == "partialSuccess"
    )
    assert (
        final_pipeline_state(_report(0, 0), steps=steps, success_threshold=90)
        == "failed"
    )


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
