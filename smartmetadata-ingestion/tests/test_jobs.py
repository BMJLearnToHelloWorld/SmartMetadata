# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import httpx

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    TestCaseSpec,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
)
from smartmetadata_ingestion.connectors.postgres_common import (
    ProfileStatRow,
    SequenceProfileReader,
)
from smartmetadata_ingestion.jobs import ProfilerJob, QualityJob
from smartmetadata_ingestion.records import ProfileRecord, TestCaseResultRecord
from test_profiler_workflow import CollectingSink, StubSource


def _client(config: WorkflowConfig) -> RestClient:
    return RestClient(
        config.server,
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
    )


def _config(*, test_cases: list[TestCaseSpec] | None = None) -> WorkflowConfig:
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse", type="metadata"),
        server=ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="jwt", jwt_token="bot-token"),
        ),
        source=SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"database": "analytics"},
        ),
        test_cases=test_cases or [],
    )


def test_profiler_job_runs_profiler_workflow() -> None:
    sink = CollectingSink()
    source = PostgresSource(
        SourceConfig(
            type="postgres", service_name="warehouse", connection={"database": "analytics"}
        ),
        reader=SequenceCatalogReader(
            schemas=[SchemaRow("public")],
            tables=[TableRow("public", "orders", "BASE TABLE")],
            columns=[ColumnRow("public", "orders", "id", "integer", 1)],
        ),
    )
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=4),
            ProfileStatRow("id", null_count=0, distinct_count=4, min_value="1", max_value="4"),
        ]
    )
    config = _config()
    report = ProfilerJob(
        config, client=_client(config), source=source, sink=sink, profile_reader=reader
    ).run()
    assert report.ok()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], ProfileRecord)
    assert sink.written[0].table_profile["rowCount"] == 4


def test_quality_job_runs_test_suite_workflow() -> None:
    sink = CollectingSink()
    config = _config(
        test_cases=[
            TestCaseSpec(test_case_fqn="suite.case", expression="SELECT 1", expected=1),
        ]
    )
    report = QualityJob(
        config, client=_client(config), source=StubSource(), sink=sink, execute=lambda sql: 1
    ).run()
    assert report.ok()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], TestCaseResultRecord)
    assert sink.written[0].test_case_status == "Success"


def test_jobs_force_their_workflow_type() -> None:
    """A job runs its own workflow type even when the config says metadata."""
    sink = CollectingSink()
    config = _config(
        test_cases=[
            TestCaseSpec(test_case_fqn="suite.case", expression="SELECT 1", expected=1),
        ]
    )
    assert config.workflow.type == "metadata"
    QualityJob(
        config, client=_client(config), source=StubSource(), sink=sink, execute=lambda sql: 1
    ).run()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], TestCaseResultRecord)
