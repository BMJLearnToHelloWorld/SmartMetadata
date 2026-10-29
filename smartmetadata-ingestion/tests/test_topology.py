# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageEndpoint,
    LineageRecord,
    SchemaRecord,
    TableRecord,
)
from smartmetadata_ingestion.topology import SeenSet, order_records, record_fqn


def test_order_records_parents_before_children() -> None:
    table = TableRecord(name="t", database_schema="svc.db.public", columns=[])
    schema = SchemaRecord(name="public", database="svc.db")
    db = DatabaseRecord(name="db", service="svc")
    service = DatabaseServiceRecord(name="svc", service_type="Postgres")
    lineage = LineageRecord(
        from_entity=LineageEndpoint(type="table", fqn="a"),
        to_entity=LineageEndpoint(type="table", fqn="b"),
    )
    ordered = order_records([table, lineage, schema, service, db])
    kinds = [item.kind for item in ordered]
    assert kinds == [
        "databaseService",
        "database",
        "schema",
        "table",
        "lineage",
    ]


def test_seen_set_tracks_fqns() -> None:
    seen = SeenSet()
    seen.add(DatabaseServiceRecord(name="svc", service_type="Postgres"))
    seen.add(DatabaseRecord(name="db", service="svc"))
    seen.add(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    assert record_fqn(DatabaseRecord(name="db", service="svc")) == "svc.db"
    assert seen.fqns("database") == ["svc.db"]
    assert seen.fqns("table") == ["svc.db.public.t"]
