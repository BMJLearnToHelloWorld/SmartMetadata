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
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.topology import SeenSet
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    StorageServiceRecord,
    ContainerRecord,
    PipelineServiceRecord,
    PipelineRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    MessagingServiceRecord,
    SchemaRecord,
    ColumnRecord,
    TablePartitionRecord,
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

logger = logging.getLogger(__name__)


def _payload_label(kind: str, payload: dict[str, Any]) -> str:
    """The record label a bulk payload stands for (``kind:fqn``).

    Bulk payloads carry the bare name plus the parent FQN, which is
    exactly how the record's own ``label()`` reads.
    """
    parent = (
        payload.get("databaseSchema")
        or payload.get("database")
        or payload.get("service")
        or payload.get("fullyQualifiedName")
        or ""
    )
    name = payload.get("name") or ""
    fqn = f"{parent}.{name}" if parent and name else (name or kind)
    return f"{kind}:{fqn}"


@dataclass
class FlushFailure:
    """One record whose flush did not persist it."""

    kind: str
    payload: dict[str, Any]
    error: str
    stack_trace: str | None = None
    label: str = ""

    def __post_init__(self) -> None:
        if not self.label:
            self.label = _payload_label(self.kind, self.payload)


@dataclass
class FlushResult:
    """The outcome of one or more flushes, drained by the caller.

    ``succeeded`` counts truly-flushed records per kind (official
    ``_flush_buffer``: only ``result.successRequest`` counts);
    ``failed`` carries one entry per record that did not persist, so the
    caller can record each as its own failure instead of one batch error.
    """

    succeeded: dict[str, int] = field(default_factory=dict)
    failed: list[FlushFailure] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.succeeded or self.failed)


class Sink(Protocol):
    def write(self, record: WorkflowRecord) -> Any: ...

    def flush(self) -> Any: ...


class MetadataRestSink:
    def __init__(self, client: RestClient):
        self._client = client
        self.written: list[str] = []

    def write(self, record: WorkflowRecord) -> Any:
        if isinstance(record, DatabaseServiceRecord):
            result = self._client.upsert_database_service(_service_payload(record))
        elif isinstance(record, MessagingServiceRecord):
            result = self._client.upsert_messaging_service(_messaging_service_payload(record))
        elif isinstance(record, DashboardServiceRecord):
            result = self._client.upsert_dashboard_service(_dashboard_service_payload(record))
        elif isinstance(record, StorageServiceRecord):
            result = self._client.upsert_storage_service(_storage_service_payload(record))
        elif isinstance(record, PipelineServiceRecord):
            result = self._client.upsert_pipeline_service(_pipeline_service_payload(record))
        elif isinstance(record, DatabaseRecord):
            result = self._client.upsert_database(_database_payload(record))
        elif isinstance(record, SchemaRecord):
            result = self._client.upsert_schema(_schema_payload(record))
        elif isinstance(record, TableRecord):
            result = self._client.upsert_table(_table_payload(record))
        elif isinstance(record, TopicRecord):
            result = self._client.upsert_topic(_topic_payload(record))
            _write_topic_sample_data(self._client, record, result)
        elif isinstance(record, ChartRecord):
            result = self._client.upsert_chart(_chart_payload(record))
        elif isinstance(record, DashboardRecord):
            result = self._client.upsert_dashboard(_dashboard_payload(record))
        elif isinstance(record, ContainerRecord):
            result = self._client.upsert_container(_container_payload(record))
        elif isinstance(record, PipelineRecord):
            result = self._client.upsert_pipeline(_pipeline_payload(record))
        elif isinstance(record, LineageRecord):
            result = self._client.put_lineage(
                record.from_entity.type,
                record.from_entity.fqn,
                record.to_entity.type,
                record.to_entity.fqn,
                _lineage_details(record),
            )
        elif isinstance(record, UsageRecord):
            result = self._client.put_usage_by_name(
                record.entity_type,
                record.fqn,
                date=record.date,
                count=record.count,
            )
        elif isinstance(record, ProfileRecord):
            result = _write_profile(self._client, record)
        elif isinstance(record, TestCaseResultRecord):
            result = self._client.post_test_case_result(
                record.test_case_fqn,
                _test_case_result_payload(record),
            )
        elif isinstance(record, ClassificationRecord):
            result = self._client.upsert_classification(
                _classification_payload(record)
            )
        elif isinstance(record, TagRecord):
            result = self._client.upsert_tag(_tag_payload(record))
        elif isinstance(record, AppRecord):
            result = self._client.upsert_app(_app_payload(record))
        else:
            raise WorkflowError(f"sink cannot write {type(record).__name__}")
        self.written.append(record.label())
        return result

    def flush(self) -> None:
        return None


def build_sink(config: WorkflowConfig, client: RestClient, sink: Sink | None = None) -> Sink:
    if sink is not None:
        return sink
    if config.sink.type != "metadata-rest":
        raise WorkflowError(f"unsupported sink type {config.sink.type}")
    if config.sink.use_bulk:
        return BulkMetadataRestSink(client, batch_size=config.sink.bulk_batch_size)
    return MetadataRestSink(client)


class BulkMetadataRestSink:
    """Buffer create/update payloads and flush via Apache /bulk endpoints.

    A buffered record is NOT yet persisted when ``write()`` returns:
    flush outcomes accumulate in :attr:`_flush_result` and the caller
    drains them with :meth:`take_flush_result` (after each write, and
    from :meth:`flush` at close). Only records a flush reports in
    ``successRequest`` count as succeeded; each failed payload becomes
    one :class:`FlushFailure` (official ``_flush_buffer``).
    """

    def __init__(self, client: RestClient, *, batch_size: int = 50) -> None:
        self._inner = MetadataRestSink(client)
        self._client = client
        self._batch_size = batch_size
        self.written: list[str] = self._inner.written
        self.seen = SeenSet()
        self._flush_result = FlushResult()
        self._buffers: dict[str, list[dict]] = {
            "database": [],
            "schema": [],
            "table": [],
            "topic": [],
            "chart": [],
            "dashboard": [],
            "container": [],
            "pipeline": [],
        }

    def buffers(self, record: WorkflowRecord) -> bool:
        """Whether ``write()`` only buffers this record (not yet persisted).

        Mirrors ``write()`` exactly: the eight buffered kinds, with a
        sampled topic taking the immediate path (its sample PUT needs the
        topic id from the single-write upsert).
        """
        if isinstance(record, TopicRecord):
            return not (record.sample_data and record.sample_data.messages)
        return isinstance(
            record,
            (
                DatabaseRecord,
                SchemaRecord,
                TableRecord,
                ChartRecord,
                DashboardRecord,
                ContainerRecord,
                PipelineRecord,
            ),
        )

    def take_flush_result(self) -> FlushResult | None:
        """Return and clear the accumulated flush outcomes, if any."""
        if not self._flush_result:
            return None
        result, self._flush_result = self._flush_result, FlushResult()
        return result

    def write(self, record: WorkflowRecord) -> Any:
        self.seen.add(record)
        if isinstance(record, DatabaseRecord):
            self._buffers["database"].append(_database_payload(record))
            self.written.append(record.label())
            return self._flush_kind("database", force=False)
        if isinstance(record, SchemaRecord):
            self._buffers["schema"].append(_schema_payload(record))
            self.written.append(record.label())
            return self._flush_kind("schema", force=False)
        if isinstance(record, TableRecord):
            self._buffers["table"].append(_table_payload(record))
            self.written.append(record.label())
            return self._flush_kind("table", force=False)
        if isinstance(record, TopicRecord):
            if record.sample_data and record.sample_data.messages:
                # The sample PUT needs the topic id from the upsert
                # response, which the bulk path does not return per topic:
                # flush, then single-write (upsert + sample PUT).
                self._flush_all()
                return self._inner.write(record)
            self._buffers["topic"].append(_topic_payload(record))
            self.written.append(record.label())
            return self._flush_kind("topic", force=False)
        if isinstance(record, ChartRecord):
            self._buffers["chart"].append(_chart_payload(record))
            self.written.append(record.label())
            return self._flush_kind("chart", force=False)
        if isinstance(record, DashboardRecord):
            self._buffers["dashboard"].append(_dashboard_payload(record))
            self.written.append(record.label())
            return self._flush_kind("dashboard", force=False)
        if isinstance(record, ContainerRecord):
            self._buffers["container"].append(_container_payload(record))
            self.written.append(record.label())
            return self._flush_kind("container", force=False)
        if isinstance(record, PipelineRecord):
            self._buffers["pipeline"].append(_pipeline_payload(record))
            self.written.append(record.label())
            return self._flush_kind("pipeline", force=False)
        # Flush buffered parents before services/lineage so wire order stays parent-first.
        self._flush_all()
        return self._inner.write(record)

    def flush(self) -> FlushResult | None:
        """Flush every buffer and return the drained outcome, if any."""
        self._flush_all()
        return self.take_flush_result()

    def _flush_all(self) -> None:
        for kind in ("database", "schema", "table", "topic", "chart", "dashboard", "container", "pipeline"):
            self._flush_kind(kind, force=True)

    # Official topology flushes parents at stage end before children.
    # A per-kind batch_size trip must do the same, or tables can go out
    # while database/schema payloads are still sitting in their buffers.
    _KIND_PARENTS: dict[str, tuple[str, ...]] = {
        "schema": ("database",),
        "table": ("database", "schema"),
    }

    def _flush_kind(self, kind: str, *, force: bool) -> None:
        buf = self._buffers[kind]
        if not buf:
            return None
        if not force and len(buf) < self._batch_size:
            return None
        for parent in self._KIND_PARENTS.get(kind, ()):
            self._flush_kind(parent, force=True)
        payloads = list(buf)
        buf.clear()
        try:
            if kind == "database":
                result = self._client.bulk_upsert_databases(payloads)
            elif kind == "schema":
                result = self._client.bulk_upsert_schemas(payloads)
            elif kind == "table":
                result = self._client.bulk_upsert_tables(payloads)
            elif kind == "topic":
                result = self._client.bulk_upsert_topics(payloads)
            elif kind == "chart":
                result = self._client.bulk_upsert_charts(payloads)
            elif kind == "dashboard":
                result = self._client.bulk_upsert_dashboards(payloads)
            elif kind == "container":
                result = self._client.bulk_upsert_containers(payloads)
            elif kind == "pipeline":
                result = self._client.bulk_upsert_pipelines(payloads)
            else:
                return None
        except (RestError, httpx.HTTPError) as exc:
            # The whole batch was refused (the live 400): every payload
            # in it failed, each as its own failure — not one batch error.
            for payload in payloads:
                self._record_flush_failure(
                    kind, payload, str(exc), traceback.format_exc()
                )
            return None
        self._record_flush_response(kind, payloads, result)

    def _record_flush_response(
        self, kind: str, payloads: list[dict], result: Any
    ) -> None:
        """Count a bulk response (BulkOperationResult) per record.

        ``successRequest`` entries are the records that landed;
        ``failedRequest`` entries carry the original ``request`` plus a
        ``message``. A response without either list is a failure for
        every payload: nothing was observably landed, so nothing counts
        as succeeded (fail closed — an unobservable flush must not
        count as a success).
        """
        if isinstance(result, dict) and (
            "successRequest" in result or "failedRequest" in result
        ):
            succeeded = result.get("successRequest") or []
            failed = result.get("failedRequest") or []
            if succeeded:
                current = self._flush_result.succeeded.get(kind, 0)
                self._flush_result.succeeded[kind] = current + len(succeeded)
            for entry in failed:
                if isinstance(entry, dict):
                    request = entry.get("request")
                    payload = request if isinstance(request, dict) else entry
                    error = entry.get("message") or str(entry)
                else:
                    payload, error = {}, str(entry)
                self._record_flush_failure(kind, payload, error)
            return
        # No result lists at all (e.g. an empty-body 200, which
        # RestClient.request() returns as None): fail closed, one
        # failure per payload and zero succeeded.
        for payload in payloads:
            self._record_flush_failure(
                kind, payload, f"unexpected bulk response: {result!r}"
            )

    def _record_flush_failure(
        self,
        kind: str,
        payload: dict,
        error: str,
        stack_trace: str | None = None,
    ) -> None:
        self._flush_result.failed.append(
            FlushFailure(
                kind=kind,
                payload=dict(payload),
                error=error,
                stack_trace=stack_trace,
            )
        )





def _classification_payload(record: ClassificationRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "description": record.description,
    }
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.provider is not None:
        payload["provider"] = record.provider
    if record.mutually_exclusive is not None:
        payload["mutuallyExclusive"] = record.mutually_exclusive
    return payload


def _tag_payload(record: TagRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "description": record.description,
    }
    if record.classification is not None:
        payload["classification"] = record.classification
    if record.parent is not None:
        payload["parent"] = record.parent
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.provider is not None:
        payload["provider"] = record.provider
    if record.mutually_exclusive is not None:
        payload["mutuallyExclusive"] = record.mutually_exclusive
    return payload


def _app_payload(record: AppRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name}
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.description is not None:
        payload["description"] = record.description
    if record.bot is not None:
        payload["bot"] = record.bot
    if record.app_configuration is not None:
        payload["appConfiguration"] = record.app_configuration
    if record.app_schedule is not None:
        payload["appSchedule"] = record.app_schedule
    if record.supports_interrupt is not None:
        payload["supportsInterrupt"] = record.supports_interrupt
    if record.allow_bot_impersonation is not None:
        payload["allowBotImpersonation"] = record.allow_bot_impersonation
    return payload


def _write_topic_sample_data(
    client: RestClient, record: TopicRecord, upsert_result: Any
) -> None:
    """PUT sampled messages after the topic upsert (official write_topic_sample_data).

    Only when messages is non-empty; a missing topic id (an upsert response
    without one) cannot address the endpoint, so the write is skipped with
    a warning. A failed PUT propagates: the record is counted failed and
    the run continues (the product's equivalent of official's per-record
    StackTraceError) — a failed sample write is never silently dropped.
    ADR:2026-11-08-sampler-messaging-config-surface
    """
    if not record.sample_data or not record.sample_data.messages:
        return None
    topic_id = upsert_result.get("id") if isinstance(upsert_result, dict) else None
    if not topic_id:
        logger.warning(
            "cannot write sample data for topic %s: upsert returned no id",
            record.name,
        )
        return None
    client.ingest_topic_sample_data(
        str(topic_id), {"messages": list(record.sample_data.messages)}
    )


def _write_profile(client: RestClient, record: ProfileRecord) -> Any:
    if record.fqn:
        payload: dict[str, Any] = {
            "entityType": record.entity_type,
        }
        if record.profile_data is not None:
            payload["profileData"] = record.profile_data
        elif record.table_profile is not None:
            payload["profileData"] = record.table_profile
        else:
            raise WorkflowError("profile record requires profileData or tableProfile")
        if record.profile_type:
            payload["profileType"] = record.profile_type
        if record.timestamp is not None:
            payload["timestamp"] = record.timestamp
        result = client.post_entity_profile_by_name(record.entity_type, record.fqn, payload)
        # The fqn path used to post only the table profile and silently drop
        # record.column_profile. Each column profile is its own
        # CreateEntityProfile (profileType "column") on the same table FQN;
        # the server stores it against the column FQN resolved from
        # profileData.name (ADR:2026-11-08-profiler-fqn-path-posts-column-profiles).
        # A failed column post raises like a failed table post: it must
        # surface, never be swallowed.
        for column in record.column_profile:
            column_payload: dict[str, Any] = {
                "entityType": record.entity_type,
                "profileType": "column",
                "profileData": column,
            }
            if record.timestamp is not None:
                column_payload["timestamp"] = record.timestamp
            client.post_entity_profile_by_name(record.entity_type, record.fqn, column_payload)
        # The fqn path also used to drop record.system_profile. Each system
        # profile is its own CreateEntityProfile (profileType "system") on
        # the same table FQN; the server stores it keyed by timestamp +
        # operation inside profileData (ADR:2026-11-08-profiler-fqn-path-posts-column-profiles).
        # A failed system post raises like a failed table post: it must
        # surface, never be swallowed.
        for system in record.system_profile:
            system_payload: dict[str, Any] = {
                "entityType": record.entity_type,
                "profileType": "system",
                "profileData": system,
            }
            if record.timestamp is not None:
                system_payload["timestamp"] = record.timestamp
            client.post_entity_profile_by_name(record.entity_type, record.fqn, system_payload)
        return result
    if record.table_id:
        if record.table_profile is None:
            raise WorkflowError("legacy table profile requires tableProfile + tableId")
        payload = {"tableProfile": record.table_profile}
        if record.column_profile:
            payload["columnProfile"] = list(record.column_profile)
        if record.system_profile:
            payload["systemProfile"] = list(record.system_profile)
        return client.put_table_profile(record.table_id, payload)
    raise WorkflowError("profile record requires fqn or tableId")


def _test_case_result_payload(record: TestCaseResultRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "timestamp": record.timestamp,
        "testCaseStatus": record.test_case_status,
        "testResultValue": list(record.test_result_value),
    }
    if record.result is not None:
        payload["result"] = record.result
    if record.sample_data is not None:
        payload["sampleData"] = record.sample_data
    if record.passed_rows is not None:
        payload["passedRows"] = record.passed_rows
    if record.failed_rows is not None:
        payload["failedRows"] = record.failed_rows
    if record.passed_rows_percentage is not None:
        payload["passedRowsPercentage"] = record.passed_rows_percentage
    if record.failed_rows_percentage is not None:
        payload["failedRowsPercentage"] = record.failed_rows_percentage
    if record.duration is not None:
        payload["duration"] = record.duration
    return payload


def _lineage_details(record: LineageRecord) -> dict[str, Any]:
    details: dict[str, Any] = {"source": record.source}
    if record.sql_query:
        details["sqlQuery"] = record.sql_query
    if record.description:
        details["description"] = record.description
    if record.columns_lineage:
        details["columnsLineage"] = [
            {
                "fromColumns": list(col.from_columns),
                "toColumn": col.to_column,
                **({"function": col.function} if col.function else {}),
            }
            for col in record.columns_lineage
        ]
    if record.pipeline is not None:
        ref: dict[str, Any] = {"type": record.pipeline.type}
        if record.pipeline.fully_qualified_name:
            ref["fullyQualifiedName"] = record.pipeline.fully_qualified_name
        if record.pipeline.id:
            ref["id"] = record.pipeline.id
        if record.pipeline.name:
            ref["name"] = record.pipeline.name
        details["pipeline"] = ref
    return details




def _dashboard_service_payload(record: DashboardServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _chart_payload(record: ChartRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.chart_type:
        payload["chartType"] = record.chart_type
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    return payload


def _dashboard_payload(record: DashboardRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.project:
        payload["project"] = record.project
    if record.charts:
        payload["charts"] = list(record.charts)
    return payload

def _service_payload(record: DatabaseServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _messaging_service_payload(record: MessagingServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _topic_payload(record: TopicRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "service": record.service,
        "partitions": max(int(record.partitions), 1),
    }
    if record.description:
        payload["description"] = record.description
    if record.message_schema:
        payload["messageSchema"] = record.message_schema
    if record.cleanup_policies:
        payload["cleanupPolicies"] = record.cleanup_policies
    if record.replication_factor is not None:
        payload["replicationFactor"] = record.replication_factor
    if record.retention_time is not None:
        payload["retentionTime"] = record.retention_time
    if record.maximum_message_size is not None:
        payload["maximumMessageSize"] = record.maximum_message_size
    if record.topic_config:
        payload["topicConfig"] = record.topic_config
    return payload


def _database_payload(record: DatabaseRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.description:
        payload["description"] = record.description
    return payload


def _schema_payload(record: SchemaRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "database": record.database}
    if record.description:
        payload["description"] = record.description
    return payload


def _column_payload(column: ColumnRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": column.name,
        "dataType": column.data_type,
    }
    if column.data_type_display:
        payload["dataTypeDisplay"] = column.data_type_display
    if column.description:
        payload["description"] = column.description
    if column.ordinal_position is not None:
        payload["ordinalPosition"] = column.ordinal_position
    if column.data_length is not None:
        payload["dataLength"] = column.data_length
    if column.array_data_type:
        payload["arrayDataType"] = column.array_data_type
    if column.children:
        payload["children"] = [_column_payload(child) for child in column.children]
    if column.precision is not None:
        payload["precision"] = column.precision
    if column.scale is not None:
        payload["scale"] = column.scale
    return payload


def _table_partition_payload(record: TablePartitionRecord) -> dict[str, Any]:
    columns = []
    for column in record.columns:
        item: dict[str, Any] = {
            "columnName": column.column_name,
            "intervalType": column.interval_type,
        }
        if column.interval is not None:
            item["interval"] = column.interval
        columns.append(item)
    return {"columns": columns}


def _table_payload(record: TableRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "databaseSchema": record.database_schema,
        "tableType": record.table_type,
        "columns": [_column_payload(column) for column in record.columns],
    }
    if record.description:
        payload["description"] = record.description
    if record.table_partition is not None:
        payload["tablePartition"] = _table_partition_payload(record.table_partition)
    return payload

def _storage_service_payload(record: StorageServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _container_payload(record: ContainerRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.parent_fqn:
        payload["parent"] = record.parent_fqn
    if record.prefix:
        payload["prefix"] = record.prefix
    if record.number_of_objects is not None:
        payload["numberOfObjects"] = record.number_of_objects
    if record.size is not None:
        payload["size"] = record.size
    if record.file_formats:
        payload["fileFormats"] = record.file_formats
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.full_path:
        payload["fullPath"] = record.full_path
    if record.data_model:
        payload["dataModel"] = record.data_model
    return payload


def _pipeline_service_payload(record: PipelineServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _pipeline_payload(record: PipelineRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.concurrency is not None:
        payload["concurrency"] = record.concurrency
    if record.pipeline_location:
        payload["pipelineLocation"] = record.pipeline_location
    if record.schedule_interval:
        payload["scheduleInterval"] = record.schedule_interval
    if record.tasks:
        payload["tasks"] = record.tasks
    if record.state:
        payload["state"] = record.state
    return payload

