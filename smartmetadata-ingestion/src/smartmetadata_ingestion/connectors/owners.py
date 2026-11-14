# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""``ownerConfig`` resolution for database connectors.

Owners resolve most-specific-first: table, database schema, database,
service, default. A level is one owner for everything or a map from
entity name/FQN to its owner(s). With inheritance enabled (the default)
a level with no match falls back up the hierarchy; with inheritance
disabled only the entity level applies. Resolution runs only when the
pipeline asked for owners (``includeOwners``): otherwise no names are
attached and the sink resolves nothing.
"""

from __future__ import annotations

from collections.abc import Callable

from smartmetadata_ingestion.config import OwnerConfig, OwnerValue
from smartmetadata_ingestion.fqn import build_fqn


def _as_names(value: OwnerValue) -> list[str]:
    if isinstance(value, str):
        return [value]
    return list(value)


def _level_names(
    level: str | dict[str, OwnerValue] | None, candidates: list[str]
) -> list[str] | None:
    """Owner names for one hierarchy level, or ``None`` when unmatched.

    A present map key with an empty list is an explicit "no owners"
    that stops inheritance; a missing key falls through.
    """
    if level is None:
        return None
    if isinstance(level, str):
        return [level]
    for candidate in candidates:
        if candidate in level:
            return _as_names(level[candidate])
    return None


def resolve_owner_names(
    owner_config: OwnerConfig | None,
    *,
    include_owners: bool,
    service_name: str,
    database_name: str,
    schema_name: str,
    entity_name: str,
) -> list[str]:
    """Owner names for one table or stored procedure.

    Stored procedures resolve through the same hierarchy: the table
    level is the entity level, so a procedure name simply never matches
    a table key and falls back to the schema level and above.
    """
    if not include_owners or owner_config is None:
        return []
    schema_fqn = build_fqn(service_name, database_name, schema_name)
    entity_fqn = build_fqn(service_name, database_name, schema_name, entity_name)
    database_fqn = build_fqn(service_name, database_name)
    levels: list[tuple[str | dict[str, OwnerValue] | None, list[str]]] = [
        (owner_config.table, [entity_fqn, entity_name]),
        (owner_config.database_schema, [schema_fqn, schema_name]),
        (owner_config.database, [database_fqn, database_name]),
        (owner_config.service, [service_name]),
        (owner_config.default, []),
    ]
    if not owner_config.enable_inheritance:
        levels = levels[:1]
    for level, candidates in levels:
        names = _level_names(level, candidates)
        if names is not None:
            return names
    return []


def owner_names_resolver(
    owner_config: OwnerConfig | None,
    *,
    include_owners: bool,
    service_name: str,
    database_name: str,
    schema_name: str,
) -> Callable[[str], list[str]]:
    """A per-entity owner resolver bound to one database/schema scope.

    Call sites pass the scope as values, so the resolver never closes
    over a loop variable: each schema iteration builds its own.
    """
    def _resolve(entity_name: str) -> list[str]:
        return resolve_owner_names(
            owner_config,
            include_owners=include_owners,
            service_name=service_name,
            database_name=database_name,
            schema_name=schema_name,
            entity_name=entity_name,
        )

    return _resolve
