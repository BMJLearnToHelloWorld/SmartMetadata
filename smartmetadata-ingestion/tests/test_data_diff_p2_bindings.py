# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Data Diff P2-5 bindings: trino / azuresql / clickzetta.

No live database is involved: parameter construction and SQL generation are
asserted directly, and each connect factory is exercised against a stub
driver module injected into ``sys.modules`` (plus the missing-driver path,
which must fail with the install hint). Nothing here claims a live run.
ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
"""

from __future__ import annotations

import json
import sys
import types
from contextlib import contextmanager
from typing import Any

import pytest

from smartmetadata_ingestion.connectors.profile_sql import (
    quote_ansi,
    quote_clickzetta,
    quote_mssql,
)
from smartmetadata_ingestion.datadiff import (
    SqlKeyFetcher,
    build_side,
    datadiff_binding,
)
from smartmetadata_ingestion.errors import WorkflowError

TRINO_CONNECTION = {
    "hostPort": "trino.test:8080",
    "username": "ingest",
    "password": "secret",
    "catalog": "warehouse",
}
AZURESQL_CONNECTION = {
    "hostPort": "azuresql.test:1433",
    "username": "ingest",
    "password": "secret",
    "database": "warehouse",
}
CLICKZETTA_CONNECTION = {
    "hostPort": "instance1.svc.test:443",
    "username": "ingest",
    "password": "secret",
    "databaseName": "workspace1",
    "virtualCluster": "vc1",
    "databaseSchema": "public",
}


@contextmanager
def _blocked_imports(*names: str):
    """Make the named top-level modules (and their submodules) unimportable."""

    class _Blocker:
        def find_spec(self, fullname, path=None, target=None):
            if fullname in names or any(fullname.startswith(name + ".") for name in names):
                raise ImportError(f"blocked for test: {fullname}")
            return None

    blocker = _Blocker()
    sys.meta_path.insert(0, blocker)
    try:
        yield
    finally:
        sys.meta_path.remove(blocker)


@contextmanager
def _stub_module(name: str, **attrs: Any):
    """Install a stub module (dotted name) into sys.modules for the block."""
    parts = name.split(".")
    created: list[str] = []
    for index in range(1, len(parts) + 1):
        dotted = ".".join(parts[:index])
        if dotted not in sys.modules:
            module = types.ModuleType(dotted)
            sys.modules[dotted] = module
            created.append(dotted)
            if index > 1:
                # Real imports set the child attribute on the parent module;
                # a bare sys.modules entry does not.
                setattr(sys.modules[".".join(parts[: index - 1])], parts[index - 1], module)
    module = sys.modules[name]
    previous = {key: getattr(module, key, None) for key in attrs}
    for key, value in attrs.items():
        setattr(module, key, value)
    try:
        yield module
    finally:
        for key, value in previous.items():
            if value is None:
                delattr(module, key)
            else:
                setattr(module, key, value)
        for dotted in reversed(created):
            del sys.modules[dotted]


def test_p2_5_bindings_registered_and_redshift_still_unbound() -> None:
    assert datadiff_binding("trino") is not None
    assert datadiff_binding("azuresql") is not None
    assert datadiff_binding("clickzetta") is not None
    # Redshift gets its own connector item; it never reuses the postgres binding.
    assert datadiff_binding("redshift") is None
    assert datadiff_binding("kafka") is None


def test_trino_side_builds_table_specific_catalog() -> None:
    binding = datadiff_binding("trino")
    assert binding is not None
    assert binding.database_kwarg == "catalog"
    side = build_side(
        binding,
        TRINO_CONNECTION,
        database="sales",
        schema="public",
        table="orders",
        key_columns=["id"],
    )
    assert side == {
        "type": "Trino",
        "scheme": "trino",
        "hostPort": "trino.test:8080",
        "catalog": "sales",
        "schema": "public",
        "table": "orders",
        "keyColumns": ["id"],
        "dialect": "trino",
    }
    assert "secret" not in json.dumps(side)


def test_azuresql_side_builds_table_specific_database() -> None:
    binding = datadiff_binding("azuresql")
    assert binding is not None
    side = build_side(
        binding,
        AZURESQL_CONNECTION,
        database="sales",
        schema="dbo",
        table="orders",
        key_columns=["id"],
    )
    assert side == {
        "type": "AzureSQL",
        "scheme": "mssql+pyodbc",
        "hostPort": "azuresql.test:1433",
        "database": "sales",
        "schema": "dbo",
        "table": "orders",
        "keyColumns": ["id"],
        "dialect": "mssql",
    }
    assert "secret" not in json.dumps(side)


def test_clickzetta_side_builds_workspace() -> None:
    binding = datadiff_binding("clickzetta")
    assert binding is not None
    assert binding.ident_style == "two"
    side = build_side(
        binding,
        CLICKZETTA_CONNECTION,
        database="workspace1",
        schema="public",
        table="orders",
        key_columns=["id"],
    )
    assert side == {
        "type": "ClickZetta",
        "scheme": "clickzetta",
        "hostPort": "instance1.svc.test:443",
        "workspace": "workspace1",
        "schema": "public",
        "table": "orders",
        "keyColumns": ["id"],
        "dialect": "clickzetta",
    }
    assert "secret" not in json.dumps(side)


def test_p2_5_key_sql_per_dialect() -> None:
    trino = SqlKeyFetcher(lambda: None, quote=quote_ansi, ident_style="three")
    assert trino.keys_sql("sales", "public", "orders", ["id", "code"]) == (
        'SELECT DISTINCT "id", "code" FROM "sales"."public"."orders"'
    )
    azuresql = SqlKeyFetcher(lambda: None, quote=quote_mssql, ident_style="three")
    assert azuresql.keys_sql("sales", "dbo", "orders", ["id"]) == (
        "SELECT DISTINCT [id] FROM [sales].[dbo].[orders]"
    )
    clickzetta = SqlKeyFetcher(lambda: None, quote=quote_clickzetta, ident_style="two")
    assert clickzetta.keys_sql("workspace1", "public", "orders", ["id"]) == (
        "SELECT DISTINCT `id` FROM `public`.`orders`"
    )
    assert (
        clickzetta.keys_sql("workspace1", "public", "orders", ["id"], where_clause="id > 0")
        == "SELECT DISTINCT `id` FROM `public`.`orders` WHERE id > 0"
    )


def test_quote_clickzetta_rejects_invalid_identifiers() -> None:
    assert quote_clickzetta("orders") == "`orders`"
    assert quote_clickzetta("col_1$x") == "`col_1$x`"
    for bad in ("", "a;b", "a b", 'a"b', "a`b", "a\nb"):
        with pytest.raises(WorkflowError, match="unsafe ClickZetta identifier"):
            quote_clickzetta(bad)


def test_p2_5_differ_compare_via_injected_fetch() -> None:
    for source_type in ("trino", "azuresql", "clickzetta"):
        binding = datadiff_binding(source_type)
        assert binding is not None
        differ = binding.differ(
            fetch_keys=lambda side: [(1,), (2,)] if side["table"] == "orders" else [(2,), (3,)]
        )
        outcome = differ.compare({"table": "orders"}, {"table": "orders_copy"})
        assert outcome["rowDiffCount"] == 2
        assert outcome["extraLeft"] == 1
        assert outcome["extraRight"] == 1


def test_trino_connect_maps_to_dbapi_kwargs() -> None:
    from smartmetadata_ingestion.connectors import trino_common as trino

    seen: dict[str, Any] = {}

    class _FakeAuth:
        def __init__(self, user, password):
            seen["auth_args"] = (user, password)

    def _fake_connect(**kwargs):
        seen.update(kwargs)
        return object()

    with (
        _stub_module("trino"),
        _stub_module("trino.dbapi", connect=_fake_connect),
        _stub_module("trino.auth", BasicAuthentication=_FakeAuth),
    ):
        connect = trino.trino_connect(TRINO_CONNECTION)
        connect()
    assert seen["host"] == "trino.test"
    assert seen["port"] == 8080
    assert seen["user"] == "ingest"
    assert seen["catalog"] == "warehouse"
    assert seen["http_scheme"] == "https"
    assert isinstance(seen["auth"], _FakeAuth)
    assert seen["auth_args"] == ("ingest", "secret")


def test_trino_connect_missing_driver_names_extra() -> None:
    from smartmetadata_ingestion.connectors import trino_common as trino

    for module in ("trino", "trino.dbapi", "trino.auth"):
        sys.modules.pop(module, None)
    with _blocked_imports("trino"):
        with pytest.raises(WorkflowError, match=r"smartmetadata-ingestion\[trino\]"):
            trino.trino_connect(TRINO_CONNECTION)


def test_azuresql_connect_uses_pytds_kwargs() -> None:
    from smartmetadata_ingestion.connectors import azuresql_common as azuresql

    seen: dict[str, Any] = {}

    def _fake_connect(**kwargs):
        seen.update(kwargs)
        return object()

    with _stub_module("pytds", connect=_fake_connect):
        connect = azuresql.azuresql_connect({**AZURESQL_CONNECTION, "scheme": "mssql+pytds"})
        connect()
    assert seen == {
        "server": "azuresql.test",
        "port": 1433,
        "database": "warehouse",
        "user": "ingest",
        "password": "secret",
    }


def test_azuresql_connect_missing_driver_names_extra() -> None:
    from smartmetadata_ingestion.connectors import azuresql_common as azuresql

    sys.modules.pop("pyodbc", None)
    with _blocked_imports("pyodbc"):
        with pytest.raises(WorkflowError, match=r"smartmetadata-ingestion\[mssql-odbc\]"):
            azuresql.azuresql_connect(AZURESQL_CONNECTION)


def test_clickzetta_connect_maps_to_vendor_dbapi() -> None:
    from smartmetadata_ingestion.connectors import clickzetta_common as clickzetta

    seen: dict[str, Any] = {}

    def _fake_connect(**kwargs):
        seen.update(kwargs)
        return object()

    with (
        _stub_module("clickzetta"),
        _stub_module("clickzetta.connector"),
        _stub_module("clickzetta.connector.v0"),
        _stub_module("clickzetta.connector.v0.dbapi", connect=_fake_connect),
    ):
        connect = clickzetta.clickzetta_connect(CLICKZETTA_CONNECTION)
        connect()
    assert seen == {
        "username": "ingest",
        "password": "secret",
        "instance": "instance1",
        "workspace": "workspace1",
        "vcluster": "vc1",
        "service": "svc.test:443",
        "schema": "public",
        "protocol": "https",
    }


def test_clickzetta_connect_missing_driver_names_extra() -> None:
    from smartmetadata_ingestion.connectors import clickzetta_common as clickzetta

    clickzetta_modules = (
        "clickzetta",
        "clickzetta.connector",
        "clickzetta.connector.v0",
        "clickzetta.connector.v0.dbapi",
    )
    for module in clickzetta_modules:
        sys.modules.pop(module, None)
    with _blocked_imports("clickzetta"):
        with pytest.raises(WorkflowError, match=r"smartmetadata-ingestion\[clickzetta\]"):
            clickzetta.clickzetta_connect(CLICKZETTA_CONNECTION)


def test_clickzetta_connect_rejects_host_without_instance() -> None:
    from smartmetadata_ingestion.connectors import clickzetta_common as clickzetta

    with (
        _stub_module("clickzetta"),
        _stub_module("clickzetta.connector"),
        _stub_module("clickzetta.connector.v0"),
        _stub_module("clickzetta.connector.v0.dbapi", connect=lambda **kwargs: object()),
    ):
        with pytest.raises(WorkflowError, match="instance"):
            clickzetta.clickzetta_connect({**CLICKZETTA_CONNECTION, "hostPort": "localhost:443"})
