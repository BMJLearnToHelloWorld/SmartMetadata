# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage pipeline builder: a single lineage_task DAG.

Mirrors official ``build_lineage_dag``'s source-type rule (source type
``<base>-lineage``) and reuses the metadata ingestion task function:
official lineage runs ``metadata_ingestion_workflow``. raiseOnError follows
the pipeline value (official ``build_workflow_config_property``).
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("lineage")
def build_lineage_dag(pipeline: dict[str, Any]) -> Any:
    source = pipeline.get("source") or {}
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="lineage",
        source_type=f"{source.get('type')}-lineage",
    )
    return build_dag(
        "lineage_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
