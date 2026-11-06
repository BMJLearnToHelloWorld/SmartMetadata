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

from typing import Any

import pytest

from smartmetadata_airflow_apis.workflows import builders  # noqa: F401  (registers builders)
from smartmetadata_airflow_apis.workflows.registry import get_builder, registered_types

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
