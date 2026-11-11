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

from smartmetadata_ingestion.config import (
    DataDiffSideSpec,
    DataDiffSpec,
    SchemaDiff,
    SchemaDiffTable,
)
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
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord


def _table(
    *,
    name: str = "orders",
    columns: tuple[TableColumnInfo, ...] = (
        TableColumnInfo(name="id", data_type="INT", constraint="PRIMARY_KEY"),
        TableColumnInfo(name="email", data_type="VARCHAR"),
    ),
    table_profiler_config: dict[str, Any] | None = None,
) -> TableContext:
    return TableContext(
        table=TableRef(service="warehouse", database="analytics", schema="public", table=name),
        columns=columns,
        service_name="warehouse",
        table_profiler_config=table_profiler_config,
    )


def _case(
    *,
    params: dict[str, str] | None = None,
    name: str = "orders_table_diff",
    table2: str | None = "warehouse.analytics.public.orders_v2",
    compute_counts: bool = True,
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
        compute_passed_failed_row_count=compute_counts,
    )


_CONNECTION: dict[str, Any] = {
    "hostPort": "localhost:5432",
    "username": "ingest",
    "password": "secret",
    "database": "analytics",
}


def _side(table: str, **extra: Any) -> DataDiffSideSpec:
    # The setter fills `connection` from the workflow's source connection
    # and leaves `source_type` unset for same-service diffs.
    return DataDiffSideSpec(
        database="analytics",
        schema="public",
        table=table,
        key_columns=["id"],
        connection=dict(_CONNECTION),
        extra_columns=["email"],
        key_column_types={"id": "INT"},
        service="warehouse",
        **extra,
    )


def _schema_table(table: str, columns: list[dict[str, Any]]) -> SchemaDiffTable:
    return SchemaDiffTable(
        service_type="Postgres",
        fully_qualified_table_name=f"warehouse.analytics.public.{table}",
        schema={
            column["name"]: {
                "type": column["dataType"],
                "constraints": column.get("constraint") or "",
            }
            for column in columns
        },
    )


def _resolver(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
    """Resolve any table2 entity (the workflow's
    ``RestClient.get_table_by_name``)."""
    ref = TableRef.parse(fqn)
    return {
        "id": f"table-{ref.table}",
        "name": ref.table,
        "fullyQualifiedName": fqn,
        "service": {"id": f"svc-{ref.service}", "name": ref.service},
        "columns": [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
            {"name": "order_id", "dataType": "INT"},
        ],
    }


def _resolver_same_columns(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
    """Table2 with exactly the table1 columns — no schema diff, so the
    row verdict is isolated from the column verdict."""
    ref = TableRef.parse(fqn)
    return {
        "id": f"table-{ref.table}",
        "name": ref.table,
        "fullyQualifiedName": fqn,
        "service": {"id": f"svc-{ref.service}", "name": ref.service},
        "columns": [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
        ],
    }


def _resolver_key_type_mismatch(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
    """Table2 whose key column changed type (INT -> VARCHAR)."""
    ref = TableRef.parse(fqn)
    return {
        "id": f"table-{ref.table}",
        "name": ref.table,
        "fullyQualifiedName": fqn,
        "service": {"id": f"svc-{ref.service}", "name": ref.service},
        "columns": [
            {"name": "id", "dataType": "VARCHAR", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "VARCHAR"},
        ],
    }


def _service_resolver(
    service_type: str = "Mysql",
    config: dict[str, Any] | None = None,
):
    def _resolve(name: str) -> dict[str, Any]:
        return {
            "id": f"svc-{name}",
            "name": name,
            "serviceType": service_type,
            "connection": {"config": config if config is not None else _MYSQL_CONNECTION},
        }

    return _resolve


_MYSQL_CONNECTION: dict[str, Any] = {
    "hostPort": "localhost:3306",
    "username": "ingest",
    "password": "secret",
    "database": "analytics",
}


def _setter(
    service_resolver=None,
    table_resolver=None,
    dialect: str = "postgres",
) -> TableDiffParamsSetter:
    return TableDiffParamsSetter(
        table_resolver=table_resolver or _resolver,
        source_connection=dict(_CONNECTION),
        service_resolver=service_resolver,
        dialect=dialect,
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


def _run_validator(
    case: PulledTestCase,
    *,
    table: TableContext | None = None,
    fetch_keys=None,
    fetch_rows=None,
    table_resolver=None,
    dialect: str = "postgres",
) -> TestCaseResultRecord:
    spec = _setter(table_resolver=table_resolver, dialect=dialect).compile(case, table or _table())
    validator = TableDiffValidator(
        test_case=case,
        table=table or _table(),
        dialect=dialect,
        execute=lambda sql: 1,
        timestamp=1000,
        spec=spec,
        fetch_keys=fetch_keys,
        fetch_rows=fetch_rows,
    )
    return validator.run()


# -- setter -----------------------------------------------------------------


def test_setter_compiles_explicit_key_columns() -> None:
    spec = _setter().compile(
        _case(params={"keyColumns": '["id"]', "threshold": "2"}),
        _table(),
    )
    # The table2 entity carries one extra non-key column (order_id), so the
    # setter records a schema diff and narrows both extra lists to the
    # shared comparable set (email only).
    assert spec == DataDiffSpec(
        test_case_fqn="warehouse.analytics.public.orders.orders_table_diff",
        left=_side("orders"),
        right=_side("orders_v2"),
        threshold=2,
        schema_diff=SchemaDiff(
            removed=[],
            added=["order_id"],
            changed=[],
            schema_table_1=_schema_table(
                "orders",
                [
                    {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
                    {"name": "email", "dataType": "VARCHAR"},
                ],
            ),
            schema_table_2=_schema_table(
                "orders_v2",
                [
                    {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
                    {"name": "email", "dataType": "VARCHAR"},
                    {"name": "order_id", "dataType": "INT"},
                ],
            ),
        ),
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


def test_setter_rejects_missing_table2_and_cross_service_without_resolver() -> None:
    with pytest.raises(WorkflowError, match="without the required 'table2' parameter"):
        _setter().compile(_case(table2=None), _table())
    # Cross-service without a service resolver fails closed (the connection
    # can only come from the server's service entity).
    with pytest.raises(WorkflowError, match="needs a service resolver"):
        _setter().compile(
            _case(table2="other.analytics.public.orders_v2"),
            _table(),
        )


def test_setter_cross_service_resolves_connection_from_service_entity() -> None:
    spec = _setter(service_resolver=_service_resolver()).compile(
        _case(table2="lakehouse.analytics.public.orders_v2"),
        _table(),
    )
    assert spec.right.source_type == "mysql"
    assert spec.right.connection == _MYSQL_CONNECTION
    assert spec.right.service == "lakehouse"
    assert spec.left.connection == _CONNECTION
    assert spec.left.source_type is None
    assert spec.schema_diff is not None
    assert spec.schema_diff.schema_table_2.service_type == "Mysql"
    assert spec.schema_diff.schema_table_1.service_type == "Postgres"


def test_setter_cross_service_unmapped_type_fails_closed() -> None:
    with pytest.raises(WorkflowError, match="no data-diff binding"):
        _setter(service_resolver=_service_resolver(service_type="Redshift")).compile(
            _case(table2="lakehouse.analytics.public.orders_v2"),
            _table(),
        )


def test_setter_cross_service_incomplete_connection_fails_closed() -> None:
    with pytest.raises(WorkflowError, match="service connection incomplete"):
        _setter(service_resolver=_service_resolver(config={})).compile(
            _case(table2="lakehouse.analytics.public.orders_v2"),
            _table(),
        )


def test_setter_cross_service_unresolvable_service_fails_closed() -> None:
    def _missing(name: str) -> dict[str, Any]:
        raise WorkflowError("not found")

    with pytest.raises(WorkflowError, match="could not resolve tableDiff table2 service"):
        _setter(service_resolver=_missing).compile(
            _case(table2="lakehouse.analytics.public.orders_v2"),
            _table(),
        )


def test_setter_carries_table_profile_config() -> None:
    profiler_config = {
        "profileSampleConfig": {
            "sampleConfigType": "STATIC",
            "config": {"profileSample": 20, "profileSampleType": "PERCENTAGE"},
        }
    }
    spec = _setter().compile(
        _case(),
        _table(table_profiler_config=profiler_config),
    )
    assert spec.table_profile_config == profiler_config
    assert _setter().compile(_case(), _table()).table_profile_config is None
    # A non-dict value (an old entity without the field) reads as None,
    # never an error.
    context = TableContext.from_table_entity(
        {"columns": [], "service": {}, "tableProfilerConfig": "nope"},
        fqn="warehouse.analytics.public.orders",
    )
    assert context.table_profiler_config is None


def test_setter_writes_case_sensitive_columns() -> None:
    assert _setter().compile(_case(), _table()).case_sensitive_columns is False
    spec = _setter().compile(
        _case(params={"caseSensitiveColumns": "true"}),
        _table(),
    )
    assert spec.case_sensitive_columns is True


def test_setter_extra_columns_use_columns_and_per_side_overrides() -> None:
    columns = (
        TableColumnInfo(name="id", data_type="INT", constraint="PRIMARY_KEY"),
        TableColumnInfo(name="email", data_type="VARCHAR"),
        TableColumnInfo(name="age", data_type="INT"),
    )

    def _same_columns(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
        ref = TableRef.parse(fqn)
        return {
            "id": f"table-{ref.table}",
            "name": ref.table,
            "fullyQualifiedName": fqn,
            "service": {"id": "svc-1", "name": "warehouse"},
            "columns": [
                {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
                {"name": "email", "dataType": "VARCHAR"},
                {"name": "age", "dataType": "INT"},
            ],
        }

    setter = TableDiffParamsSetter(
        table_resolver=_same_columns,
        source_connection=dict(_CONNECTION),
        dialect="postgres",
    )
    table = _table(columns=columns)
    # No schema diff here, so the determined lists survive as-is.
    spec = setter.compile(_case(params={"useColumns": '["age"]'}), table)
    assert spec.left.extra_columns == ["age"]
    assert spec.right.extra_columns == ["age"]
    assert spec.schema_diff is None
    spec = setter.compile(
        _case(
            params={
                "table1.extraColumns": '["email"]',
                "table2.extraColumns": '["age"]',
            }
        ),
        table,
    )
    assert spec.left.extra_columns == ["email"]
    assert spec.right.extra_columns == ["age"]
    # Default: the union of both sides' non-key columns.
    spec = setter.compile(_case(), table)
    assert spec.left.extra_columns == ["email", "age"]
    assert spec.right.extra_columns == ["email", "age"]


def test_setter_schema_diff_changed_type_narrows_extra_columns() -> None:
    def _int_email(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
        payload = _resolver(fqn)
        payload["columns"] = [
            {"name": "id", "dataType": "INT", "constraint": "PRIMARY_KEY"},
            {"name": "email", "dataType": "INT"},
            {"name": "order_id", "dataType": "INT"},
        ]
        return payload

    setter = TableDiffParamsSetter(
        table_resolver=_int_email,
        source_connection=dict(_CONNECTION),
        dialect="postgres",
    )
    spec = setter.compile(_case(), _table())
    assert spec.schema_diff is not None
    assert spec.schema_diff.added == ["order_id"]
    assert spec.schema_diff.changed == ["email"]
    # The incomparable column drops out of the compared set entirely.
    assert spec.left.extra_columns == []
    assert spec.right.extra_columns == []


def test_setter_table2_resolution_requests_columns_field() -> None:
    seen: dict[str, Any] = {}

    def _recording(fqn: str, *, fields: str | None = None) -> dict[str, Any]:
        seen["fields"] = fields
        return _resolver(fqn)

    setter = TableDiffParamsSetter(
        table_resolver=_recording,
        source_connection=dict(_CONNECTION),
        dialect="postgres",
    )
    setter.compile(_case(), _table())
    assert seen["fields"] == "columns"


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
        table_resolver=_resolver_same_columns,
        source_connection=dict(_CONNECTION),
        fetch_rows=_fetch_rows({"orders": [(1, "a")], "orders_v2": [(1, "a")]}),
    )
    validator = builder.build(_case(), _table(), timestamp=1000)
    assert isinstance(validator, TableDiffValidator)
    # The compiled spec is the shared DataDiffSpec shape: the validator runs
    # it through the row engine and reports the same verdict.
    record = validator.run()
    assert record.test_case_status == "Success"
    assert record.test_case_fqn == ("warehouse.analytics.public.orders.orders_table_diff")


def test_builder_table_diff_without_resolver_fails_closed() -> None:
    builder = ValidatorBuilder(dialect="postgres", execute=lambda sql: 1)
    with pytest.raises(WorkflowError, match="need a table resolver"):
        builder.build(_case(), _table(), timestamp=1000)


# -- validator --------------------------------------------------------------


def test_table_diff_validator_verdicts() -> None:
    """Row-mode verdicts with identical schemas (no column diff), so the
    threshold cases isolate the row verdict from the column verdict."""
    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c")],
                "orders_v2": [(2, "b"), (3, "c"), (4, "d")],
            }
        ),
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "1"},
        {"name": "addedRows", "value": "1"},
        {"name": "changedRows", "value": "0"},
        {"name": "diffCount", "value": "2"},
    ]
    assert "Found 2 different rows" in (record.result or "")
    assert record.passed_rows == 2  # rows in both tables, values equal
    assert record.failed_rows == 2
    assert record.passed_rows_percentage == pytest.approx(2 / 3 * 100)
    assert record.failed_rows_percentage == pytest.approx(2 / 3 * 100)

    # The official verdict is strict: total < threshold (total == threshold
    # still fails).
    record = _run_validator(
        _case(params={"threshold": "3"}),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c")],
                "orders_v2": [(2, "b"), (3, "c"), (4, "d")],
            }
        ),
    )
    assert record.test_case_status == "Success"

    record = _run_validator(
        _case(params={"threshold": "2"}),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c")],
                "orders_v2": [(2, "b"), (3, "c"), (4, "d")],
            }
        ),
    )
    assert record.test_case_status == "Failed"

    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c")],
                "orders_v2": [(1, "a"), (2, "b"), (3, "c")],
            }
        ),
    )
    assert record.test_case_status == "Success"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "0"},
        {"name": "addedRows", "value": "0"},
        {"name": "changedRows", "value": "0"},
        {"name": "diffCount", "value": "0"},
    ]


def test_table_diff_validator_changed_rows_and_column_diff_counts() -> None:
    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c"), (4, "d")],
                "orders_v2": [(1, "a"), (2, "x"), (3, "y"), (4, "d")],
            }
        ),
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [
        {"name": "removedRows", "value": "0"},
        {"name": "addedRows", "value": "0"},
        {"name": "changedRows", "value": "2"},
        {"name": "diffCount", "value": "2"},
        {"name": "columnDiffCounts", "value": '{"email": 2}'},
    ]
    assert "Columns differing most: email (2)." in (record.result or "")
    assert record.passed_rows == 2
    assert record.passed_rows_percentage == pytest.approx(50.0)
    assert record.failed_rows_percentage == pytest.approx(50.0)


def test_table_diff_validator_column_diff_fails_even_with_matching_rows() -> None:
    """A column diff fails the case even when every row matches and the
    threshold would pass the row verdict."""
    record = _run_validator(
        _case(params={"threshold": "99"}),
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b")],
                "orders_v2": [(1, "a"), (2, "b")],
            }
        ),
    )
    assert record.test_case_status == "Failed"
    assert "Schema mismatch detected" in (record.result or "")
    values = {item["name"]: item["value"] for item in record.test_result_value}
    assert values["addedColumns"] == "1"
    assert values["removedColumns"] == "0"
    assert values["changedColumns"] == "0"
    assert "schemaTable1" in values and "schemaTable2" in values


def test_table_diff_validator_key_type_mismatch_fails() -> None:
    record = _run_validator(
        _case(),
        table_resolver=_resolver_key_type_mismatch,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a")],
                "orders_v2": [(1, "a")],
            }
        ),
    )
    assert record.test_case_status == "Failed"
    assert "Key column 'id' has mismatching types" in (record.result or "")
    assert "'INT' on the left table" in (record.result or "")
    assert "'VARCHAR' on the right table" in (record.result or "")


def test_table_diff_validator_unbound_dialect_aborts() -> None:
    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        dialect="redshift",
        fetch_rows=_fetch_rows({"orders": [(1, "a")], "orders_v2": [(1, "a")]}),
    )
    assert record.test_case_status == "Aborted"
    assert "Unsupported dialect on the left side: 'redshift'" in (record.result or "")


def test_table_diff_validator_capped_count_writes_only_diff_count() -> None:
    """Q-1 (a): the capped branch writes only diffCount = threshold + 1 —
    no "None" strings, no invented counts."""
    record = _run_validator(
        _case(params={"threshold": "2"}, compute_counts=False),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows(
            {
                "orders": [(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")],
                "orders_v2": [],
            }
        ),
    )
    assert record.test_case_status == "Failed"
    assert record.test_result_value == [{"name": "diffCount", "value": "3"}]
    assert all(item["value"] != "None" for item in record.test_result_value)
    assert "capped count, not the full total" in (record.result or "")
    assert record.passed_rows is None
    assert record.failed_rows == 3


def test_table_diff_validator_parallel_queries_invalid_warns_and_falls_back(
    caplog: pytest.LogCaptureFixture,
) -> None:
    record = _run_validator(
        _case(params={"parallelQueries": "0.5"}),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows({"orders": [(1, "a")], "orders_v2": [(1, "a")]}),
    )
    assert record.test_case_status == "Success"
    assert (
        "Ignoring parallelQueries='0.5': it must be a whole number of at least 1. Using 1."
        in caplog.text
    )


def test_table_diff_validator_duplicate_keys_abort() -> None:
    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows({"orders": [(1, "a"), (1, "a")], "orders_v2": [(1, "a"), (2, "b")]}),
    )
    assert record.test_case_status == "Aborted"
    assert "not unique" in (record.result or "")
    assert "warehouse.analytics.public.orders" in (record.result or "")

    record = _run_validator(
        _case(),
        table_resolver=_resolver_same_columns,
        fetch_rows=_fetch_rows({"orders": [(1, "a"), (2, "b")], "orders_v2": [(1, "a"), (1, "a")]}),
    )
    assert record.test_case_status == "Aborted"
    assert "not unique" in (record.result or "")
