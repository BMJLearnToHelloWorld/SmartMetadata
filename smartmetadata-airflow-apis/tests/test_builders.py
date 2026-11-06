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

Types with no builder (TestSuite, dbt, elasticSearchReindex, application,
autoClassification, dataInsight, policyAgent, reverseMetadata) are
asserted absent on purpose — ruling §4.2 records why each has no product
execution mapping; the absence is the documented behaviour, not a gap in
this file.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import pytest

import smartmetadata_airflow_apis.workflows.common as common_module
from smartmetadata_airflow_apis.workflows import builders  # noqa: F401  (registers builders)
from smartmetadata_airflow_apis.workflows.registry import get_builder, registered_types
from smartmetadata_airflow_apis.workflows.translation import TranslationError

CONNECTION = {"hostPort": "127.0.0.1:3306", "username": "stub", "password": "stub"}


def _pipeline(
    name: str = "my_pipeline",
    pipeline_type: str = "metadata",
    **overrides: Any,
) -> dict[str, Any]:
    pipeline: dict[str, Any] = {
        "name": name,
        "fullyQualifiedName": f"svc.{name}",
        "pipelineType": pipeline_type,
        "description": "",
        "service": {"type": "databaseService", "name": "svc"},
        "source": {
            "type": "mysql",
            "serviceName": "svc",
            "sourceConfig": {"config": {}},
        },
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

    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: dict(CONNECTION),
    )


def _task(dag: Any, task_id: str) -> Any:
    return dag.get_task(task_id)


def test_metadata_builder_keeps_pipeline_raise_on_error() -> None:
    builder = get_builder("metadata")
    assert builder is not None
    dag = builder(_pipeline(raiseOnError=True))
    task = _task(dag, "ingestion_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "metadata"
    assert task._workflow_config["workflow"]["fail_fast"] is True
    assert task._workflow_config["source"]["type"] == "mysql"


def test_profiler_builder_omits_raise_on_error() -> None:
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
    builder = get_builder("usage")
    assert builder is not None
    dag = builder(_pipeline("usage_pipeline", "usage", raiseOnError=True))
    task = _task(dag, "usage_task")
    assert task._raise_on_error is True
    assert task._workflow_config["workflow"]["type"] == "usage"
    assert task._workflow_config["workflow"]["fail_fast"] is True
    assert task._workflow_config["source"]["type"] == "mysql-usage"


def test_lineage_builder_suffixes_source_type() -> None:
    builder = get_builder("lineage")
    assert builder is not None
    dag = builder(_pipeline("lineage_pipeline", "lineage"))
    task = _task(dag, "lineage_task")
    assert task._raise_on_error is False
    assert task._workflow_config["workflow"]["type"] == "lineage"
    assert task._workflow_config["source"]["type"] == "mysql-lineage"


def test_no_builder_for_unmapped_types() -> None:
    # Ruling §4.2: no product execution mapping exists for these types yet;
    # deploy fails 500 through the factory instead of running something
    # invented.
    for pipeline_type in (
        "TestSuite",
        "dbt",
        "elasticSearchReindex",
        "application",
        "autoClassification",
        "dataInsight",
        "policyAgent",
        "reverseMetadata",
    ):
        assert get_builder(pipeline_type) is None, pipeline_type


def test_registered_types() -> None:
    assert registered_types() == ("lineage", "metadata", "profiler", "usage")


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
                    "sourceConfigOverride": {
                        "schemaFilterPattern": {"includes": ["prod.*"]}
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
