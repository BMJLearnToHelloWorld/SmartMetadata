# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for the step-3 helpers: run-id resolution and log chunking.

Pure functions only (no Airflow, no DB); the real-backend behaviour is
covered by the step-3 gate against live Airflow 3.3.2.
"""

from __future__ import annotations

import json
import uuid

from smartmetadata_airflow_apis.contracts import LOG_CHUNK_BYTES
from smartmetadata_airflow_apis.logs import (
    format_json_log_line,
    get_log_file_info,
    read_log_chunk_from_file,
    split_log_chunks,
)
from smartmetadata_airflow_apis.run_id import pipeline_run_id, resolve_run_id

SERVER_UUID = str(uuid.uuid4())


def test_resolve_run_id_prefers_conf_pipeline_run_id() -> None:
    assert (
        resolve_run_id("my_pipeline", "manual__2026-11-06T00:00:00", {"pipelineRunId": SERVER_UUID})
        == SERVER_UUID
    )


def test_resolve_run_id_falls_back_to_derivation() -> None:
    # Invalid conf UUID: derive from the Airflow run id, like the worker.
    assert resolve_run_id("my_pipeline", "manual__2026-11-06T00:00:00", {"pipelineRunId": "not-a-uuid"}) == str(
        pipeline_run_id("my_pipeline", "manual__2026-11-06T00:00:00")
    )
    assert resolve_run_id("my_pipeline", "manual__2026-11-06T00:00:00", None) == str(
        pipeline_run_id("my_pipeline", "manual__2026-11-06T00:00:00")
    )


def test_resolve_run_id_passes_uuid_run_id_through() -> None:
    assert resolve_run_id("my_pipeline", SERVER_UUID, {}) == SERVER_UUID


def test_resolve_run_id_mints_when_nothing_given() -> None:
    first = resolve_run_id("my_pipeline", None, None)
    second = resolve_run_id("my_pipeline", None, None)
    assert uuid.UUID(first) != uuid.UUID(second)


def test_format_json_log_line() -> None:
    line = json.dumps(
        {
            "timestamp": "2026-11-06T15:00:00",
            "level": "info",
            "event": "workflow started",
            "filename": "workflow.py",
            "lineno": 42,
        }
    )
    assert (
        format_json_log_line(line)
        == "[2026-11-06T15:00:00] INFO - workflow.py:42 - workflow started\n"
    )
    assert format_json_log_line("plain line") == "plain line\n"
    assert format_json_log_line("plain line\n") == "plain line\n"
    assert format_json_log_line("{not json") == "{not json\n"


def test_split_log_chunks_small_and_large() -> None:
    assert split_log_chunks("one\ntwo\n") == ["one\ntwo\n"]
    assert split_log_chunks("") == []
    big = "x" * (LOG_CHUNK_BYTES + 10) + "\n"
    chunks = split_log_chunks(big)
    assert len(chunks) == 2
    assert "".join(chunks) == big


def test_read_log_chunk_from_file(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "attempt=1.log"
    path.write_text("first\nsecond\n", encoding="utf-8")
    assert read_log_chunk_from_file(path, 0) == "first\nsecond\n"
    assert read_log_chunk_from_file(tmp_path / "missing.log", 0) is None


def test_get_log_file_info_counts_chunks(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "a.log"
    path.write_bytes(b"x" * (LOG_CHUNK_BYTES + 1))
    size, total = get_log_file_info(str(path), int(path.stat().st_mtime))
    assert size == LOG_CHUNK_BYTES + 1
    assert total == 2
