# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from collections.abc import Iterable

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import LineageSpec, WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source, build_source
from smartmetadata_ingestion.processors.identity import Processor, build_processors
from smartmetadata_ingestion.progress import NullHook, ProgressHook, RecordFailure, RunReport
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord, WorkflowRecord
from smartmetadata_ingestion.sinks.metadata_rest import Sink, build_sink


def configured_lineage(config: WorkflowConfig) -> list[LineageRecord]:
    records: list[LineageRecord] = []
    for spec in config.lineage:
        records.append(_lineage_from_spec(spec))
    return records


def _lineage_from_spec(spec: LineageSpec) -> LineageRecord:
    return LineageRecord(
        from_entity=LineageEndpoint(type=spec.from_entity.type, fqn=spec.from_entity.fqn),
        to_entity=LineageEndpoint(type=spec.to_entity.type, fqn=spec.to_entity.fqn),
        description=spec.description,
        source=spec.source,
        sql_query=spec.sql_query,
    )


def run_workflow(
    config: WorkflowConfig,
    *,
    client: RestClient | None = None,
    source: Source | None = None,
    sink: Sink | None = None,
    processors: list[Processor] | None = None,
    hook: ProgressHook | None = None,
) -> RunReport:
    hook = hook or NullHook()
    owns_client = client is None
    client = client or RestClient(config.server)
    report = RunReport(workflow_name=config.workflow.name)
    try:
        source_impl = build_source(config, source)
        processor_impls = processors if processors is not None else build_processors(config)
        sink_impl = build_sink(config, client, sink)
        records: Iterable[WorkflowRecord] = _chain(
            source_impl.produce(), configured_lineage(config)
        )
        for record in records:
            _handle_record(record, processor_impls, sink_impl, config, report, hook)
        sink_impl.flush()
    finally:
        if owns_client:
            client.close()
    hook.on_complete(report)
    return report


def _chain(*groups: Iterable[WorkflowRecord]) -> Iterable[WorkflowRecord]:
    for group in groups:
        yield from group


def _handle_record(
    record: WorkflowRecord,
    processors: list[Processor],
    sink: Sink,
    config: WorkflowConfig,
    report: RunReport,
    hook: ProgressHook,
) -> None:
    current: WorkflowRecord | None = record
    try:
        for processor in processors:
            if current is None:
                break
            current = processor.process(current)
        if current is None:
            report.skipped += 1
            hook.on_record(record, "skipped")
            return
        sink.write(current)
        report.succeeded += 1
        hook.on_record(current, "written")
    except Exception as exc:
        report.failures.append(
            RecordFailure(label=record.label(), kind=record.kind, message=str(exc))
        )
        hook.on_record(record, "failed")
        if config.workflow.fail_fast:
            raise
