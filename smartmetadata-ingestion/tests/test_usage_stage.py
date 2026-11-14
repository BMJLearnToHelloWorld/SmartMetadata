# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from smartmetadata_ingestion.client.rest import TABLES_PATH
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.parser import TableColumn, TableColumnJoin
from smartmetadata_ingestion.usage.processor import ParsedData
from smartmetadata_ingestion.usage.stage import (
    RestTableBindingResolver,
    TableUsageCount,
    UsageStage,
    UserResolver,
    calendar_date,
    stored_query_hash,
)

DAY_MS = str(int(datetime(2026, 11, 13, tzinfo=timezone.utc).timestamp() * 1000))


def _parsed(**overrides: Any) -> ParsedData:
    values: dict[str, Any] = {
        "tables": ["shop.orders"],
        "joins": {},
        "database_name": "shop",
        "database_schema": "public",
        "sql": "SELECT * FROM shop.orders WHERE total > 100",
        "query_type": "SELECT",
        "exclude_usage": False,
        "dialect": "postgres",
        "user_name": "alice",
        "date": DAY_MS,
        "service_name": "warehouse",
        "duration": 1.5,
        "cost": None,
        "masked_sql": "SELECT * FROM shop.orders WHERE total > ?",
        "query_hash": "deadbeef",
        "parser_name": "SqlGlot",
    }
    values.update(overrides)
    return ParsedData(**values)


class _DictResolver:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def resolve(
        self, parsed_name: str, *, database_name: str | None, database_schema: str | None
    ) -> str | None:
        return self.mapping.get(parsed_name)


class _StubUserClient:
    def __init__(self, users: dict[str, str]) -> None:
        self.users = users
        self.calls: list[str] = []

    def get_user_by_name(self, name: str) -> dict[str, Any]:
        self.calls.append(name)
        if name not in self.users:
            raise RestError("not found", status_code=404)
        return {"fullyQualifiedName": self.users[name]}


def _read_usage_lines(stage_dir: Path, file_name: str) -> list[dict[str, Any]]:
    lines = (stage_dir / file_name).read_text(encoding="utf-8").splitlines()
    # Usage lines are double-encoded: a JSON string holding the record JSON.
    return [json.loads(json.loads(line)) for line in lines]


def _read_cost_lines(stage_dir: Path, file_name: str) -> list[dict[str, Any]]:
    lines = (stage_dir / file_name).read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines]


def test_stage_writes_usage_file_with_masked_query_and_resolved_user(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
        user_resolver=UserResolver(_StubUserClient({"alice": "alice"})),  # type: ignore[arg-type]
    )
    stage.handle_batch([_parsed()])

    lines = _read_usage_lines(tmp_path, "warehouse_2026-11-13")
    assert len(lines) == 1
    record = lines[0]
    assert record["table"] == "warehouse.shop.public.orders"
    assert record["date"] == DAY_MS
    assert record["count"] == 1
    assert record["serviceName"] == "warehouse"
    assert len(record["sqlQueries"]) == 1
    request = record["sqlQueries"][0]
    assert request["query"] == "SELECT * FROM shop.orders WHERE total > ?"
    assert "name" not in request
    assert request["query_type"] == "SELECT"
    assert request["duration"] == 1.5
    assert request["dialect"] == "postgres"
    assert request["queryDate"] == int(DAY_MS)
    assert request["service"] == "warehouse"
    assert request["users"] == ["alice"]
    assert request["usedBy"] == ["alice"]


def test_stage_stores_raw_text_when_exclude_usage(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
    )
    stage.handle_batch([_parsed(exclude_usage=True)])
    request = _read_usage_lines(tmp_path, "warehouse_2026-11-13")[0]["sqlQueries"][0]
    assert request["query"] == "SELECT * FROM shop.orders WHERE total > 100"
    assert request["exclude_usage"] is True


def test_stage_puts_unknown_users_in_used_by(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
        user_resolver=UserResolver(_StubUserClient({})),  # type: ignore[arg-type]
    )
    stage.handle_batch([_parsed()])
    request = _read_usage_lines(tmp_path, "warehouse_2026-11-13")[0]["sqlQueries"][0]
    assert request["usedBy"] == ["alice"]
    assert "users" not in request


def test_stage_counts_executions_and_dedupes_queries_per_batch(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
    )
    stage.handle_batch(
        [
            _parsed(),
            _parsed(),
            _parsed(
                sql="SELECT id FROM shop.orders",
                masked_sql="SELECT id FROM shop.orders",
            ),
        ]
    )
    record = _read_usage_lines(tmp_path, "warehouse_2026-11-13")[0]
    assert record["count"] == 3
    # Same masked text twice + one distinct query.
    assert len(record["sqlQueries"]) == 2


def test_stage_skips_unresolvable_tables(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({}),
    )
    stage.handle_batch([_parsed()])
    # No usage file: the table could not be bound. The cost file IS
    # written: cost aggregates regardless of binding.
    assert not (tmp_path / "warehouse_2026-11-13").exists()
    lines = _read_cost_lines(tmp_path, "warehouse_2026-11-13_query")
    assert len(lines) == 1
    assert lines[0]["count"] == 1
    assert lines[0]["cost"] == 0.0


def test_stage_cleans_own_service_stale_files_at_start(tmp_path: Path) -> None:
    # A killed run's staged files must not be re-published by the
    # next run; other services' files and subdirectories survive.
    (tmp_path / "warehouse_2026-11-12").write_text("stale\n", encoding="utf-8")
    (tmp_path / "warehouse_2026-11-12_query").write_text("stale\n", encoding="utf-8")
    (tmp_path / "other_2026-11-12").write_text("keep\n", encoding="utf-8")
    (tmp_path / "warehouse_subdir").mkdir()
    UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({}),
    )
    assert not (tmp_path / "warehouse_2026-11-12").exists()
    assert not (tmp_path / "warehouse_2026-11-12_query").exists()
    assert (tmp_path / "other_2026-11-12").read_text(encoding="utf-8") == "keep\n"
    assert (tmp_path / "warehouse_subdir").is_dir()


def test_stage_rewrites_join_tables_to_fqns_and_drops_unknown_partners(
    tmp_path: Path,
) -> None:
    joins = {
        "shop.orders": [
            TableColumnJoin(
                table_column=TableColumn(table="shop.orders", column="cust_id"),
                joined_with=(
                    TableColumn(table="shop.customers", column="id"),
                    TableColumn(table="shop.ghost", column="id"),
                ),
            )
        ]
    }
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver(
            {
                "shop.orders": "warehouse.shop.public.orders",
                "shop.customers": "warehouse.shop.public.customers",
            }
        ),
    )
    stage.handle_batch([_parsed(tables=["shop.orders", "shop.customers"], joins=joins)])
    record = _read_usage_lines(tmp_path, "warehouse_2026-11-13")[0]
    assert record["joins"] == [
        {
            "tableColumn": {"table": "warehouse.shop.public.orders", "column": "cust_id"},
            "joinedWith": [{"table": "warehouse.shop.public.customers", "column": "id"}],
        }
    ]


def test_stage_aggregates_cost_per_query_and_day(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
    )
    stage.handle_batch(
        [
            _parsed(cost=10.0, duration=2.0),
            _parsed(cost=20.0, duration=4.0),
            _parsed(cost=None, duration=9.0),
        ]
    )
    lines = _read_cost_lines(tmp_path, "warehouse_2026-11-13_query")
    assert len(lines) == 1
    line = lines[0]
    assert line["queryHash"] == stored_query_hash("SELECT * FROM shop.orders WHERE total > ?")
    # SUM over every execution, including the cost-less one at +0;
    # duration sums over all three executions.
    assert line["cost"] == 30.0
    assert line["count"] == 3
    assert line["totalDuration"] == 15.0
    assert line["query"] == "SELECT * FROM shop.orders WHERE total > ?"
    assert line["dialect"] == "postgres"


def test_stage_writes_cost_file_with_zero_cost_without_cost_values(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
    )
    stage.handle_batch([_parsed()])
    lines = _read_cost_lines(tmp_path, "warehouse_2026-11-13_query")
    assert len(lines) == 1
    assert lines[0]["cost"] == 0.0
    assert lines[0]["count"] == 1


def test_stage_appends_across_batches(tmp_path: Path) -> None:
    stage = UsageStage(
        stage_dir=tmp_path,
        service_name="warehouse",
        binding_resolver=_DictResolver({"shop.orders": "warehouse.shop.public.orders"}),
    )
    stage.handle_batch([_parsed()])
    stage.handle_batch([_parsed()])
    assert len(_read_usage_lines(tmp_path, "warehouse_2026-11-13")) == 2


def test_table_usage_count_round_trips() -> None:
    record = TableUsageCount(
        table="warehouse.shop.public.orders",
        date=DAY_MS,
        database_name="shop",
        database_schema="public",
        count=2,
        joins=[
            TableColumnJoin(
                table_column=TableColumn(table="warehouse.shop.public.orders", column="id"),
                joined_with=(TableColumn(table="warehouse.shop.public.customers", column="id"),),
            )
        ],
        sql_queries=[{"query": "SELECT 1", "service": "warehouse"}],
        service_name="warehouse",
    )
    assert TableUsageCount.from_dict(record.to_dict()) == record


def test_calendar_date() -> None:
    assert calendar_date(DAY_MS) == "2026-11-13"


def test_stored_query_hash_matches_md5_of_text() -> None:
    text = "SELECT * FROM t"
    assert stored_query_hash(text) == hashlib.md5(text.encode("utf-8")).hexdigest()


class _StubTableClient:
    def __init__(
        self,
        tables: dict[str, dict[str, Any]],
        schema_listings: dict[str, list[dict[str, Any]]] | None = None,
        error_status: int | None = None,
    ) -> None:
        self.tables = tables
        self.schema_listings = schema_listings or {}
        self.error_status = error_status
        self.lookups: list[str] = []

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        self.lookups.append(fqn)
        if self.error_status is not None:
            raise RestError("boom", status_code=self.error_status)
        if fqn not in self.tables:
            raise RestError("not found", status_code=404)
        return self.tables[fqn]

    def iter_collection(self, path: str, limit: int = 100, extra_params=None):
        assert path == TABLES_PATH
        yield from self.schema_listings.get((extra_params or {}).get("databaseSchema", ""), [])


def test_resolver_exact_fqn_from_three_part_name() -> None:
    client = _StubTableClient(
        {"warehouse.shop.public.orders": {"fullyQualifiedName": "warehouse.shop.public.orders"}}
    )
    resolver = RestTableBindingResolver(client, "warehouse")  # type: ignore[arg-type]
    assert (
        resolver.resolve("shop.public.orders", database_name=None, database_schema=None)
        == "warehouse.shop.public.orders"
    )


def test_resolver_uses_row_context_for_two_part_names() -> None:
    client = _StubTableClient(
        {"warehouse.shop.public.orders": {"fullyQualifiedName": "warehouse.shop.public.orders"}}
    )
    resolver = RestTableBindingResolver(client, "warehouse")  # type: ignore[arg-type]
    assert (
        resolver.resolve("public.orders", database_name="shop", database_schema=None)
        == "warehouse.shop.public.orders"
    )


def test_resolver_uses_connection_defaults_for_bare_names() -> None:
    client = _StubTableClient(
        {"warehouse.shop.public.orders": {"fullyQualifiedName": "warehouse.shop.public.orders"}}
    )
    resolver = RestTableBindingResolver(  # type: ignore[arg-type]
        client, "warehouse", default_database="shop", default_schema="public"
    )
    assert (
        resolver.resolve("orders", database_name=None, database_schema=None)
        == "warehouse.shop.public.orders"
    )


def test_resolver_falls_back_to_case_insensitive_schema_scan() -> None:
    client = _StubTableClient(
        {},
        schema_listings={
            "warehouse.SHOP.PUBLIC": [
                {"name": "ORDERS", "fullyQualifiedName": "warehouse.SHOP.PUBLIC.ORDERS"}
            ]
        },
    )
    resolver = RestTableBindingResolver(client, "warehouse")  # type: ignore[arg-type]
    assert (
        resolver.resolve("orders", database_name="SHOP", database_schema="PUBLIC")
        == "warehouse.SHOP.PUBLIC.ORDERS"
    )


def test_resolver_skips_ambiguous_case_insensitive_matches() -> None:
    client = _StubTableClient(
        {},
        schema_listings={
            "warehouse.shop.public": [
                {"name": "Orders", "fullyQualifiedName": "warehouse.shop.public.Orders"},
                {"name": "ORDERS", "fullyQualifiedName": "warehouse.shop.public.ORDERS"},
            ]
        },
    )
    resolver = RestTableBindingResolver(client, "warehouse")  # type: ignore[arg-type]
    assert resolver.resolve("orders", database_name="shop", database_schema="public") is None


def test_resolver_propagates_non_404_errors() -> None:
    client = _StubTableClient({}, error_status=500)
    resolver = RestTableBindingResolver(client, "warehouse")  # type: ignore[arg-type]
    with pytest.raises(RestError):
        resolver.resolve("shop.public.orders", database_name=None, database_schema=None)


def test_resolver_returns_none_when_nothing_matches() -> None:
    resolver = RestTableBindingResolver(_StubTableClient({}), "warehouse")  # type: ignore[arg-type]
    assert resolver.resolve("orders", database_name=None, database_schema=None) is None


def test_resolver_quiet_probe_warns_only_when_called_loudly(
    caplog: pytest.LogCaptureFixture,
) -> None:
    resolver = RestTableBindingResolver(_StubTableClient({}), "warehouse")  # type: ignore[arg-type]
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        assert (
            resolver.resolve("ghost", database_name=None, database_schema=None, quiet=True)
            is None
        )
    assert "ghost" not in caplog.text
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.stage"):
        resolver.warn_unresolved("ghost")
    assert "ghost" in caplog.text


def test_user_resolver_caches_lookups() -> None:
    client = _StubUserClient({"alice": "alice"})
    resolver = UserResolver(client)  # type: ignore[arg-type]
    assert resolver.resolve("alice") == (["alice"], ["alice"])
    assert resolver.resolve("alice") == (["alice"], ["alice"])
    assert client.calls == ["alice"]
    assert resolver.resolve("mallory") == ([], ["mallory"])
