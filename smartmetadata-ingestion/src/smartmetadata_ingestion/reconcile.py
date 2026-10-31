# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Stale-entity reconcile via Apache DELETE .../deleteStale."""

from __future__ import annotations

import logging
from typing import Any

from smartmetadata_ingestion.client.rest import (
    CHARTS_PATH,
    DASHBOARDS_PATH,
    CONTAINERS_PATH,
    DATABASES_PATH,
    SCHEMAS_PATH,
    TABLES_PATH,
    TOPICS_PATH,
    RestClient,
)
from smartmetadata_ingestion.topology import SeenSet

logger = logging.getLogger(__name__)

# child entity path -> (scopeEntityType for service-level reconcile)
_RECONCILE_TARGETS: list[tuple[str, str, str]] = [
    (TABLES_PATH, "table", "databaseService"),
    (SCHEMAS_PATH, "schema", "databaseService"),
    (DATABASES_PATH, "database", "databaseService"),
    (TOPICS_PATH, "topic", "messagingService"),
    (CHARTS_PATH, "chart", "dashboardService"),
    (DASHBOARDS_PATH, "dashboard", "dashboardService"),
    (CONTAINERS_PATH, "container", "storageService"),
]


def reconcile_stale(
    client: RestClient,
    *,
    scope_fqn: str,
    scope_entity_type: str,
    seen: SeenSet,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    """Soft-delete entities in scope that were not seen this run.

    Calls Apache BulkDeleteStale per child entity collection that had at least
    one seen FQN (or always for the matching service family). Soft-fails per call.
    """
    results: list[dict[str, Any]] = []
    for path, kind, expected_scope in _RECONCILE_TARGETS:
        if expected_scope != scope_entity_type:
            continue
        seen_fqns = seen.fqns(kind)
        # Always report the deleteStale call for the matching family so empty
        # runs can clear stale children when reconcile is enabled.
        try:
            payload = client.delete_stale(
                path,
                scope_fqn=scope_fqn,
                scope_entity_type=scope_entity_type,
                seen_fqns=seen_fqns,
                dry_run=dry_run,
                hard_delete=False,
                recursive=True,
            )
            results.append({"path": path, "kind": kind, "result": payload})
            logger.info(
                "reconcile deleteStale path=%s scope=%s seen=%s dryRun=%s",
                path,
                scope_fqn,
                len(seen_fqns),
                dry_run,
            )
        except Exception as exc:
            logger.warning(
                "reconcile deleteStale failed path=%s scope=%s: %s",
                path,
                scope_fqn,
                exc,
            )
            results.append({"path": path, "kind": kind, "error": str(exc)})
    return results
