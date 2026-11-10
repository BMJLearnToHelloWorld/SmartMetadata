# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Redpanda messaging connector (Metadata + Sampler + Connection).

Official OM ``messaging/redpanda`` BaseSpec is Metadata + Sampler + Connection.
Redpanda is Kafka-protocol compatible; clean-room reuse of Kafka TopicReader
helpers (no CCL copy). Live sampling reuses the Kafka live sampler (H track 1).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from typing import Any, Protocol

import httpx

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.kafka import (
    BrokerMessageConsumer,
    ConfluentHttpTopicReader,
    KafkaAdminTopicReader,
    LiveBrokerMessageSampler,
    ProfilerSettingsReader,
    SequenceTopicReader,
    TopicReader,
    TopicRow,
    _sample_consumer_group_id,
    _sample_message_text,
    resolve_sample_data_allowed,
)
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


class TopicMessageSampler(Protocol):
    def sample_messages(self, *, topic: str, limit: int = 10) -> Sequence[dict[str, Any]]: ...


class SequenceTopicMessageSampler:
    def __init__(self, *, samples: dict[str, Sequence[dict[str, Any]]] | None = None) -> None:
        self._samples = {k: list(v) for k, v in (samples or {}).items()}

    def sample_messages(self, *, topic: str, limit: int = 10) -> Sequence[dict[str, Any]]:
        rows = self._samples.get(topic) or []
        return list(rows)[:limit]


class RedpandaSampler:
    """Sampler surface matching OM service_spec ``sampler_class``.

    Unit BehaviorMatched via injectable TopicMessageSampler; without one,
    live kafka-python sampling (H track 1, shared with KafkaSampler).
    ``sample()`` returns TopicSampleData messages (strings) on every path.
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


@register_source("redpanda")
class RedpandaSource:
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
        # H track 1: same server kill-switch reader as KafkaSource.
        self._profiler_settings_reader = profiler_settings_reader
        self._consumer = consumer
        self._sample_data_allowed: bool | None = None
        self._sampler_instance: RedpandaSampler | None = None

    def prepare(self) -> None:
        reader = self._require_reader()
        try:
            # Connection test: successful topic enumeration (or empty list).
            reader.list_topics()
        finally:
            close = getattr(reader, "close", None)
            if callable(close) and reader is not self._reader:
                close()

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

    def sampler(self) -> RedpandaSampler:
        if self._sampler_instance is None:
            self._sampler_instance = RedpandaSampler(
                self._config, sampler=self._sampler, consumer=self._consumer
            )
        return self._sampler_instance

    def _sample_topic(self, topic: TopicRow) -> TopicSampleData | None:
        """Live-sample one topic when the double gate allows it (Kafka shape)."""
        if not self._sampling_allowed():
            return None
        try:
            messages = self.sampler().sample(topic=topic.name, limit=10)
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
        connection_config = _public_redpanda_connection(
            dict(self._config.connection or {}),
            store_secrets=self._config.store_connection_secrets,
        )
        return MessagingServiceRecord(
            name=self._config.service_name,
            service_type="Redpanda",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _require_reader(self) -> TopicReader:
        if self._reader is not None:
            return self._reader
        raw = self._config.connection or {}
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
            "redpanda source.connection needs bootstrapServers "
            "(kafka extra) or restProxyUrl (HTTP discovery)"
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


def _public_redpanda_connection(raw: dict[str, Any], *, store_secrets: bool = False) -> dict[str, Any]:
    """Emit official redpandaConnection shape; omit secrets unless store_connection_secrets."""
    out: dict[str, Any] = {"type": "Redpanda"}
    bootstrap = raw.get("bootstrapServers") or raw.get("bootstrap_servers")
    if bootstrap:
        out["bootstrapServers"] = str(bootstrap)
    registry = (
        raw.get("schemaRegistryURL")
        or raw.get("schemaRegistryUrl")
        or raw.get("schema_registry_url")
    )
    if registry:
        out["schemaRegistryURL"] = str(registry)
    if raw.get("saslUsername"):
        out["saslUsername"] = str(raw["saslUsername"])
    if store_secrets:
        if raw.get("saslPassword"):
            out["saslPassword"] = str(raw["saslPassword"])
        if raw.get("basicAuthUserInfo"):
            out["basicAuthUserInfo"] = str(raw["basicAuthUserInfo"])
    suffix = raw.get("schemaRegistryTopicSuffixName")
    if suffix is not None and str(suffix) != "":
        out["schemaRegistryTopicSuffixName"] = str(suffix)
    security = raw.get("securityProtocol")
    if security:
        out["securityProtocol"] = str(security)
    mechanism = raw.get("saslMechanism")
    if mechanism:
        out["saslMechanism"] = str(mechanism)
    consumer = raw.get("consumerConfig")
    if isinstance(consumer, dict) and consumer:
        out["consumerConfig"] = dict(consumer)
    registry_cfg = raw.get("schemaRegistryConfig")
    if isinstance(registry_cfg, dict) and registry_cfg:
        out["schemaRegistryConfig"] = dict(registry_cfg)
    tfp = raw.get("topicFilterPattern")
    if isinstance(tfp, dict):
        out["topicFilterPattern"] = tfp
    if raw.get("supportsMetadataExtraction") is not None:
        out["supportsMetadataExtraction"] = bool(raw["supportsMetadataExtraction"])
    if raw.get("supportsProfiler") is not None:
        out["supportsProfiler"] = bool(raw["supportsProfiler"])
    return out


def _pair(user: Any, password: Any) -> tuple[str, str] | None:
    if user and password:
        return (str(user), str(password))
    return None


def _basic_auth_user_info(value: Any) -> tuple[str, str] | None:
    if not value or ":" not in str(value):
        return None
    user, password = str(value).split(":", 1)
    return (user, password)


# Re-export helpers tests may import alongside Redpanda types.
__all__ = [
    "RedpandaSampler",
    "RedpandaSource",
    "SequenceTopicMessageSampler",
    "SequenceTopicReader",
    "TopicMessageSampler",
    "TopicRow",
]
