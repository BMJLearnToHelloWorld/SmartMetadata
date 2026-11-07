# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Task log reading for last_dag_logs (ruling §0.3).

File streaming first (2,000,000-byte chunks, Airflow 3 JSON log lines
reformatted to readable text), TaskLogReader fallback second. The file-info
cache is bounded (10 entries, keyed by path + mtime) per the repo rule that
no cache grows without a cap.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache, partial
from io import StringIO
from pathlib import Path

from smartmetadata_airflow_apis.contracts import LOG_CHUNK_BYTES

logger = logging.getLogger(__name__)


@lru_cache(maxsize=10)
def get_log_file_info(log_file_path: str, mtime: int) -> tuple[int, int]:
    """(file size in bytes, total chunk count) for one log file."""
    file_size = os.path.getsize(log_file_path)
    total_chunks = (file_size + LOG_CHUNK_BYTES - 1) // LOG_CHUNK_BYTES
    return file_size, total_chunks


def format_json_log_line(line: str) -> str:
    """One Airflow 3 JSON log line as readable text; anything else as-is.

    Airflow 3 writes one JSON object per line (timestamp, level, event,
    filename, lineno). The readable form is the same shape the official
    plugin renders, so log viewers see identical text.
    """
    try:
        entry = json.loads(line)
        timestamp = entry.get("timestamp", "")
        level = str(entry.get("level", "INFO")).upper()
        event = entry.get("event", "")
        filename = entry.get("filename", "")
        line_no = entry.get("lineno", "")
        return f"[{timestamp}] {level} - {filename}:{line_no} - {event}\n"
    except (json.JSONDecodeError, KeyError, AttributeError):
        return line if line.endswith("\n") else line + "\n"


def read_log_chunk_from_file(
    file_path: str | Path, chunk_index: int, *, format_json: bool = True
) -> str | None:
    """One chunk of a log file without loading it whole; None on any error."""
    try:
        offset = chunk_index * LOG_CHUNK_BYTES
        with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
            handle.seek(offset)
            chunk = handle.read(LOG_CHUNK_BYTES)
        if format_json and chunk:
            lines = chunk.splitlines(keepends=True)
            formatted = [
                format_json_log_line(line.rstrip("\n")) for line in lines if line.strip()
            ]
            return "".join(formatted)
        return chunk
    except Exception as exc:  # noqa: BLE001 - a failed read falls back
        logger.warning("Failed to read log chunk from %s: %s", file_path, exc)
        return None


def split_log_chunks(text: str) -> list[str]:
    """Format JSON log lines, then split the whole text into chunks."""
    lines = text.splitlines(keepends=True)
    formatted = "".join(
        format_json_log_line(line.rstrip("\n")) for line in lines if line.strip()
    )
    return [
        chunk for chunk in iter(partial(StringIO(formatted).read, LOG_CHUNK_BYTES), "")
    ]
