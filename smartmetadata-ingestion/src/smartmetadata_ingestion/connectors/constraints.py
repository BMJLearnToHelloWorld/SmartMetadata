# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared table-constraint shaping for database connectors.

Engines differ only in how they read ``information_schema`` constraint
views; grouping rows into ``TableConstraintRecord`` values and deriving
column constraints is the same everywhere, so it lives here once. A
reader without ``list_constraints`` yields no constraints and warns:
constraints are part of every table payload, so silent omission would
hide a missing capability on engines that cannot expose them. The
warning does not fail the run — nullability derivation still runs —
but the gap must be visible.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import ColumnRecord, TableConstraintRecord

logger = logging.getLogger(__name__)

# information_schema constraint types -> tableConstraint enum. CHECK and
# EXCLUDE have no enum value and are dropped: the schema cannot carry
# them, and inventing a mapping would misstate the table.
TableConstraintType = Literal[
    "UNIQUE", "PRIMARY_KEY", "FOREIGN_KEY", "SORT_KEY", "DIST_KEY", "CLUSTER_KEY"
]
KeyColumnConstraint = Literal["UNIQUE", "PRIMARY_KEY"]

CONSTRAINT_TYPE_MAP: dict[str, TableConstraintType] = {
    "PRIMARY KEY": "PRIMARY_KEY",
    "FOREIGN KEY": "FOREIGN_KEY",
    "UNIQUE": "UNIQUE",
}

ColumnConstraint = Literal["NULL", "NOT_NULL", "UNIQUE", "PRIMARY_KEY"]


@dataclass(frozen=True, slots=True)
class ConstraintRow:
    """One (constraint, column) pair as read from an engine catalog.

    ``referred_*`` describe the referenced side of a foreign key; they
    are ``None`` for other constraint types and for engines whose
    catalog cannot expose them.
    """

    database_name: str = ""
    schema_name: str = ""
    table_name: str = ""
    constraint_name: str = ""
    constraint_type: str = ""
    column_name: str = ""
    ordinal_position: int = 0
    referred_schema: str | None = None
    referred_table: str | None = None
    referred_column: str | None = None


def nullable_flag(value: Any) -> bool | None:
    """A catalog ``IS_NULLABLE`` value as a boolean, or ``None``.

    Only the standard ``YES``/``NO`` spellings map; anything else means
    the engine did not answer, and the column carries no nullability
    constraint rather than a guessed one.
    """
    if value == "YES":
        return True
    if value == "NO":
        return False
    return None


class SchemaConstraints:
    """The constraints of one schema, grouped for record shaping."""

    def __init__(
        self, rows: Sequence[ConstraintRow], *, service_name: str, database_name: str
    ) -> None:
        self._service_name = service_name
        self._database_name = database_name
        self._groups: dict[tuple[str, str], list[ConstraintRow]] = {}
        for row in rows:
            if row.constraint_type.upper() not in CONSTRAINT_TYPE_MAP:
                continue
            self._groups.setdefault((row.table_name, row.constraint_name), []).append(row)
        for group in self._groups.values():
            group.sort(key=lambda row: row.ordinal_position)
        self._column_kinds: dict[tuple[str, str], KeyColumnConstraint] = {}
        for (table_name, _), group in self._groups.items():
            kind = CONSTRAINT_TYPE_MAP[group[0].constraint_type.upper()]
            if kind == "PRIMARY_KEY":
                key_kind: KeyColumnConstraint = "PRIMARY_KEY"
            elif kind == "UNIQUE":
                key_kind = "UNIQUE"
            else:
                continue
            for row in group:
                key = (table_name, row.column_name)
                # A primary key outranks a unique constraint on the
                # same column: the column constraint carries one value.
                if key_kind == "PRIMARY_KEY" or key not in self._column_kinds:
                    self._column_kinds[key] = key_kind

    def for_table(self, table_name: str) -> list[TableConstraintRecord]:
        """The table's constraints, in catalog order."""
        records: list[TableConstraintRecord] = []
        for (table, _), group in self._groups.items():
            if table != table_name:
                continue
            records.append(self._record(group))
        return records

    def _record(self, group: list[ConstraintRow]) -> TableConstraintRecord:
        first = group[0]
        columns: list[str] = []
        for row in group:
            if row.column_name not in columns:
                columns.append(row.column_name)
        referred = self._referred_columns(group)
        return TableConstraintRecord(
            constraint_type=CONSTRAINT_TYPE_MAP[first.constraint_type.upper()],
            columns=columns,
            referred_columns=referred,
        )

    def _referred_columns(self, group: list[ConstraintRow]) -> list[str] | None:
        """Referred columns as column FQNs, or ``None`` when incomplete.

        The schema types referred columns as fully qualified names, and
        positions correspond to ``columns``: a partially known
        referenced side would misalign the pairing, so any gap drops
        the whole list rather than emitting a partial one.
        """
        fqns: list[str] = []
        for row in group:
            if not row.referred_table or not row.referred_column:
                return None
            fqns.append(
                build_fqn(
                    self._service_name,
                    self._database_name,
                    row.referred_schema or row.schema_name,
                    row.referred_table,
                    row.referred_column,
                )
            )
        return fqns or None

    def column_kind(
        self, table_name: str, column_name: str
    ) -> KeyColumnConstraint | None:
        """A column's key constraint (``PRIMARY_KEY``/``UNIQUE``), if any."""
        return self._column_kinds.get((table_name, column_name))

    def apply(self, table_name: str, columns: list[ColumnRecord]) -> None:
        """Overlay key constraints onto records built from nullability.

        ``_columns`` already set ``NOT_NULL`` from ``IS_NULLABLE``; a
        key constraint outranks it, and a column with no key keeps
        whatever nullability said.
        """
        for column in columns:
            kind = self.column_kind(table_name, column.name)
            if kind is not None:
                column.constraint = kind


def column_constraint_from_nullable(is_nullable: bool | None) -> ColumnConstraint | None:
    """A column's constraint from nullability alone.

    Only a definite ``NOT NULL`` yields a constraint; a nullable or
    unknown column carries none.
    """
    if is_nullable is False:
        return "NOT_NULL"
    return None


def schema_constraints_for_schema(
    reader: Any,
    *,
    service_name: str,
    database_name: str,
    schema_name: str,
) -> SchemaConstraints:
    """Constraints of one schema from a single-database reader.

    Readers are probed, not assumed: ``list_constraints`` is optional,
    and its absence means the engine exposes no constraints, not an
    error. The absence still warns — constraints are part of every
    table payload, so a silent empty grouping would hide the gap.
    Nullability derivation still runs through :meth:`apply`.
    """
    fetch = getattr(reader, "list_constraints", None)
    if not callable(fetch):
        logger.warning(
            "table constraints unavailable: reader %s exposes no "
            "list_constraints; schema %s yields no constraints",
            type(reader).__name__,
            build_fqn(service_name, database_name, schema_name),
        )
        rows: Sequence[ConstraintRow] = []
    else:
        rows = fetch(schema_name)
    return SchemaConstraints(rows, service_name=service_name, database_name=database_name)


def schema_constraints_for_database_schema(
    reader: Any,
    database_name: str,
    *,
    service_name: str,
    schema_name: str,
) -> SchemaConstraints:
    """Constraints of one schema from a multi-database reader.

    Warns on an absent ``list_constraints`` exactly as
    :func:`schema_constraints_for_schema` does.
    """
    fetch = getattr(reader, "list_constraints", None)
    if not callable(fetch):
        logger.warning(
            "table constraints unavailable: reader %s exposes no "
            "list_constraints; schema %s yields no constraints",
            type(reader).__name__,
            build_fqn(service_name, database_name, schema_name),
        )
        rows: Sequence[ConstraintRow] = []
    else:
        rows = fetch(database_name, schema_name)
    return SchemaConstraints(rows, service_name=service_name, database_name=database_name)
