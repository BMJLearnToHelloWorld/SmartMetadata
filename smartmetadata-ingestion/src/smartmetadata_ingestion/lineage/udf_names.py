# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""UDF and column-binding entry helpers (D-L2c design §5.5).

Function names and column parent qualifiers enter binding through
the same structured identifiers as table names: a UDF name keeps the
qualifiers the AST extraction proved, and a column's parent table
is used only when the endpoint association confirmed it. Both
helpers are pure selections over extraction results — they never
synthesize a name, and they never fall back to cleaning a string
name back out of a display rendering.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import TYPE_CHECKING

from smartmetadata_ingestion.lineage.identifiers import (
    ExtractionResult,
    StructuredIdentifier,
)

if TYPE_CHECKING:
    from collate_sqllineage.core.models import Table

    from smartmetadata_ingestion.lineage.parser import LineageParser

# A column path element shaped like a function call: the parser
# bakes the call into the target column name when neither an alias
# nor an INSERT column list names the output column. This is the
# single definition of the heuristic (moved verbatim from
# query_lineage.py, which imports it): which function calls count as
# UDF candidates is decided by column-path shape, exactly as before;
# only the name representation changed, from strings to the
# extraction's structured identifiers.
FUNCTION_COLUMN_PATTERN = re.compile(r"\A([A-Za-z_][\w$]*)\s*\(")


def udf_names_from_extraction(
    extraction: ExtractionResult,
    column_texts: Iterable[str],
) -> list[StructuredIdentifier]:
    """The structured UDF names an extraction proved, restricted to
    the function calls the column-path heuristic names.

    A function occurrence qualifies only when its leaf text matches,
    case-insensitively, one of the call names the heuristic reads off
    the column texts: the heuristic decides *which* calls are UDF
    candidates (column-path shape, unchanged), while the extraction
    supplies the *name* (with whatever catalog/db qualifiers the SQL
    text carried). Only binding candidates qualify: an INTERMEDIATE
    occurrence — a function call sharing a CTE's name — names a
    query-local definition, never a catalog function, and must not
    reach UDF resolution. The comparison folds case on both sides because
    the runner bakes call text in upper case while extraction keeps
    the SQL's written case; the returned identifiers keep their
    original case and quoted marks verbatim into binding. Names are
    deduplicated, keeping first-occurrence order, and no name is
    ever synthesized — a heuristic call with no matching extraction
    occurrence yields nothing."""
    called = {
        match.group(1).lower()
        for text in column_texts
        if (match := FUNCTION_COLUMN_PATTERN.match(text)) is not None
    }
    names: list[StructuredIdentifier] = []
    seen: set[StructuredIdentifier] = set()
    for occurrence in extraction.function_names:
        if not occurrence.is_binding_candidate:
            continue
        identifier = occurrence.identifier
        if identifier is None:
            continue
        if identifier.leaf.text.lower() not in called:
            continue
        if identifier in seen:
            continue
        seen.add(identifier)
        names.append(identifier)
    return names


def column_parent_identifier(
    parent: Table, parser: LineageParser
) -> StructuredIdentifier | None:
    """The structured identifier for a column's parent table, or
    None when the parent cannot be confirmed.

    The verdict comes from the parser's endpoint association: only
    a table-level confirmation *plus* a confirmed column
    attribution names the parent, because a self-join's two aliases
    confirm one table identity while leaving every column's alias
    unproven. Anything unconfirmed returns None so the caller skips
    the column path instead of guessing it onto an alias — and the
    result never falls back to a cleaned string name, which is
    exactly the lossy rendering this type replaced."""
    verdict = parser.association_for(parent)
    if verdict is None:
        return None
    if verdict.identifier is None or not verdict.column_attribution_confirmed:
        return None
    return verdict.identifier


__all__ = [
    "FUNCTION_COLUMN_PATTERN",
    "column_parent_identifier",
    "udf_names_from_extraction",
]
