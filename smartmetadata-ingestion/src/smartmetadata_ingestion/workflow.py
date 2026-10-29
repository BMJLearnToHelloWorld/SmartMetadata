# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging
import traceback
import uuid
from collections.abc import Iterable, Iterator

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import LineageSpec, WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source, build_source
from smartmetadata_ingestion.errors import (
    WorkflowExecutionError,
    WorkflowInitializationError,
    WorkflowTeardownError,
)
from smartmetadata_ingestion.processors.identity import Processor, build_processors
from smartmetadata_ingestion.pipeline_status import (
    PipelineState,
    build_pipeline_status,
    final_pipeline_state,
    now_ms,
)
from smartmetadata_ingestion.progress import (
    NullHook,
    ProgressHook,
    RecordFailure,
    RunReport,
    StepStatus,
)
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord
from smartmetadata_ingestion.sinks.metadata_rest import Sink, build_sink

logger = logging.getLogger(__name__)


class MetadataWorkflow:
    """Metadata workflow with an explicit, idempotent step lifecycle."""

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        processors: list[Processor] | None = None,
        hook: ProgressHook | None = None,
    ) -> None:
        self.config = config
        self._owns_client = client is None
        self._client = client or RestClient(config.server)
        self._provided_source = source
        self._provided_sink = sink
        self._provided_processors = processors
        self._source: Source | None = None
        self._sink: Sink | None = None
        self._processors: list[Processor] = []
        self._prepared = False
        self._executed = False
        self._steps_closed = False
        self._stopped = False
        self._hook = hook or NullHook()
        self.run_id: str | None = None
        self._run_start_ms: int | None = None
        self.report = RunReport(workflow_name=config.workflow.name)
        self.source_status = StepStatus(name="Source")
        self.processor_status = StepStatus(name="Processor")
        self.sink_status = StepStatus(name="Sink")
        try:
            self.prepare()
        except Exception:
            try:
                self.close_steps()
            except Exception as cleanup_error:
                logger.warning("Workflow initialization cleanup failed: %s", cleanup_error)
            if self._owns_client:
                try:
                    self._client.close()
                except Exception as cleanup_error:
                    logger.warning("Workflow client cleanup failed: %s", cleanup_error)
                self._stopped = True
            raise

    def prepare(self) -> None:
        if self._prepared:
            return
        try:
            self._source = build_source(self.config, self._provided_source)
            self._processors = (
                self._provided_processors
                if self._provided_processors is not None
                else build_processors(self.config)
            )
            self._sink = build_sink(self.config, self._client, self._provided_sink)
            self._source.prepare()
            self._prepared = True
        except Exception as exc:
            self._record_failure(self.source_status, "Source", "source", exc)
            raise WorkflowInitializationError(
                f"could not prepare metadata workflow: {exc}"
            ) from exc

    def execute(self) -> RunReport:
        if self._executed:
            raise WorkflowExecutionError("metadata workflow has already executed")
        self._executed = True
        self.prepare()
        self.run_id = str(uuid.uuid4())
        self._run_start_ms = now_ms()
        logger.info(
            "metadata workflow %s starting runId=%s",
            self.config.workflow.name,
            self.run_id,
        )
        self._report_pipeline_status("running")
        pending: BaseException | None = None
        try:
            self._execute_records()
        except BaseException as exc:
            pending = exc
        try:
            self.close_steps()
        except BaseException as exc:
            if pending is None:
                pending = exc
        final_state = final_pipeline_state(
            self.report,
            stopped=isinstance(pending, KeyboardInterrupt),
        )
        if pending is not None and final_state == "success":
            final_state = "failed"
        self._report_pipeline_status(final_state, finished=True)
        logger.info(
            "metadata workflow %s finished runId=%s state=%s succeeded=%s failed=%s",
            self.config.workflow.name,
            self.run_id,
            final_state,
            self.report.succeeded,
            self.report.failed,
        )
        try:
            self._hook.on_complete(self.report)
        except Exception as exc:
            logger.warning("Progress completion hook failed: %s", exc)
        if pending is not None:
            raise pending
        return self.report

    def _report_pipeline_status(
        self,
        pipeline_state: PipelineState,
        *,
        finished: bool = False,
    ) -> None:
        fqn = self.config.workflow.ingestion_pipeline_fqn
        if not fqn or not self.run_id or self._run_start_ms is None:
            return
        client = getattr(self._client, "add_pipeline_status", None)
        if not callable(client):
            logger.debug(
                "catalog client has no add_pipeline_status; skip writeback for %s",
                fqn,
            )
            return
        end_ms = now_ms() if finished else None
        steps = (
            [self.source_status, self.processor_status, self.sink_status]
            if finished
            else None
        )
        payload = build_pipeline_status(
            run_id=self.run_id,
            pipeline_state=pipeline_state,
            start_ms=self._run_start_ms,
            end_ms=end_ms,
            steps=steps,
        )
        try:
            self._client.add_pipeline_status(fqn, payload)
            logger.info(
                "wrote pipelineStatus fqn=%s runId=%s state=%s",
                fqn,
                self.run_id,
                pipeline_state,
            )
        except Exception as exc:
            logger.warning(
                "pipelineStatus writeback failed for %s runId=%s: %s",
                fqn,
                self.run_id,
                exc,
            )

    def _execute_records(self) -> None:
        if self._source is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        iterator = iter(self._source.produce())
        while True:
            try:
                record = next(iterator)
            except StopIteration:
                close_failure = self._close_iterator(iterator)
                if close_failure is not None:
                    raise WorkflowTeardownError(
                        f"source iterator close failed: {close_failure}"
                    ) from close_failure
                break
            except Exception as exc:
                self._close_iterator(iterator)
                failure = self._record_failure(self.source_status, "Source", "source", exc)
                self.report.failures.append(failure)
                raise WorkflowExecutionError(f"source execution failed: {exc}") from exc
            self.source_status.records += 1
            try:
                self._handle_record(record)
            except BaseException:
                self._close_iterator(iterator)
                raise
        for record in self._configured_lineage():
            self.source_status.records += 1
            self._handle_record(record)

    def _close_iterator(self, iterator: Iterator[WorkflowRecord]) -> Exception | None:
        close = getattr(iterator, "close", None)
        if not callable(close):
            return None
        try:
            close()
        except Exception as exc:
            failure = self._record_failure(self.source_status, "Source", "source", exc)
            self.report.failures.append(failure)
            return exc
        return None

    def _handle_record(self, record: WorkflowRecord) -> None:
        if self._sink is None:
            raise WorkflowInitializationError("workflow sink is not prepared")
        current: WorkflowRecord | None = record
        try:
            for processor in self._processors:
                if current is None:
                    break
                current = processor.process(current)
        except Exception as exc:
            failure = self._record_failure(
                self.processor_status, record.label(), record.kind, exc
            )
            self.report.failures.append(failure)
            self._notify_record(record, "failed")
            if self.config.workflow.fail_fast:
                raise
            return
        if current is None:
            self.report.skipped += 1
            self.source_status.filtered += 1
            self._notify_record(record, "skipped")
            return
        try:
            self._sink.write(current)
            self.sink_status.records += 1
            self.report.succeeded += 1
            self._notify_record(current, "written")
        except Exception as exc:
            failure = self._record_failure(self.sink_status, record.label(), record.kind, exc)
            self.report.failures.append(failure)
            self._notify_record(record, "failed")
            if self.config.workflow.fail_fast:
                raise

    def _notify_record(self, record: WorkflowRecord, status: str) -> None:
        try:
            self._hook.on_record(record, status)
        except Exception as exc:
            logger.warning("Progress record hook failed for %s: %s", record.label(), exc)

    def close_steps(self) -> None:
        if self._steps_closed:
            return
        self._steps_closed = True
        failures: list[BaseException] = []
        if self._source is not None:
            try:
                self._source.close()
            except Exception as exc:
                self._record_failure(self.source_status, "Source", "source", exc)
                failures.append(exc)
        for processor in self._processors:
            try:
                processor.close()
            except Exception as exc:
                self._record_failure(self.processor_status, "Processor", "processor", exc)
                failures.append(exc)
        if self._sink is not None:
            try:
                self._sink.flush()
            except Exception as exc:
                self._record_failure(self.sink_status, "Sink", "sink", exc)
                failures.append(exc)
        if failures:
            error = WorkflowTeardownError(f"workflow teardown failed: {failures[0]}")
            error.__cause__ = failures[0]
            raise error

    def stop(self) -> None:
        if self._stopped:
            return
        self._stopped = True
        try:
            self.close_steps()
        finally:
            if self._owns_client:
                self._client.close()

    def _configured_lineage(self) -> Iterable[LineageRecord]:
        for spec in self.config.lineage:
            yield _lineage_from_spec(spec)

    @staticmethod
    def _record_failure(
        status: StepStatus,
        label: str,
        kind: str,
        exc: Exception,
    ) -> RecordFailure:
        stack_trace = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        failure = RecordFailure(
            label=label,
            kind=kind,
            message=str(exc),
            stack_trace=stack_trace,
        )
        status.failures.append(failure)
        return failure


def _lineage_from_spec(spec: LineageSpec) -> LineageRecord:
    return LineageRecord(
        from_entity=LineageEndpoint(type=spec.from_entity.type, fqn=spec.from_entity.fqn),
        to_entity=LineageEndpoint(type=spec.to_entity.type, fqn=spec.to_entity.fqn),
        description=spec.description,
        source=spec.source,
        sql_query=spec.sql_query,
    )
