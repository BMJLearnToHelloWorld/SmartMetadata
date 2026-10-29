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
