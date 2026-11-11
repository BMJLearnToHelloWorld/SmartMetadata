# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Pulled server entities for the server-pulled TestSuite path.

Mirrors the shapes the official ``TestSuiteSource`` reads (TestSuite →
TestCases with ``testSuite`` / ``entityLink`` / ``testDefinition`` fields,
plus the Table entity for column and key information), as plain
dataclasses parsed defensively from server JSON.

ADR:2026-11-08-test-suite-server-pull
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from smartmetadata_ingestion.errors import WorkflowError


def split_fqn(fqn: str) -> list[str]:
    """Split a catalog FQN on dots outside double quotes.

    Mirrors the official FQN split for the table references this layer
    handles (``service.database.schema.table``): a part containing a dot
    arrives double-quoted and keeps its dot.
    """
    parts: list[str] = []
    current: list[str] = []
    quoted = False
    for char in fqn:
        if char == '"':
            quoted = not quoted
            continue
        if char == "." and not quoted:
            parts.append("".join(current))
            current = []
            continue
        current.append(char)
    if quoted:
        raise WorkflowError(f"unbalanced quotes in fqn {fqn!r}")
    parts.append("".join(current))
    if any(not part for part in parts):
        raise WorkflowError(f"empty segment in fqn {fqn!r}")
    return parts


@dataclass(frozen=True)
class TableRef:
    """A table address parsed from a fully qualified name."""

    service: str
    database: str
    schema: str
    table: str

    @property
    def fqn(self) -> str:
        return f"{self.service}.{self.database}.{self.schema}.{self.table}"

    @classmethod
    def parse(cls, fqn: str) -> TableRef:
        parts = split_fqn(fqn)
        if len(parts) != 4:
            raise WorkflowError(
                f"table fqn {fqn!r} must have four segments (service.database.schema.table)"
            )
        return cls(service=parts[0], database=parts[1], schema=parts[2], table=parts[3])


@dataclass(frozen=True)
class TableColumnInfo:
    """One column of a pulled table entity (name, type, constraint)."""

    name: str
    data_type: str | None = None
    constraint: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> TableColumnInfo:
        name = payload.get("name")
        if not isinstance(name, str) or not name:
            raise WorkflowError(f"table column without a name: {payload!r}")
        data_type = payload.get("dataType")
        constraint = payload.get("constraint")
        return cls(
            name=name,
            data_type=data_type if isinstance(data_type, str) else None,
            constraint=constraint if isinstance(constraint, str) else None,
        )


@dataclass(frozen=True)
class TableContext:
    """The table a pulled test case runs against, with its columns.

    ``table_profiler_config`` is the entity's ``tableProfilerConfig`` carried
    as raw JSON (only its ``profileSampleConfig`` face is consumed, by P2-2
    sampling); a non-dict value (or an old entity without the field) reads
    as ``None``, never an error.
    """

    table: TableRef
    columns: tuple[TableColumnInfo, ...] = ()
    service_name: str = ""
    table_profiler_config: dict[str, Any] | None = None

    @property
    def column_count(self) -> int:
        return len(self.columns)

    def column(self, name: str, *, case_sensitive: bool = True) -> TableColumnInfo | None:
        for candidate in self.columns:
            if case_sensitive:
                if candidate.name == name:
                    return candidate
            elif candidate.name.lower() == name.lower():
                return candidate
        return None

    def has_column(self, name: str, *, case_sensitive: bool = True) -> bool:
        return self.column(name, case_sensitive=case_sensitive) is not None

    @classmethod
    def from_table_entity(cls, payload: dict[str, Any], *, fqn: str) -> TableContext:
        columns = tuple(
            TableColumnInfo.from_dict(item)
            for item in payload.get("columns") or []
            if isinstance(item, dict)
        )
        service = payload.get("service") or {}
        service_name = (service.get("name") if isinstance(service, dict) else None) or ""
        profiler_config = payload.get("tableProfilerConfig")
        return cls(
            table=TableRef.parse(fqn),
            columns=columns,
            service_name=service_name,
            table_profiler_config=(
                profiler_config if isinstance(profiler_config, dict) else None
            ),
        )


@dataclass(frozen=True)
class TestCaseParameter:
    """One ``{name, value}`` entry of a test case's ``parameterValues``."""

    __test__ = False

    name: str
    value: str


@dataclass(frozen=True)
class PulledTestCase:
    """A test case pulled from the server, ready to compile.

    ``test_definition_name`` is the definition's name (the last segment of
    its fully qualified name), which is what the validator registry keys
    on. ``entity_link`` is the official entity link
    (``<#E::table::<fqn>::columns::<column>>`` for column cases,
    ``<#E::table::<fqn>>`` for table cases).
    """

    name: str
    fully_qualified_name: str
    entity_link: str
    test_definition_name: str
    test_definition_fqn: str
    parameter_values: tuple[TestCaseParameter, ...] = field(default_factory=tuple)
    test_suite_id: str | None = None
    compute_passed_failed_row_count: bool = True

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> PulledTestCase:
        name = payload.get("name")
        fqn = payload.get("fullyQualifiedName")
        entity_link = payload.get("entityLink")
        if not isinstance(name, str) or not name:
            raise WorkflowError(f"test case without a name: {payload!r}")
        if not isinstance(fqn, str) or not fqn:
            raise WorkflowError(f"test case {name!r} without a fullyQualifiedName")
        if not isinstance(entity_link, str) or not entity_link:
            raise WorkflowError(f"test case {fqn!r} without an entityLink")
        definition = payload.get("testDefinition") or {}
        definition_fqn = (
            definition.get("fullyQualifiedName") if isinstance(definition, dict) else None
        )
        if not isinstance(definition_fqn, str) or not definition_fqn:
            raise WorkflowError(f"test case {fqn!r} without a testDefinition reference")
        parameters: list[TestCaseParameter] = []
        for item in payload.get("parameterValues") or []:
            if not isinstance(item, dict):
                continue
            param_name = item.get("name")
            param_value = item.get("value")
            if isinstance(param_name, str) and param_name:
                parameters.append(
                    TestCaseParameter(
                        name=param_name,
                        value="" if param_value is None else str(param_value),
                    )
                )
        suite = payload.get("testSuite") or {}
        suite_id = suite.get("id") if isinstance(suite, dict) else None
        compute_counts = payload.get("computePassedFailedRowCount")
        return cls(
            name=name,
            fully_qualified_name=fqn,
            entity_link=entity_link,
            test_definition_name=definition_fqn.split(".")[-1],
            test_definition_fqn=definition_fqn,
            parameter_values=tuple(parameters),
            test_suite_id=suite_id if isinstance(suite_id, str) else None,
            compute_passed_failed_row_count=(
                True if compute_counts is None else bool(compute_counts)
            ),
        )

    def param(self, name: str, default: str | None = None) -> str | None:
        for parameter in self.parameter_values:
            if parameter.name == name:
                return parameter.value
        return default

    def table_ref(self) -> TableRef:
        return TableRef.parse(self.table_fqn())

    def table_fqn(self) -> str:
        segments = self._entity_link_segments()
        if len(segments) < 2 or segments[0] != "table":
            raise WorkflowError(
                f"test case {self.fully_qualified_name!r} has an unsupported "
                f"entityLink {self.entity_link!r}"
            )
        return segments[1]

    def column_name(self) -> str | None:
        segments = self._entity_link_segments()
        if len(segments) >= 4 and segments[2] == "columns":
            return segments[3]
        return None

    def _entity_link_segments(self) -> list[str]:
        link = self.entity_link.strip()
        if link.startswith("<#E::"):
            link = link[len("<#E::") :]
        if link.endswith(">"):
            link = link[:-1]
        return link.split("::")
