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

import pytest

from smartmetadata_airflow_apis.workflows.translation import (
    TranslationError,
    ignored_source_switches,
    translate_filter_pattern,
    translate_pipeline,
)

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


# -- P-11: regex FilterPattern passthrough ----------------------------------
# Patterns travel verbatim into the WorkflowConfig; only malformed
# structure (N-10/N-11) fails at parse time.

def test_filter_pattern_passes_regex_through() -> None:
    includes, excludes = translate_filter_pattern(
        {"includes": ["^fact_.*$"], "excludes": ["^tmp_.*$"]}
    )
    assert includes == ["^fact_.*$"]
    assert excludes == ["^tmp_.*$"]


def test_filter_pattern_malformed_still_fails() -> None:
    with pytest.raises(TranslationError):
        translate_filter_pattern("prod.*")  # N-10
    with pytest.raises(TranslationError):
        translate_filter_pattern({"includes": "prod.*"})  # N-11


def test_metadata_table_pattern_and_include_views_pass_through() -> None:
    config = _translate(
        _pipeline(
            service_type="databaseService",
            config={
                "tableFilterPattern": {"includes": ["^fact_.*$"]},
                "includeViews": False,
            },
        )
    )
    assert config.source.include_tables == ["^fact_.*$"]
    assert config.source.include_views is False


def test_ignored_source_switches_lists_all() -> None:
    pipeline = _pipeline(
        service_type="databaseService",
        config={
            "generateSampleData": True,
            "storeSampleData": True,
            "sampleDataQuery": "SELECT 1",
            "enableDataProfiler": True,
        },
    )
    assert ignored_source_switches(pipeline) == [
        "generateSampleData",
        "storeSampleData",
        "sampleDataQuery",
        "enableDataProfiler",
    ]


def test_ignored_source_switches_messaging_keeps_sampler() -> None:
    # generateSampleData reaches the runner for messaging; only the
    # switches with no runner capability are ignored there.
    pipeline = _pipeline(
        config={"generateSampleData": True, "sampleDataQuery": "SELECT 1"}
    )
    assert ignored_source_switches(pipeline) == ["sampleDataQuery"]


# -- P-06: testSuite translation ---------------------------------------------
# The connection is derived at parse time from the suite table's service;
# the table fetch runs for real here, the service fetch is the stub seam.

def _test_suite_pipeline(**config_overrides) -> dict[str, Any]:
    config: dict[str, Any] = {
        "entityFullyQualifiedName": "warehouse.analytics.public.orders",
        "testCases": ["orders_email_not_null"],
    }
    config.update(config_overrides)
    pipeline = _pipeline(service_type="testSuite")
    pipeline["service"] = {"type": "testSuite", "name": "suite-1"}
    pipeline["sourceConfig"] = {"config": config}
    return pipeline


class _TableRest:
    def __init__(self, service_name: str = "warehouse") -> None:
        self.service_name = service_name

    def get_table_by_name(self, fqn: str, *, fields=None):
        assert fqn == "warehouse.analytics.public.orders"
        return {"service": {"id": "svc-1", "name": self.service_name}}


def test_test_suite_derives_connection_from_table_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    seen: dict[str, Any] = {}

    def fake_fetch(pipeline: dict[str, Any], client=None):
        seen["service"] = pipeline["service"]
        return ({"type": "Postgres", "hostPort": "localhost:5432"}, "Postgres")

    monkeypatch.setattr(translation, "fetch_service_connection", fake_fetch)
    config = translate_pipeline(
        _test_suite_pipeline(), workflow_type="TestSuite", server_client=_TableRest()
    )
    # The derived pipeline carries the table's service, not the testSuite one.
    assert seen["service"] == {"name": "warehouse", "type": "databaseService"}
    assert config.workflow.type == "TestSuite"
    assert config.source.type == "postgres"
    assert (
        config.source.entity_fully_qualified_name
        == "warehouse.analytics.public.orders"
    )
    assert config.source.test_case_names == ["orders_email_not_null"]


def test_test_suite_lowercase_workflow_type_normalizes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: ({"type": "Postgres"}, "Postgres"),
    )
    config = translate_pipeline(
        _test_suite_pipeline(), workflow_type="testSuite", server_client=_TableRest()
    )
    assert config.workflow.type == "TestSuite"


def test_test_suite_case_names_normalize_dict_entries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: ({"type": "Postgres"}, "Postgres"),
    )
    config = translate_pipeline(
        _test_suite_pipeline(
            testCases=[
                {"fullyQualifiedName": "warehouse.analytics.public.orders.orders_email_not_null"},
                "other_case",
            ]
        ),
        workflow_type="TestSuite",
        server_client=_TableRest(),
    )
    assert config.source.test_case_names == ["orders_email_not_null", "other_case"]


def test_test_suite_without_entity_fqn_fails_loudly() -> None:
    pipeline = _test_suite_pipeline()
    pipeline["sourceConfig"] = {"config": {}}
    with pytest.raises(TranslationError, match="entityFullyQualifiedName"):
        translate_pipeline(pipeline, workflow_type="TestSuite", server_client=_TableRest())


# -- P-39: JWT resolution at parse time --------------------------------------
# A secret: reference resolves to the Bearer here; an unregistered
# provider fails loudly instead of sending the literal reference.


def test_server_config_resolves_secret_reference() -> None:
    from smartmetadata_ingestion.secrets import (
        register_secret_resolver,
        reset_secret_resolvers,
    )

    register_secret_resolver("aws", lambda secret_id, loader: "resolved-token")
    try:
        pipeline = _pipeline()
        pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"] = (
            "secret:/super/secret"
        )
        pipeline["openMetadataServerConnection"]["secretsManagerProvider"] = "aws"
        config = _translate(pipeline)
        assert config.server.auth.jwt_token == "resolved-token"
    finally:
        reset_secret_resolvers()


def test_server_config_unregistered_provider_fails_loudly() -> None:
    pipeline = _pipeline()
    pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"] = (
        "secret:/super/secret"
    )
    pipeline["openMetadataServerConnection"]["secretsManagerProvider"] = "aws"
    with pytest.raises(TranslationError):
        _translate(pipeline)
