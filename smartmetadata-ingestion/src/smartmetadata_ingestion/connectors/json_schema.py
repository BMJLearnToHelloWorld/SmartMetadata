# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""JSON-schema inference for JSON-typed columns (``extractJsonSchema``).

Sampled values are merged into child columns: object keys observed
across samples become children, key order is name-sorted before the
per-level cap applies, and nesting stops at the configured depth.
Limits follow ``schemaInferenceLimits.json``: direct children are
depth 1, a depth cap of 0 infers nothing, a children cap of 0 keeps
nothing, and an absent cap means no limit. A reader exposes
``sample_column_values`` when its engine can sample; engines without
one fail the run loudly when extraction is requested.
"""

from __future__ import annotations

import json
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ColumnRecord

# JSON value kinds, in merge order: ints widen to DOUBLE when mixed
# with floats, and any other mixture widens to JSON (the honest
# supertype for a polymorphic key).
_KIND_TO_TYPE = {
    "boolean": "BOOLEAN",
    "integer": "BIGINT",
    "number": "DOUBLE",
    "string": "VARCHAR",
    "object": "STRUCT",
    "array": "ARRAY",
}


def quote_double_ident(name: str) -> str:
    """A double-quoted identifier for sampled reads."""
    return '"' + name.replace('"', '""') + '"'


def _kind(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, (list, tuple)):
        return "array"
    return None


def _parse(value: Any) -> Any:
    """A sampled value as parsed JSON, or ``None`` when unparseable.

    Drivers disagree on representation (dicts from psycopg, strings
    from pymysql); unparseable text contributes nothing rather than
    failing the run over one bad sample.
    """
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    if isinstance(value, (dict, list, tuple, bool, int, float)) or value is None:
        return value
    return None


def _merge_kinds(kinds: set[str]) -> str:
    if not kinds:
        # Observed only as null: the key is real, its type unknown.
        return "json"
    if kinds == {"integer"}:
        return "integer"
    if kinds <= {"integer", "number"}:
        return "number"
    if len(kinds) == 1:
        return next(iter(kinds))
    return "json"


def _object_children(
    objects: list[dict[str, Any]], *, depth: int, depth_cap: int | None, children_cap: int | None
) -> list[ColumnRecord]:
    """Merged children for one object level, name-sorted and capped."""
    if depth_cap is not None and depth > depth_cap:
        return []
    observed: dict[str, list[Any]] = {}
    for obj in objects:
        for key, value in obj.items():
            observed.setdefault(key, []).append(value)
    names = sorted(observed)
    if children_cap is not None:
        names = names[:children_cap]
    children: list[ColumnRecord] = []
    for position, name in enumerate(names, start=1):
        children.append(
            _child_record(
                name,
                observed[name],
                ordinal_position=position,
                depth=depth,
                depth_cap=depth_cap,
                children_cap=children_cap,
            )
        )
    return children


def _array_info(
    arrays: list[list[Any]],
    *,
    depth: int,
    depth_cap: int | None,
    children_cap: int | None,
) -> tuple[str | None, list[ColumnRecord] | None]:
    """An array child's element type and (for object elements) children."""
    elements = [item for array in arrays for item in array]
    kinds = {_kind(item) for item in elements}
    kinds.discard(None)
    merged = _merge_kinds(kinds)
    if merged == "object":
        objects = [item for item in elements if isinstance(item, dict)]
        return "STRUCT", _object_children(
            objects, depth=depth + 1, depth_cap=depth_cap, children_cap=children_cap
        )
    if merged == "json":
        return "JSON", None
    return _KIND_TO_TYPE[merged], None


def _child_record(
    name: str,
    values: list[Any],
    *,
    ordinal_position: int,
    depth: int,
    depth_cap: int | None,
    children_cap: int | None,
) -> ColumnRecord:
    # Values arrive already parsed (top-level samples are parsed once
    # in infer_json_children): re-parsing here would discard every
    # plain string whose text is not itself a JSON document.
    kinds = {_kind(value) for value in values}
    kinds.discard(None)
    merged = _merge_kinds(kinds)
    if merged == "object":
        objects = [value for value in values if isinstance(value, dict)]
        return ColumnRecord(
            name=name,
            data_type="STRUCT",
            ordinal_position=ordinal_position,
            children=_object_children(
                objects, depth=depth + 1, depth_cap=depth_cap, children_cap=children_cap
            ),
        )
    if merged == "array":
        arrays = [list(value) for value in values if isinstance(value, (list, tuple))]
        element_type, children = _array_info(
            arrays, depth=depth, depth_cap=depth_cap, children_cap=children_cap
        )
        return ColumnRecord(
            name=name,
            data_type="ARRAY",
            ordinal_position=ordinal_position,
            array_data_type=element_type,
            children=children,
        )
    if merged == "json":
        return ColumnRecord(name=name, data_type="JSON", ordinal_position=ordinal_position)
    return ColumnRecord(
        name=name,
        data_type=_KIND_TO_TYPE[merged],
        ordinal_position=ordinal_position,
    )


def infer_json_children(
    values: list[Any], *, depth_cap: int | None, children_cap: int | None
) -> list[ColumnRecord]:
    """Child columns inferred from sampled JSON values.

    Only objects (and objects inside arrays) contribute children; a
    column whose samples hold no objects infers none.
    """
    if depth_cap is not None and depth_cap <= 0:
        return []
    if children_cap is not None and children_cap <= 0:
        return []
    objects: list[dict[str, Any]] = []
    for value in values:
        parsed = _parse(value)
        if isinstance(parsed, dict):
            objects.append(parsed)
        elif isinstance(parsed, (list, tuple)):
            objects.extend(item for item in parsed if isinstance(item, dict))
    if not objects:
        return []
    return _object_children(
        objects, depth=1, depth_cap=depth_cap, children_cap=children_cap
    )


def require_json_sampling_support(
    reader: Any, engine_label: str, *, enabled: bool
) -> None:
    """Fail fast when JSON extraction was requested from an engine
    without a sampler."""
    if enabled and not callable(getattr(reader, "sample_column_values", None)):
        raise WorkflowError(
            f"{engine_label} does not support JSON-schema sampling: "
            "disable extractJsonSchema or use an engine with sampling support"
        )


def _attach(
    columns: list[ColumnRecord],
    fetch: Any,
    *,
    engine_label: str,
    config: SourceConfig,
) -> None:
    if not config.extract_json_schema:
        return
    if not callable(fetch):
        raise WorkflowError(
            f"{engine_label} does not support JSON-schema sampling: "
            "disable extractJsonSchema or use an engine with sampling support"
        )
    for column in columns:
        if column.data_type != "JSON" or column.children:
            continue
        values = fetch(column.name, config.json_schema_sample_size)
        column.children = infer_json_children(
            values,
            depth_cap=config.max_schema_inference_depth,
            children_cap=config.max_children_per_column,
        )


def attach_json_schemas_for_schema(
    reader: Any,
    engine_label: str,
    schema_name: str,
    table_name: str,
    columns: list[ColumnRecord],
    config: SourceConfig,
) -> None:
    """Infer children for JSON columns via a single-database reader."""
    fetch = getattr(reader, "sample_column_values", None)

    def _fetch(column_name: str, limit: int) -> list[Any]:
        return fetch(schema_name, table_name, column_name, limit)

    _attach(columns, _fetch if callable(fetch) else None, engine_label=engine_label, config=config)


def attach_json_schemas_for_database_schema(
    reader: Any,
    engine_label: str,
    database_name: str,
    schema_name: str,
    table_name: str,
    columns: list[ColumnRecord],
    config: SourceConfig,
) -> None:
    """Infer children for JSON columns via a multi-database reader."""
    fetch = getattr(reader, "sample_column_values", None)

    def _fetch(column_name: str, limit: int) -> list[Any]:
        return fetch(database_name, schema_name, table_name, column_name, limit)

    _attach(columns, _fetch if callable(fetch) else None, engine_label=engine_label, config=config)
