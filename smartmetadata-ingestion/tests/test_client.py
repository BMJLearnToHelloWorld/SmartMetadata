# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import base64

import httpx
import pytest
from smartmetadata_ingestion.client.rest import RestClient, encode_login_password
from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.errors import RestError


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="bot-token"),
    )


def test_login_sends_base64_password() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["json"] = request.read()
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"accessToken": "session-jwt"})

    client = RestClient(
        ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="login", email="admin@open-metadata.org", password="admin"),
        ),
        transport=httpx.MockTransport(handler),
    )
    token = client.login()
    assert token == "session-jwt"
    assert captured["path"].endswith("/v1/users/login")
    assert captured["auth"] is None
    assert base64.b64encode(b"admin").decode() in captured["json"].decode()
    assert encode_login_password("admin") == base64.b64encode(b"admin").decode()
    client.close()


def test_upsert_paths_and_bearer_header() -> None:
    seen: list[tuple[str, str, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, request.headers.get("authorization")))
        return httpx.Response(200, json={"id": "1", "name": "warehouse"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.upsert_database_service({"name": "warehouse", "serviceType": "Postgres"})
        client.upsert_database({"name": "analytics", "service": "warehouse"})
        client.upsert_schema({"name": "public", "database": "warehouse.analytics"})
        client.upsert_table(
            {
                "name": "orders",
                "databaseSchema": "warehouse.analytics.public",
                "columns": [{"name": "id", "dataType": "INT"}],
            }
        )
        client.put_lineage(
            "table",
            "warehouse.analytics.public.orders",
            "table",
            "warehouse.analytics.public.orders_v",
            {"source": "Manual"},
        )
        client.upsert_messaging_service({"name": "events", "serviceType": "Kafka"})
        client.upsert_topic({"name": "orders", "service": "events", "partitions": 3})
    assert [item[0:2] for item in seen] == [
        ("PUT", "/api/v1/services/databaseServices"),
        ("PUT", "/api/v1/databases"),
        ("PUT", "/api/v1/databaseSchemas"),
        ("PUT", "/api/v1/tables"),
        (
            "PUT",
            "/api/v1/lineage/table/name/warehouse.analytics.public.orders/"
            "table/name/warehouse.analytics.public.orders_v",
        ),
        ("PUT", "/api/v1/services/messagingServices"),
        ("PUT", "/api/v1/topics"),
    ]
    assert all(item[2] == "Bearer bot-token" for item in seen)


def test_pagination_follows_after_cursor() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        after = request.url.params.get("after")
        if after is None:
            return httpx.Response(
                200, json={"data": [{"name": "a"}], "paging": {"after": "cursor-1"}}
            )
        assert after == "cursor-1"
        return httpx.Response(200, json={"data": [{"name": "b"}], "paging": {}})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        names = [item["name"] for item in client.iter_collection("/v1/tables", limit=1)]
    assert names == ["a", "b"]
    assert calls["n"] == 2


def test_jwt_login_is_local() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("jwt login must not call the server")

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        assert client.login() == "bot-token"


def test_retries_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json={"name": "ok"})

    server = _jwt_server()
    server.retry_attempts = 2
    with RestClient(server, transport=httpx.MockTransport(handler)) as client:
        payload = client.upsert_database({"name": "analytics", "service": "warehouse"})
    assert payload["name"] == "ok"
    assert calls["n"] == 2


def test_empty_success_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200)

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        assert client.put_lineage("table", "a", "table", "b") is None


def test_http_error_includes_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, text="already exists")

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RestError, match="409") as exc:
            client.upsert_table({"name": "x", "databaseSchema": "s", "columns": []})
    assert exc.value.status_code == 409


def test_get_pipeline_status_gets_encoded_fqn_and_run_id() -> None:
    # P-02: the failure callback fetches the stored status before writing
    # back, so the client needs the GET side of the pipelineStatus resource.
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["raw_path"] = request.url.raw_path.decode("ascii")
        return httpx.Response(
            200,
            json={
                "runId": "run-1",
                "pipelineState": "partialSuccess",
                "startDate": 1,
                "status": [{"name": "ingest", "executionStatus": "successful"}],
            },
        )

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        result = client.get_pipeline_status("service.my pipeline", "run-1")
    assert result["pipelineState"] == "partialSuccess"
    assert seen["method"] == "GET"
    assert (
        seen["raw_path"]
        == "/api/v1/services/ingestionPipelines/service.my%20pipeline/pipelineStatus/run-1"
    )


def test_add_pipeline_status_puts_encoded_fqn() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["raw_path"] = request.url.raw_path.decode("ascii")
        seen["body"] = request.read()
        return httpx.Response(200, json={"fullyQualifiedName": "svc.pipeline"})

    payload = {
        "runId": "run-1",
        "pipelineState": "running",
        "startDate": 1,
        "timestamp": 1,
    }
    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        result = client.add_pipeline_status("service.my pipeline", payload)
    assert result["fullyQualifiedName"] == "svc.pipeline"
    assert seen["method"] == "PUT"
    assert (
        seen["raw_path"]
        == "/api/v1/services/ingestionPipelines/service.my%20pipeline/pipelineStatus"
    )
    assert b'"runId":"run-1"' in seen["body"]


def test_bulk_upsert_and_delete_stale_paths() -> None:
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        return httpx.Response(200, json={"status": "success", "numberOfRowsProcessed": 1})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.bulk_upsert_tables([{"name": "t", "databaseSchema": "s", "columns": []}])
        client.bulk_upsert_databases([{"name": "d", "service": "svc"}])
        client.bulk_upsert_schemas([{"name": "public", "database": "svc.d"}])
        client.bulk_upsert_topics([{"name": "orders", "service": "events", "partitions": 1}])
        client.delete_stale(
            "/v1/tables",
            scope_fqn="svc",
            scope_entity_type="databaseService",
            seen_fqns=["svc.d.public.t"],
            dry_run=True,
        )
    assert seen == [
        ("PUT", "/api/v1/tables/bulk"),
        ("PUT", "/api/v1/databases/bulk"),
        ("PUT", "/api/v1/databaseSchemas/bulk"),
        ("PUT", "/api/v1/topics/bulk"),
        ("DELETE", "/api/v1/tables/deleteStale"),
    ]


def test_ingest_topic_sample_data_puts_messages() -> None:
    seen: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, request.content.decode()))
        return httpx.Response(200, json={"sampleData": {"messages": ['{"id": 1}']}})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.ingest_topic_sample_data(
            "topic-uuid", {"messages": ['{"id": 1}']}
        )
    assert seen == [
        ("PUT", "/api/v1/topics/topic-uuid/sampleData", '{"messages":["{\\"id\\": 1}"]}'),
    ]


def test_get_profiler_config_settings_returns_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/system/settings/profilerConfiguration")
        return httpx.Response(
            200,
            json={"configValue": {"sampleDataConfig": {"storeSampleData": True}}},
        )

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        settings = client.get_profiler_config_settings()
    assert settings == {"configValue": {"sampleDataConfig": {"storeSampleData": True}}}


def test_get_profiler_config_settings_returns_none_on_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "boom"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        assert client.get_profiler_config_settings() is None


def test_get_test_connection_definition_path() -> None:
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        return httpx.Response(200, json={"name": "Mysql", "steps": []})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        definition = client.get_test_connection_definition("Mysql")
    assert definition == {"name": "Mysql", "steps": []}
    assert len(seen) == 1
    assert seen[0][0] == "GET"
    assert seen[0][1].endswith(
        "/v1/services/testConnectionDefinitions/name/Mysql.testConnectionDefinition"
    )


def test_patch_automation_workflow_response_sends_json_patch() -> None:
    import json

    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["path"] = request.url.path
        captured["json"] = request.read()
        captured["content_type"] = request.headers.get("content-type")
        return httpx.Response(200, json={"id": "w1"})

    result = {"status": "Failed", "steps": []}
    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.patch_automation_workflow_response("w1", result, "Failed")
    assert captured["method"] == "PATCH"
    assert str(captured["path"]).endswith("/v1/automations/workflows/w1")
    # The server's WorkflowResource PATCH consumes application/json-patch+json;
    # application/json (httpx's json= default) is rejected with 415.
    assert captured["content_type"] == "application/json-patch+json"
    assert json.loads(captured["json"]) == [  # type: ignore[arg-type]
        {"op": "add", "path": "/response", "value": result},
        {"op": "add", "path": "/status", "value": "Failed"},
    ]


def test_lineage_reads_and_delete_paths() -> None:
    seen: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, str(request.url.query)))
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        return httpx.Response(200, json={"entity": {}, "nodes": []})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.get_lineage_by_name(
            "table", "svc.db.public.orders", upstream_depth=1, downstream_depth=0
        )
        client.delete_lineage_by_source("table", "svc.db.public.orders_v", "ViewLineage")
        client.get_query_by_name("abc123")
        client.get_stored_procedure_by_name("svc.db.public.load_orders", fields="*")
    assert seen[0][0] == "GET"
    assert seen[0][1].endswith("/v1/lineage/table/name/svc.db.public.orders")
    assert "upstreamDepth=1" in seen[0][2]
    assert "downstreamDepth=0" in seen[0][2]
    assert seen[1][0] == "DELETE"
    assert seen[1][1].endswith(
        "/v1/lineage/source/name/table/svc.db.public.orders_v/type/ViewLineage"
    )
    assert seen[2][0] == "GET"
    assert seen[2][1].endswith("/v1/queries/name/abc123")
    assert seen[3][0] == "GET"
    assert seen[3][1].endswith("/v1/storedProcedures/name/svc.db.public.load_orders")
    assert "fields=" in seen[3][2]


def test_lineage_reads_require_fqn_and_surface_404() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "not found"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RestError) as excinfo:
            client.get_query_by_name("missing")
        assert excinfo.value.status_code == 404
        with pytest.raises(Exception, match="fqn is required"):
            client.get_lineage_by_name("table", "  ")
        with pytest.raises(Exception, match="query name is required"):
            client.get_query_by_name("")
        with pytest.raises(Exception, match="fqn is required"):
            client.get_stored_procedure_by_name("")
