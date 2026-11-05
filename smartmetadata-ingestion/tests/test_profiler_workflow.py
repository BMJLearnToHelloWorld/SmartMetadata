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
from smartmetadata_ingestion.errors import WorkflowInitializationError
from smartmetadata_ingestion.jobs import ProfilerJob, QualityJob
from smartmetadata_ingestion.records import ProfileRecord, TestCaseResultRecord
from smartmetadata_ingestion.runner import run_workflow


class CollectingSink:
    def __init__(self) -> None:
        self.written: list = []

    def write(self, record) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None


class StubSource:
    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self):
        return iter(())


def _client(config: WorkflowConfig) -> RestClient:
    return RestClient(
        config.server,
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
    )


def _config(*, type: str, test_cases: list[TestCaseSpec] | None = None) -> WorkflowConfig:
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-profiler", type=type),
        server=ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="jwt", jwt_token="bot-token"),
        ),
        source=SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "ingest",
                "password": "secret",
                "database": "analytics",
            },
            include_schemas=["public"],
        ),
        test_cases=test_cases or [],
    )


def _postgres_source() -> PostgresSource:
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("public")],
        tables=[TableRow("public", "orders", "BASE TABLE")],
        columns=[
            ColumnRow("public", "orders", "id", "integer", 1),
            ColumnRow("public", "orders", "total", "double precision", 2),
        ],
    )
    return PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={"database": "analytics"},
        ),
        reader=reader,
    )


def _profile_reader() -> SequenceProfileReader:
    return SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=10),
            ProfileStatRow(
                "id", null_count=0, distinct_count=10, min_value="1", max_value="10", mean=5.5
            ),
            ProfileStatRow(
                "total", null_count=1, distinct_count=9, min_value="0.5", max_value="99.5"
            ),
        ]
    )


def test_profiler_workflow_profiles_tables_and_writes_nothing_else() -> None:
    sink = CollectingSink()
    config = _config(type="profiler")
    report = run_workflow(
        config,
        client=_client(config),
        source=_postgres_source(),
        sink=sink,
        profile_reader=_profile_reader(),
    )
    assert report.ok()
    assert report.succeeded == 1
    assert len(sink.written) == 1
    profile = sink.written[0]
    assert isinstance(profile, ProfileRecord)
    assert profile.fqn == "warehouse.analytics.public.orders"
    assert profile.table_profile["rowCount"] == 10
    assert [column["name"] for column in profile.column_profile] == ["id", "total"]
    assert profile.column_profile[0]["mean"] == 5.5


def test_testsuite_workflow_runs_cases_and_reports_status() -> None:
    sink = CollectingSink()
    config = _config(
        type="TestSuite",
        test_cases=[
            TestCaseSpec(test_case_fqn="suite.case_pass", expression="SELECT 1", expected=1),
            TestCaseSpec(test_case_fqn="suite.case_fail", expression="SELECT 2", expected=1),
        ],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        execute=lambda sql: int(sql.rsplit(" ", 1)[-1]),
    )
    assert report.ok()
    assert report.succeeded == 2
    assert len(sink.written) == 2
    assert all(isinstance(item, TestCaseResultRecord) for item in sink.written)
    assert sink.written[0].test_case_status == "Success"
    assert sink.written[1].test_case_status == "Failed"


def test_profiler_workflow_rejects_source_without_binding() -> None:
    config = _config(type="profiler")
    config.source = SourceConfig(type="kafka", service_name="events")
    with pytest.raises(WorkflowInitializationError, match="no binding"):
        run_workflow(config, client=_client(config), source=StubSource(), sink=CollectingSink())


def test_metadata_dispatch_still_runs_metadata_workflow() -> None:
    sink = CollectingSink()
    config = _config(type="metadata")
    report = run_workflow(config, client=_client(config), source=_postgres_source(), sink=sink)
    assert report.ok()
    assert len(sink.written) == 4  # service, database, schema, table
    assert not any(isinstance(item, ProfileRecord) for item in sink.written)


def test_profiler_job_runs_profiler_workflow() -> None:
    sink = CollectingSink()
    config = _config(type="metadata")
    report = ProfilerJob(
        config,
        client=_client(config),
        source=_postgres_source(),
        sink=sink,
        profile_reader=_profile_reader(),
    ).run()
    assert report.ok()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], ProfileRecord)


def test_quality_job_runs_test_suite_workflow() -> None:
    sink = CollectingSink()
    config = _config(
        type="metadata",
        test_cases=[
            TestCaseSpec(test_case_fqn="suite.case", expression="SELECT 1", expected=1),
        ],
    )
    report = QualityJob(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        execute=lambda sql: 1,
    ).run()
    assert report.ok()
    assert len(sink.written) == 1
    assert sink.written[0].test_case_status == "Success"
