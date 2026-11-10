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

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import (
    AuthConfig,
    ServerConfig,
    SourceConfig,
    WorkflowConfig,
    WorkflowSettings,
)
from smartmetadata_ingestion.config import (
    TestCaseSpec as TestCaseSpecModel,
)
from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableContext,
    TableRef,
)
from smartmetadata_ingestion.data_quality.source import pull_test_cases
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.runner import run_workflow


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="bot-token"),
    )


def _table_entity(
    *,
    table_fqn: str = "warehouse.analytics.public.orders",
    columns: list[dict[str, Any]] | None = None,
    suite_id: str | None = "suite-1",
) -> dict[str, Any]:
    service, database, schema, table = table_fqn.split(".")
    return {
        "id": "table-1",
        "name": table,
        "fullyQualifiedName": table_fqn,
        "service": {"id": "svc-1", "name": service},
        "database": {"name": database},
        "databaseSchema": {"name": schema},
        "columns": columns
        or [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
        ],
        **({"testSuite": {"id": suite_id, "type": "testSuite"}} if suite_id else {}),
    }


def _case_payload(
    *,
    name: str = "orders_email_not_null",
    definition: str = "columnValuesToBeNotNull",
    entity_link: str = "<#E::table::warehouse.analytics.public.orders::columns::email>",
    params: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "id": f"case-{name}",
        "name": name,
        "fullyQualifiedName": f"warehouse.analytics.public.orders.{name}",
        "entityLink": entity_link,
        "testDefinition": {"fullyQualifiedName": definition},
        "parameterValues": params or [],
        "testSuite": {"id": "suite-1", "type": "testSuite"},
    }


class _FakeRest:
    """Minimal RestClient stand-in for the pull layer (no HTTP)."""

    def __init__(
        self,
        *,
        tables: dict[str, dict[str, Any]],
        suites: dict[str, dict[str, Any]],
        cases: dict[str, list[dict[str, Any]]],
        fail_paths: set[str] | None = None,
    ) -> None:
        self._tables = tables
        self._suites = suites
        self._cases = cases
        self._fail_paths = fail_paths or set()
        self.seen: list[tuple[str, Any]] = []

    def get_table_by_name(self, fqn: str, *, fields: str | None = None):
        self.seen.append(("table", fqn, fields))
        if fqn in self._fail_paths:
            raise RestError("not found", status_code=404)
        return self._tables[fqn]

    def get_test_suite_by_id(self, suite_id: str):
        self.seen.append(("suite-id", suite_id))
        if suite_id in self._fail_paths:
            raise RestError("not found", status_code=404)
        return self._suites[suite_id]

    def get_test_suite_by_name(self, name: str):
        self.seen.append(("suite-name", name))
        if name in self._fail_paths:
            raise RestError("not found", status_code=404)
        return self._suites[name]

    def list_test_cases(self, *, test_suite_id: str | None = None, **kwargs):
        self.seen.append(("cases", test_suite_id))
        if test_suite_id in self._fail_paths:
            raise RestError("not found", status_code=404)
        return iter(self._cases.get(test_suite_id or "", []))


def _fake(
    *,
    cases: list[dict[str, Any]] | None = None,
    suite_id: str = "suite-1",
    table_fqn: str = "warehouse.analytics.public.orders",
    fail_paths: set[str] | None = None,
    suite_name: str = "warehouse",
) -> _FakeRest:
    return _FakeRest(
        tables={table_fqn: _table_entity(table_fqn=table_fqn, suite_id=suite_id)},
        suites={
            suite_id: {"id": suite_id, "name": suite_name},
            suite_name: {"id": suite_id, "name": suite_name},
        },
        cases={suite_id: cases if cases is not None else [_case_payload()]},
        fail_paths=fail_paths,
    )


# -- models ---------------------------------------------------------------


def test_table_ref_parse_and_quoted_segment() -> None:
    ref = TableRef.parse("warehouse.analytics.public.orders")
    assert (ref.service, ref.database, ref.schema, ref.table) == (
        "warehouse",
        "analytics",
        "public",
        "orders",
    )
    assert ref.fqn == "warehouse.analytics.public.orders"
    quoted = TableRef.parse('svc."my.db".public.orders')
    assert quoted.database == "my.db"
    with pytest.raises(WorkflowError):
        TableRef.parse("warehouse.public.orders")
    with pytest.raises(WorkflowError):
        TableRef.parse('svc."unterminated.public.orders')


def test_pulled_case_from_dict_and_entity_link() -> None:
    case = PulledTestCase.from_dict(
        _case_payload(
            params=[{"name": "minValue", "value": "1"}],
        )
    )
    assert case.name == "orders_email_not_null"
    assert case.test_definition_name == "columnValuesToBeNotNull"
    assert case.table_fqn() == "warehouse.analytics.public.orders"
    assert case.column_name() == "email"
    assert case.param("minValue") == "1"
    assert case.param("missing") is None

    table_case = PulledTestCase.from_dict(
        _case_payload(
            name="orders_row_count",
            definition="tableRowCountToBeBetween",
            entity_link="<#E::table::warehouse.analytics.public.orders>",
        )
    )
    assert table_case.column_name() is None
    assert table_case.table_ref().table == "orders"

    with pytest.raises(WorkflowError):
        PulledTestCase.from_dict({"name": "x"})
    # The link shape is parsed lazily: `from_dict` only requires the link
    # to be present; `table_ref()` is where a non-table link fails closed.
    dashboard_case = PulledTestCase.from_dict(_case_payload(entity_link="<#E::dashboard::x>"))
    with pytest.raises(WorkflowError, match="unsupported entityLink"):
        dashboard_case.table_ref()


def test_table_context_columns() -> None:
    context = TableContext.from_table_entity(
        _table_entity(), fqn="warehouse.analytics.public.orders"
    )
    assert context.column_count == 2
    assert context.column("id") is not None
    assert context.column("ID", case_sensitive=False) is not None
    assert context.column("ID") is None
    assert context.column("nope") is None


# -- RestClient list/read methods ------------------------------------------


def test_rest_client_test_suite_and_case_paths() -> None:
    seen: list[tuple[str, str, dict[str, Any] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen.append((request.method, request.url.path, params))
        if request.url.path.endswith("/testSuites"):
            after = params.get("after")
            if after is None:
                return httpx.Response(
                    200,
                    json={
                        "data": [{"id": "s1", "name": "one"}],
                        "paging": {"after": "cursor-1"},
                    },
                )
            return httpx.Response(200, json={"data": [{"id": "s2", "name": "two"}]})
        if request.url.path.endswith("/testCases"):
            return httpx.Response(200, json={"data": [{"id": "c1", "name": "case"}]})
        return httpx.Response(200, json={"id": "x", "name": "y"})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        suites = list(client.list_test_suites())
        assert [suite["id"] for suite in suites] == ["s1", "s2"]
        assert client.get_test_suite_by_id("s1")["id"] == "x"
        assert client.get_test_suite_by_name("one")["id"] == "x"
        cases = list(client.list_test_cases(test_suite_id="s1"))
        assert [case["id"] for case in cases] == ["c1"]
        table = client.get_table_by_name("warehouse.analytics.public.orders", fields="columns")
        assert table["id"] == "x"

    paths = [path for _, path, _ in seen]
    assert "/api/v1/dataQuality/testSuites" in paths
    assert "/api/v1/dataQuality/testSuites/s1" in paths
    assert "/api/v1/dataQuality/testSuites/name/one" in paths
    assert "/api/v1/dataQuality/testCases" in paths
    assert "/api/v1/tables/name/warehouse.analytics.public.orders" in paths
    case_call = next(params for method, path, params in seen if path.endswith("/testCases"))
    assert case_call["testSuiteId"] == "s1"
    assert case_call["fields"] == "testSuite,entityLink,testDefinition"


# -- pull layer ------------------------------------------------------------


def test_pull_table_suite() -> None:
    suites = pull_test_cases(
        _fake(),
        entity_fqn="warehouse.analytics.public.orders",
        service_name="warehouse",
    )
    assert len(suites) == 1
    assert suites[0].table.table.fqn == "warehouse.analytics.public.orders"
    assert len(suites[0].cases) == 1
    assert suites[0].cases[0].test_definition_name == "columnValuesToBeNotNull"


def test_pull_table_suite_filters_by_case_name() -> None:
    fake = _fake(
        cases=[
            _case_payload(name="keep_me"),
            _case_payload(name="drop_me"),
        ]
    )
    suites = pull_test_cases(
        fake,
        entity_fqn="warehouse.analytics.public.orders",
        service_name="warehouse",
        test_case_names=["keep_me"],
    )
    assert [case.name for case in suites[0].cases] == ["keep_me"]


def test_pull_table_suite_fail_closed() -> None:
    with pytest.raises(WorkflowError, match="no executable test suite"):
        pull_test_cases(
            _FakeRest(
                tables={"warehouse.analytics.public.orders": _table_entity(suite_id=None)},
                suites={},
                cases={},
            ),
            entity_fqn="warehouse.analytics.public.orders",
            service_name="warehouse",
        )
    with pytest.raises(WorkflowError, match="no test cases"):
        pull_test_cases(
            _fake(cases=[]),
            entity_fqn="warehouse.analytics.public.orders",
            service_name="warehouse",
        )
    with pytest.raises(WorkflowError, match="not found"):
        pull_test_cases(
            _fake(fail_paths={"warehouse.analytics.public.orders"}),
            entity_fqn="warehouse.analytics.public.orders",
            service_name="warehouse",
        )


def test_pull_logical_suite_groups_by_table() -> None:
    table2 = "warehouse.analytics.public.customers"
    fake = _FakeRest(
        tables={
            "warehouse.analytics.public.orders": _table_entity(),
            table2: _table_entity(table_fqn=table2),
        },
        suites={"warehouse": {"id": "suite-1", "name": "warehouse"}},
        cases={
            "suite-1": [
                _case_payload(name="orders_case"),
                _case_payload(
                    name="customers_case",
                    entity_link=f"<#E::table::{table2}::columns::email>",
                ),
            ]
        },
    )
    suites = pull_test_cases(fake, entity_fqn=None, service_name="warehouse")
    assert [suite.table.table.table for suite in suites] == [
        "orders",
        "customers",
    ]
    assert [case.name for case in suites[1].cases] == ["customers_case"]


def test_pull_logical_suite_missing_fails_closed() -> None:
    with pytest.raises(WorkflowError, match="not found"):
        pull_test_cases(
            _fake(fail_paths={"warehouse"}),
            entity_fqn=None,
            service_name="warehouse",
        )


# -- workflow integration --------------------------------------------------


class _CollectingSink:
    def __init__(self) -> None:
        self.written: list = []

    def write(self, record) -> None:
        self.written.append(record)

    def flush(self) -> None:
        return None


class _StubSource:
    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self):
        return iter(())


def _pulled_workflow_config(*, entity_fqn: str | None) -> WorkflowConfig:
    return WorkflowConfig(
        workflow=WorkflowSettings(name="warehouse-testsuite", type="TestSuite"),
        server=_jwt_server(),
        source=SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "ingest",
                "password": "secret",
                "database": "analytics",
            },
            entity_fully_qualified_name=entity_fqn,
        ),
    )


def _pull_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/tables/name/warehouse.analytics.public.orders"):
            return httpx.Response(200, json=_table_entity())
        if path.endswith("/dataQuality/testSuites/suite-1"):
            return httpx.Response(200, json={"id": "suite-1", "name": "s"})
        if path.endswith("/dataQuality/testCases"):
            return httpx.Response(200, json={"data": [_case_payload()]})
        return httpx.Response(200, json={})

    return httpx.MockTransport(handler)


def test_workflow_pulled_mode_runs_not_null_case() -> None:
    answers = {
        "IS NULL": 0,
        "COUNT(*)": 10,
    }

    def execute(sql: str):
        for needle, value in answers.items():
            if needle in sql:
                return value
        raise AssertionError(f"unexpected SQL: {sql}")

    client = RestClient(_jwt_server(), transport=_pull_transport())
    sink = _CollectingSink()
    report = run_workflow(
        _pulled_workflow_config(entity_fqn="warehouse.analytics.public.orders"),
        client=client,
        source=_StubSource(),
        sink=sink,
        execute=execute,
    )
    assert report.failed == 0
    assert len(sink.written) == 1
    record = sink.written[0]
    assert record.test_case_fqn == "warehouse.analytics.public.orders.orders_email_not_null"
    assert record.test_case_status == "Success"
    client.close()


def test_workflow_pulled_unknown_definition_aborts_case_not_run() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/tables/name/warehouse.analytics.public.orders"):
            return httpx.Response(200, json=_table_entity())
        if path.endswith("/dataQuality/testSuites/suite-1"):
            return httpx.Response(200, json={"id": "suite-1", "name": "s"})
        if path.endswith("/dataQuality/testCases"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        _case_payload(
                            name="geo_case",
                            definition="columnValuesToBeAtExpectedLocation",
                        )
                    ]
                },
            )
        return httpx.Response(200, json={})

    def execute(sql: str) -> None:
        raise AssertionError("no SQL should run for an unbuildable case")

    client = RestClient(_jwt_server(), transport=httpx.MockTransport(handler))
    sink = _CollectingSink()
    report = run_workflow(
        _pulled_workflow_config(entity_fqn="warehouse.analytics.public.orders"),
        client=client,
        source=_StubSource(),
        sink=sink,
        execute=execute,
    )
    assert report.failed == 0
    assert len(sink.written) == 1
    assert sink.written[0].test_case_status == "Aborted"
    assert "columnValuesToBeAtExpectedLocation" in (sink.written[0].result or "")
    client.close()


def test_workflow_fqn_plus_inline_cases_is_a_config_error() -> None:
    config = _pulled_workflow_config(entity_fqn="warehouse.analytics.public.orders")
    # Inline cases are transitional compat only; they must not combine
    # with a server-pulled suite.
    config = config.model_copy(
        update={
            "test_cases": [TestCaseSpecModel(test_case_fqn="x", expression="SELECT 1", expected=1)]
        }
    )
    client = RestClient(_jwt_server(), transport=_pull_transport())
    with pytest.raises(WorkflowError, match="cannot combine"):
        run_workflow(
            config,
            client=client,
            source=_StubSource(),
            sink=_CollectingSink(),
            execute=lambda sql: 1,
        )
    client.close()
