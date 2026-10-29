# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from smartmetadata_ingestion.config import ProcessorConfig, WorkflowConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import WorkflowRecord


class Processor(Protocol):
    def process(self, record: WorkflowRecord) -> WorkflowRecord | None: ...

    def close(self) -> None:
        """Optional teardown. Default is a no-op."""


class IdentityProcessor:
    def process(self, record: WorkflowRecord) -> WorkflowRecord:
        return record

    def close(self) -> None:
        return None


class DropKindsProcessor:
    def __init__(self, kinds: Sequence[str]):
        self._kinds = set(kinds)

    def process(self, record: WorkflowRecord) -> WorkflowRecord | None:
        if record.kind in self._kinds:
            return None
        return record

    def close(self) -> None:
        return None


def build_processors(config: WorkflowConfig) -> list[Processor]:
    processors: list[Processor] = []
    for item in config.processors:
        processors.append(_build_one(item))
    return processors


def _build_one(config: ProcessorConfig) -> Processor:
    if config.type in {"identity", "noop"}:
        return IdentityProcessor()
    if config.type == "dropKinds":
        kinds = config.options.get("kinds") or []
        if not isinstance(kinds, list):
            raise WorkflowError("dropKinds.options.kinds must be a list")
        return DropKindsProcessor([str(kind) for kind in kinds])
    raise WorkflowError(f"unsupported processor type {config.type}")
