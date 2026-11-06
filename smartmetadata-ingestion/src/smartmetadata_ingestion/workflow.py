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
from typing import Any

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AppSpec,
    ClassificationSpec,
    DataDiffSideSpec,
    DataDiffSpec,
    LineageSpec,
    ProfileSpec,
    TagSpec,
    TestCaseResultSpec,
    UsageSpec,
    WorkflowConfig,
)
from smartmetadata_ingestion.connectors.base import Source, build_source
from smartmetadata_ingestion.errors import (
    WorkflowError,
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
from smartmetadata_ingestion.datadiff import (
    DataDiffBinding,
    SqlKeyFetcher,
    build_side,
    compare_key_sets,
    datadiff_binding,
)
from smartmetadata_ingestion.profiler import ProfilerBinding, profiler_binding
from smartmetadata_ingestion.records import (
    ColumnLineage,
    DatabaseRecord,
    EntityRef,
    LineageEndpoint,
    LineageRecord,
    UsageRecord,
    ProfileRecord,
    SchemaRecord,
    TableRecord,
    TestCaseResultRecord,
    ClassificationRecord,
    TagRecord,
    AppRecord,
    WorkflowRecord,
)
from smartmetadata_ingestion.reconcile import reconcile_stale
from smartmetadata_ingestion.sinks.metadata_rest import Sink, build_sink
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
        try:
            self._reconcile_if_configured()
        except Exception as exc:
            logger.warning("stale reconcile failed: %s", exc)
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


    def _reconcile_if_configured(self) -> None:
        if not self.config.workflow.reconcile_stale:
            return
        scope_fqn = self.config.source.service_name
        source_type = self.config.source.type
        if source_type in {"kafka", "redpanda"}:
            scope_entity_type = "messagingService"
        elif source_type in {"superset", "metabase"}:
            scope_entity_type = "dashboardService"
        elif source_type in {"s3"}:
            scope_entity_type = "storageService"
        elif source_type in {"prefect", "dagster"}:
            scope_entity_type = "pipelineService"
        else:
            scope_entity_type = "databaseService"
        seen = getattr(self._sink, "seen", None)
        if isinstance(seen, SeenSet):
            for kind, fqns in seen.by_kind.items():
                for fqn in fqns:
                    self.seen.by_kind.setdefault(kind, set()).add(fqn)
        reconcile_stale(
            self._client,
            scope_fqn=scope_fqn,
            scope_entity_type=scope_entity_type,
            seen=self.seen,
            dry_run=self.config.workflow.reconcile_dry_run,
        )

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
        for record in order_records(produced):
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


class ProfilerWorkflow(MetadataWorkflow):
    """Runs the connector's profiler interface live against the source database.

    Table enumeration reuses the metadata source's ``produce()``; only
    ``TableRecord`` entries are profiled, nothing is re-ingested as metadata.
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
    ) -> None:
        self._injected_reader = profile_reader
        super().__init__(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
        )

    def prepare(self) -> None:
        if self._prepared:
            return
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
        for database, schema, table in tables:
            profile = self._profiler.profile(
                service=self.config.source.service_name,
                database=database,
                schema=schema,
                table=table,
                timestamp=timestamp,
            )
            self._handle_record(profile)


class TestSuiteWorkflow(MetadataWorkflow):
    """Runs the configured test cases live against the source database."""

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
    ) -> None:
        self._injected_execute = execute
        super().__init__(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
        )

    def prepare(self) -> None:
        if self._prepared:
            return
        super().prepare()
        self._quality_binding = _require_binding(self.config, "TestSuite")
        execute = self._injected_execute or self._execute_scalar
        self._quality = self._quality_binding.quality(execute)

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
        for spec in self.config.test_cases:
            result = self._quality.run_test_case(
                test_case_fqn=spec.test_case_fqn,
                timestamp=timestamp,
                expression=spec.expression,
                expected=spec.expected,
            )
            self._handle_record(result)


class DataDiffWorkflow(MetadataWorkflow):
    """Runs configured key-set data diffs live against the source databases.

    Tables come from ``config.data_diffs`` (never from the metadata source's
    ``produce()``); each spec compares two table sides and writes one
    :class:`TestCaseResultRecord` — the official tableDiff write-back shape.
    Key-set comparison only: added / removed rows. Changed-row, schema-diff
    and sampling comparisons are a later phase.
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
    ) -> None:
        self._injected_fetch_keys = fetch_keys
        super().__init__(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
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
        left_side = build_side(
            left_binding,
            self._side_connection(spec.left),
            database=spec.left.database,
            schema=spec.left.schema,
            table=spec.left.table,
            key_columns=spec.left.key_columns,
        )
        right_side = build_side(
            right_binding,
            self._side_connection(spec.right),
            database=spec.right.database,
            schema=spec.right.schema,
            table=spec.right.table,
            key_columns=spec.right.key_columns,
        )
        left_keys = self._fetch_keys_for(spec, spec.left, left_binding, left_side)
        duplicate_side = spec.left if _has_duplicate_keys(left_keys) else None
        if duplicate_side is None:
            right_keys = self._fetch_keys_for(spec, spec.right, right_binding, right_side)
            duplicate_side = spec.right if _has_duplicate_keys(right_keys) else None
        if duplicate_side is not None:
            return self._aborted_result(spec, duplicate_side, timestamp)
        diff = compare_key_sets(left_keys, right_keys)
        total = diff.total
        passed = (spec.threshold or total) == 0 or total < spec.threshold
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Success" if passed else "Failed",
            test_result_value=[
                {"name": "removedRows", "value": str(diff.extra_left)},
                {"name": "addedRows", "value": str(diff.extra_right)},
                {"name": "diffCount", "value": str(total)},
            ],
            result=(
                f"Found {total} different keys (key-set comparison only: "
                f"{diff.extra_left} only in left table, {diff.extra_right} only in "
                f"right table; row-value and schema differences are not compared)"
            ),
            passed_rows=diff.common,
            failed_rows=total,
        )

    def _side_connection(self, side_spec: DataDiffSideSpec) -> dict[str, Any]:
        if side_spec.connection:
            return side_spec.connection
        return self.config.source.connection or {}

    def _fetch_keys_for(
        self,
        spec: DataDiffSpec,
        side_spec: DataDiffSideSpec,
        binding: DataDiffBinding,
        side: dict[str, Any],
    ) -> list[tuple[Any, ...]]:
        if self._injected_fetch_keys is not None:
            return [tuple(row) for row in self._injected_fetch_keys(side)]
        fetcher = SqlKeyFetcher(
            binding.connect(self._side_connection(side_spec)),
            quote=binding.quote,
            ident_style=binding.ident_style,
        )
        return fetcher.fetch_keys(
            side_spec.database,
            side_spec.schema,
            side_spec.table,
            side_spec.key_columns,
            where_clause=spec.where_clause,
        )

    @staticmethod
    def _aborted_result(
        spec: DataDiffSpec, side_spec: DataDiffSideSpec, timestamp: int
    ) -> TestCaseResultRecord:
        key_columns = side_spec.key_columns
        if len(key_columns) == 1:
            subject = f"Key column '{key_columns[0]}' is"
        else:
            subject = f"Key columns ({', '.join(repr(column) for column in key_columns)}) are"
        location = f"in {side_spec.database}.{side_spec.schema}.{side_spec.table}"
        return TestCaseResultRecord(
            test_case_fqn=spec.test_case_fqn,
            timestamp=timestamp,
            test_case_status="Aborted",
            result=(
                f"{subject} not unique {location}. A row-level diff needs a unique key: "
                "pick a unique column, or add more columns to the key."
            ),
        )


def _has_duplicate_keys(keys: list[tuple[Any, ...]]) -> bool:
    return len(keys) != len(set(keys))


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

