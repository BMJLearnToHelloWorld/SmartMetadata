# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    DataDiffSideSpec,
    DataDiffSpec,
    ProfileSpec,
    ServerConfig,
    SourceConfig,
    TestCaseResultSpec,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.datadiff import (
    SqlRowFetcher,
    _norm_key,
    _values_equal,
    datadiff_binding,
    run_data_diff_spec,
)
from smartmetadata_ingestion.errors import WorkflowInitializationError
from smartmetadata_ingestion.jobs import DataDiffJob
from smartmetadata_ingestion.records import TestCaseResultRecord
from smartmetadata_ingestion.runner import run_workflow


class CollectingSink:
    def __init__(self) -> None:
        self.written: list = []

    def write(self, record) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None


class StubSource:
    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self):
        return iter(())


def _client(config: WorkflowConfig) -> RestClient:
    return RestClient(
        config.server,
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
    )


def _config(
    *,
    type: str,
    data_diffs: list[DataDiffSpec] | None = None,
    source_type: str = "postgres",
    connection: dict[str, Any] | None = None,
    profiles: list[ProfileSpec] | None = None,
    test_case_results: list[TestCaseResultSpec] | None = None,
) -> WorkflowConfig:
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-datadiff", type=type),
        server=ServerConfig(
            host_port="http://catalog.test/api",
            auth=AuthConfig(type="jwt", jwt_token="<redacted>"),
        ),
        source=SourceConfig(
            type=source_type,
            service_name="warehouse",
            connection=connection
            or {
                "hostPort": "localhost:5432",
                "username": "ingest",
                "password": "secret",
                "database": "analytics",
            },
            include_schemas=["public"],
        ),
        profiles=profiles or [],
        test_case_results=test_case_results or [],
        data_diffs=data_diffs or [],
    )


def _side(
    table: str,
    *,
    database: str = "warehouse",
    schema: str = "public",
    key_columns: list[str] | None = None,
    **extra: Any,
) -> DataDiffSideSpec:
    return DataDiffSideSpec(
        database=database,
        schema=schema,
        table=table,
        key_columns=key_columns or ["id"],
        **extra,
    )


def _spec(
    test_case_fqn: str,
    left_table: str,
    right_table: str,
    *,
    threshold: int = 0,
    **side_extra: Any,
) -> DataDiffSpec:
    return DataDiffSpec(
        test_case_fqn=test_case_fqn,
        left=_side(left_table, **side_extra),
        right=_side(right_table, **side_extra),
        threshold=threshold,
    )


def _fetch_keys(mapping: dict[str, list[tuple[Any, ...]]]):
    def _fetch(side: dict[str, Any]):
        return mapping[side["table"]]

    return _fetch


def _fetch_rows(mapping: dict[str, list[tuple[Any, ...]]]):
    """Inject full ``key + extra`` rows per side table (row-mode engine)."""

    def _fetch(side: dict[str, Any]):
        return mapping[side["table"]]

    return _fetch


def _row_spec(
    test_case_fqn: str,
    *,
    threshold: int = 0,
    extra_columns: list[str] | None = None,
) -> DataDiffSpec:
    return DataDiffSpec(
        test_case_fqn=test_case_fqn,
        left=_side(
            "orders",
            extra_columns=extra_columns if extra_columns is not None else ["email"],
            key_column_types={"id": "INT"},
        ),
        right=_side(
            "orders_v2",
            extra_columns=extra_columns if extra_columns is not None else ["email"],
            key_column_types={"id": "INT"},
        ),
        threshold=threshold,
    )


def _run_row_spec(
    spec: DataDiffSpec,
    mapping: dict[str, list[tuple[Any, ...]]],
    *,
    schema_compared: bool = True,
    compute_counts: bool = True,
) -> TestCaseResultRecord:
    return run_data_diff_spec(
        spec,
        left_binding=datadiff_binding("postgres"),
        right_binding=datadiff_binding("postgres"),
        default_connection={
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": "analytics",
        },
        fetch_rows=_fetch_rows(mapping),
        compute_counts=compute_counts,
        schema_compared=schema_compared,
        timestamp=1000,
    )


def test_data_diff_workflow_compares_and_writes_result() -> None:
    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[_spec("suite.diff", "orders", "orders_copy")],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys({"orders": [(1,), (2,)], "orders_copy": [(2,), (3,)]}),
    )
    assert report.ok()
    assert report.succeeded == 1
    assert len(sink.written) == 1
    record = sink.written[0]
    assert isinstance(record, TestCaseResultRecord)
    assert record.test_case_fqn == "suite.diff"
    assert record.test_case_status == "Failed"  # total 2, threshold 0
    assert record.test_result_value == [
        {"name": "removedRows", "value": "1"},
        {"name": "addedRows", "value": "1"},
        {"name": "diffCount", "value": "2"},
    ]
    assert record.passed_rows == 1
    assert record.failed_rows == 2
    assert "key-set comparison only" in (record.result or "")
    assert "row-value and schema differences are not compared" in (record.result or "")


def test_data_diff_threshold_rule() -> None:
    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[
            _spec("suite.identical", "a", "a_copy"),
            _spec("suite.below", "b", "b_copy", threshold=3),
            _spec("suite.at", "c", "c_copy", threshold=2),
        ],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys(
            {
                "a": [(1,), (2,)],
                "a_copy": [(1,), (2,)],
                "b": [(1,), (2,)],
                "b_copy": [(2,), (3,)],
                "c": [(1,), (2,)],
                "c_copy": [(2,), (3,)],
            }
        ),
    )
    assert report.ok()
    assert report.succeeded == 3
    assert [item.test_case_status for item in sink.written] == [
        "Success",  # total 0, threshold 0: exactly zero allowed
        "Success",  # total 2 < threshold 3
        "Failed",  # total 2 == threshold 2: must be below
    ]


def test_data_diff_duplicate_keys_abort_and_continue() -> None:
    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[
            _spec("suite.dup", "orders", "orders_copy"),
            _spec("suite.clean", "clean", "clean_copy"),
        ],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys(
            {
                "orders": [(1,), (1,), (2,)],
                "orders_copy": [(1,), (2,)],
                "clean": [(1,)],
                "clean_copy": [(1,)],
            }
        ),
    )
    assert report.ok()
    assert report.succeeded == 2
    assert sink.written[0].test_case_status == "Aborted"
    assert sink.written[0].result == (
        "Key column 'id' is not unique in warehouse.public.orders. "
        "A row-level diff needs a unique key: pick a unique column, "
        "or add more columns to the key."
    )
    assert sink.written[0].failed_rows is None
    assert sink.written[1].test_case_status == "Success"


def test_data_diff_rejects_source_without_binding() -> None:
    for source_type in ("kafka", "redshift"):
        config = _config(
            type="data_diff",
            data_diffs=[_spec("suite.diff", "orders", "orders_copy")],
            source_type=source_type,
        )
        with pytest.raises(WorkflowInitializationError, match="no binding"):
            run_workflow(config, client=_client(config), source=StubSource(), sink=CollectingSink())


def test_data_diff_rejects_unmapped_side() -> None:
    config = _config(
        type="data_diff",
        data_diffs=[
            DataDiffSpec(
                test_case_fqn="suite.diff",
                left=_side("orders"),
                right=_side("orders_copy", source_type="redshift"),
            )
        ],
    )
    with pytest.raises(WorkflowInitializationError, match="no binding.*right side"):
        run_workflow(config, client=_client(config), source=StubSource(), sink=CollectingSink())


def test_data_diff_cross_service_sides_use_per_side_bindings() -> None:
    seen: dict[str, dict[str, Any]] = {}

    def _capture(side: dict[str, Any]):
        seen[side["table"]] = side
        return [(1,), (2,)] if side["table"] == "orders" else [(2,), (3,)]

    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[
            DataDiffSpec(
                test_case_fqn="suite.cross",
                left=_side("orders"),
                right=_side(
                    "orders_copy",
                    source_type="mysql",
                    connection={
                        "hostPort": "localhost:3306",
                        "username": "ingest",
                        "password": "secret",
                        "database": "warehouse",
                    },
                ),
            )
        ],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_capture,
    )
    assert report.ok()
    assert len(sink.written) == 1
    assert seen["orders"]["type"] == "Postgres"
    assert seen["orders_copy"]["type"] == "Mysql"
    assert seen["orders_copy"]["dialect"] == "mysql"


def test_data_diff_ignores_static_lists() -> None:
    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[_spec("suite.diff", "orders", "orders_copy")],
        profiles=[ProfileSpec(fqn="warehouse.analytics.public.orders")],
        test_case_results=[
            TestCaseResultSpec(
                test_case_fqn="suite.static", timestamp=1, test_case_status="Success"
            )
        ],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys({"orders": [(1,)], "orders_copy": [(1,), (2,)]}),
    )
    assert report.ok()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], TestCaseResultRecord)
    assert sink.written[0].test_case_fqn == "suite.diff"


def test_data_diff_writes_no_secrets() -> None:
    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[
            DataDiffSpec(
                test_case_fqn="suite.snow",
                left=_side("ORDERS", database="ANALYTICS", schema="PUBLIC", key_columns=["ID"]),
                right=_side(
                    "ORDERS_COPY", database="ANALYTICS", schema="PUBLIC", key_columns=["ID"]
                ),
            )
        ],
        source_type="snowflake",
        connection={
            "account": "xy12345",
            "username": "ingest",
            "password": "secret",
            "warehouse": "COMPUTE_WH",
            "database": "ANALYTICS",
            "privateKey": "SECRET-PRIVATE-KEY",
            "snowflakePrivatekeyPassphrase": "SECRET-PASSPHRASE",
        },
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys({"ORDERS": [(1,)], "ORDERS_COPY": [(1,)]}),
    )
    assert report.ok()
    assert len(sink.written) == 1
    dumped = sink.written[0].model_dump_json()
    assert "SECRET-PRIVATE-KEY" not in dumped
    assert "SECRET-PASSPHRASE" not in dumped
    assert "privateKey" not in dumped
    assert "passPhrase" not in dumped


def test_data_diff_job_runs_workflow() -> None:
    sink = CollectingSink()
    config = _config(
        type="metadata",
        data_diffs=[_spec("suite.diff", "orders", "orders_copy")],
    )
    report = DataDiffJob(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys({"orders": [(1,), (2,)], "orders_copy": [(2,), (3,)]}),
    ).run()
    assert report.ok()
    assert len(sink.written) == 1
    assert isinstance(sink.written[0], TestCaseResultRecord)


def test_metadata_dispatch_ignores_data_diffs() -> None:
    sink = CollectingSink()
    config = _config(
        type="metadata",
        data_diffs=[_spec("suite.diff", "orders", "orders_copy")],
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_fetch_keys({"orders": [(1,)], "orders_copy": [(1,)]}),
    )
    assert report.ok()
    assert len(sink.written) == 0


def test_data_diff_p2_5_trino_vs_azuresql_cross_service() -> None:
    """P2-5: a trino left side and an azuresql right side diff through the workflow."""
    seen: dict[str, dict[str, Any]] = {}

    def _capture(side: dict[str, Any]):
        seen[side["table"]] = side
        return [(1,), (2,)] if side["table"] == "orders" else [(2,), (3,)]

    sink = CollectingSink()
    config = _config(
        type="data_diff",
        data_diffs=[
            DataDiffSpec(
                test_case_fqn="suite.p2_5",
                left=_side(
                    "orders",
                    source_type="trino",
                    connection={
                        "hostPort": "trino.test:8080",
                        "username": "ingest",
                        "password": "secret",
                        "catalog": "warehouse",
                    },
                ),
                right=_side(
                    "orders_copy",
                    source_type="azuresql",
                    connection={
                        "hostPort": "azuresql.test:1433",
                        "username": "ingest",
                        "password": "secret",
                        "database": "warehouse",
                    },
                ),
            )
        ],
        source_type="trino",
        connection={
            "hostPort": "trino.test:8080",
            "username": "ingest",
            "password": "secret",
            "catalog": "warehouse",
        },
    )
    report = run_workflow(
        config,
        client=_client(config),
        source=StubSource(),
        sink=sink,
        fetch_keys=_capture,
    )
    assert report.ok()
    assert len(sink.written) == 1
    assert sink.written[0].test_case_status == "Failed"  # total 2, threshold 0
    assert seen["orders"]["type"] == "Trino"
    assert seen["orders"]["catalog"] == "warehouse"
    assert seen["orders"]["dialect"] == "trino"
    assert seen["orders_copy"]["type"] == "AzureSQL"
    assert seen["orders_copy"]["dialect"] == "mssql"


def test_data_diff_spec_validation() -> None:
    with pytest.raises(ValidationError, match="key_columns"):
        DataDiffSideSpec(database="warehouse", schema="public", table="orders", key_columns=[])
    with pytest.raises(ValidationError, match="threshold"):
        _spec("suite.diff", "orders", "orders_copy", threshold=-1)


def test_data_diff_config_aliases() -> None:
    config = _config(
        type="data_diff",
        data_diffs=[
            DataDiffSpec(
                test_case_fqn="suite.diff",
                left=_side("orders"),
                right=_side("orders_copy"),
                where_clause="id > 0",
            )
        ],
    )
    dumped = config.model_dump(by_alias=True)
    assert dumped["dataDiffs"][0]["testCaseFqn"] == "suite.diff"
    assert dumped["dataDiffs"][0]["left"]["keyColumns"] == ["id"]
    assert dumped["dataDiffs"][0]["whereClause"] == "id > 0"


def test_data_diff_config_loads_from_yaml(tmp_path) -> None:
    from smartmetadata_ingestion.config import load_workflow_config

    path = tmp_path / "data_diff.yaml"
    path.write_text(
        """
workflow:
  name: warehouse-datadiff
  type: data_diff
server:
  hostPort: http://catalog.test/api
  auth:
    type: jwt
    jwtToken: bot-token
source:
  type: postgres
  serviceName: warehouse
  connection:
    hostPort: localhost:5432
    username: ingest
    password: secret
    database: analytics
dataDiffs:
  - testCaseFqn: suite.diff
    threshold: 3
    left:
      database: warehouse
      schema: public
      table: orders
      keyColumns: [id]
    right:
      database: warehouse
      schema: public
      table: orders_copy
      keyColumns: [id]
""",
        encoding="utf-8",
    )
    config = load_workflow_config(path)
    assert config.workflow.type == "data_diff"
    assert len(config.data_diffs) == 1
    assert config.data_diffs[0].threshold == 3
    assert config.data_diffs[0].right.table == "orders_copy"


# -- P2-1 chunked row engine -----------------------------------------------


def test_row_engine_crosses_chunk_boundaries() -> None:
    """2,500 left rows cross the 1,000-row chunk boundary twice; pass 2
    finds the added row the left-driven pass can never fetch."""
    left = [(i, f"user{i}@x") for i in range(1, 2501)]
    right = [(i, f"user{i}@x") for i in range(1, 2500)]
    right[1] = (2, "changed@x")  # one changed row
    right.append((3000, "new@x"))  # one added row (right-only key)
    record = _run_row_spec(
        _row_spec("svc.db.public.orders.row_diff"),
        {"orders": left, "orders_v2": right},
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "1"},
        {"name": "addedRows", "value": "1"},
        {"name": "changedRows", "value": "1"},
        {"name": "diffCount", "value": "3"},
        {"name": "columnDiffCounts", "value": '{"email": 1}'},
    ]
    assert record.passed_rows == 2498
    assert record.failed_rows == 3
    assert record.passed_rows_percentage == pytest.approx(2498 / 2500 * 100)
    assert record.failed_rows_percentage == pytest.approx(3 / 2500 * 100)


def test_row_engine_right_duplicate_keys_abort() -> None:
    record = _run_row_spec(
        _row_spec("svc.db.public.orders.row_diff"),
        {
            "orders": [(1, "a"), (2, "b")],
            "orders_v2": [(1, "a"), (1, "a")],
        },
    )
    assert record.test_case_status == "Aborted"
    assert "not unique" in (record.result or "")


def test_row_engine_unexpected_error_aborts_without_traceback() -> None:
    def _boom(side: dict[str, Any]):
        raise RuntimeError("boom")

    record = run_data_diff_spec(
        _row_spec("svc.db.public.orders.row_diff"),
        left_binding=datadiff_binding("postgres"),
        right_binding=datadiff_binding("postgres"),
        default_connection={
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": "analytics",
        },
        fetch_rows=_boom,
        timestamp=1000,
    )
    assert record.test_case_status == "Aborted"
    assert (record.result or "").startswith("ERROR:")
    assert "Traceback" not in (record.result or "")
    assert "boom" in (record.result or "")


def test_row_engine_unbound_dialect_aborts() -> None:
    record = run_data_diff_spec(
        _row_spec("svc.db.public.orders.row_diff"),
        left_binding=None,
        right_binding=datadiff_binding("postgres"),
        default_connection={},
        fetch_rows=_fetch_rows({"orders": [(1, "a")], "orders_v2": [(1, "a")]}),
        left_source_type="redshift",
        timestamp=1000,
    )
    assert record.test_case_status == "Aborted"
    assert "Unsupported dialect on the left side: 'redshift'" in (record.result or "")


def test_row_engine_inline_spec_discloses_no_schema_comparison() -> None:
    record = _run_row_spec(
        _row_spec("svc.db.public.orders.row_diff"),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
        schema_compared=False,
    )
    assert record.test_case_status == "Success"
    assert "Schema differences are not compared (no table metadata in inline spec)." in (
        record.result or ""
    )


def test_row_engine_key_set_mode_preserved_without_extra_columns() -> None:
    """A spec with no extra columns on either side still runs the Phase-1
    key-set comparison with its original message and values."""
    spec = _row_spec("svc.db.public.orders.row_diff", extra_columns=[])
    record = run_data_diff_spec(
        spec,
        left_binding=datadiff_binding("postgres"),
        right_binding=datadiff_binding("postgres"),
        default_connection={
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": "analytics",
        },
        fetch_keys=_fetch_keys({"orders": [(1,), (2,)], "orders_v2": [(2,), (3,)]}),
        timestamp=1000,
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "1"},
        {"name": "addedRows", "value": "1"},
        {"name": "diffCount", "value": "2"},
    ]
    assert "key-set comparison only" in (record.result or "")


def test_row_fetcher_sql_per_dialect() -> None:
    postgres = SqlRowFetcher(lambda: None, quote=lambda name: f'"{name}"', ident_style="three")
    assert postgres.rows_sql("warehouse", "public", "orders", ["id"], ["email"]) == (
        'SELECT "id", "email" FROM "warehouse"."public"."orders" ORDER BY "id"'
    )
    assert postgres.rows_sql(
        "warehouse", "public", "orders", ["id"], ["email"], "id > 10"
    ).endswith('WHERE id > 10 ORDER BY "id"')
    sql, params = postgres.chunk_sql(
        "warehouse", "public", "orders", ["id"], [(1,), (2,)], ["email"]
    )
    assert sql == ('SELECT "id", "email" FROM "warehouse"."public"."orders" WHERE "id" IN (%s, %s)')
    assert params == [1, 2]

    mysql = SqlRowFetcher(lambda: None, quote=lambda name: f"`{name}`", ident_style="two")
    assert mysql.rows_sql("warehouse", "public", "orders", ["id"], ["email"]) == (
        "SELECT `id`, `email` FROM `public`.`orders` ORDER BY `id`"
    )

    mssql = SqlRowFetcher(
        lambda: None,
        quote=lambda name: f'"{name}"',
        ident_style="three",
        paramstyle="qmark",
    )
    sql, params = mssql.chunk_sql(
        "warehouse",
        "public",
        "orders",
        ["id", "region"],
        [(1, "eu"), (2, "us")],
        ["email"],
    )
    assert sql == (
        'SELECT "id", "region", "email" FROM "warehouse"."public"."orders" '
        'WHERE ("id" = ? AND "region" = ?) OR ("id" = ? AND "region" = ?)'
    )
    assert params == [1, "eu", 2, "us"]

    # A string key orders by LOWER(column) when the comparison is case
    # insensitive, so case-variants stay adjacent in the stream.
    trino = SqlRowFetcher(lambda: None, quote=lambda name: f'"{name}"', ident_style="three")
    assert trino.rows_sql(
        "warehouse",
        "public",
        "orders",
        ["code"],
        ["email"],
        case_sensitive=False,
        key_column_types={"code": "VARCHAR"},
    ).endswith('ORDER BY LOWER("code")')
    assert trino.rows_sql(
        "warehouse",
        "public",
        "orders",
        ["code"],
        ["email"],
        case_sensitive=True,
        key_column_types={"code": "VARCHAR"},
    ).endswith('ORDER BY "code"')


@pytest.mark.parametrize(
    ("left", "right", "case_sensitive", "expected"),
    [
        (1, 2, True, False),
        (1, 1.0, True, True),  # INT == FLOAT
        (1, True, True, False),  # bool is never numeric
        (True, True, True, True),
        (None, None, True, True),
        (None, 0, True, False),
        (float("nan"), float("nan"), True, True),
        (float("nan"), 1.0, True, False),
        ("a", "A", False, True),  # case-insensitive strings
        ("a", "A", True, False),
        ("1", 1, True, False),  # no str() normalisation
        ('{"b": 1, "a": 2}', '{"a": 2, "b": 1}', True, True),  # JSON objects
        ('{"a": 1}', '{"a": 2}', True, False),
        ("[1, 2]", "[1, 2]", True, True),
        ("not json", "not json", True, True),
    ],
)
def test_value_equality_cases(left, right, case_sensitive, expected) -> None:
    assert _values_equal(left, right, case_sensitive) is expected


def test_value_equality_datetimes() -> None:
    from datetime import date, datetime, timezone

    aware = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    aware_plus_one = datetime(2026, 1, 1, 13, 0, tzinfo=timezone.utc)
    naive = datetime(2026, 1, 1, 12, 0)
    assert _values_equal(aware, aware_plus_one, True) is False
    assert _values_equal(aware, naive, True) is False  # naive != aware, ever
    assert _values_equal(naive, naive, True) is True
    assert _values_equal(date(2026, 1, 1), datetime(2026, 1, 1), True) is False


def test_norm_key_numeric_identity() -> None:
    assert _norm_key((1,), True) == _norm_key((1.0,), True)
    assert _norm_key((1,), True) != _norm_key((True,), True)
    assert _norm_key(("A",), False) == _norm_key(("a",), False)
    assert _norm_key(("A",), True) != _norm_key(("a",), True)


# -- P2-2 sampling ----------------------------------------------------------


def _sampled_spec(
    test_case_fqn: str = "svc.db.public.orders.row_diff",
    *,
    profile_sample_config: dict[str, Any] | None = None,
    left_source_type: str | None = None,
    right_source_type: str | None = None,
    left_key_types: dict[str, str] | None = None,
    right_key_types: dict[str, str] | None = None,
    left_connection: dict[str, Any] | None = None,
    where: str | None = None,
) -> DataDiffSpec:
    return DataDiffSpec(
        test_case_fqn=test_case_fqn,
        left=_side(
            "orders",
            extra_columns=["email"],
            key_column_types=left_key_types if left_key_types is not None else {"id": "INT"},
            **({"source_type": left_source_type} if left_source_type else {}),
            **({"connection": left_connection} if left_connection else {}),
        ),
        right=_side(
            "orders_v2",
            extra_columns=["email"],
            key_column_types=right_key_types if right_key_types is not None else {"id": "INT"},
            **({"source_type": right_source_type} if right_source_type else {}),
        ),
        threshold=0,
        where_clause=where,
        table_profile_config=(
            {"profileSampleConfig": profile_sample_config}
            if profile_sample_config is not None
            else None
        ),
    )


def _static_sample_config(profile_sample, sample_type="PERCENTAGE"):
    return {
        "sampleConfigType": "STATIC",
        "config": {"profileSample": profile_sample, "profileSampleType": sample_type},
    }


def _run_sampled_spec(
    spec: DataDiffSpec,
    mapping: dict[str, list[tuple[Any, ...]]],
    *,
    left_binding=None,
    right_binding=None,
    default_connection: dict[str, Any] | None = None,
    left_source_type: str | None = None,
    right_source_type: str | None = None,
) -> TestCaseResultRecord:
    return run_data_diff_spec(
        spec,
        left_binding=left_binding or datadiff_binding("postgres"),
        right_binding=right_binding or datadiff_binding("postgres"),
        default_connection=default_connection
        or {
            "hostPort": "localhost:5432",
            "username": "ingest",
            "password": "secret",
            "database": "analytics",
        },
        fetch_rows=_fetch_rows(mapping),
        left_source_type=left_source_type,
        right_source_type=right_source_type,
        timestamp=1000,
    )


def test_sample_where_per_dialect() -> None:
    from smartmetadata_ingestion.datadiff import build_sample_where_clause

    postgres = datadiff_binding("postgres")
    assert postgres is not None
    assert build_sample_where_clause(
        "postgres", postgres, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == (
        'SUBSTRING(MD5(CAST("id" AS VARCHAR) || \'Ab3x9\') FROM 1 FOR 8) < \'7fffffff\''
    )
    assert build_sample_where_clause(
        "postgres", postgres, key_columns=["id", "code"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == (
        'SUBSTRING(MD5(CAST("id" AS VARCHAR) || CAST("code" AS VARCHAR) || \'Ab3x9\') '
        "FROM 1 FOR 8) < '7fffffff'"
    )
    mysql = datadiff_binding("mysql")
    assert mysql is not None
    assert build_sample_where_clause(
        "mysql", mysql, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == "SUBSTR(MD5(CONCAT(CAST(`id` AS CHAR), 'Ab3x9')), 1, 8) < '7fffffff'"
    snowflake = datadiff_binding("snowflake")
    assert snowflake is not None
    assert build_sample_where_clause(
        "snowflake", snowflake, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == (
        'SUBSTR(MD5(CAST("id" AS VARCHAR) || \'Ab3x9\'), 1, 8) < \'7fffffff\''
    )
    databricks = datadiff_binding("databricks")
    assert databricks is not None
    assert build_sample_where_clause(
        "databricks", databricks, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == "substring(md5(CAST(`id` AS STRING) || 'Ab3x9'), 1, 8) < '7fffffff'"
    trino = datadiff_binding("trino")
    assert trino is not None
    assert build_sample_where_clause(
        "trino", trino, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == (
        "substr(to_hex(md5(CAST(CAST(\"id\" AS VARCHAR) || 'Ab3x9' AS VARBINARY))), 1, 8)"
        " < '7fffffff'"
    )
    mssql = datadiff_binding("mssql")
    assert mssql is not None
    assert build_sample_where_clause(
        "mssql", mssql, key_columns=["id"], salt="Ab3x9", hex_nonce="7fffffff"
    ) == (
        "SUBSTRING(LOWER(CONVERT(VARCHAR(32), HASHBYTES('MD5', CAST([id] AS VARCHAR)"
        " + 'Ab3x9'), 2)), 1, 8) < '7fffffff'"
    )


def test_combine_where() -> None:
    from smartmetadata_ingestion.datadiff import _combine_where

    assert _combine_where("id > 10", "SUBSTRING(...) < '7fffffff'") == (
        "(id > 10) AND (SUBSTRING(...) < '7fffffff')"
    )
    assert _combine_where("id > 10", None) == "id > 10"
    assert _combine_where(None, "SUBSTRING(...) < '7fffffff'") == "SUBSTRING(...) < '7fffffff'"
    assert _combine_where(None, None) is None
    assert _combine_where("  ", "  ") is None


def test_sampling_disclosure_percentage_and_rows() -> None:
    record = _run_sampled_spec(
        _sampled_spec(profile_sample_config=_static_sample_config(50)),
        {"orders": [(1, "a"), (2, "b")], "orders_v2": [(1, "a"), (2, "b")]},
    )
    assert record.test_case_status == "Success"
    assert (
        "Sampled comparison: 50% of the table (MD5 key-hash sampling); the verdict "
        "is an estimate over the sample, not a full-table conclusion."
        in (record.result or "")
    )

    record = _run_sampled_spec(
        _sampled_spec(profile_sample_config=_static_sample_config(2, "ROWS")),
        {
            "orders": [(1, "a"), (2, "b"), (3, "c"), (4, "d")],
            "orders_v2": [(1, "a"), (2, "b"), (3, "c"), (4, "d")],
        },
    )
    assert "Sampled comparison: 2 rows of the table" in (record.result or "")


def test_sampling_off_at_percentage_100_and_without_config() -> None:
    record = _run_sampled_spec(
        _sampled_spec(profile_sample_config=_static_sample_config(100)),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
    )
    assert "Sampled comparison" not in (record.result or "")

    record = _run_sampled_spec(
        _sampled_spec(),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
    )
    assert "Sampled comparison" not in (record.result or "")


def test_sampling_dynamic_thresholds_via_engine() -> None:
    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config={
                "sampleConfigType": "DYNAMIC",
                "config": {
                    "smartSampling": False,
                    "thresholds": [
                        {
                            "rowCountThreshold": 2,
                            "profileSample": 50,
                            "profileSampleType": "PERCENTAGE",
                        },
                    ],
                },
            }
        ),
        {
            "orders": [(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")],
            "orders_v2": [(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")],
        },
    )
    assert "Sampled comparison: 50% of the table" in (record.result or "")

    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config={
                "sampleConfigType": "DYNAMIC",
                "config": {
                    "smartSampling": False,
                    "thresholds": [
                        {
                            "rowCountThreshold": 100,
                            "profileSample": 50,
                            "profileSampleType": "PERCENTAGE",
                        },
                    ],
                },
            }
        ),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
    )
    assert "Sampled comparison" not in (record.result or "")


def test_sampling_same_salt_and_nonce_both_sides(monkeypatch) -> None:
    """Q-2 (b): one salt and one nonce per run, the same where shape on
    both sides — the deterministic assertion behind same-run identity."""
    import smartmetadata_ingestion.datadiff as datadiff_module

    calls: list[tuple[str, str, str]] = []
    real = datadiff_module.build_sample_where_clause

    def _recording(source_type, binding, *, key_columns, salt, hex_nonce):
        calls.append((source_type, salt, hex_nonce))
        return real(
            source_type, binding, key_columns=key_columns, salt=salt, hex_nonce=hex_nonce
        )

    monkeypatch.setattr(datadiff_module, "build_sample_where_clause", _recording)
    record = _run_sampled_spec(
        _sampled_spec(profile_sample_config=_static_sample_config(50)),
        {"orders": [(1, "a"), (2, "b")], "orders_v2": [(1, "a"), (2, "b")]},
        left_source_type="postgres",
        right_source_type="postgres",
    )
    assert record.test_case_status == "Success"
    assert len(calls) == 2
    assert calls[0][0] == "postgres" and calls[1][0] == "postgres"
    assert calls[0][1] == calls[1][1]  # same salt
    assert calls[0][2] == calls[1][2] == "7fffffff"  # 50% nonce, deterministic
    assert len(calls[0][1]) == 5 and calls[0][1].isalnum()


def test_sampling_sql_server_non_integer_key_warns_and_compares_all(
    caplog: pytest.LogCaptureFixture,
) -> None:
    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config=_static_sample_config(50),
            left_source_type="mssql",
            right_source_type="postgres",
            left_key_types={"id": "VARCHAR"},
            left_connection={"database": "analytics"},
        ),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
        left_binding=datadiff_binding("mssql"),
        left_source_type="mssql",
        right_source_type="postgres",
    )
    assert record.test_case_status == "Success"
    assert "Sampled comparison" not in (record.result or "")
    assert (
        "Skipping sampling: a SQL Server table can only be sampled on integer key columns"
        in caplog.text
    )
    assert "Not supported: id (VARCHAR)" in caplog.text
    assert "Comparing all the rows instead." in caplog.text


def test_sampling_sql_server_missing_key_type_warns_and_compares_all(
    caplog: pytest.LogCaptureFixture,
) -> None:
    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config=_static_sample_config(50),
            left_source_type="mssql",
            right_source_type="postgres",
            left_key_types={},
            left_connection={"database": "analytics"},
        ),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
        left_binding=datadiff_binding("mssql"),
        left_source_type="mssql",
        right_source_type="postgres",
    )
    assert "Sampled comparison" not in (record.result or "")
    assert "Not supported: id (unknown)" in caplog.text


def test_sampling_sql_server_integer_keys_do_sample() -> None:
    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config=_static_sample_config(50),
            left_source_type="mssql",
            right_source_type="mssql",
            left_connection={"database": "analytics"},
        ),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
        left_binding=datadiff_binding("mssql"),
        right_binding=datadiff_binding("mssql"),
        default_connection={"database": "analytics"},
        left_source_type="mssql",
        right_source_type="mssql",
    )
    assert "Sampled comparison: 50% of the table" in (record.result or "")


def test_sampling_clickzetta_warns_and_compares_all(
    caplog: pytest.LogCaptureFixture,
) -> None:
    record = _run_sampled_spec(
        _sampled_spec(
            profile_sample_config=_static_sample_config(50),
            left_source_type="clickzetta",
            right_source_type="postgres",
            left_connection={
                "hostPort": "https://ws.clickzetta.test:443",
                "username": "ingest",
                "databaseName": "workspace",
                "virtualCluster": "vc",
            },
        ),
        {"orders": [(1, "a")], "orders_v2": [(1, "a")]},
        left_binding=datadiff_binding("clickzetta"),
        left_source_type="clickzetta",
        right_source_type="postgres",
    )
    assert record.test_case_status == "Success"
    assert "Sampled comparison" not in (record.result or "")
    assert "Skipping sampling: ClickZetta has no verified MD5 function" in caplog.text
