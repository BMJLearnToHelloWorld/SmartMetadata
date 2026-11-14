# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared stored-procedure shaping for database connectors.

Engines differ only in how they read routines; the mapping from a routine
row to a ``StoredProcedureRecord`` is the same everywhere, so it lives here
once, driven by lookup tables. A reader without ``list_procedures`` yields
no procedures and warns: procedures are default-on, so silent omission
would hide a missing capability on engines that cannot expose routines.
The warning does not fail the run — the listing was never promised by
such an engine — but the gap must be visible.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.fqn import quote_name
from smartmetadata_ingestion.records import (
    StoredProcedureRecord,
    life_cycle_from_ms,
)

logger = logging.getLogger(__name__)

StoredProcedureType = Literal["StoredProcedure", "UDF", "StoredPackage", "Function"]
ProcedureLanguage = Literal["SQL", "Java", "JavaScript", "Python", "External"]

# information_schema routine types -> createStoredProcedure enum. Anything
# unlisted is a procedure by default: the standard only yields these two.
ROUTINE_TYPE_MAP: dict[str, StoredProcedureType] = {
    "PROCEDURE": "StoredProcedure",
    "FUNCTION": "Function",
}

# Routine languages -> storedProcedureCode language enum. Unlisted
# languages (PL/pgSQL, C, Scala, ...) map to External, the schema enum's
# catch-all: inventing a closer value would misstate the definition.
LANGUAGE_MAP: dict[str, ProcedureLanguage] = {
    "SQL": "SQL",
    "JAVA": "Java",
    "JAVASCRIPT": "JavaScript",
    "PYTHON": "Python",
}


@dataclass(frozen=True, slots=True)
class ProcedureRow:
    """One routine as read from an engine catalog.

    ``created_ms``/``updated_ms`` are epoch milliseconds when the engine
    exposes routine timestamps (MySQL, Snowflake); otherwise ``None``.
    """

    database_name: str = ""
    schema_name: str = ""
    name: str = ""
    routine_type: str = "PROCEDURE"
    language: str | None = None
    definition: str | None = None
    comment: str | None = None
    created_ms: int | None = None
    updated_ms: int | None = None


def epoch_ms(value: Any) -> int | None:
    """Epoch milliseconds for a catalog timestamp, or ``None``.

    Naive datetimes are read as UTC: catalog timestamps carry no zone,
    and UTC is the only reading that does not depend on the runner host.
    Anything that is not a datetime yields ``None`` rather than a guess.
    """
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def procedure_record(
    row: ProcedureRow,
    *,
    database_schema: str,
    owner_names: Iterable[str] = (),
) -> StoredProcedureRecord:
    """One routine row as a first-class stored-procedure record.

    A missing definition becomes an empty ``code``: the create request
    requires the field, and skipping the record would let reconcile
    delete the procedure as unseen.
    """
    return StoredProcedureRecord(
        name=row.name,
        database_schema=database_schema,
        stored_procedure_type=ROUTINE_TYPE_MAP.get(row.routine_type.upper(), "StoredProcedure"),
        language=LANGUAGE_MAP.get((row.language or "SQL").upper(), "External"),
        code=row.definition or "",
        description=row.comment,
        owner_names=list(owner_names),
        life_cycle=life_cycle_from_ms(row.created_ms, row.updated_ms),
    )


def _selected_procedures(
    rows: Sequence[ProcedureRow],
    *,
    schema_fqn: str,
    include: Iterable[str],
    exclude: Iterable[str],
    use_fqn: bool,
    owner_names_for: Callable[[str], list[str]] | None,
) -> list[StoredProcedureRecord]:
    records: list[StoredProcedureRecord] = []
    seen_names: set[str] = set()
    for row in rows:
        # Overloads share one FQN: the server identifies a procedure by
        # FQN alone, so only the first row per name becomes a record.
        if row.name in seen_names:
            continue
        seen_names.add(row.name)
        if not is_selected(
            row.name,
            include=include,
            exclude=exclude,
            fqn=f"{schema_fqn}.{quote_name(row.name)}",
            use_fqn=use_fqn,
        ):
            continue
        owners = owner_names_for(row.name) if owner_names_for is not None else []
        records.append(
            procedure_record(row, database_schema=schema_fqn, owner_names=owners)
        )
    return records


def procedures_for_schema(
    reader: Any,
    *,
    schema_fqn: str,
    schema_name: str,
    include: Iterable[str],
    exclude: Iterable[str],
    enabled: bool = True,
    use_fqn: bool = False,
    owner_names_for: Callable[[str], list[str]] | None = None,
) -> list[StoredProcedureRecord]:
    """Procedures of one schema from a single-database reader.

    Readers are probed, not assumed: ``list_procedures`` is optional, and
    its absence means the engine exposes no routines, not an error. The
    absence still warns when procedures are enabled — a requested,
    default-on capability silently yielding nothing is a gap the run
    history must show.
    """
    if not enabled:
        return []
    fetch = getattr(reader, "list_procedures", None)
    if not callable(fetch):
        logger.warning(
            "stored procedures requested but reader %s exposes no "
            "list_procedures; schema %s yields no procedures",
            type(reader).__name__,
            schema_fqn,
        )
        return []
    return _selected_procedures(
        fetch(schema_name),
        schema_fqn=schema_fqn,
        include=include,
        exclude=exclude,
        use_fqn=use_fqn,
        owner_names_for=owner_names_for,
    )


def procedures_for_database_schema(
    reader: Any,
    database_name: str,
    *,
    schema_fqn: str,
    schema_name: str,
    include: Iterable[str],
    exclude: Iterable[str],
    enabled: bool = True,
    use_fqn: bool = False,
    owner_names_for: Callable[[str], list[str]] | None = None,
) -> list[StoredProcedureRecord]:
    """Procedures of one schema from a multi-database reader.

    Warns on an absent ``list_procedures`` exactly as
    :func:`procedures_for_schema` does when procedures are enabled.
    """
    if not enabled:
        return []
    fetch = getattr(reader, "list_procedures", None)
    if not callable(fetch):
        logger.warning(
            "stored procedures requested but reader %s exposes no "
            "list_procedures; schema %s yields no procedures",
            type(reader).__name__,
            schema_fqn,
        )
        return []
    return _selected_procedures(
        fetch(database_name, schema_name),
        schema_fqn=schema_fqn,
        include=include,
        exclude=exclude,
        use_fqn=use_fqn,
        owner_names_for=owner_names_for,
    )
