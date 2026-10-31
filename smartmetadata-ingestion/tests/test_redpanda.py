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
from smartmetadata_ingestion.connectors.kafka import SequenceTopicReader, TopicRow
from smartmetadata_ingestion.connectors.redpanda import (
    RedpandaSampler,
    RedpandaSource,
    SequenceTopicMessageSampler,
)
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import MessagingServiceRecord, TopicRecord


def test_redpanda_source_emits_service_and_topics() -> None:
    source = RedpandaSource(
        SourceConfig(
            type="redpanda",
            service_name="rp-events",
            connection={
                "bootstrapServers": "redpanda:9092",
                "schemaRegistryURL": "http://schema:8081",
                "securityProtocol": "PLAINTEXT",
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
    assert service.service_type == "Redpanda"
    assert service.connection["config"]["type"] == "Redpanda"
    assert service.connection["config"]["bootstrapServers"] == "redpanda:9092"
    assert service.connection["config"]["securityProtocol"] == "PLAINTEXT"
    assert "saslPassword" not in service.connection["config"]
    topics = [record for record in records if isinstance(record, TopicRecord)]
    assert [topic.name for topic in topics] == ["orders", "payments"]
    assert topics[0].partitions == 3
    assert topics[0].message_schema["schemaType"] == "Avro"


def test_redpanda_sampler_sequence_behavior_matched() -> None:
    source = RedpandaSource(
        SourceConfig(type="redpanda", service_name="rp", connection={"bootstrapServers": "b:9092"}),
        reader=SequenceTopicReader([]),
        sampler=SequenceTopicMessageSampler(
            samples={"orders": [{"offset": 1, "value": {"id": 7}}, {"offset": 2, "value": {"id": 8}}]}
        ),
    )
    rows = source.sampler().sample(topic="orders", limit=1)
    assert rows == [{"offset": 1, "value": {"id": 7}}]


def test_redpanda_sampler_without_injectable_is_honest_partial() -> None:
    sampler = RedpandaSampler(
        SourceConfig(type="redpanda", service_name="rp", connection={"bootstrapServers": "b:9092"})
    )
    with pytest.raises(WorkflowError, match="Partial"):
        sampler.sample(topic="orders")


def test_redpanda_http_source_wires_mocked_transport() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/topics"):
            return httpx.Response(200, json=["orders"])
        return httpx.Response(200, json={"partitions": 4, "configs": {}})

    source = RedpandaSource(
        SourceConfig(
            type="redpanda",
            service_name="rp-events",
            connection={"restProxyUrl": "http://proxy.test", "bootstrapServers": "b:9092"},
        ),
        transport=httpx.MockTransport(handler),
    )
    topics = [record for record in source.produce() if isinstance(record, TopicRecord)]
    assert topics[0].name == "orders"
    assert topics[0].partitions == 4


def test_redpanda_stores_sasl_only_when_opt_in() -> None:
    source = RedpandaSource(
        SourceConfig(
            type="redpanda",
            service_name="rp",
            connection={
                "bootstrapServers": "broker:9092",
                "saslUsername": "u",
                "saslPassword": "p",
                "basicAuthUserInfo": "u:p",
            },
            store_connection_secrets=True,
        ),
        reader=SequenceTopicReader([]),
    )
    service = next(iter(source.produce()))
    assert isinstance(service, MessagingServiceRecord)
    assert service.connection["config"]["saslUsername"] == "u"
    assert service.connection["config"]["saslPassword"] == "p"
    assert service.connection["config"]["basicAuthUserInfo"] == "u:p"


def test_redpanda_prepare_lists_topics() -> None:
    source = RedpandaSource(
        SourceConfig(type="redpanda", service_name="rp", connection={"bootstrapServers": "b:9092"}),
        reader=SequenceTopicReader([TopicRow(name="t1")]),
    )
    source.prepare()


def test_redpanda_bootstrap_without_extra_fails() -> None:
    source = RedpandaSource(
        SourceConfig(
            type="redpanda",
            service_name="rp",
            connection={"bootstrapServers": "broker:9092"},
        )
    )
    with pytest.raises(WorkflowError, match="smartmetadata-ingestion\\[kafka\\]"):
        list(source.produce())


def test_redpanda_requires_discovery_endpoint() -> None:
    source = RedpandaSource(SourceConfig(type="redpanda", service_name="rp", connection={}))
    with pytest.raises(WorkflowError, match="bootstrapServers"):
        list(source.produce())


def test_registry_loads_redpanda() -> None:
    from smartmetadata_ingestion.connectors.registry import registered_source_types

    load_builtin_sources()
    assert "redpanda" in registered_source_types()
    source = get_source(
        "redpanda",
        SourceConfig(type="redpanda", service_name="rp", connection={"bootstrapServers": "b:9092"}),
        reader=SequenceTopicReader([]),
    )
    assert isinstance(source, RedpandaSource)
