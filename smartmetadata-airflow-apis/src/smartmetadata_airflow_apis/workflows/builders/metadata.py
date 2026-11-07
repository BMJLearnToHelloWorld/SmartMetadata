# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Metadata pipeline builder: a single ingestion_task DAG.

The workflow config is translated from the stored pipeline at parse time
(the service connection is fetched live from the server then); the task
runs it through the product runner.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("metadata")
def build_metadata_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="metadata",
    )
    return build_dag(
        "ingestion_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
