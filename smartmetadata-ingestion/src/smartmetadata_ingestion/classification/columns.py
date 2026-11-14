# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Column adaptation and sample-field mapping (design §2.10).

Entities expose columns differently — Table ``columns``, Container
``dataModel.columns``, Topic ``messageSchema.schemaFields`` — and this
module adapts all three to one leaf-column walk. Leaves are classified;
struct columns recurse into children. When sample data has fields,
sampled-fields-authoritative applies: only columns mapped to a sample
field (exact dotted-path match) are classified, and unmapped columns
are skipped entirely, not even by name. Name-only classification
happens only when the sample has no fields at all.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

# Maximum column-nesting depth the leaf walk descends. A column at the
# cap is treated as a leaf (with a warning) rather than recursed
# further: deeply nested catalog shapes must terminate.
MAX_COLUMN_DEPTH = 10

# Entity type -> (columns root path, JSON-pointer root segments). The
# root segments locate the columns array inside a fetched entity for
# patch construction.
_ENTITY_COLUMNS: dict[str, tuple[list[str], list[str]]] = {
    "table": (["columns"], ["columns"]),
    "container": (["dataModel", "columns"], ["dataModel", "columns"]),
    "topic": (
        ["messageSchema", "schemaFields"],
        ["messageSchema", "schemaFields"],
    ),
}


@dataclass(frozen=True)
class LeafColumn:
    """One classifiable leaf column."""

    # Dotted path from the entity root (``address.city``).
    dotted_path: str
    # The column object from the fetched entity.
    column: dict[str, Any]
    # JSON-pointer segments locating the column in the entity
    # (``["columns", 0, "children", 1]``), for patch construction.
    pointer_segments: tuple[Any, ...]
    # Tags already applied to the column (their tag FQNs).
    existing_tag_fqns: tuple[str, ...] = ()


@dataclass(frozen=True)
class ColumnSampleMap:
    """Which leaf columns a sample maps to, and the sample's fields."""

    # dotted_path -> sample values for mapped columns.
    mapped: dict[str, list[Any]]
    # Sample field paths no column mapped to (warned, never analyzed).
    unmapped_fields: tuple[str, ...] = ()
    # Whether the sample had any fields at all.
    has_fields: bool = False


def iter_leaf_columns(entity: dict[str, Any], entity_type: str) -> list[LeafColumn]:
    """The leaf columns of an entity, in catalog order.

    The walk is cycle-safe (a column object visited twice is yielded
    once) and depth-capped: a column at the cap counts as a leaf.
    """
    root_keys, root_segments = _entity_columns(entity_type)
    node: Any = entity
    for key in root_keys:
        if not isinstance(node, dict):
            return []
        node = node.get(key)
    if not isinstance(node, list):
        return []
    leaves: list[LeafColumn] = []
    visited: set[int] = set()
    _walk_columns(
        node,
        prefix="",
        depth=0,
        segments=list(root_segments),
        visited=visited,
        leaves=leaves,
    )
    return leaves


def _walk_columns(
    columns: list[Any],
    *,
    prefix: str,
    depth: int,
    segments: list[Any],
    visited: set[int],
    leaves: list[LeafColumn],
) -> None:
    for index, column in enumerate(columns):
        if not isinstance(column, dict):
            continue
        if id(column) in visited:
            continue
        visited.add(id(column))
        name = str(column.get("name") or "")
        dotted = f"{prefix}.{name}" if prefix else name
        pointer = tuple([*segments, index])
        children = column.get("children")
        if isinstance(children, list) and children and depth < MAX_COLUMN_DEPTH:
            _walk_columns(
                children,
                prefix=dotted,
                depth=depth + 1,
                segments=[*segments, index, "children"],
                visited=visited,
                leaves=leaves,
            )
            continue
        if isinstance(children, list) and children:
            logger.warning(
                "column %r reaches the nesting cap (%d); treating it as a leaf",
                dotted,
                MAX_COLUMN_DEPTH,
            )
        leaves.append(
            LeafColumn(
                dotted_path=dotted,
                column=column,
                pointer_segments=pointer,
                existing_tag_fqns=tuple(
                    str(label.get("tagFQN"))
                    for label in column.get("tags") or []
                    if isinstance(label, dict) and label.get("tagFQN")
                ),
            )
        )


def _entity_columns(entity_type: str) -> tuple[list[str], list[str]]:
    try:
        return _ENTITY_COLUMNS[entity_type]
    except KeyError as exc:
        raise ValueError(f"unknown entity type {entity_type!r}") from exc


def map_sample_to_columns(rows: list[dict[str, Any]], leaves: list[LeafColumn]) -> ColumnSampleMap:
    """Map sample rows onto leaf columns by dotted path.

    The sample's field set is the union of flattened dotted paths
    across rows. A column maps when its dotted path is in the set;
    its values are extracted per row (exact full-name key preferred
    over the nested walk). Unmapped sample fields are reported for
    the caller's warning and their values never reach a recognizer.
    """
    field_paths: set[str] = set()
    for row in rows:
        field_paths.update(_flatten_row_paths(row))
    if not field_paths:
        return ColumnSampleMap(mapped={}, has_fields=False)
    by_path = {leaf.dotted_path: leaf for leaf in leaves}
    mapped: dict[str, list[Any]] = {}
    for path in sorted(field_paths):
        if path in by_path:
            mapped[path] = [
                value for row in rows if (value := _extract_dotted(row, path)) is not _MISSING
            ]
    unmapped = tuple(sorted(path for path in field_paths if path not in by_path))
    return ColumnSampleMap(mapped=mapped, unmapped_fields=unmapped, has_fields=True)


class _Missing:
    pass


_MISSING = _Missing()


def _extract_dotted(row: dict[str, Any], path: str) -> Any:
    """The value at a dotted path: an exact full-name key wins over
    walking the nested path, so a flat ``"address.city"`` key beats a
    nested ``{"address": {"city": ...}}`` when both exist."""
    if path in row:
        return row[path]
    node: Any = row
    for segment in path.split("."):
        if not isinstance(node, dict) or segment not in node:
            return _MISSING
        node = node[segment]
    return node


def _flatten_row_paths(row: dict[str, Any], prefix: str = "") -> set[str]:
    """The dotted field paths of one sample row.

    A non-empty nested dict contributes its children's paths, not its
    own: the parent key is a container, not a field, and warning
    about it as unmapped would be noise. An empty dict counts as a
    field path of its own (it exists but carries nothing). A flat
    dotted key stays a path of its own.
    """
    paths: set[str] = set()
    for key, value in row.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict) and value:
            paths.update(_flatten_row_paths(value, prefix=path))
        else:
            paths.add(path)
    return paths


def column_fqn(entity_fqn: str, dotted_path: str) -> str:
    """The fully qualified name of a column within its entity."""
    return f"{entity_fqn}.{dotted_path}"
