# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Column-tag patching and sample-data persistence (design §2.11).

Tags reach the catalog as JSON Patch appends onto a freshly fetched
entity, guarded by a weak ETag from the fetched version: a 412
refetches and retries, the same ETag rejected twice without the
version moving falls back to an unconditional write, and exhausted
retries warn instead of failing. Sample rows persist capped, through
the same sampleData endpoints the metadata sink uses. Other API
errors propagate to the caller, which records them as warnings.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import base64
import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from smartmetadata_ingestion.classification.columns import (
    column_fqn,
    iter_leaf_columns,
)
from smartmetadata_ingestion.client.rest import (
    CONTAINERS_PATH,
    TABLES_PATH,
    TOPICS_PATH,
)
from smartmetadata_ingestion.errors import RestError, WorkflowError

logger = logging.getLogger(__name__)

# Optimistic-lock retries: a 412 refetches the entity and rebuilds
# the patch against the new version, at most this many attempts.
MAX_OPTIMISTIC_LOCK_RETRIES = 3

# HTTP 412 Precondition Failed: the conditional PATCH's ETag did not
# match the server's version. Only this status refetches and retries;
# every other API error propagates.
HTTP_PRECONDITION_FAILED = 412

# Rows persisted per entity: classification may read more than the
# sample count, but storage keeps at most this many.
SAMPLE_DATA_MAX_STORED_COUNT = 50

# Entity type -> (collection path, patch-fetch fields, fetch method).
# The patch fetch requests the adapter's patch fields: the entity's
# tags plus the columns carrying them.
_ENTITY_PATCH: dict[str, tuple[str, str, str]] = {
    "table": (TABLES_PATH, "tags,columns", "get_table_by_name"),
    "container": (CONTAINERS_PATH, "tags,dataModel", "get_container_by_name"),
    "topic": (TOPICS_PATH, "tags,messageSchema", "get_topic_by_name"),
}

# Entity type -> sample-data ingest method for tabular samples.
_TABULAR_SAMPLE_INGEST: dict[str, str] = {
    "table": "ingest_table_sample_data",
    "container": "ingest_container_sample_data",
}


def patch_column_tags(
    client: Any,
    *,
    entity_type: str,
    entity_fqn: str,
    column_tags: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    """PATCH suggested labels onto an entity's columns.

    Returns the patched entity, or None when the retries exhaust or
    no column matched. Non-412 API errors propagate.
    """
    collection_path, fields, fetch_method = _entity_patch(entity_type)
    rejected_etags: set[str] = set()
    for _attempt in range(MAX_OPTIMISTIC_LOCK_RETRIES):
        fetch = getattr(client, fetch_method)
        entity = fetch(entity_fqn, fields=fields)
        operations = _build_patch_operations(entity, entity_type, column_tags)
        if not operations:
            logger.warning(
                "no patch operations for %s %r: none of the classified "
                "columns matched the fetched entity",
                entity_type,
                entity_fqn,
            )
            return None
        etag = _weak_etag(entity)
        headers = {"If-Match": etag} if etag is not None else None
        entity_id = entity.get("id")
        if not entity_id:
            raise WorkflowError(
                f"fetched {entity_type} {entity_fqn!r} has no id; cannot build the patch path"
            )
        path = f"{collection_path}/{entity_id}"
        try:
            return client.patch(path, json=operations, headers=headers)
        except RestError as exc:
            if exc.status_code != HTTP_PRECONDITION_FAILED:
                raise
            if etag is not None and etag in rejected_etags:
                # The same ETag was rejected twice without the version
                # moving: the precondition is stuck, so fall back to
                # an unconditional write rather than spin.
                logger.warning(
                    "ETag %s for %s %r rejected twice without the "
                    "version moving; retrying unconditionally",
                    etag,
                    entity_type,
                    entity_fqn,
                )
                return client.patch(path, json=operations)
            if etag is not None:
                rejected_etags.add(etag)
    logger.warning(
        "patch for %s %r exhausted %d optimistic-lock retries; the suggested tags were not applied",
        entity_type,
        entity_fqn,
        MAX_OPTIMISTIC_LOCK_RETRIES,
    )
    return None


def _entity_patch(entity_type: str) -> tuple[str, str, str]:
    try:
        return _ENTITY_PATCH[entity_type]
    except KeyError as exc:
        raise ValueError(f"unknown entity type {entity_type!r}") from exc


def _weak_etag(entity: dict[str, Any]) -> str | None:
    """The weak ETag for a fetched entity: ``W/"<version>"``.

    The version is projection-independent, which is what makes it a
    usable precondition across different ``fields`` fetches; the
    strong ETag hashes the serialized entity and would differ. This
    rendering is the cross-language contract the server documents.
    """
    version = entity.get("version")
    if version is None:
        return None
    return f'W/"{version}"'


def _build_patch_operations(
    entity: dict[str, Any],
    entity_type: str,
    column_tags: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """JSON Patch appends for the matched columns, in input order.

    Matching is case-insensitive on the column FQN. ADD appends each
    label with no dedupe; a column without a tags array gets one
    created by the first label. Unmatched columns are warned once.
    """
    entity_fqn = str(entity.get("fullyQualifiedName") or "")
    leaves = {
        column_fqn(entity_fqn, leaf.dotted_path).lower(): leaf
        for leaf in iter_leaf_columns(entity, entity_type)
    }
    operations: list[dict[str, Any]] = []
    unmatched: list[str] = []
    for target_fqn, labels in column_tags.items():
        if not labels:
            continue
        leaf = leaves.get(target_fqn.lower())
        if leaf is None:
            unmatched.append(target_fqn)
            continue
        pointer = "/" + "/".join(
            _escape_pointer_segment(segment) for segment in leaf.pointer_segments
        )
        tags = leaf.column.get("tags")
        first = 0
        if not isinstance(tags, list):
            operations.append(
                {
                    "op": "add",
                    "path": f"{pointer}/tags",
                    "value": [labels[0]],
                }
            )
            first = 1
        for label in labels[first:]:
            operations.append({"op": "add", "path": f"{pointer}/tags/-", "value": label})
    if unmatched:
        logger.warning(
            "columns not found on %s %r during patch: %s",
            entity_type,
            entity_fqn,
            ", ".join(sorted(unmatched)),
        )
    return operations


def _escape_pointer_segment(segment: Any) -> str:
    """One JSON Pointer path segment, escaped per RFC 6901."""
    return str(segment).replace("~", "~0").replace("/", "~1")


def store_tabular_sample_data(
    client: Any,
    *,
    entity_type: str,
    entity_id: str,
    field_names: list[str],
    rows: list[dict[str, Any]],
) -> Any:
    """Persist capped sample rows for a table or container.

    Rows convert to positional lists in field order, with values
    normalized to JSON-native forms. A failed ingest raises: the
    caller records it as a failed step entry.
    """
    try:
        method = _TABULAR_SAMPLE_INGEST[entity_type]
    except KeyError as exc:
        raise ValueError(f"tabular sample data cannot be stored for {entity_type!r}") from exc
    payload = {
        "columns": list(field_names),
        "rows": [
            [_normalize_sample_value(row.get(name)) for name in field_names]
            for row in rows[:SAMPLE_DATA_MAX_STORED_COUNT]
        ],
    }
    return getattr(client, method)(entity_id, payload)


def store_topic_sample_data(client: Any, *, entity_id: str, messages: list[str]) -> Any:
    """Persist capped sample messages for a topic."""
    return client.ingest_topic_sample_data(
        entity_id, {"messages": messages[:SAMPLE_DATA_MAX_STORED_COUNT]}
    )


def _normalize_sample_value(value: Any) -> Any:
    """One sample value as JSON-native storage data.

    Dates take ISO form, decimals become floats, binary becomes
    base64 text, and containers normalize recursively. Anything else
    unrecognized falls back to its string form rather than failing
    the ingest on an exotic driver type.
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        return base64.b64encode(bytes(value)).decode("ascii")
    if isinstance(value, dict):
        return {str(key): _normalize_sample_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_normalize_sample_value(item) for item in value]
    return str(value)
