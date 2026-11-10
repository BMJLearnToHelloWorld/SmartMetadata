# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Kafka messaging connector (Metadata + Sampler + Connection).

Official OM ``messaging/kafka`` BaseSpec is Metadata + Sampler + Connection
(supportsProfiler on connection schema). Mirror of RedpandaSampler pattern.

Discovery prefers the documented Confluent REST Proxy + Schema Registry HTTP
APIs so unit tests can inject httpx transports. An optional kafka-python extra
reads topic metadata from bootstrap servers when no REST proxy is configured.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig, SourceConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    MessagingServiceRecord,
    TopicRecord,
    TopicSampleData,
    WorkflowRecord,
)

logger = logging.getLogger(__name__)

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


class SchemaSubjectNotFoundError(WorkflowError):
    """A Schema Registry subject does not exist."""


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
            except SchemaSubjectNotFoundError:
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
            raise SchemaSubjectNotFoundError(f"GET {url} returned HTTP 404")
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



class TopicMessageSampler(Protocol):
    def sample_messages(self, *, topic: str, limit: int = 10) -> Sequence[dict[str, Any]]: ...


# --- Live sampling (H track 1: sampler messaging chain) -------------------
# Official chain: CommonBrokerSource.yield_topic_sample_data +
# KafkaSampler._fetch_messages, mapped onto kafka-python (the product's
# direction since #146; confluent_kafka is not introduced).
# ADR:2026-11-08-sampler-messaging-kafka-python-mapping

# Official yield_topic_sample_data: 10 polls, 10 seconds total.
_SAMPLE_POLL_ATTEMPTS = 10
_SAMPLE_TOTAL_TIMEOUT_SECONDS = 10.0
# Official on_partitions_assignment_to_consumer: seek to the latest 50.
_SAMPLE_KEEP_RECENT_MESSAGES = 50
# Official KafkaSampler._consumer_group_id: openmetadata-auto-classification-
# <sha256(fqn)[:16]>. The product consumer is shared by one source run, so
# the group is per service, not per topic; offsets never carry across
# topics because every assignment seeks to recent first.
_SAMPLE_CONSUMER_GROUP_PREFIX = "smartmetadata-sampler"

ProfilerSettingsReader = Callable[[], dict[str, Any] | None]


def resolve_sample_data_allowed(
    *,
    pipeline_config: MessagingMetadataPipelineConfig | None,
    settings_reader: ProfilerSettingsReader | None,
) -> bool:
    """Double gate for live topic sampling (official CommonBrokerSource shape).

    Pipeline gate first, official ``getattr`` order: legacy
    ``storeSampleData`` wins over ``generateSampleData``. The server gate
    (``sampleDataConfig.storeSampleData`` from
    ``GET /v1/system/settings/profilerConfiguration``) is only read when
    the pipeline gate is on, exactly like official.
    ADR:2026-11-08-sampler-messaging-double-gate-fail-closed
    """
    pipeline_allowed = bool(
        (pipeline_config.store_sample_data if pipeline_config else None)
        or (pipeline_config.generate_sample_data if pipeline_config else False)
    )
    if not pipeline_allowed:
        return False
    if settings_reader is None:
        logger.warning(
            "sample data requested but no profiler settings reader is wired; "
            "not sampling (fail-closed)"
        )
        return False
    settings = settings_reader()
    if settings is None:
        logger.warning(
            "sample data requested but profilerConfiguration settings are "
            "unreadable; not sampling (fail-closed)"
        )
        return False
    config_value = settings.get("configValue")
    sample_data_config = (
        config_value.get("sampleDataConfig")
        if isinstance(config_value, dict)
        else None
    )
    if not isinstance(sample_data_config, dict):
        return True
    if sample_data_config.get("storeSampleData") is False:
        logger.info(
            "global profiler configuration disables storing of sample data; "
            "not sampling"
        )
        return False
    return True


def _sample_consumer_group_id(service_name: str) -> str:
    digest = hashlib.sha256(service_name.encode("utf-8")).hexdigest()[:16]
    return f"{_SAMPLE_CONSUMER_GROUP_PREFIX}-{digest}"


# Confluent wire format: a zero magic byte followed by a 4-byte schema id
# (official CommonBrokerSource.strip_confluent_framing).
_CONFLUENT_MAGIC_BYTE = 0
_CONFLUENT_HEADER_LENGTH = 5


def decode_sample_message(value: bytes) -> str:
    """Official ``CommonBrokerSource.decode_message``, schemaless branch.

    Strict UTF-8 after stripping the Confluent wire-format header. A binary
    payload we cannot type (Avro/Protobuf without a decode runtime in this
    track) raises, so the caller skips the message instead of storing
    mojibake — official's own rule for the strict branch.
    """
    payload = value
    if len(payload) >= _CONFLUENT_HEADER_LENGTH and payload[0] == _CONFLUENT_MAGIC_BYTE:
        payload = payload[_CONFLUENT_HEADER_LENGTH:]
    return payload.decode("utf-8")


@dataclass(frozen=True, slots=True)
class BrokerMessage:
    value: bytes | None


class BrokerMessageConsumer(Protocol):
    """One-message-at-a-time consumer surface the live sampler polls."""

    def subscribe(self, topics: Sequence[str]) -> None: ...

    def poll_message(self, *, timeout_ms: int) -> BrokerMessage | None: ...

    def unsubscribe(self) -> None: ...

    def close(self) -> None: ...


def _build_kafka_consumer_config(
    connection: dict[str, Any], *, group_id: str
) -> dict[str, Any]:
    """Official ``KafkaSampler._build_consumer_config`` mapped onto kafka-python.

    kafka-python needs ``api_version`` pinned, or construction connects to
    the broker for a version probe; the pinned version keeps construction
    free of network I/O so a bad broker fails at poll time, inside the
    sampler's per-topic tolerance. ``consumerConfig`` is deliberately not
    merged: its keys are confluent-style dotted names with no faithful
    kafka-python mapping (see the ADR). Consumer SSL locations are not
    wired either: the spec's ``consumerConfigSSL`` carries certificate
    material (``caCertificate``/``sslCertificate``/``sslKey``), not file
    paths, and official's own sampler reads attribute names that do not
    exist in the spec — there is no mapping to copy.
    ADR:2026-11-08-sampler-messaging-kafka-python-mapping
    """
    servers = connection.get("bootstrapServers") or connection.get("bootstrap_servers")
    if not servers or not str(servers).strip():
        raise WorkflowError("kafka live message sampling needs bootstrapServers")
    config: dict[str, Any] = {
        "bootstrap_servers": [part.strip() for part in str(servers).split(",") if part.strip()],
        "group_id": group_id,
        "auto_offset_reset": "earliest",
        "enable_auto_commit": False,
        "session_timeout_ms": 10000,
        "api_version": (2, 0, 0),
    }
    sasl_configured = bool(connection.get("saslUsername") or connection.get("saslPassword"))
    if sasl_configured:
        if connection.get("saslUsername"):
            config["sasl_plain_username"] = str(connection["saslUsername"])
        if connection.get("saslPassword"):
            config["sasl_plain_password"] = str(connection["saslPassword"])
        if connection.get("saslMechanism"):
            config["sasl_mechanism"] = str(connection["saslMechanism"])
    security = connection.get("securityProtocol")
    if security and (sasl_configured or str(security) != "PLAINTEXT"):
        config["security_protocol"] = str(security)
    return config


def _seek_to_recent_listener(consumer: Any, *, keep: int = _SAMPLE_KEEP_RECENT_MESSAGES) -> Any:
    """Rebalance listener seeking each assigned partition to recent messages.

    Official ``on_partitions_assignment_to_consumer`` shape: offset =
    latest - 50, floored at the beginning. The listener class must subclass
    kafka-python's ConsumerRebalanceListener, so it is built lazily here
    (this module imports without the kafka extra).
    """
    from kafka.consumer.subscription_state import ConsumerRebalanceListener

    class _SeekToRecentListener(ConsumerRebalanceListener):
        def on_partitions_assigned(self, assigned: Sequence[Any]) -> None:
            for partition in assigned:
                try:
                    end = consumer.end_offsets([partition])[partition]
                    beginning = consumer.beginning_offsets([partition])[partition]
                    consumer.seek(partition, max(beginning, end - keep))
                except Exception as exc:
                    logger.warning(
                        "could not seek %s to recent messages: %s", partition, exc
                    )

        def on_partitions_revoked(self, revoked: Sequence[Any]) -> None:
            return None

    return _SeekToRecentListener()


class KafkaPythonConsumer:
    """kafka-python adapter for :class:`BrokerMessageConsumer`."""

    def __init__(self, connection: dict[str, Any], *, group_id: str) -> None:
        try:
            from kafka import KafkaConsumer
        except ImportError as exc:
            raise WorkflowError(
                "kafka live message sampling needs the optional extra: "
                "pip install 'smartmetadata-ingestion[kafka]'"
            ) from exc
        self._consumer = KafkaConsumer(
            **_build_kafka_consumer_config(connection, group_id=group_id)
        )

    def subscribe(self, topics: Sequence[str]) -> None:
        self._consumer.subscribe(
            topics=list(topics),
            listener=_seek_to_recent_listener(self._consumer),
        )

    def poll_message(self, *, timeout_ms: int) -> BrokerMessage | None:
        records = self._consumer.poll(timeout_ms=max(timeout_ms, 0), max_records=1)
        for partition_records in records.values():
            if partition_records:
                return BrokerMessage(value=partition_records[0].value)
        return None

    def unsubscribe(self) -> None:
        self._consumer.unsubscribe()

    def close(self) -> None:
        self._consumer.close()


class LiveBrokerMessageSampler:
    """Live kafka-python sampling for one source run (shared by Kafka/Redpanda).

    One consumer per run, built lazily from the in-memory connection dict
    (H-Q-1.3: credentials are held only for consumer construction, never
    written to any serializable structure). A topic that fails to fetch
    yields its partial messages and a warning; it never interrupts the run.
    """

    def __init__(
        self,
        connection: dict[str, Any],
        *,
        group_id: str,
        consumer: BrokerMessageConsumer | None = None,
        consumer_factory: Callable[
            [dict[str, Any], str], BrokerMessageConsumer
        ]
        | None = None,
    ) -> None:
        self._connection = connection
        self._group_id = group_id
        self._injected_consumer = consumer
        self._consumer_factory = consumer_factory or (
            lambda conn, gid: KafkaPythonConsumer(conn, group_id=gid)
        )
        self._consumer: BrokerMessageConsumer | None = None
        self._consumer_failed = False

    def sample(self, *, topic: str, limit: int = 10) -> list[str]:
        consumer = self._ensure_consumer()
        if consumer is None:
            return []
        messages: list[str] = []
        deadline = time.monotonic() + _SAMPLE_TOTAL_TIMEOUT_SECONDS
        try:
            consumer.subscribe([topic])
            for _ in range(_SAMPLE_POLL_ATTEMPTS):
                if len(messages) >= limit:
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    record = consumer.poll_message(timeout_ms=int(remaining * 1000))
                except Exception as exc:
                    logger.warning("consumer error polling topic %s: %s", topic, exc)
                    continue
                if record is None:
                    break
                if not record.value:
                    continue
                try:
                    messages.append(decode_sample_message(record.value))
                except Exception as exc:
                    logger.warning(
                        "failed to decode sample data from topic %s: %s", topic, exc
                    )
        except Exception as exc:
            logger.warning("failed to fetch sample data from topic %s: %s", topic, exc)
        finally:
            try:
                consumer.unsubscribe()
            except Exception:
                pass
        if len(messages) < limit:
            logger.warning(
                "kafka message fetch collected %s of %s messages for topic %s",
                len(messages),
                limit,
                topic,
            )
        return messages

    def close(self) -> None:
        consumer, self._consumer = self._consumer, None
        if consumer is not None and consumer is not self._injected_consumer:
            try:
                consumer.close()
            except Exception as exc:
                logger.warning("closing kafka sample consumer failed: %s", exc)

    def _ensure_consumer(self) -> BrokerMessageConsumer | None:
        if self._consumer is not None:
            return self._consumer
        if self._consumer_failed:
            return None
        if self._injected_consumer is not None:
            self._consumer = self._injected_consumer
            return self._consumer
        try:
            self._consumer = self._consumer_factory(self._connection, self._group_id)
        except Exception as exc:
            self._consumer_failed = True
            logger.warning("kafka live message sampling is unavailable: %s", exc)
            return None
        return self._consumer


def _sample_message_text(row: Any) -> str:
    """An injectable sampler's row becomes a TopicSampleData message (a string)."""
    if isinstance(row, str):
        return row
    if isinstance(row, dict):
        return json.dumps(row, sort_keys=True, ensure_ascii=False, default=str)
    return str(row)


class SequenceTopicMessageSampler:
    def __init__(self, *, samples: dict[str, Sequence[dict[str, Any]]] | None = None) -> None:
        self._samples = {k: list(v) for k, v in (samples or {}).items()}

    def sample_messages(self, *, topic: str, limit: int = 10) -> Sequence[dict[str, Any]]:
        rows = self._samples.get(topic) or []
        return list(rows)[:limit]


class KafkaSampler:
    """Sampler surface matching OM messaging/kafka service_spec sampler_class.

    Unit BehaviorMatched via injectable TopicMessageSampler; without one,
    live kafka-python sampling (H track 1). ``sample()`` returns
    TopicSampleData messages (strings) on every path: injectable rows are
    serialized to JSON text, live rows are decoded message strings.
    ADR:2026-11-08-sampler-messaging-kafka-python-mapping
    """

    def __init__(
        self,
        config: SourceConfig,
        *,
        sampler: TopicMessageSampler | None = None,
        consumer: BrokerMessageConsumer | None = None,
    ) -> None:
        self._config = config
        self._sampler = sampler
        self._consumer = consumer
        self._live: LiveBrokerMessageSampler | None = None

    def sample(self, *, topic: str, limit: int = 10) -> list[str]:
        if self._sampler is not None:
            return [
                _sample_message_text(row)
                for row in self._sampler.sample_messages(topic=topic, limit=limit)
            ]
        if self._live is None:
            self._live = LiveBrokerMessageSampler(
                self._config.connection,
                group_id=_sample_consumer_group_id(self._config.service_name),
                consumer=self._consumer,
            )
        return self._live.sample(topic=topic, limit=limit)

    def close(self) -> None:
        if self._live is not None:
            self._live.close()


@register_source("kafka")
class KafkaSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: TopicReader | None = None,
        sampler: TopicMessageSampler | None = None,
        transport: httpx.BaseTransport | None = None,
        profiler_settings_reader: ProfilerSettingsReader | None = None,
        consumer: BrokerMessageConsumer | None = None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._sampler = sampler
        self._transport = transport
        # H track 1: the server kill-switch reader, wired by
        # MetadataWorkflow via build_source (None in direct construction
        # and in tests that do not sample; the gate fails closed then).
        self._profiler_settings_reader = profiler_settings_reader
        self._consumer = consumer
        self._sample_data_allowed: bool | None = None
        self._sampler_instance: KafkaSampler | None = None

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        if self._sampler_instance is not None:
            self._sampler_instance.close()

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
                    sample_data=self._sample_topic(topic),
                )
        finally:
            close = getattr(reader, "close", None)
            if callable(close) and reader is not self._reader:
                close()

    def sampler(self) -> KafkaSampler:
        if self._sampler_instance is None:
            self._sampler_instance = KafkaSampler(
                self._config, sampler=self._sampler, consumer=self._consumer
            )
        return self._sampler_instance

    def _sample_topic(self, topic: TopicRow) -> TopicSampleData | None:
        """Live-sample one topic when the double gate allows it.

        A topic that fails to fetch yields no sample data and a warning;
        it never interrupts the run (official per-topic tolerance).
        """
        if not self._sampling_allowed():
            return None
        try:
            messages = self.sampler().sample(topic=topic.name, limit=_SAMPLE_POLL_ATTEMPTS)
        except Exception as exc:
            logger.warning("failed to fetch sample data from topic %s: %s", topic.name, exc)
            return None
        if not messages:
            return None
        return TopicSampleData(messages=messages)

    def _sampling_allowed(self) -> bool:
        if self._sample_data_allowed is None:
            self._sample_data_allowed = resolve_sample_data_allowed(
                pipeline_config=self._config.messaging_metadata,
                settings_reader=self._profiler_settings_reader,
            )
        return self._sample_data_allowed

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
        if raw.get("saslUsername"):
            config["saslUsername"] = raw["saslUsername"]
        if self._config.store_connection_secrets:
            if raw.get("saslPassword"):
                config["saslPassword"] = raw["saslPassword"]
            if raw.get("basicAuthUserInfo"):
                config["basicAuthUserInfo"] = raw["basicAuthUserInfo"]
        suffix = raw.get("schemaRegistryTopicSuffixName")
        if suffix is not None and str(suffix) != "":
            config["schemaRegistryTopicSuffixName"] = str(suffix)
        security = raw.get("securityProtocol")
        if security:
            config["securityProtocol"] = str(security)
        mechanism = raw.get("saslMechanism")
        if mechanism:
            config["saslMechanism"] = str(mechanism)
        consumer = raw.get("consumerConfig")
        if isinstance(consumer, dict) and consumer:
            config["consumerConfig"] = dict(consumer)
        registry_cfg = raw.get("schemaRegistryConfig")
        if isinstance(registry_cfg, dict) and registry_cfg:
            config["schemaRegistryConfig"] = dict(registry_cfg)
        tfp = raw.get("topicFilterPattern")
        if isinstance(tfp, dict):
            config["topicFilterPattern"] = tfp
        if raw.get("supportsMetadataExtraction") is not None:
            config["supportsMetadataExtraction"] = bool(raw["supportsMetadataExtraction"])
        if raw.get("supportsProfiler") is not None:
            config["supportsProfiler"] = bool(raw["supportsProfiler"])
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
