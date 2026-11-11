# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Validator builder (official ``ValidatorBuilder`` equivalent).

Resolves a pulled test case's definition name through the validator
registry and returns a runnable validator. The tableDiff definition is
compiled first through ``TableDiffParamsSetter`` into the shared
``DataDiffSpec`` shape. An unknown definition fails closed with a
``WorkflowError`` naming the definition — the workflow turns it into a
per-case ``Aborted`` result, never a silent skip.

ADR:2026-11-08-test-suite-server-pull
ADR:2026-11-08-validator-compile-table-diff-params
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableContext,
)
from smartmetadata_ingestion.data_quality.table_diff import (
    TableDiffParamsSetter,
    TableDiffValidator,
)
from smartmetadata_ingestion.data_quality.validators import (
    KNOWN_NEXT_BATCH,
    KNOWN_RULE_LIBRARY,
    VALIDATORS,
    ExecuteFn,
    Validator,
)
from smartmetadata_ingestion.errors import WorkflowError


class ValidatorBuilder:
    """Build one validator per pulled test case."""

    def __init__(
        self,
        *,
        dialect: str,
        execute: ExecuteFn,
        table_resolver: Callable[[str], dict[str, Any]] | None = None,
        source_connection: dict[str, Any] | None = None,
        fetch_keys: (Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None) = None,
        fetch_rows: (Callable[[dict[str, Any]], Iterable[tuple[Any, ...]]] | None) = None,
        service_resolver: Callable[[str], dict[str, Any]] | None = None,
    ) -> None:
        self.dialect = dialect
        self._execute = execute
        self._table_resolver = table_resolver
        self._source_connection = source_connection or {}
        self._fetch_keys = fetch_keys
        self._fetch_rows = fetch_rows
        self._service_resolver = service_resolver

    def build(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        *,
        timestamp: int,
    ) -> Validator:
        name = test_case.test_definition_name
        if name == TableDiffValidator.definition_name:
            return self._build_table_diff(test_case, table, timestamp)
        validator_cls = VALIDATORS.get(name)
        if validator_cls is None:
            raise WorkflowError(
                f"test definition {name!r} has no validator in this batch "
                f"(test case {test_case.fully_qualified_name!r}); "
                + (
                    "it is scheduled for the next validator batch"
                    if name in KNOWN_NEXT_BATCH or name in KNOWN_RULE_LIBRARY
                    else "it is not a known test definition"
                )
            )
        return validator_cls(
            test_case=test_case,
            table=table,
            dialect=self.dialect,
            execute=self._execute,
            timestamp=timestamp,
        )

    def _build_table_diff(
        self,
        test_case: PulledTestCase,
        table: TableContext,
        timestamp: int,
    ) -> TableDiffValidator:
        if self._table_resolver is None:
            raise WorkflowError(
                "tableDiff cases need a table resolver (the workflow's "
                "RestClient.get_table_by_name)"
            )
        setter = TableDiffParamsSetter(
            table_resolver=self._table_resolver,
            source_connection=self._source_connection,
            service_resolver=self._service_resolver,
            dialect=self.dialect,
        )
        spec = setter.compile(test_case, table)
        return TableDiffValidator(
            test_case=test_case,
            table=table,
            dialect=self.dialect,
            execute=self._execute,
            timestamp=timestamp,
            spec=spec,
            fetch_keys=self._fetch_keys,
            fetch_rows=self._fetch_rows,
        )
