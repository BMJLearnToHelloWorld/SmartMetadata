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
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx
import pytest

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.lineage.parser import TableColumn, TableColumnJoin
from smartmetadata_ingestion.usage.sink import UsageBulkSink
from smartmetadata_ingestion.usage.stage import TableUsageCount, calendar_date

DAY_MS = str(int(datetime(2026, 11, 13, tzinfo=timezone.utc).timestamp() * 1000))
TABLE_FQN = "warehouse.shop.public.orders"
TABLE_ID = "11111111-1111-1111-1111-111111111111"
QUERY_TEXT = "SELECT * FROM shop.orders WHERE total > ?"
QUERY_HASH = hashlib.md5(QUERY_TEXT.encode("utf-8")).hexdigest()
QUERY_ID = "22222222-2222-2222-2222-222222222222"


def _server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="t"),
    )


def _write_usage_file(stage_dir: Path, record: TableUsageCount) -> None:
    path = stage_dir / f"warehouse_{calendar_date(record.date)}"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(json.dumps(record.to_dict())) + "\n")


def _write_cost_file(stage_dir: Path, line: dict[str, Any]) -> None:
    path = stage_dir / f"warehouse_{calendar_date(str(line['date']))}_query"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(line) + "\n")


def _usage_record(**overrides: Any) -> TableUsageCount:
    values: dict[str, Any] = {
        "table": TABLE_FQN,
        "date": DAY_MS,
        "database_name": "shop",
        "database_schema": "public",
        "count": 3,
        "joins": [
            TableColumnJoin(
                table_column=TableColumn(table=TABLE_FQN, column="cust_id"),
                joined_with=(
                    TableColumn(
                        table="warehouse.shop.public.customers",
                        column="id",
                    ),
                ),
            )
        ],
        "sql_queries": [
            {
                "query": QUERY_TEXT,
                "query_type": "SELECT",
                "exclude_usage": False,
                "duration": 1.5,
                "dialect": "postgres",
                "queryDate": int(DAY_MS),
                "service": "warehouse",
                "users": ["alice"],
            }
        ],
        "service_name": "warehouse",
    }
    values.update(overrides)
    return TableUsageCount(**values)


class _Catalog:
    """A mock catalog: table lookup, query create, and the five-write
    endpoints, recording every request for assertion."""

    def __init__(
        self,
        *,
        table: dict[str, Any] | None = None,
        missing_table: bool = False,
        tables: dict[str, dict[str, Any]] | None = None,
        missing_fqns: frozenset[str] = frozenset(),
        users: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        if table is not None:
            self.table = table
        else:
            self.table = {"id": TABLE_ID, "fullyQualifiedName": TABLE_FQN}
        self.missing_table = missing_table
        self.tables = tables or {}
        self.missing_fqns = set(missing_fqns)
        self.users = users or {}
        self.seen: list[tuple[str, str, Any, str | None]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        body = json.loads(request.content) if request.content else None
        self.seen.append((request.method, path, body, request.headers.get("content-type")))
        if request.method == "GET" and path.startswith("/api/v1/tables/name/"):
            fqn = path[len("/api/v1/tables/name/") :]
            if (self.missing_table and fqn == TABLE_FQN) or fqn in self.missing_fqns:
                return httpx.Response(404, json={"message": "not found"})
            if fqn == TABLE_FQN:
                return httpx.Response(200, json=self.table)
            if fqn in self.tables:
                return httpx.Response(200, json=self.tables[fqn])
            return httpx.Response(200, json={})
        if request.method == "GET" and path.startswith("/api/v1/users/name/"):
            name = path[len("/api/v1/users/name/") :]
            if name in self.users:
                return httpx.Response(200, json=self.users[name])
            return httpx.Response(404, json={"message": "not found"})
        if request.method == "PUT" and path == "/api/v1/queries":
            return httpx.Response(
                200,
                json={
                    "id": QUERY_ID,
                    "name": QUERY_HASH,
                    "checksum": QUERY_HASH,
                    "fullyQualifiedName": f"warehouse.{QUERY_HASH}",
                },
            )
        return httpx.Response(200, json={})

    def calls(self, method: str, suffix: str) -> list[tuple[str, str, Any, str | None]]:
        return [call for call in self.seen if call[0] == method and call[1].endswith(suffix)]


def test_sink_performs_all_five_writes(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_usage_file(tmp_path, _usage_record())
    _write_cost_file(
        tmp_path,
        {
            "queryHash": QUERY_HASH,
            "date": DAY_MS,
            "cost": 15.0,
            "count": 2,
            "query": QUERY_TEXT,
            "dialect": "postgres",
            "totalDuration": 6.0,
        },
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        sink = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse")
        report = sink.run()

    assert report.failures == []
    assert report.tables_published == 1
    assert report.queries_published == 1
    assert report.joins_published == 1
    assert report.lifecycle_patched == 1
    assert report.cost_records_published == 1

    # Write 1: counts, by id, calendar date.
    counts = catalog.calls("POST", f"/api/v1/usage/table/{TABLE_ID}")
    assert len(counts) == 1
    assert counts[0][2] == {"date": "2026-11-13", "count": 3}

    # Write 2: query create + usage/users links.
    creates = catalog.calls("PUT", "/api/v1/queries")
    assert len(creates) == 1
    assert creates[0][2]["query"] == QUERY_TEXT
    assert creates[0][2]["users"] == ["alice"]
    usage_links = catalog.calls("PUT", f"/api/v1/queries/{QUERY_ID}/usage")
    assert usage_links[0][2] == [{"id": TABLE_ID, "type": "table"}]
    user_links = catalog.calls("PUT", f"/api/v1/queries/{QUERY_ID}/users")
    assert user_links[0][2] == ["alice"]
    assert catalog.calls("PUT", f"/api/v1/queries/{QUERY_ID}/usedBy") == []

    # Write 3: joins with a LOCAL columnName and FQN joinedWith.
    joins = catalog.calls("PUT", f"/api/v1/tables/{TABLE_ID}/joins")
    assert len(joins) == 1
    assert joins[0][2] == {
        "startDate": "2026-11-13",
        "dayCount": 1,
        "columnJoins": [
            {
                "columnName": "cust_id",
                "joinedWith": [
                    {
                        "fullyQualifiedName": "warehouse.shop.public.customers.id",
                        "joinCount": 1,
                    }
                ],
            }
        ],
        "directTableJoins": [],
    }

    # Write 4: lifecycle JSON-Patch with the JSON-Patch media type.
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    assert len(patches) == 1
    assert patches[0][3] == "application/json-patch+json"
    assert patches[0][2] == [
        {"op": "add", "path": "/lifeCycle", "value": {"accessed": {"timestamp": int(DAY_MS)}}}
    ]

    # Write 5: cost record referencing the created query.
    costs = catalog.calls("POST", "/api/v1/queryCostRecord")
    assert len(costs) == 1
    assert costs[0][2] == {
        "timestamp": int(DAY_MS),
        "queryReference": {
            "id": QUERY_ID,
            "type": "query",
            "fullyQualifiedName": f"warehouse.{QUERY_HASH}",
        },
        "cost": 15.0,
        "count": 2,
        "totalDuration": 6.0,
    }


def test_sink_replaces_lifecycle_with_fresh_derivation(tmp_path: Path) -> None:
    existing_ms = int(DAY_MS) + 86_400_000  # one day newer than the staged query
    catalog = _Catalog(
        table={
            "id": TABLE_ID,
            "fullyQualifiedName": TABLE_FQN,
            "lifeCycle": {
                "created": {"timestamp": existing_ms},
                "accessed": {"timestamp": existing_ms},
            },
        }
    )
    _write_usage_file(tmp_path, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    # REPLACE semantics: the patch carries only the fresh derivation
    # (the staged SELECT's access), dropping the existing `created`
    # aspect even though it is newer.
    assert report.lifecycle_patched == 1
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    assert len(patches) == 1
    assert patches[0][2] == [
        {"op": "add", "path": "/lifeCycle", "value": {"accessed": {"timestamp": int(DAY_MS)}}}
    ]


def test_sink_skips_cost_records_without_a_created_query(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_cost_file(
        tmp_path,
        {
            "queryHash": "0" * 32,
            "date": DAY_MS,
            "cost": 5.0,
            "count": 1,
            "query": "SELECT 1",
            "dialect": "postgres",
            "totalDuration": 1.0,
        },
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.cost_records_skipped == 1
    assert report.cost_records_published == 0
    assert report.failures == []
    assert catalog.calls("POST", "/api/v1/queryCostRecord") == []


def test_sink_records_failure_when_staged_table_is_gone(tmp_path: Path) -> None:
    catalog = _Catalog(missing_table=True)
    _write_usage_file(tmp_path, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert len(report.failures) == 1
    assert "no longer in the catalog" in report.failures[0]
    assert report.tables_published == 0


def test_sink_records_corrupt_lines_and_continues(tmp_path: Path) -> None:
    catalog = _Catalog()
    path = tmp_path / "warehouse_2026-11-13"
    path.write_text("not json\n", encoding="utf-8")
    _write_usage_file(tmp_path, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert len(report.failures) == 1
    assert "corrupt staged line" in report.failures[0]
    assert report.tables_published == 1


def test_sink_aggregates_counts_across_staged_lines(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_usage_file(tmp_path, _usage_record(count=3, joins=[]))
    _write_usage_file(tmp_path, _usage_record(count=2, joins=[]))
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.failures == []
    counts = catalog.calls("POST", f"/api/v1/usage/table/{TABLE_ID}")
    assert len(counts) == 1
    assert counts[0][2]["count"] == 5
    # The same query staged twice creates once.
    assert len(catalog.calls("PUT", "/api/v1/queries")) == 1


def test_sink_close_deletes_staging_directory(tmp_path: Path) -> None:
    catalog = _Catalog()
    stage_dir = tmp_path / "staging"
    stage_dir.mkdir()
    _write_usage_file(stage_dir, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        sink = UsageBulkSink(client, stage_dir=stage_dir, service_name="warehouse")
        sink.run()
        sink.close()
    assert not stage_dir.exists()
    sink.close()  # idempotent


def test_sink_derives_lifecycle_from_underscore_joined_types(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[],
            sql_queries=[
                {
                    "query": "CREATE TABLE shop.orders (id INT)",
                    "query_type": "CREATE_TABLE",
                    "exclude_usage": True,
                    "dialect": "snowflake",
                    "queryDate": int(DAY_MS),
                    "service": "warehouse",
                }
            ],
        ),
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.lifecycle_patched == 1
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    assert patches[0][2] == [
        {"op": "add", "path": "/lifeCycle", "value": {"created": {"timestamp": int(DAY_MS)}}}
    ]


def test_sink_skips_joins_write_without_column_joins(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_usage_file(tmp_path, _usage_record(joins=[]))
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.joins_published == 0
    assert catalog.calls("PUT", f"/api/v1/tables/{TABLE_ID}/joins") == []


USER_ID = "33333333-3333-3333-3333-333333333333"
CUSTOMERS_FQN = "warehouse.shop.public.customers"


def _query_request(query: str, query_type: str, *, date_ms: int, **extra: Any) -> dict[str, Any]:
    request: dict[str, Any] = {
        "query": query,
        "query_type": query_type,
        "exclude_usage": False,
        "dialect": "postgres",
        "queryDate": date_ms,
        "service": "warehouse",
    }
    request.update(extra)
    return request


def test_sink_lifecycle_carries_accessed_by_reference(tmp_path: Path) -> None:
    catalog = _Catalog(users={"alice": {"id": USER_ID, "fullyQualifiedName": "alice"}})
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[],
            sql_queries=[
                _query_request(
                    QUERY_TEXT,
                    "SELECT",
                    date_ms=int(DAY_MS),
                    users=["alice"],
                    usedBy=["alice"],
                )
            ],
        ),
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.lifecycle_patched == 1
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    assert patches[0][2] == [
        {
            "op": "add",
            "path": "/lifeCycle",
            "value": {
                "accessed": {
                    "timestamp": int(DAY_MS),
                    "accessedBy": {
                        "id": USER_ID,
                        "type": "user",
                        "fullyQualifiedName": "alice",
                    },
                }
            },
        }
    ]


def test_sink_lifecycle_carries_accessed_by_process_for_unknown_users(tmp_path: Path) -> None:
    catalog = _Catalog()
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[],
            sql_queries=[
                _query_request(
                    QUERY_TEXT, "SELECT", date_ms=int(DAY_MS), usedBy=["etl-bot"]
                )
            ],
        ),
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.lifecycle_patched == 1
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    assert patches[0][2][0]["value"] == {
        "accessed": {"timestamp": int(DAY_MS), "accessedByAProcess": "etl-bot"}
    }


def test_sink_lifecycle_maps_show_describe_and_truncate_table(tmp_path: Path) -> None:
    catalog = _Catalog()
    base = int(DAY_MS)
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[],
            sql_queries=[
                _query_request("SHOW TABLES", "SHOW", date_ms=base),
                _query_request("DESCRIBE shop.orders", "DESCRIBE", date_ms=base + 1000),
                _query_request("TRUNCATE TABLE shop.orders", "TRUNCATE", date_ms=base + 2000),
                _query_request(
                    "TRUNCATE TABLE shop.orders RESTART IDENTITY",
                    "TRUNCATE_TABLE",
                    date_ms=base + 3000,
                ),
            ],
        ),
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.lifecycle_patched == 1
    patches = catalog.calls("PATCH", f"/api/v1/tables/{TABLE_ID}")
    # SHOW/DESCRIBE read as accesses (latest wins); bare TRUNCATE
    # maps to nothing; TRUNCATE_TABLE reads as an update.
    assert patches[0][2][0]["value"] == {
        "accessed": {"timestamp": base + 1000},
        "updated": {"timestamp": base + 3000},
    }


def test_sink_validates_join_columns_against_catalog(tmp_path: Path) -> None:
    catalog = _Catalog(
        table={
            "id": TABLE_ID,
            "fullyQualifiedName": TABLE_FQN,
            "columns": [{"name": "CUST_ID"}, {"name": "other"}],
        },
        tables={
            CUSTOMERS_FQN: {
                "id": "44444444-4444-4444-4444-444444444444",
                "columns": [{"name": "ID"}],
            }
        },
    )
    _write_usage_file(tmp_path, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.failures == []
    joins = catalog.calls("PUT", f"/api/v1/tables/{TABLE_ID}/joins")
    assert len(joins) == 1
    # Catalog spellings win on both sides of the join.
    assert joins[0][2]["columnJoins"] == [
        {
            "columnName": "CUST_ID",
            "joinedWith": [
                {"fullyQualifiedName": f"{CUSTOMERS_FQN}.ID", "joinCount": 1}
            ],
        }
    ]


def test_sink_drops_joins_with_unresolvable_columns(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    catalog = _Catalog(
        table={
            "id": TABLE_ID,
            "fullyQualifiedName": TABLE_FQN,
            "columns": [{"name": "cust_id"}],
        },
        tables={
            CUSTOMERS_FQN: {
                "id": "44444444-4444-4444-4444-444444444444",
                "columns": [{"name": "id"}],
            }
        },
    )
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[
                TableColumnJoin(
                    table_column=TableColumn(table=TABLE_FQN, column="ghost"),
                    joined_with=(TableColumn(table=CUSTOMERS_FQN, column="id"),),
                ),
                TableColumnJoin(
                    table_column=TableColumn(table=TABLE_FQN, column="cust_id"),
                    joined_with=(TableColumn(table=CUSTOMERS_FQN, column="ghost"),),
                ),
                TableColumnJoin(
                    table_column=TableColumn(table=TABLE_FQN, column="cust_id"),
                    joined_with=(TableColumn(table=CUSTOMERS_FQN, column="id"),),
                ),
            ]
        ),
    )
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.sink"):
        with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
            report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.failures == []
    assert report.joins_published == 1
    joins = catalog.calls("PUT", f"/api/v1/tables/{TABLE_ID}/joins")
    assert len(joins) == 1
    assert joins[0][2]["columnJoins"] == [
        {
            "columnName": "cust_id",
            "joinedWith": [
                {"fullyQualifiedName": f"{CUSTOMERS_FQN}.id", "joinCount": 1}
            ],
        }
    ]
    assert caplog.text.count("Dropping join") == 2


def test_sink_counts_dropped_joins(tmp_path: Path) -> None:
    # C-11/B-4: each join dropped by catalog-column validation counts
    # once, for the workflow to fold into processor-step warnings.
    catalog = _Catalog(
        table={
            "id": TABLE_ID,
            "fullyQualifiedName": TABLE_FQN,
            "columns": [{"name": "cust_id"}],
        },
        tables={
            CUSTOMERS_FQN: {
                "id": "44444444-4444-4444-4444-444444444444",
                "columns": [{"name": "id"}],
            }
        },
    )
    _write_usage_file(
        tmp_path,
        _usage_record(
            joins=[
                TableColumnJoin(
                    table_column=TableColumn(table=TABLE_FQN, column="ghost"),
                    joined_with=(TableColumn(table=CUSTOMERS_FQN, column="id"),),
                )
            ]
        ),
    )
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        sink = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse")
        report = sink.run()
    assert report.failures == []
    assert report.joins_published == 0
    assert sink.join_drops == 1


def test_sink_drops_joins_when_partner_table_is_gone(tmp_path: Path) -> None:
    catalog = _Catalog(missing_fqns=frozenset({CUSTOMERS_FQN}))
    _write_usage_file(tmp_path, _usage_record())
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        report = UsageBulkSink(client, stage_dir=tmp_path, service_name="warehouse").run()
    assert report.failures == []
    assert report.joins_published == 0
    assert catalog.calls("PUT", f"/api/v1/tables/{TABLE_ID}/joins") == []


def test_sink_close_leaves_other_files_intact(tmp_path: Path) -> None:
    catalog = _Catalog()
    stage_dir = tmp_path / "staging"
    stage_dir.mkdir()
    _write_usage_file(stage_dir, _usage_record())
    (stage_dir / "other_2026-11-13").write_text("keep\n", encoding="utf-8")
    (stage_dir / "warehouse_subdir").mkdir()
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        sink = UsageBulkSink(client, stage_dir=stage_dir, service_name="warehouse")
        sink.close()
    assert not (stage_dir / "warehouse_2026-11-13").exists()
    assert (stage_dir / "other_2026-11-13").read_text(encoding="utf-8") == "keep\n"
    assert (stage_dir / "warehouse_subdir").is_dir()
    assert stage_dir.exists()


def test_sink_close_posts_percentiles_for_table_and_database(tmp_path: Path) -> None:
    catalog = _Catalog()
    stage_dir = tmp_path / "staging"
    stage_dir.mkdir()
    today = date.today().isoformat()
    with RestClient(_server(), transport=httpx.MockTransport(catalog.handler)) as client:
        sink = UsageBulkSink(client, stage_dir=stage_dir, service_name="warehouse")
        sink.close()
    percentile_posts = catalog.calls("POST", f"/compute.percentile/table/{today}")
    assert len(percentile_posts) == 1
    assert percentile_posts[0][2] is None
    assert len(catalog.calls("POST", f"/compute.percentile/database/{today}")) == 1


def test_sink_close_tolerates_percentile_failure(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    catalog = _Catalog()

    def failing_handler(request: httpx.Request) -> httpx.Response:
        if "compute.percentile" in request.url.path:
            return httpx.Response(500, json={"message": "boom"})
        return catalog.handler(request)

    stage_dir = tmp_path / "staging"
    stage_dir.mkdir()
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.usage.sink"):
        with RestClient(_server(), transport=httpx.MockTransport(failing_handler)) as client:
            sink = UsageBulkSink(client, stage_dir=stage_dir, service_name="warehouse")
            sink.close()  # must not raise
    assert "Percentile computation for table failed" in caplog.text
    assert "Percentile computation for database failed" in caplog.text
