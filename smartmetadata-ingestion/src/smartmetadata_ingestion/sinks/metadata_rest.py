# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from typing import Any, Protocol

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.topology import SeenSet
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    StorageServiceRecord,
    ContainerRecord,
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


class Sink(Protocol):
    def write(self, record: WorkflowRecord) -> Any: ...

    def flush(self) -> None: ...


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
        elif isinstance(record, DatabaseRecord):
            result = self._client.upsert_database(_database_payload(record))
        elif isinstance(record, SchemaRecord):
            result = self._client.upsert_schema(_schema_payload(record))
        elif isinstance(record, TableRecord):
            result = self._client.upsert_table(_table_payload(record))
        elif isinstance(record, TopicRecord):
            result = self._client.upsert_topic(_topic_payload(record))
        elif isinstance(record, ChartRecord):
            result = self._client.upsert_chart(_chart_payload(record))
        elif isinstance(record, DashboardRecord):
            result = self._client.upsert_dashboard(_dashboard_payload(record))
        elif isinstance(record, ContainerRecord):
            result = self._client.upsert_container(_container_payload(record))
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
    """Buffer create/update payloads and flush via Apache /bulk endpoints."""

    def __init__(self, client: RestClient, *, batch_size: int = 50) -> None:
        self._inner = MetadataRestSink(client)
        self._client = client
        self._batch_size = batch_size
        self.written: list[str] = self._inner.written
        self.seen = SeenSet()
        self._buffers: dict[str, list[dict]] = {
            "database": [],
            "schema": [],
            "table": [],
            "topic": [],
            "chart": [],
            "dashboard": [],
            "container": [],
        }

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
        # Flush buffered parents before services/lineage so wire order stays parent-first.
        self.flush()
        return self._inner.write(record)

    def flush(self) -> None:
        for kind in ("database", "schema", "table", "topic", "chart", "dashboard", "container"):
            self._flush_kind(kind, force=True)

    def _flush_kind(self, kind: str, *, force: bool) -> Any:
        buf = self._buffers[kind]
        if not buf:
            return None
        if not force and len(buf) < self._batch_size:
            return None
        payloads = list(buf)
        buf.clear()
        if kind == "database":
            return self._client.bulk_upsert_databases(payloads)
        if kind == "schema":
            return self._client.bulk_upsert_schemas(payloads)
        if kind == "table":
            return self._client.bulk_upsert_tables(payloads)
        if kind == "topic":
            return self._client.bulk_upsert_topics(payloads)
        if kind == "chart":
            return self._client.bulk_upsert_charts(payloads)
        if kind == "dashboard":
            return self._client.bulk_upsert_dashboards(payloads)
        if kind == "container":
            return self._client.bulk_upsert_containers(payloads)
        return None





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
        return client.post_entity_profile_by_name(record.entity_type, record.fqn, payload)
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


def _table_payload(record: TableRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "databaseSchema": record.database_schema,
        "tableType": record.table_type,
        "columns": [
            {
                "name": column.name,
                "dataType": column.data_type,
                **(
                    {"dataTypeDisplay": column.data_type_display}
                    if column.data_type_display
                    else {}
                ),
                **({"description": column.description} if column.description else {}),
                **(
                    {"ordinalPosition": column.ordinal_position}
                    if column.ordinal_position is not None
                    else {}
                ),
                **({"dataLength": column.data_length} if column.data_length is not None else {}),
            }
            for column in record.columns
        ],
    }
    if record.description:
        payload["description"] = record.description
    return payload
