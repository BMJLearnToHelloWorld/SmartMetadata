# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import json

import httpx

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.connectors.base import parse_static_record
from smartmetadata_ingestion.records import AppRecord, ClassificationRecord, TagRecord
from smartmetadata_ingestion.sinks.metadata_rest import MetadataRestSink


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="bot-token"),
    )


def test_client_classification_tag_app_paths() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode()) if request.content else None
        seen.append((request.method, request.url.path, body))
        return httpx.Response(200, json={"ok": True, "name": (body or {}).get("name")})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.upsert_classification(
            {"name": "PII", "description": "pii class", "mutuallyExclusive": True}
        )
        client.upsert_tag(
            {
                "name": "Sensitive",
                "description": "sensitive",
                "classification": "PII",
            }
        )
        client.upsert_app({"name": "SearchIndexingApplication", "description": "index"})
    assert seen[0][0:2] == ("PUT", "/api/v1/classifications")
    assert seen[0][2]["mutuallyExclusive"] is True
    assert seen[1][0:2] == ("PUT", "/api/v1/tags")
    assert seen[1][2]["classification"] == "PII"
    assert seen[2][0:2] == ("PUT", "/api/v1/apps")
    assert seen[2][2]["name"] == "SearchIndexingApplication"


def test_sink_writes_classification_tag_app() -> None:
    calls: list[tuple] = []

    class Fake:
        def upsert_classification(self, payload):
            calls.append(("c", payload))
            return payload

        def upsert_tag(self, payload):
            calls.append(("t", payload))
            return payload

        def upsert_app(self, payload):
            calls.append(("a", payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ClassificationRecord(
            name="Tier",
            description="tier",
            mutually_exclusive=True,
        )
    )
    sink.write(
        TagRecord(name="Tier1", description="t1", classification="Tier")
    )
    sink.write(AppRecord(name="DataInsightsApplication", description="di"))
    assert calls[0][0] == "c"
    assert calls[0][1]["mutuallyExclusive"] is True
    assert calls[1][1]["classification"] == "Tier"
    assert calls[2][1]["name"] == "DataInsightsApplication"


def test_static_classification_tag_app() -> None:
    c = parse_static_record(
        {"kind": "classification", "name": "PII", "description": "d"},
        default_service="demo",
    )
    assert isinstance(c, ClassificationRecord)
    t = parse_static_record(
        {
            "kind": "tag",
            "name": "Email",
            "description": "e",
            "classification": "PII",
        },
        default_service="demo",
    )
    assert isinstance(t, TagRecord)
    a = parse_static_record(
        {"kind": "app", "name": "CacheWarmupApplication"},
        default_service="demo",
    )
    assert isinstance(a, AppRecord)
