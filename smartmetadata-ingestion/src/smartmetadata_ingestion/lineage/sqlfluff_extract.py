# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SqlFluff-branch name extraction: faithful identifiers from the parse tree.

The SqlFluff parse tree keeps what the analyzer's Table model drops:
a ``table_reference`` is a sequence of naked/quoted identifier
segments separated by dots, so a quoted ``"sales.eu"`` stays one
segment, a four-part name keeps every part, and a quoted
``"<default>"`` keeps its quoted flag. This extractor re-parses the
same cleaned text, in the same dialect, with sqlfluff directly and
reads names off ``table_reference`` / ``function`` segments. It is
used only when the SqlFluff branch wins the cascade: the names must
come from the parse the runner actually consumed.

Only the stable segment surface is used — ``get_type()``,
``segments``, ``raw``, ``is_meta`` — so the walk does not depend on
dialect-specific segment classes. Anything it cannot prove faithful
yields an unsupported occurrence, never a guessed name, and any
unparsable section fails the whole extraction: a partially parsed
query must not bind its good half while silently dropping the rest.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from sqlfluff.core import Linter

from smartmetadata_ingestion.lineage.identifiers import (
    ExtractedName,
    ExtractionFailureReason,
    ExtractionResult,
    IdentifierSegment,
    NameRole,
    StructuredIdentifier,
    UnsupportedReason,
)

if TYPE_CHECKING:
    from smartmetadata_ingestion.lineage.dialect import Dialect

logger = logging.getLogger(__name__)

# Statement shapes whose first direct table_reference is the written-to
# table. The target is found structurally — the first direct child
# reference of the write statement — never by position in the table
# enumeration: find order is not identity. MERGE needs the "first"
# qualifier: its USING source is a second direct child reference.
# CREATE VIEW belongs here too: the view being created is the first
# direct table_reference in every probed form (OR REPLACE, TEMP,
# qualified name, explicit column list), while the SELECT's source
# tables sit nested inside the select statement, never as direct
# children — so the same rule marks the view TARGET and leaves its
# sources SOURCE. CREATE MATERIALIZED VIEW belongs here on the same
# mechanism: the view being created is the first direct
# table_reference wherever the statement parses (verified across
# all twenty dialects; dialects without the syntax reject the
# statement outright and fail closed), while its sources stay
# nested inside the select statement.
_WRITE_STATEMENT_TYPES = frozenset(
    {
        "insert_statement",
        "update_statement",
        "delete_statement",
        "merge_statement",
        "create_table_statement",
        "create_table_as_statement",
        "create_view_statement",
        "create_materialized_view_statement",
    }
)

# Top-level segments that are not statements: delimiters, the
# end-of-file marker, and the whitespace/newlines/comments between
# statements. Treating an inter-statement gap as a unit would shift
# every later statement's scope index.
_NON_STATEMENT_TYPES = frozenset(
    {
        "statement_terminator",
        "end_of_file",
        "whitespace",
        "newline",
        "comment",
    }
)

# Snowflake's dynamic table reference, as a bare function name. The
# SqlGlot branch resolves only a single string-literal argument by
# re-parsing; this branch cannot prove the argument's shape from the
# sqlfluff tree without guessing at it, so every IDENTIFIER() call is
# unsupported here rather than resolved or bound as a plain function.
_IDENTIFIER_FUNCTION = "IDENTIFIER"


def extract_sqlfluff_names(parse_text: str, dialect: Dialect) -> ExtractionResult:
    """Extract structured names from one query's sqlfluff parse tree.

    ``parse_text`` must be the exact text the cascade winner parsed
    (post-cleaning, post-T-SQL-rewrite): names from any other text
    could disagree with the runner's endpoints. A parse failure, any
    unparsable section, or a failure walking any statement fails the
    whole extraction.
    """
    dialect_name = str(getattr(dialect, "value", dialect))
    try:
        tree = Linter(dialect=dialect_name).parse_string(parse_text).tree
    except Exception:
        logger.debug("sqlfluff parse failed during name extraction", exc_info=True)
        return ExtractionResult(
            failed=True, failure_reason=ExtractionFailureReason.PARSE_ERROR
        )
    if tree is None or _has_unparsable(tree):
        return ExtractionResult(
            failed=True, failure_reason=ExtractionFailureReason.PARSE_ERROR
        )
    names: list[ExtractedName] = []
    try:
        for index, unit in enumerate(_statement_units(tree)):
            names.extend(_StatementWalk(unit, index).run())
    except Exception:
        logger.debug(
            "name extraction failed for the sqlfluff parse tree", exc_info=True
        )
        return ExtractionResult(
            failed=True, failure_reason=ExtractionFailureReason.EXTRACTOR_ERROR
        )
    return ExtractionResult(names=tuple(names))


def _children(segment: Any) -> list[Any]:
    """The segment's real children: meta segments (indent/dedent
    markers) carry no SQL text and must not break the strict
    identifier/dot alternation a reference is read by."""
    return [child for child in segment.segments if not child.is_meta]


def _iter_segments(segment: Any) -> Any:
    yield segment
    for child in _children(segment):
        yield from _iter_segments(child)


def _has_unparsable(tree: Any) -> bool:
    """Whether any part of the text failed to parse. An unparsable
    section may hold a table reference the walk would silently miss,
    so its presence fails the extraction instead of yielding a
    partial name set."""
    return any(node.get_type() == "unparsable" for node in _iter_segments(tree))


def _statement_units(tree: Any) -> list[Any]:
    """The top-level statement units of the file, in order. The file
    root wraps statements directly (most dialects) or in a batch
    (T-SQL); anything else at the top level is treated as its own
    unit so no statement's names are silently dropped."""
    units: list[Any] = []

    def collect(segment: Any) -> None:
        for child in _children(segment):
            if child.get_type() in ("file", "batch"):
                collect(child)
            elif child.get_type() in _NON_STATEMENT_TYPES:
                continue
            else:
                units.append(child)

    collect(tree)
    return units


def _unquote(raw: str) -> str:
    """A quoted identifier's written text without its quote marks.
    The doubled closer is the escape in all three quote shapes, so
    it is collapsed after stripping the outer marks; anything else
    is returned unchanged, because an unrecognized wrapper is the
    caller's problem to reject, not this function's to guess at."""
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        return raw[1:-1].replace('""', '"')
    if len(raw) >= 2 and raw[0] == "`" and raw[-1] == "`":
        return raw[1:-1].replace("``", "`")
    if len(raw) >= 2 and raw[0] == "[" and raw[-1] == "]":
        return raw[1:-1].replace("]]", "]")
    return raw


def _identifier_segment(segment: Any) -> IdentifierSegment | None:
    """One identifier child as a segment, or None when the child is
    not a plain identifier. The quoted flag comes from the segment
    type, never from inspecting the text: a naked identifier that
    happens to spell like a quoted one is still unquoted."""
    segment_type = segment.get_type()
    if segment_type == "naked_identifier":
        return IdentifierSegment(segment.raw, False)
    if segment_type == "quoted_identifier":
        return IdentifierSegment(_unquote(segment.raw), True)
    return None


def _reference_segments(node: Any) -> list[IdentifierSegment] | None:
    """The segments of a table_reference: identifiers strictly
    alternating with dots, starting and ending with an identifier.
    Any other child shape means the reference cannot be proven to
    be a dotted name, so it yields nothing instead of a partial
    name."""
    segments: list[IdentifierSegment] = []
    expect_identifier = True
    for child in _children(node):
        if expect_identifier:
            segment = _identifier_segment(child)
            if segment is None:
                return None
            segments.append(segment)
            expect_identifier = False
        elif child.get_type() == "dot":
            expect_identifier = True
        else:
            return None
    if expect_identifier or not segments:
        return None
    return segments


def _function_name_segments(node: Any) -> list[IdentifierSegment] | None:
    """The segments of a function_name: qualifiers plus the leaf.
    The leaf carries its own segment type
    (``function_name_identifier``) and is always unquoted; a
    qualifier may be naked or quoted. Any other shape is unproven."""
    segments: list[IdentifierSegment] = []
    expect_identifier = True
    for child in _children(node):
        if expect_identifier:
            if child.get_type() == "function_name_identifier":
                segments.append(IdentifierSegment(child.raw, False))
            else:
                segment = _identifier_segment(child)
                if segment is None:
                    return None
                segments.append(segment)
            expect_identifier = False
        elif child.get_type() == "dot":
            expect_identifier = True
        else:
            return None
    if expect_identifier or not segments:
        return None
    return segments


def _build_identifier(segments: list[IdentifierSegment]) -> StructuredIdentifier | None:
    """Assemble segments, refusing the empty result. Segments from
    SQL text cannot be the unquoted placeholder, so a dropped-to-empty
    identifier means the tree held something unnameable, not a name."""
    try:
        return StructuredIdentifier.from_segments(segments)
    except ValueError:
        return None


class _StatementWalk:
    """One statement's name collection, tracking the two things that
    need statement scope: which reference is the write target, and
    which names are CTE references (query-local, never catalog
    tables). A name matching a CTE is a reference unless it sits
    inside that same CTE's own definition, where the name still
    means the real table."""

    def __init__(self, statement: Any, statement_index: int) -> None:
        self._statement = statement
        self._statement_index = statement_index
        self._names: list[ExtractedName] = []
        self._counter = 0
        self._cte_names = self._collect_cte_names(statement)
        self._target_ids = self._write_target_ids(statement)

    def run(self) -> list[ExtractedName]:
        self._visit(self._statement, frozenset())
        return self._names

    @staticmethod
    def _collect_cte_names(statement: Any) -> frozenset[str]:
        """Every CTE name defined in the statement. A CTE whose name
        cannot be read is fatal to the whole extraction: without the
        name, references to it cannot be told apart from real tables
        of the same spelling, and binding one would be a guess."""
        names: set[str] = set()
        for node in _iter_segments(statement):
            if node.get_type() != "common_table_expression":
                continue
            name = _cte_name(node)
            if name is None:
                raise ValueError("a CTE definition has no readable name")
            names.add(name)
        return frozenset(names)

    @staticmethod
    def _write_target_ids(statement: Any) -> frozenset[int]:
        """The identity of each write statement's target reference:
        the first direct table_reference child. Nested references
        (a SELECT inside the write statement) are sources, and a
        MERGE's USING source is a later direct child, so only the
        first direct child qualifies."""
        target_ids: set[int] = set()
        for node in _iter_segments(statement):
            if node.get_type() not in _WRITE_STATEMENT_TYPES:
                continue
            for child in _children(node):
                if child.get_type() == "table_reference":
                    target_ids.add(id(child))
                    break
        return frozenset(target_ids)

    def _emit(
        self,
        *,
        identifier: StructuredIdentifier | None,
        role: NameRole,
        alias: str | None,
        alias_quoted: bool,
        is_function: bool,
        reason: UnsupportedReason | None = None,
    ) -> None:
        self._names.append(
            ExtractedName(
                identifier=identifier,
                role=role,
                alias=alias,
                statement_index=self._statement_index,
                node_index=self._counter,
                alias_quoted=alias_quoted,
                is_function=is_function,
                unsupported_reason=reason,
            )
        )
        self._counter += 1

    def _visit(self, node: Any, enclosing_ctes: frozenset[str]) -> None:
        node_type = node.get_type()
        if node_type == "common_table_expression":
            self._visit_cte(node, enclosing_ctes)
            return
        if node_type == "from_expression_element":
            self._visit_from_element(node, enclosing_ctes)
            return
        if node_type == "table_reference":
            self._emit_table(node, enclosing_ctes, None, False)
            return
        if node_type == "function":
            self._emit_function(node, enclosing_ctes, None, False)
            self._visit_function_contents(node, enclosing_ctes)
            return
        if node_type == "column_reference":
            # Column references are not names: their dotted parts
            # name a qualifier and a column, never a table, and
            # visiting them could only mistake one for a table. The
            # one exception is Snowflake's IDENTIFIER(), which the
            # dialect parses as a column reference holding a
            # bracketed argument: a dynamic reference, unsupported
            # rather than silently absent.
            if _is_dynamic_identifier(node):
                self._emit(
                    identifier=None,
                    role=NameRole.SOURCE,
                    alias=None,
                    alias_quoted=False,
                    is_function=True,
                    reason=UnsupportedReason.DYNAMIC_IDENTIFIER,
                )
            return
        for child in _children(node):
            self._visit(child, enclosing_ctes)

    def _visit_cte(self, node: Any, enclosing_ctes: frozenset[str]) -> None:
        """A CTE definition: its bracketed body is visited with the
        CTE's own name in scope, so a self-reference inside the body
        still means the real table; the name and column list carry
        no table references."""
        name = _cte_name(node)
        scope = enclosing_ctes | {name} if name is not None else enclosing_ctes
        for child in _children(node):
            if child.get_type() == "bracketed":
                self._visit(child, scope)
            else:
                self._visit(child, enclosing_ctes)

    def _visit_from_element(
        self, node: Any, enclosing_ctes: frozenset[str]
    ) -> None:
        """A FROM/JOIN element: its alias belongs to the table or
        table function it directly holds, never to tables nested in
        a subquery it wraps, so the alias is handed only to the
        direct table_expression child."""
        alias, alias_quoted = _element_alias(node)
        for child in _children(node):
            if child.get_type() == "table_expression":
                self._visit_table_expression(
                    child, enclosing_ctes, alias, alias_quoted
                )
            else:
                self._visit(child, enclosing_ctes)

    def _visit_table_expression(
        self,
        node: Any,
        enclosing_ctes: frozenset[str],
        alias: str | None,
        alias_quoted: bool,
    ) -> None:
        for child in _children(node):
            if child.get_type() == "table_reference":
                self._emit_table(child, enclosing_ctes, alias, alias_quoted)
            elif child.get_type() == "function":
                self._emit_function(child, enclosing_ctes, alias, alias_quoted)
                self._visit_function_contents(child, enclosing_ctes)
            else:
                self._visit(child, enclosing_ctes)

    def _visit_function_contents(
        self, node: Any, enclosing_ctes: frozenset[str]
    ) -> None:
        """A function's arguments, which may hold nested functions
        and subqueries with their own tables. The function_name
        itself is never revisited: its parts are the emitted name,
        not further names."""
        for child in _children(node):
            if child.get_type() == "function_contents":
                self._visit(child, enclosing_ctes)

    def _emit_table(
        self,
        node: Any,
        enclosing_ctes: frozenset[str],
        alias: str | None,
        alias_quoted: bool,
    ) -> None:
        if _is_dynamic_identifier(node):
            # Snowflake's IDENTIFIER() in a table position parses
            # as a reference holding a bracketed argument, not as a
            # function: the shape is dynamic either way, so it is
            # unsupported as a function occurrence, never a table.
            self._emit(
                identifier=None,
                role=NameRole.TARGET if id(node) in self._target_ids else NameRole.SOURCE,
                alias=alias,
                alias_quoted=alias_quoted,
                is_function=True,
                reason=UnsupportedReason.DYNAMIC_IDENTIFIER,
            )
            return
        segments = _reference_segments(node)
        identifier = (
            _build_identifier(segments) if segments is not None else None
        )
        role = self._table_role(node, identifier, enclosing_ctes)
        if identifier is not None:
            self._emit(
                identifier=identifier,
                role=role,
                alias=alias,
                alias_quoted=alias_quoted,
                is_function=False,
            )
        else:
            self._emit(
                identifier=None,
                role=role,
                alias=alias,
                alias_quoted=alias_quoted,
                is_function=False,
                reason=UnsupportedReason.NON_IDENTIFIER_NAME,
            )

    def _table_role(
        self,
        node: Any,
        identifier: StructuredIdentifier | None,
        enclosing_ctes: frozenset[str],
    ) -> NameRole:
        if id(node) in self._target_ids:
            return NameRole.TARGET
        if (
            identifier is not None
            and len(identifier) == 1
            and identifier.leaf.text in self._cte_names
            and identifier.leaf.text not in enclosing_ctes
        ):
            return NameRole.INTERMEDIATE
        return NameRole.SOURCE

    def _emit_function(
        self,
        node: Any,
        enclosing_ctes: frozenset[str],
        alias: str | None,
        alias_quoted: bool,
    ) -> None:
        name_node = next(
            (child for child in _children(node) if child.get_type() == "function_name"),
            None,
        )
        segments = (
            _function_name_segments(name_node) if name_node is not None else None
        )
        identifier = (
            _build_identifier(segments) if segments is not None else None
        )
        if identifier is not None and identifier.leaf.text.upper() == _IDENTIFIER_FUNCTION:
            # A dynamic reference, not a callable name: binding it
            # as a function would name the wrong object entirely.
            identifier = None
            reason = UnsupportedReason.DYNAMIC_IDENTIFIER
        elif identifier is None:
            reason = UnsupportedReason.NON_IDENTIFIER_NAME
        else:
            reason = None
        self._emit(
            identifier=identifier,
            role=NameRole.SOURCE,
            alias=alias,
            alias_quoted=alias_quoted,
            is_function=True,
            reason=reason,
        )


def _is_dynamic_identifier(node: Any) -> bool:
    """Whether a reference-shaped segment is Snowflake's
    IDENTIFIER() call: a leading IDENTIFIER keyword plus a
    bracketed argument. The dialect parses the call as a
    table/column reference rather than a function, so the shape is
    recognized structurally instead of by the function-name path."""
    children = _children(node)
    if not children:
        return False
    first = children[0]
    if first.get_type() != "keyword" or first.raw.upper() != _IDENTIFIER_FUNCTION:
        return False
    return any(child.get_type() == "bracketed" for child in children[1:])


def _cte_name(node: Any) -> str | None:
    """A CTE definition's name: its first identifier child, before
    the AS keyword. Only a plain identifier proves the name; any
    other shape leaves the CTE unidentified, which the caller treats
    as fatal rather than guessing."""
    for child in _children(node):
        segment = _identifier_segment(child)
        if segment is not None:
            return segment.text
        if child.get_type() == "keyword":
            break
    return None


def _element_alias(node: Any) -> tuple[str | None, bool]:
    """A FROM/JOIN element's alias: the identifier inside its
    alias_expression child, if any. The alias may itself be quoted,
    and the flag is carried so association can match it exactly."""
    for child in _children(node):
        if child.get_type() != "alias_expression":
            continue
        for part in _children(child):
            segment = _identifier_segment(part)
            if segment is not None:
                return segment.text, segment.quoted
    return None, False


__all__ = ["extract_sqlfluff_names"]
