# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Stubs for later profiler / data-quality runners. Phase 6 only runs metadata."""

from __future__ import annotations

from typing import Protocol

from smartmetadata_ingestion.errors import WorkflowError


class JobRunner(Protocol):
    kind: str

    def run(self) -> None: ...


class ProfilerJob:
    kind = "profiler"

    def run(self) -> None:
        raise WorkflowError("profiler jobs are out of scope for Phase 6")


class QualityJob:
    kind = "quality"

    def run(self) -> None:
        raise WorkflowError("data-quality jobs are out of scope for Phase 6")
