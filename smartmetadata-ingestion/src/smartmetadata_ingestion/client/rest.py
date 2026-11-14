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
STORED_PROCEDURES_PATH = "/v1/storedProcedures"
TOPICS_PATH = "/v1/topics"
DASHBOARDS_PATH = "/v1/dashboards"
CHARTS_PATH = "/v1/charts"
CONTAINERS_PATH = "/v1/containers"
PIPELINES_PATH = "/v1/pipelines"
LINEAGE_PATH = "/v1/lineage"
USAGE_PATH = "/v1/usage"
QUERIES_PATH = "/v1/queries"
QUERY_COST_RECORD_PATH = "/v1/queryCostRecord"
USERS_PATH = "/v1/users"
ENTITY_PROFILES_PATH = "/v1/entity/profiles"
TEST_CASE_RESULTS_PATH = "/v1/dataQuality/testCases/testCaseResults"
TEST_CONNECTION_DEFINITIONS_PATH = "/v1/services/testConnectionDefinitions"
AUTOMATIONS_WORKFLOWS_PATH = "/v1/automations/workflows"
TEST_SUITES_PATH = "/v1/dataQuality/testSuites"
TEST_CASES_PATH = "/v1/dataQuality/testCases"
TABLES_PROFILE_PATH = TABLES_PATH  # /v1/tables/{id}/tableProfile
SYSTEM_SETTINGS_PATH = "/v1/system/settings"
INGESTION_PIPELINES_PATH = "/v1/services/ingestionPipelines"
CLASSIFICATIONS_PATH = "/v1/classifications"
TAGS_PATH = "/v1/tags"
APPS_PATH = "/v1/apps"
TEAMS_PATH = "/v1/teams"

_RETRY_STATUSES = frozenset({429, 502, 503, 504})


def encode_login_password(password: str) -> str:
    return base64.b64encode(password.encode("utf-8")).decode("ascii")


def encode_path_segment(value: str) -> str:
    return quote(value, safe="")


def _bulk_params(override_metadata: bool) -> dict[str, Any] | None:
    """The bulk ``overrideMetadata`` query param, only when true.

    The server reads it from the bulk request URI; absent means false.
    Sending it only when true keeps every other bulk call byte-identical.
    """
    return {"overrideMetadata": "true"} if override_metadata else None


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
        headers: dict[str, str] | None = None,
    ) -> Any:
        request_headers: dict[str, str] = {}
        if headers:
            request_headers.update(headers)
        if auth:
            if not self._token:
                self.login()
            # Auth wins over caller headers (pin REST._request applies auth
            # last): a caller can never clobber the token.
            request_headers["Authorization"] = f"Bearer {self._token}"
        attempts = self._server.retry_attempts + 1
        last_error: RestError | None = None
        for attempt in range(attempts):
            response = self._client.request(
                method,
                path,
                json=json,
                params=params,
                headers=request_headers,
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

    def patch(
        self,
        path: str,
        *,
        json: Any = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        """PATCH with the JSON Patch media type (pin ``REST.patch``).

        The server's PATCH endpoints consume ``application/json-patch+json``;
        httpx's ``json=`` default (``application/json``) is rejected with
        415, so the media type is set here, once, for every PATCH caller —
        never at the call site.
        """
        patch_headers = {"Content-Type": "application/json-patch+json"}
        if headers:
            patch_headers.update(headers)
        return self.request("PATCH", path, json=json, headers=patch_headers)

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

    def upsert_stored_procedure(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._as_object(self.request("PUT", STORED_PROCEDURES_PATH, json=payload))

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

    # --- Usage bulk sink (capability batch 1: usage five writes) --------
    # Fresh implementations against the Apache server API (design §5.5).
    # The lifecycle patch reuses RestClient.patch(), which owns the
    # JSON-Patch media type — never set it at the call site.

    def get_user_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/users/name/{name} (raises RestError on 404 — the
        caller decides whether absence is data or failure)."""
        if not name or not str(name).strip():
            raise WorkflowError("user name is required")
        path = f"{USERS_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

    def upsert_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        """PUT /v1/queries (createOrUpdate; the server derives the
        query name as the MD5 of the stored text when omitted)."""
        return self._as_object(self.request("PUT", QUERIES_PATH, json=payload))

    def add_query_usage(self, query_id: str, table_refs: list[dict[str, Any]]) -> Any:
        """PUT /v1/queries/{id}/usage with EntityReferences."""
        path = f"{QUERIES_PATH}/{encode_path_segment(query_id)}/usage"
        return self.request("PUT", path, json=table_refs)

    def add_query_users(self, query_id: str, user_fqns: list[str]) -> Any:
        """PUT /v1/queries/{id}/users with user FQNs."""
        path = f"{QUERIES_PATH}/{encode_path_segment(query_id)}/users"
        return self.request("PUT", path, json=user_fqns)

    def add_query_used_by(self, query_id: str, names: list[str]) -> Any:
        """PUT /v1/queries/{id}/usedBy with raw user names."""
        path = f"{QUERIES_PATH}/{encode_path_segment(query_id)}/usedBy"
        return self.request("PUT", path, json=names)

    def put_table_joins(self, table_id: str, payload: dict[str, Any]) -> Any:
        """PUT /v1/tables/{id}/joins with a TableJoins body."""
        path = f"{TABLES_PATH}/{encode_path_segment(table_id)}/joins"
        return self.request("PUT", path, json=payload)

    def patch_table_life_cycle(self, table_id: str, life_cycle: dict[str, Any]) -> Any:
        """JSON-Patch the table entity's /lifeCycle (add replaces any
        existing value with the fresh one)."""
        path = f"{TABLES_PATH}/{encode_path_segment(table_id)}"
        return self.patch(
            path,
            json=[{"op": "add", "path": "/lifeCycle", "value": life_cycle}],
        )

    def post_table_usage(self, table_id: str, *, date: str, count: int) -> Any:
        """POST /v1/usage/table/{id} with a UsageRequest body (the
        by-id form; put_usage_by_name stays for the static-spec path)."""
        if count < 0:
            raise WorkflowError("usage count must be >= 0")
        path = f"{USAGE_PATH}/table/{encode_path_segment(table_id)}"
        return self.request("POST", path, json={"date": date, "count": int(count)})

    def post_query_cost_record(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/queryCostRecord (CreateQueryCostRecord)."""
        return self._as_object(self.request("POST", QUERY_COST_RECORD_PATH, json=payload))

    def compute_percentile(self, entity_type: str, date: str) -> Any:
        """POST /v1/usage/compute.percentile/{entity}/{date} with no
        body: ask the server to recompute usage percentiles for one
        entity type as of one day. Callers treat failures as
        non-fatal — the percentiles are a derived view, not the
        run's published data."""
        path = (
            f"{USAGE_PATH}/compute.percentile/"
            f"{encode_path_segment(entity_type)}/{encode_path_segment(date)}"
        )
        return self.request("POST", path)

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

    def get_database_service_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/services/databaseServices/name/{name} (service entity for
        cross-service tableDiff: the right side's connection comes from the
        server's copy of the service entity, never from pipeline config).

        ADR:2026-11-11-table-diff-cross-service-connection-source
        """
        if not name or not str(name).strip():
            raise WorkflowError("database service name is required")
        path = f"{DATABASE_SERVICES_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

    def get_messaging_service_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/services/messagingServices/name/{name} (service entity
        for the autoClassification service-existence check: a run over a
        messaging service proves the service exists before enumerating
        its topics)."""
        if not name or not str(name).strip():
            raise WorkflowError("messaging service name is required")
        path = f"{MESSAGING_SERVICES_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

    def get_storage_service_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/services/storageServices/name/{name} (service entity
        for the autoClassification service-existence check: a run over a
        storage service proves the service exists before enumerating
        its containers)."""
        if not name or not str(name).strip():
            raise WorkflowError("storage service name is required")
        path = f"{STORAGE_SERVICES_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

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

    def get_topic_by_name(
        self,
        fqn: str,
        *,
        fields: str | None = None,
    ) -> dict[str, Any]:
        """GET /v1/topics/name/{fqn} (topic entity for the AC patch fetch)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("topic fqn is required")
        path = f"{TOPICS_PATH}/name/{encode_path_segment(str(fqn).strip())}"
        params = {"fields": fields} if fields else None
        return self._as_object(self.request("GET", path, params=params))

    def get_container_by_name(
        self,
        fqn: str,
        *,
        fields: str | None = None,
    ) -> dict[str, Any]:
        """GET /v1/containers/name/{fqn} (container entity for the AC patch fetch)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("container fqn is required")
        path = f"{CONTAINERS_PATH}/name/{encode_path_segment(str(fqn).strip())}"
        params = {"fields": fields} if fields else None
        return self._as_object(self.request("GET", path, params=params))

    # --- Lineage reads (capability batch 1: C-6) --------------------------
    # The REST-only adaptation of the pin's ES-backed lineage reads
    # (design §5.4, D-C5): lineage graphs for incremental/override
    # checks, Query entities for processed-lineage checks, and stored
    # procedures for procedure/UDF body resolution. Fresh
    # implementations against the Apache server API; no existing
    # method is modified.
    # ADR:2026-11-14-agent-capability-batch1

    def get_lineage_by_name(
        self,
        entity_type: str,
        fqn: str,
        *,
        upstream_depth: int = 1,
        downstream_depth: int = 1,
    ) -> dict[str, Any]:
        """GET /v1/lineage/{entity}/name/{fqn} (EntityLineage: entity,
        nodes, upstreamEdges, downstreamEdges). Depths are capped by
        the server at 3; callers asking for a one-hop neighborhood
        pass 1/0 explicitly."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("lineage entity fqn is required")
        path = (
            f"{LINEAGE_PATH}/{encode_path_segment(entity_type)}"
            f"/name/{encode_path_segment(str(fqn).strip())}"
        )
        params = {"upstreamDepth": upstream_depth, "downstreamDepth": downstream_depth}
        return self._as_object(self.request("GET", path, params=params))

    def delete_lineage_by_source(
        self,
        entity_type: str,
        fqn: str,
        source: str,
    ) -> Any:
        """DELETE /v1/lineage/source/name/{entityType}/{fqn}/type/{source}.

        Removes only the entity's UPSTREAM edges carrying that lineage
        source, so deleting a view's ViewLineage edges never clobbers
        edges a query wrote into the view (the override guard)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("lineage entity fqn is required")
        path = (
            f"{LINEAGE_PATH}/source/name/{encode_path_segment(entity_type)}"
            f"/{encode_path_segment(str(fqn).strip())}"
            f"/type/{encode_path_segment(source)}"
        )
        return self.request("DELETE", path)

    def get_query_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/queries/name/{name} (raises RestError on 404 — the
        caller decides whether absence is data or failure). Query
        names are the MD5 checksum of the stored query text, so a
        lookup by checksum finds the entity a previous run stored."""
        if not name or not str(name).strip():
            raise WorkflowError("query name is required")
        path = f"{QUERIES_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

    def get_stored_procedure_by_name(
        self,
        fqn: str,
        *,
        fields: str | None = None,
    ) -> dict[str, Any]:
        """GET /v1/storedProcedures/name/{fqn} (raises RestError on
        404). The entity carries ``storedProcedureCode`` (language +
        code) and ``storedProcedureType`` (StoredProcedure/UDF/
        StoredPackage/Function)."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("stored procedure fqn is required")
        path = f"{STORED_PROCEDURES_PATH}/name/{encode_path_segment(str(fqn).strip())}"
        params = {"fields": fields} if fields else None
        return self._as_object(self.request("GET", path, params=params))
    # --- Owner resolution (capability batch 1: C-8) -----------------------
    # Team lookup for owner resolution (the user lookup lives with the
    # query methods above — one definition only, no duplicates).

    def get_team_by_name(self, name: str) -> dict[str, Any]:
        """GET /v1/teams/name/{name} (owner resolution needs the id)."""
        if not name or not str(name).strip():
            raise WorkflowError("team name is required")
        path = f"{TEAMS_PATH}/name/{encode_path_segment(str(name).strip())}"
        return self._as_object(self.request("GET", path))

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

    def ingest_table_sample_data(
        self,
        table_id: str,
        payload: dict[str, Any],
    ) -> Any:
        """PUT /v1/tables/{id}/sampleData (TableData payload)."""
        path = f"{TABLES_PATH}/{encode_path_segment(table_id)}/sampleData"
        return self.request("PUT", path, json=payload)

    def ingest_container_sample_data(
        self,
        container_id: str,
        payload: dict[str, Any],
    ) -> Any:
        """PUT /v1/containers/{id}/sampleData (TableData payload)."""
        path = f"{CONTAINERS_PATH}/{encode_path_segment(container_id)}/sampleData"
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


    def bulk_upsert_databases(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{DATABASES_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_schemas(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{SCHEMAS_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_tables(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{TABLES_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_stored_procedures(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{STORED_PROCEDURES_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_topics(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{TOPICS_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_dashboards(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{DASHBOARDS_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_charts(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{CHARTS_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_containers(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{CONTAINERS_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

    def bulk_upsert_pipelines(
        self, payloads: list[dict[str, Any]], *, override_metadata: bool = False
    ) -> Any:
        return self.request(
            "PUT",
            f"{PIPELINES_PATH}/bulk",
            json=payloads,
            params=_bulk_params(override_metadata),
        )

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

    def get_pipeline_status(self, fqn: str, run_id: str) -> Any:
        """GET /v1/services/ingestionPipelines/{fqn}/pipelineStatus/{runId}."""
        if not fqn or not str(fqn).strip():
            raise WorkflowError("ingestion pipeline fqn is required for pipelineStatus")
        if not run_id or not str(run_id).strip():
            raise WorkflowError("pipeline run id is required for pipelineStatus")
        path = (
            f"{INGESTION_PIPELINES_PATH}/"
            f"{encode_path_segment(str(fqn).strip())}/pipelineStatus/"
            f"{encode_path_segment(str(run_id).strip())}"
        )
        return self.request("GET", path)

    # --- Automation workflows (test connection) ---------------------------
    # The test-connection runner fetches its definition and patches the
    # workflow with the result (ADR:2026-11-11-test-connection-failed-steps-are-results).

    def get_test_connection_definition(self, service_type: str) -> dict[str, Any]:
        """GET /v1/services/testConnectionDefinitions/name/{type}.testConnectionDefinition."""
        if not service_type or not str(service_type).strip():
            raise WorkflowError("service type is required")
        path = (
            f"{TEST_CONNECTION_DEFINITIONS_PATH}/name/"
            f"{encode_path_segment(str(service_type).strip())}.testConnectionDefinition"
        )
        return self._as_object(self.request("GET", path))

    def patch_automation_workflow_response(
        self,
        workflow_id: str,
        result: dict[str, Any],
        status: str,
    ) -> Any:
        """PATCH /v1/automations/workflows/{id} with the test result + status.

        JSON Patch (pin ``patch_automation_workflow_response``): add
        ``/response`` with the TestConnectionResult and add ``/status`` with
        the workflow status. The JSON Patch media type is set by
        ``RestClient.patch`` (the server rejects ``application/json`` with
        415).
        """
        if not workflow_id or not str(workflow_id).strip():
            raise WorkflowError("workflow id is required")
        ops = [
            {"op": "add", "path": "/response", "value": result},
            {"op": "add", "path": "/status", "value": status},
        ]
        path = (
            f"{AUTOMATIONS_WORKFLOWS_PATH}/{encode_path_segment(str(workflow_id).strip())}"
        )
        return self.patch(path, json=ops)

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
