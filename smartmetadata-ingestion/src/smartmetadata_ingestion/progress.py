# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Protocol

from smartmetadata_ingestion.records import WorkflowRecord


@dataclass(slots=True)
class RecordFailure:
    label: str
    kind: str
    message: str
    stack_trace: str | None = None


@dataclass
class StepProgress:
    """Per-entity-type progress for one step (schema ``stepSummary.progress``).

    ``total`` is what the step knows it must process (discovered entities
    for the source step, records that reached the sink for the sink step);
    ``processed`` is what it has finished. ``started_monotonic`` anchors
    the remaining-time estimate; it is set when the first total is
    recorded, never fabricated afterwards.
    """

    total: int = 0
    processed: int = 0
    started_monotonic: float | None = None


@dataclass
class StepStatus:
    name: str
    records: int = 0
    filtered: int = 0
    failures: list[RecordFailure] = field(default_factory=list)
    warnings: int = 0
    updated_records: int = 0
    progress: dict[str, StepProgress] = field(default_factory=dict)

    @property
    def errors(self) -> int:
        return len(self.failures)

    def set_total(self, kind: str, total: int) -> None:
        """Record how many entities of one kind this step must process."""
        entry = self.progress.setdefault(kind, StepProgress())
        entry.total = total
        if entry.started_monotonic is None:
            entry.started_monotonic = time.monotonic()

    def expect(self, kind: str) -> None:
        """One more entity of this kind has reached the step."""
        entry = self.progress.setdefault(kind, StepProgress())
        entry.total += 1
        if entry.started_monotonic is None:
            entry.started_monotonic = time.monotonic()

    def complete(self, kind: str, count: int = 1) -> None:
        """Mark entities of this kind finished by the step."""
        entry = self.progress.setdefault(kind, StepProgress())
        entry.processed += count

    def warn(self, count: int = 1) -> None:
        """Record warning events on this step.

        This is the ONLY path by which ``warnings`` grows: components
        expose counts, and the workflow folds them in here once, after
        the run, so the serialized ``warnings`` is a real count of
        warning events — never a hardcoded zero, never double-counted.

        The counted set (C-11/B-4) — exactly these events, nothing else:

        1. Binding-resolution skips: a parsed table/procedure name that
           bound to no catalog entity. Usage stage skips land on the
           processor step; lineage skips land on the source step. Join
           drops are binding skips too: a staged join whose column
           binds to no catalog column counts on the processor step.
           One warning per skipped binding attempt, not per log line:
           a repeat of a name whose warning was throttled still
           counts, while a lineage name that resolves cross-service
           after an own-service miss counts zero.
        2. Reconcile skips, on the sink step: a flag-on kind excluded
           by the completeness gate (its listing was narrowed by a
           pattern or toggle), and an enabled kind skipped for an
           empty listing. A kind whose flag is off is not a skip —
           reconcile was never requested for it. A run whose workflow
           type never reconciles counts one sink warning for the
           skipped reconcile itself.
        3. Query-log engine failures, on the source step: one per
           engine whose history read failed. A run where every engine
           failed raises instead, so this counts partial-read runs.
        4. Lineage channel warnings, on the source step: one per
           channel-level warning event (all channels disabled, an
           empty channel, an unsupported-engine gate, an unnamed
           cross-database configuration) plus one per item the channel
           runner skipped (processing timeout, unexpected item error).
        5. A usage run that scanned queries but published no tables:
           one source-step warning for the run. The queries may have
           touched no catalog tables; the shape is suspicious, not
           clean, and must not report zero warnings on that alone.

        Deliberately NOT counted (log-only): malformed query-log rows
        and unreadable CSV files, per-view/per-procedure outcome skips
        folded into channel outcome aggregates, usage cost records
        skipped for a missing Query entity, ambiguous column matches,
        profiler thread clamping and unreadable global settings,
        hook/cleanup failures, percentile recompute failures in the
        usage sink's close, masking-stage parser failures, and
        procedure/constraint reader-absent warnings (per-schema
        helpers with no count channel). Reconcile deleteStale
        failures are failures, not warnings. Extending the set means exposing a
        count on the owning component, folding it in from the
        workflow's warning collection via this method, and amending
        this list — never writing ``warnings`` directly.
        """
        if count < 0:
            raise ValueError("warning count must not be negative")
        self.warnings += count


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
