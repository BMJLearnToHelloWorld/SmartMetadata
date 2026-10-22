# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Kafka / Confluent-compatible connector.

Discovery prefers the documented Confluent REST Proxy + Schema Registry HTTP
APIs so unit tests can inject httpx transports. An optional kafka-python extra
reads topic metadata from bootstrap servers when no REST proxy is configured.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import MessagingServiceRecord, TopicRecord, WorkflowRecord

_INTERNAL_TOPICS = frozenset({"__consumer_offsets", "__transaction_state", "_schemas"})
_SCHEMA_TYPE = {
    "AVRO": "Avro",
    "PROTOBUF": "Protobuf",
    "JSON": "JSON",
    "JSONSCHEMA": "JSON",
}


@dataclass(frozen=True, slots=True)
class TopicRow:
    name: str
    partitions: int = 1
    cleanup_policies: list[str] = field(default_factory=list)
    replication_factor: int | None = None
    retention_time: float | None = None
    maximum_message_size: int | None = None
    topic_config: dict[str, Any] = field(default_factory=dict)
    message_schema: dict[str, Any] | None = None


class TopicReader(Protocol):
    def list_topics(self) -> Sequence[TopicRow]: ...


class SequenceTopicReader:
    def __init__(self, topics: Sequence[TopicRow] = ()) -> None:
        self._topics = list(topics)

    def list_topics(self) -> Sequence[TopicRow]:
        return self._topics


class ConfluentHttpTopicReader:
    """Reads topics from Confluent REST Proxy v2 and optional Schema Registry."""

    def __init__(
        self,
        *,
        rest_proxy_url: str,
        schema_registry_url: str | None = None,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
        auth: tuple[str, str] | None = None,
        schema_registry_auth: tuple[str, str] | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        if not rest_proxy_url.strip():
            raise WorkflowError("kafka restProxyUrl is required for HTTP discovery")
        self._rest_proxy_url = rest_proxy_url.rstrip("/")
        self._schema_registry_url = schema_registry_url.rstrip("/") if schema_registry_url else None
        self._auth = auth
        self._schema_registry_auth = schema_registry_auth
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout_seconds, transport=transport)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def list_topics(self) -> Sequence[TopicRow]:
        names = self._list_topic_names()
        rows: list[TopicRow] = []
        for name in names:
            detail = self._topic_detail(name)
            rows.append(
                TopicRow(
                    name=name,
                    partitions=detail["partitions"],
                    cleanup_policies=detail["cleanup_policies"],
                    replication_factor=detail["replication_factor"],
                    retention_time=detail["retention_time"],
                    maximum_message_size=detail["maximum_message_size"],
                    topic_config=detail["topic_config"],
                    message_schema=self._message_schema(name),
                )
            )
        return rows

    def _list_topic_names(self) -> list[str]:
        payload = self._get(self._rest_proxy_url + "/topics", auth=self._auth)
        if isinstance(payload, list):
            return [str(name) for name in payload]
        if isinstance(payload, dict):
            data = payload.get("data") or payload.get("topics") or []
            names: list[str] = []
            for item in data:
                if isinstance(item, str):
                    names.append(item)
                elif isinstance(item, dict) and item.get("topic_name"):
                    names.append(str(item["topic_name"]))
                elif isinstance(item, dict) and item.get("name"):
                    names.append(str(item["name"]))
            return names
        raise WorkflowError("kafka REST proxy /topics did not return a list")

    def _topic_detail(self, name: str) -> dict[str, Any]:
        payload = self._get(
            f"{self._rest_proxy_url}/topics/{quote(name, safe='')}", auth=self._auth
        )
        if not isinstance(payload, dict):
            return {
                "partitions": 1,
                "cleanup_policies": [],
                "replication_factor": None,
                "retention_time": None,
                "maximum_message_size": None,
                "topic_config": {},
            }
        partitions = payload.get("partitions") or payload.get("partitions_count") or 1
        if isinstance(partitions, list):
            partition_count = max(len(partitions), 1)
            first = partitions[0] if partitions and isinstance(partitions[0], dict) else {}
            replicas = first.get("replicas")
            replication = len(replicas) if isinstance(replicas, list) else None
        else:
            partition_count = max(int(partitions), 1)
            replication = _as_int(
                payload.get("replication_factor") or payload.get("replicationFactor")
            )
        configs = payload.get("configs") or payload.get("config") or {}
        if not isinstance(configs, dict):
            configs = {}
        cleanup = str(configs.get("cleanup.policy") or "")
        policies = [
            part.strip() for part in cleanup.split(",") if part.strip() in {"delete", "compact"}
        ]
        return {
            "partitions": partition_count,
            "cleanup_policies": policies,
            "replication_factor": replication,
            "retention_time": _as_float(configs.get("retention.ms")),
            "maximum_message_size": _as_int(configs.get("max.message.bytes")),
            "topic_config": {str(key): value for key, value in configs.items()},
        }

    def _message_schema(self, topic: str) -> dict[str, Any] | None:
        if not self._schema_registry_url:
            return None
        for subject in (f"{topic}-value", f"{topic}-key", topic):
            try:
                payload = self._get(
                    (
                        f"{self._schema_registry_url}/subjects/"
                        f"{quote(subject, safe='')}/versions/latest"
                    ),
                    auth=self._schema_registry_auth,
                )
            except WorkflowError:
                continue
            if not isinstance(payload, dict):
                continue
            schema_text = payload.get("schema")
            if not schema_text:
                continue
            raw_type = str(payload.get("schemaType") or "AVRO").upper()
            return {
                "schemaType": _SCHEMA_TYPE.get(raw_type, "Other"),
                "schemaText": schema_text,
            }
        return None

    def _get(self, url: str, *, auth: tuple[str, str] | None) -> Any:
        response = self._client.get(url, auth=auth)
        if response.status_code == 404:
            raise WorkflowError(f"GET {url} returned HTTP 404")
        if response.status_code >= 400:
            raise WorkflowError(f"GET {url} failed with HTTP {response.status_code}")
        if not response.content:
            return None
        return response.json()


class KafkaAdminTopicReader:
    """Optional live reader using kafka-python AdminClient."""

    def __init__(self, bootstrap_servers: str) -> None:
        self._bootstrap_servers = bootstrap_servers

    def list_topics(self) -> Sequence[TopicRow]:
        try:
            from kafka.admin import KafkaAdminClient
        except ImportError as exc:
            raise WorkflowError(
                "kafka bootstrap discovery needs the optional extra: "
                "pip install 'smartmetadata-ingestion[kafka]'"
            ) from exc
        servers = [part.strip() for part in self._bootstrap_servers.split(",") if part.strip()]
        admin = KafkaAdminClient(
            bootstrap_servers=servers,
            client_id="smartmetadata-ingest",
        )
        try:
            descriptions = admin.describe_topics()
        finally:
            admin.close()
        rows: list[TopicRow] = []
        for item in descriptions or []:
            name = item.get("topic")
            if not name:
                continue
            partitions = item.get("partitions") or []
            rows.append(TopicRow(name=str(name), partitions=max(len(partitions), 1)))
        return rows


@register_source("kafka")
class KafkaSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: TopicReader | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._transport = transport

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._require_reader()
        try:
            for topic in self._selected_topics(reader):
                yield TopicRecord(
                    name=topic.name,
                    service=self._config.service_name,
                    partitions=max(int(topic.partitions or 1), 1),
                    message_schema=topic.message_schema,
                    cleanup_policies=topic.cleanup_policies or None,
                    replication_factor=topic.replication_factor,
                    retention_time=topic.retention_time,
                    maximum_message_size=topic.maximum_message_size,
                    topic_config=topic.topic_config or None,
                )
        finally:
            close = getattr(reader, "close", None)
            if callable(close) and reader is not self._reader:
                close()

    def _service_record(self) -> MessagingServiceRecord:
        raw = self._config.connection
        config: dict[str, Any] = {"type": "Kafka"}
        bootstrap = raw.get("bootstrapServers") or raw.get("bootstrap_servers")
        if bootstrap:
            config["bootstrapServers"] = bootstrap
        registry = (
            raw.get("schemaRegistryURL")
            or raw.get("schemaRegistryUrl")
            or raw.get("schema_registry_url")
        )
        if registry:
            config["schemaRegistryURL"] = registry
        if self._config.store_connection_secrets:
            if raw.get("saslUsername"):
                config["saslUsername"] = raw["saslUsername"]
            if raw.get("saslPassword"):
                config["saslPassword"] = raw["saslPassword"]
        connection = {"config": config} if len(config) > 1 else None
        return MessagingServiceRecord(
            name=self._config.service_name,
            service_type="Kafka",
            display_name=self._config.service_display_name,
            connection=connection,
        )

    def _require_reader(self) -> TopicReader:
        if self._reader is not None:
            return self._reader
        raw = self._config.connection
        rest_proxy = raw.get("restProxyUrl") or raw.get("rest_proxy_url")
        if rest_proxy:
            registry = (
                raw.get("schemaRegistryURL")
                or raw.get("schemaRegistryUrl")
                or raw.get("schema_registry_url")
            )
            rest_auth = _pair(raw.get("username"), raw.get("password"))
            registry_auth = _basic_auth_user_info(raw.get("basicAuthUserInfo")) or rest_auth
            return ConfluentHttpTopicReader(
                rest_proxy_url=str(rest_proxy),
                schema_registry_url=str(registry) if registry else None,
                transport=self._transport,
                auth=rest_auth,
                schema_registry_auth=registry_auth,
            )
        bootstrap = raw.get("bootstrapServers") or raw.get("bootstrap_servers")
        if bootstrap:
            return KafkaAdminTopicReader(str(bootstrap))
        raise WorkflowError(
            "kafka source.connection needs restProxyUrl (HTTP) or bootstrapServers (kafka extra)"
        )

    def _selected_topics(self, reader: TopicReader) -> list[TopicRow]:
        exclude = list(self._config.exclude_topics) + list(_INTERNAL_TOPICS)
        include = self._config.include_topics
        included = {name.lower() for name in include}
        selected: list[TopicRow] = []
        for topic in reader.list_topics():
            if topic.name.startswith("_") and topic.name.lower() not in included:
                continue
            if not is_selected(topic.name, include=include, exclude=exclude):
                continue
            selected.append(topic)
        return selected


def _pair(user: Any, password: Any) -> tuple[str, str] | None:
    if user and password:
        return (str(user), str(password))
    return None


def _basic_auth_user_info(value: Any) -> tuple[str, str] | None:
    if not value or ":" not in str(value):
        return None
    user, password = str(value).split(":", 1)
    return (user, password)


def _as_int(value: Any) -> int | None:
    if value in (None, "", "-1"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    if value in (None, "", "-1"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
