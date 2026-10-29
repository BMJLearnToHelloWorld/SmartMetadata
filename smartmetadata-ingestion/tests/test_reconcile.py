# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.reconcile import reconcile_stale
from smartmetadata_ingestion.topology import SeenSet


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def delete_stale(self, entity_path, **kwargs):
        self.calls.append({"path": entity_path, **kwargs})
        return {"ok": True}


def test_reconcile_stale_targets_database_family() -> None:
    client = FakeClient()
    seen = SeenSet()
    seen.by_kind["table"] = {"svc.db.public.t"}
    seen.by_kind["database"] = {"svc.db"}
    results = reconcile_stale(
        client,
        scope_fqn="svc",
        scope_entity_type="databaseService",
        seen=seen,
        dry_run=True,
    )
    paths = [item["path"] for item in results]
    assert paths == ["/v1/tables", "/v1/databaseSchemas", "/v1/databases"]
    assert client.calls[0]["dry_run"] is True
    assert client.calls[0]["seen_fqns"] == ["svc.db.public.t"]
