# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage workflow: query logs → parsed queries → staging files → the
five server writes, composed inside the fork's ``MetadataWorkflow``
architecture (design §5.3 — no ported step framework).

The run streams: the query-log source yields raw ``TableQuery``
records, each is parsed, parsed batches flush to staging files
through the stage, and the bulk sink publishes the files once the
source is exhausted. A usage run publishes query-log usage only —
static-spec records (``config.usage``) belong to metadata runs and
are not mixed in.

Counting: the source step counts queries scanned, the processor step
counts queries parsed (queries touching no tables count as filtered),
and the sink step counts staged tables published — a table counts
only once its group's writes land, never when buffered.
"""

from __future__ import annotations

import logging

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source, build_source
from smartmetadata_ingestion.errors import (
    WorkflowExecutionError,
    WorkflowInitializationError,
)
from smartmetadata_ingestion.lineage.dialect import Dialect, dialect_for_connection_type
from smartmetadata_ingestion.lineage.parser import QueryParserType, resolve_parser_type
from smartmetadata_ingestion.processors.identity import Processor
from smartmetadata_ingestion.progress import ProgressHook, RecordFailure
from smartmetadata_ingestion.records import TableQueryRecord
from smartmetadata_ingestion.sinks.metadata_rest import Sink
from smartmetadata_ingestion.usage.processor import (
    ParsedData,
    QueryParseFailure,
    parse_sql_statement,
)
from smartmetadata_ingestion.usage.query_log import QueryLogSource
from smartmetadata_ingestion.usage.sink import UsageBulkSink
from smartmetadata_ingestion.usage.stage import (
    RestTableBindingResolver,
    UsageStage,
    UserResolver,
    resolve_stage_dir,
)
from smartmetadata_ingestion.workflow import MetadataWorkflow

logger = logging.getLogger(__name__)

# Parsed queries per stage flush: small enough to bound memory on
# large query logs, large enough that staging-file appends stay
# coarse-grained.
STAGE_BATCH_SIZE = 100


class UsageWorkflow(MetadataWorkflow):
    """Runs a ``usage`` pipeline: parse the query log, stage it,
    publish it. The metadata sink and processor chain are not used —
    the stage and bulk sink own the writes — so ``prepare`` builds
    only the source plus the usage components."""

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        processors: list[Processor] | None = None,
        hook: ProgressHook | None = None,
        run_id: str | None = None,
    ) -> None:
        self._stage: UsageStage | None = None
        self._bulk_sink: UsageBulkSink | None = None
        self._dialect: Dialect = Dialect.ANSI
        self._parser_type: QueryParserType = QueryParserType.AUTO
        self._zero_publish = False
        super().__init__(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            run_id=run_id,
        )

    def prepare(self) -> None:
        if self._prepared:
            return
        try:
            self._source = build_source(self.config, self._provided_source)
            self._source.prepare()
            self._dialect, self._parser_type = self._resolve_parse_settings()
            stage_dir = resolve_stage_dir(self.config.source.stage_file_location)
            connection = self.config.source.connection or {}
            binding_resolver = RestTableBindingResolver(
                self._client,
                self.config.source.service_name,
                default_database=connection.get("database") or connection.get("catalog"),
                default_schema=connection.get("databaseSchema"),
            )
            self._stage = UsageStage(
                stage_dir=stage_dir,
                service_name=self.config.source.service_name,
                binding_resolver=binding_resolver,
                user_resolver=UserResolver(self._client),
            )
            self._bulk_sink = UsageBulkSink(
                self._client,
                stage_dir=stage_dir,
                service_name=self.config.source.service_name,
            )
            self._prepared = True
        except Exception as exc:
            self._record_failure(self.source_status, "Source", "source", exc)
            raise WorkflowInitializationError(
                f"could not prepare usage workflow: {exc}"
            ) from exc

    def _resolve_parse_settings(self) -> tuple[Dialect, QueryParserType]:
        """The cascade dialect and parser type for this run. The
        query-log source's spec carries its engine dialect and its
        ``parser_type()`` derives Auto from an absent
        ``queryParserConfig`` (D-C6); a non-query-log source falls
        back to the connection-type dialect map and the raw knob."""
        if isinstance(self._source, QueryLogSource):
            return self._source.spec.dialect, self._source.parser_type()
        base_type = self.config.source.type.removesuffix("-usage")
        return (
            dialect_for_connection_type(base_type),
            resolve_parser_type(self.config.source.query_parser_config),
        )

    def _execute_records(self) -> None:
        if self._source is None or self._stage is None or self._bulk_sink is None:
            raise WorkflowInitializationError("usage workflow is not prepared")
        batch: list[ParsedData] = []
        iterator = iter(self._source.produce())
        try:
            for record in iterator:
                self.source_status.records += 1
                self.source_status.expect(record.kind)
                if not isinstance(record, TableQueryRecord):
                    failure = self._record_failure(
                        self.processor_status,
                        record.label(),
                        record.kind,
                        WorkflowExecutionError(
                            f"unexpected record kind {record.kind!r} in a usage run"
                        ),
                    )
                    self.report.failures.append(failure)
                    self._notify_record(record, "failed")
                    if self.config.workflow.fail_fast:
                        raise WorkflowExecutionError(
                            f"unexpected record kind {record.kind!r} in a usage run"
                        )
                    continue
                self.source_status.complete(record.kind)
                # The processor step's total is recorded as records reach
                # it: the source streams, so no upfront total exists, and
                # completing without expecting would emit total=0 with
                # processed>0 — a shape the agent card's key-collapse
                # aggregation cannot distinguish from a real total.
                self.processor_status.expect(record.kind)
                try:
                    parsed = parse_sql_statement(record, self._dialect, self._parser_type)
                except QueryParseFailure as exc:
                    failure = self._record_failure(
                        self.processor_status, record.label(), record.kind, exc
                    )
                    self.report.failures.append(failure)
                    self._notify_record(record, "failed")
                    if self.config.workflow.fail_fast:
                        raise
                    continue
                if parsed is None:
                    self.report.skipped += 1
                    self.processor_status.filtered += 1
                    self.processor_status.complete(record.kind)
                    self._notify_record(record, "skipped")
                    continue
                self.processor_status.records += 1
                self.processor_status.complete(record.kind)
                batch.append(parsed)
                if len(batch) >= STAGE_BATCH_SIZE:
                    self._stage.handle_batch(batch)
                    batch.clear()
        finally:
            self._close_iterator(iterator)
        if batch:
            self._stage.handle_batch(batch)
        report = self._bulk_sink.run()
        for message in report.failures:
            failure = RecordFailure(label="Sink", kind="sink", message=message, stack_trace="")
            self.sink_status.failures.append(failure)
            self.report.failures.append(failure)
        self.sink_status.records += report.tables_published
        # The sink total is known only once the bulk sink reports: the
        # published groups are the sink step's total, so the progress
        # entry pairs total with processed instead of emitting total=0.
        # Failed groups surface as sink-step failures, not progress.
        self.sink_status.set_total("table", report.tables_published)
        self.sink_status.complete("table", report.tables_published)
        self.report.succeeded += report.tables_published
        logger.info(
            "usage run published tables=%d queries=%d joins=%d lifecycle=%d "
            "cost=%d skipped_cost=%d",
            report.tables_published,
            report.queries_published,
            report.joins_published,
            report.lifecycle_patched,
            report.cost_records_published,
            report.cost_records_skipped,
        )
        # A run that scanned queries but published nothing is
        # suspicious, not clean: warn so it shows in run status, and
        # remember it for the warning count folded in later.
        self._zero_publish = (
            self.source_status.records > 0 and report.tables_published == 0
        )
        if self._zero_publish:
            logger.warning(
                "usage run scanned %d queries but published no tables; "
                "the queries may have touched no catalog tables",
                self.source_status.records,
            )
        # Surface per-engine history-read failures: the source
        # isolates them per engine, so a partial run can still
        # succeed while an engine's history went unread. The count
        # is folded in _collect_warnings — this line surfaces the
        # same failures and must not count them twice.
        engine_failures = getattr(self._source, "engine_failures", None)
        if engine_failures:
            logger.warning(
                "query-log engines failed during the run: %s",
                "; ".join(str(failure) for failure in engine_failures),
            )
        if report.failures:
            raise WorkflowExecutionError(
                f"usage sink failed for {len(report.failures)} item(s); "
                f"first: {report.failures[0]}"
            )

    def close_steps(self) -> None:
        # The bulk sink's close deletes the run's staging files and
        # posts percentile computations; it runs even when
        # _execute_records raised, so partial staging files never
        # leak into the next run. Idempotent: a missing directory is
        # a no-op.
        bulk_sink = self._bulk_sink
        try:
            super().close_steps()
        finally:
            if bulk_sink is not None:
                bulk_sink.close()

    def _collect_warnings(self) -> None:
        """Usage warning counts (C-11/B-4): query-log engine failures
        on the source step, binding-resolution skips from the stage
        and join-column drops from the bulk sink on the processor
        step, and one source-step warning for a run that scanned
        queries but published no tables. A non-query-log source (a
        test stub) has no engine failures to count, and a missing
        bulk sink has no join drops."""
        if isinstance(self._source, QueryLogSource):
            self.source_status.warn(len(self._source.engine_failures))
        if self._zero_publish:
            self.source_status.warn(1)
        if self._stage is not None:
            self.processor_status.warn(self._stage.binding_skips)
        self.processor_status.warn(getattr(self._bulk_sink, "join_drops", 0))
