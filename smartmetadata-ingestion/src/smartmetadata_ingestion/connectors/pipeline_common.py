# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Pipeline catalog reader types for Prefect / Dagster (Metadata + Connection)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class PipelineTaskRow:
    name: str
    display_name: str | None = None
    description: str | None = None
    source_url: str | None = None
    task_type: str | None = None


@dataclass(frozen=True)
class PipelineRow:
    name: str
    display_name: str | None = None
    description: str | None = None
    source_url: str | None = None
    concurrency: int | None = None
    pipeline_location: str | None = None
    schedule_interval: str | None = None
    tasks: tuple[PipelineTaskRow, ...] = field(default_factory=tuple)


class PipelineCatalogReader(Protocol):
    def list_pipelines(self) -> Sequence[PipelineRow]: ...


class SequencePipelineCatalogReader:
    """Injectable in-memory reader for unit BehaviorMatched."""

    def __init__(self, *, pipelines: Sequence[PipelineRow] | None = None) -> None:
        self._pipelines = list(pipelines or [])

    def list_pipelines(self) -> Sequence[PipelineRow]:
        return list(self._pipelines)


def tasks_payload(tasks: Sequence[PipelineTaskRow] | None) -> list[dict[str, Any]] | None:
    if not tasks:
        return None
    out: list[dict[str, Any]] = []
    for task in tasks:
        item: dict[str, Any] = {"name": task.name}
        if task.display_name:
            item["displayName"] = task.display_name
        if task.description:
            item["description"] = task.description
        if task.source_url:
            item["sourceUrl"] = task.source_url
        if task.task_type:
            item["taskType"] = task.task_type
        out.append(item)
    return out
