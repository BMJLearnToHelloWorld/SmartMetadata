# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from smartmetadata_ingestion.records import WorkflowRecord


@dataclass(slots=True)
class RecordFailure:
    label: str
    kind: str
    message: str


@dataclass
class RunReport:
    workflow_name: str
    succeeded: int = 0
    skipped: int = 0
    failures: list[RecordFailure] = field(default_factory=list)

    @property
    def failed(self) -> int:
        return len(self.failures)

    @property
    def processed(self) -> int:
        return self.succeeded + self.skipped + self.failed

    def ok(self) -> bool:
        return self.failed == 0


class ProgressHook(Protocol):
    def on_record(self, record: WorkflowRecord, status: str) -> None: ...

    def on_complete(self, report: RunReport) -> None: ...


class NullHook:
    def on_record(self, record: WorkflowRecord, status: str) -> None:
        return None

    def on_complete(self, report: RunReport) -> None:
        return None


class CollectingHook:
    def __init__(self) -> None:
        self.events: list[tuple[str, str]] = []
        self.report: RunReport | None = None

    def on_record(self, record: WorkflowRecord, status: str) -> None:
        self.events.append((record.label(), status))

    def on_complete(self, report: RunReport) -> None:
        self.report = report
