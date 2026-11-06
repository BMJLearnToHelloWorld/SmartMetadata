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
