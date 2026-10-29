# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.errors import (
    WorkflowExecutionError,
    WorkflowInitializationError,
    WorkflowTeardownError,
)
from smartmetadata_ingestion.progress import CollectingHook
from smartmetadata_ingestion.records import DatabaseServiceRecord
from smartmetadata_ingestion.runner import run_workflow
from smartmetadata_ingestion.workflow import MetadataWorkflow


class RaisingHook:
    def on_record(self, record, status: str) -> None:
        raise RuntimeError(f"hook failed for {status}")

    def on_complete(self, report) -> None:
        raise RuntimeError("completion hook failed")


class RecordingClient:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    def close(self) -> None:
        self.events.append("client.close")


class FailingCloseClient(RecordingClient):
    def close(self) -> None:
        self.events.append("client.close")
        raise RuntimeError("client close failed")


class RecordingSource:
    def __init__(self, events: list[str], *, failure: Exception | None = None) -> None:
        self.events = events
        self.failure = failure

    def prepare(self) -> None:
        self.events.append("source.prepare")

    def produce(self):
        self.events.append("source.produce")
        yield DatabaseServiceRecord(name="warehouse", service_type="Postgres")
        if self.failure:
            raise self.failure

    def close(self) -> None:
        self.events.append("source.close")


class RecordingSink:
    def __init__(self, events: list[str], *, flush_failure: Exception | None = None) -> None:
        self.events = events
        self.flush_failure = flush_failure

    def write(self, record) -> None:
        self.events.append(f"sink.write:{record.kind}")

    def flush(self) -> None:
        self.events.append("sink.flush")
        if self.flush_failure:
            raise self.flush_failure


class FailingPrepareSource(RecordingSource):
    def prepare(self) -> None:
        self.events.append("source.prepare")
        raise RuntimeError("prepare failed")


class FailingSink(RecordingSink):
    def write(self, record) -> None:
        raise RuntimeError("write failed")


class ClosingGeneratorSource(RecordingSource):
    def produce(self):
        self.events.append("source.produce")
        try:
            yield DatabaseServiceRecord(name="warehouse", service_type="Postgres")
            yield DatabaseServiceRecord(name="second", service_type="Postgres")
        finally:
            self.events.append("source.iterator.close")


def test_workflow_runs_prepare_execute_flush_and_complete_in_order(workflow_config) -> None:
    events: list[str] = []
    hook = CollectingHook()
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events),
        sink=RecordingSink(events),
        hook=hook,
    )

    report = workflow.execute()
    workflow.stop()
    workflow.stop()

    assert report.succeeded == 2  # source service plus configured lineage
    assert events == [
        "source.prepare",
        "source.produce",
        "sink.write:databaseService",
        "sink.write:lineage",
        "source.close",
        "sink.flush",
    ]
    assert hook.report is report


def test_workflow_owns_and_closes_its_client_once(workflow_config, monkeypatch) -> None:
    events: list[str] = []
    client = RecordingClient(events)
    monkeypatch.setattr(
        "smartmetadata_ingestion.workflow.RestClient",
        lambda _server: client,
    )
    workflow = MetadataWorkflow(
        workflow_config,
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )

    workflow.execute()
    workflow.stop()
    workflow.stop()

    assert events.count("client.close") == 1


def test_progress_hook_failure_does_not_change_ingestion_result(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events),
        sink=RecordingSink(events),
        hook=RaisingHook(),
    )

    report = workflow.execute()

    assert report.ok()
    assert report.succeeded == 1


def test_workflow_cannot_execute_twice(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )
    workflow.execute()

    with pytest.raises(WorkflowExecutionError, match="already executed"):
        workflow.execute()

    assert events.count("sink.write:databaseService") == 1


def test_initialization_failure_closes_built_steps_and_owned_client(
    workflow_config, monkeypatch
) -> None:
    events: list[str] = []
    client = RecordingClient(events)
    monkeypatch.setattr(
        "smartmetadata_ingestion.workflow.RestClient",
        lambda _server: client,
    )

    with pytest.raises(WorkflowInitializationError, match="prepare failed"):
        MetadataWorkflow(
            workflow_config,
            source=FailingPrepareSource(events),
            sink=RecordingSink(events),
        )

    assert events == ["source.prepare", "source.close", "sink.flush", "client.close"]


def test_execution_failure_remains_primary_when_client_close_fails(
    workflow_config, monkeypatch
) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    monkeypatch.setattr(
        "smartmetadata_ingestion.workflow.RestClient",
        lambda _server: FailingCloseClient(events),
    )

    with pytest.raises(WorkflowExecutionError, match="source failed"):
        run_workflow(
            workflow_config,
            source=RecordingSource(events, failure=RuntimeError("source failed")),
            sink=RecordingSink(events),
        )

    assert events[-1] == "client.close"


def test_source_failure_is_fatal_but_cleanup_and_completion_still_run(workflow_config) -> None:
    events: list[str] = []
    hook = CollectingHook()
    workflow_config.lineage = []
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events, failure=RuntimeError("source failed")),
        sink=RecordingSink(events),
        hook=hook,
    )

    with pytest.raises(WorkflowExecutionError, match="source failed"):
        workflow.execute()

    assert events[-2:] == ["source.close", "sink.flush"]
    assert hook.report is not None
    assert hook.report.failed == 1
    assert workflow.source_status.errors == 1


def test_fail_fast_closes_source_iterator_before_steps(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow_config.workflow.fail_fast = True
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=ClosingGeneratorSource(events),
        sink=FailingSink(events),
    )

    with pytest.raises(RuntimeError, match="write failed"):
        workflow.execute()

    assert events[-3:] == ["source.iterator.close", "source.close", "sink.flush"]


def test_flush_failure_is_fatal_and_recorded(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events),
        sink=RecordingSink(events, flush_failure=RuntimeError("flush failed")),
    )

    with pytest.raises(WorkflowTeardownError, match="flush failed"):
        workflow.execute()

    assert workflow.sink_status.errors == 1

class FailingProcessor:
    def process(self, record):
        raise RuntimeError("processor failed")

    def close(self) -> None:
        return None


def test_processor_failure_is_attributed_to_processor_status(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=RecordingSource(events),
        sink=RecordingSink(events),
        processors=[FailingProcessor()],
    )

    report = workflow.execute()

    assert report.failed == 1
    assert workflow.processor_status.errors == 1
    assert workflow.sink_status.errors == 0
    assert "processor failed" in report.failures[0].message
    assert report.failures[0].stack_trace



class StatusClient(RecordingClient):
    def __init__(self, events: list[str], statuses: list[dict] | None = None) -> None:
        super().__init__(events)
        self.statuses = statuses if statuses is not None else []
        self.fail_write = False

    def add_pipeline_status(self, fqn: str, status: dict) -> dict:
        if self.fail_write:
            raise RuntimeError(f"writeback failed for {fqn}")
        self.events.append(f"status:{status['pipelineState']}")
        self.statuses.append({"fqn": fqn, **status})
        return {"ok": True}


def test_pipeline_status_writeback_running_then_success(workflow_config) -> None:
    events: list[str] = []
    statuses: list[dict] = []
    workflow_config.lineage = []
    workflow_config.workflow.ingestion_pipeline_fqn = "svc.meta"
    client = StatusClient(events, statuses)
    workflow = MetadataWorkflow(
        workflow_config,
        client=client,
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )

    report = workflow.execute()

    assert report.ok()
    assert [item["pipelineState"] for item in statuses] == ["running", "success"]
    assert statuses[0]["fqn"] == "svc.meta"
    assert statuses[0]["runId"] == statuses[1]["runId"]
    assert "status" not in statuses[0]
    assert statuses[1]["status"][0]["name"] == "Source"
    assert "triggeredBy" not in statuses[1]


def test_pipeline_status_skipped_without_fqn(workflow_config) -> None:
    events: list[str] = []
    statuses: list[dict] = []
    workflow_config.lineage = []
    assert workflow_config.workflow.ingestion_pipeline_fqn is None
    workflow = MetadataWorkflow(
        workflow_config,
        client=StatusClient(events, statuses),
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )

    workflow.execute()

    assert statuses == []
    assert not any(item.startswith("status:") for item in events)


def test_pipeline_status_writeback_failure_is_soft(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow_config.workflow.ingestion_pipeline_fqn = "svc.meta"
    client = StatusClient(events)
    client.fail_write = True
    workflow = MetadataWorkflow(
        workflow_config,
        client=client,
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )

    report = workflow.execute()

    assert report.ok()
    assert report.succeeded == 1


def test_pipeline_status_failed_when_all_records_fail(workflow_config) -> None:
    events: list[str] = []
    statuses: list[dict] = []
    workflow_config.lineage = []
    workflow_config.workflow.ingestion_pipeline_fqn = "svc.meta"
    workflow = MetadataWorkflow(
        workflow_config,
        client=StatusClient(events, statuses),
        source=RecordingSource(events),
        sink=FailingSink(events),
    )

    report = workflow.execute()

    assert report.failed == 1
    assert report.succeeded == 0
    assert statuses[-1]["pipelineState"] == "failed"


class MixedSink(RecordingSink):
    def __init__(self, events: list[str]) -> None:
        super().__init__(events)
        self._writes = 0

    def write(self, record) -> None:
        self._writes += 1
        if self._writes == 1:
            raise RuntimeError("first write failed")
        super().write(record)


def test_pipeline_status_partial_success_when_some_records_succeed(workflow_config) -> None:
    events: list[str] = []
    statuses: list[dict] = []
    # keep configured lineage so one sink write can succeed after the first fails
    workflow_config.workflow.ingestion_pipeline_fqn = "svc.meta"
    workflow = MetadataWorkflow(
        workflow_config,
        client=StatusClient(events, statuses),
        source=RecordingSource(events),
        sink=MixedSink(events),
    )

    report = workflow.execute()

    assert report.failed == 1
    assert report.succeeded >= 1
    assert statuses[-1]["pipelineState"] == "partialSuccess"



class ReconcileClient(StatusClient):
    def __init__(self, events: list[str], statuses: list[dict] | None = None) -> None:
        super().__init__(events, statuses)
        self.delete_calls: list[dict] = []

    def delete_stale(self, entity_path, **kwargs):
        self.delete_calls.append({"path": entity_path, **kwargs})
        self.events.append(f"deleteStale:{entity_path}")
        return {"ok": True}


def test_reconcile_stale_is_invoked_when_configured(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow_config.workflow.reconcile_stale = True
    workflow_config.workflow.reconcile_dry_run = True
    client = ReconcileClient(events)
    workflow = MetadataWorkflow(
        workflow_config,
        client=client,
        source=RecordingSource(events),
        sink=RecordingSink(events),
    )
    workflow.execute()
    assert any(item.startswith("deleteStale:") for item in events)
    assert client.delete_calls
    assert client.delete_calls[0]["dry_run"] is True


def test_topology_orders_out_of_order_static_records(workflow_config) -> None:
    events: list[str] = []
    workflow_config.lineage = []
    workflow_config.source.type = "static"
    workflow_config.source.records = [
        {
            "kind": "table",
            "name": "orders",
            "databaseSchema": "warehouse.analytics.public",
            "columns": [{"name": "id", "dataType": "INT"}],
        },
        {"kind": "schema", "name": "public", "database": "warehouse.analytics"},
        {"kind": "database", "name": "analytics", "service": "warehouse"},
    ]

    class CapturingSink(RecordingSink):
        def __init__(self) -> None:
            super().__init__(events)
            self.kinds: list[str] = []

        def write(self, record) -> None:
            self.kinds.append(record.kind)
            super().write(record)

    sink = CapturingSink()
    from smartmetadata_ingestion.connectors.base import StaticSource

    workflow = MetadataWorkflow(
        workflow_config,
        client=RecordingClient(events),
        source=StaticSource(workflow_config.source),
        sink=sink,
    )
    workflow.execute()
    # StaticSource yields service first, then configured records reordered
    assert sink.kinds == ["databaseService", "database", "schema", "table"]
