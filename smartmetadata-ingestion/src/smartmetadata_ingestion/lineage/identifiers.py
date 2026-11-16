# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Structured SQL identifiers and the name-extraction contract.

A dotted name string cannot carry binding: ``sales.eu.orders`` may be
two segments (a quoted ``sales.eu`` schema) or three, and a four-part
name silently loses its middle segment once flattened. Binding
therefore works on :class:`StructuredIdentifier` — an ordered segment
sequence where every segment keeps its written text and its quoted
flag — and never splits a string on ``"."``. The quoted flag is also
the only thing that separates a real ``"<default>"`` segment from the
parsing library's unquoted placeholder of the same spelling: the
placeholder is dropped at construction, the quoted name is kept.

This module is the shared base of the D-L2c binding fix (design
§5.5/§5.5b): the identifier type, the extractor protocol every parser
branch implements, the registry the cascade winner dispatches
through, and the association rules that pair extracted names with
the runner's lossy endpoints. It imports nothing from the parsing
glue, so the resolver, naming, and branch-extractor modules can all
depend on it without import cycles.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from smartmetadata_ingestion.lineage.dialect import Dialect

logger = logging.getLogger(__name__)

# The parsing library's placeholder for "no schema", carried as a
# schema segment's text. It is meaningful ONLY unquoted: an unquoted
# occurrence is the model's default, never a name from SQL text
# (angle brackets cannot appear in a bare identifier), while a quoted
# occurrence is a real segment name that must survive.
DEFAULT_SENTINEL = "<default>"


def normalize_engine_key(engine_key: str | None) -> str:
    """A connection-type spelling as a lookup key: lowercased, with
    separators stripped. Connection types vary in spelling
    (``PostgreSQL``, ``TimescaleDB``) while the folding and naming
    tables use one normalized key per engine; the rule mirrors the
    dialect map's normalization so both tables agree on keys."""
    if not engine_key:
        return ""
    return "".join(char for char in str(engine_key).lower() if char.isalnum())


@dataclass(frozen=True, eq=False)
class IdentifierSegment:
    """One segment of a structured identifier: its written text and
    whether it was quoted in the SQL text.

    Identity is (text, quoted): the ``original`` field is provenance
    only — the pre-fold spelling a folding step replaced — and never
    participates in equality or hashing, so a folded identifier still
    matches the catalog spelling it folded to. ``original`` is None
    when the text was never folded.
    """

    text: str
    quoted: bool = False
    original: str | None = None

    def __post_init__(self) -> None:
        if not self.text:
            raise ValueError("an identifier segment must not be empty")

    @property
    def pre_fold_text(self) -> str:
        """The spelling before folding, or the text itself when the
        segment was never folded."""
        return self.original if self.original is not None else self.text

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, IdentifierSegment):
            return NotImplemented
        return self.text == other.text and self.quoted == other.quoted

    def __hash__(self) -> int:
        return hash((self.text, self.quoted))


@dataclass(frozen=True)
class StructuredIdentifier:
    """An ordered segment sequence naming a table, function, or
    procedure exactly as the SQL text qualified it. Segment count is
    unbounded: server/catalog qualifiers survive as segments instead
    of being truncated, and an over-long name is the resolver's
    decision to skip, not the parser's to silently shorten.

    Construction drops unquoted ``"<default>"`` segments (the
    library placeholder, never a SQL name) and rejects an identifier
    left with no segments. Quoted ``"<default>"`` segments are real
    names and are kept. Frozen and hashable, so identifiers serve as
    dict keys for alias maps and binding maps.
    """

    segments: tuple[IdentifierSegment, ...]

    def __post_init__(self) -> None:
        kept = tuple(
            segment
            for segment in self.segments
            if not (segment.text == DEFAULT_SENTINEL and not segment.quoted)
        )
        if not kept:
            raise ValueError("a structured identifier needs at least one segment")
        object.__setattr__(self, "segments", kept)

    @classmethod
    def from_segments(cls, segments: Iterable[IdentifierSegment]) -> StructuredIdentifier:
        return cls(tuple(segments))

    @classmethod
    def from_parts(cls, parts: Iterable[tuple[str, bool]]) -> StructuredIdentifier:
        """Build from (text, quoted) pairs, the shape extractors
        produce from AST identifier nodes."""
        return cls(tuple(IdentifierSegment(text, quoted) for text, quoted in parts))

    @classmethod
    def single(cls, text: str, quoted: bool = False) -> StructuredIdentifier:
        return cls((IdentifierSegment(text, quoted),))

    @property
    def texts(self) -> tuple[str, ...]:
        return tuple(segment.text for segment in self.segments)

    @property
    def leaf(self) -> IdentifierSegment:
        return self.segments[-1]

    @property
    def qualifiers(self) -> tuple[IdentifierSegment, ...]:
        return self.segments[:-1]

    def __len__(self) -> int:
        return len(self.segments)

    def display(self) -> str:
        """The identifier as dotted text, for logs and warnings only.
        Segments containing a dot are re-quoted so the rendering is
        unambiguous to a reader. Display output must never be parsed
        back into an identifier — that round trip is exactly the
        ambiguity this type exists to remove."""
        rendered = []
        for segment in self.segments:
            text = segment.text
            if "." in text or '"' in text:
                rendered.append('"' + text.replace('"', '""') + '"')
            else:
                rendered.append(text)
        return ".".join(rendered)


class NameRole(str, Enum):
    """The role a name plays in its statement, from the AST position
    the extractor found it in. A CTE reference is intermediate: it
    names a query-local definition, never a catalog table, so it is
    not a binding candidate."""

    SOURCE = "source"
    TARGET = "target"
    INTERMEDIATE = "intermediate"


class UnsupportedReason(str, Enum):
    """Why one extracted occurrence carries no faithful identifier.
    The name is skipped, never guessed; the reason feeds the
    unsupported-qualifier count."""

    DYNAMIC_IDENTIFIER = "dynamic_identifier"
    NON_IDENTIFIER_NAME = "non_identifier_name"
    UNPARSEABLE_IDENTIFIER_LITERAL = "unparseable_identifier_literal"


class ExtractionFailureReason(str, Enum):
    """Why a whole extraction produced no names. Distinct from a
    per-name unsupported reason: the entire branch parse failed, so
    every name from that query is fidelity-unproven."""

    NO_EXTRACTOR = "no_extractor"
    PARSE_ERROR = "parse_error"
    TIMEOUT = "timeout"
    EXTRACTOR_ERROR = "extractor_error"


@dataclass(frozen=True)
class ExtractedName:
    """One name occurrence from one statement's AST, with everything
    the association rules and the resolver need to use it without
    re-reading the query text.

    ``node_index`` is the occurrence's position in extraction order:
    diagnostics only, never identity — association must not pair
    names by position. ``alias`` is the occurrence's own alias text
    (None when unaliased); ``is_function`` marks function-call names,
    which route to procedure/UDF binding instead of table binding.
    An occurrence without an identifier always carries the reason
    its name could not be proven faithful.
    """

    identifier: StructuredIdentifier | None
    role: NameRole
    alias: str | None
    statement_index: int
    node_index: int
    alias_quoted: bool = False
    is_function: bool = False
    unsupported_reason: UnsupportedReason | None = None

    def __post_init__(self) -> None:
        if (self.identifier is None) == (self.unsupported_reason is None):
            raise ValueError(
                "an extracted name needs exactly one of an identifier or an "
                "unsupported reason"
            )

    @property
    def fidelity_proven(self) -> bool:
        """Whether the occurrence carries a faithful identifier. Only
        proven names may bind; anything else is skipped and counted."""
        return self.identifier is not None and self.unsupported_reason is None

    @property
    def is_binding_candidate(self) -> bool:
        """Whether the occurrence may enter binding at all: proven,
        and not a CTE reference. Callers split candidates by
        ``is_function`` into the table and procedure/UDF chains."""
        return self.fidelity_proven and self.role is not NameRole.INTERMEDIATE


@dataclass(frozen=True)
class ExtractionResult:
    """Everything one branch extraction produced for one query: the
    extracted occurrences, or a failure that leaves every name
    unbound. ``branch`` is the winning parser's name, set by the
    dispatcher so counts can be attributed per winning branch."""

    branch: str = ""
    names: tuple[ExtractedName, ...] = ()
    failed: bool = False
    failure_reason: ExtractionFailureReason | None = None

    def __post_init__(self) -> None:
        if self.failed == (self.failure_reason is None):
            raise ValueError("a failed extraction needs a failure reason")

    @property
    def table_names(self) -> tuple[ExtractedName, ...]:
        return tuple(name for name in self.names if not name.is_function)

    @property
    def function_names(self) -> tuple[ExtractedName, ...]:
        return tuple(name for name in self.names if name.is_function)

    @property
    def binding_candidates(self) -> tuple[ExtractedName, ...]:
        return tuple(name for name in self.names if name.is_binding_candidate)

    @property
    def unsupported_names(self) -> tuple[ExtractedName, ...]:
        return tuple(name for name in self.names if not name.fidelity_proven)


class NameExtractor(Protocol):
    """One parser branch's name extractor: the same cleaned SQL text
    and dialect the cascade winner parsed, re-read for faithful
    names. Implementations must never fall back to string splitting
    and must surface failure as an
    :class:`ExtractionResult` with ``failed`` set (or raise, which
    the dispatcher converts) — never as guessed names."""

    def __call__(self, parse_text: str, dialect: Dialect) -> ExtractionResult: ...


_EXTRACTORS: dict[str, NameExtractor] = {}


def register_extractor(branch: str, extractor: NameExtractor) -> None:
    """Mount an extractor under its winning parser's branch name.
    Registration is idempotent: re-registering the same branch
    replaces the entry, so lazy registration during a run is safe."""
    _EXTRACTORS[branch] = extractor


def registered_branches() -> tuple[str, ...]:
    return tuple(sorted(_EXTRACTORS))


def extract_names(branch: str, parse_text: str, dialect: Dialect) -> ExtractionResult:
    """Dispatch to the winning branch's extractor. A branch with no
    extractor, or an extractor that raises, yields a failed result:
    names from that branch are fidelity-unproven and must not bind,
    and no other branch's extractor is consulted — the winner's
    parse is the only parse the names may come from."""
    extractor = _EXTRACTORS.get(branch)
    if extractor is None:
        return ExtractionResult(
            branch=branch, failed=True, failure_reason=ExtractionFailureReason.NO_EXTRACTOR
        )
    try:
        result = extractor(parse_text, dialect)
    except Exception:
        logger.debug("name extraction failed for branch %s", branch, exc_info=True)
        return ExtractionResult(
            branch=branch, failed=True, failure_reason=ExtractionFailureReason.EXTRACTOR_ERROR
        )
    return replace(result, branch=branch)


@dataclass(frozen=True)
class EndpointDescriptor:
    """A runner endpoint reduced to what the library actually
    preserves: the leaf name, the schema text as rendered (None when
    the endpoint carries the placeholder, i.e. the query named no
    schema), the alias, and the roles the endpoint plays across the
    runner's views. The association rules see only this lossy shape
    on the runner side, which is why they demand uniqueness."""

    raw_name: str
    schema_name: str | None
    alias: str | None
    roles: frozenset[NameRole] = field(default_factory=frozenset)


class UnconfirmedReason(str, Enum):
    """Why an endpoint association (or a column attribution) could
    not be confirmed. Every value means "skip, don't guess"."""

    NO_COMPATIBLE_NAME = "no_compatible_name"
    AMBIGUOUS_IDENTITY = "ambiguous_identity"
    COLUMN_ATTRIBUTION_AMBIGUOUS = "column_attribution_ambiguous"


@dataclass(frozen=True)
class EndpointAssociation:
    """The association verdict for one runner endpoint: the
    structured identifier confirmed for it, or None with the reason
    confirmation failed. ``column_attribution_confirmed`` is the
    stricter column-level verdict: table identity may be confirmed
    while column attribution stays unproven (a self-join's two
    aliases share one table identity but columns cannot be pinned to
    either occurrence)."""

    identifier: StructuredIdentifier | None
    column_attribution_confirmed: bool
    reason: UnconfirmedReason | None = None
    column_reason: UnconfirmedReason | None = None


def _qualifier_compatible(schema_name: str | None, identifier: StructuredIdentifier) -> bool:
    """Whether the runner's rendered schema text is compatible with
    the identifier's qualifier segments. The runner renders a
    qualified name as ``<schema>.<leaf>`` where the schema text is
    the qualifier segments joined — except that it keeps only the
    first two qualifier segments of an over-long name (a four-part
    ``srv.db1.sch1.tbl1`` renders as ``srv.db1.tbl1``), so a longer
    qualifier is compatible when its first two segments render the
    schema text. A placeholder schema is compatible only with a bare
    name or a single quoted ``"<default>"`` qualifier: the runner
    cannot tell those apart, and uniqueness across the query decides."""
    qualifiers = identifier.qualifiers
    if schema_name is None:
        return not qualifiers or (
            len(qualifiers) == 1
            and qualifiers[0].text == DEFAULT_SENTINEL
            and qualifiers[0].quoted
        )
    joined = ".".join(segment.text for segment in qualifiers)
    if joined == schema_name:
        return True
    return len(qualifiers) >= 2 and ".".join(
        segment.text for segment in qualifiers[:2]
    ) == schema_name


def _compatible(descriptor: EndpointDescriptor, name: ExtractedName) -> bool:
    """Whether one extracted occurrence could be the occurrence a
    runner endpoint stands for. Leaf text must match exactly — both
    sides derive from the same SQL text, so folding plays no part
    here. An explicit runner alias pins the occurrence's alias; a
    default alias (equal to the leaf name) pins nothing, because
    endpoint deduplication may have dropped the real alias. The
    occurrence's role must be one of the endpoint's roles. Statement
    scope and occurrence order impose no constraint: the runner
    merges statements and orders endpoints arbitrarily, so neither
    can prove identity, and both are left out rather than trusted."""
    identifier = name.identifier
    if identifier is None:
        return False
    if identifier.leaf.text != descriptor.raw_name:
        return False
    if not _qualifier_compatible(descriptor.schema_name, identifier):
        return False
    if (
        descriptor.alias is not None
        and descriptor.alias != descriptor.raw_name
        and name.alias != descriptor.alias
    ):
        return False
    return name.role in descriptor.roles


def associate_endpoints(
    descriptors: Iterable[EndpointDescriptor], names: Iterable[ExtractedName]
) -> tuple[EndpointAssociation, ...]:
    """Pair runner endpoints with extracted names by structural
    identity alone (design §5.5 as corrected: order only assists, and
    this implementation does not consult order at all — uniqueness
    is the only proof).

    An endpoint confirms exactly when every compatible occurrence
    shares one structured identifier, and no other endpoint claims
    that identifier. Column attribution confirms only on top of a
    confirmed table identity when every occurrence of the identifier
    in the whole extraction carries the same alias — an absent alias
    counts as one value — and the alias pins it: what confirmation
    must establish is the attribution target, which table under
    which alias, not how many times the name occurs, so
    alias-consistent occurrences present a single target and
    confirm (a staging table written once and read once confirms),
    while a self-join's differing aliases still leave every column
    path unconfirmed, because the runner's surviving endpoint
    cannot say which alias a column belonged to. Anything else is
    unconfirmed, with the reason carried for counting — never a
    guess. The result aligns with ``descriptors`` in order.
    """
    descriptor_list = list(descriptors)
    candidates = [
        name
        for name in names
        if name.fidelity_proven and name.role is not NameRole.INTERMEDIATE
    ]
    occurrences: dict[StructuredIdentifier, list[ExtractedName]] = {}
    for name in candidates:
        if name.identifier is not None:
            occurrences.setdefault(name.identifier, []).append(name)
    compatible: list[list[ExtractedName]] = [
        [name for name in candidates if _compatible(descriptor, name)]
        for descriptor in descriptor_list
    ]
    claims: dict[StructuredIdentifier, list[int]] = {}
    claimed: list[StructuredIdentifier | None] = []
    for index, matches in enumerate(compatible):
        distinct = {name.identifier for name in matches}
        distinct.discard(None)
        if len(distinct) == 1:
            identifier = next(iter(distinct))
            claimed.append(identifier)
            claims.setdefault(identifier, []).append(index)
        else:
            claimed.append(None)
    associations: list[EndpointAssociation] = []
    for index, descriptor in enumerate(descriptor_list):
        matches = compatible[index]
        identifier = claimed[index]
        if identifier is None or len(claims[identifier]) > 1:
            reason = (
                UnconfirmedReason.NO_COMPATIBLE_NAME
                if not matches
                else UnconfirmedReason.AMBIGUOUS_IDENTITY
            )
            associations.append(
                EndpointAssociation(
                    identifier=None,
                    column_attribution_confirmed=False,
                    reason=reason,
                    column_reason=reason,
                )
            )
            continue
        occurrence_list = occurrences[identifier]
        # Column attribution is about the target, not the count: a
        # name written once and read once still presents one target
        # when every occurrence carries the same alias, so only
        # differing aliases keep columns unconfirmed. With one
        # alias, any occurrence pins the same way, so the first
        # stands for all.
        # ADR:2026-11-17-dl2c-binding-context
        aliases = {name.alias for name in occurrence_list}
        column_confirmed = len(aliases) == 1 and _alias_pins(
            descriptor, occurrence_list[0]
        )
        associations.append(
            EndpointAssociation(
                identifier=identifier,
                column_attribution_confirmed=column_confirmed,
                column_reason=None
                if column_confirmed
                else UnconfirmedReason.COLUMN_ATTRIBUTION_AMBIGUOUS,
            )
        )
    return tuple(associations)


def _alias_pins(descriptor: EndpointDescriptor, name: ExtractedName) -> bool:
    """Whether the endpoint's alias pins the representative occurrence: an
    aliased occurrence needs the same alias on the endpoint, and an
    unaliased occurrence needs the endpoint to carry no explicit
    alias of its own."""
    if name.alias is not None:
        return descriptor.alias == name.alias
    return descriptor.alias is None or descriptor.alias == descriptor.raw_name


__all__ = [
    "DEFAULT_SENTINEL",
    "EndpointAssociation",
    "EndpointDescriptor",
    "ExtractedName",
    "ExtractionFailureReason",
    "ExtractionResult",
    "IdentifierSegment",
    "NameExtractor",
    "NameRole",
    "StructuredIdentifier",
    "UnconfirmedReason",
    "UnsupportedReason",
    "associate_endpoints",
    "extract_names",
    "normalize_engine_key",
    "register_extractor",
    "registered_branches",
]
