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
from smartmetadata_ingestion.connectors.doris import DorisSource
from smartmetadata_ingestion.connectors.doris_common import (
    ColumnRow,
    SchemaRow,
    SequenceCatalogReader,
    SequenceLineageReader,
    SequenceProfileReader,
    TableRow,
    ViewRow,
    LineageEdgeRow,
    ProfileStatRow,
    SampleRow,
    build_service_connection_config,
    CursorCatalogReader,
    doris_connect,
    map_doris_table_type,
    qualified_identifier,
    run_connection_test,
)
from smartmetadata_ingestion.connectors.doris_lineage import DorisLineageSource
from smartmetadata_ingestion.connectors.doris_profiler import (
    DorisProfilerInterface,
    DorisSampleHelper,
)
from smartmetadata_ingestion.connectors.doris_quality import DorisTestSuiteInterface
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageRecord,
    ProfileRecord,
    SchemaRecord,
    TableRecord,
)
from smartmetadata_ingestion.sinks.metadata_rest import _table_payload


def _conn(**extra):
    base = {
        "hostPort": "localhost:9030",
        "username": "root",
        "password": "secret",
        "databaseName": "default",
    }
    base.update(extra)
    return base


def _reader() -> SequenceCatalogReader:
    return SequenceCatalogReader(
        schemas=[
            SchemaRow("sales"),
            SchemaRow("information_schema"),
            SchemaRow("__internal_schema"),
        ],
        tables=[
            TableRow("sales", "orders", "Doris", "fact"),
            TableRow("sales", "orders_v", "View"),
        ],
        columns=[
            ColumnRow("sales", "orders", "id", "bigint", 1),
            ColumnRow("sales", "orders", "email", "varchar", 2, 256),
            ColumnRow("sales", "orders_v", "id", "bigint", 1),
        ],
        views=[
            ViewRow("sales", "orders_v", "SELECT id FROM sales.orders"),
        ],
    )


def test_doris_connection_test_requires_host_and_user() -> None:
    with pytest.raises(WorkflowError, match="hostPort"):
        run_connection_test({"username": "root"})
    with pytest.raises(WorkflowError, match="username"):
        run_connection_test({"hostPort": "localhost:9030"})
    assert run_connection_test(_conn()) == ["CheckHostPort", "CheckUsername"]


def test_doris_metadata_tree_and_view_lineage() -> None:
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
            include_view_lineage=True,
            store_connection_secrets=True,
        ),
        reader=_reader(),
    )
    source.prepare()
    records = list(source.produce())
    kinds = [r.kind for r in records]
    assert kinds == [
        "databaseService",
        "database",
        "schema",
        "table",
        "table",
        "lineage",
    ]
    service = records[0]
    assert isinstance(service, DatabaseServiceRecord)
    assert service.service_type == "Doris"
    assert service.connection["config"]["type"] == "Doris"
    assert service.connection["config"]["scheme"] == "doris"
    assert service.connection["config"]["password"] == "secret"
    assert isinstance(records[1], DatabaseRecord)
    assert records[1].name == "default"
    assert isinstance(records[2], SchemaRecord)
    assert records[2].name == "sales"
    tables = [r for r in records if isinstance(r, TableRecord)]
    assert {t.name for t in tables} == {"orders", "orders_v"}
    orders = next(t for t in tables if t.name == "orders")
    assert orders.table_type == "Regular"
    assert next(t for t in tables if t.name == "orders_v").table_type == "View"
    assert orders.columns[0].data_type == "BIGINT"
    lineage = next(r for r in records if isinstance(r, LineageRecord))
    assert lineage.from_entity.fqn.endswith(".sales.orders")
    assert lineage.to_entity.fqn.endswith(".sales.orders_v")
    assert lineage.source == "ViewLineage"


def test_doris_lineage_source_injected_edges() -> None:
    source = DorisLineageSource(
        SourceConfig(type="doris-lineage", service_name="d", connection=_conn()),
        reader=SequenceLineageReader(
            [
                LineageEdgeRow("sales", "orders", "sales", "orders_v", "select 1"),
            ]
        ),
    )
    source.prepare()
    edges = list(source.produce())
    assert len(edges) == 1
    assert isinstance(edges[0], LineageRecord)
    assert edges[0].sql_query == "select 1"


def test_doris_profiler_and_sample() -> None:
    reader = SequenceProfileReader(
        stats=[
            ProfileStatRow(None, row_count=10),
            ProfileStatRow("id", null_count=0, distinct_count=10, min_value="1", max_value="10"),
        ],
        samples=[SampleRow({"id": 1}), SampleRow({"id": 2})],
    )
    profile = DorisProfilerInterface(reader).profile(
        service="d", database="default", schema="sales", table="orders", timestamp=1
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.table_profile["rowCount"] == 10
    assert profile.column_profile[0]["name"] == "id"
    samples = DorisSampleHelper(reader).sample("sales", "orders", limit=1)
    assert samples == [{"id": 1}]


def test_doris_quality() -> None:
    iface = DorisTestSuiteInterface(execute=lambda expr: True)
    result = iface.run_test_case(
        test_case_fqn="tc", timestamp=1, expression="select 1", expected=True
    )
    assert result.test_case_status == "Success"


def test_doris_source_maps_versioned_and_native_types() -> None:
    # V-suffixed spellings strip to their base (pin _parse_type) and
    # Doris natives map through the Doris map, not the MySQL map; the
    # dataLength gate reads the mapped type, so only VARCHAR keeps one.
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("sales")],
        tables=[TableRow("sales", "events", "BASE TABLE")],
        columns=[
            ColumnRow("sales", "events", "d", "datev2", 1),
            ColumnRow("sales", "events", "ts", "datetimev2", 2),
            ColumnRow("sales", "events", "amount", "decimalv3(9, 0)", 3),
            ColumnRow("sales", "events", "big", "largeint", 4),
            ColumnRow("sales", "events", "addr", "ipv4", 5),
            ColumnRow("sales", "events", "sketch", "hll", 6),
            ColumnRow("sales", "events", "name", "varchar", 7, 128),
            ColumnRow("sales", "events", "note", "varchar", 8),
        ],
        views=[],
    )
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert len(tables) == 1
    columns = tables[0].columns
    assert [(c.data_type, c.data_length) for c in columns] == [
        ("DATE", None),
        ("DATETIME", None),
        ("DECIMAL", None),
        ("LARGEINT", None),
        ("IPV4", None),
        ("HLL", None),
        ("VARCHAR", 128),
        ("VARCHAR", 1),
    ]
    amount = next(c for c in columns if c.name == "amount")
    assert amount.precision == 9
    assert amount.scale == 0
    assert amount.data_type_display == "decimalv3(9, 0)"


def test_doris_service_connection_builder_carries_schema_keys() -> None:
    raw = {
        "hostPort": "fe.example:9030",
        "username": "root",
        "databaseName": "default",
        "databaseSchema": "sales",
        "supportsMetadataExtraction": True,
        "supportsDBTExtraction": False,
        "supportsProfiler": True,
        "supportsAutoPartitionDetection": False,
        "supportsQueryComment": True,
        "supportsViewLineageExtraction": False,
        "schemaFilterPattern": {"includes": ["sales"]},
        "tableFilterPattern": {"includes": ["orders"]},
        "databaseFilterPattern": {"includes": ["default"]},
        "sslConfig": {"caCertificate": "---CERT---"},
        "connectionOptions": {"opt": "1"},
        "connectionArguments": {"arg": "2"},
        "password": "secret",
    }
    built = build_service_connection_config(raw=raw, store_secrets=True)
    assert built is not None
    config = built["config"]
    assert config["type"] == "Doris"
    assert config["scheme"] == "doris"
    assert config["hostPort"] == "fe.example:9030"
    assert config["username"] == "root"
    assert config["databaseName"] == "default"
    assert config["databaseSchema"] == "sales"
    assert config["supportsMetadataExtraction"] is True
    # A False supports flag must survive the `is not None and != ""` guard.
    assert config["supportsDBTExtraction"] is False
    assert config["supportsProfiler"] is True
    assert config["supportsAutoPartitionDetection"] is False
    assert config["supportsQueryComment"] is True
    assert config["supportsViewLineageExtraction"] is False
    assert config["schemaFilterPattern"] == {"includes": ["sales"]}
    assert config["tableFilterPattern"] == {"includes": ["orders"]}
    assert config["databaseFilterPattern"] == {"includes": ["default"]}
    assert config["sslConfig"] == {"caCertificate": "---CERT---"}
    assert config["connectionOptions"] == {"opt": "1"}
    assert config["connectionArguments"] == {"arg": "2"}
    # Doris has no authType: the password stays top-level.
    assert config["password"] == "secret"
    assert "authType" not in config

    unstored = build_service_connection_config(raw=raw, store_secrets=False)
    assert unstored is not None
    assert "password" not in unstored["config"]
    assert unstored["config"]["sslConfig"] == {"caCertificate": "---CERT---"}

    # Empty dicts are dropped, like the MySQL builder's dict loop.
    sparse = build_service_connection_config(
        raw={"hostPort": "fe.example:9030", "sslConfig": {}}, store_secrets=False
    )
    assert sparse is not None
    assert "sslConfig" not in sparse["config"]
    assert build_service_connection_config(raw={}, store_secrets=True) is None


def test_doris_engine_table_types() -> None:
    # Official RELKIND_MAP is case-sensitive on the ENGINE string.
    assert map_doris_table_type("Doris") == "Regular"
    assert map_doris_table_type("View") == "View"
    assert map_doris_table_type("MEMORY") == "View"
    assert map_doris_table_type("OLAP") == "MaterializedView"
    assert map_doris_table_type("Iceberg") == "Iceberg"
    assert map_doris_table_type("ICEBERG") == "Iceberg"
    assert map_doris_table_type("VIEW") == "Regular"
    assert map_doris_table_type("unknown-engine") == "Regular"
    assert map_doris_table_type(None) == "Regular"

    reader = SequenceCatalogReader(
        schemas=[SchemaRow("sales")],
        tables=[
            TableRow("sales", "orders", "Doris"),
            TableRow("sales", "orders_v", "View"),
            TableRow("sales", "scratch", "MEMORY"),
            TableRow("sales", "orders_mv", "OLAP"),
            TableRow("sales", "lake", "Iceberg"),
            TableRow("sales", "lake2", "ICEBERG"),
        ],
        columns=[ColumnRow("sales", name, "id", "bigint", 1) for name in
                 ("orders", "orders_v", "scratch", "orders_mv", "lake", "lake2")],
    )
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
        ),
        reader=reader,
    )
    tables = {t.name: t.table_type for t in source.produce() if isinstance(t, TableRecord)}
    assert tables == {
        "orders": "Regular",
        "orders_v": "View",
        "scratch": "View",
        "orders_mv": "MaterializedView",
        "lake": "Iceberg",
        "lake2": "Iceberg",
    }

    hidden = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
            include_views=False,
        ),
        reader=reader,
    )
    visible = {t.name: t.table_type for t in hidden.produce() if isinstance(t, TableRecord)}
    assert visible == {"orders": "Regular", "lake": "Iceberg", "lake2": "Iceberg"}


def test_doris_partition_payload() -> None:
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("sales")],
        tables=[TableRow("sales", "orders", "Doris")],
        columns=[ColumnRow("sales", "orders", "dt", "date", 1)],
        partitions={("sales", "orders"): "dt, region"},
    )
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
        ),
        reader=reader,
    )
    table = next(r for r in source.produce() if isinstance(r, TableRecord))
    assert table.table_partition is not None
    assert [c.column_name for c in table.table_partition.columns] == ["dt", "region"]
    assert table.table_partition.columns[0].interval_type == "TIME-UNIT"
    assert table.table_partition.columns[0].interval is None
    payload = _table_payload(table)
    assert payload["tablePartition"] == {
        "columns": [
            {"columnName": "dt", "intervalType": "TIME-UNIT"},
            {"columnName": "region", "intervalType": "TIME-UNIT"},
        ]
    }

    empty = SequenceCatalogReader(
        schemas=[SchemaRow("sales")],
        tables=[TableRow("sales", "plain", "Doris")],
        columns=[ColumnRow("sales", "plain", "id", "bigint", 1)],
        partitions={("sales", "plain"): ""},
    )
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
        ),
        reader=empty,
    )
    plain = next(r for r in source.produce() if isinstance(r, TableRecord))
    assert plain.table_partition is None
    assert "tablePartition" not in _table_payload(plain)


def test_doris_connect_passes_ssl_into_pymysql(monkeypatch) -> None:
    import sys
    import types
    from pathlib import Path as FsPath

    captured: dict = {}

    def fake_connect(**kwargs):
        captured.update(kwargs)
        return object()

    module = sys.modules.get("pymysql")
    if module is None:
        module = types.ModuleType("pymysql")
        monkeypatch.setitem(sys.modules, "pymysql", module)
    monkeypatch.setattr(module, "connect", fake_connect, raising=False)

    factory = doris_connect(
        {
            "hostPort": "fe.example:9030",
            "username": "root",
            "password": "secret",
            "databaseName": "default",
            "sslConfig": {
                "caCertificate": "---CA---",
                "sslCertificate": "---CERT---",
                "sslKey": "---KEY---",
            },
        }
    )
    factory()
    assert captured["host"] == "fe.example"
    assert captured["port"] == 9030
    ssl = captured["ssl"]
    assert FsPath(ssl["ca"]).read_text(encoding="utf-8") == "---CA---"
    assert FsPath(ssl["cert"]).read_text(encoding="utf-8") == "---CERT---"
    assert FsPath(ssl["key"]).read_text(encoding="utf-8") == "---KEY---"


def test_doris_complex_type_children() -> None:
    reader = SequenceCatalogReader(
        schemas=[SchemaRow("sales")],
        tables=[TableRow("sales", "events", "Doris")],
        columns=[
            ColumnRow("sales", "events", "tags", "ARRAY<INT(11)>", 1),
            ColumnRow(
                "sales",
                "events",
                "addr",
                "STRUCT<s_id:int(11),s_name:text,loc:point>",
                2,
            ),
            ColumnRow(
                "sales",
                "events",
                "items",
                "ARRAY<STRUCT<a:int,b:varchar(20)>>",
                3,
            ),
        ],
    )
    source = DorisSource(
        SourceConfig(
            type="doris",
            service_name="doris-svc",
            connection=_conn(),
            include_schemas=["sales"],
        ),
        reader=reader,
    )
    table = next(r for r in source.produce() if isinstance(r, TableRecord))
    tags, addr, items = table.columns
    assert tags.data_type == "ARRAY"
    assert tags.array_data_type == "INT"
    assert tags.children is None
    assert addr.data_type == "STRUCT"
    assert [c.name for c in addr.children] == ["s_id", "s_name", "loc"]
    assert [c.data_type for c in addr.children] == ["INT", "TEXT", "GEOMETRY"]
    # Official column parser default dataLength is gated: INT/TEXT omit it.
    assert addr.children[0].data_length is None
    items_payload = _table_payload(table)["columns"][2]
    assert items_payload["dataType"] == "ARRAY"
    assert items_payload["arrayDataType"] == "STRUCT"
    assert items_payload["children"][0]["name"] == "a"
    assert items_payload["children"][0]["dataType"] == "INT"
    assert items_payload["children"][1]["name"] == "b"
    assert items_payload["children"][1]["dataType"] == "VARCHAR"
    assert items_payload["children"][1]["dataLength"] == 20


class _ScriptedCursor:
    def __init__(self, script):
        self._script = list(script)
        self.calls: list[tuple[str, tuple]] = []
        self.description = None

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        if not self._script:
            raise RuntimeError(f"unexpected sql: {sql}")
        rows, description, error = self._script.pop(0)
        self.description = description
        if error is not None:
            raise error
        self._rows = rows

    def fetchall(self):
        return list(self._rows)

    def close(self) -> None:
        return None


class _ScriptedConnection:
    def __init__(self, cursor: _ScriptedCursor) -> None:
        self._cursor = cursor

    def cursor(self) -> _ScriptedCursor:
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


def test_cursor_reader_engine_query_and_partitions() -> None:
    cursor = _ScriptedCursor(
        [
            (
                [("sales", "orders", "Doris", "fact"), ("sales", "orders_v", "View", None)],
                None,
                None,
            ),
            (
                [("dt", ", ".join(("dt", "region")))],
                (("Other",), ("PartitionKey",)),
                None,
            ),
            (None, None, RuntimeError("no partitions on views")),
        ]
    )
    reader = CursorCatalogReader(lambda: _ScriptedConnection(cursor))
    tables = reader.list_tables("sales")
    assert [t.table_type for t in tables] == ["Doris", "View"]
    assert "engine" in cursor.calls[0][0].lower()
    assert cursor.calls[0][1] == ("sales",)

    partition = reader.get_table_partition_details("sales", "orders")
    assert partition is not None
    assert [c.column_name for c in partition.columns] == ["dt", "region"]
    sql = cursor.calls[1][0]
    assert sql == f"SHOW PARTITIONS FROM {qualified_identifier('sales', 'orders')}"

    assert reader.get_table_partition_details("sales", "orders_v") is None

