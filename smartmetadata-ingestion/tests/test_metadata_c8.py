# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.base import parse_static_record
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow,
    PostgresSource,
    SchemaRow,
    SequenceCatalogReader,
    TableRow,
)
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.records import (
    ColumnRecord,
    LifeCycleAccessRecord,
    LifeCycleRecord,
    StoredProcedureRecord,
    TableConstraintRecord,
    TableRecord,
    TagLabelRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import (
    BulkMetadataRestSink,
    MetadataRestSink,
    OwnerResolver,
    _stored_procedure_payload,
    _table_payload,
)
from smartmetadata_ingestion.topology import STAGE_ORDER, record_fqn


def _bulk_result(payloads: list[dict]) -> dict:
    return {
        "status": "success",
        "successRequest": [
            {"request": payload, "status": 200, "message": "ok"} for payload in payloads
        ],
        "failedRequest": [],
    }


class _FakeClient:
    """Captures every sink call, including the bulk override flag."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.users: dict[str, dict] = {}
        self.teams: dict[str, dict] = {}
        self.lookups: list[str] = []

    def upsert_stored_procedure(self, payload):
        self.calls.append(("stored_procedure", payload))
        return payload

    def upsert_table(self, payload):
        self.calls.append(("table", payload))
        return payload

    def bulk_upsert_databases(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_db", payloads, override_metadata))
        return _bulk_result(payloads)

    def bulk_upsert_schemas(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_schema", payloads, override_metadata))
        return _bulk_result(payloads)

    def bulk_upsert_tables(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_table", payloads, override_metadata))
        return _bulk_result(payloads)

    def bulk_upsert_stored_procedures(self, payloads, *, override_metadata: bool = False):
        self.calls.append(("bulk_procedure", payloads, override_metadata))
        return _bulk_result(payloads)

    def get_user_by_name(self, name):
        self.lookups.append(f"user:{name}")
        if name in self.users:
            return self.users[name]
        raise RestError("not found", status_code=404)

    def get_team_by_name(self, name):
        self.lookups.append(f"team:{name}")
        if name in self.teams:
            return self.teams[name]
        raise RestError("not found", status_code=404)


def _procedure(**overrides) -> StoredProcedureRecord:
    fields: dict = {
        "name": "calc_total",
        "database_schema": "svc.db.public",
        "stored_procedure_type": "StoredProcedure",
        "language": "SQL",
        "code": "SELECT 1",
    }
    fields.update(overrides)
    return StoredProcedureRecord(**fields)


def test_stored_procedure_payload_always_carries_code_block() -> None:
    payload = _stored_procedure_payload(_procedure(code=""))
    assert payload["storedProcedureCode"] == {"language": "SQL", "code": ""}
    assert payload["storedProcedureType"] == "StoredProcedure"
    assert payload["databaseSchema"] == "svc.db.public"


def test_stored_procedure_payload_carries_type_language_and_extensions() -> None:
    payload = _stored_procedure_payload(
        _procedure(
            stored_procedure_type="Function",
            language="Python",
            code="def f(): pass",
            description="udf",
            tags=[
                TagLabelRecord(
                    tag_fqn="PII.Sensitive",
                    source="Classification",
                    label_type="Manual",
                    state="Confirmed",
                )
            ],
            life_cycle=LifeCycleRecord(
                created=LifeCycleAccessRecord(timestamp=1700000000000)
            ),
            extension={"x-custom": "v"},
        ),
        owners=[{"id": "u1", "type": "user"}],
    )
    assert payload["storedProcedureType"] == "Function"
    assert payload["storedProcedureCode"] == {"language": "Python", "code": "def f(): pass"}
    assert payload["description"] == "udf"
    assert payload["tags"] == [
        {
            "tagFQN": "PII.Sensitive",
            "source": "Classification",
            "labelType": "Manual",
            "state": "Confirmed",
        }
    ]
    assert payload["owners"] == [{"id": "u1", "type": "user"}]
    assert payload["lifeCycle"] == {"created": {"timestamp": 1700000000000}}
    assert payload["extension"] == {"x-custom": "v"}


def test_single_sink_writes_stored_procedure_with_resolved_owners() -> None:
    client = _FakeClient()
    client.users["alice"] = {"id": "u-alice", "name": "alice", "fullyQualifiedName": "alice"}
    sink = MetadataRestSink(client)
    sink.write(_procedure(owner_names=["alice"]))
    assert len(client.calls) == 1
    kind, payload = client.calls[0]
    assert kind == "stored_procedure"
    assert payload["owners"] == [
        {"id": "u-alice", "type": "user", "name": "alice", "fullyQualifiedName": "alice"}
    ]


def test_bulk_sink_buffers_procedures_and_flushes_after_tables() -> None:
    from smartmetadata_ingestion.records import DatabaseRecord, SchemaRecord

    client = _FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(DatabaseRecord(name="db", service="svc"))
    sink.write(SchemaRecord(name="public", database="svc.db"))
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    sink.write(_procedure())
    assert sink.buffers(_procedure())
    assert not client.calls
    sink.flush()
    kinds = [call[0] for call in client.calls]
    assert kinds == ["bulk_db", "bulk_schema", "bulk_table", "bulk_procedure"]
    assert client.calls[3][1][0]["storedProcedureCode"]["code"] == "SELECT 1"


def test_bulk_sink_forwards_override_metadata_only_when_set() -> None:
    client = _FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10, override_metadata=True)
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    sink.flush()
    assert client.calls[0][2] is True

    client = _FakeClient()
    sink = BulkMetadataRestSink(client, batch_size=10)
    sink.write(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    sink.flush()
    assert client.calls[0][2] is False


def test_table_payload_carries_extensions_and_omits_absent_ones() -> None:
    record = TableRecord(
        name="orders",
        database_schema="svc.db.public",
        columns=[
            ColumnRecord(
                name="id",
                data_type="INT",
                constraint="PRIMARY_KEY",
                tags=[
                    TagLabelRecord(
                        tag_fqn="PII.Sensitive",
                        source="Classification",
                        label_type="Manual",
                        state="Confirmed",
                    )
                ],
            )
        ],
        tags=[
            TagLabelRecord(
                tag_fqn="Tier.Tier1",
                source="Classification",
                label_type="Manual",
                state="Confirmed",
            )
        ],
        schema_definition="CREATE TABLE orders (id INT)",
        table_constraints=[
            TableConstraintRecord(
                constraint_type="FOREIGN_KEY",
                columns=["customer_id"],
                referred_columns=["id"],
                relationship_type="MANY_TO_ONE",
            )
        ],
        life_cycle=LifeCycleRecord(
            created=LifeCycleAccessRecord(timestamp=1),
            updated=LifeCycleAccessRecord(timestamp=2),
        ),
        extension={"x-foo": 1},
    )
    payload = _table_payload(record, owners=[{"id": "u1", "type": "user"}])
    assert payload["columns"][0]["constraint"] == "PRIMARY_KEY"
    assert payload["columns"][0]["tags"][0]["tagFQN"] == "PII.Sensitive"
    assert payload["tags"][0]["tagFQN"] == "Tier.Tier1"
    assert payload["schemaDefinition"] == "CREATE TABLE orders (id INT)"
    assert payload["tableConstraints"] == [
        {
            "constraintType": "FOREIGN_KEY",
            "columns": ["customer_id"],
            "referredColumns": ["id"],
            "relationshipType": "MANY_TO_ONE",
        }
    ]
    assert payload["lifeCycle"] == {
        "created": {"timestamp": 1},
        "updated": {"timestamp": 2},
    }
    assert payload["extension"] == {"x-foo": 1}
    assert payload["owners"] == [{"id": "u1", "type": "user"}]

    bare = _table_payload(TableRecord(name="t", database_schema="svc.db.public", columns=[]))
    assert "tags" not in bare
    assert "owners" not in bare
    assert "schemaDefinition" not in bare
    assert "tableConstraints" not in bare
    assert "lifeCycle" not in bare
    assert "extension" not in bare


def test_owner_resolver_prefers_user_then_team() -> None:
    client = _FakeClient()
    client.users["alice"] = {"id": "u1", "name": "alice"}
    client.teams["analysts"] = {"id": "t1", "name": "analysts"}
    resolver = OwnerResolver(client)
    refs = resolver.resolve(["alice", "analysts"])
    assert refs[0] == {"id": "u1", "type": "user", "name": "alice", "fullyQualifiedName": "alice"}
    assert refs[1]["type"] == "team"
    assert client.lookups == ["user:alice", "user:analysts", "team:analysts"]


def test_owner_resolver_fails_loud_when_name_matches_neither() -> None:
    resolver = OwnerResolver(_FakeClient())
    with pytest.raises(WorkflowError, match="ghost"):
        resolver.resolve(["ghost"])


def test_owner_resolver_propagates_non_404_errors() -> None:
    class _FailingClient:
        def get_user_by_name(self, name):
            raise RestError("boom", status_code=500)

        def get_team_by_name(self, name):
            raise AssertionError("team lookup must not run after a non-404 user error")

    with pytest.raises(RestError, match="boom"):
        OwnerResolver(_FailingClient()).resolve(["alice"])


def test_owner_resolver_fails_loud_when_lookup_returns_no_id() -> None:
    client = _FakeClient()
    client.users["alice"] = {"name": "alice"}
    with pytest.raises(WorkflowError, match="no id"):
        OwnerResolver(client).resolve(["alice"])


def test_owner_resolver_without_lookups_fails_only_when_names_present() -> None:
    class _BareClient:
        pass

    resolver = OwnerResolver(_BareClient())
    assert resolver.resolve([]) == []
    with pytest.raises(WorkflowError, match="no user/team lookup"):
        resolver.resolve(["alice"])


def test_owner_resolver_cache_is_bounded() -> None:
    client = _FakeClient()
    for index in range(600):
        client.users[f"user{index}"] = {"id": f"u{index}", "name": f"user{index}"}
    resolver = OwnerResolver(client)
    resolver.resolve([f"user{index}" for index in range(600)])
    assert len(resolver._cache) <= 512
    lookups_before = len(client.lookups)
    resolver.resolve(["user0"])
    assert len(client.lookups) > lookups_before


def test_topology_orders_stored_procedure_with_tables() -> None:
    assert STAGE_ORDER["storedProcedure"] == STAGE_ORDER["table"] == 3
    assert STAGE_ORDER["storedProcedure"] > STAGE_ORDER["schema"]
    assert record_fqn(_procedure()) == "svc.db.public.calc_total"


def test_static_record_parses_stored_procedure() -> None:
    record = parse_static_record(
        {
            "kind": "storedProcedure",
            "name": "calc_total",
            "databaseSchema": "demo.analytics.public",
            "storedProcedureType": "Function",
            "storedProcedureCode": {"language": "Python", "code": "def f(): pass"},
            "owners": ["alice"],
        },
        default_service="demo",
    )
    assert isinstance(record, StoredProcedureRecord)
    assert record.stored_procedure_type == "Function"
    assert record.language == "Python"
    assert record.code == "def f(): pass"
    assert record.owner_names == ["alice"]


def test_static_record_parses_table_extensions() -> None:
    record = parse_static_record(
        {
            "kind": "table",
            "name": "orders",
            "databaseSchema": "demo.analytics.public",
            "columns": [
                {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            ],
            "schemaDefinition": "CREATE TABLE orders (id INT)",
            "tableConstraints": [{"constraintType": "PRIMARY_KEY", "columns": ["id"]}],
            "lifeCycle": {"created": {"timestamp": 7}},
            "ownerNames": ["alice"],
        },
        default_service="demo",
    )
    assert isinstance(record, TableRecord)
    assert record.columns[0].constraint == "PRIMARY_KEY"
    assert record.schema_definition == "CREATE TABLE orders (id INT)"
    assert record.table_constraints[0].constraint_type == "PRIMARY_KEY"
    assert record.life_cycle is not None
    assert record.life_cycle.created is not None
    assert record.life_cycle.created.timestamp == 7
    assert record.owner_names == ["alice"]


def _postgres_source(**config_overrides) -> PostgresSource:
    config = {
        "type": "postgres",
        "service_name": "warehouse",
        "connection": {
            "hostPort": "localhost:5432",
            "username": "u",
            "database": "analytics",
        },
    }
    config.update(config_overrides)
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("public")],
        tables=[
            TableRow("public", "orders", "BASE TABLE"),
            TableRow("public", "orders_v", "VIEW"),
        ],
        columns=[
            ColumnRow("public", "orders", "id", "integer", 1),
            ColumnRow("public", "orders_v", "id", "integer", 1),
        ],
        views=[],
    )
    return PostgresSource(SourceConfig(**config), reader=reader)


def test_include_tables_false_emits_views_but_not_tables() -> None:
    records = list(_postgres_source(include_tables_enabled=False).produce())
    tables = [record for record in records if isinstance(record, TableRecord)]
    assert [table.name for table in tables] == ["orders_v"]
    assert tables[0].table_type == "View"


def test_use_fqn_for_filtering_matches_fqn_not_raw_name() -> None:
    source = _postgres_source(
        use_fqn_for_filtering=True,
        include_tables=[r"warehouse\.analytics\.public\.orders$"],
    )
    tables = [
        record for record in source.produce() if isinstance(record, TableRecord)
    ]
    assert [table.name for table in tables] == ["orders"]

    source = _postgres_source(
        use_fqn_for_filtering=True,
        include_tables=[r"^orders$"],
    )
    tables = [
        record for record in source.produce() if isinstance(record, TableRecord)
    ]
    assert tables == []


def test_database_filter_excludes_single_database_connector() -> None:
    records = list(_postgres_source(exclude_databases=["analytics"]).produce())
    assert [record.kind for record in records] == ["databaseService"]

    records = list(_postgres_source(include_databases=["other"]).produce())
    assert [record.kind for record in records] == ["databaseService"]

    records = list(_postgres_source(include_databases=["analytics"]).produce())
    assert "database" in [record.kind for record in records]
