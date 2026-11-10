# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.config import DataDiffSideSpec, DataDiffSpec
from smartmetadata_ingestion.data_quality.builder import ValidatorBuilder
from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableColumnInfo,
    TableContext,
    TableRef,
    TestCaseParameter,
)
from smartmetadata_ingestion.data_quality.table_diff import (
    TableDiffParamsSetter,
    TableDiffValidator,
)
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord


def _table(
    *,
    name: str = "orders",
    columns: tuple[TableColumnInfo, ...] = (
        TableColumnInfo(name="id", data_type="INT", constraint="PRIMARY_KEY"),
        TableColumnInfo(name="email", data_type="VARCHAR"),
    ),
) -> TableContext:
    return TableContext(
        table=TableRef(service="warehouse", database="analytics", schema="public", table=name),
        columns=columns,
        service_name="warehouse",
    )


def _case(
    *,
    params: dict[str, str] | None = None,
    name: str = "orders_table_diff",
    table2: str | None = "warehouse.analytics.public.orders_v2",
) -> PulledTestCase:
    parameter_values = {
        **(params or {}),
        **({"table2": table2} if table2 is not None else {}),
    }
    return PulledTestCase(
        name=name,
        fully_qualified_name=f"warehouse.analytics.public.orders.{name}",
        entity_link="<#E::table::warehouse.analytics.public.orders>",
        test_definition_name="tableDiff",
        test_definition_fqn="tableDiff",
        parameter_values=tuple(
            TestCaseParameter(name=key, value=value) for key, value in parameter_values.items()
        ),
    )


_CONNECTION: dict[str, Any] = {
    "hostPort": "localhost:5432",
    "username": "ingest",
    "password": "secret",
    "database": "analytics",
}


def _side(table: str) -> DataDiffSideSpec:
    # The setter fills `connection` from the workflow's source connection
    # and leaves `source_type` unset for same-service diffs.
    return DataDiffSideSpec(
        database="analytics",
        schema="public",
        table=table,
        key_columns=["id"],
        connection=dict(_CONNECTION),
    )


def _resolver(fqn: str) -> dict[str, Any]:
    """Resolve any same-service table2 entity (the workflow's
    ``RestClient.get_table_by_name``)."""
    ref = TableRef.parse(fqn)
    if ref.service != "warehouse":
        raise RestError("not found", status_code=404)
    return {
        "id": f"table-{ref.table}",
        "name": ref.table,
        "fullyQualifiedName": fqn,
        "service": {"id": "svc-1", "name": "warehouse"},
        "columns": [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
            {"name": "order_id", "dataType": "INT"},
        ],
    }


def _setter() -> TableDiffParamsSetter:
    return TableDiffParamsSetter(table_resolver=_resolver, source_connection=dict(_CONNECTION))


def _fetch_keys(mapping: dict[str, list[tuple[Any, ...]]]):
    def _fetch(side: dict[str, Any]):
        return mapping[side["table"]]

    return _fetch


def _run_validator(
    case: PulledTestCase,
    *,
    table: TableContext | None = None,
    fetch_keys=None,
) -> TestCaseResultRecord:
    spec = _setter().compile(case, table or _table())
    validator = TableDiffValidator(
        test_case=case,
        table=table or _table(),
        dialect="postgres",
        execute=lambda sql: 1,
        timestamp=1000,
        spec=spec,
        fetch_keys=fetch_keys,
    )
    return validator.run()


# -- setter -----------------------------------------------------------------


def test_setter_compiles_explicit_key_columns() -> None:
    spec = _setter().compile(
        _case(params={"keyColumns": '["id"]', "threshold": "2"}),
        _table(),
    )
    assert spec == DataDiffSpec(
        test_case_fqn="warehouse.analytics.public.orders.orders_table_diff",
        left=_side("orders"),
        right=_side("orders_v2"),
        threshold=2,
    )


def test_setter_falls_back_to_primary_key_then_unique() -> None:
    spec = _setter().compile(_case(), _table())
    assert spec.left.key_columns == ["id"]
    assert spec.right.key_columns == ["id"]

    unique_table = _table(
        columns=(
            TableColumnInfo(name="email", data_type="VARCHAR", constraint="UNIQUE"),
            TableColumnInfo(name="age", data_type="INT"),
        )
    )
    spec = _setter().compile(_case(), unique_table)
    assert spec.left.key_columns == ["email"]

    with pytest.raises(WorkflowError, match="could not resolve key columns"):
        _setter().compile(
            _case(),
            _table(
                columns=(TableColumnInfo(name="age", data_type="INT"),),
            ),
        )


def test_setter_table2_key_columns_default_to_key_columns() -> None:
    spec = _setter().compile(
        _case(params={"keyColumns": '["id"]', "table2.keyColumns": '["order_id"]'}),
        _table(),
    )
    assert spec.left.key_columns == ["id"]
    assert spec.right.key_columns == ["order_id"]


def test_setter_rejects_missing_table2_and_cross_service() -> None:
    with pytest.raises(WorkflowError, match="without the required 'table2' parameter"):
        _setter().compile(_case(table2=None), _table())
    with pytest.raises(WorkflowError, match="cross-service tableDiff"):
        _setter().compile(
            _case(table2="other.analytics.public.orders_v2"),
            _table(),
        )


def test_setter_same_service_other_database_resolves() -> None:
    # The gate is the service, not the database: one source connection can
    # query both databases.
    spec = _setter().compile(
        _case(table2="warehouse.other.public.orders_v2"),
        _table(),
    )
    assert spec.right.database == "other"
    assert spec.right.table == "orders_v2"


def test_setter_validates_use_columns_and_threshold() -> None:
    spec = _setter().compile(
        _case(params={"keyColumns": '["id"]', "useColumns": '["email"]'}),
        _table(),
    )
    assert spec.left.key_columns == ["id"]
    with pytest.raises(WorkflowError, match="is not in table"):
        _setter().compile(
            _case(params={"keyColumns": '["id"]', "useColumns": '["nope"]'}),
            _table(),
        )
    with pytest.raises(WorkflowError, match="invalid tableDiff threshold"):
        _setter().compile(
            _case(params={"keyColumns": '["id"]', "threshold": "-1"}),
            _table(),
        )
    with pytest.raises(WorkflowError, match="non-numeric threshold"):
        _setter().compile(
            _case(params={"keyColumns": '["id"]', "threshold": "x"}),
            _table(),
        )


def test_setter_output_is_a_plain_data_diff_spec() -> None:
    """P2-3 reuse contract: the setter's output IS a DataDiffSpec, so the
    server-pull compiler in Wave 3 builds the same shape."""
    spec = _setter().compile(_case(), _table())
    assert isinstance(spec, DataDiffSpec)
    assert spec.where_clause is None
    spec = _setter().compile(
        _case(params={"where": "id > 10"}),
        _table(),
    )
    assert spec.where_clause == "id > 10"


def test_builder_routes_table_diff_through_the_setter() -> None:
    builder = ValidatorBuilder(
        dialect="postgres",
        execute=lambda sql: 1,
        table_resolver=_resolver,
        source_connection=dict(_CONNECTION),
        fetch_keys=_fetch_keys({"orders": [(1,)], "orders_v2": [(1,)]}),
    )
    validator = builder.build(_case(), _table(), timestamp=1000)
    assert isinstance(validator, TableDiffValidator)
    # The compiled spec is the shared DataDiffSpec shape: the validator runs
    # it through the key-set engine and reports the same verdict.
    record = validator.run()
    assert record.test_case_status == "Success"
    assert record.test_case_fqn == ("warehouse.analytics.public.orders.orders_table_diff")


def test_builder_table_diff_without_resolver_fails_closed() -> None:
    builder = ValidatorBuilder(dialect="postgres", execute=lambda sql: 1)
    with pytest.raises(WorkflowError, match="need a table resolver"):
        builder.build(_case(), _table(), timestamp=1000)


# -- validator --------------------------------------------------------------


def test_table_diff_validator_verdicts() -> None:
    record = _run_validator(
        _case(),
        fetch_keys=_fetch_keys({"orders": [(1,), (2,), (3,)], "orders_v2": [(2,), (3,), (4,)]}),
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "1"},
        {"name": "addedRows", "value": "1"},
        {"name": "diffCount", "value": "2"},
    ]
    assert "Found 2 different keys" in (record.result or "")
    assert record.passed_rows == 2  # keys in both tables
    assert record.failed_rows == 2

    # The official verdict is strict: total < threshold (total == threshold
    # still fails).
    record = _run_validator(
        _case(params={"threshold": "3"}),
        fetch_keys=_fetch_keys({"orders": [(1,), (2,), (3,)], "orders_v2": [(2,), (3,), (4,)]}),
    )
    assert record.test_case_status == "Success"

    record = _run_validator(
        _case(params={"threshold": "2"}),
        fetch_keys=_fetch_keys({"orders": [(1,), (2,), (3,)], "orders_v2": [(2,), (3,), (4,)]}),
    )
    assert record.test_case_status == "Failed"

    record = _run_validator(
        _case(),
        fetch_keys=_fetch_keys({"orders": [(1,), (2,), (3,)], "orders_v2": [(1,), (2,), (3,)]}),
    )
    assert record.test_case_status == "Success"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "0"},
        {"name": "addedRows", "value": "0"},
        {"name": "diffCount", "value": "0"},
    ]


def test_table_diff_validator_duplicate_keys_abort() -> None:
    record = _run_validator(
        _case(),
        fetch_keys=_fetch_keys({"orders": [(1,), (1,)], "orders_v2": [(1,), (2,)]}),
    )
    assert record.test_case_status == "Aborted"
    assert "not unique" in (record.result or "")
