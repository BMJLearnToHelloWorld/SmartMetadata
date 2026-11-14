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
from collections.abc import Collection
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.client.rest import (
    CHARTS_PATH,
    CONTAINERS_PATH,
    DASHBOARDS_PATH,
    DATABASES_PATH,
    PIPELINES_PATH,
    SCHEMAS_PATH,
    STORED_PROCEDURES_PATH,
    TABLES_PATH,
    TOPICS_PATH,
    RestClient,
)
from smartmetadata_ingestion.errors import WorkflowExecutionError
from smartmetadata_ingestion.topology import SeenSet

logger = logging.getLogger(__name__)

# Source type -> service family. The usage/lineage suffixed source types
# strip to their base type: reconcile only ever runs for metadata
# workflows, but a YAML config may pair reconcileStale with any type.
_MESSAGING_SOURCE_TYPES = frozenset({"kafka", "redpanda"})
_DASHBOARD_SOURCE_TYPES = frozenset({"superset", "metabase"})
_STORAGE_SOURCE_TYPES = frozenset({"s3"})
_PIPELINE_SOURCE_TYPES = frozenset({"prefect", "dagster"})

_SUFFIXES = ("-usage", "-lineage")


def _base_source_type(source_type: str) -> str:
    """The connector type without a usage/lineage suffix, normalized."""
    base = str(source_type or "").strip().lower()
    for suffix in _SUFFIXES:
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base


def service_family_for_source_type(source_type: str) -> str:
    """The reconcile scope entity type for a source type.

    Database is the default family: every database connector, the
    static fixture, and any future database type reconcile as a
    databaseService scope.
    """
    base = _base_source_type(source_type)
    if base in _MESSAGING_SOURCE_TYPES:
        return "messagingService"
    if base in _DASHBOARD_SOURCE_TYPES:
        return "dashboardService"
    if base in _STORAGE_SOURCE_TYPES:
        return "storageService"
    if base in _PIPELINE_SOURCE_TYPES:
        return "pipelineService"
    return "databaseService"


# Hierarchy level -> (include-list attribute, exclude-list attribute) on
# SourceConfig. A kind's level name is its kind name; ancestor levels
# narrow the kind exactly as its own patterns do, because the server's
# deleteStale deletes every entity under the service scope not in the
# seen set (EntityRepository.bulkDeleteStaleEntities): a run that
# listed one database must never reconcile tables service-wide.
_LEVEL_PATTERNS: dict[str, tuple[str, str]] = {
    "table": ("include_tables", "exclude_tables"),
    "schema": ("include_schemas", "exclude_schemas"),
    "database": ("include_databases", "exclude_databases"),
    "storedProcedure": ("include_stored_procedures", "exclude_stored_procedures"),
    "topic": ("include_topics", "exclude_topics"),
    "chart": ("include_charts", "exclude_charts"),
    "dashboard": ("include_dashboards", "exclude_dashboards"),
    "container": ("include_containers", "exclude_containers"),
    "pipeline": ("include_pipelines", "exclude_pipelines"),
}

# Kind -> ancestor levels whose narrowing also narrows the kind. Flat
# kinds (topic, chart, ...) have no ancestors in this hierarchy.
_KIND_ANCESTORS: dict[str, tuple[str, ...]] = {
    "table": ("database", "schema"),
    "storedProcedure": ("database", "schema"),
    "schema": ("database",),
}


@dataclass(frozen=True)
class _ConnectionScope:
    """How one source type's connection narrows its listing.

    ``database_keys``/``schema_keys`` name connection keys whose presence
    restricts that level's listing to one database/schema (a fallback
    the connector applies when no explicit include pattern is set).
    ``database_escape_key`` names a connection key whose truthy value
    cancels the database narrowing (entry-database readers list every
    database when it is set). ``single_database`` marks connectors
    that enumerate exactly one database by construction: their database
    listing is never service-complete, so the database kind never
    reconciles for them, while schema/table/procedure listings are
    complete within that one database (see the remainder note on
    ``enabled_reconcile_kinds``). A source type absent from
    ``_CONNECTION_SCOPES`` narrows through patterns only: a new
    database connector whose connection narrows its listing must add
    its entry here, or the gate will over-permit its runs.
    """

    database_keys: tuple[str, ...] = ()
    database_escape_key: str | None = None
    schema_keys: tuple[str, ...] = ()
    single_database: bool = False


# Base source type -> connection scope, verified against each
# connector's selection code (not assumed from the connection shape):
# Snowflake falls back to connection.database for databases;
# Databricks/UnityCatalog fall back to connection.catalog; the
# entry-database readers (MSSQL, Greenplum, Timescale, Redshift) list
# only connection.database unless ingestAllDatabases is set; the
# databaseSchema fallback for schemas lives in MySQL (which also
# accepts the database_schema spelling), MariaDB, Doris, MSSQL,
# Greenplum, Timescale, Redshift, Databricks, and UnityCatalog.
# Postgres and Snowflake have no schema fallback; Postgres, MySQL,
# MariaDB, and Doris enumerate a single database.
_CONNECTION_SCOPES: dict[str, _ConnectionScope] = {
    "snowflake": _ConnectionScope(database_keys=("database",)),
    "databricks": _ConnectionScope(
        database_keys=("catalog",), schema_keys=("databaseSchema",)
    ),
    "unitycatalog": _ConnectionScope(
        database_keys=("catalog",), schema_keys=("databaseSchema",)
    ),
    "mssql": _ConnectionScope(
        database_keys=("database",),
        database_escape_key="ingestAllDatabases",
        schema_keys=("databaseSchema",),
    ),
    "greenplum": _ConnectionScope(
        database_keys=("database",),
        database_escape_key="ingestAllDatabases",
        schema_keys=("databaseSchema",),
    ),
    "timescale": _ConnectionScope(
        database_keys=("database",),
        database_escape_key="ingestAllDatabases",
        schema_keys=("databaseSchema",),
    ),
    "redshift": _ConnectionScope(
        database_keys=("database",),
        database_escape_key="ingestAllDatabases",
        schema_keys=("databaseSchema",),
    ),
    "mysql": _ConnectionScope(
        schema_keys=("databaseSchema", "database_schema"), single_database=True
    ),
    "mariadb": _ConnectionScope(schema_keys=("databaseSchema",), single_database=True),
    "doris": _ConnectionScope(schema_keys=("databaseSchema",), single_database=True),
    "postgres": _ConnectionScope(single_database=True),
}


def _connection_value_present(value: Any) -> bool:
    if value is None or value is False:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _connection_narrows_level(
    scope: _ConnectionScope, connection: dict[str, Any], level: str
) -> bool:
    """Whether the connection restricts ``level`` to one parent."""
    if level == "database":
        keys, escape_key = scope.database_keys, scope.database_escape_key
    elif level == "schema":
        keys, escape_key = scope.schema_keys, None
    else:
        return False
    if escape_key is not None and _connection_value_present(connection.get(escape_key)):
        return False
    return any(_connection_value_present(connection.get(key)) for key in keys)


def _level_narrowing(
    source: Any,
    level: str,
    connection: dict[str, Any],
    scope: _ConnectionScope | None,
) -> str | None:
    """Why ``level``'s listing is partial, or ``None`` when complete.

    An include pattern, a (non-default) exclude pattern, or a
    connection-implied scope each narrows the level. The default schema
    excludes name system schemas no catalog listing should contain, so
    they do not narrow — at the schema level, for the schema kind and
    for every descendant kind alike.
    """
    include_attr, exclude_attr = _LEVEL_PATTERNS[level]
    if getattr(source, include_attr, None):
        return "include pattern"
    excludes = list(getattr(source, exclude_attr, None) or [])
    if level == "schema":
        excludes = [entry for entry in excludes if entry not in _DEFAULT_SCHEMA_EXCLUDES]
    if excludes:
        return "exclude pattern"
    if scope is not None and _connection_narrows_level(scope, connection, level):
        return "connection scope"
    return None


def enabled_reconcile_kinds(source: Any, *, skipped: list[str] | None = None) -> frozenset[str]:
    """The kinds this run may reconcile: flag on AND listing complete.

    A kind reconciles only when its own ``markDeleted*`` flag is true
    AND nothing narrowed its listing at its own level or any ancestor
    level: a filter pattern on a database or schema, a toggle that
    suppresses part of the kind (``includeTables``/``includeViews``
    off leaves views or tables out of the seen set), or a
    connection-implied scope (a database/schema fallback, or an
    entry-database reader) makes the seen set partial, and the
    service-scoped ``deleteStale`` would delete live entities the run
    never listed. The default schema excludes
    (``information_schema``, ``pg_catalog``, ``pg_toast`` — the
    ``SourceConfig`` default) do not narrow: they name system schemas
    no catalog listing should contain. Flag-on kinds excluded by the
    gate are appended to ``skipped`` when provided (one entry per
    kind) so the workflow can count them as sink-step warnings
    (C-11/B-4); kinds whose flag is off are never reported — reconcile
    was never requested for them.

    Remainder, documented rather than fixed here: connectors also
    hardcode system exclusions beyond that default (MySQL-family
    schemas, Doris/MSSQL system schemas, system databases/catalogs on
    Snowflake, MSSQL, the Postgres family, and Databricks). Those names
    are treated as non-catalogable on the same rationale as the
    default excludes, but an entity under such a name cataloged by
    other means would still be deleted by a service-scoped reconcile
    of its kind, because the gate cannot see catalog state. Likewise,
    single-database connectors reconcile schema/table/procedure kinds
    at service scope on the invariant that the service catalogs
    exactly one database; repointing the connection at another
    database leaves the previous database's descendants exposed.
    Closing either remainder needs per-parent deleteStale scoping
    (one call per listed parent instead of one service-scoped call),
    which is a follow-up, not part of this gate.
    ADR:2026-11-14-agent-capability-batch1
    """
    # Kind -> (flag attribute, suppressing-toggle attributes that must
    # all be true). Patterns live in _LEVEL_PATTERNS, ancestors in
    # _KIND_ANCESTORS.
    completeness: dict[str, tuple[str, tuple[str, ...]]] = {
        "table": (
            "mark_deleted_tables",
            ("include_tables_enabled", "include_views"),
        ),
        "schema": ("mark_deleted_schemas", ()),
        "database": ("mark_deleted_databases", ()),
        "storedProcedure": (
            "mark_deleted_stored_procedures",
            ("include_stored_procedures_enabled",),
        ),
        "topic": ("mark_deleted_topics", ()),
        "chart": ("mark_deleted_charts", ()),
        "dashboard": ("mark_deleted_dashboards", ()),
        "container": ("mark_deleted_containers", ()),
        "pipeline": ("mark_deleted_pipelines", ()),
    }
    scope = _CONNECTION_SCOPES.get(_base_source_type(getattr(source, "type", "")))
    connection = getattr(source, "connection", None) or {}
    if not isinstance(connection, dict):
        connection = {}
    enabled: set[str] = set()
    for kind, (flag, toggles) in completeness.items():
        if not bool(getattr(source, flag, False)):
            continue
        if any(not bool(getattr(source, toggle, True)) for toggle in toggles):
            logger.info(
                "reconcile skipped for %s: listing suppressed by an inclusion toggle",
                kind,
            )
            if skipped is not None:
                skipped.append(kind)
            continue
        if kind == "database" and scope is not None and scope.single_database:
            logger.info(
                "reconcile skipped for database: single-database source lists "
                "one database, never the service scope"
            )
            if skipped is not None:
                skipped.append(kind)
            continue
        narrowed: tuple[str, str] | None = None
        for level in (kind, *_KIND_ANCESTORS.get(kind, ())):
            reason = _level_narrowing(source, level, connection, scope)
            if reason is not None:
                narrowed = (level, reason)
                break
        if narrowed is not None:
            level, reason = narrowed
            logger.info(
                "reconcile skipped for %s: listing narrowed by %s on %s",
                kind,
                reason,
                level,
            )
            if skipped is not None:
                skipped.append(kind)
            continue
        enabled.add(kind)
    return frozenset(enabled)


# The SourceConfig default for exclude_schemas (config.py): system
# schemas excluded from every listing, not a user narrowing.
_DEFAULT_SCHEMA_EXCLUDES: frozenset[str] = frozenset(
    {"information_schema", "pg_catalog", "pg_toast"}
)

# child entity path -> (kind, scope entity type for service-level reconcile)
_RECONCILE_TARGETS: list[tuple[str, str, str]] = [
    (TABLES_PATH, "table", "databaseService"),
    (SCHEMAS_PATH, "schema", "databaseService"),
    (DATABASES_PATH, "database", "databaseService"),
    (STORED_PROCEDURES_PATH, "storedProcedure", "databaseService"),
    (TOPICS_PATH, "topic", "messagingService"),
    (CHARTS_PATH, "chart", "dashboardService"),
    (DASHBOARDS_PATH, "dashboard", "dashboardService"),
    (CONTAINERS_PATH, "container", "storageService"),
    (PIPELINES_PATH, "pipeline", "pipelineService"),
]

def _failed_stale_entries(payload: Any) -> list[Any]:
    """Per-entity failures in a ``deleteStale`` response body.

    The server answers HTTP 200 with a ``BulkOperationResult`` whose
    ``failedRequest`` list carries each delete that failed (the batch
    continues past failures), following the same shape the bulk sink
    inspects in ``_record_flush_response``. A body without that list
    carries no per-entity failure evidence: the server always returns
    the result object, so only its ``failedRequest`` entries decide.
    """
    if not isinstance(payload, dict):
        return []
    failed = payload.get("failedRequest")
    return list(failed) if isinstance(failed, list) else []


def _summarize_failed_entries(failed: list[Any], *, limit: int = 3) -> str:
    """The first few failed entries as ``request: message`` text."""
    parts: list[str] = []
    for entry in failed[:limit]:
        if isinstance(entry, dict):
            request = entry.get("request")
            message = entry.get("message") or str(entry)
            parts.append(f"{request}: {message}" if request else str(message))
        else:
            parts.append(str(entry))
    if len(failed) > limit:
        parts.append(f"and {len(failed) - limit} more")
    return "; ".join(parts)


def reconcile_stale(
    client: RestClient,
    *,
    scope_fqn: str,
    scope_entity_type: str,
    seen: SeenSet,
    enabled_kinds: Collection[str],
    dry_run: bool = False,
    skipped: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Soft-delete entities in scope that were not seen this run.

    One ``deleteStale`` call per enabled kind in the scope's family,
    guarded against empty listings: a kind with no seen FQNs is never
    reconciled — an empty listing cannot be told apart from a listing
    that never ran, and the server's ``allowEmptySeenFqns`` default
    (false) is the backstop, never set here. Empty-listing skips are
    appended to ``skipped`` when provided (one entry per kind) so the
    workflow can count them as sink-step warnings (C-11/B-4). Every
    eligible kind is attempted even when an earlier one fails; any
    failure raises after the loop, failing the run — a partially
    reconciled run must never report success. A 200 response is not
    success by itself: per-entity failures ride in the body's
    ``failedRequest`` list, and any entry there fails the run exactly
    like an HTTP-level failure.
    ADR:2026-11-14-agent-capability-batch1
    """
    enabled = set(enabled_kinds)
    results: list[dict[str, Any]] = []
    failures: list[str] = []
    for path, kind, expected_scope in _RECONCILE_TARGETS:
        if expected_scope != scope_entity_type or kind not in enabled:
            continue
        seen_fqns = seen.fqns(kind)
        if not seen_fqns:
            logger.info(
                "reconcile skipped path=%s scope=%s: empty listing (no %s seen)",
                path,
                scope_fqn,
                kind,
            )
            if skipped is not None:
                skipped.append(kind)
            continue
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
        except Exception as exc:
            failures.append(f"{kind}: {exc}")
            logger.warning(
                "reconcile deleteStale failed path=%s scope=%s: %s",
                path,
                scope_fqn,
                exc,
            )
            continue
        failed = _failed_stale_entries(payload)
        if failed:
            failures.append(
                f"{kind}: deleteStale reported {len(failed)} failed "
                f"request(s): {_summarize_failed_entries(failed)}"
            )
            logger.warning(
                "reconcile deleteStale partial failure path=%s scope=%s failed=%s",
                path,
                scope_fqn,
                len(failed),
            )
            continue
        results.append({"path": path, "kind": kind, "result": payload})
        logger.info(
            "reconcile deleteStale path=%s scope=%s seen=%s dryRun=%s",
            path,
            scope_fqn,
            len(seen_fqns),
            dry_run,
        )
    if failures:
        raise WorkflowExecutionError(
            "stale reconcile failed for " + "; ".join(failures)
        )
    return results
