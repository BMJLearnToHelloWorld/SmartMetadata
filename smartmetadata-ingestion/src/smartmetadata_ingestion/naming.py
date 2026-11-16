# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Connection-default naming: which connection fields name the catalog segments.

The catalog database segment and the binding default schema are both
derived from the connection, but the fields differ per engine — a
MySQL-family connection names its synthetic database with
``databaseName``, a Postgres one with ``database``, a Databricks one
with ``catalog`` — and the two binding call sites used to inline
different subsets of those fields, so the same connection produced
different defaults depending on which chain read it. This module is
the single selection rule both metadata naming and binding defaults
delegate to: per-engine priority chains, as data, independent of any
query-log spec (engines without a spec are bound by the same rule).

Only the selection is shared, never the requiredness: the function
returns ``None`` for a missing segment and never raises for missing
input, because binding defaults are optional — a fully qualified SQL
name or a two-column CSV row binds fine with an empty connection —
while each metadata method keeps its own required check (Postgres
still raises when ``database`` is absent, inside its own method).

ADR:2026-11-17-dl2c-binding-context
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

__all__ = ["resolve_connection_defaults"]

# A priority-chain step: ("field", <connection key>) reads the
# connection, ("literal", <value>) terminates the chain with a fixed
# name. The MySQL-family database chain ends in the "default" literal,
# which is the catalog naming rule for a single-database source, not a
# fallback that masks a missing connection.
Step = tuple[str, str]

_FIELD = "field"
_LITERAL = "literal"

_MYSQL_DATABASE_CHAIN: tuple[Step, ...] = (
    (_FIELD, "databaseName"),
    (_FIELD, "database"),
    (_LITERAL, "default"),
)
_DATABASE_CHAIN: tuple[Step, ...] = ((_FIELD, "database"),)
_CATALOG_CHAIN: tuple[Step, ...] = ((_FIELD, "catalog"),)
# The schema chain is the same for every engine: the declared scan
# field first, then the bare-dict/YAML compatibility key, which stays
# (it is a separately decided breaking change to remove it).
_SCHEMA_CHAIN: tuple[Step, ...] = ((_FIELD, "databaseSchema"), (_FIELD, "schema"))

# Normalized engine key -> (database chain, schema chain). Keys are
# the normalized spellings the shared engine-key rule produces; an
# engine absent from this table has no established rule, so it gets
# no defaults rather than a guessed one.
_DEFAULT_CHAINS: Mapping[str, tuple[tuple[Step, ...], tuple[Step, ...]]] = {
    "mysql": (_MYSQL_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "mariadb": (_MYSQL_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "doris": (_MYSQL_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "postgres": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    # Dialect spellings alias to the same chains as the spec/source
    # keys, matching the folding table's alias keys.
    "postgresql": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "timescale": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "timescaledb": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "snowflake": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "mssql": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "redshift": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "greenplum": (_DATABASE_CHAIN, _SCHEMA_CHAIN),
    "databricks": (_CATALOG_CHAIN, _SCHEMA_CHAIN),
    "unitycatalog": (_CATALOG_CHAIN, _SCHEMA_CHAIN),
}


def _resolve_chain(connection: Mapping[str, Any], chain: tuple[Step, ...]) -> str | None:
    """The first truthy step value, or None when the chain is exhausted.

    Falsy means missing, empty, None, or any other falsy value
    (0, False) — the same ``or`` semantics the inline expressions
    this replaces used — so an explicitly empty field never shadows
    a later field in the chain.
    """
    for kind, value in chain:
        candidate = connection.get(value) if kind == _FIELD else value
        if candidate:
            return str(candidate)
    return None


def resolve_connection_defaults(
    connection: Mapping[str, Any] | None,
    engine_key: str,
) -> tuple[str | None, str | None]:
    """The connection's (default database, default schema) for an engine.

    Never raises for missing input: a ``None`` connection reads as
    empty, an unknown engine key yields ``(None, None)``, and a chain
    that finds nothing yields ``None`` for that segment. Requiredness
    stays with the caller — metadata methods raise, binding accepts
    ``None`` and lets SQL qualifiers or row context fill the gap.
    """
    # Imported lazily: the normalizer lives in the identifiers module
    # under the lineage package, whose __init__ pulls in the SQL
    # parser and its parsing library. This module is shared by
    # metadata, usage, and lineage; resolving the import at call time
    # keeps importing it free of parser weight while the
    # normalization rule itself stays single-sourced.
    from smartmetadata_ingestion.lineage.identifiers import normalize_engine_key

    chains = _DEFAULT_CHAINS.get(normalize_engine_key(engine_key))
    if chains is None:
        return (None, None)
    values = connection if connection is not None else {}
    database_chain, schema_chain = chains
    return (
        _resolve_chain(values, database_chain),
        _resolve_chain(values, schema_chain),
    )
