# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Thin httpx client for documented openmetadata-service REST paths."""

from __future__ import annotations

import base64
import logging
import time
from collections.abc import Iterator
from typing import Any
from urllib.parse import quote

import httpx

from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.errors import RestError, WorkflowError

logger = logging.getLogger(__name__)

LOGIN_PATH = "/v1/users/login"
DATABASE_SERVICES_PATH = "/v1/services/databaseServices"
MESSAGING_SERVICES_PATH = "/v1/services/messagingServices"
DASHBOARD_SERVICES_PATH = "/v1/services/dashboardServices"
STORAGE_SERVICES_PATH = "/v1/services/storageServices"
PIPELINE_SERVICES_PATH = "/v1/services/pipelineServices"
DATABASES_PATH = "/v1/databases"
SCHEMAS_PATH = "/v1/databaseSchemas"
TABLES_PATH = "/v1/tables"
TOPICS_PATH = "/v1/topics"
DASHBOARDS_PATH = "/v1/dashboards"
CHARTS_PATH = "/v1/charts"
CONTAINERS_PATH = "/v1/containers"
PIPELINES_PATH = "/v1/pipelines"
LINEAGE_PATH = "/v1/lineage"
USAGE_PATH = "/v1/usage"
ENTITY_PROFILES_PATH = "/v1/entity/profiles"
TEST_CASE_RESULTS_PATH = "/v1/dataQuality/testCases/testCaseResults"
TEST_SUITES_PATH = "/v1/dataQuality/testSuites"
TEST_CASES_PATH = "/v1/dataQuality/testCases"
TABLES_PROFILE_PATH = TABLES_PATH  # /v1/tables/{id}/tableProfile
SYSTEM_SETTINGS_PATH = "/v1/system/settings"
INGESTION_PIPELINES_PATH = "/v1/services/ingestionPipelines"
CLASSIFICATIONS_PATH = "/v1/classifications"
TAGS_PATH = "/v1/tags"
APPS_PATH = "/v1/apps"

_RETRY_STATUSES = frozenset({429, 502, 503, 504})


def encode_login_password(password: str) -> str:
    return base64.b64encode(password.encode("utf-8")).decode("ascii")


def encode_path_segment(value: str) -> str:
    return quote(value, safe="")


class RestClient:
    def __init__(
        self,
        server: ServerConfig,
        *,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self._server = server
        self._token: str | None = server.auth.jwt_token if server.auth.type == "jwt" else None
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=server.host_port,
            timeout=server.timeout_seconds,
            transport=transport,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> RestClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def login(self, auth: AuthConfig | None = None) -> str:
        credentials = auth or self._server.auth
        if credentials.type == "jwt":
            if not credentials.jwt_token:
                raise WorkflowError("jwt auth is missing jwtToken")
            self._token = credentials.jwt_token
            return self._token
        body = {
            "email": credentials.email,
            "password": encode_login_password(credentials.password or ""),
        }
        payload = self.request("POST", LOGIN_PATH, json=body, auth=False)
        token = payload.get("accessToken") if isinstance(payload, dict) else None
        if not token:
            raise RestError("login response did not include accessToken")
        self._token = token
        return token

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        auth: bool = True,
    ) -> Any:
        headers: dict[str, str] = {}
        if auth:
            if not self._token:
                self.login()
            headers["Authorization"] = f"Bearer {self._token}"
        attempts = self._server.retry_attempts + 1
        last_error: RestError | None = None
        for attempt in range(attempts):
            response = self._client.request(
                method,
                path,
                json=json,
                params=params,
                headers=headers,
            )
            if response.status_code in _RETRY_STATUSES and attempt + 1 < attempts:
                time.sleep(min(0.05 * (2**attempt), 0.4))
                last_error = self._error(method, path, response)
                continue
            if response.status_code >= 400:
                raise self._error(method, path, response)
            if not response.content:
                return None
            content_type = response.headers.get("content-type", "")
            if "json" in content_type or response.text[:1] in "{[":
                return response.json()
            return response.text
        raise last_error or RestError(f"{method} {path} failed")

    def iter_collection(
        self,
        path: str,
        *,
        limit: int = 100,
        extra_params: dict[str, Any] | None = None,
    ) -> Iterator[dict[str, Any]]:
        after: str | None = None
        while True:
            params: dict[str, Any] = {"limit": limit}
            if extra_params:
                params.update(extra_params)
            if after:
                params["after"] = after
            page = self.request("GET", path, params=params)
            if not isinstance(page, dict):
                return
            for item in page.get("data") or []:
                if isinstance(item, dict):
                    yield item
            paging = page.get("paging") or {}
            after = paging.get("after")
            if not after:
                return

    def upsert_database_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", DATABASE_SERVICES_PATH, json=payload))

    def upsert_database(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", DATABASES_PATH, json=payload))

    def upsert_schema(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", SCHEMAS_PATH, json=payload))

    def upsert_table(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", TABLES_PATH, json=payload))

    def upsert_messaging_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", MESSAGING_SERVICES_PATH, json=payload))

    def upsert_topic(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", TOPICS_PATH, json=payload))

    def upsert_dashboard_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", DASHBOARD_SERVICES_PATH, json=payload))

    def upsert_dashboard(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", DASHBOARDS_PATH, json=payload))

    def upsert_chart(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", CHARTS_PATH, json=payload))

    def upsert_storage_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", STORAGE_SERVICES_PATH, json=payload))

    def upsert_container(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", CONTAINERS_PATH, json=payload))

    def upsert_pipeline_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", PIPELINE_SERVICES_PATH, json=payload))

    def upsert_pipeline(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", PIPELINES_PATH, json=payload))

    def put_lineage(
        self,
        from_type: str,
        from_fqn: str,
        to_type: str,
        to_fqn: str,
        lineage_details: dict[str, Any] | None = None,
    ) -> Any:
        path = (
            f"{LINEAGE_PATH}/{encode_path_segment(from_type)}/name/{encode_path_segment(from_fqn)}"
            f"/{encode_path_segment(to_type)}/name/{encode_path_segment(to_fqn)}"
        )
        return self.request("PUT", path, json=lineage_details or {})

    def delete_lineage_by_name(
        self,
        from_type: str,
        from_fqn: str,
        to_type: str,
        to_fqn: str,
    ) -> Any:
        """DELETE /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} (Apache deleteLineageEdgeByName)."""
        path = (
            f"{LINEAGE_PATH}/{encode_path_segment(from_type)}/name/{encode_path_segment(from_fqn)}"
            f"/{encode_path_segment(to_type)}/name/{encode_path_segment(to_fqn)}"
        )
        return self.request("DELETE", path)

    def put_usage_by_name(
        self,
        entity_type: str,
        fqn: str,
        *,
        date: str,
        count: int,
    ) -> Any:
        """PUT /v1/usage/{entity}/name/{fqn} with DailyCount body (Apache contract)."""
        if count < 0:
            raise WorkflowError("usage count must be >= 0")
        path = (
            f"{USAGE_PATH}/{encode_path_segment(entity_type)}"
            f"/name/{encode_path_segment(fqn)}"
        )
        return self.request("PUT", path, json={"date": date, "count": int(count)})

    def post_entity_profile_by_name(
        self,
        entity_type: str,
        fqn: str,
        payload: dict[str, Any],
    ) -> Any:
        """POST /v1/entity/profiles/name/{entityType}/{fqn} (CreateEntityProfile)."""
        path = (
            f"{ENTITY_PROFILES_PATH}/name/{encode_path_segment(entity_type)}"
            f"/{encode_path_segment(fqn)}"
        )
        return self.request("POST", path, json=payload)

    def put_table_profile(
        self,
        table_id: str,
        payload: dict[str, Any],
    ) -> Any:
        """PUT /v1/tables/{id}/tableProfile (CreateTableProfile; legacy id path)."""
        path = f"{TABLES_PATH}/{encode_path_segment(table_id)}/tableProfile"
        return self.request("PUT", path, json=payload)

    def post_test_case_result(
        self,
        test_case_fqn: str,
        payload: dict[str, Any],
    ) -> Any:
        """POST /v1/dataQuality/testCases/testCaseResults/{fqn} (CreateTestCaseResult)."""
        path = f"{TEST_CASE_RESULTS_PATH}/{encode_path_segment(test_case_fqn)}"
        body = dict(payload)
        body.setdefault("fqn", test_case_fqn)
        return self.request("POST", path, json=body)

    # --- Data-quality pull (Wave 2 H track 3) -------------------------------
    # TestSuite / TestCase read methods for the server-pulled TestSuite path
    # (ADR:2026-11-08-test-suite-server-pull). The Sampler messaging chain
    # (H track 1) adds its sample-data write methods in the section below;
    # do not add a second REST client or duplicate these paths elsewhere.

    def list_test_suites(
        self,
        *,
        limit: int = 100,
        extra_params: dict[str, Any] | None = None,
    ) -> Iterator[dict[str, Any]]:
        """GET /v1/dataQuality/testSuites (paged list)."""
        yield from self.iter_collection(
            TEST_SUITES_PATH, limit=limit, extra_params=extra_params
        )

    def get_test_suite_by_id(self, suite_id: str) -> dict[str, Any]:
        """GET /v1/dataQuality/testSuites/{id}."""
        if not suite_id or not str(suite_id).strip():
            raise WorkflowError("test suite id is required")
        path = f"{TEST_SUITES_PATH}/{encode_path_segment(str(suite_id).strip())}"
        return self._as_object(self.request("GET", path))

    def get_test_suite_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/dataQuality/testSuites/name/{name}."""
        if not name or not str(name).strip():
            raise WorkflowError("test suite name is required")
        path = f"{TEST_SUITES_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

    def list_test_cases(
        self,
        *,
        test_suite_id: str | None = None,
        limit: int = 100,
        extra_params: dict[str, Any] | None = None,
    ) -> Iterator[dict[str, Any]]:
        """GET /v1/dataQuality/testCases (paged list, optional testSuiteId filter).

        Requests the fields the pull layer needs (``testSuite``, ``entityLink``,
        ``testDefinition``) — the official ``TestSuiteSource`` reads the same
        three fields for every case it pulls.
        """
        params: dict[str, Any] = {
            "fields": "testSuite,entityLink,testDefinition",
        }
        if test_suite_id:
            params["testSuiteId"] = test_suite_id
        if extra_params:
            params.update(extra_params)
        yield from self.iter_collection(
            TEST_CASES_PATH, limit=limit, extra_params=params
        )

    def get_table_by_name(
        self,
        fqn: str,
        *,
        fields: str | None = None,
    ) -> dict[str, Any]:
        """GET /v1/tables/name/{fqn} (table entity for the pull layer)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("table fqn is required")
        path = f"{TABLES_PATH}/name/{encode_path_segment(str(fqn).strip())}"
        params = {"fields": fields} if fields else None
        return self._as_object(self.request("GET", path, params=params))

    # --- Sample data (H track 1: sampler messaging chain) -----------------
    # First Wave 2 H track to extend RestClient. Later tracks add their
    # methods under their own section headers in this same file; no track
    # writes a second REST client or a second wrapper for these paths.

    def ingest_topic_sample_data(
        self,
        topic_id: str,
        payload: dict[str, Any],
    ) -> Any:
        """PUT /v1/topics/{id}/sampleData (official topic_mixin ingest_topic_sample_data)."""
        path = f"{TOPICS_PATH}/{encode_path_segment(topic_id)}/sampleData"
        return self.request("PUT", path, json=payload)

    def get_profiler_config_settings(self) -> dict[str, Any] | None:
        """GET /v1/system/settings/profilerConfiguration; None when unreadable.

        The caller (the sampler double gate) treats None as "cannot confirm
        the kill-switch is on" and does not sample.
        ADR:2026-11-08-sampler-messaging-double-gate-fail-closed
        """
        try:
            payload = self.request("GET", f"{SYSTEM_SETTINGS_PATH}/profilerConfiguration")
        except Exception:
            logger.debug("could not read profilerConfiguration settings", exc_info=True)
            return None
        return payload if isinstance(payload, dict) else None


    def bulk_upsert_databases(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{DATABASES_PATH}/bulk", json=payloads)

    def bulk_upsert_schemas(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{SCHEMAS_PATH}/bulk", json=payloads)

    def bulk_upsert_tables(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{TABLES_PATH}/bulk", json=payloads)

    def bulk_upsert_topics(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{TOPICS_PATH}/bulk", json=payloads)

    def bulk_upsert_dashboards(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{DASHBOARDS_PATH}/bulk", json=payloads)

    def bulk_upsert_charts(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{CHARTS_PATH}/bulk", json=payloads)

    def bulk_upsert_containers(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{CONTAINERS_PATH}/bulk", json=payloads)

    def bulk_upsert_pipelines(self, payloads: list[dict[str, Any]]) -> Any:
        return self.request("PUT", f"{PIPELINES_PATH}/bulk", json=payloads)

    def delete_stale(
        self,
        entity_path: str,
        *,
        scope_fqn: str,
        scope_entity_type: str,
        seen_fqns: list[str],
        dry_run: bool = False,
        hard_delete: bool = False,
        recursive: bool = True,
    ) -> Any:
        """DELETE {entity_path}/deleteStale with BulkDeleteStaleRequest body."""
        body = {
            "scopeFqn": scope_fqn,
            "scopeEntityType": scope_entity_type,
            "seenFqns": list(seen_fqns),
            "dryRun": dry_run,
            "hardDelete": hard_delete,
            "recursive": recursive,
        }
        return self.request("DELETE", f"{entity_path}/deleteStale", json=body)

    def add_pipeline_status(self, fqn: str, status: dict[str, Any]) -> Any:
        """PUT /v1/services/ingestionPipelines/{fqn}/pipelineStatus (Apache contract)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("ingestion pipeline fqn is required for pipelineStatus")
        path = (
            f"{INGESTION_PIPELINES_PATH}/"
            f"{encode_path_segment(str(fqn).strip())}/pipelineStatus"
        )
        return self.request("PUT", path, json=status)

    def upsert_classification(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", CLASSIFICATIONS_PATH, json=payload))

    def upsert_tag(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", TAGS_PATH, json=payload))

    def upsert_app(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", APPS_PATH, json=payload))

    @staticmethod
    def _as_object(payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise RestError("expected a JSON object from the catalog")
        return payload

    @staticmethod
    def _error(method: str, path: str, response: httpx.Response) -> RestError:
        body = response.text[:500]
        return RestError(
            f"{method} {path} failed with HTTP {response.status_code}: {body}",
            status_code=response.status_code,
            body=body,
        )
