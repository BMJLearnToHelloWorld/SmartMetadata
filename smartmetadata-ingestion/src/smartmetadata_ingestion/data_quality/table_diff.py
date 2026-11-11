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
columns, ``useColumns`` consumed as the extra-columns list or defaulted to
the union of both sides' non-key columns, per-side
``table1.extraColumns`` / ``table2.extraColumns`` overrides, ``where`` as
the where clause). Cross-service diffs resolve the table2 service's
connection from the server entity (never from pipeline config); the
table1 entity's ``tableProfilerConfig`` is carried raw for P2-2 sampling;
``caseSensitiveColumns`` is written to the spec; the schema diff is
computed from the two pulled table contexts (column differences fail the
verdict). The validator runs the compiled spec through the existing
Phase 1 key-set engine (``run_data_diff_spec``) while the P2-1 value
engine reads the same spec.

ADR:2026-11-08-validator-compile-table-diff-params
ADR:2026-11-11-table-diff-cross-service-connection-source
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import Any

from smartmetadata_ingestion.config import (
    DataDiffSideSpec,
    DataDiffSpec,
    SchemaDiff,
    SchemaDiffTable,
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
from smartmetadata_ingestion.datadiff import (
    column_types_comparable,
    datadiff_binding,
    run_data_diff_spec,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import TestCaseResultRecord

logger = logging.getLogger(__name__)

# Server ``DatabaseService.serviceType`` (lowercased) -> product ``source_type``
# (ruling §2.2). Any other type — Redshift, BigQuery, Athena, Oracle,
# SapHana, unknown — has no product data-diff binding and fails closed at
# compile time instead of silently running on the left connection.
SERVICE_TYPE_TO_SOURCE_TYPE: dict[str, str] = {
    "postgres": "postgres",
    "mysql": "mysql",
    "mssql": "mssql",
    "azuresql": "azuresql",
    "snowflake": "snowflake",
    "databricks": "databricks",
    "unitycatalog": "unitycatalog",
    "trino": "trino",
    "clickzetta": "clickzetta",
}

# Workflow dialect (lowercase) -> pin ``DatabaseServiceType`` display name,
# for the schema tables' ``serviceType`` (pin ``SchemaDiffResult``).
_SERVICE_TYPE_DISPLAY: dict[str, str] = {
    "postgres": "Postgres",
    "mysql": "Mysql",
    "mssql": "Mssql",
    "azuresql": "AzureSQL",
    "snowflake": "Snowflake",
    "databricks": "Databricks",
    "unitycatalog": "UnityCatalog",
    "trino": "Trino",
    "clickzetta": "ClickZetta",
}


def _norm_name(name: str, case_sensitive: bool) -> str:
    """A column name as a comparison key (lowercased when insensitive)."""
    return name if case_sensitive else name.lower()


def _matches(name: str, names: list[str], case_sensitive: bool) -> bool:
    """Whether ``name`` is in ``names`` under the case-sensitivity flag."""
    wanted = _norm_name(name, case_sensitive)
    return any(_norm_name(candidate, case_sensitive) == wanted for candidate in names)


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
    ``RestClient.get_table_by_name`` — it must accept a ``fields`` keyword,
    the setter requests ``fields="columns"`` explicitly);
    ``service_resolver`` fetches a database-service entity by name (the
    workflow's ``RestClient.get_database_service_by_name``) for
    cross-service diffs; ``source_connection`` is the workflow's configured
    source connection, used for the left side and for same-service right
    sides. ``dialect`` is the workflow's source type, used only for the
    table1 schema table's ``serviceType`` display name.
    """

    def __init__(
        self,
        *,
        table_resolver: Callable[..., dict[str, Any]],
        source_connection: dict[str, Any],
        service_resolver: Callable[[str], dict[str, Any]] | None = None,
        dialect: str | None = None,
    ) -> None:
        self._resolve_table = table_resolver
        self._source_connection = source_connection
        self._resolve_service = service_resolver
        self._dialect = dialect

    def compile(self, test_case: PulledTestCase, table: TableContext) -> DataDiffSpec:
        table2_fqn = test_case.param("table2")
        if not table2_fqn:
            raise WorkflowError(
                f"test case {test_case.fully_qualified_name!r} is a tableDiff "
                "case without the required 'table2' parameter"
            )
        table2_ref = TableRef.parse(table2_fqn)
        cross_service = table2_ref.service != table.table.service
        if cross_service:
            right_source_type, right_connection, right_service_type = (
                self._resolve_service_connection(test_case, table2_ref)
            )
        else:
            right_source_type = None
            right_connection = dict(self._source_connection)
            right_service_type = self._service_type_display(self._dialect)
        table2 = self._table2_context(table2_fqn)
        case_sensitive = self._bool_param(test_case, "caseSensitiveColumns")
        key_columns = self._key_columns(test_case, table, case_sensitive)
        table2_key_columns = (
            self._columns_param(test_case, "table2.keyColumns", table2, case_sensitive)
            or key_columns
        )
        left_extra, right_extra = self._extra_columns(
            test_case, table, table2, key_columns, table2_key_columns, case_sensitive
        )
        schema_diff = self._schema_diff(
            test_case,
            table,
            table2,
            key_columns,
            table2_key_columns,
            left_extra,
            right_extra,
            case_sensitive,
            self._service_type_display(self._dialect),
            right_service_type,
        )
        if schema_diff is not None:
            # Pin ``_run``: once a column diff exists, the compared extra
            # columns are the shared comparable set (common non-key columns
            # minus the incomparable ones), on both sides.
            common = self._common_columns(
                table,
                table2,
                key_columns,
                table2_key_columns,
                schema_diff.changed,
                case_sensitive,
            )
            left_extra = list(common)
            right_extra = list(common)
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
                extra_columns=list(left_extra),
                key_column_types=self._key_column_types(table, key_columns, case_sensitive),
                service=table.table.service,
            ),
            right=DataDiffSideSpec(
                database=table2_ref.database,
                schema=table2_ref.schema,
                table=table2_ref.table,
                key_columns=list(table2_key_columns),
                source_type=right_source_type,
                connection=right_connection,
                extra_columns=list(right_extra),
                key_column_types=self._key_column_types(table2, table2_key_columns, case_sensitive),
                service=table2_ref.service,
            ),
            threshold=threshold,
            where_clause=test_case.param("where"),
            table_profile_config=table.table_profiler_config,
            case_sensitive_columns=case_sensitive,
            schema_diff=schema_diff,
        )

    def _resolve_service_connection(
        self, test_case: PulledTestCase, table2_ref: TableRef
    ) -> tuple[str, dict[str, Any], str]:
        """Resolve the table2 service's connection from the server entity.

        The connection comes from the server's copy of the service entity
        and lives only in memory (setter -> side spec -> connector); it is
        never written into config JSON, a result record, or a log message.
        An unmapped service type, a missing connection, or an unresolvable
        service fails closed — never silently run on the left connection.
        """
        if self._resolve_service is None:
            raise WorkflowError(
                f"test case {test_case.fully_qualified_name!r} compares "
                f"tables of two services ({table2_ref.service!r} vs the "
                "workflow service); cross-service tableDiff needs a service "
                "resolver (RestClient.get_database_service_by_name)"
            )
        try:
            payload = self._resolve_service(table2_ref.service)
        except Exception as exc:
            raise WorkflowError(
                f"could not resolve tableDiff table2 service {table2_ref.service!r}: {exc}"
            ) from exc
        if not isinstance(payload, dict) or not payload.get("id"):
            raise WorkflowError(f"tableDiff table2 service {table2_ref.service!r} was not found")
        service_type = str(payload.get("serviceType") or "").strip().lower()
        source_type = SERVICE_TYPE_TO_SOURCE_TYPE.get(service_type)
        if source_type is None:
            raise WorkflowError(
                f"tableDiff case {test_case.fully_qualified_name!r} compares "
                f"against service {table2_ref.service!r} of type "
                f"{payload.get('serviceType')!r}, which has no data-diff "
                "binding; cross-service tableDiff fails closed"
            )
        connection = payload.get("connection") or {}
        config = connection.get("config") if isinstance(connection, dict) else None
        if not isinstance(config, dict) or not config:
            raise WorkflowError(
                f"tableDiff case {test_case.fully_qualified_name!r}: service "
                f"connection incomplete for service {table2_ref.service!r} "
                "(the server returned no connection config); cross-service "
                "tableDiff fails closed"
            )
        return source_type, dict(config), str(payload.get("serviceType") or "")

    @staticmethod
    def _service_type_display(dialect: str | None) -> str:
        """Pin ``DatabaseServiceType`` display name for a workflow dialect."""
        dialect = (dialect or "").strip().lower()
        return _SERVICE_TYPE_DISPLAY.get(dialect, dialect)

    def _extra_columns(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        table2: TableContext,
        key_columns: list[str],
        table2_key_columns: list[str],
        case_sensitive: bool,
    ) -> tuple[list[str], list[str]]:
        """The per-side extra-columns lists (pin ``get_extra_columns`` +
        ``get_table_extra_columns``): ``useColumns`` wins over the default
        union of both sides' non-key columns; a per-side
        ``table1.extraColumns`` / ``table2.extraColumns`` parameter
        overrides the shared list for that side. Names are canonicalized
        to the table's own column names."""
        use = self._columns_param(test_case, "useColumns", table, case_sensitive)
        shared = (
            use
            if use is not None
            else self._default_extra_columns(
                table, table2, key_columns, table2_key_columns, case_sensitive
            )
        )
        left = (
            self._columns_param(test_case, "table1.extraColumns", table, case_sensitive) or shared
        )
        right = (
            self._columns_param(test_case, "table2.extraColumns", table2, case_sensitive) or shared
        )
        # Key columns are compared as keys, never as extra columns — even
        # when the user names one in useColumns (pin's `_run` recomputation
        # excludes them from the compared set too).
        left = [name for name in left if not _matches(name, key_columns, case_sensitive)]
        right = [name for name in right if not _matches(name, table2_key_columns, case_sensitive)]
        return list(left), list(right)

    @staticmethod
    def _default_extra_columns(
        table: TableContext,
        table2: TableContext,
        key_columns: list[str],
        table2_key_columns: list[str],
        case_sensitive: bool,
    ) -> list[str]:
        """Both sides' non-key columns, each named once (pin ``get_extra_columns``
        unions the two column lists); the shared list carries the left
        table's spelling, the right side's own spelling is resolved by the
        engine's name matching."""
        seen: set[str] = set()
        extra: list[str] = []
        for column in table.columns:
            if _matches(column.name, key_columns, case_sensitive):
                continue
            extra.append(column.name)
            seen.add(_norm_name(column.name, case_sensitive))
        for column in table2.columns:
            if _matches(column.name, table2_key_columns, case_sensitive):
                continue
            if _norm_name(column.name, case_sensitive) in seen:
                continue
            extra.append(column.name)
            seen.add(_norm_name(column.name, case_sensitive))
        return extra

    def _schema_diff(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        table2: TableContext,
        key_columns: list[str],
        table2_key_columns: list[str],
        left_extra: list[str],
        right_extra: list[str],
        case_sensitive: bool,
        left_service_type: str,
        right_service_type: str,
    ) -> SchemaDiff | None:
        """Column differences from the two pulled contexts (pin
        ``get_column_diff`` / ``get_changed_added_columns`` /
        ``get_incomparable_columns``): ``removed`` / ``added`` are non-key
        columns present on one side only; ``changed`` are columns in the
        key + extra range, present on both sides, whose types are
        incomparable. ``None`` when there is no column difference."""
        removed = [
            column.name
            for column in table.columns
            if not _matches(column.name, key_columns, case_sensitive)
            and table2.column(column.name, case_sensitive=case_sensitive) is None
        ]
        added = [
            column.name
            for column in table2.columns
            if not _matches(column.name, table2_key_columns, case_sensitive)
            and table.column(column.name, case_sensitive=case_sensitive) is None
        ]
        changed: list[str] = []
        for name in [*key_columns, *left_extra]:
            left_column = table.column(name, case_sensitive=case_sensitive)
            right_column = table2.column(name, case_sensitive=case_sensitive)
            if left_column is None or right_column is None:
                continue
            if not column_types_comparable(left_column.data_type, right_column.data_type):
                if left_column.name not in changed:
                    changed.append(left_column.name)
        if not removed and not added and not changed:
            return None
        return SchemaDiff(
            removed=removed,
            added=added,
            changed=changed,
            schema_table_1=self._schema_table(table, left_service_type),
            schema_table_2=self._schema_table(table2, right_service_type),
        )

    @staticmethod
    def _schema_table(table: TableContext, service_type: str) -> SchemaDiffTable:
        return SchemaDiffTable(
            service_type=service_type,
            fully_qualified_table_name=table.table.fqn,
            schema={
                column.name: {
                    "type": column.data_type or "",
                    "constraints": column.constraint or "",
                }
                for column in table.columns
            },
        )

    @staticmethod
    def _common_columns(
        table: TableContext,
        table2: TableContext,
        key_columns: list[str],
        table2_key_columns: list[str],
        changed: list[str],
        case_sensitive: bool,
    ) -> list[str]:
        """Shared comparable non-key columns in left-table order (pin ``_run``:
        common columns minus changed minus both sides' key columns)."""
        common: list[str] = []
        for column in table.columns:
            if _matches(column.name, key_columns, case_sensitive):
                continue
            if _matches(column.name, changed, case_sensitive):
                continue
            if table2.column(column.name, case_sensitive=case_sensitive) is None:
                continue
            common.append(column.name)
        return common

    @staticmethod
    def _key_column_types(
        table: TableContext, key_columns: list[str], case_sensitive: bool
    ) -> dict[str, str]:
        types: dict[str, str] = {}
        for name in key_columns:
            column = table.column(name, case_sensitive=case_sensitive)
            if column is not None and column.data_type:
                types[column.name] = column.data_type
        return types

    def _table2_context(self, table2_fqn: str) -> TableContext:
        try:
            payload = self._resolve_table(table2_fqn, fields="columns")
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
        # Canonicalize to the table's own spellings: with case-insensitive
        # matching the user may write a different case than the column, and
        # the engine renders the real name into SQL.
        canonical: list[str] = []
        for column in columns:
            resolved = table.column(column, case_sensitive=case_sensitive)
            if resolved is None:  # unreachable: _validate_columns just passed
                raise WorkflowError(f"column {column!r} is not in table {table.table.fqn!r}")
            canonical.append(resolved.name)
        return canonical

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
    """Run a compiled tableDiff spec through the chunked row engine
    (key-set comparison when the spec carries no extra columns).

    An unbound dialect aborts the case instead of raising (ruling §6);
    ``parallelQueries`` is parsed and validated with the official warning,
    but execution stays single-threaded in this batch (R-W3H-5).
    """

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
        fetch_rows: (Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None) = None,
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
        self._fetch_rows = fetch_rows

    def run(self) -> TestCaseResultRecord:
        self._parse_parallel_queries()
        left_binding = datadiff_binding(self._spec.left.source_type or self.dialect)
        right_binding = datadiff_binding(self._spec.right.source_type or self.dialect)
        return run_data_diff_spec(
            self._spec,
            left_binding=left_binding,
            right_binding=right_binding,
            default_connection={},
            fetch_keys=self._fetch_keys,
            fetch_rows=self._fetch_rows,
            compute_counts=self.test_case.compute_passed_failed_row_count,
            left_source_type=self._spec.left.source_type or self.dialect,
            right_source_type=self._spec.right.source_type or self.dialect,
            timestamp=self.timestamp,
        )

    def _parse_parallel_queries(self) -> int:
        """``parallelQueries`` as an integer; a value below 1 or a
        non-integer falls back to 1 with the official warning."""
        value = self.test_case.param("parallelQueries")
        if value is None:
            return 1
        try:
            parallel_queries = float(value)
        except ValueError:
            parallel_queries = 0.0
        if parallel_queries < 1 or not parallel_queries.is_integer():
            logger.warning(
                "Ignoring parallelQueries=%r: it must be a whole number of at least 1. Using 1.",
                value,
            )
            return 1
        return int(parallel_queries)
