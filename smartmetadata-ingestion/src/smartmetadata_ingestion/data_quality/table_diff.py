# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""tableDiff compile: pulled test case -> ``DataDiffSpec`` -> key-set run.

The compiled shape is the shared one: ``DataDiffSpec`` already mirrors
official ``TableDiffRuntimeParameters`` (two tables, key columns,
threshold, optional where clause), so the tableDiff validator receives
exactly the shape Wave 3 P2-3 reuses for the server-pulled tableDiff
compile — no second tableDiff parameter structure exists anywhere.

The setter mirrors official ``TableDiffParamsSetter`` (``table2`` required,
key columns from the parameter or the table's primary-key then unique
columns, ``useColumns`` validated against the table's columns — the key-set
engine does not consume extra columns yet, that is the P2-1 value
comparison's input — ``where`` as the where clause). The validator runs the
compiled spec through the existing
Phase 1 key-set engine (``run_data_diff_spec``); changed-row, schema-diff
and sampled fields stay unwritten until P2-1/P2-2.

ADR:2026-11-08-validator-compile-table-diff-params
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from smartmetadata_ingestion.config import (
    DataDiffSideSpec,
    DataDiffSpec,
)
from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableContext,
    TableRef,
)
from smartmetadata_ingestion.data_quality.validators import (
    ExecuteFn,
    Validator,
    parse_set_param,
)
from smartmetadata_ingestion.datadiff import datadiff_binding, run_data_diff_spec
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord


def _parse_columns(raw: str | None) -> list[str] | None:
    if raw is None:
        return None
    parsed = parse_set_param(raw, boolean_column=False)
    columns = [str(item).strip() for item in parsed]
    if any(not column for column in columns):
        raise WorkflowError(f"empty column name in set value {raw!r}")
    return columns


class TableDiffParamsSetter:
    """Compile a pulled ``tableDiff`` test case into a ``DataDiffSpec``.

    ``table_resolver`` fetches a table entity by FQN (the workflow's
    ``RestClient.get_table_by_name``); ``source_connection`` is the
    workflow's configured source connection, used for both sides — this
    batch supports same-service diffs only.
    """

    def __init__(
        self,
        *,
        table_resolver: Callable[[str], dict[str, Any]],
        source_connection: dict[str, Any],
    ) -> None:
        self._resolve_table = table_resolver
        self._source_connection = source_connection

    def compile(self, test_case: PulledTestCase, table: TableContext) -> DataDiffSpec:
        table2_fqn = test_case.param("table2")
        if not table2_fqn:
            raise WorkflowError(
                f"test case {test_case.fully_qualified_name!r} is a tableDiff "
                "case without the required 'table2' parameter"
            )
        table2_ref = TableRef.parse(table2_fqn)
        if table2_ref.service != table.table.service:
            raise WorkflowError(
                f"tableDiff case {test_case.fully_qualified_name!r} compares "
                f"tables of two services ({table.table.service!r} vs "
                f"{table2_ref.service!r}); cross-service tableDiff needs "
                "per-service connection resolution (Wave 3 P2-3)"
            )
        table2 = self._table2_context(table2_fqn)
        case_sensitive = self._bool_param(test_case, "caseSensitiveColumns")
        key_columns = self._key_columns(test_case, table, case_sensitive)
        table2_key_columns = (
            self._columns_param(test_case, "table2.keyColumns", table2, case_sensitive)
            or key_columns
        )
        # `useColumns` names real columns or the compile fails closed; the
        # key-set engine does not consume the extra-columns list yet (it is
        # the P2-1 value comparison's input), so no default list is built
        # here — inventing one would pretend the engine compares values.
        self._validate_use_columns(test_case, table, case_sensitive)
        threshold = self._threshold(test_case)
        return DataDiffSpec(
            test_case_fqn=test_case.fully_qualified_name,
            left=DataDiffSideSpec(
                database=table.table.database,
                schema=table.table.schema,
                table=table.table.table,
                key_columns=list(key_columns),
                source_type=None,
                connection=dict(self._source_connection),
            ),
            right=DataDiffSideSpec(
                database=table2_ref.database,
                schema=table2_ref.schema,
                table=table2_ref.table,
                key_columns=list(table2_key_columns),
                source_type=None,
                connection=dict(self._source_connection),
            ),
            threshold=threshold,
            where_clause=test_case.param("where"),
        )

    def _table2_context(self, table2_fqn: str) -> TableContext:
        try:
            payload = self._resolve_table(table2_fqn)
        except Exception as exc:
            raise WorkflowError(
                f"could not resolve tableDiff table2 {table2_fqn!r}: {exc}"
            ) from exc
        if not isinstance(payload, dict) or not payload.get("id"):
            raise WorkflowError(f"tableDiff table2 {table2_fqn!r} was not found")
        return TableContext.from_table_entity(payload, fqn=table2_fqn)

    @staticmethod
    def _bool_param(test_case: PulledTestCase, name: str) -> bool:
        raw = test_case.param(name)
        if raw is None:
            return False
        lowered = raw.strip().lower()
        if lowered in {"true", "false"}:
            return lowered == "true"
        raise WorkflowError(
            f"test case {test_case.fully_qualified_name!r} has a non-boolean "
            f"parameter {name}={raw!r}"
        )

    def _columns_param(
        self,
        test_case: PulledTestCase,
        name: str,
        table: TableContext,
        case_sensitive: bool,
    ) -> list[str] | None:
        raw = test_case.param(name)
        columns = _parse_columns(raw)
        if not columns:
            return None
        self._validate_columns(columns, table, case_sensitive)
        return columns

    def _key_columns(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        case_sensitive: bool,
    ) -> list[str]:
        columns = self._columns_param(test_case, "keyColumns", table, case_sensitive)
        if columns:
            return columns
        for constraint in ("PRIMARY_KEY", "UNIQUE"):
            resolved = [
                column.name
                for column in table.columns
                if (column.constraint or "").upper() == constraint
            ]
            if resolved:
                return resolved
        raise WorkflowError(
            "could not resolve key columns for tableDiff case "
            f"{test_case.fully_qualified_name!r}: no 'keyColumns' parameter "
            "and the table has neither primary-key nor unique columns; "
            "specify 'keyColumns' explicitly"
        )

    def _validate_use_columns(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        case_sensitive: bool,
    ) -> None:
        # Validates only: the key-set engine does not consume extra columns.
        self._columns_param(test_case, "useColumns", table, case_sensitive)

    @staticmethod
    def _validate_columns(columns: list[str], table: TableContext, case_sensitive: bool) -> None:
        for column in columns:
            if not table.has_column(column, case_sensitive=case_sensitive):
                raise WorkflowError(
                    f"column {column!r} is not in table {table.table.fqn!r} for tableDiff"
                )

    @staticmethod
    def _threshold(test_case: PulledTestCase) -> int:
        raw = test_case.param("threshold")
        if raw is None:
            return 0
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise WorkflowError(
                f"test case {test_case.fully_qualified_name!r} has a non-numeric threshold {raw!r}"
            ) from exc
        if not value.is_integer() or value < 0:
            raise WorkflowError(
                f"test case {test_case.fully_qualified_name!r} has an invalid "
                f"tableDiff threshold {raw!r}"
            )
        return int(value)


class TableDiffValidator(Validator):
    """Run a compiled tableDiff spec through the key-set engine."""

    definition_name = "tableDiff"

    def __init__(
        self,
        *,
        test_case: PulledTestCase,
        table: TableContext,
        dialect: str,
        execute: ExecuteFn,
        timestamp: int,
        spec: DataDiffSpec,
        fetch_keys: (Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None) = None,
    ) -> None:
        super().__init__(
            test_case=test_case,
            table=table,
            dialect=dialect,
            execute=execute,
            timestamp=timestamp,
        )
        self._spec = spec
        self._fetch_keys = fetch_keys

    def run(self) -> TestCaseResultRecord:
        left_binding = datadiff_binding(self._spec.left.source_type or self.dialect)
        right_binding = datadiff_binding(self._spec.right.source_type or self.dialect)
        if left_binding is None:
            raise WorkflowError(
                f"tableDiff case {self.test_case.fully_qualified_name!r} has "
                f"no data-diff binding for dialect {self.dialect!r}"
            )
        if right_binding is None:
            raise WorkflowError(
                f"tableDiff case {self.test_case.fully_qualified_name!r} has "
                "no data-diff binding for the table2 dialect"
            )
        return run_data_diff_spec(
            self._spec,
            left_binding=left_binding,
            right_binding=right_binding,
            default_connection={},
            fetch_keys=self._fetch_keys,
            timestamp=self.timestamp,
        )
