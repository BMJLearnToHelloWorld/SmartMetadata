# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Build an Airflow DAG from a stored pipeline config file.

The generated DAG file calls ``WorkflowFactory.create(config_path)`` and
then ``generate_dag(globals())``; everything else happens here and in the
builders. A pipeline type with no builder fails the build, which fails the
DAG import, which fails the deploy — exactly the official behaviour for
types the registry does not cover.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows import builders  # noqa: F401  (registers builders)
from smartmetadata_airflow_apis.workflows.config import load_config_file
from smartmetadata_airflow_apis.workflows.registry import get_builder
from smartmetadata_airflow_apis.workflows.translation import TranslationError


class WorkflowCreationError(Exception):
    """The stored pipeline config cannot be turned into a DAG."""


class WorkflowFactory:
    def __init__(self, pipeline: dict[str, Any]) -> None:
        self.pipeline = pipeline
        self._dag: Any | None = None

    @classmethod
    def create(cls, config_path: str) -> "WorkflowFactory":
        try:
            pipeline = load_config_file(config_path)
        except Exception as exc:
            raise WorkflowCreationError(str(exc)) from exc
        if not pipeline.get("name") or not pipeline.get("pipelineType"):
            raise WorkflowCreationError(
                "workflow config must name a pipeline and its type"
            )
        return cls(pipeline)

    def build_dag(self) -> Any:
        pipeline_type = str(self.pipeline.get("pipelineType"))
        builder = get_builder(pipeline_type)
        if builder is None:
            raise WorkflowCreationError(
                f"Cannot find build function for {pipeline_type}"
            )
        try:
            dag = builder(self.pipeline)
        except TranslationError as exc:
            raise WorkflowCreationError(str(exc)) from exc
        if dag is None or not hasattr(dag, "dag_id"):
            raise WorkflowCreationError(
                f"Builder for {pipeline_type} did not return a DAG"
            )
        self._dag = dag
        return dag

    def generate_dag(self, namespace: dict[str, Any]) -> None:
        self.build_dag()
        self.register_dag(namespace)

    def register_dag(self, namespace: dict[str, Any]) -> None:
        if self._dag is None:
            raise WorkflowCreationError("no DAG built yet")
        namespace[self._dag.dag_id] = self._dag

    def get_dag(self) -> Any:
        if self._dag is None:
            raise WorkflowCreationError("no DAG built yet")
        return self._dag
