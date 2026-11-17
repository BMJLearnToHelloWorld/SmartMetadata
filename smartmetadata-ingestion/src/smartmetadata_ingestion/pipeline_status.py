# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Build Apache PipelineStatus payloads from local StepStatus / RunReport."""

from __future__ import annotations

import time
from collections.abc import Sequence
from fractions import Fraction
from typing import Any, Literal

from smartmetadata_ingestion.progress import (
    RecordFailure,
    RunReport,
    StepProgress,
    StepStatus,
)

PipelineState = Literal[
    "queued",
    "success",
    "failed",
    "running",
    "partialSuccess",
    "stopped",
]

_MAX_FAILURE_SAMPLES = 20


def now_ms() -> int:
    return int(time.time() * 1000)


def step_summary(status: StepStatus) -> dict[str, Any]:
    failures = [_stack_trace_error(item) for item in status.failures[:_MAX_FAILURE_SAMPLES]]
    payload: dict[str, Any] = {
        "name": status.name,
        "records": status.records,
        "filtered": status.filtered,
        "errors": status.errors,
        # Warnings and updated records come from the step's own counters,
        # never hardcoded: a step that recorded none reports zero because
        # none happened, and the serializer must not hide a real count.
        "warnings": status.warnings,
        "updated_records": status.updated_records,
    }
    if status.progress:
        payload["progress"] = {
            kind: _progress_entry(entry) for kind, entry in status.progress.items()
        }
    if failures:
        payload["failures"] = failures
    return payload


def _progress_entry(entry: StepProgress) -> dict[str, Any]:
    """One progress entry; the remaining-time estimate only when the step
    has actually processed some entities against a known total — with
    nothing processed, or nothing left, there is no rate to extrapolate
    and the key is omitted rather than guessed."""
    item: dict[str, Any] = {"total": entry.total, "processed": entry.processed}
    if (
        entry.started_monotonic is not None
        and entry.processed > 0
        and entry.total > entry.processed
    ):
        elapsed = time.monotonic() - entry.started_monotonic
        if elapsed > 0:
            item["estimatedRemainingSeconds"] = max(
                0,
                int(elapsed * (entry.total - entry.processed) / entry.processed),
            )
    return item


def _stack_trace_error(failure: RecordFailure) -> dict[str, Any]:
    item: dict[str, Any] = {
        "name": failure.label,
        "error": failure.message,
    }
    if failure.stack_trace:
        item["stackTrace"] = failure.stack_trace
    return item


def _step_success_fraction(status: StepStatus) -> Fraction:
    """One step's success share, exactly.

    The success count is ``max(records + updated_records, 1)`` over
    that count plus the step's failures, so a step that recorded
    nothing at all (0 records, 0 failures) rates 100% instead of
    dividing by zero, and a step with failures but no counted
    successes still rates above zero. Exact fractions keep threshold
    boundaries (e.g. exactly 90%) decidable instead of float-noisy.
    """
    success = max(status.records + status.updated_records, 1)
    return Fraction(success, success + len(status.failures))


def step_success_rate(status: StepStatus) -> float:
    """One step's success rate in [0, 1], from the step's own counts."""
    return float(_step_success_fraction(status))


def mean_success_rate(steps: Sequence[StepStatus]) -> float:
    """The mean of the steps' success rates in [0, 1].

    No steps means nothing ran and nothing failed, so the rate is
    100%. This is the display form of the determination below; the
    determination itself compares exact fractions.
    """
    if not steps:
        return 1.0
    total = sum((_step_success_fraction(step) for step in steps), Fraction(0))
    return float(total / len(steps))


def final_pipeline_state(
    report: RunReport,
    *,
    stopped: bool = False,
    steps: Sequence[StepStatus] | None = None,
    success_threshold: int = 90,
) -> PipelineState:
    """The end-of-run state under the threshold rule (D-S5).

    The workflow success rate is the MEAN of the steps' success
    rates, each from the step's own records/updated/failures counts
    — never inferred from the report totals. 100% is ``success``;
    at or above the threshold but below 100% is ``partialSuccess``;
    below the threshold is ``failed``; ``stopped`` wins over all.

    Without step data (legacy callers pass only the report), the
    report's own succeeded/failed counts are treated as a single
    step under the same formula, so the signature keeps working
    while the verdict follows the threshold rule.
    """
    if stopped:
        return "stopped"
    if steps:
        rate = sum((_step_success_fraction(step) for step in steps), Fraction(0))
        rate /= len(steps)
    else:
        success = max(report.succeeded, 1)
        rate = Fraction(success, success + report.failed)
    if rate == 1:
        return "success"
    if rate >= Fraction(success_threshold, 100):
        return "partialSuccess"
    return "failed"


def build_pipeline_status(
    *,
    run_id: str,
    pipeline_state: PipelineState,
    start_ms: int,
    timestamp_ms: int | None = None,
    end_ms: int | None = None,
    steps: list[StepStatus] | None = None,
) -> dict[str, Any]:
    """Serialize a PipelineStatus body. Do not set triggeredBy (server audit field)."""
    ts = timestamp_ms if timestamp_ms is not None else now_ms()
    payload: dict[str, Any] = {
        "runId": run_id,
        "pipelineState": pipeline_state,
        "startDate": start_ms,
        "timestamp": ts,
    }
    if end_ms is not None:
        payload["endDate"] = end_ms
    # Steps ride along in every state, including while running: the agent
    # cards read live progress from the running status, and a running
    # payload without steps leaves them with nothing to show.
    if steps is not None:
        payload["status"] = [step_summary(step) for step in steps]
    return payload
