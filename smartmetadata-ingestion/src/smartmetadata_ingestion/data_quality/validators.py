# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Validator library for server-pulled test cases.

Clean-room port of the official validator *semantics* at pin ``a3012259ca``
(``data_quality/validations/column|table/base/*.py``) onto the product's
execution surface: each validator compiles its pulled test case into scalar
SQL statements run through the existing DB-API execute callback, and
computes the verdict itself. No validator is a stub — every registered
definition runs real SQL. Definitions outside this batch fail closed in
the builder (see ``KNOWN_NEXT_BATCH``).

Parameter names are verbatim from the official test-definition seed JSONs
(``openmetadata-service/.../json/data/tests/*.json``). Threshold semantics
mirror official ``validations/thresholds.py``.

ADR:2026-11-08-validator-compile-table-diff-params
"""

from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from ast import literal_eval
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, ClassVar

from smartmetadata_ingestion.connectors.profile_sql import is_string_type
from smartmetadata_ingestion.data_quality import sql as dq_sql
from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableContext,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord

ExecuteFn = Callable[[str], Any]

# Definitions the server seeds but this batch does not implement. The
# builder names them in its error instead of silently skipping the case.
KNOWN_NEXT_BATCH = frozenset(
    {
        "columnValuesToBeAtExpectedLocation",
        "tableColumnNameToExist",
        "tableColumnToMatchSet",
        "tableCustomSQLQuery",
        "tableRowInsertedCountToBeBetween",
    }
)

# Rule-library validators are addressed by validatorClass on a custom test
# definition, not by a seeded definition name; also next batch.
KNOWN_RULE_LIBRARY = frozenset(
    {
        "ColumnRuleLibrarySqlExpressionValidator",
        "TableRuleLibrarySqlExpressionValidator",
    }
)


@dataclass(frozen=True)
class FailureThreshold:
    """What a test case tolerates before it is reported as failed."""

    value: float = 0.0
    unit: str = "ABSOLUTE"


def parse_threshold(test_case: PulledTestCase) -> FailureThreshold:
    raw = test_case.param("threshold")
    unit = (test_case.param("thresholdUnit") or "ABSOLUTE").strip().upper()
    if unit not in {"ABSOLUTE", "PERCENTAGE"}:
        raise WorkflowError(
            f"test case {test_case.fully_qualified_name!r} has an unsupported "
            f"thresholdUnit {unit!r}"
        )
    if raw is None:
        return FailureThreshold()
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise WorkflowError(
            f"test case {test_case.fully_qualified_name!r} has a non-numeric threshold {raw!r}"
        ) from exc
    if not math.isfinite(value) or value < 0:
        # Official `is_usable`: an unusable threshold tolerates nothing.
        return FailureThreshold()
    return FailureThreshold(value=value, unit=unit)


def row_within(failed: int, total: int | None, threshold: FailureThreshold) -> bool:
    """Row tolerance: failures within the threshold (official `_apply_row_threshold`)."""
    if threshold.unit == "PERCENTAGE":
        if total is None or total <= 0:
            return failed <= 0
        return failed / total * 100 <= threshold.value
    return failed <= threshold.value


def widen_bounds(
    min_bound: float | None,
    max_bound: float | None,
    threshold: FailureThreshold,
) -> tuple[float | None, float | None]:
    """Widen already-resolved bounds by the failure threshold (official `apply_bound_tolerance`).

    An unset bound stays unset; a zero reference stays strict (a percentage
    of 0 is 0).
    """
    if threshold.value == 0:
        return min_bound, max_bound

    def widen(bound: float | None, sign: float) -> float | None:
        if bound is None:
            return None
        if threshold.unit == "PERCENTAGE":
            return bound + sign * abs(bound) * threshold.value / 100
        return bound + sign * threshold.value

    return widen(min_bound, -1), widen(max_bound, 1)


def within_tolerance(actual: float, expected: float, threshold: FailureThreshold) -> bool:
    """Deviation tolerance for exact-value validators."""
    if threshold.unit == "PERCENTAGE":
        tolerance = abs(expected) * threshold.value / 100
    else:
        tolerance = threshold.value
    return abs(actual - expected) <= tolerance


def parse_set_param(raw: str, *, boolean_column: bool) -> list[Any]:
    """Parse an allowed/forbidden set exactly like official `parse_set_values`.

    ``literal_eval`` first, JSON fallback; on a boolean column the strings
    ``"true"``/``"false"`` become booleans.
    """
    try:
        value = literal_eval(raw)
    except (ValueError, SyntaxError):
        try:
            value = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise WorkflowError(f"could not parse set value {raw!r}") from exc
    if not isinstance(value, (list, tuple, set)):
        raise WorkflowError(f"a set of values must be a list, got {raw!r}")
    parsed = list(value)
    if boolean_column:
        return [
            {"true": True, "false": False}.get(item.lower(), item)
            if isinstance(item, str)
            else item
            for item in parsed
        ]
    return parsed


# Data types that cannot hold '' (official `NullMissingCount`: comparing
# them against '' errors on some dialects or counts real values as missing).
_NON_EMPTY_TOKENS = (
    "int",
    "bigint",
    "smallint",
    "tinyint",
    "decimal",
    "numeric",
    "float",
    "double",
    "real",
    "number",
    "money",
    "serial",
    "date",
    "time",
    "timestamp",
    "bool",
    "uuid",
    "json",
    "array",
    "interval",
    "enum",
)


def can_hold_empty_string(data_type: str | None) -> bool:
    """Whether ``col = ''`` is meaningful for the column type.

    Unknown types fall through to True, like the official metric.
    """
    if data_type is None:
        return True
    lowered = data_type.lower()
    return not any(token in lowered for token in _NON_EMPTY_TOKENS)


class Validator(ABC):
    """One compiled test case: SQL in, ``TestCaseResultRecord`` out."""

    definition_name: ClassVar[str]

    def __init__(
        self,
        *,
        test_case: PulledTestCase,
        table: TableContext,
        dialect: str,
        execute: ExecuteFn,
        timestamp: int,
    ) -> None:
        self.test_case = test_case
        self.table = table
        self.dialect = dialect
        self._execute = execute
        self.timestamp = timestamp

    @abstractmethod
    def run(self) -> TestCaseResultRecord: ...

    # -- shared helpers -------------------------------------------------

    def _scalar(self, sql: str) -> Any:
        value = self._execute(sql)
        if value is None:
            raise WorkflowError(
                f"test case {self.test_case.fully_qualified_name!r} query returned no rows: {sql}"
            )
        return value

    def _scalar_or_none(self, sql: str) -> Any:
        # Aggregates over an empty (or all-NULL) column return one row with
        # NULL — that is an observed "no value", not a missing row, so the
        # callers that guard `is not None` read through here instead of
        # `_scalar`, which would raise and make their guards dead code.
        return self._execute(sql)

    def _count(self, sql: str) -> int:
        return int(self._scalar(sql))

    def _table_sql(self) -> str:
        return dq_sql.table_sql(self.dialect, self.table.table)

    def _column(self) -> str:
        name = self.test_case.column_name()
        if not name:
            raise WorkflowError(
                f"test case {self.test_case.fully_qualified_name!r} is a "
                "column test but its entityLink names no column"
            )
        if self.table.column(name) is None:
            raise WorkflowError(
                f"column {name!r} of test case "
                f"{self.test_case.fully_qualified_name!r} is not in table "
                f"{self.table.table.fqn!r}"
            )
        return name

    def _column_sql(self) -> str:
        return dq_sql.quote_ident(self.dialect, self._column())

    def _column_data_type(self) -> str | None:
        info = self.table.column(self._column())
        return info.data_type if info is not None else None

    def _threshold(self) -> FailureThreshold:
        return parse_threshold(self.test_case)

    def _param(self, name: str, *, required: bool = False) -> str | None:
        value = self.test_case.param(name)
        if value is None and required:
            raise WorkflowError(
                f"test case {self.test_case.fully_qualified_name!r} is "
                f"missing required parameter {name!r}"
            )
        return value

    def _float_param(
        self, name: str, *, required: bool = False, default: float | None = None
    ) -> float | None:
        raw = self._param(name, required=required)
        if raw is None:
            return default
        try:
            return float(raw)
        except (TypeError, ValueError) as exc:
            raise WorkflowError(
                f"test case {self.test_case.fully_qualified_name!r} has a "
                f"non-numeric parameter {name}={raw!r}"
            ) from exc

    def _int_param(
        self, name: str, *, required: bool = False, default: int | None = None
    ) -> int | None:
        value = self._float_param(name, required=required)
        if value is None:
            return default
        if not value.is_integer():
            raise WorkflowError(
                f"test case {self.test_case.fully_qualified_name!r} has a "
                f"non-integer parameter {name}={value!r}"
            )
        return int(value)

    def _bool_param(self, name: str, *, default: bool = False) -> bool:
        raw = self._param(name)
        if raw is None:
            return default
        lowered = raw.strip().lower()
        if lowered in {"true", "false"}:
            return lowered == "true"
        raise WorkflowError(
            f"test case {self.test_case.fully_qualified_name!r} has a "
            f"non-boolean parameter {name}={raw!r}"
        )

    def _set_param(self, name: str, *, required: bool = False) -> list[Any]:
        raw = self._param(name, required=required)
        if raw is None:
            return []
        return parse_set_param(
            raw,
            boolean_column=((self._column_data_type() or "").lower().strip() == "boolean"),
        )

    def _result(
        self,
        status: str,
        message: str,
        values: list[tuple[str, Any]],
        *,
        passed_rows: int | None = None,
        failed_rows: int | None = None,
    ) -> TestCaseResultRecord:
        record = TestCaseResultRecord(
            test_case_fqn=self.test_case.fully_qualified_name,
            timestamp=self.timestamp,
            test_case_status=status,
            test_result_value=[
                {"name": name, "value": _result_str(value)} for name, value in values
            ],
            result=message,
        )
        if self.test_case.compute_passed_failed_row_count and passed_rows is not None:
            record.passed_rows = passed_rows
        if self.test_case.compute_passed_failed_row_count and failed_rows is not None:
            record.failed_rows = failed_rows
        return record

    def _status(self, matched: bool) -> str:
        return "Success" if matched else "Failed"


def _result_str(value: Any) -> str:
    if value is None:
        return "None"
    if isinstance(value, float):
        return repr(value)
    return str(value)


# -- column validators ----------------------------------------------------


class ColumnValuesToBeNotNullValidator(Validator):
    definition_name = "columnValuesToBeNotNull"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        nulls = self._count(f"SELECT COUNT(*) FROM {table} WHERE {column} IS NULL")
        total = self._count(f"SELECT COUNT(*) FROM {table}")
        threshold = self._threshold()
        matched = row_within(nulls, total, threshold)
        return self._result(
            self._status(matched),
            f"Found {nulls} null values out of {total} rows in column {self._column()}",
            [("nullCount", nulls), ("rowCount", total)],
            passed_rows=total - nulls,
            failed_rows=nulls,
        )


class ColumnValuesToBeUniqueValidator(Validator):
    definition_name = "columnValuesToBeUnique"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        distinct = self._count(f"SELECT COUNT(DISTINCT {column}) FROM {table}")
        total = self._count(f"SELECT COUNT(*) FROM {table}")
        duplicates = total - distinct
        threshold = self._threshold()
        matched = row_within(duplicates, total, threshold)
        return self._result(
            self._status(matched),
            f"Found {duplicates} duplicate values out of {total} rows in column {self._column()}",
            [("distinctCount", distinct), ("rowCount", total)],
            passed_rows=total - duplicates,
            failed_rows=duplicates,
        )


class ColumnValuesToBeBetweenValidator(Validator):
    definition_name = "columnValuesToBeBetween"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        raw_min = self._float_param("minValue")
        raw_max = self._float_param("maxValue")
        min_bound, max_bound = widen_bounds(raw_min, raw_max, self._threshold())
        observed_min = self._scalar_or_none(f"SELECT MIN({column}) FROM {table}")
        observed_max = self._scalar_or_none(f"SELECT MAX({column}) FROM {table}")
        matched = self._in_bounds(observed_min, observed_max, min_bound, max_bound)
        total = violations = None
        if self.test_case.compute_passed_failed_row_count:
            total = self._count(f"SELECT COUNT(*) FROM {table}")
            # Violations count against the raw bounds (official
            # `_run_violation_count` reads the test parameters, not the
            # widened bounds); the row threshold then tolerates them.
            violations = self._count(
                "SELECT COUNT(*) FROM "
                f"{table} WHERE {self._violation_predicate(column, raw_min, raw_max)}"
            )
            if self._threshold().value > 0:
                matched = matched and row_within(violations, total, self._threshold())
        return self._result(
            self._status(matched),
            f"Column {self._column()} min {observed_min} max {observed_max} "
            f"against bounds [{min_bound}, {max_bound}]",
            [("min", observed_min), ("max", observed_max)],
            passed_rows=None if total is None else total - (violations or 0),
            failed_rows=violations,
        )

    @staticmethod
    def _in_bounds(
        observed_min: Any,
        observed_max: Any,
        min_bound: float | None,
        max_bound: float | None,
    ) -> bool:
        # An empty (or all-NULL) column has no observed min/max; there is
        # nothing outside the bounds, so that side holds.
        if observed_min is not None and min_bound is not None:
            if not observed_min >= min_bound:
                return False
        if observed_max is not None and max_bound is not None:
            if not observed_max <= max_bound:
                return False
        return True

    def _violation_predicate(
        self, column: str, min_bound: float | None, max_bound: float | None
    ) -> str:
        conditions: list[str] = []
        if min_bound is not None:
            conditions.append(f"{column} < {dq_sql.literal(min_bound)}")
        if max_bound is not None:
            conditions.append(f"{column} > {dq_sql.literal(max_bound)}")
        if not conditions:
            return "1 = 0"
        return " OR ".join(conditions)


class _AggregateBetweenValidator(Validator):
    """A column aggregate that must lie between two bounds."""

    min_param: ClassVar[str]
    max_param: ClassVar[str]
    metric_name: ClassVar[str]

    def _aggregate_sql(self, column_sql: str) -> str:
        raise NotImplementedError

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        aggregate_sql = self._aggregate_sql(column)
        observed = self._scalar_or_none(f"SELECT {aggregate_sql} FROM {table}")
        min_bound, max_bound = widen_bounds(
            self._float_param(self.min_param),
            self._float_param(self.max_param),
            self._threshold(),
        )
        matched = True
        if observed is not None and min_bound is not None:
            matched = matched and observed >= min_bound
        if observed is not None and max_bound is not None:
            matched = matched and observed <= max_bound
        return self._result(
            self._status(matched),
            f"Column {self._column()} {self.metric_name} {observed} against "
            f"bounds [{min_bound}, {max_bound}]",
            [(self.metric_name, observed)],
        )


class ColumnValueMeanToBeBetweenValidator(_AggregateBetweenValidator):
    definition_name = "columnValueMeanToBeBetween"
    min_param = "minValueForMeanInCol"
    max_param = "maxValueForMeanInCol"
    metric_name = "mean"

    def _aggregate_sql(self, column_sql: str) -> str:
        return f"AVG({column_sql})"


class ColumnValueMinToBeBetweenValidator(_AggregateBetweenValidator):
    definition_name = "columnValueMinToBeBetween"
    min_param = "minValueForMinInCol"
    max_param = "maxValueForMinInCol"
    metric_name = "min"

    def _aggregate_sql(self, column_sql: str) -> str:
        return f"MIN({column_sql})"


class ColumnValueMaxToBeBetweenValidator(_AggregateBetweenValidator):
    definition_name = "columnValueMaxToBeBetween"
    min_param = "minValueForMaxInCol"
    max_param = "maxValueForMaxInCol"
    metric_name = "max"

    def _aggregate_sql(self, column_sql: str) -> str:
        return f"MAX({column_sql})"


class ColumnValueStdDevToBeBetweenValidator(_AggregateBetweenValidator):
    definition_name = "columnValueStdDevToBeBetween"
    min_param = "minValueForStdDevInCol"
    max_param = "maxValueForStdDevInCol"
    metric_name = "stddev"

    def _aggregate_sql(self, column_sql: str) -> str:
        return dq_sql.stddev_sql(self.dialect, column_sql)


class ColumnValueMedianToBeBetweenValidator(_AggregateBetweenValidator):
    """Median bounds. SQL compiles this batch; live acceptance waits for
    the (c) window metric `median` (Wave 3 serial point 6) — no median
    value is ever faked inside the validator.

    String columns median over their length (official Median.fn: LenFn
    for concatenable columns); the shared percentile renderer supplies
    the per-dialect compile, including MySQL (needs the table source).

    ADR:2026-11-08-validator-compile-table-diff-params
    ADR:2026-11-10-profiler-window-hybrid-metrics
    """

    definition_name = "columnValueMedianToBeBetween"
    min_param = "minValueForMedianInCol"
    max_param = "maxValueForMedianInCol"
    metric_name = "median"

    def _aggregate_sql(self, column_sql: str) -> str:
        if is_string_type(self._column_data_type()):
            column_sql = dq_sql.length_sql(self.dialect, column_sql)
        return dq_sql.median_sql(self.dialect, column_sql, table_sql=self._table_sql())


class ColumnValuesSumToBeBetweenValidator(_AggregateBetweenValidator):
    definition_name = "columnValuesSumToBeBetween"
    min_param = "minValueForColSum"
    max_param = "maxValueForColSum"
    metric_name = "sum"

    def _aggregate_sql(self, column_sql: str) -> str:
        return f"SUM({column_sql})"


class ColumnValuesToBeInSetValidator(Validator):
    definition_name = "columnValuesToBeInSet"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        allowed = self._set_param("allowedValues", required=True)
        match_enum = self._bool_param("matchEnum", default=False)
        in_set = self._count(
            f"SELECT COUNT(*) FROM {table} WHERE {column} IN {dq_sql.literal_list(allowed)}"
        )
        values: list[tuple[str, Any]] = [("countInSet", in_set)]
        if match_enum:
            total = self._count(f"SELECT COUNT({column}) FROM {table}")
            violations = total - in_set
            matched = row_within(violations, total, self._threshold())
            values.append(("rowCount", total))
            return self._result(
                self._status(matched),
                f"Found {violations} values outside the allowed set out of "
                f"{total} non-null values in column {self._column()}",
                values,
                passed_rows=in_set,
                failed_rows=violations,
            )
        matched = in_set > 0
        return self._result(
            self._status(matched),
            f"Found {in_set} values inside the allowed set in column {self._column()}",
            values,
            passed_rows=in_set,
        )


class ColumnValuesToBeNotInSetValidator(Validator):
    definition_name = "columnValuesToBeNotInSet"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        forbidden = self._set_param("forbiddenValues", required=True)
        in_set = self._count(
            f"SELECT COUNT(*) FROM {table} WHERE {column} IN {dq_sql.literal_list(forbidden)}"
        )
        total = self._count(f"SELECT COUNT(*) FROM {table}")
        matched = row_within(in_set, total, self._threshold())
        return self._result(
            self._status(matched),
            f"Found {in_set} forbidden values out of {total} rows in column {self._column()}",
            [("countInSet", in_set), ("rowCount", total)],
            passed_rows=total - in_set,
            failed_rows=in_set,
        )


class ColumnValuesToMatchRegexValidator(Validator):
    definition_name = "columnValuesToMatchRegex"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        pattern = self._param("regex", required=True)
        assert pattern is not None
        match_sql = dq_sql.regex_match_sql(self.dialect, column, dq_sql.literal(pattern))
        values_count = self._count(f"SELECT COUNT({column}) FROM {table}")
        match_count = self._count(f"SELECT COUNT(*) FROM {table} WHERE {match_sql}")
        violations = values_count - match_count
        matched = row_within(violations, values_count, self._threshold())
        return self._result(
            self._status(matched),
            f"Found {violations} values not matching the regex out of "
            f"{values_count} non-null values in column {self._column()}",
            [("valuesCount", values_count), ("regexCount", match_count)],
            passed_rows=match_count,
            failed_rows=violations,
        )


class ColumnValuesToNotMatchRegexValidator(Validator):
    definition_name = "columnValuesToNotMatchRegex"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        pattern = self._param("forbiddenRegex", required=True)
        assert pattern is not None
        match_sql = dq_sql.regex_match_sql(self.dialect, column, dq_sql.literal(pattern))
        values_count = self._count(f"SELECT COUNT({column}) FROM {table}")
        match_count = self._count(f"SELECT COUNT(*) FROM {table} WHERE {match_sql}")
        matched = row_within(match_count, values_count, self._threshold())
        return self._result(
            self._status(matched),
            f"Found {match_count} values matching the forbidden regex out "
            f"of {values_count} non-null values in column {self._column()}",
            [("valuesCount", values_count), ("regexCount", match_count)],
            passed_rows=values_count - match_count,
            failed_rows=match_count,
        )


class ColumnValueLengthsToBeBetweenValidator(Validator):
    definition_name = "columnValueLengthsToBeBetween"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        length_expr = dq_sql.length_sql(self.dialect, column)
        min_bound, max_bound = widen_bounds(
            self._float_param("minLength"),
            self._float_param("maxLength"),
            self._threshold(),
        )
        observed_min = self._scalar_or_none(f"SELECT MIN({length_expr}) FROM {table}")
        observed_max = self._scalar_or_none(f"SELECT MAX({length_expr}) FROM {table}")
        matched = ColumnValuesToBeBetweenValidator._in_bounds(
            observed_min, observed_max, min_bound, max_bound
        )
        return self._result(
            self._status(matched),
            f"Column {self._column()} value lengths min {observed_min} max "
            f"{observed_max} against bounds [{min_bound}, {max_bound}]",
            [("minLength", observed_min), ("maxLength", observed_max)],
        )


class ColumnValuesMissingCountValidator(Validator):
    definition_name = "columnValuesMissingCount"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        column = self._column_sql()
        expected = self._int_param("missingCountValue", required=True)
        assert expected is not None
        match_value = self._param("missingValueMatch")
        predicate = self._missing_predicate(column)
        null_missing = self._count(f"SELECT COUNT(*) FROM {table} WHERE {predicate}")
        values: list[tuple[str, Any]] = [("nullMissingCount", null_missing)]
        total = null_missing
        if match_value is not None:
            in_set = self._count(
                f"SELECT COUNT(*) FROM {table} WHERE {column} = {dq_sql.literal(match_value)}"
            )
            values.append(("countInSet", in_set))
            total += in_set
        values.append(("total_missing_count", total))
        matched = within_tolerance(float(total), float(expected), self._threshold())
        return self._result(
            self._status(matched),
            f"Found {total} missing values in column {self._column()}, expected {expected}",
            values,
        )

    def _missing_predicate(self, column: str) -> str:
        # Official `NullMissingCount`: NULL + '' — but only when the column
        # type can hold '' (numeric/date/boolean/UUID/JSON/array types raise
        # or mis-count on the comparison).
        if can_hold_empty_string(self._column_data_type()):
            return f"{column} IS NULL OR {column} = ''"
        return f"{column} IS NULL"


# -- table validators -------------------------------------------------------


class TableRowCountToBeBetweenValidator(Validator):
    definition_name = "tableRowCountToBeBetween"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        total = self._count(f"SELECT COUNT(*) FROM {table}")
        min_bound, max_bound = widen_bounds(
            self._float_param("minValue"),
            self._float_param("maxValue"),
            self._threshold(),
        )
        matched = True
        if min_bound is not None:
            matched = matched and total >= min_bound
        if max_bound is not None:
            matched = matched and total <= max_bound
        return self._result(
            self._status(matched),
            f"Table {self.table.table.fqn} row count {total} against bounds "
            f"[{min_bound}, {max_bound}]",
            [("rowCount", total)],
        )


class TableRowCountToEqualValidator(Validator):
    definition_name = "tableRowCountToEqual"

    def run(self) -> TestCaseResultRecord:
        table = self._table_sql()
        expected = self._int_param("value", required=True)
        assert expected is not None
        total = self._count(f"SELECT COUNT(*) FROM {table}")
        matched = within_tolerance(float(total), float(expected), self._threshold())
        return self._result(
            self._status(matched),
            f"Table {self.table.table.fqn} row count {total}, expected {expected}",
            [("rowCount", total)],
        )


class TableColumnCountToBeBetweenValidator(Validator):
    definition_name = "tableColumnCountToBeBetween"

    def run(self) -> TestCaseResultRecord:
        count = self.table.column_count
        min_bound, max_bound = widen_bounds(
            self._float_param("minColValue"),
            self._float_param("maxColValue"),
            self._threshold(),
        )
        matched = True
        if min_bound is not None:
            matched = matched and count >= min_bound
        if max_bound is not None:
            matched = matched and count <= max_bound
        return self._result(
            self._status(matched),
            f"Table {self.table.table.fqn} column count {count} against "
            f"bounds [{min_bound}, {max_bound}]",
            [("columnCount", count)],
        )


class TableColumnCountToEqualValidator(Validator):
    definition_name = "tableColumnCountToEqual"

    def run(self) -> TestCaseResultRecord:
        expected = self._int_param("columnCount", required=True)
        assert expected is not None
        count = self.table.column_count
        matched = within_tolerance(float(count), float(expected), self._threshold())
        return self._result(
            self._status(matched),
            f"Table {self.table.table.fqn} column count {count}, expected {expected}",
            [("columnCount", count)],
        )


VALIDATORS: dict[str, type[Validator]] = {
    cls.definition_name: cls
    for cls in (
        ColumnValuesToBeNotNullValidator,
        ColumnValuesToBeUniqueValidator,
        ColumnValuesToBeBetweenValidator,
        ColumnValueMeanToBeBetweenValidator,
        ColumnValueMinToBeBetweenValidator,
        ColumnValueMaxToBeBetweenValidator,
        ColumnValueStdDevToBeBetweenValidator,
        ColumnValueMedianToBeBetweenValidator,
        ColumnValuesSumToBeBetweenValidator,
        ColumnValuesToBeInSetValidator,
        ColumnValuesToBeNotInSetValidator,
        ColumnValuesToMatchRegexValidator,
        ColumnValuesToNotMatchRegexValidator,
        ColumnValueLengthsToBeBetweenValidator,
        ColumnValuesMissingCountValidator,
        TableRowCountToBeBetweenValidator,
        TableRowCountToEqualValidator,
        TableColumnCountToBeBetweenValidator,
        TableColumnCountToEqualValidator,
    )
}
