# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for patching and sample persistence (design §2.11)."""

from __future__ import annotations

import base64
import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

import pytest

from smartmetadata_ingestion.classification.patching import (
    MAX_OPTIMISTIC_LOCK_RETRIES,
    SAMPLE_DATA_MAX_STORED_COUNT,
    patch_column_tags,
    store_tabular_sample_data,
    store_topic_sample_data,
)
from smartmetadata_ingestion.errors import RestError, WorkflowError


def _label(fqn: str) -> dict[str, Any]:
    return {"tagFQN": fqn, "source": "Classification"}


def _entity(**overrides: Any) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": "entity-1",
        "fullyQualifiedName": "svc.db.sc.tbl",
        "version": 0.1,
        "columns": [
            {"name": "email", "tags": []},
            {"name": "phone"},
            {
                "name": "address",
                "children": [{"name": "city", "tags": []}],
            },
        ],
    }
    entity.update(overrides)
    return entity


class _FakeClient:
    def __init__(
        self,
        entities: list[dict[str, Any]],
        *,
        patch_outcomes: list[Any] | None = None,
    ) -> None:
        self._entities = list(entities)
        self._patch_outcomes = list(patch_outcomes or [])
        self.fetch_calls: list[tuple[str, str | None]] = []
        self.patch_calls: list[tuple[str, Any, Any]] = []
        self.stored: list[tuple[str, Any, dict[str, Any]]] = []

    def _fetch(self, method: str, fqn: str, fields: str | None) -> dict[str, Any]:
        self.fetch_calls.append((method, fields))
        return self._entities.pop(0) if len(self._entities) > 1 else self._entities[0]

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        return self._fetch("get_table_by_name", fqn, fields)

    def get_container_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        return self._fetch("get_container_by_name", fqn, fields)

    def get_topic_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        return self._fetch("get_topic_by_name", fqn, fields)

    def patch(self, path: str, *, json: Any = None, headers: dict[str, str] | None = None) -> Any:
        self.patch_calls.append((path, json, headers))
        if self._patch_outcomes:
            outcome = self._patch_outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return {"patched": True}

    def ingest_table_sample_data(self, entity_id: str, payload: dict) -> Any:
        self.stored.append(("table", entity_id, payload))
        return {}

    def ingest_container_sample_data(self, entity_id: str, payload: dict) -> Any:
        self.stored.append(("container", entity_id, payload))
        return {}

    def ingest_topic_sample_data(self, entity_id: str, payload: dict) -> Any:
        self.stored.append(("topic", entity_id, payload))
        return {}


def test_patch_appends_labels_with_the_weak_etag() -> None:
    client = _FakeClient([_entity()])
    result = patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
    )
    assert result == {"patched": True}
    assert client.fetch_calls == [("get_table_by_name", "tags,columns")]
    assert client.patch_calls == [
        (
            "/v1/tables/entity-1",
            [
                {
                    "op": "add",
                    "path": "/columns/0/tags/-",
                    "value": _label("PII.Sensitive"),
                }
            ],
            {"If-Match": 'W/"0.1"'},
        )
    ]


def test_patch_creates_a_missing_tags_array_with_the_first_label() -> None:
    client = _FakeClient([_entity()])
    patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.phone": [_label("PII.Sensitive"), _label("PII.NonSensitive")]},
    )
    (_, ops, _) = client.patch_calls[0]
    assert ops == [
        {
            "op": "add",
            "path": "/columns/1/tags",
            "value": [_label("PII.Sensitive")],
        },
        {
            "op": "add",
            "path": "/columns/1/tags/-",
            "value": _label("PII.NonSensitive"),
        },
    ]


def test_patch_addresses_nested_columns_by_pointer() -> None:
    client = _FakeClient([_entity()])
    patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.address.city": [_label("PII.Sensitive")]},
    )
    (_, ops, _) = client.patch_calls[0]
    assert ops[0]["path"] == "/columns/2/children/0/tags/-"


def test_patch_matching_is_case_insensitive_and_unmatched_warn(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient([_entity()])
    with caplog.at_level(logging.WARNING):
        result = patch_column_tags(
            client,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_tags={
                "SVC.DB.SC.TBL.EMAIL": [_label("PII.Sensitive")],
                "svc.db.sc.tbl.missing": [_label("PII.Sensitive")],
                "svc.db.sc.tbl.phone": [],
            },
        )
    assert result == {"patched": True}
    (_, ops, _) = client.patch_calls[0]
    assert [op["path"] for op in ops] == ["/columns/0/tags/-"]
    assert "svc.db.sc.tbl.missing" in caplog.text


def test_patch_returns_none_when_no_column_matched(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient([_entity()])
    with caplog.at_level(logging.WARNING):
        result = patch_column_tags(
            client,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_tags={"svc.db.sc.tbl.missing": [_label("PII.Sensitive")]},
        )
    assert result is None
    assert client.patch_calls == []
    assert "no patch operations" in caplog.text


def test_patch_without_a_version_sends_no_precondition() -> None:
    entity = _entity()
    del entity["version"]
    client = _FakeClient([entity])
    patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
    )
    assert client.patch_calls[0][2] is None


def test_patch_without_an_id_fails_loud() -> None:
    entity = _entity()
    del entity["id"]
    client = _FakeClient([entity])
    with pytest.raises(WorkflowError, match="has no id"):
        patch_column_tags(
            client,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
        )


def test_patch_retries_after_412_with_the_refetched_version() -> None:
    client = _FakeClient(
        [_entity(), _entity(version=0.2)],
        patch_outcomes=[RestError("precondition", status_code=412)],
    )
    result = patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
    )
    assert result == {"patched": True}
    assert len(client.fetch_calls) == 2
    assert client.patch_calls[0][2] == {"If-Match": 'W/"0.1"'}
    assert client.patch_calls[1][2] == {"If-Match": 'W/"0.2"'}


def test_patch_falls_back_unconditional_when_the_same_etag_rejects_twice() -> None:
    client = _FakeClient(
        [_entity()],
        patch_outcomes=[
            RestError("precondition", status_code=412),
            RestError("precondition", status_code=412),
        ],
    )
    result = patch_column_tags(
        client,
        entity_type="table",
        entity_fqn="svc.db.sc.tbl",
        column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
    )
    assert result == {"patched": True}
    assert len(client.patch_calls) == 3
    assert client.patch_calls[2][2] is None


def test_patch_exhausts_retries_and_warns(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient(
        [_entity(version=0.1), _entity(version=0.2), _entity(version=0.3)],
        patch_outcomes=[RestError("precondition", status_code=412)] * 3,
    )
    with caplog.at_level(logging.WARNING):
        result = patch_column_tags(
            client,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
        )
    assert result is None
    assert len(client.fetch_calls) == MAX_OPTIMISTIC_LOCK_RETRIES
    assert len(client.patch_calls) == MAX_OPTIMISTIC_LOCK_RETRIES
    assert "exhausted" in caplog.text


def test_non_412_errors_propagate() -> None:
    client = _FakeClient(
        [_entity()],
        patch_outcomes=[RestError("server blew up", status_code=500)],
    )
    with pytest.raises(RestError, match="server blew up"):
        patch_column_tags(
            client,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_tags={"svc.db.sc.tbl.email": [_label("PII.Sensitive")]},
        )


def test_container_and_topic_patch_paths_and_fields() -> None:
    container = {
        "id": "c-1",
        "fullyQualifiedName": "svc.bucket",
        "version": 0.3,
        "dataModel": {"columns": [{"name": "key", "tags": []}]},
    }
    client = _FakeClient([container])
    patch_column_tags(
        client,
        entity_type="container",
        entity_fqn="svc.bucket",
        column_tags={"svc.bucket.key": [_label("PII.Sensitive")]},
    )
    assert client.fetch_calls == [("get_container_by_name", "tags,dataModel")]
    assert client.patch_calls[0][0] == "/v1/containers/c-1"
    assert client.patch_calls[0][1][0]["path"] == "/dataModel/columns/0/tags/-"

    topic = {
        "id": "t-1",
        "fullyQualifiedName": "svc.orders",
        "version": 0.4,
        "messageSchema": {"schemaFields": [{"name": "payload", "tags": []}]},
    }
    client = _FakeClient([topic])
    patch_column_tags(
        client,
        entity_type="topic",
        entity_fqn="svc.orders",
        column_tags={"svc.orders.payload": [_label("PII.Sensitive")]},
    )
    assert client.fetch_calls == [("get_topic_by_name", "tags,messageSchema")]
    assert client.patch_calls[0][0] == "/v1/topics/t-1"


def test_unknown_entity_type_fails_loud() -> None:
    client = _FakeClient([_entity()])
    with pytest.raises(ValueError, match="unknown entity type"):
        patch_column_tags(
            client,
            entity_type="dashboard",
            entity_fqn="svc.d",
            column_tags={},
        )


def test_store_tabular_builds_positional_rows_and_caps_at_fifty() -> None:
    client = _FakeClient([_entity()])
    rows = [{"a": i, "b": f"v{i}"} for i in range(SAMPLE_DATA_MAX_STORED_COUNT + 10)]
    store_tabular_sample_data(
        client, entity_type="table", entity_id="e-1", field_names=["b", "a"], rows=rows
    )
    (kind, entity_id, payload) = client.stored[0]
    assert (kind, entity_id) == ("table", "e-1")
    assert payload["columns"] == ["b", "a"]
    assert len(payload["rows"]) == SAMPLE_DATA_MAX_STORED_COUNT
    assert payload["rows"][0] == ["v0", 0]
    assert payload["rows"][49] == ["v49", 49]


def test_store_tabular_normalizes_values_to_json_native_forms() -> None:
    client = _FakeClient([_entity()])
    store_tabular_sample_data(
        client,
        entity_type="container",
        entity_id="e-1",
        field_names=["d", "dec", "bin", "nested", "missing", "flag"],
        rows=[
            {
                "d": datetime(2026, 3, 14, 10, 30),
                "dec": Decimal("1.5"),
                "bin": b"\x00\xff",
                "nested": {"when": date(2026, 1, 2), "at": time(9, 15)},
                "flag": True,
            }
        ],
    )
    payload = client.stored[0][2]
    assert payload["rows"] == [
        [
            "2026-03-14T10:30:00",
            1.5,
            base64.b64encode(b"\x00\xff").decode("ascii"),
            {"when": "2026-01-02", "at": "09:15:00"},
            None,
            True,
        ]
    ]


def test_store_tabular_rejects_topics_and_unknown_types() -> None:
    client = _FakeClient([_entity()])
    with pytest.raises(ValueError, match="cannot be stored"):
        store_tabular_sample_data(
            client, entity_type="topic", entity_id="e-1", field_names=[], rows=[]
        )


def test_store_topic_caps_messages() -> None:
    client = _FakeClient([_entity()])
    store_topic_sample_data(
        client,
        entity_id="t-1",
        messages=[f"m{i}" for i in range(SAMPLE_DATA_MAX_STORED_COUNT + 5)],
    )
    (kind, entity_id, payload) = client.stored[0]
    assert (kind, entity_id) == ("topic", "t-1")
    assert payload == {"messages": [f"m{i}" for i in range(SAMPLE_DATA_MAX_STORED_COUNT)]}
