# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage binding resolution: parsed names → catalog entities via REST.

The same-service table chain is the usage worker's
``RestTableBindingResolver`` (exact-FQN candidates, then a
schema-scoped unique case-insensitive match, then skip-with-warning;
D-C8 item 5, mandatory parent-review item) — composed here, never
duplicated. This module only ADDS what lineage needs beyond usage:

- cross-service candidates, tried after the own-service chain when
  ``processCrossDatabaseLineage`` names other services;
- table-column validation, so column lineage FQNs use the catalog's
  column spelling and never invent a column the catalog does not
  have;
- stored-procedure / UDF binding, for the procedure channel and for
  function-call column paths.

Fallback chain, in order (the documented design, D-C8 item 5):

1. Own service: the usage resolver's chain, unchanged.
2. Cross-database (only when enabled with names): the same
   exact-FQN candidates under each named service, in config order;
   no case-insensitive step across services — a fuzzy match in a
   foreign service would bind a query to the wrong catalog.
3. Unresolvable: ``None``. Callers skip with a warning, never
   invent an entity.

All resolution is serialized through one lock: lineage channels run
in worker threads, and the composed resolver's caches are not
thread-safe on their own.

UDF scope (D-C8 item 2): function bodies resolve through the same
stored-procedure reads as procedures (the catalog stores UDFs and
functions as stored-procedure entities). Until stored procedures are
cataloged (metadata C-8), every lookup misses and the call sites
contribute no UDF-expanded edges — a bounded, logged gap, not a
silent drop: the lookup is attempted and the miss is counted.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from collections.abc import Iterable
from typing import Any

from smartmetadata_ingestion.client.rest import STORED_PROCEDURES_PATH, RestClient
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.parser import (
    LINEAGE_PARSING_TIMEOUT,
    LineageParser,
    QueryParserType,
    clean_table_name,
)
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver

logger = logging.getLogger(__name__)

# Resolver caches are bounded (AGENTS.md: no unbounded caches). A run
# resolves each distinct table/procedure at most once; misses cache
# too, so a 404 is asked about once per run.
MAX_CACHED_TABLE_COLUMNS = 512
MAX_CACHED_PROCEDURES = 512
MAX_CACHED_PROCEDURE_LISTINGS = 128

# Unresolvable-procedure warnings are throttled like the usage
# resolver's table warnings: distinct names first, then counted.
MAX_WARNED_UNRESOLVED_PROCEDURES = 100

# A parsed name has at most database.schema.table parts; longer names
# (catalog-prefixed) resolve on their last three parts.
_MAX_NAME_PARTS = 3

_MISSING: Any = object()


class _LockedCache:
    """A bounded LRU cache whose every access holds the owner's lock.

    Callers hold :class:`LineageBindingResolver`'s lock while calling
    these methods; the cache itself only enforces the size bound.
    """

    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._data: OrderedDict[str, Any] = OrderedDict()

    def get(self, key: str) -> Any:
        try:
            value = self._data.pop(key)
        except KeyError:
            return _MISSING
        self._data[key] = value
        return value

    def set(self, key: str, value: Any) -> None:
        self._data.pop(key, None)
        self._data[key] = value
        while len(self._data) > self._maxsize:
            self._data.popitem(last=False)


def candidate_fqns(
    service: str, parts: list[str], database: str | None, schema: str | None
) -> list[str]:
    """Candidate FQNs for a parsed name under one service, most
    specific first. Three-part names carry their own database/schema;
    two-part names take the database from context; one-part names
    need both from context. Mirrors the usage resolver's candidate
    shape so cross-service attempts behave identically."""
    if len(parts) == 3:
        return [f"{service}.{parts[0]}.{parts[1]}.{parts[2]}"]
    if len(parts) == 2:
        if not database:
            return []
        return [f"{service}.{database}.{parts[0]}.{parts[1]}"]
    if database and schema:
        return [f"{service}.{database}.{schema}.{parts[0]}"]
    return []


def passes_filter(
    name: str,
    fqn: str,
    *,
    include: Iterable[str],
    exclude: Iterable[str],
    use_fqn_for_filtering: bool = False,
) -> bool:
    """Whether a catalog name passes an include/exclude pattern pair.

    The candidate is the bare name, or the full FQN when the pipeline
    asked for FQN filtering — the same choice the metadata sources
    make, applied here to views and procedures."""
    candidate = fqn if use_fqn_for_filtering else name
    return is_selected(candidate, include=include, exclude=exclude)


def view_parent_schema_tables(
    definition: str,
    dialect: Dialect,
    default_schema: str,
    *,
    timeout_seconds: float = LINEAGE_PARSING_TIMEOUT,
    parser_type: QueryParserType = QueryParserType.AUTO,
) -> list[tuple[str, str]]:
    """A view definition's source tables as (schema, table) pairs.

    Parser-based, replacing the deleted FROM/JOIN regex
    (``connectors/sql_views.py``, K-1): subqueries, CTEs, and aliases
    resolve through the cascade, and qualified names keep their own
    schema. Three-part names contribute their last two parts; the
    database part is the caller's context (metadata view lineage
    stays same-database, as before). Order follows the parser's
    source-table order, deduplicated. An unparseable definition
    yields no parents — the parser absorbs bad SQL into empty views,
    never an exception."""
    parser = LineageParser(
        definition,
        dialect=dialect,
        timeout_seconds=timeout_seconds,
        parser_type=parser_type,
    )
    parents: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for table in parser.source_tables:
        parts = clean_table_name(table).split(".")
        if len(parts) >= 2:
            key = (parts[-2], parts[-1])
        else:
            key = (default_schema, parts[0])
        if key not in seen:
            seen.add(key)
            parents.append(key)
    return parents


class LineageBindingResolver:
    """Parsed-name → catalog-entity binding for the lineage channels."""

    def __init__(
        self,
        client: RestClient,
        service_name: str,
        *,
        default_database: str | None = None,
        default_schema: str | None = None,
        cross_database_service_names: Iterable[str] = (),
        process_cross_database_lineage: bool = False,
    ) -> None:
        self._client = client
        self._service_name = service_name
        self._default_database = default_database
        self._default_schema = default_schema
        self._tables = RestTableBindingResolver(
            client,
            service_name,
            default_database=default_database,
            default_schema=default_schema,
        )
        self._cross_services = [
            name.strip() for name in cross_database_service_names if name and name.strip()
        ]
        self._cross_enabled = process_cross_database_lineage and bool(self._cross_services)
        self._lock = threading.RLock()
        self._table_entities = _LockedCache(MAX_CACHED_TABLE_COLUMNS)
        self._columns = _LockedCache(MAX_CACHED_TABLE_COLUMNS)
        self._procedures = _LockedCache(MAX_CACHED_PROCEDURES)
        self._procedure_listings = _LockedCache(MAX_CACHED_PROCEDURE_LISTINGS)
        self._warned_procedures: set[str] = set()
        self._unresolved_tables = 0
        self._unresolved_procedures = 0
        self._unresolved_udfs = 0

    @property
    def unresolved_table_count(self) -> int:
        """Parsed table names that bound to no catalog table after
        every service was tried. An own-service miss that resolves
        cross-service is not counted — only the final outcome is."""
        return self._unresolved_tables

    @property
    def warning_count(self) -> int:
        """Binding skips that count as run warnings (C-11/B-4):
        finally-unresolved tables plus unresolved procedures. UDF
        misses are a subset of procedure misses (``resolve_udf``
        delegates to ``resolve_procedure``) and are NOT added again."""
        return self._unresolved_tables + self._unresolved_procedures

    @property
    def unresolved_procedure_count(self) -> int:
        """CALLs/UDF names that bound to no catalog procedure."""
        return self._unresolved_procedures

    @property
    def unresolved_udf_count(self) -> int:
        """Function names whose UDF lookup missed."""
        return self._unresolved_udfs

    def resolve_table(
        self,
        parsed_name: str,
        *,
        database_name: str | None = None,
        database_schema: str | None = None,
    ) -> str | None:
        """The catalog table FQN for a parsed name, or ``None``.

        Own service first (the usage chain), then each named
        cross-database service when enabled. A 404 moves to the next
        candidate; any other REST error propagates."""
        with self._lock:
            resolved = self._tables.resolve(
                parsed_name,
                database_name=database_name,
                database_schema=database_schema,
                quiet=self._cross_enabled,
            )
            if resolved is not None:
                return resolved
            if self._cross_enabled:
                parts = parsed_name.split(".")[-_MAX_NAME_PARTS:]
                database = database_name or self._default_database
                schema = database_schema or self._default_schema
                for service in self._cross_services:
                    if service == self._service_name:
                        continue
                    for fqn in candidate_fqns(service, parts, database, schema):
                        if self._table_lookup(fqn) is not None:
                            return fqn
                # The own-service probe ran quiet; only now, with every
                # resolver exhausted, does the name earn its warning.
                # Inside the guard: with cross-service probing off the
                # probe already warned loudly and must not warn twice.
                self._tables.warn_unresolved(parsed_name)
            self._unresolved_tables += 1
            return None

    def table_exists(self, fqn: str) -> bool:
        """Whether a table FQN exists in the catalog (404 = absent)."""
        with self._lock:
            return self._table_lookup(fqn) is not None

    def table_columns(self, fqn: str) -> tuple[str, ...] | None:
        """The catalog column names for a table FQN, or ``None`` when
        the catalog says nothing about its columns (unknown table, or
        an entity with no column list). ``None`` means "unknown", not
        "no columns" — callers fall back to parsed names rather than
        dropping column lineage on an uninformative entity."""
        with self._lock:
            cached = self._columns.get(fqn)
            if cached is not _MISSING:
                return cached
            entity = self._table_lookup(fqn)
            columns = None
            if entity is not None:
                raw = entity.get("columns")
                if isinstance(raw, list) and raw:
                    names = [
                        str(column.get("name"))
                        for column in raw
                        if isinstance(column, dict) and column.get("name")
                    ]
                    columns = tuple(names) if names else None
            self._columns.set(fqn, columns)
            return columns

    def resolve_column(self, table_fqn: str, column_name: str) -> str | None:
        """The column FQN for a parsed column, or ``None`` when the
        catalog's column list contradicts it.

        A catalog match (case-insensitive, unique) yields the
        catalog's spelling; an unknown column list yields the parsed
        spelling; a known list with no match, or an ambiguous match,
        yields ``None`` — the mapping is dropped, never guessed."""
        with self._lock:
            columns = self.table_columns(table_fqn)
            if columns is None:
                return f"{table_fqn}.{column_name}"
            matches = [name for name in columns if name.lower() == column_name.lower()]
            if len(matches) == 1:
                return f"{table_fqn}.{matches[0]}"
            if len(matches) > 1:
                logger.warning(
                    "Ambiguous column %r on table %s: %d case-insensitive matches; "
                    "dropping the column mapping",
                    column_name,
                    table_fqn,
                    len(matches),
                )
            return None

    def resolve_procedure(
        self,
        parsed_name: str,
        *,
        database_name: str | None = None,
        database_schema: str | None = None,
    ) -> dict[str, Any] | None:
        """The catalog stored-procedure entity for a parsed CALL name,
        or ``None``. Exact-FQN candidates first, then a schema-scoped
        unique case-insensitive match — the table chain's shape,
        applied to procedures. Unresolvable names warn (throttled)
        and count, never invent an entity."""
        with self._lock:
            parts = parsed_name.split(".")[-_MAX_NAME_PARTS:]
            database = database_name or self._default_database
            schema = database_schema or self._default_schema
            for fqn in candidate_fqns(self._service_name, parts, database, schema):
                entity = self._procedure_lookup(fqn)
                if entity is not None:
                    return entity
            if database and schema:
                entity = self._resolve_procedure_case_insensitive(parts[-1], database, schema)
                if entity is not None:
                    return entity
            self._warn_unresolved_procedure(parsed_name)
            return None

    def resolve_udf(
        self,
        function_name: str,
        *,
        database_name: str | None = None,
        database_schema: str | None = None,
    ) -> dict[str, Any] | None:
        """The catalog entity for a function name appearing in a
        column path, or ``None``. UDFs and functions live in the
        stored-procedure catalog, so this is procedure binding under
        its UDF name; misses count separately so a run can report
        how many function call sites had no catalog body."""
        with self._lock:
            entity = self.resolve_procedure(
                function_name,
                database_name=database_name,
                database_schema=database_schema,
            )
            if entity is None:
                self._unresolved_udfs += 1
            return entity

    @staticmethod
    def procedure_code(entity: dict[str, Any]) -> str | None:
        """The procedure body's code text, or ``None`` when the entity
        carries none. The code block is ``storedProcedureCode.code``
        per the stored-procedure schema."""
        code_block = entity.get("storedProcedureCode")
        if not isinstance(code_block, dict):
            return None
        code = code_block.get("code")
        if isinstance(code, str) and code.strip():
            return code
        return None

    def _table_lookup(self, fqn: str) -> dict[str, Any] | None:
        """The table entity for an FQN, or ``None`` on 404. Other
        REST errors propagate: absence is data, failure is failure.
        Cached per run, misses included."""
        cached = self._table_entities.get(fqn)
        if cached is not _MISSING:
            return cached
        try:
            result = self._client.get_table_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                result = None
            else:
                raise
        self._table_entities.set(fqn, result)
        return result

    def _procedure_lookup(self, fqn: str) -> dict[str, Any] | None:
        cached = self._procedures.get(fqn)
        if cached is not _MISSING:
            return cached
        try:
            result = self._client.get_stored_procedure_by_name(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                result = None
            else:
                raise
        self._procedures.set(fqn, result)
        return result

    def _resolve_procedure_case_insensitive(
        self, procedure_name: str, database: str, schema: str
    ) -> dict[str, Any] | None:
        schema_fqn = f"{self._service_name}.{database}.{schema}"
        matches = [
            item
            for item in self._list_schema_procedures(schema_fqn)
            if str(item.get("name", "")).lower() == procedure_name.lower()
        ]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            logger.warning(
                "Ambiguous procedure name %r in schema %s: %d case-insensitive "
                "matches; skipping",
                procedure_name,
                schema_fqn,
                len(matches),
            )
        return None

    def _list_schema_procedures(self, schema_fqn: str) -> tuple[dict[str, Any], ...]:
        cached = self._procedure_listings.get(schema_fqn)
        if cached is not _MISSING:
            return cached
        result = tuple(
            self._client.iter_collection(
                STORED_PROCEDURES_PATH,
                limit=100,
                extra_params={"databaseSchema": schema_fqn},
            )
        )
        self._procedure_listings.set(schema_fqn, result)
        return result

    def _warn_unresolved_procedure(self, parsed_name: str) -> None:
        self._unresolved_procedures += 1
        if parsed_name in self._warned_procedures:
            return
        if len(self._warned_procedures) < MAX_WARNED_UNRESOLVED_PROCEDURES:
            self._warned_procedures.add(parsed_name)
            logger.warning(
                "No catalog procedure matches %r under service %s; skipping",
                parsed_name,
                self._service_name,
            )
        elif len(self._warned_procedures) == MAX_WARNED_UNRESOLVED_PROCEDURES:
            self._warned_procedures.add("")
            logger.warning(
                "Further unresolvable procedure names will be counted, not logged "
                "(%d skipped so far)",
                self._unresolved_procedures,
            )
