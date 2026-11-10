# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""H track 1: translate_pipeline carries the sampler flag for messaging."""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.translation import translate_pipeline

KAFKA_CONNECTION = {
    "type": "Kafka",
    "bootstrapServers": "broker:9092",
}


def _pipeline(
    service_type: str = "messagingService",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "name": "kafka_meta",
        "fullyQualifiedName": "events.kafka_meta",
        "pipelineType": "metadata",
        "service": {"type": service_type, "name": "events"},
        "sourceConfig": {"config": config or {}},
        "openMetadataServerConnection": {
            "hostPort": "http://127.0.0.1:8585/api",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
        "airflowConfig": {},
    }


def _translate(pipeline: dict[str, Any]):
    return translate_pipeline(
        pipeline,
        workflow_type="metadata",
        service_connection=(dict(KAFKA_CONNECTION), "Kafka"),
    )


def test_messaging_generate_sample_data_carried() -> None:
    config = _translate(_pipeline(config={"generateSampleData": True}))
    assert config.source.type == "kafka"
    assert config.source.messaging_metadata is not None
    assert config.source.messaging_metadata.generate_sample_data is True


def test_messaging_legacy_store_sample_data_carried() -> None:
    config = _translate(_pipeline(config={"storeSampleData": True}))
    assert config.source.messaging_metadata is not None
    assert config.source.messaging_metadata.store_sample_data is True
    assert config.source.messaging_metadata.generate_sample_data is False


def test_messaging_without_flag_has_no_messaging_metadata() -> None:
    config = _translate(_pipeline(config={"topicFilterPattern": {"includes": ["orders"]}}))
    assert config.source.messaging_metadata is None


def test_non_messaging_flag_is_ignored(caplog) -> None:
    # A database pipeline has no generateSampleData in the official schema;
    # the flag stays ignored (warned) instead of leaking into the runner.
    with caplog.at_level("WARNING"):
        config = _translate(
            _pipeline(
                service_type="databaseService",
                config={"generateSampleData": True},
            )
        )
    assert config.source.messaging_metadata is None
    assert "ignoring generateSampleData" in caplog.text


def test_messaging_sample_data_query_still_warns(caplog) -> None:
    with caplog.at_level("WARNING"):
        config = _translate(
            _pipeline(
                config={
                    "generateSampleData": True,
                    "sampleDataQuery": "SELECT * FROM t",
                }
            )
        )
    assert config.source.messaging_metadata is not None
    assert config.source.messaging_metadata.generate_sample_data is True
    assert "sampleDataQuery is not supported" in caplog.text
