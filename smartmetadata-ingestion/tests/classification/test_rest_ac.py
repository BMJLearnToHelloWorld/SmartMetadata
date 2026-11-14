# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for the AC additions to RestClient (design §2.11)."""

from __future__ import annotations

import json

import httpx
import pytest

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.errors import RestError, WorkflowError


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="test-token"),
    )


def test_get_topic_by_name_requests_the_name_path_with_fields() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, json={"id": "t-1", "name": "orders"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        entity = client.get_topic_by_name("svc.orders", fields="tags,messageSchema")
    assert entity == {"id": "t-1", "name": "orders"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/v1/topics/name/svc.orders"
    assert seen["query"] == {"fields": "tags,messageSchema"}


def test_get_container_by_name_requests_the_name_path_with_fields() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, json={"id": "c-1", "name": "bucket"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        entity = client.get_container_by_name("svc.bucket", fields="tags,dataModel")
    assert entity == {"id": "c-1", "name": "bucket"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/v1/containers/name/svc.bucket"
    assert seen["query"] == {"fields": "tags,dataModel"}


def test_name_getters_omit_the_fields_param_when_unset() -> None:
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        return httpx.Response(200, json={"id": "x"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.get_topic_by_name("svc.orders")
        client.get_container_by_name("svc.bucket")
    assert seen == [{}, {}]


def test_name_getters_require_a_non_blank_fqn() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request must be made")

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        for call in (
            lambda: client.get_topic_by_name(""),
            lambda: client.get_topic_by_name("   "),
            lambda: client.get_container_by_name(""),
        ):
            try:
                call()
            except WorkflowError:
                pass
            else:
                raise AssertionError("expected WorkflowError")


def test_ingest_table_sample_data_puts_the_payload() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["json"] = json.loads(request.read())
        return httpx.Response(200, json={"ok": True})

    payload = {"columns": ["email"], "rows": [["a@b.com"]]}
    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        result = client.ingest_table_sample_data("table-1", payload)
    assert result == {"ok": True}
    assert seen["method"] == "PUT"
    assert seen["path"] == "/api/v1/tables/table-1/sampleData"
    assert seen["json"] == payload


def test_ingest_container_sample_data_puts_the_payload() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["json"] = json.loads(request.read())
        return httpx.Response(200, json={"ok": True})

    payload = {"columns": ["key"], "rows": [["k1"]]}
    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        result = client.ingest_container_sample_data("container-1", payload)
    assert result == {"ok": True}
    assert seen["method"] == "PUT"
    assert seen["path"] == "/api/v1/containers/container-1/sampleData"
    assert seen["json"] == payload


def test_get_messaging_service_by_name_requests_the_name_path() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, json={"id": "s-1", "name": "svc"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        entity = client.get_messaging_service_by_name("svc")
    assert entity == {"id": "s-1", "name": "svc"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/v1/services/messagingServices/name/svc"
    assert seen["query"] == {}


def test_get_storage_service_by_name_requests_the_name_path() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, json={"id": "s-2", "name": "svc"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        entity = client.get_storage_service_by_name("svc")
    assert entity == {"id": "s-2", "name": "svc"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/v1/services/storageServices/name/svc"
    assert seen["query"] == {}


def test_service_getters_require_a_non_blank_name() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request must be made")

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        for call in (
            lambda: client.get_messaging_service_by_name(""),
            lambda: client.get_messaging_service_by_name("   "),
            lambda: client.get_storage_service_by_name(""),
            lambda: client.get_storage_service_by_name("   "),
        ):
            with pytest.raises(WorkflowError, match="service name is required"):
                call()


def test_service_getters_raise_loudly_on_a_missing_service() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "service not found"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RestError, match="HTTP 404") as excinfo:
            client.get_messaging_service_by_name("ghost")
        assert excinfo.value.status_code == 404
        with pytest.raises(RestError, match="HTTP 404"):
            client.get_storage_service_by_name("ghost")
