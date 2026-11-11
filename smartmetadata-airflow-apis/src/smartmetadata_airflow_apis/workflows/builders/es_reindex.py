# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Elasticsearch reindex pipeline builder: a single elasticsearch_reindex_task DAG.

Mirrors official ``build_es_reindex_dag``: task id
``elasticsearch_reindex_task``; the source type is the live service
type itself (no ``-usage`` / ``-lineage`` suffix) and raiseOnError
follows the pipeline. The product has no reindex runner yet, so the
task runs the metadata workflow against the live service
(ADR:2026-11-11-pipeline-deep-dive-python): the DAG deploys and runs,
but it performs a metadata ingestion, not the official search reindex.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("elasticSearchReindex")
def build_es_reindex_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="elasticSearchReindex",
    )
    return build_dag(
        "elasticsearch_reindex_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
    )
