# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Endpoint catalog matching Java AirflowRESTClient.buildURI(path) names."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Endpoint:
    name: str
    method: str
    description: str


# Path names appended after the detected base segments. The server probes
# {apiEndpoint}/pluginsv2/api/v2/openmetadata/health-auth first, then
# api/v2/openmetadata, then api/v1/openmetadata, so every prefix must carry
# the /openmetadata segment or the probe cannot succeed.
ENDPOINTS: tuple[Endpoint, ...] = (
    Endpoint("health", "GET", "Liveness (also used to fetch CSRF on Airflow 3)"),
    Endpoint("health-auth", "GET", "Authenticated health; returns version"),
    Endpoint("deploy", "POST", "Deploy ingestion pipeline DAG config"),
    Endpoint("trigger", "POST", "Trigger a DAG run"),
    Endpoint("delete", "DELETE", "Delete a DAG"),
    Endpoint("enable", "POST", "Enable a DAG"),
    Endpoint("disable", "POST", "Disable a DAG"),
    Endpoint("status", "GET", "Queued / latest run statuses"),
    Endpoint("kill", "POST", "Kill running task instances"),
    Endpoint("last_dag_logs", "GET", "Tail last DAG task logs"),
    Endpoint("ip", "GET", "Host IP helper"),
    Endpoint("run_automation", "POST", "Run automation workflow"),
    Endpoint("csrf-token", "GET", "CSRF token for authenticated POST/DELETE"),
)

API_PREFIXES: tuple[str, ...] = (
    "/api/v1/openmetadata",
    "/api/v2/openmetadata",
    "/pluginsv2/api/v2/openmetadata",
)

# U-1 (ruling): health-auth must report the product release version, not the
# ingestion package version. The server compares major.minor against its own
# version (2.0.0-SNAPSHOT -> "2.0"); reporting the ingestion package (0.7.0)
# or the old 1.0.0 would fail the check with 422.
PRODUCT_RELEASE_VERSION = "2.0.0-SNAPSHOT"

# Server-side task key per pipeline type (PipelineServiceClientInterface
# TYPE_TO_TASK). The plugin's DAGs must contain a task with exactly this id
# or the server cannot fetch its logs.
TYPE_TO_TASK: dict[str, str] = {
    "metadata": "ingestion_task",
    "profiler": "profiler_task",
    "autoClassification": "auto_classification_task",
    "lineage": "lineage_task",
    "dbt": "dbt_task",
    "usage": "usage_task",
    "testSuite": "test_suite_task",
    "dataInsight": "data_insight_task",
    "elasticSearchReindex": "elasticsearch_reindex_task",
    "application": "application_task",
    "policyAgent": "ingestion_task",
    "reverseMetadata": "ingestion_task",
}
DEFAULT_TASK_KEY = "ingestion_task"

# Official last_dag_logs chunk size (operations/last_dag_logs.py CHUNK_SIZE):
# 2,000,000 bytes, not 2 MiB. The in-memory store and the real backend share
# this constant so one log yields the same chunk count from either backend.
LOG_CHUNK_BYTES = 2_000_000
