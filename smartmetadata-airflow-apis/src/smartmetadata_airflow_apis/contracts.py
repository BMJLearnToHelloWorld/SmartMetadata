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


# Path names appended after /api/v1, /api/v2, or /pluginsv2/api/v2
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
)

API_PREFIXES: tuple[str, ...] = (
    "/api/v1",
    "/api/v2",
    "/pluginsv2/api/v2",
)

PACKAGE_VERSION = "1.0.0"
