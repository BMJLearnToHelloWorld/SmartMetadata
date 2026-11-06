# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage pipeline builder: a single usage_task DAG.

Mirrors official ``build_usage_dag``'s source-type rule (source type
``<base>-usage``); the official query-parser processor, table-usage stage
and metadata-usage bulkSink have no product counterparts — the product
``<base>-usage`` source produces UsageRecords itself, so the translation
keeps processors empty. raiseOnError follows the pipeline value: official
usage builds its WorkflowConfig with ``build_workflow_config_property``,
which carries it.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("usage")
def build_usage_dag(pipeline: dict[str, Any]) -> Any:
    source = pipeline.get("source") or {}
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="usage",
        source_type=f"{source.get('type')}-usage",
    )
    return build_dag(
        "usage_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
