# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Application pipeline builder: a single application_task DAG.

Mirrors official ``build_application_dag``: task id ``application_task``;
the source type is the live service type itself (no ``-usage`` /
``-lineage`` suffix) and raiseOnError follows the pipeline (official
``build_workflow_config_property``). The product has no application
runner yet, so the task runs the metadata workflow against the live
service (ADR:2026-11-11-pipeline-deep-dive-python): the DAG deploys and
runs, but it performs a metadata ingestion, not the official
application execution (sourcePythonClass / appConfig).
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("application")
def build_application_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="application",
    )
    return build_dag(
        "application_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
