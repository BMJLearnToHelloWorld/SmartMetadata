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

from smartmetadata_ingestion.progress import RecordFailure, RunReport, StepStatus

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
        "warnings": 0,
        "updated_records": 0,
    }
    if failures:
        payload["failures"] = failures
    return payload


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
    if steps is not None and pipeline_state != "running":
        payload["status"] = [step_summary(step) for step in steps]
    return payload
