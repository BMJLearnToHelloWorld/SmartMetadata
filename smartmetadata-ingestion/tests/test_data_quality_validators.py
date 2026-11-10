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

from smartmetadata_ingestion.data_quality.builder import ValidatorBuilder
from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableColumnInfo,
    TableContext,
    TableRef,
    TestCaseParameter,
)
from smartmetadata_ingestion.data_quality.validators import (
    KNOWN_NEXT_BATCH,
    VALIDATORS,
    parse_set_param,
    parse_threshold,
    row_within,
    widen_bounds,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord

TABLE = TableRef(service="warehouse", database="analytics", schema="public", table="orders")
COLUMNS = (
    TableColumnInfo(name="id", data_type="INT", constraint="PRIMARY_KEY"),
    TableColumnInfo(name="email", data_type="VARCHAR"),
    TableColumnInfo(name="age", data_type="INT"),
    TableColumnInfo(name="active", data_type="BOOLEAN"),
    TableColumnInfo(name="score", data_type="FLOAT"),
)


def _table(*, columns: tuple[TableColumnInfo, ...] = COLUMNS) -> TableContext:
    return TableContext(table=TABLE, columns=columns, service_name="warehouse")


def _case(
    definition: str,
    *,
    column: str | None = "email",
    params: dict[str, str] | None = None,
    name: str = "case",
) -> PulledTestCase:
    link = f"<#E::table::{TABLE.fqn}"
    if column is not None:
        link += f"::columns::{column}"
    link += ">"
    return PulledTestCase(
        name=name,
        fully_qualified_name=f"warehouse.analytics.public.orders.{name}",
        entity_link=link,
        test_definition_name=definition,
        test_definition_fqn=definition,
        parameter_values=tuple(
            TestCaseParameter(name=key, value=value) for key, value in (params or {}).items()
        ),
    )


class _FakeExecute:
    """Answer scalar SQL by substring match, in insertion order."""

    def __init__(self, answers: dict[str, Any]) -> None:
        self._answers = answers
        self.seen: list[str] = []

    def __call__(self, sql: str) -> Any:
        self.seen.append(sql)
        for needle, value in self._answers.items():
            if needle in sql:
                return value
        raise AssertionError(f"unexpected SQL: {sql}")


def _run(
    definition: str,
    answers: dict[str, Any],
    *,
    column: str | None = "email",
    params: dict[str, str] | None = None,
    dialect: str = "postgres",
    table: TableContext | None = None,
) -> tuple[TestCaseResultRecord, _FakeExecute]:
    execute = _FakeExecute(answers)
    builder = ValidatorBuilder(dialect=dialect, execute=execute)
    validator = builder.build(
        _case(definition, column=column, params=params),
        table or _table(),
        timestamp=1000,
    )
    return validator.run(), execute


def _value(record: TestCaseResultRecord, name: str) -> str | None:
    for item in record.test_result_value:
        if item["name"] == name:
            return str(item["value"])
    return None


# -- threshold helpers ------------------------------------------------------


def test_threshold_parsing_and_bounds() -> None:
    assert parse_threshold(_case("x")).value == 0
    assert (
        parse_threshold(_case("x", params={"threshold": "5", "thresholdUnit": "PERCENTAGE"})).unit
        == "PERCENTAGE"
    )
    # Unusable thresholds tolerate nothing (official `is_usable`).
    assert parse_threshold(_case("x", params={"threshold": "-1"})).value == 0
    assert parse_threshold(_case("x", params={"threshold": "inf"})).value == 0
    with pytest.raises(WorkflowError):
        parse_threshold(_case("x", params={"thresholdUnit": "NOPE"}))
    assert row_within(2, 100, parse_threshold(_case("x", params={"threshold": "2"})))
    assert not row_within(3, 100, parse_threshold(_case("x", params={"threshold": "2"})))
    pct = parse_threshold(_case("x", params={"threshold": "2", "thresholdUnit": "PERCENTAGE"}))
    assert row_within(2, 100, pct)
    assert not row_within(3, 100, pct)
    t5 = parse_threshold(_case("x", params={"threshold": "5"}))
    assert widen_bounds(10.0, 20.0, t5) == (5.0, 25.0)
    pct10 = parse_threshold(_case("x", params={"threshold": "10", "thresholdUnit": "PERCENTAGE"}))
    assert widen_bounds(10.0, 20.0, pct10) == (9.0, 22.0)
    assert widen_bounds(None, 20.0, t5) == (None, 25.0)


def test_parse_set_param_literal_then_json() -> None:
    assert parse_set_param("['a', 'b']", boolean_column=False) == ["a", "b"]
    assert parse_set_param('["a", "b"]', boolean_column=False) == ["a", "b"]
    assert parse_set_param("[1, 2]", boolean_column=False) == [1, 2]
    assert parse_set_param('["true", "false"]', boolean_column=True) == [True, False]
    assert parse_set_param('["true"]', boolean_column=False) == ["true"]
    with pytest.raises(WorkflowError):
        parse_set_param("not-a-list", boolean_column=False)


# -- column validators ------------------------------------------------------


def test_not_null_pass_and_fail_and_percentage_threshold() -> None:
    record, execute = _run(
        "columnValuesToBeNotNull",
        {"IS NULL": 0, "COUNT(*)": 10},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "nullCount") == "0"
    assert _value(record, "rowCount") == "10"
    assert record.passed_rows == 10 and record.failed_rows == 0
    assert execute.seen[0] == (
        'SELECT COUNT(*) FROM "analytics"."public"."orders" WHERE "email" IS NULL'
    )

    record, _ = _run(
        "columnValuesToBeNotNull",
        {"IS NULL": 1, "COUNT(*)": 10},
    )
    assert record.test_case_status == "Failed"

    record, _ = _run(
        "columnValuesToBeNotNull",
        {"IS NULL": 1, "COUNT(*)": 100},
        params={"threshold": "1", "thresholdUnit": "PERCENTAGE"},
    )
    assert record.test_case_status == "Success"


def test_unique_counts_duplicates() -> None:
    record, execute = _run(
        "columnValuesToBeUnique",
        {"COUNT(DISTINCT": 9, "COUNT(*)": 10},
    )
    assert record.test_case_status == "Failed"
    assert _value(record, "distinctCount") == "9"
    assert record.passed_rows == 9 and record.failed_rows == 1
    assert execute.seen[0] == ('SELECT COUNT(DISTINCT "email") FROM "analytics"."public"."orders"')


def test_between_bounds_and_violation_count() -> None:
    record, execute = _run(
        "columnValuesToBeBetween",
        {"MIN(": 2, "MAX(": 8, "WHERE": 0, "COUNT(*)": 10},
        column="age",
        params={"minValue": "1", "maxValue": "10"},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "min") == "2"
    assert _value(record, "max") == "8"
    # Violation predicate uses the raw bounds.
    assert '"age" < 1' in execute.seen[3] or '"age" < 1.0' in execute.seen[3]
    assert '"age" > 10' in execute.seen[3] or '"age" > 10.0' in execute.seen[3]

    record, _ = _run(
        "columnValuesToBeBetween",
        {"MIN(": 0, "MAX(": 8, "WHERE": 0, "COUNT(*)": 10},
        column="age",
        params={"minValue": "1", "maxValue": "10"},
    )
    assert record.test_case_status == "Failed"

    # One-sided bound: only the max applies.
    record, _ = _run(
        "columnValuesToBeBetween",
        {"MIN(": 0, "MAX(": 8, "WHERE": 0, "COUNT(*)": 10},
        column="age",
        params={"maxValue": "10"},
    )
    assert record.test_case_status == "Success"

    # Empty column: no observed min/max, nothing violates the bounds.
    record, _ = _run(
        "columnValuesToBeBetween",
        {"MIN(": None, "MAX(": None, "WHERE": 0, "COUNT(*)": 0},
        column="age",
        params={"minValue": "1", "maxValue": "10"},
    )
    assert record.test_case_status == "Success"


def test_between_bound_tolerance_and_row_threshold() -> None:
    record, _ = _run(
        "columnValuesToBeBetween",
        {"MIN(": 0, "MAX(": 11, "WHERE": 1, "COUNT(*)": 100},
        column="age",
        params={"minValue": "1", "maxValue": "10", "threshold": "1"},
    )
    # min 0 is inside the widened bound [0, 11]; the single violation is
    # within the absolute row threshold of 1.
    assert record.test_case_status == "Success"

    record, _ = _run(
        "columnValuesToBeBetween",
        {"MIN(": 0, "MAX(": 11, "WHERE": 2, "COUNT(*)": 100},
        column="age",
        params={"minValue": "1", "maxValue": "10", "threshold": "1"},
    )
    assert record.test_case_status == "Failed"


@pytest.mark.parametrize(
    "definition,params,aggregate,observed",
    [
        (
            "columnValueMeanToBeBetween",
            {"minValueForMeanInCol": "1", "maxValueForMeanInCol": "10"},
            "AVG(",
            5.5,
        ),
        (
            "columnValueMinToBeBetween",
            {"minValueForMinInCol": "1", "maxValueForMinInCol": "10"},
            "MIN(",
            2,
        ),
        (
            "columnValueMaxToBeBetween",
            {"minValueForMaxInCol": "1", "maxValueForMaxInCol": "10"},
            "MAX(",
            9,
        ),
        (
            "columnValueStdDevToBeBetween",
            {"minValueForStdDevInCol": "1", "maxValueForStdDevInCol": "10"},
            "STDDEV(",
            3.2,
        ),
        (
            "columnValuesSumToBeBetween",
            {"minValueForColSum": "1", "maxValueForColSum": "100"},
            "SUM(",
            42,
        ),
    ],
)
def test_aggregate_between(definition, params, aggregate, observed) -> None:
    record, execute = _run(definition, {aggregate: observed}, column="age", params=params)
    assert record.test_case_status == "Success"
    assert aggregate in execute.seen[0]
    assert "postgres" not in execute.seen[0]

    record, _ = _run(definition, {aggregate: 999}, column="age", params=params)
    assert record.test_case_status == "Failed"


def test_aggregate_on_empty_column_has_no_observed_value() -> None:
    # An empty column's aggregate is NULL: no observed value, so no bound
    # can be violated and the case holds.
    record, _ = _run(
        "columnValueMeanToBeBetween",
        {"AVG(": None},
        column="age",
        params={"minValueForMeanInCol": "1", "maxValueForMeanInCol": "10"},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "mean") == "None"


def test_stddev_uses_stdev_on_mssql() -> None:
    _, execute = _run(
        "columnValueStdDevToBeBetween",
        {"STDEV(": 2.0},
        column="age",
        params={"minValueForStdDevInCol": "1", "maxValueForStdDevInCol": "10"},
        dialect="mssql",
    )
    assert "STDEV(" in execute.seen[0]


def test_median_sql_per_dialect_mysql_renders_and_mariadb_fails_closed() -> None:
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"percentile_cont(0.50)": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
    )
    assert execute.seen[0] == (
        'SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY "age" ASC) '
        'FROM "analytics"."public"."orders"'
    )
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"approx_percentile": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
        dialect="snowflake",
    )
    assert "approx_percentile(" in execute.seen[0]
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"percentile_approx": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
        dialect="databricks",
    )
    assert "percentile_approx(" in execute.seen[0]
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"OVER()": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
        dialect="mssql",
    )
    assert "OVER()" in execute.seen[0]
    # MySQL renders the official ROW_NUMBER subquery against the table.
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"ROW_NUMBER()": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
        dialect="mysql",
    )
    assert execute.seen[0] == (
        "SELECT (SELECT _pct_col FROM (SELECT `age` AS _pct_col, "
        "ROW_NUMBER() OVER (ORDER BY `age`) AS row_num, "
        "COUNT(*) OVER () AS total_count FROM `analytics`.`orders`) temp "
        "WHERE temp.row_num = ROUND(0.50 * temp.total_count)) "
        "FROM `analytics`.`orders`"
    )
    # Doris renders percentile_approx.
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"percentile_approx": 5.0},
        column="age",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
        dialect="doris",
    )
    assert "percentile_approx(`age`, 0.50)" in execute.seen[0]
    # String columns median over their length (official LenFn).
    _, execute = _run(
        "columnValueMedianToBeBetween",
        {"percentile_cont(0.50)": 3.0},
        column="email",
        params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
    )
    assert execute.seen[0] == (
        'SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY CHAR_LENGTH("email") ASC) '
        'FROM "analytics"."public"."orders"'
    )
    # No official compile for MariaDB: fail closed, never a substitute value.
    with pytest.raises(WorkflowError, match="no MariaDB compile"):
        _run(
            "columnValueMedianToBeBetween",
            {},
            column="age",
            params={"minValueForMedianInCol": "1", "maxValueForMedianInCol": "10"},
            dialect="mariadb",
        )


def test_in_set_match_enum_and_any() -> None:
    record, execute = _run(
        "columnValuesToBeInSet",
        {"IN (": 8, "COUNT(": 10},
        params={"allowedValues": "['a', 'b']", "matchEnum": "true"},
    )
    assert record.test_case_status == "Failed"
    assert _value(record, "countInSet") == "8"
    assert record.passed_rows == 8 and record.failed_rows == 2
    assert execute.seen[0] == (
        'SELECT COUNT(*) FROM "analytics"."public"."orders" WHERE "email" IN (\'a\', \'b\')'
    )

    record, _ = _run(
        "columnValuesToBeInSet",
        {"IN (": 3},
        params={"allowedValues": '["a", "b"]'},
    )
    assert record.test_case_status == "Success"

    record, _ = _run(
        "columnValuesToBeInSet",
        {"IN (": 0},
        params={"allowedValues": '["a", "b"]'},
    )
    assert record.test_case_status == "Failed"

    with pytest.raises(WorkflowError, match="missing required parameter"):
        _run("columnValuesToBeInSet", {"IN (": 0}, params={})


def test_not_in_set_and_boolean_set_values() -> None:
    record, _ = _run(
        "columnValuesToBeNotInSet",
        {"IN (": 0, "COUNT(*)": 5},
        params={"forbiddenValues": "['x']"},
    )
    assert record.test_case_status == "Success"
    record, _ = _run(
        "columnValuesToBeNotInSet",
        {"IN (": 1, "COUNT(*)": 5},
        params={"forbiddenValues": "['x']"},
    )
    assert record.test_case_status == "Failed"

    # Boolean columns map "true"/"false" strings to booleans.
    _, execute = _run(
        "columnValuesToBeInSet",
        {"IN (": 2},
        column="active",
        params={"allowedValues": '["true"]'},
    )
    assert "IN (TRUE)" in execute.seen[0]


def test_regex_per_dialect() -> None:
    record, execute = _run(
        "columnValuesToMatchRegex",
        {"WHERE": 9, "COUNT(": 10},
        params={"regex": "^a.*"},
    )
    assert record.test_case_status == "Failed"
    assert "\"email\" ~ '^a.*'" in execute.seen[1]
    assert _value(record, "valuesCount") == "10"
    assert _value(record, "regexCount") == "9"

    _, execute = _run(
        "columnValuesToMatchRegex",
        {"WHERE": 10, "COUNT(": 10},
        params={"regex": "^a.*"},
        dialect="mysql",
    )
    assert "\"email\" REGEXP '^a.*'" in execute.seen[1] or "`email` REGEXP" in execute.seen[1]

    _, execute = _run(
        "columnValuesToMatchRegex",
        {"WHERE": 10, "COUNT(": 10},
        params={"regex": "^a.*"},
        dialect="snowflake",
    )
    assert "REGEXP_LIKE(" in execute.seen[1]

    _, execute = _run(
        "columnValuesToMatchRegex",
        {"WHERE": 10, "COUNT(": 10},
        params={"regex": "^a.*"},
        dialect="mssql",
    )
    assert "LIKE" in execute.seen[1]

    record, _ = _run(
        "columnValuesToNotMatchRegex",
        {"WHERE": 0, "COUNT(": 10},
        params={"forbiddenRegex": "^a.*"},
    )
    assert record.test_case_status == "Success"


def test_lengths_between() -> None:
    record, execute = _run(
        "columnValueLengthsToBeBetween",
        {"MIN(": 2, "MAX(": 8},
        params={"minLength": "1", "maxLength": "10"},
    )
    assert record.test_case_status == "Success"
    assert "CHAR_LENGTH(" in execute.seen[0]

    _, execute = _run(
        "columnValueLengthsToBeBetween",
        {"MIN(": 2, "MAX(": 8},
        params={"minLength": "1", "maxLength": "10"},
        dialect="mssql",
    )
    assert "LEN(" in execute.seen[0]

    record, _ = _run(
        "columnValueLengthsToBeBetween",
        {"MIN(": 0, "MAX(": 8},
        params={"minLength": "1", "maxLength": "10"},
    )
    assert record.test_case_status == "Failed"


def test_missing_count() -> None:
    record, execute = _run(
        "columnValuesMissingCount",
        {"WHERE": 3},
        params={"missingCountValue": "3"},
    )
    assert record.test_case_status == "Success"
    # VARCHAR columns count NULL + ''.
    assert '"email" IS NULL OR "email" = \'\'' in execute.seen[0]
    assert _value(record, "nullMissingCount") == "3"
    assert _value(record, "total_missing_count") == "3"

    record, _ = _run(
        "columnValuesMissingCount",
        {"IS NULL": 2, "N/A": 1},
        params={"missingCountValue": "3", "missingValueMatch": "N/A"},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "countInSet") == "1"

    # INT columns cannot hold '': only NULLs count.
    record, execute = _run(
        "columnValuesMissingCount",
        {"WHERE": 1},
        column="age",
        params={"missingCountValue": "1"},
    )
    assert record.test_case_status == "Success"
    assert "= ''" not in execute.seen[0]


# -- table validators -------------------------------------------------------


def test_row_count_between_and_equal() -> None:
    record, _ = _run(
        "tableRowCountToBeBetween",
        {"COUNT(*)": 50},
        column=None,
        params={"minValue": "10", "maxValue": "100"},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "rowCount") == "50"

    record, _ = _run(
        "tableRowCountToBeBetween",
        {"COUNT(*)": 5},
        column=None,
        params={"minValue": "10", "maxValue": "100"},
    )
    assert record.test_case_status == "Failed"

    record, _ = _run(
        "tableRowCountToEqual",
        {"COUNT(*)": 42},
        column=None,
        params={"value": "42"},
    )
    assert record.test_case_status == "Success"

    record, _ = _run(
        "tableRowCountToEqual",
        {"COUNT(*)": 41},
        column=None,
        params={"value": "42", "threshold": "1"},
    )
    assert record.test_case_status == "Success"


def test_column_count_from_pulled_table_entity() -> None:
    record, _ = _run(
        "tableColumnCountToBeBetween",
        {},
        column=None,
        params={"minColValue": "1", "maxColValue": "5"},
    )
    assert record.test_case_status == "Success"
    assert _value(record, "columnCount") == "5"

    record, _ = _run(
        "tableColumnCountToEqual",
        {},
        column=None,
        params={"columnCount": "5"},
    )
    assert record.test_case_status == "Success"

    record, _ = _run(
        "tableColumnCountToEqual",
        {},
        column=None,
        params={"columnCount": "4"},
    )
    assert record.test_case_status == "Failed"


# -- registry / builder ------------------------------------------------------


def test_registry_covers_the_batch_set() -> None:
    assert set(VALIDATORS) == {
        "columnValuesToBeNotNull",
        "columnValuesToBeUnique",
        "columnValuesToBeBetween",
        "columnValueMeanToBeBetween",
        "columnValueMinToBeBetween",
        "columnValueMaxToBeBetween",
        "columnValueStdDevToBeBetween",
        "columnValueMedianToBeBetween",
        "columnValuesSumToBeBetween",
        "columnValuesToBeInSet",
        "columnValuesToBeNotInSet",
        "columnValuesToMatchRegex",
        "columnValuesToNotMatchRegex",
        "columnValueLengthsToBeBetween",
        "columnValuesMissingCount",
        "tableRowCountToBeBetween",
        "tableRowCountToEqual",
        "tableColumnCountToBeBetween",
        "tableColumnCountToEqual",
    }
    assert "columnValuesToBeAtExpectedLocation" not in VALIDATORS
    assert "tableDiff" not in VALIDATORS  # built by the tableDiff path
    assert KNOWN_NEXT_BATCH >= {
        "columnValuesToBeAtExpectedLocation",
        "tableColumnNameToExist",
        "tableCustomSQLQuery",
    }


def test_builder_unknown_definition_fails_closed() -> None:
    builder = ValidatorBuilder(dialect="postgres", execute=lambda sql: 1)
    with pytest.raises(WorkflowError, match="next validator batch"):
        builder.build(
            _case("columnValuesToBeAtExpectedLocation"),
            _table(),
            timestamp=1,
        )
    with pytest.raises(WorkflowError, match="not a known test definition"):
        builder.build(_case("columnValuesToBeMadeUp"), _table(), timestamp=1)


def test_mysql_two_part_table_reference() -> None:
    _, execute = _run(
        "columnValuesToBeNotNull",
        {"IS NULL": 0, "COUNT(*)": 1},
        dialect="mysql",
    )
    assert execute.seen[0] == ("SELECT COUNT(*) FROM `analytics`.`orders` WHERE `email` IS NULL")
