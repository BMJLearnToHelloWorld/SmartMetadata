# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unit tests for the step-6 workflow builders.

Builds real DAG objects (no scheduler, no DB): the product equivalent of
official ``test_workflow_creation.py`` (ingestion/usage/lineage/profiler
workflow configs build). The service-connection fetch is the only seam
patched: it is an HTTP boundary (the stub server in the live gate answers
it for real).

Types with no builder (dataInsight, policyAgent, reverseMetadata) are
asserted absent on purpose — ruling §4.2 records why each has no product
execution mapping; the absence is the documented behaviour, not a gap in
this file. P-06 added builders for TestSuite, dbt, elasticSearchReindex,
application and autoClassification; the first four run the metadata
workflow against the live service (a deliberate partial mapping — see
ADR:2026-11-11-pipeline-deep-dive-python) and only testSuite has its own
execution path.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import pytest

import smartmetadata_airflow_apis.workflows.common as common_module
from smartmetadata_airflow_apis.run_id import clean_dag_id, pipeline_run_id
from smartmetadata_airflow_apis.workflows import builders  # noqa: F401  (registers builders)
from smartmetadata_airflow_apis.workflows.registry import get_builder, registered_types
from smartmetadata_airflow_apis.workflows.translation import TranslationError

CONNECTION = {
    "type": "MySQL",
    "hostPort": "127.0.0.1:3306",
    "username": "stub",
    "password": "stub",
}


def _pipeline(
    name: str = "my_pipeline",
    pipeline_type: str = "metadata",
    **overrides: Any,
) -> dict[str, Any]:
    # Entity form (ruling §3.1, fix-round): sourceConfig lives at the
    # top level and the service is an entity reference; there is no
    # top-level "source" — the official deploy route parses the payload
    # as the IngestionPipeline entity.
    pipeline: dict[str, Any] = {
        "name": name,
        "fullyQualifiedName": f"svc.{name}",
        "pipelineType": pipeline_type,
        "description": "",
        "service": {"type": "databaseService", "name": "svc"},
        "sourceConfig": {"config": {}},
        "openMetadataServerConnection": {
            "hostPort": "http://127.0.0.1:8585/api",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
        "airflowConfig": {},
    }
    pipeline.update(overrides)
    return pipeline


@pytest.fixture(autouse=True)
def _stub_service_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    # The stub returns what the live fetch returns: the connection
    # config plus the service entity's serviceType (ruling §3.3).
    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: (dict(CONNECTION), "Mysql"),
    )


def _task(dag: Any, task_id: str) -> Any:
    return dag.get_task(task_id)


def test_metadata_builder_keeps_pipeline_raise_on_error() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("metadata")
    assert builder is not None
    dag = builder(_pipeline(raiseOnError=True))
    task = _task(dag, "ingestion_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "metadata"
    assert task._workflow_config["workflow"]["fail_fast"] is True
    assert task._workflow_config["source"]["type"] == "mysql"


def test_profiler_builder_omits_raise_on_error() -> None:
    pytest.importorskip("airflow")
    # Official profiler WorkflowConfig omits raiseOnError: even a pipeline
    # carrying raiseOnError=true must not fail the task (ruling §4.2).
    builder = get_builder("profiler")
    assert builder is not None
    dag = builder(_pipeline("prof_pipeline", "profiler", raiseOnError=True))
    assert dag.dag_id == "prof_pipeline"
    task = _task(dag, "profiler_task")
    assert task._raise_on_error is False
    assert task._workflow_config["workflow"]["type"] == "profiler"
    assert task._workflow_config["workflow"]["fail_fast"] is False
    assert task._workflow_config["source"]["type"] == "mysql"


def test_usage_builder_suffixes_source_type() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("usage")
    assert builder is not None
    dag = builder(_pipeline("usage_pipeline", "usage", raiseOnError=True))
    task = _task(dag, "usage_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "usage"
    assert task._workflow_config["workflow"]["fail_fast"] is True
    assert task._workflow_config["source"]["type"] == "mysql-usage"


def test_lineage_builder_suffixes_source_type() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("lineage")
    assert builder is not None
    dag = builder(_pipeline("lineage_pipeline", "lineage"))
    task = _task(dag, "lineage_task")
    assert task._raise_on_error is False
    assert task._workflow_config["workflow"]["type"] == "lineage"
    assert task._workflow_config["source"]["type"] == "mysql-lineage"


def test_source_type_falls_back_to_connection_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Ruling §3.3: the source type comes from the live service entity's
    # serviceType first; when the entity carries none, the connection
    # config's type is the fallback ("MySQL" -> "mysql").
    pytest.importorskip("airflow")
    import smartmetadata_airflow_apis.workflows.translation as translation

    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: (dict(CONNECTION), None),
    )
    builder = get_builder("metadata")
    assert builder is not None
    dag = builder(_pipeline("fallback_demo", "metadata"))
    assert _task(dag, "ingestion_task")._workflow_config["source"]["type"] == "mysql"


def test_source_type_missing_everywhere_fails_loudly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Ruling §3.3: neither a serviceType nor a connection type means the
    # pipeline cannot be expressed — fail loudly instead of silently
    # building a "None" source (the old workflow-config bug).
    pytest.importorskip("airflow")
    import smartmetadata_airflow_apis.workflows.translation as translation

    typeless = {
        "hostPort": "127.0.0.1:3306",
        "username": "stub",
        "password": "stub",
    }
    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: (dict(typeless), None),
    )
    builder = get_builder("metadata")
    assert builder is not None
    with pytest.raises(TranslationError):
        builder(_pipeline("typeless_demo", "metadata"))


def test_no_builder_for_unmapped_types() -> None:
    # Ruling §4.2: no product execution mapping exists for these types yet;
    # deploy fails 400 at validation instead of running something invented
    # (P-32). The five P-06 types now have builders (see below).
    for pipeline_type in (
        "dataInsight",
        "policyAgent",
        "reverseMetadata",
    ):
        assert get_builder(pipeline_type) is None, pipeline_type


def test_registered_types() -> None:
    assert registered_types() == (
        "TestSuite",
        "application",
        "autoClassification",
        "dbt",
        "elasticSearchReindex",
        "lineage",
        "metadata",
        "profiler",
        "usage",
    )


# --- P-06: the five new builders -------------------------------------------
# Each builder uses the official task name and translate_pipeline for the
# WorkflowConfig. The four non-testSuite builders pass no raiseOnError
# override: the pipeline's own value flows through.


def _test_suite_pipeline() -> dict[str, Any]:
    pipeline = _pipeline("suite_demo", "TestSuite")
    pipeline["service"] = {"type": "testSuite", "name": "suite-1"}
    pipeline["sourceConfig"] = {
        "config": {
            "entityFullyQualifiedName": "warehouse.analytics.public.orders",
            "testCases": ["orders_email_not_null"],
        }
    }
    return pipeline


def _stub_test_suite_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    # The derivation (table -> service -> connection) is covered in
    # test_translation.py; the builder tests only need its outcome.
    monkeypatch.setattr(
        translation,
        "_test_suite_service_connection",
        lambda pipeline, server_client=None: (dict(CONNECTION), "Mysql"),
    )


def test_dbt_builder_uses_official_task_name() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("dbt")
    assert builder is not None
    dag = builder(_pipeline("dbt_demo", "dbt", raiseOnError=True))
    task = _task(dag, "dbt_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "dbt"
    assert task._workflow_config["source"]["type"] == "mysql"


def test_auto_classification_builder_uses_official_task_name() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("autoClassification")
    assert builder is not None
    dag = builder(_pipeline("ac_demo", "autoClassification", raiseOnError=True))
    task = _task(dag, "auto_classification_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "autoClassification"
    assert task._workflow_config["source"]["type"] == "mysql"


def test_es_reindex_builder_uses_official_task_name() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("elasticSearchReindex")
    assert builder is not None
    dag = builder(_pipeline("es_demo", "elasticSearchReindex", raiseOnError=True))
    task = _task(dag, "elasticsearch_reindex_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "elasticSearchReindex"
    assert task._workflow_config["source"]["type"] == "mysql"


def test_application_builder_uses_official_task_name() -> None:
    pytest.importorskip("airflow")
    builder = get_builder("application")
    assert builder is not None
    dag = builder(_pipeline("app_demo", "application", raiseOnError=True))
    task = _task(dag, "application_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "application"
    assert task._workflow_config["source"]["type"] == "mysql"


def test_test_suite_builder_omits_raise_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("airflow")
    _stub_test_suite_connection(monkeypatch)
    builder = get_builder("TestSuite")
    assert builder is not None
    dag = builder(_test_suite_pipeline())
    task = _task(dag, "test_suite_task")
    # Profiler precedent: a testSuite pipeline carrying raiseOnError=true
    # must not fail the task on a case failure.
    assert task._raise_on_error is False
    assert task._workflow_config["workflow"]["type"] == "TestSuite"
    assert task._workflow_config["workflow"]["fail_fast"] is False
    assert task._workflow_config["source"]["type"] == "mysql"
    # The dumped config uses snake_case keys (model_dump(mode="json")).
    assert (
        task._workflow_config["source"]["entity_fully_qualified_name"]
        == "warehouse.analytics.public.orders"
    )
    assert task._workflow_config["source"]["test_case_names"] == [
        "orders_email_not_null"
    ]


# --- P-02: failure callback preserves the stored status --------------------
# The callback fetches the stored row and only flips pipelineState +
# endDate; the steps, startDate and counts the workflow wrote stay. A
# 404 (or a client without the getter) falls back to the bare build.


def test_failed_status_payload_preserves_stored_status() -> None:
    run_id = str(uuid.uuid4())
    stored = {
        "runId": run_id,
        "pipelineState": "partialSuccess",
        "startDate": 1000,
        "timestamp": 1000,
        "triggeredBy": "admin",
        "status": [{"name": "ingest", "executionStatus": "successful"}],
    }

    class FakeRest:
        def get_pipeline_status(self, fqn: str, rid: str) -> dict:
            return dict(stored)

    payload = common_module._failed_status_payload(
        FakeRest(), "svc.kill_demo", run_id, start_ms=2000
    )
    assert payload["pipelineState"] == "failed"
    assert payload["startDate"] == 1000
    assert payload["timestamp"] == 1000
    assert payload["status"] == stored["status"]
    assert "triggeredBy" not in payload
    assert payload["endDate"] >= 2000
    assert payload["runId"] == run_id


def test_failed_status_payload_falls_back_on_fetch_error() -> None:
    from smartmetadata_ingestion.errors import RestError

    run_id = str(uuid.uuid4())

    class FailingRest:
        def get_pipeline_status(self, fqn: str, rid: str) -> dict:
            raise RestError("not found", status_code=404)

    payload = common_module._failed_status_payload(
        FailingRest(), "svc.kill_demo", run_id, start_ms=2000
    )
    assert payload["pipelineState"] == "failed"
    assert payload["startDate"] == 2000
    # The bare fallback carries no steps at all — there is nothing to
    # preserve, so no "status" key is written.
    assert "status" not in payload
    assert "triggeredBy" not in payload


def test_failed_status_payload_falls_back_without_getter() -> None:
    # An old stub client without get_pipeline_status keeps working.
    run_id = str(uuid.uuid4())
    payload = common_module._failed_status_payload(
        object(), "svc.kill_demo", run_id, start_ms=2000
    )
    assert payload["pipelineState"] == "failed"
    assert payload["startDate"] == 2000


# --- P-06: testSuite translated config executes ----------------------------
# The full translate -> run chain, against a MockTransport-backed server:
# the derivation (table -> service -> connection) runs for real, and the
# translated config executes the not-null case without a 500.


def test_test_suite_translated_config_executes() -> None:
    pytest.importorskip("airflow")
    import httpx

    from smartmetadata_ingestion.client.rest import RestClient
    from smartmetadata_ingestion.config import AuthConfig, ServerConfig
    from smartmetadata_ingestion.runner import run_workflow
    from smartmetadata_airflow_apis.workflows.translation import translate_pipeline

    table_entity = {
        "id": "table-1",
        "name": "orders",
        "fullyQualifiedName": "warehouse.analytics.public.orders",
        "service": {"id": "svc-1", "name": "warehouse"},
        "database": {"name": "analytics"},
        "databaseSchema": {"name": "public"},
        "columns": [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
        ],
        "testSuite": {"id": "suite-1", "type": "testSuite"},
    }
    case_payload = {
        "id": "case-orders_email_not_null",
        "name": "orders_email_not_null",
        "fullyQualifiedName": "warehouse.analytics.public.orders.orders_email_not_null",
        "entityLink": "<#E::table::warehouse.analytics.public.orders::columns::email>",
        "testDefinition": {"fullyQualifiedName": "columnValuesToBeNotNull"},
        "parameterValues": [],
        "testSuite": {"id": "suite-1", "type": "testSuite"},
    }
    service_entity = {
        "id": "svc-1",
        "name": "warehouse",
        "serviceType": "Postgres",
        "connection": {
            "config": {
                "type": "Postgres",
                "hostPort": "localhost:5432",
                "username": "ingest",
                "password": "secret",
                "database": "analytics",
            }
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/tables/name/warehouse.analytics.public.orders"):
            return httpx.Response(200, json=table_entity)
        if path.endswith("/services/databaseServices/name/warehouse"):
            return httpx.Response(200, json=service_entity)
        if path.endswith("/dataQuality/testSuites/suite-1"):
            return httpx.Response(200, json={"id": "suite-1", "name": "s"})
        if path.endswith("/dataQuality/testCases"):
            return httpx.Response(200, json={"data": [case_payload]})
        return httpx.Response(200, json={})

    server = ServerConfig(
        host_port="http://127.0.0.1:8585/api",
        auth=AuthConfig(type="jwt", jwt_token="test-jwt"),
    )
    client = RestClient(server, transport=httpx.MockTransport(handler))

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

    def execute(sql: str):
        if "IS NULL" in sql:
            return 0
        if "COUNT(*)" in sql:
            return 10
        raise AssertionError(f"unexpected SQL: {sql}")

    config = translate_pipeline(
        _test_suite_pipeline(), workflow_type="TestSuite", server_client=client
    )
    sink = CollectingSink()
    report = run_workflow(
        config, client=client, source=StubSource(), sink=sink, execute=execute
    )
    assert report.failed == 0
    assert len(sink.written) == 1
    record = sink.written[0]
    assert record.test_case_fqn == "warehouse.analytics.public.orders.orders_email_not_null"
    assert record.test_case_status == "Success"
    client.close()


# --- on_kill writeback (ruling §1.5.3, fix-round B-2) --------------------
# Airflow calls on_kill with no context, so the run id must come from the
# instance state _run stored. The official operator writes the id back
# into the shared workflow_config.pipelineRunId for the same reason.


def _fake_dag_run(run_id: str) -> Any:
    return SimpleNamespace(
        conf={"pipelineRunId": run_id},
        run_id="manual__2026-11-06T00:00:00+00:00",
    )


def _metadata_task() -> Any:
    pytest.importorskip("airflow")
    builder = get_builder("metadata")
    assert builder is not None
    dag = builder(_pipeline("kill_demo", "metadata"))
    return _task(dag, "ingestion_task")


def test_on_kill_writes_back_failed_under_resolved_run_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task = _metadata_task()
    run_id = str(uuid.uuid4())
    writebacks: list[tuple[str, dict]] = []
    runner_calls: list[dict] = []

    def fake_run(config: dict, rid: str, raise_on_error: bool) -> None:
        runner_calls.append(config)

    class FakeRestClient:
        def __init__(self, server: Any) -> None:
            pass

        def add_pipeline_status(self, fqn: str, payload: dict) -> None:
            writebacks.append((fqn, payload))

        def close(self) -> None:
            pass

    monkeypatch.setattr(common_module, "run_pipeline_workflow", fake_run)
    monkeypatch.setattr(
        "smartmetadata_ingestion.client.rest.RestClient", FakeRestClient
    )
    task._run(dag_run=_fake_dag_run(run_id))
    assert len(runner_calls) == 1
    task.on_kill()

    assert len(writebacks) == 1
    fqn, payload = writebacks[0]
    assert fqn == "svc.kill_demo"
    assert payload["runId"] == run_id
    assert payload["pipelineState"] == "failed"


def test_on_kill_before_run_writes_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task = _metadata_task()
    writebacks: list[tuple[str, dict]] = []

    class FakeRestClient:
        def __init__(self, server: Any) -> None:
            pass

        def add_pipeline_status(self, fqn: str, payload: dict) -> None:
            writebacks.append((fqn, payload))

        def close(self) -> None:
            pass

    monkeypatch.setattr(
        "smartmetadata_ingestion.client.rest.RestClient", FakeRestClient
    )
    task.on_kill()
    assert writebacks == []


# --- sourceConfigOverride (fix-round N-4) ---------------------------------
# An untranslatable override fails the task loudly, like deploy-time
# scope validation (ruling §4.2 T-1/T-2): the override is only known at
# trigger time, and ignoring a narrowing override would run the deployed
# (broader) scope. This matches the official apply_source_config_override,
# whose model_validate raises.


def test_untranslatable_source_config_override_fails_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task = _metadata_task()
    run_id = str(uuid.uuid4())
    runner_calls: list[dict] = []

    def fake_run(config: dict, rid: str, raise_on_error: bool) -> None:
        runner_calls.append(config)

    monkeypatch.setattr(common_module, "run_pipeline_workflow", fake_run)
    with pytest.raises(TranslationError):
        task._run(
            dag_run=SimpleNamespace(
                conf={
                    "pipelineRunId": run_id,
                    # P-11: a regex pattern is now translatable, so the
                    # untranslatable shape is a malformed one — a pattern
                    # given as a bare string instead of an object (N-10).
                    "sourceConfigOverride": {
                        "schemaFilterPattern": "prod.*"
                    },
                },
                run_id="manual__2026-11-06T00:00:00+00:00",
            )
        )
    # The task failed before the runner ever ran.
    assert runner_calls == []


def test_translatable_source_config_override_narrows_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task = _metadata_task()
    run_id = str(uuid.uuid4())
    runner_calls: list[dict] = []

    def fake_run(config: dict, rid: str, raise_on_error: bool) -> None:
        runner_calls.append(config)

    monkeypatch.setattr(common_module, "run_pipeline_workflow", fake_run)
    task._run(
        dag_run=SimpleNamespace(
            conf={
                "pipelineRunId": run_id,
                "sourceConfigOverride": {
                    "schemaFilterPattern": {"includes": ["sales"]}
                },
            },
            run_id="manual__2026-11-06T00:00:00+00:00",
        )
    )
    assert len(runner_calls) == 1
    assert runner_calls[0]["source"]["includeSchemas"] == ["sales"]


# --- failure-callback run id (ruling §1.5.3, fix-round B-4) --------------
# The failure callbacks must derive the run id from the REGISTERED dag id,
# not the raw pipeline name: for a name needing cleaning ("my.pipe" ->
# "my_pipe") the raw name produces a different uuid5, so the failed
# writeback would land on a run the server never saw.

_SCHEDULED_RUN_ID = "scheduled__2026-11-06T00:00:00+00:00"


def _scheduled_failure(
    monkeypatch: pytest.MonkeyPatch, with_dag_id: bool
) -> tuple[list[str], list[tuple[str, dict]], str]:
    """Run a scheduled run of a dotted-name pipeline, then fire the
    task-level failure callback; returns (worker run ids, writebacks,
    expected run id)."""
    pytest.importorskip("airflow")
    builder = get_builder("metadata")
    assert builder is not None
    pipeline = _pipeline("my.pipe", "metadata")
    dag = builder(pipeline)
    assert dag.dag_id == "my_pipe"
    task = _task(dag, "ingestion_task")
    fake_run = SimpleNamespace(conf={}, run_id=_SCHEDULED_RUN_ID)
    if with_dag_id:
        fake_run.dag_id = dag.dag_id
    worker_ids: list[str] = []
    writebacks: list[tuple[str, dict]] = []

    def fake_runner(config: dict, rid: str, raise_on_error: bool) -> None:
        worker_ids.append(rid)

    class FakeRestClient:
        def __init__(self, server: Any) -> None:
            pass

        def add_pipeline_status(self, fqn: str, payload: dict) -> None:
            writebacks.append((fqn, payload))

        def close(self) -> None:
            pass

    monkeypatch.setattr(common_module, "run_pipeline_workflow", fake_runner)
    monkeypatch.setattr(
        "smartmetadata_ingestion.client.rest.RestClient", FakeRestClient
    )
    task._run(dag_run=fake_run)
    common_module.send_failed_status_callback(
        task._workflow_config,
        pipeline,
        {"dag_run": fake_run, "task_instance": None},
    )
    expected = str(pipeline_run_id(clean_dag_id("my.pipe"), _SCHEDULED_RUN_ID))
    return worker_ids, writebacks, expected


def test_failed_callback_writeback_uses_registered_dag_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    worker_ids, writebacks, expected = _scheduled_failure(monkeypatch, True)
    assert len(worker_ids) == 1
    assert worker_ids[0] == expected
    assert len(writebacks) == 1
    fqn, payload = writebacks[0]
    assert fqn == "svc.my.pipe"
    assert payload["runId"] == expected
    assert payload["pipelineState"] == "failed"


def test_failed_callback_writeback_falls_back_to_cleaned_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # No dag_id attribute on the dag_run (as in the re-review repro):
    # _send_failed falls back to clean_dag_id(name) and still converges.
    worker_ids, writebacks, expected = _scheduled_failure(monkeypatch, False)
    assert len(worker_ids) == 1
    assert worker_ids[0] == expected
    assert len(writebacks) == 1
    fqn, payload = writebacks[0]
    assert fqn == "svc.my.pipe"
    assert payload["runId"] == expected
    assert payload["pipelineState"] == "failed"
