# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""View lineage channel (design §3.7 channel 1).

View definitions come from the fork's existing live-catalog channel
(D-C5: keep the channel, replace the regex with the parser, add the
pin's filter-pattern + incremental handling — no ES client). Each
enumerated view is parsed with the cascade, its sources resolve
against catalog entities, and its edges carry column lineage.

Two behaviors need REST reads, both in this channel:

- ``overrideViewLineage`` deletes the view's existing ViewLineage
  edges before the new ones are written, via the server's
  delete-by-source endpoint — which removes only UPSTREAM edges
  carrying that source, so a view a query writes into is never
  clobbered (the ``_writes_into_view`` guard, realized by the
  endpoint's own semantics rather than a pre-check).
- ``incrementalLineageProcessing`` skips a view whose current
  upstream edges already match the parsed definition (same sources,
  same SQL text) — the REST form of the pin's incremental view
  handling.

A view with no catalog entity is skipped with a warning: the pin
reads view definitions from the catalog's own index, so an
un-cataloged view has no lineage home yet, and writing edges for
it would fail at the sink. Definitions are wrapped in a synthetic
``CREATE VIEW`` when they are bare SELECTs (the usual
``information_schema`` shape) so the parser reports column paths
against the view's output columns; the wrapped text never reaches
an edge — edges carry the original definition.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.lineage.graphs import TempHop
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver, passes_filter
from smartmetadata_ingestion.records import LineageEndpoint, LineageRecord

logger = logging.getLogger(__name__)

# Synthetic target name for wrapping bare-SELECT view definitions.
# The processor's target override replaces it with the real view
# FQN, so the name itself never appears in an edge.
_WRAPPED_VIEW_NAME = "__lineage_view__"


@dataclass(frozen=True)
class ViewItem:
    """One enumerated view: its catalog coordinates + definition."""

    database: str
    schema: str
    name: str
    definition: str

    def fqn(self, service_name: str) -> str:
        return build_fqn(service_name, self.database, self.schema, self.name)


class ViewEnumerator(Protocol):
    """Per-engine view enumeration over the live catalog."""

    def iter_views(self) -> Iterable[ViewItem]: ...


@dataclass
class ViewOutcome:
    """Per-item counts, merged by the source in the main thread."""

    seen: int = 0
    skipped_filtered: int = 0
    skipped_empty: int = 0
    skipped_not_cataloged: int = 0
    skipped_incremental: int = 0
    edges: int = 0
    overrides_deleted: int = 0


def wrap_view_definition(definition: str) -> str:
    """The parse text for a view definition: bare SELECTs are
    wrapped so the parser has a target to map columns onto; a
    definition that already creates its view parses as written."""
    stripped = definition.strip()
    if stripped[:6].upper() == "CREATE":
        return definition
    return f"CREATE VIEW {_WRAPPED_VIEW_NAME} AS {definition}"


class ViewLineageChannel:
    """One view at a time: filters, existence, incremental skip,
    override delete, parse, edge assembly."""

    def __init__(
        self,
        processor: QueryLineageProcessor,
        resolver: LineageBindingResolver,
        client: RestClient,
        *,
        service_name: str,
        override_view_lineage: bool,
        incremental_lineage_processing: bool,
        include_databases: list[str],
        exclude_databases: list[str],
        include_schemas: list[str],
        exclude_schemas: list[str],
        include_tables: list[str],
        exclude_tables: list[str],
        use_fqn_for_filtering: bool = False,
    ) -> None:
        self._processor = processor
        self._resolver = resolver
        self._client = client
        self._service_name = service_name
        self._override = override_view_lineage
        self._incremental = incremental_lineage_processing
        self._include_databases = include_databases
        self._exclude_databases = exclude_databases
        self._include_schemas = include_schemas
        self._exclude_schemas = exclude_schemas
        self._include_tables = include_tables
        self._exclude_tables = exclude_tables
        self._use_fqn = use_fqn_for_filtering

    def selected(self, view: ViewItem) -> bool:
        """Whether the view passes the database/schema/table filter
        patterns. Each level filters its own name (or FQN, when the
        pipeline asked for FQN filtering)."""
        view_fqn = view.fqn(self._service_name)
        database_fqn = build_fqn(self._service_name, view.database)
        schema_fqn = build_fqn(self._service_name, view.database, view.schema)
        return (
            passes_filter(
                view.database,
                database_fqn,
                include=self._include_databases,
                exclude=self._exclude_databases,
                use_fqn_for_filtering=self._use_fqn,
            )
            and passes_filter(
                view.schema,
                schema_fqn,
                include=self._include_schemas,
                exclude=self._exclude_schemas,
                use_fqn_for_filtering=self._use_fqn,
            )
            and passes_filter(
                view.name,
                view_fqn,
                include=self._include_tables,
                exclude=self._exclude_tables,
                use_fqn_for_filtering=self._use_fqn,
            )
        )

    def process_one(
        self, view: ViewItem
    ) -> tuple[list[LineageRecord], ViewOutcome, list[TempHop]]:
        """Process one view. Returns its edge records, the outcome
        counts, and any temp-table hops for the run's graph."""
        outcome = ViewOutcome(seen=1)
        if not view.definition.strip():
            logger.warning(
                "view %s has an empty definition; skipping", view.fqn(self._service_name)
            )
            outcome.skipped_empty = 1
            return [], outcome, []
        view_fqn = view.fqn(self._service_name)
        if not self._resolver.table_exists(view_fqn):
            logger.warning(
                "view %s is not in the catalog; skipping its lineage "
                "(run a metadata ingestion first)",
                view_fqn,
            )
            outcome.skipped_not_cataloged = 1
            return [], outcome, []
        processed = self._processor.process(
            wrap_view_definition(view.definition),
            database_name=view.database,
            database_schema=view.schema,
            target_override_fqn=view_fqn,
        )
        if (
            self._incremental
            and processed.edges
            and self._edges_intact(view_fqn, view.definition, processed)
        ):
            outcome.skipped_incremental = 1
            return [], outcome, []
        # Override deletion runs only when fresh edges exist to
        # replace the old ones: deleting for a definition that
        # parsed to nothing would wipe lineage the run cannot
        # replace.
        if self._override and processed.edges:
            self._delete_existing_view_lineage(view_fqn)
            outcome.overrides_deleted = 1
        records = [
            LineageRecord(
                from_entity=LineageEndpoint(type="table", fqn=edge.from_fqn),
                to_entity=LineageEndpoint(type="table", fqn=edge.to_fqn),
                source="CrossDatabaseLineage" if edge.cross_database else "ViewLineage",
                sql_query=view.definition,
                columns_lineage=list(edge.columns),
            )
            for edge in processed.edges
        ]
        outcome.edges = len(records)
        return records, outcome, list(processed.temp_hops)

    def _edges_intact(self, view_fqn: str, definition: str, processed: Any) -> bool:
        """Whether the view's current upstream edges already match
        the parsed definition: every expected source has an upstream
        edge whose stored SQL equals the original definition. The
        stored text is the definition itself (edges never carry the
        wrapped parse text), so a changed definition always
        mismatches and the view is reprocessed. A missing lineage
        graph, or any missing/mismatched edge, means "not intact"."""
        try:
            graph = self._client.get_lineage_by_name(
                "table", view_fqn, upstream_depth=1, downstream_depth=0
            )
        except RestError as exc:
            if exc.status_code == 404:
                return False
            raise
        entity = graph.get("entity") or {}
        nodes = graph.get("nodes") or []
        id_by_fqn = {
            str(node.get("fullyQualifiedName")): str(node.get("id"))
            for node in nodes
            if isinstance(node, dict) and node.get("fullyQualifiedName") and node.get("id")
        }
        target_id = str(entity.get("id", ""))
        if not target_id:
            return False
        stored: set[tuple[str, str]] = set()
        for upstream in graph.get("upstreamEdges") or []:
            if not isinstance(upstream, dict):
                continue
            details = upstream.get("lineageDetails") or {}
            if details.get("sqlQuery") == definition:
                stored.add(
                    (str(upstream.get("fromEntity")), str(upstream.get("toEntity")))
                )
        for edge in processed.edges:
            source_id = id_by_fqn.get(edge.from_fqn)
            if source_id is None or (source_id, target_id) not in stored:
                return False
        return True

    def _delete_existing_view_lineage(self, view_fqn: str) -> None:
        """Delete-before-write for one view. A 404 means the view
        has no lineage to delete; any other failure propagates —
        writing new edges over stale ones would silently keep the
        stale set alive."""
        try:
            self._client.delete_lineage_by_source("table", view_fqn, "ViewLineage")
        except RestError as exc:
            if exc.status_code == 404:
                return
            raise


class MultiDatabaseViewEnumerator:
    """View enumeration over a multi-database catalog reader
    (``list_databases`` / ``list_views(database)`` shape)."""

    def __init__(self, catalog: Any) -> None:
        self._catalog = catalog

    def iter_views(self) -> Iterable[ViewItem]:
        for database in self._catalog.list_databases():
            for view in self._catalog.list_views(database.name):
                yield ViewItem(
                    database=database.name,
                    schema=view.schema_name,
                    name=view.name,
                    definition=view.definition,
                )


class SingleDatabaseViewEnumerator:
    """View enumeration over a single-database catalog reader
    (``list_views()`` shape, database from the connection)."""

    def __init__(self, catalog: Any, database: str) -> None:
        self._catalog = catalog
        self._database = database

    def iter_views(self) -> Iterable[ViewItem]:
        for view in self._catalog.list_views():
            yield ViewItem(
                database=self._database,
                schema=view.schema_name,
                name=view.name,
                definition=view.definition,
            )
