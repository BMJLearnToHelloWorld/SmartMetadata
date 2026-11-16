# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""SqlGlot-branch name extraction: faithful identifiers from the AST.

The analyzer's Table model drops exactly the information binding
needs — middle segments of over-long names, quoted flags, the
difference between a quoted ``"<default>"`` segment and the model's
placeholder — but the sqlglot AST it parsed from keeps all of it.
This extractor re-parses the same cleaned text, in the same dialect,
with sqlglot directly and reads names off ``exp.Table`` / ``exp.Func``
nodes before any lossy conversion. It is used only when the SqlGlot
branch wins the cascade: the names must come from the parse the
runner actually consumed.

Only stable sqlglot surface is used — ``sqlglot.parse``,
``Expression.args``, ``find_all``, and the ``alias`` property — all
verified against sqlglot 29.0.1, the version pinned by
``collate-sqllineage`` 2.1.9 and also present alongside 2.1.8, so the
extractor behaves identically under both. Anything it cannot prove
faithful (a dynamic ``IDENTIFIER()``, an unrecognized node shape)
yields an unsupported occurrence, never a guessed name, and a parse
or walk failure fails the whole extraction: a partially extracted
query must not bind its good half while silently dropping the rest.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import sqlglot
from collate_sqllineage.core.parser.sqlglot.dialects import CollateSnowflake
from sqlglot import exp
from sqlglot.dialects.dialect import DialectType

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

# Statement roots whose ``this`` argument is the written-to table
# (directly, or wrapped in a Schema carrying the column list). The
# write target is found structurally, never by position in the table
# enumeration: find order is not identity.
_WRITE_STATEMENT_TYPES = (exp.Insert, exp.Create, exp.Update, exp.Delete, exp.Merge)

# Snowflake's dynamic table reference. Only a single string-literal
# argument can name a table statically, and only by re-parsing the
# literal's content as identifier text; anything else is dynamic.
_IDENTIFIER_FUNCTION = "IDENTIFIER"

# The cascade winner's dialect resolution, mirrored verbatim. The
# parser hands the product Dialect value to collate's
# SqlGlotLineageAnalyzer, whose __init__
# (collate_sqllineage/core/parser/sqlglot/analyzer.py, an MIT-licensed
# third-party library) resolves the effective dialect by mapping the
# name through DIALECT_MAP and then DIALECT_OVERRIDES before parsing.
# This extractor must parse with that same effective dialect —
# design §5.5's "same dialect, same cleaned SQL" — because sqlglot
# itself rejects some product values outright ("ansi" is not a
# sqlglot dialect) while the winner parses them fine through the
# map. Names the map does not cover pass through unchanged, exactly
# as the winner does: values sqlglot still rejects (impala,
# mariadb, vertica) fail the SqlGlot branch in the cascade too, so
# the extractor is never consulted for them — no invented fallback
# dialect belongs here.
_SQLGLOT_DIALECT_MAP = {
    "ansi": "",
    "sparksql": "spark",
}

_SQLGLOT_DIALECT_OVERRIDES = {
    "snowflake": CollateSnowflake,
}


def effective_sqlglot_dialect(dialect: Dialect) -> DialectType:
    """The sqlglot dialect the cascade winner parses with for one
    product dialect: the mapped name, or the winner's override
    dialect class. This mirrors SqlGlotLineageAnalyzer.__init__'s
    resolution step for step — map first, then the override lookup
    on the mapped name — so the two parses can never disagree on
    dialect."""
    name = getattr(dialect, "value", dialect)
    mapped = _SQLGLOT_DIALECT_MAP.get(name, name)
    return _SQLGLOT_DIALECT_OVERRIDES.get(mapped, mapped)


# The historical private spelling, kept so the existing dialect
# tests keep importing the same object; new code uses the public
# name, and every sqlglot re-parse in the lineage glue goes through
# this one mapping — no second copy of the table.
_effective_sqlglot_dialect = effective_sqlglot_dialect


def extract_sqlglot_names(parse_text: str, dialect: Dialect) -> ExtractionResult:
    """Extract structured names from one query's sqlglot AST.

    ``parse_text`` must be the exact text the cascade winner parsed
    (post-cleaning, post-T-SQL-rewrite): names from any other text
    could disagree with the runner's endpoints. A parse failure, or
    a failure walking any statement, fails the whole extraction.
    """
    sqlglot_dialect = effective_sqlglot_dialect(dialect)
    try:
        statements = sqlglot.parse(parse_text, read=sqlglot_dialect)
    except Exception:
        logger.debug("sqlglot parse failed during name extraction", exc_info=True)
        return ExtractionResult(
            failed=True, failure_reason=ExtractionFailureReason.PARSE_ERROR
        )
    names: list[ExtractedName] = []
    for index, tree in enumerate(statements):
        if tree is None:
            continue
        try:
            names.extend(_StatementWalk(tree, index, sqlglot_dialect).run())
        except Exception:
            logger.debug(
                "name extraction failed for statement %d", index, exc_info=True
            )
            return ExtractionResult(
                failed=True, failure_reason=ExtractionFailureReason.EXTRACTOR_ERROR
            )
    return ExtractionResult(names=tuple(names))


@dataclass
class _NameParts:
    """The outcome of reading one name node: its segments, whether
    it names a function, or the reason no faithful name exists."""

    segments: list[IdentifierSegment] | None
    is_function: bool = False
    reason: UnsupportedReason | None = None


def _identifier_segment(node: Any) -> IdentifierSegment | None:
    if not isinstance(node, exp.Identifier):
        return None
    text = node.args.get("this")
    if not isinstance(text, str) or not text:
        return None
    return IdentifierSegment(text, bool(node.args.get("quoted")))


def _flatten_dotted(node: Any) -> tuple[list[IdentifierSegment], Any] | None:
    """Split a Dot chain into its leading identifier segments and its
    tail node. Dot nests left-deep (``a.b.c.d`` is
    ``Dot(Dot(Dot(a, b), c), d)`` in the tail position of a Table),
    so the spine is walked down the ``this`` side and each
    intermediate node must itself be an identifier; a non-identifier
    anywhere in the spine means the chain cannot be proven to be a
    dotted name."""
    if isinstance(node, exp.Dot):
        flattened = _flatten_dotted(node.args.get("this"))
        if flattened is None:
            return None
        segments, tail = flattened
        tail_segment = _identifier_segment(tail)
        if tail_segment is None:
            return None
        segments.append(tail_segment)
        return segments, node.args.get("expression")
    return [], node


def _dotted_segments(node: Any) -> list[IdentifierSegment] | None:
    """The segments of a pure dotted name (an Identifier or a Dot
    chain ending in one), or None when the node is not one."""
    if isinstance(node, exp.Identifier):
        segment = _identifier_segment(node)
        return [segment] if segment is not None else None
    if isinstance(node, exp.Dot):
        flattened = _flatten_dotted(node)
        if flattened is None:
            return None
        segments, tail = flattened
        tail_segment = _identifier_segment(tail)
        if tail_segment is None:
            return None
        segments.append(tail_segment)
        return segments
    return None


def _func_leaf(func: exp.Func) -> IdentifierSegment | None:
    """A function node's name segment. Anonymous nodes carry the name
    as a string (unquoted) or an Identifier (quoted); modeled
    builtins carry an argument expression instead, which is not a
    name and must not be read as one."""
    leaf = func.args.get("this")
    if isinstance(leaf, exp.Identifier):
        return _identifier_segment(leaf)
    if isinstance(leaf, str) and leaf:
        return IdentifierSegment(leaf, False)
    return None


def _table_alias(table: exp.Table) -> tuple[str | None, bool]:
    alias = table.args.get("alias")
    if alias is None:
        return None, False
    inner = alias.args.get("this")
    if isinstance(inner, exp.Identifier):
        segment = _identifier_segment(inner)
        return (segment.text, segment.quoted) if segment is not None else (None, False)
    if isinstance(inner, str) and inner:
        return inner, False
    return None, False


def _table_parts(
    table: exp.Table, *, sqlglot_dialect: DialectType, allow_identifier: bool
) -> _NameParts:
    """The segments of one Table node: catalog/db qualifiers plus the
    name chain, which may itself be a Dot chain (over-long names) or
    a function call (table functions)."""
    segments: list[IdentifierSegment] = []
    for key in ("catalog", "db"):
        node = table.args.get(key)
        if node is None:
            continue
        part = _dotted_segments(node)
        if part is None:
            return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
        segments.extend(part)
    this = table.args.get("this")
    if this is None:
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    if isinstance(this, exp.Func):
        return _func_parts(
            this,
            prefix=segments,
            sqlglot_dialect=sqlglot_dialect,
            allow_identifier=allow_identifier,
        )
    if isinstance(this, exp.Dot):
        flattened = _flatten_dotted(this)
        if flattened is None:
            return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
        spine, tail = flattened
        tail_segment = _identifier_segment(tail)
        if tail_segment is not None:
            return _NameParts(segments + spine + [tail_segment])
        if isinstance(tail, exp.Func):
            return _func_parts(
                tail,
                prefix=segments + spine,
                sqlglot_dialect=sqlglot_dialect,
                allow_identifier=allow_identifier,
            )
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    part = _dotted_segments(this)
    if part is None:
        return _NameParts(None, reason=UnsupportedReason.NON_IDENTIFIER_NAME)
    return _NameParts(segments + part)


def _func_parts(
    func: exp.Func,
    *,
    prefix: list[IdentifierSegment],
    sqlglot_dialect: DialectType,
    allow_identifier: bool,
) -> _NameParts:
    leaf = _func_leaf(func)
    if leaf is None:
        return _NameParts(
            None, is_function=True, reason=UnsupportedReason.NON_IDENTIFIER_NAME
        )
    if leaf.text.upper() == _IDENTIFIER_FUNCTION:
        # A qualifier plus IDENTIFIER() cannot be combined: the
        # literal names the whole reference, so any qualifier would
        # double-count segments. The combination is unsupported.
        if prefix:
            return _NameParts(
                None, is_function=True, reason=UnsupportedReason.DYNAMIC_IDENTIFIER
            )
        return _identifier_call_parts(
            func, sqlglot_dialect=sqlglot_dialect, allow_identifier=allow_identifier
        )
    return _NameParts(prefix + [leaf], is_function=True)


# Node shapes a bare table reference never contains: clauses and
# joins on the synthesized SELECT, and anything that nests another
# query. A literal whose re-parse holds any of these names more
# than a table, so resolving it would silently drop the rest.
_NON_BARE_NODE_TYPES = (
    exp.Subquery,
    exp.Join,
    exp.Where,
    exp.Group,
    exp.Order,
    exp.Limit,
    exp.Having,
    exp.Qualify,
    exp.Union,
    exp.CTE,
    exp.Lateral,
    exp.Pivot,
)


def _contains_identifier_function(tree: exp.Expression) -> bool:
    """Whether any function node in the tree is IDENTIFIER(): the
    dynamic reference in any position, scalar included. A table
    merely NAMED identifier is a Table node, not a function, so it
    does not trip this check."""
    for func in tree.find_all(exp.Func):
        leaf = _func_leaf(func)
        if leaf is not None and leaf.text.upper() == _IDENTIFIER_FUNCTION:
            return True
    return False


def _is_bare_table_reference(tree: exp.Expression) -> bool:
    """Whether the re-parsed literal is exactly one bare table
    reference: a single SELECT over one FROM table, with no clause,
    join, or nested query attached. The synthesized query is
    ``SELECT * FROM <literal>``, so anything beyond the star, the
    FROM, and the one table came from the literal itself. A table
    alias inside the literal is allowed: it rides on the Table node
    and is dropped by the name reader, like any alias."""
    if not isinstance(tree, exp.Select):
        return False
    if len(list(tree.find_all(exp.Select))) != 1:
        return False
    for node_type in _NON_BARE_NODE_TYPES:
        if any(tree.find_all(node_type)):
            return False
    expressions = tree.args.get("expressions") or []
    if len(expressions) != 1 or not isinstance(expressions[0], exp.Star):
        return False
    # sqlglot names the FROM argument "from_" (FROM is a keyword).
    # A From node holds its first table in "this" and any further
    # comma-separated tables in "expressions": a bare reference has
    # exactly the one, in "this".
    from_node = tree.args.get("from_")
    if not isinstance(from_node, exp.From):
        return False
    first = from_node.args.get("this")
    rest = from_node.args.get("expressions") or []
    return isinstance(first, exp.Table) and not rest


def _identifier_call_parts(
    func: exp.Func, *, sqlglot_dialect: DialectType, allow_identifier: bool
) -> _NameParts:
    """Resolve ``IDENTIFIER('<name>')`` by re-parsing the literal's
    content as identifier text in the same dialect. The literal's
    segment boundaries are only knowable by parsing — splitting the
    string would guess at quoted dots — and the re-parse must yield
    exactly one statement that is a bare table reference (one
    SELECT, one table, no clause, join, or subquery), with no
    IDENTIFIER function anywhere in the tree, scalar positions
    included, or the reference is unsupported. A nested IDENTIFIER
    reports DYNAMIC_IDENTIFIER; any other non-bare shape reports
    UNPARSEABLE_IDENTIFIER_LITERAL."""
    if not allow_identifier:
        return _NameParts(
            None, is_function=True, reason=UnsupportedReason.DYNAMIC_IDENTIFIER
        )
    args = func.args.get("expressions") or []
    if len(args) != 1:
        return _NameParts(
            None, is_function=True, reason=UnsupportedReason.DYNAMIC_IDENTIFIER
        )
    literal = args[0]
    if not isinstance(literal, exp.Literal) or not literal.args.get("is_string"):
        return _NameParts(
            None, is_function=True, reason=UnsupportedReason.DYNAMIC_IDENTIFIER
        )
    content = literal.args.get("this")
    if not isinstance(content, str) or not content.strip():
        return _NameParts(
            None,
            is_function=True,
            reason=UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    try:
        statements = sqlglot.parse(f"SELECT * FROM {content}", read=sqlglot_dialect)
    except Exception:
        return _NameParts(
            None,
            is_function=True,
            reason=UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    trees = [tree for tree in statements if tree is not None]
    if len(trees) != 1:
        return _NameParts(
            None,
            is_function=True,
            reason=UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    tree = trees[0]
    if _contains_identifier_function(tree):
        return _NameParts(
            None, is_function=True, reason=UnsupportedReason.DYNAMIC_IDENTIFIER
        )
    if not _is_bare_table_reference(tree):
        return _NameParts(
            None,
            is_function=True,
            reason=UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    tables = list(tree.find_all(exp.Table))
    if len(tables) != 1:
        return _NameParts(
            None,
            is_function=True,
            reason=UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    parts = _table_parts(tables[0], sqlglot_dialect=sqlglot_dialect, allow_identifier=False)
    if parts.segments is None:
        return _NameParts(
            None,
            is_function=True,
            reason=parts.reason or UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL,
        )
    return parts


def _build_identifier(segments: list[IdentifierSegment]) -> StructuredIdentifier | None:
    """Assemble segments, refusing the empty result. Segments from
    SQL text cannot be the unquoted placeholder, so a dropped-to-empty
    identifier means the AST held something unnameable, not a name."""
    try:
        return StructuredIdentifier.from_segments(segments)
    except ValueError:
        return None


def _outermost_functions(node: Any) -> list[exp.Func]:
    """The function nodes in a table-name subtree that no other
    function in the subtree encloses. Visiting only their arguments
    reaches every nested call exactly once, through recursion, while
    visiting every function node would re-emit each inner name once
    per enclosing call."""
    if isinstance(node, exp.Func):
        return [node]
    if isinstance(node, exp.Expression):
        found: list[exp.Func] = []
        for value in node.args.values():
            found.extend(_outermost_functions(value))
        return found
    if isinstance(node, (list, tuple)):
        found = []
        for item in node:
            found.extend(_outermost_functions(item))
        return found
    return []


class _StatementWalk:
    """One statement's name collection, tracking the two things that
    need statement scope: which Table node is the write target, and
    which names are CTE references (query-local, never catalog
    tables). A name matching a CTE is a reference unless it sits
    inside that same CTE's own definition, where the name still
    means the real table."""

    def __init__(
        self,
        tree: exp.Expression,
        statement_index: int,
        sqlglot_dialect: DialectType,
    ) -> None:
        self._tree = tree
        self._statement_index = statement_index
        self._sqlglot_dialect = sqlglot_dialect
        self._names: list[ExtractedName] = []
        self._counter = 0
        self._target_ids = self._write_target_ids(tree)
        self._cte_names = {cte.alias for cte in tree.find_all(exp.CTE) if cte.alias}

    def run(self) -> list[ExtractedName]:
        self._visit(self._tree, frozenset())
        return self._names

    @staticmethod
    def _write_target_ids(tree: exp.Expression) -> frozenset[int]:
        if not isinstance(tree, _WRITE_STATEMENT_TYPES):
            return frozenset()
        target = tree.args.get("this")
        while isinstance(target, exp.Schema):
            target = target.args.get("this")
        if isinstance(target, exp.Table):
            return frozenset({id(target)})
        return frozenset()

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
        if not isinstance(node, exp.Expression):
            return
        if isinstance(node, exp.CTE):
            alias = node.alias or None
            for key, value in node.args.items():
                scope = (
                    enclosing_ctes | {alias}
                    if key == "this" and alias is not None
                    else enclosing_ctes
                )
                self._visit_value(value, scope)
            return
        if isinstance(node, exp.Table):
            self._visit_table(node, enclosing_ctes)
            return
        if isinstance(node, exp.Dot):
            flattened = _flatten_dotted(node)
            if flattened is not None:
                segments, tail = flattened
                # Only unmodeled (Anonymous) functions are UDF
                # candidates: a modeled builtin under a Dot is still
                # a builtin, so it contributes no name — only its
                # arguments are visited, for nested functions.
                if isinstance(tail, exp.Anonymous):
                    self._visit_scalar_func(tail, segments, enclosing_ctes)
                    self._visit_value(tail.args.get("expressions"), enclosing_ctes)
                    return
            else:
                # The spine cannot be proven to be a name chain, so
                # any function inside it cannot be proven qualified
                # or bare: mark each unsupported rather than emitting
                # a bare name that silently drops a qualifier.
                for _func in node.find_all(exp.Anonymous):
                    self._emit(
                        identifier=None,
                        role=NameRole.SOURCE,
                        alias=None,
                        alias_quoted=False,
                        is_function=True,
                        reason=UnsupportedReason.NON_IDENTIFIER_NAME,
                    )
                return
            self._visit_children(node, enclosing_ctes)
            return
        if isinstance(node, exp.Anonymous):
            self._visit_scalar_func(node, [], enclosing_ctes)
            self._visit_value(node.args.get("expressions"), enclosing_ctes)
            return
        self._visit_children(node, enclosing_ctes)

    def _visit_children(self, node: exp.Expression, enclosing_ctes: frozenset[str]) -> None:
        for value in node.args.values():
            self._visit_value(value, enclosing_ctes)

    def _visit_value(self, value: Any, enclosing_ctes: frozenset[str]) -> None:
        if isinstance(value, exp.Expression):
            self._visit(value, enclosing_ctes)
        elif isinstance(value, (list, tuple)):
            for item in value:
                self._visit_value(item, enclosing_ctes)

    def _visit_table(self, table: exp.Table, enclosing_ctes: frozenset[str]) -> None:
        parts = _table_parts(
            table, sqlglot_dialect=self._sqlglot_dialect, allow_identifier=True
        )
        alias, alias_quoted = _table_alias(table)
        is_target = id(table) in self._target_ids
        identifier = (
            _build_identifier(parts.segments) if parts.segments is not None else None
        )
        if identifier is not None:
            role = NameRole.TARGET if is_target else self._table_role(identifier, enclosing_ctes)
            self._emit(
                identifier=identifier,
                role=role,
                alias=alias,
                alias_quoted=alias_quoted,
                is_function=parts.is_function,
            )
        else:
            self._emit(
                identifier=None,
                role=NameRole.TARGET if is_target else NameRole.SOURCE,
                alias=alias,
                alias_quoted=alias_quoted,
                is_function=parts.is_function,
                reason=parts.reason or UnsupportedReason.NON_IDENTIFIER_NAME,
            )
        # A table function's arguments may hold nested scalar
        # functions; the table name itself is already consumed, so
        # only argument subtrees are visited, never the name node.
        # Only the outermost functions' arguments are visited:
        # nested calls are reached by recursion through the outer
        # call's arguments, exactly once each.
        this = table.args.get("this")
        if isinstance(this, exp.Expression):
            for func in _outermost_functions(this):
                self._visit_value(func.args.get("expressions"), enclosing_ctes)
        for key, value in table.args.items():
            if key not in ("this", "alias", "catalog", "db"):
                self._visit_value(value, enclosing_ctes)

    def _table_role(
        self, identifier: StructuredIdentifier, enclosing_ctes: frozenset[str]
    ) -> NameRole:
        if (
            len(identifier) == 1
            and identifier.leaf.text in self._cte_names
            and identifier.leaf.text not in enclosing_ctes
        ):
            return NameRole.INTERMEDIATE
        return NameRole.SOURCE

    def _visit_scalar_func(
        self,
        func: exp.Func,
        prefix: list[IdentifierSegment],
        enclosing_ctes: frozenset[str],
    ) -> None:
        parts = _func_parts(
            func, prefix=prefix, sqlglot_dialect=self._sqlglot_dialect, allow_identifier=True
        )
        identifier = (
            _build_identifier(parts.segments) if parts.segments is not None else None
        )
        if identifier is not None:
            self._emit(
                identifier=identifier,
                role=NameRole.SOURCE,
                alias=None,
                alias_quoted=False,
                is_function=True,
            )
        else:
            self._emit(
                identifier=None,
                role=NameRole.SOURCE,
                alias=None,
                alias_quoted=False,
                is_function=True,
                reason=parts.reason or UnsupportedReason.NON_IDENTIFIER_NAME,
            )


__all__ = ["effective_sqlglot_dialect", "extract_sqlglot_names"]
