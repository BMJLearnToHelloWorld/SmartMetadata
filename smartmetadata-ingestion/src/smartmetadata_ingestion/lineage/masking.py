# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Query literal masking: replace literal values with a placeholder.

Stored queries must not carry the literal values from the query log —
names, amounts, dates — so masking rewrites every string and number
literal to ``?`` while leaving the rest of the query byte-for-byte
identical, including quoted identifiers. The walk is AST-based, never
regex-based: a literal-looking token inside an identifier or a keyword
is not a literal, and only a real parse can tell the difference.

Two AST stages, both run on the RAW query, never chained: a SqlParse
token walk and a SqlFluff segment walk with the engine dialect. They
are never chained because a masked query does not re-parse — the ``?``
placeholders are not valid literals in most dialects, so feeding one
stage's output to the other loses the second stage entirely. Each
stage reports the character spans its literals occupy; masking applies
spans to the raw text.

For most dialects the stages run in order (SqlParse first, SqlFluff
when the first cannot produce a masked query). For dialects with
dollar-quoted strings — Snowflake, Postgres, Redshift — the stages
run as a UNION: SqlParse is dialect-blind and cannot lex ``$$`` or
``$tag$`` strings at all, while SqlFluff with the engine dialect
lexes them but misses forms SqlParse catches (Snowflake ``DATE``
literals, hex numbers). The union masks everything either stage
recognizes, which neither stage achieves alone.

A masking failure falls back to the clean query — a stored unmasked
query is preferable to dropping the query entirely — and is logged
so the fallback stays visible.
"""

from __future__ import annotations

import logging

from smartmetadata_ingestion.lineage.dialect import Dialect

logger = logging.getLogger(__name__)

# The placeholder is the SQL parameter marker: the masked query stays
# parseable, and no literal value survives in any form.
MASK_PLACEHOLDER = "?"

# SqlFluff leaf segment types that carry literal values. Quoted and
# numeric literals are distinct segment types; identifiers (naked or
# quoted) are neither, so they survive the walk untouched.
_SQLFLUFF_LITERAL_TYPES = frozenset({"quoted_literal", "numeric_literal"})

# Dialects whose strings include dollar-quoted forms (``$$...$$`` and
# ``$tag$...$tag$``) that the dialect-blind SqlParse walk cannot lex.
# Only these dialects pay for the two-stage union; every other dialect
# keeps the single-stage order, whose behavior is already covered.
_DOLLAR_QUOTE_DIALECTS = frozenset(
    {Dialect.SNOWFLAKE, Dialect.POSTGRES, Dialect.REDSHIFT}
)


def _uses_dollar_quotes(dialect: Dialect | str) -> bool:
    """Whether the dialect has dollar-quoted strings (data lookup,
    tolerant of the bare-string spellings callers sometimes pass)."""
    if isinstance(dialect, Dialect):
        return dialect in _DOLLAR_QUOTE_DIALECTS
    try:
        return Dialect(str(dialect).strip().lower()) in _DOLLAR_QUOTE_DIALECTS
    except ValueError:
        return False


def mask_query(query: str, dialect: Dialect | str = Dialect.ANSI) -> str:
    """Return ``query`` with string and number literals replaced by ``?``.

    Falls back to the input unchanged when no AST stage can mask it;
    the fallback is logged at debug level because masking is a
    privacy transform, not a parse gate — the caller decides what a
    failed mask means for storage.
    """
    if not query:
        return query
    if _uses_dollar_quotes(dialect):
        return _mask_with_span_union(query, dialect)
    try:
        masked = _mask_with_sqlparse(query)
    except Exception:
        logger.debug("sqlparse masking failed; trying sqlfluff", exc_info=True)
        masked = None
    if masked is not None:
        return masked
    try:
        masked = _mask_with_sqlfluff(query, dialect)
    except Exception:
        logger.debug("sqlfluff masking failed; keeping clean query", exc_info=True)
        return query
    if masked is None:
        return query
    return masked


def _mask_with_span_union(query: str, dialect: Dialect | str) -> str:
    """Mask with the union of both stages' literal spans.

    Each stage runs on the raw query; a stage that fails contributes
    no spans, and the other stage's spans still apply. Only when both
    stages fail does the query pass through unmasked.
    """
    spans: list[tuple[int, int]] = []
    failures = 0
    for stage_spans in (
        _safe_sqlparse_spans(query),
        _safe_sqlfluff_spans(query, dialect),
    ):
        if stage_spans is None:
            failures += 1
        else:
            spans.extend(stage_spans)
    if failures == 2:
        logger.debug("both masking stages failed; keeping clean query")
        return query
    return _apply_spans(query, spans)


def _safe_sqlparse_spans(query: str) -> list[tuple[int, int]] | None:
    try:
        return _sqlparse_spans(query)
    except Exception:
        logger.debug("sqlparse masking failed", exc_info=True)
        return None


def _safe_sqlfluff_spans(
    query: str, dialect: Dialect | str
) -> list[tuple[int, int]] | None:
    try:
        return _sqlfluff_spans(query, dialect)
    except Exception:
        logger.debug("sqlfluff masking failed", exc_info=True)
        return None


def _apply_spans(query: str, spans: list[tuple[int, int]]) -> str:
    """Replace each span with the placeholder, merging overlaps.

    Overlapping spans come from the two stages recognizing the same
    literal at different widths (a signed number, a prefixed string);
    the merged span masks the widest reading. Spans arrive sorted by
    construction of the merge, and every span lies inside the query
    because each stage verifies its tiling before reporting spans.
    """
    if not spans:
        return query
    merged: list[tuple[int, int]] = []
    for start, end in sorted(spans):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    parts: list[str] = []
    cursor = 0
    for start, end in merged:
        parts.append(query[cursor:start])
        parts.append(MASK_PLACEHOLDER)
        cursor = end
    parts.append(query[cursor:])
    return "".join(parts)


def _mask_with_sqlparse(query: str) -> str | None:
    spans = _sqlparse_spans(query)
    if spans is None:
        return None
    masked = _apply_spans(query, spans)
    # An empty rebuild means the tokenizer consumed the query without
    # producing tokens; treat it as a stage failure, not a masked query.
    return masked if masked else None


def _sqlparse_spans(query: str) -> list[tuple[int, int]] | None:
    """Literal spans from the SqlParse token walk, with offsets.

    Returns ``None`` when the tokenizer produces nothing or its
    tokens do not tile the input — spans placed on a broken tiling
    would corrupt the query, so the stage fails instead.
    """
    try:
        import sqlparse
        from sqlparse import tokens as token_types
    except ImportError:
        logger.warning(
            "sqlparse is unavailable; masking falls back to the sqlfluff stage"
        )
        return None
    statements = sqlparse.parse(query)
    if not statements:
        return None
    spans: list[tuple[int, int]] = []
    offset = 0
    for statement in statements:
        offset = _collect_sqlparse_spans(statement, token_types, spans, offset)
    if offset != len(query):
        return None
    return spans


def _collect_sqlparse_spans(
    token, token_types, spans: list[tuple[int, int]], start: int
) -> int:
    """Walk one token, recording literal spans; returns the offset
    just past the token. Only single-quoted strings and numbers are
    literals. Double-quoted names lex as String.Symbol — identifiers,
    not values — and must survive; NULL/TRUE lex as keywords and
    carry no value either."""
    if token.is_group:
        offset = start
        for child in token.tokens:
            offset = _collect_sqlparse_spans(child, token_types, spans, offset)
        return offset
    token_type = token.ttype
    if token_type in token_types.Literal.Number or (
        token_type in token_types.Literal.String.Single
    ):
        spans.append((start, start + len(token.value)))
    return start + len(token.value)


def _mask_with_sqlfluff(query: str, dialect: Dialect | str) -> str | None:
    spans = _sqlfluff_spans(query, dialect)
    if spans is None:
        return None
    return _apply_spans(query, spans)


def _sqlfluff_spans(query: str, dialect: Dialect | str) -> list[tuple[int, int]] | None:
    """Literal spans from the SqlFluff segment walk, with offsets.

    Returns ``None`` when the tree is missing, partially unparsable
    (a partially unparsable tree cannot place literals reliably),
    empty, or its leaves do not tile the input. The unparsable check
    consumes the crawl: ``recursive_crawl`` returns a generator,
    which is always truthy, so testing it directly would fail every
    query.
    """
    try:
        from sqlfluff.core import Linter
    except ImportError:
        logger.warning("sqlfluff is unavailable; masking cannot run this stage")
        return None
    dialect_name = dialect.value if isinstance(dialect, Dialect) else str(dialect)
    parsed = Linter(dialect=dialect_name).parse_string(query)
    tree = parsed.tree
    if tree is None:
        return None
    if any(tree.recursive_crawl("unparsable")):
        return None
    leaves = [segment for segment in tree.recursive_crawl_all() if not segment.segments]
    if not leaves:
        return None
    spans: list[tuple[int, int]] = []
    offset = 0
    for segment in leaves:
        raw = segment.raw
        if segment.get_type() in _SQLFLUFF_LITERAL_TYPES:
            spans.append((offset, offset + len(raw)))
        offset += len(raw)
    if offset != len(query):
        return None
    return spans
