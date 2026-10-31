# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Parent-before-child ordering and seen-FQN tracking for metadata ingestion."""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    MessagingServiceRecord,
    SchemaRecord,
    TableRecord,
    TopicRecord,
    UsageRecord,
    ProfileRecord,
    TestCaseResultRecord,
    ClassificationRecord,
    TagRecord,
    AppRecord,
    WorkflowRecord,
)

# Lower runs earlier. Keep lineage last so endpoints exist.
STAGE_ORDER: dict[str, int] = {
    "databaseService": 0,
    "messagingService": 0,
    "dashboardService": 0,
    "classification": 0,
    "app": 0,
    "database": 1,
    "topic": 1,
    "chart": 1,
    "tag": 1,
    "schema": 2,
    "dashboard": 2,
    "table": 3,
    "usage": 4,
    "profile": 4,
    "testCaseResult": 4,
    "lineage": 5,
}


def stage_rank(record: WorkflowRecord) -> int:
    return STAGE_ORDER.get(record.kind, 50)


def order_records(records: Iterable[WorkflowRecord]) -> list[WorkflowRecord]:
    """Stable parent-before-child ordering by entity kind."""
    indexed = list(enumerate(records))
    indexed.sort(key=lambda item: (stage_rank(item[1]), item[0]))
    return [record for _, record in indexed]


def record_fqn(record: WorkflowRecord) -> str | None:
    if isinstance(record, ClassificationRecord):
        return record.name
    if isinstance(record, TagRecord):
        if record.classification:
            return f"{record.classification}.{record.name}"
        return record.name
    if isinstance(record, AppRecord):
        return record.name
    if isinstance(record, DatabaseServiceRecord):
        return record.name
    if isinstance(record, MessagingServiceRecord):
        return record.name
    if isinstance(record, DashboardServiceRecord):
        return record.name
    if isinstance(record, ChartRecord):
        return f"{record.service}.{record.name}"
    if isinstance(record, DashboardRecord):
        return f"{record.service}.{record.name}"
    if isinstance(record, DatabaseRecord):
        return f"{record.service}.{record.name}"
    if isinstance(record, SchemaRecord):
        return f"{record.database}.{record.name}"
    if isinstance(record, TableRecord):
        return f"{record.database_schema}.{record.name}"
    if isinstance(record, TopicRecord):
        return f"{record.service}.{record.name}"
    if isinstance(record, UsageRecord):
        return record.fqn
    if isinstance(record, ProfileRecord):
        return record.fqn
    if isinstance(record, TestCaseResultRecord):
        return record.test_case_fqn
    if isinstance(record, LineageRecord):
        return None
    return None


class SeenSet:
    """FQNs observed in the current run, grouped for stale reconcile."""

    def __init__(self) -> None:
        self.by_kind: dict[str, set[str]] = {}

    def add(self, record: WorkflowRecord) -> None:
        fqn = record_fqn(record)
        if not fqn:
            return
        self.by_kind.setdefault(record.kind, set()).add(fqn)

    def fqns(self, kind: str) -> list[str]:
        return sorted(self.by_kind.get(kind, set()))
