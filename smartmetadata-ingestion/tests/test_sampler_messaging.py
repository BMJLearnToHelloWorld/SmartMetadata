# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""H track 1: sampler messaging chain (double gate, live poll, source wiring)."""

from __future__ import annotations

import httpx
import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.base import build_source
from smartmetadata_ingestion.connectors.kafka import (
    BrokerMessage,
    KafkaPythonConsumer,
    KafkaSource,
    LiveBrokerMessageSampler,
    SequenceTopicReader,
    TopicRow,
    _build_kafka_consumer_config,
    _seek_to_recent_listener,
    decode_sample_message,
    resolve_sample_data_allowed,
)
from smartmetadata_ingestion.connectors.redpanda import RedpandaSource
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TopicRecord


def _enabled_settings() -> dict:
    return {"configValue": {"sampleDataConfig": {"storeSampleData": True}}}


def _disabled_settings() -> dict:
    return {"configValue": {"sampleDataConfig": {"storeSampleData": False}}}


# --- Double gate ------------------------------------------------------------


def test_gate_off_when_pipeline_flag_absent() -> None:
    called: list[bool] = []

    def reader():
        called.append(True)
        return _enabled_settings()

    assert (
        resolve_sample_data_allowed(pipeline_config=None, settings_reader=reader) is False
    )
    # The server gate is only read when the pipeline gate is on (official).
    assert called == []


def test_gate_off_when_pipeline_flag_false() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=False),
            settings_reader=lambda: _enabled_settings(),
        )
        is False
    )


def test_gate_legacy_store_sample_data_wins() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    # Official getattr order: storeSampleData first, generateSampleData second.
    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(
                store_sample_data=True, generate_sample_data=False
            ),
            settings_reader=lambda: _enabled_settings(),
        )
        is True
    )


def test_gate_fail_closed_without_reader() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=True),
            settings_reader=None,
        )
        is False
    )


def test_gate_fail_closed_when_settings_unreadable() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=True),
            settings_reader=lambda: None,
        )
        is False
    )


def test_gate_server_kill_switch_disables() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=True),
            settings_reader=lambda: _disabled_settings(),
        )
        is False
    )


def test_gate_server_kill_switch_enables() -> None:
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    assert (
        resolve_sample_data_allowed(
            pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=True),
            settings_reader=lambda: _enabled_settings(),
        )
        is True
    )


def test_gate_missing_sample_data_config_is_not_disabled() -> None:
    # A well-formed response without sampleDataConfig means "no kill-switch
    # configured" (spec default storeSampleData=true), unlike an unreadable
    # endpoint, which fails closed.
    from smartmetadata_ingestion.config import MessagingMetadataPipelineConfig

    for settings in ({}, {"configValue": {}}, {"configValue": "bogus"}):
        assert (
            resolve_sample_data_allowed(
                pipeline_config=MessagingMetadataPipelineConfig(generate_sample_data=True),
                settings_reader=lambda s=settings: s,
            )
            is True
        )


# --- Decode -----------------------------------------------------------------


def test_decode_plain_json_message() -> None:
    assert decode_sample_message(b'{"id": 1}') == '{"id": 1}'


def test_decode_strips_confluent_framing() -> None:
    framed = b"\x00\x00\x00\x00\x07" + b'{"id": 2}'
    assert decode_sample_message(framed) == '{"id": 2}'


def test_decode_binary_payload_raises_instead_of_mojibake() -> None:
    with pytest.raises(UnicodeDecodeError):
        decode_sample_message(b"\xff\xfe\x00\x01binary")


# --- Consumer config --------------------------------------------------------


def test_consumer_config_needs_bootstrap_servers() -> None:
    with pytest.raises(WorkflowError, match="bootstrapServers"):
        _build_kafka_consumer_config({}, group_id="g-1")


def test_consumer_config_maps_sasl_and_security_protocol() -> None:
    config = _build_kafka_consumer_config(
        {
            "bootstrapServers": "a:9092, b:9092",
            "saslUsername": "u",
            "saslPassword": "p",
            "saslMechanism": "SCRAM-SHA-256",
            "securityProtocol": "SASL_PLAINTEXT",
        },
        group_id="g-1",
    )
    assert config["bootstrap_servers"] == ["a:9092", "b:9092"]
    assert config["group_id"] == "g-1"
    assert config["auto_offset_reset"] == "earliest"
    assert config["enable_auto_commit"] is False
    assert config["session_timeout_ms"] == 10000
    assert config["sasl_plain_username"] == "u"
    assert config["sasl_plain_password"] == "p"
    assert config["sasl_mechanism"] == "SCRAM-SHA-256"
    assert config["security_protocol"] == "SASL_PLAINTEXT"


def test_consumer_config_omits_security_protocol_for_plaintext() -> None:
    config = _build_kafka_consumer_config(
        {"bootstrapServers": "a:9092", "securityProtocol": "PLAINTEXT"},
        group_id="g-1",
    )
    assert "security_protocol" not in config
    assert "sasl_plain_username" not in config


def test_consumer_config_emits_non_default_protocol_without_sasl() -> None:
    config = _build_kafka_consumer_config(
        {"bootstrapServers": "a:9092", "securityProtocol": "SSL"},
        group_id="g-1",
    )
    assert config["security_protocol"] == "SSL"


# --- Live poll loop (injectable consumer) -----------------------------------


class FakeBrokerConsumer:
    """Injectable BrokerMessageConsumer with scripted polls."""

    def __init__(
        self,
        messages: list[bytes] | None = None,
        *,
        fail_polls: set[int] | None = None,
        subscribe_raises: bool = False,
    ) -> None:
        self._queue = list(messages or [])
        self._fail_polls = set(fail_polls or ())
        self._subscribe_raises = subscribe_raises
        self.polls = 0
        self.subscribed: list[list[str]] = []
        self.unsubscribed = 0
        self.closed = False

    def subscribe(self, topics) -> None:
        if self._subscribe_raises:
            raise RuntimeError("subscribe boom")
        self.subscribed.append(list(topics))

    def poll_message(self, *, timeout_ms: int) -> BrokerMessage | None:
        self.polls += 1
        if self.polls in self._fail_polls:
            raise RuntimeError("broker boom")
        if not self._queue:
            return None
        return BrokerMessage(value=self._queue.pop(0))

    def unsubscribe(self) -> None:
        self.unsubscribed += 1

    def close(self) -> None:
        self.closed = True


def _live_sampler(consumer: FakeBrokerConsumer) -> LiveBrokerMessageSampler:
    return LiveBrokerMessageSampler(
        {"bootstrapServers": "b:9092"},
        group_id="g-1",
        consumer=consumer,
    )


def test_live_sampler_collects_up_to_limit() -> None:
    consumer = FakeBrokerConsumer([f'{{"n": {i}}}'.encode() for i in range(20)])
    messages = _live_sampler(consumer).sample(topic="orders", limit=10)
    assert len(messages) == 10
    assert messages[0] == '{"n": 0}'
    assert messages[9] == '{"n": 9}'
    assert consumer.polls == 10
    assert consumer.subscribed == [["orders"]]
    assert consumer.unsubscribed == 1


def test_live_sampler_warns_when_underfilled(caplog) -> None:
    consumer = FakeBrokerConsumer([b'{"n": 1}', b'{"n": 2}'])
    with caplog.at_level("WARNING"):
        messages = _live_sampler(consumer).sample(topic="orders", limit=10)
    assert messages == ['{"n": 1}', '{"n": 2}']
    assert "collected 2 of 10 messages" in caplog.text


def test_live_sampler_skips_undecodable_message_and_continues(caplog) -> None:
    consumer = FakeBrokerConsumer([b'{"ok": 1}', b"\xff\xfe binary", b'{"ok": 2}'])
    with caplog.at_level("WARNING"):
        messages = _live_sampler(consumer).sample(topic="orders", limit=10)
    assert messages == ['{"ok": 1}', '{"ok": 2}']
    assert "failed to decode sample data" in caplog.text


def test_live_sampler_poll_error_does_not_interrupt_run(caplog) -> None:
    consumer = FakeBrokerConsumer([b'{"ok": 1}'], fail_polls={1})
    with caplog.at_level("WARNING"):
        messages = _live_sampler(consumer).sample(topic="orders", limit=10)
    assert messages == ['{"ok": 1}']
    assert "consumer error polling topic" in caplog.text


def test_live_sampler_timeout_returns_partial(caplog) -> None:
    consumer = FakeBrokerConsumer([])
    with caplog.at_level("WARNING"):
        messages = _live_sampler(consumer).sample(topic="orders", limit=10)
    assert messages == []
    assert consumer.polls == 1
    assert "collected 0 of 10 messages" in caplog.text


def test_live_sampler_subscribe_failure_yields_no_samples() -> None:
    consumer = FakeBrokerConsumer([b'{"ok": 1}'], subscribe_raises=True)
    assert _live_sampler(consumer).sample(topic="orders", limit=10) == []


def test_live_sampler_does_not_close_injected_consumer() -> None:
    consumer = FakeBrokerConsumer([b'{"ok": 1}'])
    sampler = _live_sampler(consumer)
    sampler.sample(topic="orders", limit=1)
    sampler.close()
    assert consumer.closed is False


# --- kafka-python adapter (needs the extra) ---------------------------------


def test_seek_listener_seeks_to_recent() -> None:
    pytest.importorskip("kafka")
    seen: list[tuple[object, int]] = []

    class FakeKafkaConsumer:
        def end_offsets(self, partitions):
            return {partition: 120 for partition in partitions}

        def beginning_offsets(self, partitions):
            return {partition: 0 for partition in partitions}

        def seek(self, partition, offset) -> None:
            seen.append((partition, offset))

    listener = _seek_to_recent_listener(FakeKafkaConsumer())
    listener.on_partitions_assigned(["orders-0"])
    assert seen == [("orders-0", 70)]


def test_seek_listener_floors_at_beginning() -> None:
    pytest.importorskip("kafka")

    class FakeKafkaConsumer:
        def end_offsets(self, partitions):
            return {partition: 30 for partition in partitions}

        def beginning_offsets(self, partitions):
            return {partition: 10 for partition in partitions}

        def seek(self, partition, offset) -> None:
            seen.append((partition, offset))

    seen: list[tuple[object, int]] = []
    listener = _seek_to_recent_listener(FakeKafkaConsumer())
    listener.on_partitions_assigned(["orders-0"])
    assert seen == [("orders-0", 10)]


def test_kafka_python_consumer_builds_without_a_broker() -> None:
    pytest.importorskip("kafka")
    consumer = KafkaPythonConsumer(
        {
            "bootstrapServers": "localhost:9092",
            "saslUsername": "u",
            "saslPassword": "p",
            "saslMechanism": "PLAIN",
            "securityProtocol": "SASL_PLAINTEXT",
        },
        group_id="g-1",
    )
    try:
        assert consumer._consumer.config["group_id"] == "g-1"
        assert consumer._consumer.config["security_protocol"] == "SASL_PLAINTEXT"
        assert consumer._consumer.config["enable_auto_commit"] is False
    finally:
        consumer.close()


# --- Source wiring ----------------------------------------------------------

# Sentinel: "no settings argument given" (distinct from an explicit None,
# which means the settings endpoint is unreadable).
_UNSET: object = object()


def _kafka_source(
    *,
    messaging_metadata: dict | None = None,
    settings: dict | None | object = _UNSET,
    consumer: FakeBrokerConsumer | None = None,
) -> KafkaSource:
    if settings is _UNSET:
        settings = _enabled_settings()
    config = SourceConfig(
        type="kafka",
        service_name="events",
        connection={"bootstrapServers": "b:9092"},
        messaging_metadata=messaging_metadata,
    )
    return KafkaSource(
        config,
        reader=SequenceTopicReader([TopicRow(name="orders", partitions=1)]),
        consumer=consumer,
        profiler_settings_reader=(lambda: settings),
    )


def test_kafka_source_samples_when_both_gates_allow() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 1}', b'{"id": 2}'])
    source = _kafka_source(
        messaging_metadata={"generateSampleData": True}, consumer=consumer
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].sample_data is not None
    assert topics[0].sample_data.messages == ['{"id": 1}', '{"id": 2}']
    assert consumer.subscribed == [["orders"]]


def test_kafka_source_skips_sampling_when_pipeline_gate_off() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 1}'])
    source = _kafka_source(messaging_metadata=None, consumer=consumer)
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].sample_data is None
    assert consumer.subscribed == []


def test_kafka_source_skips_sampling_when_server_gate_off() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 1}'])
    source = _kafka_source(
        messaging_metadata={"generateSampleData": True},
        settings=_disabled_settings(),
        consumer=consumer,
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].sample_data is None
    assert consumer.subscribed == []


def test_kafka_source_skips_sampling_when_settings_unreadable() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 1}'])
    source = _kafka_source(
        messaging_metadata={"generateSampleData": True},
        settings=None,
        consumer=consumer,
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].sample_data is None
    assert consumer.subscribed == []


def test_kafka_source_sample_failure_does_not_interrupt_run() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 1}'], subscribe_raises=True)
    source = _kafka_source(
        messaging_metadata={"generateSampleData": True}, consumer=consumer
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert [topic.name for topic in topics] == ["orders"]
    assert topics[0].sample_data is None


def test_redpanda_source_samples_when_both_gates_allow() -> None:
    consumer = FakeBrokerConsumer([b'{"id": 7}'])
    config = SourceConfig(
        type="redpanda",
        service_name="rp-events",
        connection={"bootstrapServers": "b:9092"},
        messaging_metadata={"generateSampleData": True},
    )
    source = RedpandaSource(
        config,
        reader=SequenceTopicReader([TopicRow(name="orders", partitions=1)]),
        consumer=consumer,
        profiler_settings_reader=lambda: _enabled_settings(),
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].sample_data is not None
    assert topics[0].sample_data.messages == ['{"id": 7}']


def test_build_source_wires_reader_only_for_messaging() -> None:
    def reader():
        return _enabled_settings()

    kafka = build_source(
        _workflow_config_for("kafka"), profiler_settings_reader=reader
    )
    assert kafka._profiler_settings_reader is reader
    postgres = build_source(
        _workflow_config_for("postgres"), profiler_settings_reader=reader
    )
    assert not hasattr(postgres, "_profiler_settings_reader")


def _workflow_config_for(source_type: str):
    from smartmetadata_ingestion.config import WorkflowConfig

    return WorkflowConfig.model_validate(
        {
            "workflow": {"name": "w", "type": "metadata"},
            "server": {
                "hostPort": "http://catalog.test/api",
                "auth": {"type": "jwt", "jwtToken": "t"},
            },
            "source": {
                "type": source_type,
                "serviceName": "svc",
                "connection": {"bootstrapServers": "b:9092"},
            },
            "sink": {"type": "metadata-rest"},
        }
    )


def test_workflow_prepare_wires_profiler_settings_reader() -> None:
    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import WorkflowConfig
    from smartmetadata_ingestion.workflow import MetadataWorkflow

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/system/settings/profilerConfiguration"):
            return httpx.Response(200, json=_enabled_settings())
        return httpx.Response(404, json={})

    config = WorkflowConfig.model_validate(
        {
            "workflow": {"name": "w", "type": "metadata"},
            "server": {
                "hostPort": "http://catalog.test/api",
                "auth": {"type": "jwt", "jwtToken": "t"},
            },
            "source": {
                "type": "kafka",
                "serviceName": "svc",
                "connection": {"bootstrapServers": "b:9092"},
                "messagingMetadata": {"generateSampleData": True},
            },
            "sink": {"type": "metadata-rest"},
        }
    )
    client = RestClient(config.server, transport=httpx.MockTransport(handler))
    workflow = MetadataWorkflow(config, client=client)
    reader = workflow._source._profiler_settings_reader
    assert reader is not None
    assert reader() == _enabled_settings()
