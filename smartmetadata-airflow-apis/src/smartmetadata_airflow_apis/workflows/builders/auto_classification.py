# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Auto-classification pipeline builder: a single auto_classification_task DAG.

Mirrors official ``build_auto_classification_dag``: task id
``auto_classification_task``; the source type is the live service type
itself (no ``-usage`` / ``-lineage`` suffix) and raiseOnError follows
the pipeline. The task dispatches through ``run_workflow`` to the
clean-room classification engine, which enumerates the service's
catalog entities, samples each one, and PATCHes suggested PII labels
onto the matching columns
(ADR:2026-11-14-autoclassification-engine).
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("autoClassification")
def build_auto_classification_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="autoClassification",
    )
    return build_dag(
        "auto_classification_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
