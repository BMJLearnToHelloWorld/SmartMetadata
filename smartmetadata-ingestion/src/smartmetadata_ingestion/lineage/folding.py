# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Case-folding semantics for parsed SQL identifiers (design §5.5b).

Engines fold unquoted identifiers when resolving them — PostgreSQL
to lowercase, Snowflake to uppercase — so an exact candidate built
from the written spelling misses the catalog name. Folding applies
to parsed SQL identifiers only, before exact candidates are built;
row context and connection defaults already carry catalog spellings
and must never be folded. The per-engine rules are specification
data, not code branches: when an engine's semantics are established,
only the table and its tests change.

Quoted segments follow their own column of the table. A quoted rule
of UNKNOWN means the engine's quoted handling depends on a
configuration the binding layer cannot see (Redshift's
``enable_case_sensitive_identifier``): the segment keeps its written
spelling for exact matching and may still enter the case-insensitive
fallback, with the narrowed guarantee recorded, while a quoted rule
of PRESERVE (established case-sensitivity) keeps the segment out of
the fallback entirely. Unknown engines fold nothing at all.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum

from smartmetadata_ingestion.lineage.identifiers import (
    IdentifierSegment,
    StructuredIdentifier,
    normalize_engine_key,
)


class FoldRule(str, Enum):
    """What an engine does to one identifier segment's spelling."""

    LOWER = "lower"
    UPPER = "upper"
    PRESERVE = "preserve"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class FoldingRule:
    """One engine's folding: unquoted segments and quoted segments
    follow different rules, and the quoted rule may be unknown while
    the unquoted rule is established (Redshift)."""

    unquoted: FoldRule
    quoted: FoldRule


# Engine folding semantics, keyed by normalized engine key (see
# normalize_engine_key). Alias keys carry the same rule data as their
# engine: "postgresql" and "timescaledb" are connection-type
# spellings for the PostgreSQL family, and folding must not silently
# vanish for them. Engines absent from the table — including every
# engine whose semantics depend on unseen configuration (MySQL's
# lower_case_table_names, MSSQL collations, Spark case-sensitivity)
# — fold nothing: the UNKNOWN default below, not a guessed rule.
# ADR:2026-11-17-dl2c-binding-context
FOLDING_TABLE: Mapping[str, FoldingRule] = {
    "postgres": FoldingRule(FoldRule.LOWER, FoldRule.PRESERVE),
    "postgresql": FoldingRule(FoldRule.LOWER, FoldRule.PRESERVE),
    "timescale": FoldingRule(FoldRule.LOWER, FoldRule.PRESERVE),
    "timescaledb": FoldingRule(FoldRule.LOWER, FoldRule.PRESERVE),
    "greenplum": FoldingRule(FoldRule.LOWER, FoldRule.PRESERVE),
    "snowflake": FoldingRule(FoldRule.UPPER, FoldRule.PRESERVE),
    "redshift": FoldingRule(FoldRule.LOWER, FoldRule.UNKNOWN),
}

_UNKNOWN_RULE = FoldingRule(FoldRule.UNKNOWN, FoldRule.UNKNOWN)


def folding_rule(engine_key: str | None, *, quoted: bool) -> FoldRule:
    """The folding rule for one segment's quoted-ness on one engine.
    Unknown engines and unknown keys yield UNKNOWN: no folding, and
    no claim about the engine's semantics."""
    rule = FOLDING_TABLE.get(normalize_engine_key(engine_key), _UNKNOWN_RULE)
    return rule.quoted if quoted else rule.unquoted


def fold_segment(segment: IdentifierSegment, engine_key: str | None) -> IdentifierSegment:
    """One parsed identifier segment folded per its engine and
    quoted-ness. PRESERVE and UNKNOWN leave the segment untouched;
    LOWER/UPPER produce a new segment whose ``original`` keeps the
    pre-fold spelling for diagnostics. A segment whose spelling is
    unchanged by folding is returned as-is."""
    rule = folding_rule(engine_key, quoted=segment.quoted)
    if rule is FoldRule.LOWER:
        folded = segment.text.lower()
    elif rule is FoldRule.UPPER:
        folded = segment.text.upper()
    else:
        return segment
    if folded == segment.text:
        return segment
    return IdentifierSegment(folded, segment.quoted, segment.pre_fold_text)


def fold_identifier(
    identifier: StructuredIdentifier, engine_key: str | None
) -> StructuredIdentifier:
    """A parsed identifier folded segment by segment, before exact
    candidates are built. Folding never invents or drops a segment:
    for identifiers produced by the extractors, a folded segment
    cannot become the unquoted ``"<default>"`` sentinel, because the
    sentinel's angle brackets cannot appear in an unquoted SQL
    identifier, so construction's sentinel handling cannot trigger
    on folded output. Programmatically built identifiers are outside
    that premise."""
    return StructuredIdentifier.from_segments(
        fold_segment(segment, engine_key) for segment in identifier.segments
    )


def fallback_eligible(identifier: StructuredIdentifier, engine_key: str | None) -> bool:
    """Whether the identifier may enter the case-insensitive
    fallback after an exact miss. A quoted segment whose engine rule
    is PRESERVE is established case-sensitive, so the whole
    identifier stays out of the fallback; quoted segments with an
    UNKNOWN rule (Redshift, unknown engines) do not block it, and
    unquoted segments never do."""
    return not any(
        segment.quoted and folding_rule(engine_key, quoted=True) is FoldRule.PRESERVE
        for segment in identifier.segments
    )


__all__ = [
    "FOLDING_TABLE",
    "FoldRule",
    "FoldingRule",
    "fallback_eligible",
    "fold_identifier",
    "fold_segment",
    "folding_rule",
]
