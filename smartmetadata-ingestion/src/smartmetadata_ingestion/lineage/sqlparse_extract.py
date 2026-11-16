# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SqlParse-branch name extraction: faithful identifiers from tokens.

sqlparse groups a dotted name into one ``Identifier`` holding the
name tokens and the dots between them, so segment boundaries survive
— a quoted ``"sales.eu"`` lexes as a single token, and a four-part
name keeps every part — but the grouping is purely lexical: column
references look exactly like table references, and an ``INSERT``
target's column list groups as a function call. This extractor
therefore reads names only in table positions, tracked by a keyword
state machine over the token stream, and only from identifier shapes
it can prove: a leading chain of name tokens separated by dots, an
optional alias, nothing else. Anything else in a table position
yields an unsupported occurrence, never a guessed name.

The dialect argument is accepted and ignored: sqlparse parses
without a dialect, exactly as the cascade's SqlParse analyzer does.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import sqlparse
from sqlparse import tokens as ttypes
from sqlparse.sql import Function, Identifier, IdentifierList, Parenthesis, TokenList

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

# Snowflake's dynamic table reference, as a bare function name. The
# SqlGlot branch resolves only a single string-literal argument by
# re-parsing; the token stream cannot prove the argument's shape
# without guessing at it, so every IDENTIFIER() call is unsupported
# here rather than resolved or bound as a plain function.
_IDENTIFIER_FUNCTION = "IDENTIFIER"


def extract_sqlparse_names(parse_text: str, dialect: Dialect) -> ExtractionResult:
    """Extract structured names from one query's sqlparse tokens.

    ``parse_text`` must be the exact text the cascade winner parsed
    (post-cleaning, post-T-SQL-rewrite): names from any other text
    could disagree with the runner's endpoints. A tokenization or
    walk failure fails the whole extraction.
    """
    del dialect  # sqlparse parses without a dialect, like the analyzer.
    try:
        statements = sqlparse.parse(parse_text)
    except Exception:
        logger.debug("sqlparse failed during name extraction", exc_info=True)
        return ExtractionResult(
            failed=True, failure_reason=ExtractionFailureReason.PARSE_ERROR
        )
    names: list[ExtractedName] = []
    for index, statement in enumerate(statements):
        try:
            names.extend(_StatementWalk(statement, index).run())
        except Exception:
            logger.debug(
                "name extraction failed for statement %d", index, exc_info=True
            )
            return ExtractionResult(
                failed=True, failure_reason=ExtractionFailureReason.EXTRACTOR_ERROR
            )
    return ExtractionResult(names=tuple(names))


def _is_whitespace(token: Any) -> bool:
    return token.ttype in ttypes.Whitespace or token.ttype in ttypes.Comment


def _significant(tokens: Any) -> list[Any]:
    """A token list without whitespace and comments: the state
    machine reads positions, and insignificant tokens must not
    consume a pending table position or break a name chain."""
    return [token for token in tokens if not _is_whitespace(token)]


def _name_segment(token: Any) -> IdentifierSegment | None:
    """One name token as a segment, or None when the token is not a
    name. Quotedness comes from the token type and its wrapper
    characters: double-quoted names lex as string symbols, while
    backtick and bracket names lex as plain names wearing their
    wrappers, so both signals are read."""
    raw = token.value
    if not isinstance(raw, str) or not raw:
        return None
    if token.ttype in ttypes.String.Symbol:
        return IdentifierSegment(_unquote(raw), True)
    if token.ttype in ttypes.Name:
        if _is_wrapped(raw):
            return IdentifierSegment(_unquote(raw), True)
        return IdentifierSegment(raw, False)
    return None


def _is_wrapped(raw: str) -> bool:
    return (
        len(raw) >= 2
        and (
            (raw[0] == '"' and raw[-1] == '"')
            or (raw[0] == "`" and raw[-1] == "`")
            or (raw[0] == "[" and raw[-1] == "]")
        )
    )


def _unquote(raw: str) -> str:
    """A quoted identifier's written text without its quote marks.
    The doubled closer is the escape in all three quote shapes, so
    it is collapsed after stripping the outer marks."""
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        return raw[1:-1].replace('""', '"')
    if len(raw) >= 2 and raw[0] == "`" and raw[-1] == "`":
        return raw[1:-1].replace("``", "`")
    if len(raw) >= 2 and raw[0] == "[" and raw[-1] == "]":
        return raw[1:-1].replace("]]", "]")
    return raw


def _build_identifier(segments: list[IdentifierSegment]) -> StructuredIdentifier | None:
    """Assemble segments, refusing the empty result. Segments from
    SQL text cannot be the unquoted placeholder, so a dropped-to-empty
    identifier means the tokens held something unnameable, not a
    name."""
    try:
        return StructuredIdentifier.from_segments(segments)
    except ValueError:
        return None


class _NameParts:
    """The outcome of reading one name group: its segments, alias,
    whether it names a function, whether it is a derived table with
    no name of its own, or the reason no faithful name exists."""

    __slots__ = ("alias", "alias_quoted", "is_derived", "is_function", "reason", "segments")

    def __init__(
        self,
        segments: list[IdentifierSegment] | None,
        *,
        alias: str | None = None,
        alias_quoted: bool = False,
        is_function: bool = False,
        is_derived: bool = False,
        reason: UnsupportedReason | None = None,
    ) -> None:
        self.segments = segments
        self.alias = alias
        self.alias_quoted = alias_quoted
        self.is_function = is_function
        self.is_derived = is_derived
        self.reason = reason


def _read_alias_tail(
    rest: list[Any],
) -> tuple[str | None, bool, list[Any]] | None:
    """An optional alias after a name chain: an optional AS keyword,
    then one alias identifier holding a single name token, then
    optionally a parenthesized column list (ignored: column lists
    hold no table references). Returns the alias, its quoted flag,
    and the unconsumed remainder; None when the tail is not an alias
    shape at all."""
    index = 0
    if index < len(rest) and rest[index].ttype in ttypes.Keyword and (
        rest[index].normalized == "AS"
    ):
        index += 1
    alias: str | None = None
    alias_quoted = False
    if index < len(rest) and isinstance(rest[index], Identifier):
        alias_tokens = _significant(rest[index].tokens)
        if len(alias_tokens) == 1:
            segment = _name_segment(alias_tokens[0])
            if segment is not None:
                alias, alias_quoted = segment.text, segment.quoted
                index += 1
    if index < len(rest) and isinstance(rest[index], Parenthesis):
        index += 1
    if alias is None and index == 0:
        return None
    return alias, alias_quoted, rest[index:]


def _read_function_name(function: Function) -> _NameParts:
    """A Function group's name: the leading dotted chain before its
    parenthesis. The name may sit in a nested Identifier (a bare
    call) or directly as name tokens (a qualified call's tail), so
    both shapes are read; anything else is unproven."""
    children = _significant(function.tokens)
    segments: list[IdentifierSegment] = []
    index = 0
    expect_name = True
    while index < len(children):
        child = children[index]
        if isinstance(child, Parenthesis):
            break
        if expect_name:
            segment: IdentifierSegment | None = None
            if isinstance(child, Identifier):
                inner = _significant(child.tokens)
                if len(inner) == 1:
                    segment = _name_segment(inner[0])
            else:
                segment = _name_segment(child)
            if segment is None:
                return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
            segments.append(segment)
            expect_name = False
        elif child.ttype in ttypes.Punctuation and child.value == ".":
            expect_name = True
        else:
            return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
        index += 1
    if not segments or expect_name:
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    return _NameParts(segments, is_function=True)


def _read_identifier(identifier: Identifier) -> _NameParts:
    """An Identifier group as a name: a leading dotted chain of name
    tokens, optionally ending in a Function group (a qualified
    function call), optionally followed by an alias. A group that
    starts with a parenthesis is a derived table, not a name: it has
    no identifier of its own, and its inner query is walked
    separately. Any other shape is unproven."""
    children = _significant(identifier.tokens)
    if not children:
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    if isinstance(children[0], Parenthesis):
        return _NameParts(None, is_derived=True)
    segments: list[IdentifierSegment] = []
    index = 0
    expect_name = True
    is_function = False
    while index < len(children):
        child = children[index]
        if isinstance(child, Function):
            if not expect_name:
                return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
            parts = _read_function_name(child)
            if parts.segments is None:
                return parts
            segments.extend(parts.segments)
            is_function = True
            expect_name = False
            index += 1
            break
        if expect_name:
            segment = _name_segment(child)
            if segment is None:
                break
            segments.append(segment)
            expect_name = False
        elif child.ttype in ttypes.Punctuation and child.value == ".":
            expect_name = True
        else:
            break
        index += 1
    if not segments or expect_name:
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    rest = children[index:]
    alias: str | None = None
    alias_quoted = False
    if rest:
        tail = _read_alias_tail(rest)
        if tail is None or tail[2]:
            return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
        alias, alias_quoted, _ = tail
    return _NameParts(
        segments, alias=alias, alias_quoted=alias_quoted, is_function=is_function
    )


def _read_cte_definition(identifier: Identifier) -> tuple[str, Any] | None:
    """A CTE definition's name and body: a single name, an optional
    parenthesized column list, AS, then the parenthesized body. Only
    this exact shape defines a CTE; anything else is an ordinary
    identifier whose parentheses are walked as subqueries."""
    children = _significant(identifier.tokens)
    if len(children) < 3:
        return None
    segment = _name_segment(children[0])
    if segment is None:
        return None
    index = 1
    if isinstance(children[index], Parenthesis):
        index += 1
    if index + 1 >= len(children):
        return None
    if not (
        children[index].ttype in ttypes.Keyword and children[index].normalized == "AS"
    ):
        return None
    index += 1
    # Postgres allows AS [NOT] MATERIALIZED before the body; the
    # materialization hint changes nothing about the name or scope.
    if index < len(children) and children[index].normalized == "NOT":
        index += 1
    if index < len(children) and children[index].normalized == "MATERIALIZED":
        index += 1
    if index >= len(children):
        return None
    body = children[index]
    if not isinstance(body, Parenthesis):
        return None
    return segment.text, body


def _read_cte_header(identifier: Identifier) -> str | None:
    """A CTE definition header without its body: a single name, an
    optional parenthesized column list, AS, then only optional
    NOT/MATERIALIZED keywords. sqlparse splits a MATERIALIZED
    definition so the body parenthesis is a sibling of this group
    (and NOT MATERIALIZED splits the hint itself across the group
    boundary), so the header alone cannot define the CTE — the
    walker pairs it with the following parenthesis. A group that
    already holds its body is not a header; the definition reader
    handles it."""
    children = _significant(identifier.tokens)
    if not children:
        return None
    segment = _name_segment(children[0])
    if segment is None:
        return None
    index = 1
    if index < len(children) and isinstance(children[index], Parenthesis):
        index += 1
    if index >= len(children):
        return None
    if not (
        children[index].ttype in ttypes.Keyword and children[index].normalized == "AS"
    ):
        return None
    index += 1
    while index < len(children):
        child = children[index]
        if child.ttype in ttypes.Keyword and child.normalized in (
            "NOT",
            "MATERIALIZED",
        ):
            index += 1
            continue
        return None
    return segment.text


def _is_identifier_call(parts: _NameParts) -> bool:
    """Whether a read name group is an IDENTIFIER() call: a function
    group whose leaf spells IDENTIFIER. Plain names are excluded by
    the function gate, matching _emit_parts."""
    return (
        parts.is_function
        and parts.segments is not None
        and parts.segments[-1].text.upper() == _IDENTIFIER_FUNCTION
    )


def _is_dot_tail(token: Any) -> bool:
    """Whether a token can only be the tail of a name the lexer
    split: a lone dot, or a dot-leading float literal. sqlparse
    lexes ``.1`` as one Number.Float token, so the dot after a
    truncated name never appears as its own token; a name followed
    by such a token was cut short, and binding its leading part
    would silently drop the rest."""
    if token is None:
        return False
    if token.ttype in ttypes.Punctuation and token.value == ".":
        return True
    raw = token.value
    return (
        isinstance(raw, str)
        and raw.startswith(".")
        and token.ttype in ttypes.Literal
    )


def _is_cut_short(parts: _NameParts, following: Any | None) -> bool:
    """Whether a proven name group was cut short by the token after
    it. Groups that already failed to read stay on their own
    unsupported outcome; only a proven name needs this guard."""
    return parts.segments is not None and _is_dot_tail(following)


def _truncated_parts(parts: _NameParts) -> _NameParts:
    """The unsupported outcome for a name the lexer cut short,
    keeping the group's alias and function shape: only the name
    itself is unproven."""
    return _NameParts(
        None,
        alias=parts.alias,
        alias_quoted=parts.alias_quoted,
        is_function=parts.is_function,
        reason=UnsupportedReason.NON_IDENTIFIER_NAME,
    )


def _following_token(items: list[Any], index: int) -> Any | None:
    """The significant token after ``index``, looking inside a
    following identifier list: ``t.1, u`` lexes as a name plus a
    list starting with the ``.1`` tail, so the tail hides one level
    down."""
    if index + 1 >= len(items):
        return None
    following = items[index + 1]
    if isinstance(following, IdentifierList):
        children = _significant(following.tokens)
        return children[0] if children else None
    return following


class _StatementWalk:
    """One statement's name collection, driven by a keyword state
    machine: only identifiers in table positions become names, and
    only function calls become function names. CTE definitions are
    registered as they are walked (definitions precede uses in
    token order), and a CTE reference inside its own definition
    still means the real table."""

    def __init__(self, statement: Any, statement_index: int) -> None:
        self._statement = statement
        self._statement_index = statement_index
        self._names: list[ExtractedName] = []
        self._counter = 0
        self._cte_names: set[str] = set()
        self._statement_type = statement.get_type() or ""
        # A DELETE statement's first top-level table is its target;
        # subquery tables (inside parentheses) are sources.
        self._delete_target_pending = self._statement_type == "DELETE"

    def run(self) -> list[ExtractedName]:
        self._walk_tokens(self._statement.tokens, depth=0, enclosing_ctes=frozenset())
        return self._names

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

    def _emit_parts(
        self,
        parts: _NameParts,
        *,
        role: NameRole,
        enclosing_ctes: frozenset[str],
    ) -> None:
        """One read name group as an occurrence. A derived table
        emits nothing: it has no name, and its inner query is walked
        by the caller."""
        if parts.is_derived:
            return
        identifier = (
            _build_identifier(parts.segments) if parts.segments is not None else None
        )
        if (
            parts.is_function
            and identifier is not None
            and identifier.leaf.text.upper() == _IDENTIFIER_FUNCTION
        ):
            # A dynamic reference, not a callable name: binding it
            # as a function would name the wrong object entirely.
            # The function gate is what separates the call from a
            # plain table that happens to be named "identifier",
            # which binds like any other name.
            identifier = None
            reason: UnsupportedReason | None = UnsupportedReason.DYNAMIC_IDENTIFIER
        elif identifier is None:
            reason = parts.reason or UnsupportedReason.NON_IDENTIFIER_NAME
        else:
            reason = None
        if identifier is not None and not parts.is_function:
            role = self._table_role(identifier, role, enclosing_ctes)
        self._emit(
            identifier=identifier,
            role=role,
            alias=parts.alias,
            alias_quoted=parts.alias_quoted,
            is_function=parts.is_function,
            reason=reason,
        )

    def _table_role(
        self,
        identifier: StructuredIdentifier,
        role: NameRole,
        enclosing_ctes: frozenset[str],
    ) -> NameRole:
        if role is NameRole.TARGET:
            return role
        if (
            len(identifier) == 1
            and identifier.leaf.text in self._cte_names
            and identifier.leaf.text not in enclosing_ctes
        ):
            return NameRole.INTERMEDIATE
        return NameRole.SOURCE

    def _walk_tokens(
        self,
        tokens: Any,
        *,
        depth: int,
        enclosing_ctes: frozenset[str],
    ) -> None:
        """A token sequence with a pending table role: a table-arming
        keyword arms the next significant token, which either
        consumes the role as a table or clears it by being anything
        else. Groups that are not tables are recursed into with a
        fresh state, so a keyword inside a subquery cannot arm a
        position outside it. A CTE header pairs with the
        parenthesis that follows it (skipping a split NOT /
        MATERIALIZED hint) and the body is walked in the CTE's own
        scope."""
        items = _significant(tokens)
        pending: NameRole | None = None
        index = 0
        while index < len(items):
            token = items[index]
            if pending is not None:
                if self._consume_table_position(
                    token,
                    pending,
                    depth=depth,
                    enclosing_ctes=enclosing_ctes,
                    following=_following_token(items, index),
                ):
                    pending = None
                    index += 1
                    continue
                pending = None
            paired = self._cte_body(items, index)
            if paired is not None:
                header, body_index = paired
                self._cte_names.add(header)
                self._walk_tokens(
                    items[body_index].tokens,
                    depth=depth + 1,
                    enclosing_ctes=enclosing_ctes | {header},
                )
                index = body_index + 1
                continue
            pending = self._handle_token(
                token, depth=depth, enclosing_ctes=enclosing_ctes
            )
            index += 1

    @staticmethod
    def _cte_body(items: list[Any], index: int) -> tuple[str, int] | None:
        """A body-less CTE header at ``index`` paired with its body
        parenthesis: the header name and the body's index, skipping
        a NOT / MATERIALIZED hint split across the group boundary.
        None when the token at ``index`` is not such a header."""
        token = items[index]
        if not isinstance(token, Identifier):
            return None
        header = _read_cte_header(token)
        if header is None:
            return None
        scan = index + 1
        while scan < len(items):
            candidate = items[scan]
            if (
                candidate.ttype in ttypes.Keyword
                and candidate.normalized in ("NOT", "MATERIALIZED")
            ):
                scan += 1
                continue
            break
        if scan < len(items) and isinstance(items[scan], Parenthesis):
            return header, scan
        return None

    def _consume_table_position(
        self,
        token: Any,
        role: NameRole,
        *,
        depth: int,
        enclosing_ctes: frozenset[str],
        following: Any | None = None,
    ) -> bool:
        """Consume one token as the pending table position. Returns
        False when the token is not table-shaped, in which case the
        caller clears the pending role and handles the token
        normally. ``following`` is the next significant token after
        this one in the enclosing sequence: a name followed by a
        dot tail was cut short by the lexer and must not bind."""
        if isinstance(token, IdentifierList):
            elements = [
                element
                for element in _significant(token.tokens)
                if not (
                    element.ttype in ttypes.Punctuation and element.value == ","
                )
            ]
            for position, element in enumerate(elements):
                element_following = (
                    elements[position + 1]
                    if position + 1 < len(elements)
                    else following
                )
                if not self._consume_table_position(
                    element,
                    role,
                    depth=depth,
                    enclosing_ctes=enclosing_ctes,
                    following=element_following,
                ):
                    self._emit(
                        identifier=None,
                        role=role,
                        alias=None,
                        alias_quoted=False,
                        is_function=False,
                        reason=UnsupportedReason.NON_IDENTIFIER_NAME,
                    )
            return True
        if isinstance(token, Identifier):
            self._emit_table_identifier(
                token,
                role,
                depth=depth,
                enclosing_ctes=enclosing_ctes,
                following=following,
            )
            return True
        if isinstance(token, Function):
            self._emit_table_function(
                token,
                role,
                depth=depth,
                enclosing_ctes=enclosing_ctes,
                following=following,
            )
            return True
        if isinstance(token, Parenthesis):
            self._walk_tokens(token.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes)
            return True
        segment = _name_segment(token)
        if segment is not None:
            parts = _NameParts([segment])
            if _is_cut_short(parts, following):
                parts = _truncated_parts(parts)
            self._emit_parts(parts, role=role, enclosing_ctes=enclosing_ctes)
            return True
        if token.ttype in ttypes.Literal:
            # A literal in a table position ("FROM 123", "FROM
            # 'foo'") names no table: it is an unsupported
            # occurrence, not a silent absence.
            self._emit(
                identifier=None,
                role=role,
                alias=None,
                alias_quoted=False,
                is_function=False,
                reason=UnsupportedReason.NON_IDENTIFIER_NAME,
            )
            return True
        return False

    def _emit_table_identifier(
        self,
        identifier: Identifier,
        role: NameRole,
        *,
        depth: int,
        enclosing_ctes: frozenset[str],
        following: Any | None = None,
    ) -> None:
        if role is NameRole.SOURCE and depth == 0 and self._delete_target_pending:
            role = NameRole.TARGET
            self._delete_target_pending = False
        parts = _read_identifier(identifier)
        if parts.is_derived:
            for child in _significant(identifier.tokens):
                if isinstance(child, Parenthesis):
                    self._walk_tokens(
                        child.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes
                    )
            return
        if _is_cut_short(parts, following):
            parts = _truncated_parts(parts)
        self._emit_parts(parts, role=role, enclosing_ctes=enclosing_ctes)
        if parts.is_function:
            self._walk_function_args(identifier, depth, enclosing_ctes)

    def _emit_table_function(
        self,
        function: Function,
        role: NameRole,
        *,
        depth: int,
        enclosing_ctes: frozenset[str],
        following: Any | None = None,
    ) -> None:
        """A Function group in a table position. After INTO it is
        the write target with a column list (sqlparse groups
        ``INSERT INTO t (a, b)`` as a call), so it emits a table
        name and its parenthesis is not walked; after FROM/JOIN it
        is a table function, and its arguments may hold subqueries."""
        parts = _read_function_name(function)
        if _is_cut_short(parts, following):
            self._emit_parts(
                _truncated_parts(parts), role=role, enclosing_ctes=enclosing_ctes
            )
            if role is not NameRole.TARGET:
                self._walk_function_args(function, depth, enclosing_ctes)
            return
        if role is NameRole.TARGET:
            if _is_identifier_call(parts):
                # IDENTIFIER() as a write target is still dynamic:
                # the target conversion below would strip the
                # function gate _emit_parts uses to recognize it.
                self._emit_parts(parts, role=role, enclosing_ctes=enclosing_ctes)
                return
            parts = _NameParts(
                parts.segments,
                alias=parts.alias,
                alias_quoted=parts.alias_quoted,
                is_function=False,
                reason=parts.reason,
            )
            self._emit_parts(parts, role=role, enclosing_ctes=enclosing_ctes)
            return
        self._emit_parts(parts, role=role, enclosing_ctes=enclosing_ctes)
        self._walk_function_args(function, depth, enclosing_ctes)

    def _walk_function_args(
        self, group: TokenList, depth: int, enclosing_ctes: frozenset[str]
    ) -> None:
        for child in _significant(group.tokens):
            if isinstance(child, Parenthesis):
                self._walk_tokens(
                    child.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes
                )
            elif isinstance(child, Function):
                self._walk_function_args(child, depth, enclosing_ctes)

    def _handle_token(
        self, token: Any, *, depth: int, enclosing_ctes: frozenset[str]
    ) -> NameRole | None:
        """Handle one significant token outside a table position.
        Returns the table role the token arms, if any."""
        if token.ttype in ttypes.Keyword or token.ttype in ttypes.Keyword.DML:
            return self._arming_role(token)
        if isinstance(token, Identifier):
            self._handle_identifier(token, depth=depth, enclosing_ctes=enclosing_ctes)
            return None
        if isinstance(token, IdentifierList):
            for element in _significant(token.tokens):
                if element.ttype in ttypes.Punctuation and element.value == ",":
                    continue
                self._handle_token(element, depth=depth, enclosing_ctes=enclosing_ctes)
            return None
        if isinstance(token, Function):
            parts = _read_function_name(token)
            self._emit_parts(
                parts, role=NameRole.SOURCE, enclosing_ctes=enclosing_ctes
            )
            self._walk_function_args(token, depth, enclosing_ctes)
            return None
        if isinstance(token, Parenthesis):
            # A parenthesized subquery nests one level deeper: its
            # tables are never the enclosing statement's target.
            self._walk_tokens(
                token.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes
            )
            return None
        if isinstance(token, TokenList):
            self._walk_tokens(token.tokens, depth=depth, enclosing_ctes=enclosing_ctes)
            return None
        return None

    def _arming_role(self, token: Any) -> NameRole | None:
        """The table role a keyword arms. JOIN matches by suffix,
        covering every join spelling sqlparse groups into one
        keyword token ("LEFT OUTER JOIN", "STRAIGHT_JOIN", ...).
        TABLE/VIEW arm a target only in CREATE statements: in
        DROP/ALTER the named object is not a write target of this
        statement's lineage, and arming it would invent a binding
        position."""
        word = token.normalized
        if word in ("FROM", "USING") or word.endswith("JOIN"):
            return NameRole.SOURCE
        if word == "INTO":
            return NameRole.TARGET
        if word == "UPDATE" and self._statement_type in ("UPDATE", "MERGE"):
            # UPDATE arms a target only in statements that update:
            # an INSERT's ON DUPLICATE KEY UPDATE clause names
            # columns, and arming there would emit a column as a
            # target table.
            return NameRole.TARGET
        if word in ("TABLE", "VIEW") and self._statement_type == "CREATE":
            return NameRole.TARGET
        return None

    def _handle_identifier(
        self, identifier: Identifier, *, depth: int, enclosing_ctes: frozenset[str]
    ) -> None:
        """An identifier outside a table position: a CTE definition
        (registered, body walked in its own scope), a scalar
        function call (emitted, arguments walked), or a column
        reference (no name; parenthesized subqueries walked)."""
        definition = _read_cte_definition(identifier)
        if definition is not None:
            name, body = definition
            self._cte_names.add(name)
            self._walk_tokens(
                body.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes | {name}
            )
            return
        parts = _read_identifier(identifier)
        if parts.is_function and parts.segments is not None:
            self._emit_parts(parts, role=NameRole.SOURCE, enclosing_ctes=enclosing_ctes)
            self._walk_function_args(identifier, depth, enclosing_ctes)
            return
        if parts.is_derived:
            for child in _significant(identifier.tokens):
                if isinstance(child, Parenthesis):
                    self._walk_tokens(
                        child.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes
                    )
            return
        for child in _significant(identifier.tokens):
            if isinstance(child, Parenthesis):
                self._walk_tokens(
                    child.tokens, depth=depth + 1, enclosing_ctes=enclosing_ctes
                )


__all__ = ["extract_sqlparse_names"]
