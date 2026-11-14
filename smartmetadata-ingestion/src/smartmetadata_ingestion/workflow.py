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
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.classification.columns import iter_leaf_columns
from smartmetadata_ingestion.classification.engine import (
    ClassificationEngine,
    resolve_store_sample_data,
)
from smartmetadata_ingestion.classification.patching import (
    patch_column_tags,
    store_tabular_sample_data,
    store_topic_sample_data,
)
from smartmetadata_ingestion.client.rest import (
    CONTAINERS_PATH,
    TABLES_PATH,
    TOPICS_PATH,
    RestClient,
)
from smartmetadata_ingestion.config import (
    AppSpec,
    ClassificationSpec,
    DataDiffSideSpec,
    DataDiffSpec,
    LineageSpec,
    ProfilerMetricParamSpec,
    ProfileSpec,
    SourceConfig,
    TagSpec,
    TestCaseResultSpec,
    UsageSpec,
    WorkflowConfig,
)
from smartmetadata_ingestion.connectors.base import Source, build_source
from smartmetadata_ingestion.connectors.select import is_selected, is_selected_table
from smartmetadata_ingestion.data_quality.builder import ValidatorBuilder
from smartmetadata_ingestion.data_quality.models import split_fqn
from smartmetadata_ingestion.data_quality.sampling import resolve_sample_config
from smartmetadata_ingestion.data_quality.source import (
    PulledSuite,
    pull_test_cases,
)
from smartmetadata_ingestion.datadiff import (
    DataDiffBinding,
    datadiff_binding,
    run_data_diff_spec,
)
from smartmetadata_ingestion.errors import (
    RestError,
    WorkflowError,
    WorkflowExecutionError,
    WorkflowInitializationError,
    WorkflowTeardownError,
)
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.pipeline_status import (
    PipelineState,
    build_pipeline_status,
    final_pipeline_state,
    now_ms,
)
from smartmetadata_ingestion.processors.identity import Processor, build_processors
from smartmetadata_ingestion.profiler import (
    ProfilerBinding,
    build_database_sampler,
    profiler_binding,
)
from smartmetadata_ingestion.profiler_plan import (
    ProfilerTablePlan,
    clamp_thread_count,
    resolve_table_plan,
    table_passes_classification_filter,
    validate_pipeline_config,
)
from smartmetadata_ingestion.progress import (
    NullHook,
    ProgressHook,
    RecordFailure,
    RunReport,
    StepStatus,
)
from smartmetadata_ingestion.reconcile import (
    enabled_reconcile_kinds,
    reconcile_stale,
    service_family_for_source_type,
)
from smartmetadata_ingestion.records import (
    AppRecord,
    ClassificationRecord,
    ColumnLineage,
    DatabaseRecord,
    EntityRef,
    LineageEndpoint,
    LineageRecord,
    ProfileRecord,
    SchemaRecord,
    TableRecord,
    TagRecord,
    TestCaseResultRecord,
    UsageRecord,
    WorkflowRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import FlushResult, Sink, build_sink
from smartmetadata_ingestion.topology import SeenSet, order_records

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
        run_id: str | None = None,
    ) -> None:
        self.config = config
        self._owns_client = client is None
        self._client = client or RestClient(config.server)
        self._provided_source = source
        self._provided_sink = sink
        self._provided_processors = processors
        # A caller (e.g. the Airflow plugin) may pin the run id so the
        # workflow's own status writeback converges with the id the server
        # already recorded for this run. Unset, execute() mints a UUID.
        self._requested_run_id = run_id
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
        self.seen = SeenSet()
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
        # ADR:2026-11-14-agent-capability-batch1
        # Incremental metadata ingestion has no audit-table reader in
        # this runner: enabling it must fail loudly, never run a full
        # ingestion while reporting incremental semantics. The gate is
        # metadata-only; lineage/usage incremental knobs are separate.
        incremental = self.config.source.incremental
        if (
            self.config.workflow.type == "metadata"
            and incremental is not None
            and incremental.enabled
        ):
            raise WorkflowError(
                "incremental metadata ingestion is not supported: "
                "source.incremental.enabled=true needs an audit-table "
                "incremental reader; disable incremental for a full run"
            )
        try:
            self._source = build_source(
                self.config,
                self._provided_source,
                # H track 1: the sampler kill-switch reader. getattr-guarded:
                # a stub client without the method yields no reader and the
                # sampling gate fails closed, never a crash here.
                profiler_settings_reader=getattr(
                    self._client, "get_profiler_config_settings", None
                ),
            )
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
        self.run_id = self._requested_run_id or str(uuid.uuid4())
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
        if pending is None:
            # Reconcile runs when no exception escaped the record run:
            # the listing then ran to completion, so the seen set is
            # complete even when individual records failed (their
            # failures are recorded in the report, not escaping). An
            # escaping exception means the listing was cut short, and
            # reconciling against that partial seen set would delete
            # live entities the run never reached. A reconcile failure
            # fails the run (D-C7): it is recorded as a sink-step
            # failure, never swallowed as a warning.
            # ADR:2026-11-14-agent-capability-batch1
            try:
                self._reconcile_if_configured()
            except Exception as exc:
                failure = self._record_failure(self.sink_status, "Sink", "sink", exc)
                self.report.failures.append(failure)
                pending = exc
        # Warning counts fold in on both paths: a failed run's partial
        # warnings still belong in its final status.
        self._collect_warnings()
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
        # Steps are reported in every state: the running writeback carries
        # the (still zero) step skeletons so live cards can attach, and
        # the finished writeback carries the final counts.
        steps = [self.source_status, self.processor_status, self.sink_status]
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


    def _collect_warnings(self) -> None:
        """Fold component warning counts into the step statuses.

        The counted set and the single increment path live on
        ``StepStatus.warn`` (C-11/B-4): components expose counts, and
        the workflow folds them in here via ``warn``. The base
        workflow has none beyond reconcile, which folds its own skips
        in ``_reconcile_if_configured``; subclasses override to add
        theirs. Implementations must be pure count reads that cannot
        raise — this runs on success and failure paths alike, just
        before the final status writeback.
        """
        return None

    def _reconcile_if_configured(self) -> None:
        if not self.config.workflow.reconcile_stale:
            return
        # Defense in depth: only metadata runs reconcile. Translation
        # already closes the gate for other workflow types, but a YAML
        # config may pair reconcileStale with any type, and a
        # usage/lineage/profiler run must never delete catalog
        # entities because a config said so.
        if self.config.workflow.type != "metadata":
            logger.warning(
                "reconcile skipped: workflow type %s never reconciles; "
                "reconcileStale=true is ignored",
                self.config.workflow.type,
            )
            # One sink-step warning for the skipped reconcile itself
            # (counted set item 2): the run asked for reconcile and
            # its type can never have it.
            self.sink_status.warn(1)
            return
        scope_fqn = self.config.source.service_name
        scope_entity_type = service_family_for_source_type(self.config.source.type)
        seen = getattr(self._sink, "seen", None)
        if isinstance(seen, SeenSet):
            for kind, fqns in seen.by_kind.items():
                for fqn in fqns:
                    self.seen.by_kind.setdefault(kind, set()).add(fqn)
        gate_skipped: list[str] = []
        enabled = enabled_reconcile_kinds(self.config.source, skipped=gate_skipped)
        # Gate-excluded kinds count even when the reconcile itself
        # then fails: the skips already happened.
        self.sink_status.warn(len(gate_skipped))
        empty_skipped: list[str] = []
        try:
            reconcile_stale(
                self._client,
                scope_fqn=scope_fqn,
                scope_entity_type=scope_entity_type,
                seen=self.seen,
                enabled_kinds=enabled,
                dry_run=self.config.workflow.reconcile_dry_run,
                skipped=empty_skipped,
            )
        finally:
            self.sink_status.warn(len(empty_skipped))

    def _execute_records(self) -> None:
        if self._source is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        produced: list = []
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
            produced.append(record)
        produced.extend(self._configured_lineage())
        produced.extend(self._configured_usage())
        produced.extend(self._configured_profiles())
        produced.extend(self._configured_test_case_results())
        produced.extend(self._configured_classifications())
        produced.extend(self._configured_tags())
        produced.extend(self._configured_apps())
        # The source step's progress totals are known once everything is
        # collected: per-kind discovered counts, completed as each record
        # is taken up for handling.
        totals: dict[str, int] = {}
        for record in produced:
            totals[record.kind] = totals.get(record.kind, 0) + 1
        for kind, total in totals.items():
            self.source_status.set_total(kind, total)
        for record in order_records(produced):
            self.source_status.records += 1
            self.source_status.complete(record.kind)
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
        self.seen.add(record)
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
        # The record reached the sink: it counts toward the sink step's
        # expected total now, and toward processed only once its write
        # (or flush) actually lands.
        self.sink_status.expect(current.kind)
        try:
            self._sink.write(current)
            self._count_sink_write(current)
        except Exception as exc:
            # A flush-then-inner-write failure (sampled topic, service):
            # the flush outcomes landed first — apply them before
            # recording this record's own failure.
            self._drain_flush_result(fail_fast=False)
            failure = self._record_failure(self.sink_status, record.label(), record.kind, exc)
            self.report.failures.append(failure)
            self._notify_record(record, "failed")
            if self.config.workflow.fail_fast:
                raise

    def _count_sink_write(self, record: WorkflowRecord) -> None:
        """Count a sink write: immediately, or when its flush reports it.

        A bulk sink only buffers some records (``buffers``): those count
        only once a flush reports them (drained here and at close), never
        on ``write()`` returning — the live incident counted 53 buffered
        tables as succeeded while 0 had landed. A record the bulk sink
        writes immediately (service, lineage, sampled topic) and any
        record a non-bulk sink writes count right away, as before.
        """
        drain = getattr(self._sink, "take_flush_result", None)
        if not callable(drain):
            self.sink_status.records += 1
            self.sink_status.complete(record.kind)
            self.report.succeeded += 1
            self._notify_record(record, "written")
            return
        buffers = getattr(self._sink, "buffers", None)
        buffered = callable(buffers) and buffers(record)
        self._drain_flush_result()
        if not buffered:
            self.sink_status.records += 1
            self.sink_status.complete(record.kind)
            self.report.succeeded += 1
            self._notify_record(record, "written")

    def _drain_flush_result(self, *, fail_fast: bool = True) -> None:
        """Apply any flush outcomes the sink accumulated, if it reports them."""
        drain = getattr(self._sink, "take_flush_result", None)
        if not callable(drain):
            return
        result = drain()
        if not result:
            return
        self._apply_flush_result(result)
        if fail_fast and result.failed and self.config.workflow.fail_fast:
            raise WorkflowExecutionError(
                f"bulk flush failed for {len(result.failed)} record(s): "
                f"{result.failed[0].error}"
            )

    def _apply_flush_result(self, result: FlushResult) -> None:
        """Fold one flush outcome into the sink step and the report.

        Only truly-flushed records count as succeeded; each failed
        payload becomes its own failure, so the run history names the
        records that did not land instead of one batch error.
        """
        for kind, count in result.succeeded.items():
            self.sink_status.records += count
            self.sink_status.complete(kind, count)
            self.report.succeeded += count
        for failure in result.failed:
            record_failure = RecordFailure(
                label=failure.label,
                kind=failure.kind,
                message=failure.error,
                stack_trace=failure.stack_trace,
            )
            self.sink_status.failures.append(record_failure)
            self.report.failures.append(record_failure)

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
                result = self._sink.flush()
            except Exception as exc:
                self._record_failure(self.sink_status, "Sink", "sink", exc)
                failures.append(exc)
            else:
                # flush() returns the drained outcome (bulk sink) or None;
                # its successes count here, its failures are per-record.
                if result is not None:
                    self._apply_flush_result(result)
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

    def _configured_usage(self) -> Iterable[UsageRecord]:
        for spec in self.config.usage:
            yield _usage_from_spec(spec)

    def _configured_profiles(self) -> Iterable[ProfileRecord]:
        for spec in self.config.profiles:
            yield _profile_from_spec(spec)

    def _configured_test_case_results(self) -> Iterable[TestCaseResultRecord]:
        for spec in self.config.test_case_results:
            yield _test_case_result_from_spec(spec)

    def _configured_classifications(self) -> Iterable[ClassificationRecord]:
        for spec in self.config.classifications:
            yield _classification_from_spec(spec)

    def _configured_tags(self) -> Iterable[TagRecord]:
        for spec in self.config.tags:
            yield _tag_from_spec(spec)

    def _configured_apps(self) -> Iterable[AppRecord]:
        for spec in self.config.apps:
            yield _app_from_spec(spec)

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


def _profiler_metric_params(
    specs: list[ProfilerMetricParamSpec],
) -> dict[str, dict[str, dict[str, Any]]]:
    """Convert config-file metric params to the reader's per-column mapping.

    One spec names one column; repeated specs for the same column merge.
    Metric names are the official ones (likeCount, iLikeCount, ...).
    """
    params: dict[str, dict[str, dict[str, Any]]] = {}
    for spec in specs:
        column_params = params.setdefault(spec.column, {})
        for field, metric in (
            ("like_count", "likeCount"),
            ("ilike_count", "iLikeCount"),
            ("not_like_count", "notLikeCount"),
            ("regex_count", "regexCount"),
            ("not_regex_count", "notRegexCount"),
        ):
            expression = getattr(spec, field)
            if expression is not None:
                column_params[metric] = {"expression": expression}
        if spec.count_in_set is not None:
            column_params["countInSet"] = {"values": list(spec.count_in_set)}
    return params


# A profiler run succeeds only when at least 80% of its attempted tables
# produced a profile (the pin ProfilerWorkflow successThreshold): below
# that, the run fails loudly instead of reporting partial success as if
# the catalog were fully profiled. Profiles already written stay written.
PROFILER_SUCCESS_THRESHOLD_PCT = 80


@dataclass
class _ProfileWork:
    """One table queued for profiling, with its resolved plan."""

    database: str
    schema: str
    table: str
    fqn: str
    plan: ProfilerTablePlan


class ProfilerWorkflow(MetadataWorkflow):
    """Runs the connector's profiler interface live against the source database.

    Table enumeration reuses the metadata source's ``produce()``; only
    ``TableRecord`` entries are profiled, nothing is re-ingested as metadata.
    Each table is enriched with its catalog entity (tableProfilerConfig,
    custom metrics, tags, partition) and resolved against the pipeline
    knobs and the global profiler configuration before compute; a table
    whose fetch, plan, or compute fails is recorded and skipped, and the
    run fails only when fewer than the success threshold of attempted
    tables produced a profile.
    """

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        processors: list[Processor] | None = None,
        hook: ProgressHook | None = None,
        profile_reader: Any | None = None,
        table_fetcher: Any | None = None,
        run_id: str | None = None,
    ) -> None:
        self._injected_reader = profile_reader
        # A fetcher maps a table FQN to its catalog entity dict (or None
        # when the table is not cataloged yet); tests inject one to avoid
        # the network. Production always uses the REST client.
        self._injected_fetcher = table_fetcher
        self._workers: int | None = None
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
        # Config the runner cannot honor fails the run before any source
        # or sink is built, never mid-run after partial work.
        validate_pipeline_config(self.config.source)
        requested_threads = self.config.source.thread_count
        self._workers = clamp_thread_count(requested_threads)
        if requested_threads is not None and self._workers != requested_threads:
            logger.warning(
                "profiler threadCount %s clamped to %s",
                requested_threads,
                self._workers,
            )
        if self._injected_fetcher is None and not callable(
            getattr(self._client, "get_table_by_name", None)
        ):
            raise WorkflowInitializationError(
                "profiler workflow requires a catalog client with "
                "get_table_by_name (or an injected table_fetcher) to "
                "resolve per-table profiler configuration"
            )
        super().prepare()
        self._profiler_binding = _require_binding(self.config, "profiler")
        reader = self._injected_reader
        if reader is None:
            reader = self._profiler_binding.profile_reader(
                self._profiler_binding.connect(self.config.source.connection or {})
            )
        self._profiler = self._profiler_binding.profiler(reader)

    def _execute_records(self) -> None:
        if self._source is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        iterator = iter(self._source.produce())
        tables: list[tuple[str, str, str]] = []
        database: str | None = None
        schema: str | None = None
        try:
            for record in iterator:
                if isinstance(record, DatabaseRecord):
                    database = record.name
                elif isinstance(record, SchemaRecord):
                    schema = record.name
                elif isinstance(record, TableRecord):
                    if database is None or schema is None:
                        raise WorkflowExecutionError(
                            f"table {record.name} arrived without a database/schema context"
                        )
                    tables.append((database, schema, record.name))
        finally:
            self._close_iterator(iterator)
        timestamp = now_ms()
        metric_params = _profiler_metric_params(self.config.profiler_metric_params)
        default_sample = (
            self.config.profiler_sample.to_static()
            if self.config.profiler_sample is not None
            else None
        )
        table_samples = {
            spec.table_fqn: spec.to_static() for spec in self.config.profiler_table_samples
        }
        global_settings = self._fetch_global_settings()
        work_items, early_failures = self._plan_tables(
            tables, global_settings, default_sample, table_samples
        )
        self.source_status.set_total("table", len(work_items))
        computed = self._compute_profiles(work_items, timestamp, metric_params)
        for _work, profile in computed:
            if profile is None:
                continue
            self.source_status.complete("table")
            self._handle_record(profile)
        # Fetch/plan failures count toward the denominator: a run whose
        # tables mostly failed before compute must trip the threshold,
        # not report 100% over the survivors. Classification-filtered
        # tables are not counted — the filter is scope, not failure, and
        # an all-filtered run has nothing to fail.
        attempted = len(work_items) + early_failures
        succeeded = sum(1 for _, profile in computed if profile is not None)
        if attempted and succeeded * 100 < PROFILER_SUCCESS_THRESHOLD_PCT * attempted:
            raise WorkflowExecutionError(
                f"profiler run failed: {succeeded} of {attempted} tables "
                f"produced a profile, below the {PROFILER_SUCCESS_THRESHOLD_PCT}% "
                "success threshold"
            )

    def _plan_tables(
        self,
        tables: list[tuple[str, str, str]],
        global_settings: dict[str, Any] | None,
        default_sample: Any,
        table_samples: dict[str, Any],
    ) -> tuple[list[_ProfileWork], int]:
        """Resolve each table's plan, sequentially: entity fetches are
        REST calls and plan resolution is pure, so neither benefits from
        threads. A fetch or plan failure isolates to its table. Returns
        the queued work plus the count of tables that failed before
        compute, so the success threshold counts them as attempted."""
        source = self.config.source
        work_items: list[_ProfileWork] = []
        early_failures = 0
        for database, schema, table in tables:
            table_fqn = build_fqn(source.service_name, database, schema, table)
            try:
                entity = self._fetch_table_entity(table_fqn)
            except Exception as exc:
                self._record_table_failure(table_fqn, exc)
                early_failures += 1
                continue
            if not table_passes_classification_filter(source, entity):
                self.source_status.filtered += 1
                continue
            try:
                plan = resolve_table_plan(
                    source,
                    entity,
                    global_settings,
                    fallback_sample=resolve_sample_config(
                        table_samples.get(table_fqn), default_sample
                    ),
                )
            except Exception as exc:
                self._record_table_failure(table_fqn, exc)
                early_failures += 1
                continue
            work_items.append(
                _ProfileWork(
                    database=database,
                    schema=schema,
                    table=table,
                    fqn=table_fqn,
                    plan=plan,
                )
            )
        return work_items, early_failures

    def _compute_profiles(
        self,
        work_items: list[_ProfileWork],
        timestamp: int,
        metric_params: dict[str, dict[str, dict[str, Any]]],
    ) -> list[tuple[_ProfileWork, ProfileRecord | None]]:
        """Compute profiles, in submission order. Compute is the only
        parallel stage: records reach the sink sequentially afterwards,
        because sinks may buffer. A single worker still runs through the
        executor so the per-table timeout applies to every run. A thread
        that outlives its timeout cannot be killed mid-query; it is
        abandoned (shutdown does not wait) and the table is already
        recorded as failed."""
        timeout = self.config.source.timeout_seconds
        service = self.config.source.service_name

        def _compute(work: _ProfileWork) -> ProfileRecord:
            return self._profiler.profile(
                service=service,
                database=work.database,
                schema=work.schema,
                table=work.table,
                timestamp=timestamp,
                metric_params=metric_params,
                options=work.plan.to_options(),
            )

        executor = ThreadPoolExecutor(
            max_workers=self._workers or 1, thread_name_prefix="profiler"
        )
        try:
            futures = [executor.submit(_compute, work) for work in work_items]
            computed: list[tuple[_ProfileWork, ProfileRecord | None]] = []
            for work, future in zip(work_items, futures, strict=True):
                try:
                    computed.append((work, future.result(timeout=timeout)))
                except FutureTimeoutError:
                    self._record_table_failure(
                        work.fqn,
                        TimeoutError(
                            f"profiling timed out after {timeout} seconds"
                        ),
                    )
                    computed.append((work, None))
                except Exception as exc:
                    self._record_table_failure(work.fqn, exc)
                    computed.append((work, None))
            return computed
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    def _record_table_failure(self, table_fqn: str, exc: Exception) -> None:
        failure = self._record_failure(
            self.processor_status, table_fqn, "table", exc
        )
        self.report.failures.append(failure)

    def _fetch_global_settings(self) -> dict[str, Any] | None:
        """The global ProfilerConfiguration settings, once per run. An
        unreadable settings endpoint leaves metric filtering to the
        pipeline and table configs, with a warning — the settings read
        is advisory, never a run blocker."""
        reader = getattr(self._client, "get_profiler_config_settings", None)
        if not callable(reader):
            return None
        try:
            return reader()
        except Exception as exc:
            logger.warning("could not read profilerConfiguration settings: %s", exc)
            return None

    def _fetch_table_entity(self, table_fqn: str) -> dict[str, Any] | None:
        """One table's catalog entity, or None when the table is not
        cataloged yet (HTTP 404): uncataloged tables profile with
        pipeline config only. Any other fetch error isolates to the
        table."""
        try:
            if self._injected_fetcher is not None:
                return self._injected_fetcher(table_fqn)
            return self._client.get_table_by_name(
                table_fqn,
                fields="tableProfilerConfig,columns,customMetrics,tags,tablePartition",
            )
        except RestError as exc:
            if exc.status_code == 404:
                return None
            raise


class TestSuiteWorkflow(MetadataWorkflow):
    """Runs test cases live against the source database.

    Two modes (ADR:2026-11-08-test-suite-server-pull): the default
    server-pulled mode (``source.entityFullyQualifiedName`` names a table
    suite, or an empty inline list pulls the logical suite named
    ``source.service_name``) and the transitional inline mode
    (``config.test_cases`` with no FQN). Combining an FQN with inline cases
    is a configuration error. A pulled case that cannot be built or run
    writes an ``Aborted`` result and the run continues with the next case.
    """

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        processors: list[Processor] | None = None,
        hook: ProgressHook | None = None,
        execute: Any | None = None,
        fetch_keys: Any | None = None,
        fetch_rows: Any | None = None,
        run_id: str | None = None,
    ) -> None:
        self._injected_execute = execute
        self._injected_fetch_keys = fetch_keys
        self._injected_fetch_rows = fetch_rows
        self._pulled_suites: list[PulledSuite] | None = None
        self._validator_builder: ValidatorBuilder | None = None
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
        super().prepare()
        self._quality_binding = _require_binding(self.config, "TestSuite")
        execute = self._injected_execute or self._execute_scalar
        self._quality = self._quality_binding.quality(execute)
        entity_fqn = self.config.source.entity_fully_qualified_name
        if entity_fqn and self.config.test_cases:
            raise WorkflowInitializationError(
                "TestSuite workflow cannot combine "
                "source.entityFullyQualifiedName with inline testCases; "
                "pick the server-pulled path or the inline path"
            )
        if entity_fqn or not self.config.test_cases:
            self._pulled_suites = pull_test_cases(
                self._client,
                entity_fqn=entity_fqn,
                service_name=self.config.source.service_name,
                test_case_names=self.config.source.test_case_names,
            )
            self._validator_builder = ValidatorBuilder(
                dialect=self.config.source.type,
                execute=execute,
                table_resolver=self._client.get_table_by_name,
                source_connection=self.config.source.connection or {},
                fetch_keys=self._injected_fetch_keys,
                fetch_rows=self._injected_fetch_rows,
                service_resolver=self._client.get_database_service_by_name,
            )

    def _execute_scalar(self, sql: str) -> Any:
        connect = self._quality_binding.connect(self.config.source.connection or {})
        with connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                row = cursor.fetchone()
            finally:
                cursor.close()
        if row is None:
            raise WorkflowError(f"test case query returned no rows: {sql}")
        return row[0]

    def _execute_records(self) -> None:
        timestamp = now_ms()
        if self._pulled_suites is not None:
            self._execute_pulled(timestamp)
            return
        for spec in self.config.test_cases:
            result = self._quality.run_test_case(
                test_case_fqn=spec.test_case_fqn,
                timestamp=timestamp,
                expression=spec.expression,
                expected=spec.expected,
            )
            self._handle_record(result)

    def _execute_pulled(self, timestamp: int) -> None:
        builder = self._validator_builder
        if builder is None or self._pulled_suites is None:
            raise WorkflowInitializationError(
                "pulled TestSuite workflow was not prepared"
            )
        for suite in self._pulled_suites:
            for case in suite.cases:
                try:
                    validator = builder.build(
                        case, suite.table, timestamp=timestamp
                    )
                    result = validator.run()
                except Exception as exc:
                    # Official per-case handling: a case that cannot be
                    # built or run aborts itself, it does not fail the run.
                    result = TestCaseResultRecord(
                        test_case_fqn=case.fully_qualified_name,
                        timestamp=timestamp,
                        test_case_status="Aborted",
                        result=(
                            f"Test case {case.fully_qualified_name!r} could "
                            f"not run: {exc}"
                        ),
                    )
                self._handle_record(result)


class DataDiffWorkflow(MetadataWorkflow):
    """Runs configured data diffs live against the source databases.

    Tables come from ``config.data_diffs`` (never from the metadata source's
    ``produce()``); each spec compares two table sides and writes one
    :class:`TestCaseResultRecord` — the official tableDiff write-back shape.
    Inline specs carry no table metadata, so schema differences are not
    compared and the result says so (Q-3 (a)).
    """

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        processors: list[Processor] | None = None,
        hook: ProgressHook | None = None,
        fetch_keys: Any | None = None,
        fetch_rows: Any | None = None,
        run_id: str | None = None,
    ) -> None:
        self._injected_fetch_keys = fetch_keys
        self._injected_fetch_rows = fetch_rows
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
        super().prepare()
        bindings: list[tuple[DataDiffBinding, DataDiffBinding]] = []
        for spec in self.config.data_diffs:
            bindings.append(
                (
                    self._require_side_binding(spec.left, "left"),
                    self._require_side_binding(spec.right, "right"),
                )
            )
        self._spec_bindings = bindings

    def _require_side_binding(self, side_spec: DataDiffSideSpec, side_name: str) -> DataDiffBinding:
        source_type = side_spec.source_type or self.config.source.type
        binding = datadiff_binding(source_type)
        if binding is None:
            raise WorkflowInitializationError(
                f"data_diff workflow has no binding for source type "
                f"{source_type!r} ({side_name} side)"
            )
        return binding

    def _execute_records(self) -> None:
        timestamp = now_ms()
        for spec, (left_binding, right_binding) in zip(
            self.config.data_diffs, self._spec_bindings, strict=True
        ):
            self._handle_record(self._run_spec(spec, left_binding, right_binding, timestamp))

    def _run_spec(
        self,
        spec: DataDiffSpec,
        left_binding: DataDiffBinding,
        right_binding: DataDiffBinding,
        timestamp: int,
    ) -> TestCaseResultRecord:
        return run_data_diff_spec(
            spec,
            left_binding=left_binding,
            right_binding=right_binding,
            default_connection=self.config.source.connection or {},
            fetch_keys=self._injected_fetch_keys,
            fetch_rows=self._injected_fetch_rows,
            left_source_type=spec.left.source_type or self.config.source.type,
            right_source_type=spec.right.source_type or self.config.source.type,
            schema_compared=False,
            timestamp=timestamp,
        )


def _require_binding(config: WorkflowConfig, kind: str) -> ProfilerBinding:
    binding = profiler_binding(config.source.type)
    if binding is None:
        raise WorkflowInitializationError(
            f"{kind} workflow has no binding for source type {config.source.type!r}"
        )
    return binding


def _lineage_from_spec(spec: LineageSpec) -> LineageRecord:
    pipeline = None
    if spec.pipeline is not None:
        pipeline = EntityRef(
            type=spec.pipeline.type,
            fully_qualified_name=spec.pipeline.fully_qualified_name,
            id=spec.pipeline.id,
            name=spec.pipeline.name,
        )
    return LineageRecord(
        from_entity=LineageEndpoint(type=spec.from_entity.type, fqn=spec.from_entity.fqn),
        to_entity=LineageEndpoint(type=spec.to_entity.type, fqn=spec.to_entity.fqn),
        description=spec.description,
        source=spec.source,
        sql_query=spec.sql_query,
        columns_lineage=[
            ColumnLineage(
                from_columns=list(col.from_columns),
                to_column=col.to_column,
                function=col.function,
            )
            for col in spec.columns_lineage
        ],
        pipeline=pipeline,
    )


def _usage_from_spec(spec: UsageSpec) -> UsageRecord:
    return UsageRecord(
        entity_type=spec.entity_type,
        fqn=spec.fqn,
        date=spec.date,
        count=spec.count,
    )


def _profile_from_spec(spec: ProfileSpec) -> ProfileRecord:
    return ProfileRecord(
        entity_type=spec.entity_type,
        fqn=spec.fqn,
        table_id=spec.table_id,
        profile_data=spec.profile_data,
        profile_type=spec.profile_type,
        timestamp=spec.timestamp,
        table_profile=spec.table_profile,
        column_profile=list(spec.column_profile),
        system_profile=list(spec.system_profile),
    )


def _test_case_result_from_spec(spec: TestCaseResultSpec) -> TestCaseResultRecord:
    return TestCaseResultRecord(
        test_case_fqn=spec.test_case_fqn,
        timestamp=spec.timestamp,
        test_case_status=spec.test_case_status,
        test_result_value=list(spec.test_result_value),
        result=spec.result,
        sample_data=spec.sample_data,
        passed_rows=spec.passed_rows,
        failed_rows=spec.failed_rows,
        passed_rows_percentage=spec.passed_rows_percentage,
        failed_rows_percentage=spec.failed_rows_percentage,
        duration=spec.duration,
    )


def _classification_from_spec(spec: ClassificationSpec) -> ClassificationRecord:
    return ClassificationRecord(
        name=spec.name,
        description=spec.description,
        display_name=spec.display_name,
        provider=spec.provider,
        mutually_exclusive=spec.mutually_exclusive,
    )


def _tag_from_spec(spec: TagSpec) -> TagRecord:
    return TagRecord(
        name=spec.name,
        description=spec.description,
        classification=spec.classification,
        parent=spec.parent,
        display_name=spec.display_name,
        provider=spec.provider,
        mutually_exclusive=spec.mutually_exclusive,
    )


def _app_from_spec(spec: AppSpec) -> AppRecord:
    return AppRecord(
        name=spec.name,
        display_name=spec.display_name,
        description=spec.description,
        bot=spec.bot,
        app_configuration=spec.app_configuration,
        app_schedule=spec.app_schedule,
        supports_interrupt=spec.supports_interrupt,
        allow_bot_impersonation=spec.allow_bot_impersonation,
    )


# ---------------------------------------------------------------------------
# AutoClassification
# ---------------------------------------------------------------------------
# ADR:2026-11-14-autoclassification-engine

# Source types whose entities are topics (messaging) or containers
# (storage). Every other recognized type is a database whose entities are
# tables, resolved through the profiler binding table: a type the fork
# executes database work against IS a database type, so the category
# follows the binding table instead of a second enumeration that could
# drift from it.
_AC_MESSAGING_TYPES = frozenset({"kafka", "redpanda"})
_AC_STORAGE_TYPES = frozenset({"s3"})

# Catalog enumeration per entity kind: the collection path plus the fields
# the run needs — the columns for classification, the tags for the
# classification filter. The service scope travels as ?service= on the
# listing, so enumeration never sees another service's entities.
_AC_ENTITY_COLLECTION: dict[str, tuple[str, str]] = {
    "table": (TABLES_PATH, "columns,tags"),
    "topic": (TOPICS_PATH, "messageSchema,tags"),
    "container": (CONTAINERS_PATH, "dataModel,tags"),
}

# Service-existence check per entity kind: the RestClient getter whose
# GET proves the configured service exists. The check runs in prepare,
# before enumeration, so a bad service name fails loudly instead of
# "succeeding" over an empty listing. The database getter already
# existed (cross-service tableDiff); messaging/storage mirror it.
_AC_SERVICE_GETTERS: dict[str, str] = {
    "table": "get_database_service_by_name",
    "topic": "get_messaging_service_by_name",
    "container": "get_storage_service_by_name",
}


def _validate_service_exists(client: Any, kind: str, service_name: str) -> None:
    """Prove the run's service exists via the category-appropriate GET.

    The getter raises on a missing service (the catalog answers 404)
    and the caller lets that failure propagate: an unknown service is
    a configuration error, never an empty run. Other catalog failures
    propagate unchanged, with their own status and body intact.
    """
    getter = getattr(client, _AC_SERVICE_GETTERS[kind])
    getter(service_name)


def _ac_entity_type(source_type: str) -> str:
    """The catalog entity kind an autoClassification run classifies.

    A type the fork executes no database work against, and that is
    neither messaging nor storage, is unknown — the run fails here,
    before enumeration, rather than succeeding over zero entities.
    """
    key = source_type.strip().lower()
    if key in _AC_MESSAGING_TYPES:
        return "topic"
    if key in _AC_STORAGE_TYPES:
        return "container"
    if profiler_binding(key) is not None:
        return "table"
    raise WorkflowInitializationError(
        f"autoClassification has no entity category for source type "
        f"{source_type!r}: the fork knows no database, messaging, or "
        "storage sampler for it"
    )


@dataclass
class _EntitySample:
    """What one entity's sampler produced: tabular rows, or topic
    messages. Exactly one side is populated: messages carry no field
    attribution, so topics classify by column name only."""

    rows: list[dict[str, Any]] | None
    messages: list[str] | None


def _sample_field_names(rows: list[dict[str, Any]]) -> list[str]:
    """The stored sample's column order: first-seen key order across
    the rows. The TableData payload is positional, so a key that
    appears only in later rows still gets a column (earlier rows read
    null for it) instead of silently dropping that field."""
    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                names.append(key)
    return names


def _database_sample_adapter(
    sampler: Any, takes_database: bool, limit: int
) -> Callable[[dict[str, Any]], _EntitySample]:
    """Adapt a database sampler's non-uniform arity behind the one
    sample shape the workflow drives. The FQN must carry exactly the
    database/schema/table segments; anything else is corrupt catalog
    data and fails the entity loudly instead of guessing segments."""

    def sample(entity: dict[str, Any]) -> _EntitySample:
        fqn = entity.get("fullyQualifiedName") or ""
        parts = split_fqn(fqn)
        if len(parts) != 4:
            raise WorkflowExecutionError(
                f"table FQN {fqn!r} has no database/schema/table segments"
            )
        _, database, schema, table = parts
        if takes_database:
            rows = sampler.sample(database, schema, table, limit=limit)
        else:
            rows = sampler.sample(schema, table, limit=limit)
        return _EntitySample(rows=list(rows), messages=None)

    return sample


def _messaging_sample_adapter(
    sampler: Any, limit: int
) -> Callable[[dict[str, Any]], _EntitySample]:
    """Adapt a topic sampler: messages by topic name, no rows."""

    def sample(entity: dict[str, Any]) -> _EntitySample:
        topic = entity.get("name") or ""
        return _EntitySample(
            rows=None, messages=list(sampler.sample(topic=topic, limit=limit))
        )

    return sample


def _storage_sample_adapter(
    sampler: Any, limit: int
) -> Callable[[dict[str, Any]], _EntitySample]:
    """Adapt the storage sampler: the bucket is the FQN's second
    segment, the prefix everything after it. A bare service-level FQN
    names no bucket and fails the entity loudly."""

    def sample(entity: dict[str, Any]) -> _EntitySample:
        fqn = entity.get("fullyQualifiedName") or ""
        parts = split_fqn(fqn)
        if len(parts) < 2:
            raise WorkflowExecutionError(f"container FQN {fqn!r} has no bucket segment")
        bucket = parts[1]
        prefix = "/".join(parts[2:])
        rows = sampler.sample(bucket=bucket, prefix=prefix, limit=limit)
        return _EntitySample(rows=list(rows), messages=None)

    return sample


def _messaging_sampler(source: SourceConfig) -> Any:
    """The live topic sampler for a messaging source type. The imports
    stay local: the messaging connector modules pull broker client
    libraries the core suite runs without."""
    from smartmetadata_ingestion.connectors.kafka import KafkaSampler
    from smartmetadata_ingestion.connectors.redpanda import RedpandaSampler

    samplers = {"kafka": KafkaSampler, "redpanda": RedpandaSampler}
    try:
        sampler_cls = samplers[source.type.strip().lower()]
    except KeyError as exc:
        raise WorkflowInitializationError(
            f"no messaging sampler for source type {source.type!r}"
        ) from exc
    return sampler_cls(source)


class AutoClassificationWorkflow(MetadataWorkflow):
    """Runs an ``autoClassification`` pipeline: enumerate the service's
    catalog entities, sample each one live, classify its columns
    against the PII candidate tags, persist the samples when
    configured, and PATCH the suggested labels onto the columns.

    The metadata source/sink/processor chain is not used — enumeration
    reads the catalog, sampling reads the live source, and the writes
    are sample-data PUTs plus JSON Patch calls — so ``prepare`` builds
    only the sampler adapter and the classification engine. The engine
    exists only when the pipeline flag is on and a sampler was built;
    with the flag off the run still samples and stores, tagging
    nothing. Unknown source types fail in ``prepare``; per-entity
    sampling failures are recorded and the run's final state follows
    the fork's rule, so a run that classified nothing never reports
    success.
    """

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
        sample_entity: Callable[[dict[str, Any]], _EntitySample] | None = None,
        engine: ClassificationEngine | None = None,
    ) -> None:
        # Injection seams for tests: a sample function standing in for
        # the live sampler adapter, and a pre-built engine. Production
        # always builds both from the config.
        self._injected_sample_entity = sample_entity
        self._injected_engine = engine
        self._entity_type: str | None = None
        self._sample_entity: Callable[[dict[str, Any]], _EntitySample] | None = None
        self._sampler: Any | None = None
        self._engine: ClassificationEngine | None = None
        self._store_sample_data = False
        self._skipped_entities = 0
        self._patch_warnings = 0
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
            source = self.config.source
            self._entity_type = _ac_entity_type(source.type)
            _validate_service_exists(self._client, self._entity_type, source.service_name)
            self._sample_entity, self._sampler = self._build_sampler(source)
            self._store_sample_data = resolve_store_sample_data(
                pipeline_store=source.store_sample_data,
                settings_reader=getattr(
                    self._client, "get_profiler_config_settings", None
                ),
            )
            if source.enable_auto_classification and self._sample_entity is not None:
                self._engine = self._injected_engine or ClassificationEngine(
                    self._client,
                    language=source.classification_language,
                    confidence=source.confidence,
                )
            elif not source.enable_auto_classification:
                logger.info(
                    "autoClassification disabled by enableAutoClassification=false; "
                    "sampling and storing only, tagging nothing"
                )
            else:
                logger.warning(
                    "no sampler for source type %r; classification disabled, "
                    "entities will fail per-entity",
                    source.type,
                )
            self._prepared = True
        except Exception as exc:
            self._record_failure(self.source_status, "Source", "source", exc)
            raise WorkflowInitializationError(
                f"could not prepare autoClassification workflow: {exc}"
            ) from exc

    def _build_sampler(
        self, source: SourceConfig
    ) -> tuple[Callable[[dict[str, Any]], _EntitySample] | None, Any | None]:
        if self._injected_sample_entity is not None:
            return self._injected_sample_entity, None
        limit = source.sample_data_count
        if self._entity_type == "table":
            built = build_database_sampler(source.type, source.connection or {})
            if built is None:
                return None, None
            sampler, takes_database = built
            return _database_sample_adapter(sampler, takes_database, limit), sampler
        if self._entity_type == "topic":
            sampler = _messaging_sampler(source)
            return _messaging_sample_adapter(sampler, limit), sampler
        from smartmetadata_ingestion.connectors.s3 import S3Sampler

        sampler = S3Sampler(source)
        return _storage_sample_adapter(sampler, limit), sampler

    def _execute_records(self) -> None:
        if self._entity_type is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        if self._engine is not None:
            # Model provisioning is verified here, after the "running"
            # writeback: a missing model fails the run loudly at run
            # start instead of mid-run after partial work, and a run
            # with the flag off never touches the models.
            self._engine.warm_up()
        entities = self._enumerate_entities()
        # Enumeration streams like the usage workflow's source: entities
        # are processed as pages arrive, never materialized, so a large
        # service does not hold every entity dict in memory. The source
        # step's total grows per entity in _process_entity (expect),
        # since no upfront total exists for a stream.
        for entity in entities:
            self._process_entity(entity)

    def _enumerate_entities(self) -> Iterator[dict[str, Any]]:
        source = self.config.source
        kind = self._entity_type
        if kind is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        path, fields = _AC_ENTITY_COLLECTION[kind]
        for entity in self._client.iter_collection(
            path, extra_params={"service": source.service_name, "fields": fields}
        ):
            if self._entity_in_scope(source, entity):
                yield entity

    def _entity_in_scope(
        self, source: SourceConfig, entity: dict[str, Any]
    ) -> bool:
        """The enumeration scope: the classification filter first (an
        entity's existing tags decide it), then the per-level name
        patterns. A malformed FQN cannot be scoped and is skipped
        with a warning — corrupt catalog data must not fail the run
        before any entity is classified."""
        fqn = entity.get("fullyQualifiedName") or ""
        if not table_passes_classification_filter(source, entity):
            return False
        use_fqn = source.use_fqn_for_filtering
        if self._entity_type == "table":
            parts = split_fqn(fqn)
            if len(parts) != 4:
                logger.warning("skipping table with malformed FQN %r", fqn)
                return False
            _, database, schema, table = parts
            if not is_selected(
                database,
                include=source.include_databases,
                exclude=source.exclude_databases,
                fqn=fqn,
                use_fqn=use_fqn,
            ):
                return False
            if not is_selected(
                schema,
                include=source.include_schemas,
                exclude=source.exclude_schemas,
                fqn=fqn,
                use_fqn=use_fqn,
            ):
                return False
            return is_selected_table(
                table,
                entity.get("tableType") or "Regular",
                include_tables=source.include_tables,
                exclude_tables=source.exclude_tables,
                include_views=source.include_views,
                include_tables_enabled=source.include_tables_enabled,
                fqn=fqn,
                use_fqn=use_fqn,
            )
        if self._entity_type == "topic":
            return is_selected(
                entity.get("name") or "",
                include=source.include_topics,
                exclude=source.exclude_topics,
                fqn=fqn,
                use_fqn=use_fqn,
            )
        return is_selected(
            entity.get("name") or "",
            include=source.include_containers,
            exclude=source.exclude_containers,
            fqn=fqn,
            use_fqn=use_fqn,
        )

    def _process_entity(self, entity: dict[str, Any]) -> None:
        kind = self._entity_type
        if kind is None:
            raise WorkflowInitializationError("workflow source is not prepared")
        fqn = entity.get("fullyQualifiedName") or ""
        self.source_status.records += 1
        self.source_status.expect(kind)
        self.source_status.complete(kind)
        self.processor_status.expect(kind)
        if not iter_leaf_columns(entity, kind):
            # An entity with no columns has nothing to classify; the
            # sampler is never consulted for it.
            logger.warning("skipping %s %s: no columns", kind, fqn)
            self._skip_entity(kind)
            return
        sample = self._sample(entity, kind, fqn)
        if sample is None:
            return
        column_tags = self._classify(entity, kind, sample)
        self._write_results(entity, kind, fqn, sample, column_tags)

    def _skip_entity(self, kind: str) -> None:
        """Count a skipped entity: filtered on the processor step, and
        complete — the step finished with it by deciding not to run
        it, which is not a failure."""
        self._skipped_entities += 1
        self.report.skipped += 1
        self.processor_status.filtered += 1
        self.processor_status.complete(kind)

    def _sample(
        self, entity: dict[str, Any], kind: str, fqn: str
    ) -> _EntitySample | None:
        try:
            if self._sample_entity is None:
                raise WorkflowExecutionError(
                    f"no sampler for source type {self.config.source.type!r}"
                )
            sample = self._sample_entity(entity)
        except NotImplementedError:
            # A sampler that declines an entity skips it like a
            # no-columns entity: the gap is the sampler's coverage,
            # not a failure of the run.
            logger.warning(
                "skipping %s %s: sampler does not support it", kind, fqn
            )
            self._skip_entity(kind)
            return None
        except Exception as exc:
            failure = self._record_failure(self.processor_status, fqn, kind, exc)
            self.report.failures.append(failure)
            return None
        self.processor_status.records += 1
        self.processor_status.complete(kind)
        return sample

    def _classify(
        self, entity: dict[str, Any], kind: str, sample: _EntitySample
    ) -> dict[str, list[dict[str, Any]]]:
        """Classify one entity's columns, grouping the labels by
        column FQN for the PATCH. Per-column failures become failed
        step entries — they never abort the remaining columns, and
        the run's final state follows from them honestly."""
        if self._engine is None:
            return {}
        classification = self._engine.classify_entity(entity, kind, sample.rows)
        for failure in classification.failures:
            record = RecordFailure(
                label=failure.column_fqn,
                kind=kind,
                message=failure.message,
                stack_trace=failure.stack_trace,
            )
            self.processor_status.failures.append(record)
            self.report.failures.append(record)
        grouped: dict[str, list[dict[str, Any]]] = {}
        for tag in classification.column_tags:
            grouped.setdefault(tag.column_fqn, []).append(tag.tag_label)
        return grouped

    def _write_results(
        self,
        entity: dict[str, Any],
        kind: str,
        fqn: str,
        sample: _EntitySample,
        column_tags: dict[str, list[dict[str, Any]]],
    ) -> None:
        """The sink step: persist the sample when configured, then
        PATCH the labels. The two writes are independent — a failed
        sample ingest is a failed step entry but never blocks the
        PATCH, and a failed PATCH is a warning, never a failure."""
        self.sink_status.expect(kind)
        failed = False
        if self._store_sample_data:
            try:
                self._store_sample(entity, kind, sample)
            except Exception as exc:
                failure = self._record_failure(self.sink_status, fqn, kind, exc)
                self.report.failures.append(failure)
                failed = True
        if column_tags:
            try:
                patched = patch_column_tags(
                    self._client,
                    entity_type=kind,
                    entity_fqn=fqn,
                    column_tags=column_tags,
                )
            except Exception as exc:
                logger.warning("tag PATCH failed for %s %s: %s", kind, fqn, exc)
                self._patch_warnings += 1
            else:
                if patched is None:
                    self._patch_warnings += 1
        self.sink_status.records += 1
        self.sink_status.complete(kind)
        if not failed:
            self.report.succeeded += 1

    def _store_sample(
        self, entity: dict[str, Any], kind: str, sample: _EntitySample
    ) -> None:
        entity_id = entity.get("id") or ""
        if kind == "topic":
            store_topic_sample_data(
                self._client, entity_id=entity_id, messages=sample.messages or []
            )
            return
        rows = sample.rows or []
        store_tabular_sample_data(
            self._client,
            entity_type=kind,
            entity_id=entity_id,
            field_names=_sample_field_names(rows),
            rows=rows,
        )

    def close_steps(self) -> None:
        # The sampler holds the run's live connection or consumer; it
        # closes once, at run end — never per entity, where closing
        # the shared consumer would break the remaining entities.
        # Taking and clearing the reference makes the close
        # idempotent: execute() and stop() both reach here.
        sampler, self._sampler = self._sampler, None
        try:
            super().close_steps()
        finally:
            close = getattr(sampler, "close", None)
            if callable(close):
                try:
                    close()
                except Exception as exc:
                    self._record_failure(
                        self.processor_status, "Sampler", "sampler", exc
                    )
                    raise WorkflowTeardownError(
                        f"sampler close failed: {exc}"
                    ) from exc

    def _collect_warnings(self) -> None:
        """Fold the run's counted warning events (C-11/B-4 item 6):
        skipped entities on the processor step, tag-PATCH warnings on
        the sink step. Pure count reads, like the usage fold."""
        self.processor_status.warn(self._skipped_entities)
        self.sink_status.warn(self._patch_warnings)

