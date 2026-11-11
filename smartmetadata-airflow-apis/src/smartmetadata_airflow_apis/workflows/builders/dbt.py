# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""dbt pipeline builder: a single dbt_task DAG.

Mirrors official ``build_dbt_dag``: task id ``dbt_task``; the source
type is the live service type itself (no ``-usage`` / ``-lineage``
suffix) and raiseOnError follows the pipeline (official
``build_workflow_config_property``). The product has no dbt runner yet,
so the task runs the metadata workflow against the live service
(ADR:2026-11-11-pipeline-deep-dive-python): the DAG deploys and runs,
but it performs a metadata ingestion, not the official dbt lineage
extraction.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("dbt")
def build_dbt_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="dbt",
    )
    return build_dag(
        "dbt_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
