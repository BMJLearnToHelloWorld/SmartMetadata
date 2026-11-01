# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import httpx
import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.kafka import (
    KafkaSampler,
    SequenceTopicMessageSampler,
    ConfluentHttpTopicReader,
    KafkaSource,
    SequenceTopicReader,
    TopicRow,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import MessagingServiceRecord, TopicRecord


def test_kafka_source_emits_service_and_topics() -> None:
    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="events",
            connection={
                "bootstrapServers": "broker:9092",
                "schemaRegistryURL": "http://schema:8081",
            },
            include_topics=["orders", "payments"],
        ),
        reader=SequenceTopicReader(
            [
                TopicRow(
                    name="orders",
                    partitions=3,
                    cleanup_policies=["delete"],
                    replication_factor=2,
                    retention_time=86400000,
                    message_schema={"schemaType": "Avro", "schemaText": '{"type":"record"}'},
                ),
                TopicRow(name="payments", partitions=1),
                TopicRow(name="_internal", partitions=1),
                TopicRow(name="__consumer_offsets", partitions=12),
                TopicRow(name="ignored", partitions=1),
            ]
        ),
    )
    records = list(source.produce())
    assert records[0].kind == "messagingService"
    service = records[0]
    assert isinstance(service, MessagingServiceRecord)
    assert service.service_type == "Kafka"
    assert service.connection["config"]["bootstrapServers"] == "broker:9092"
    assert "saslPassword" not in service.connection["config"]
    topics = [record for record in records if isinstance(record, TopicRecord)]
    assert [topic.name for topic in topics] == ["orders", "payments"]
    assert topics[0].partitions == 3
    assert topics[0].message_schema["schemaType"] == "Avro"
    assert topics[0].cleanup_policies == ["delete"]


def test_confluent_http_reader_uses_rest_proxy_and_schema_registry() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/topics") and request.url.host == "proxy.test":
            return httpx.Response(200, json=["orders", "payments"])
        if path.endswith("/topics/orders"):
            return httpx.Response(
                200,
                json={
                    "partitions": [
                        {"partition": 0, "replicas": [1, 2]},
                        {"partition": 1, "replicas": [1, 2]},
                    ],
                    "configs": {
                        "cleanup.policy": "delete",
                        "retention.ms": "3600000",
                        "max.message.bytes": "1048576",
                    },
                },
            )
        if path.endswith("/topics/payments"):
            return httpx.Response(200, json={"partitions": 1, "configs": {}})
        if path.endswith("/subjects/orders-value/versions/latest"):
            return httpx.Response(
                200,
                json={"schemaType": "AVRO", "schema": '{"type":"record","name":"Order"}'},
            )
        if "/subjects/" in path:
            return httpx.Response(404, json={"error_code": 40401})
        raise AssertionError(path)

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        schema_registry_url="http://schema.test",
        transport=httpx.MockTransport(handler),
    )
    topics = {row.name: row for row in reader.list_topics()}
    reader.close()
    assert topics["orders"].partitions == 2
    assert topics["orders"].replication_factor == 2
    assert topics["orders"].cleanup_policies == ["delete"]
    assert topics["orders"].retention_time == 3600000
    assert topics["orders"].message_schema == {
        "schemaType": "Avro",
        "schemaText": '{"type":"record","name":"Order"}',
    }
    assert topics["payments"].partitions == 1
    assert topics["payments"].message_schema is None


def test_schema_registry_404_tries_the_next_subject() -> None:
    requested_subjects: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/topics"):
            return httpx.Response(200, json=["orders"])
        if request.url.host == "proxy.test":
            return httpx.Response(200, json={"partitions": 1, "configs": {}})
        requested_subjects.append(request.url.path)
        if request.url.path.endswith("/orders-value/versions/latest"):
            return httpx.Response(404, json={"error_code": 40401})
        return httpx.Response(200, json={"schemaType": "AVRO", "schema": "{}"})

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        schema_registry_url="http://schema.test",
        transport=httpx.MockTransport(handler),
    )
    topics = reader.list_topics()
    reader.close()

    assert topics[0].message_schema == {"schemaType": "Avro", "schemaText": "{}"}
    assert len(requested_subjects) == 2


def test_schema_registry_non_404_failure_is_not_reported_as_missing_schema() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/topics"):
            return httpx.Response(200, json=["orders"])
        if request.url.host == "proxy.test":
            return httpx.Response(200, json={"partitions": 1, "configs": {}})
        return httpx.Response(401, json={"message": "unauthorized"})

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        schema_registry_url="http://schema.test",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(WorkflowError, match="HTTP 401"):
        reader.list_topics()
    reader.close()


def test_kafka_http_source_wires_mocked_transport() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/topics"):
            return httpx.Response(200, json=["orders"])
        return httpx.Response(200, json={"partitions": 4, "configs": {}})

    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="events",
            connection={"restProxyUrl": "http://proxy.test"},
        ),
        transport=httpx.MockTransport(handler),
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].name == "orders"
    assert topics[0].partitions == 4


def test_kafka_stores_sasl_only_when_opt_in() -> None:
    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="events",
            connection={
                "bootstrapServers": "broker:9092",
                "saslUsername": "u",
                "saslPassword": "p",
            },
            store_connection_secrets=True,
        ),
        reader=SequenceTopicReader([]),
    )
    service = next(iter(source.produce()))
    assert isinstance(service, MessagingServiceRecord)
    assert service.connection["config"]["saslUsername"] == "u"
    assert service.connection["config"]["saslPassword"] == "p"


def test_confluent_http_reader_accepts_object_topics_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/topics"):
            return httpx.Response(
                200, json={"data": [{"topic_name": "orders"}, {"name": "payments"}]}
            )
        return httpx.Response(200, text="")

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        transport=httpx.MockTransport(handler),
    )
    names = [row.name for row in reader.list_topics()]
    reader.close()
    assert names == ["orders", "payments"]


def test_kafka_bootstrap_without_extra_fails() -> None:
    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="events",
            connection={"bootstrapServers": "broker:9092"},
        )
    )
    with pytest.raises(WorkflowError, match="smartmetadata-ingestion\\[kafka\\]"):
        list(source.produce())


def test_kafka_requires_discovery_endpoint() -> None:
    source = KafkaSource(SourceConfig(type="kafka", service_name="events", connection={}))
    with pytest.raises(WorkflowError, match="restProxyUrl"):
        list(source.produce())


def test_http_reader_rejects_bad_topics_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json="nope")

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(WorkflowError, match="did not return a list"):
        reader.list_topics()
    reader.close()


def test_http_reader_rejects_empty_proxy_and_http_errors() -> None:
    with pytest.raises(WorkflowError, match="restProxyUrl"):
        ConfluentHttpTopicReader(rest_proxy_url="   ")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    reader = ConfluentHttpTopicReader(
        rest_proxy_url="http://proxy.test",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(WorkflowError, match="HTTP 500"):
        reader.list_topics()
    reader.close()


def test_kafka_sampler_sequence_behavior_matched() -> None:
    source = KafkaSource(
        SourceConfig(type="kafka", service_name="k", connection={"bootstrapServers": "localhost:9092"}),
        reader=SequenceTopicReader(),
        sampler=SequenceTopicMessageSampler(samples={"orders": [{"id": 1}, {"id": 2}]}),
    )
    rows = source.sampler().sample(topic="orders", limit=1)
    assert rows == [{"id": 1}]


def test_kafka_sampler_without_injectable_is_honest_partial() -> None:
    sampler = KafkaSampler(
        SourceConfig(type="kafka", service_name="k", connection={"bootstrapServers": "localhost:9092"})
    )
    with pytest.raises(WorkflowError, match="Partial"):
        sampler.sample(topic="orders")


def test_kafka_connection_supports_profiler_flag() -> None:
    source = KafkaSource(
        SourceConfig(
            type="kafka",
            service_name="k",
            connection={
                "bootstrapServers": "localhost:9092",
                "supportsProfiler": True,
                "securityProtocol": "PLAINTEXT",
            },
        ),
        reader=SequenceTopicReader(),
    )
    service = next(iter(source.produce()))
    assert service.connection["config"]["supportsProfiler"] is True
    assert service.connection["config"]["securityProtocol"] == "PLAINTEXT"
