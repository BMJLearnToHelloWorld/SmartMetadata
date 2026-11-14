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


def final_pipeline_state(
    report: RunReport,
    *,
    stopped: bool = False,
) -> PipelineState:
    if stopped:
        return "stopped"
    if report.failed == 0:
        return "success"
    if report.succeeded > 0:
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
