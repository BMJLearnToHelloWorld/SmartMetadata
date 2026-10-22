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
from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    MessagingServiceRecord,
    SchemaRecord,
    TableRecord,
    TopicRecord,
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
        elif isinstance(record, DatabaseRecord):
            result = self._client.upsert_database(_database_payload(record))
        elif isinstance(record, SchemaRecord):
            result = self._client.upsert_schema(_schema_payload(record))
        elif isinstance(record, TableRecord):
            result = self._client.upsert_table(_table_payload(record))
        elif isinstance(record, TopicRecord):
            result = self._client.upsert_topic(_topic_payload(record))
        elif isinstance(record, LineageRecord):
            details: dict[str, Any] = {"source": record.source}
            if record.sql_query:
                details["sqlQuery"] = record.sql_query
            if record.description:
                details["description"] = record.description
            result = self._client.put_lineage(
                record.from_entity.type,
                record.from_entity.fqn,
                record.to_entity.type,
                record.to_entity.fqn,
                details,
            )
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
    return MetadataRestSink(client)


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
