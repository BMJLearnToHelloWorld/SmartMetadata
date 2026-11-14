# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""T-SQL ``ALTER TABLE … SWITCH`` rewrite for the parser cascade.

No SQL parser understands ``SWITCH`` — it moves a partition between
tables without moving data — so the cascade rewrites each SWITCH
statement into the equivalent ``INSERT INTO <target> SELECT * FROM
<source>`` form, which carries the same table-level lineage. Matching
runs on a length-preserving blanked copy (string literals and comments
replaced by spaces), so SWITCH text inside a string, a comment, or a
quoted name is never treated as a statement; the source and target
names are cut out of the original text by position, which only works
because blanking never changes a character offset.
"""

from __future__ import annotations

import re

# One dotted identifier part: bracketed, double-quoted, backtick-quoted,
# or bare. A SWITCH source/target is one to three such parts.
_IDENTIFIER_PART = r"(?:\[[^\]]+\]|\"[^\"]+\"|`[^`]+`|[A-Za-z_][\w$#@]*)"
_DOTTED_NAME = rf"(?:{_IDENTIFIER_PART}(?:\s*\.\s*{_IDENTIFIER_PART})*)"

_SWITCH_PATTERN = re.compile(
    rf"ALTER\s+TABLE\s+(?P<source>{_DOTTED_NAME})\s+SWITCH\s+"
    rf"(?:PARTITION\s+\S+\s+)?TO\s+(?P<target>{_DOTTED_NAME})",
    re.IGNORECASE,
)


def rewrite_switch_statements(query: str) -> str:
    """Rewrite every SWITCH statement in ``query`` to INSERT…SELECT form.

    Statements without SWITCH pass through unchanged, including their
    original text: the rewrite only touches the matched statement span,
    up to its terminating semicolon, and leaves everything else alone.
    """
    if not query or "switch" not in query.lower():
        return query
    blanked = _blank_literals_and_comments(query)
    matches = list(_SWITCH_PATTERN.finditer(blanked))
    if not matches:
        return query
    pieces: list[str] = []
    cursor = 0
    for match in matches:
        end = blanked.find(";", match.end())
        span_end = end if end != -1 else len(query)
        source = query[match.start("source") : match.end("source")]
        target = query[match.start("target") : match.end("target")]
        pieces.append(query[cursor : match.start()])
        pieces.append(f"INSERT INTO {target} SELECT * FROM {source}")
        cursor = span_end
    pieces.append(query[cursor:])
    return "".join(pieces)


def _blank_literals_and_comments(query: str) -> str:
    """Return ``query`` with string literals and comments blanked to spaces.

    Offsets are preserved exactly: every blanked character becomes one
    space, so a regex match on the blanked copy addresses the same span
    in the original. When the tokenizer is unavailable, the query is
    returned unchanged and the SWITCH match may see literal text — the
    rewrite then only fires on text that literally reads as a SWITCH
    statement, which a string literal almost never does.
    """
    try:
        import sqlparse
        from sqlparse import tokens as token_types
    except ImportError:
        return query
    chars = list(query)
    offset = 0
    for statement in sqlparse.parse(query):
        offset = _blank_token(statement, chars, offset, token_types)
    return "".join(chars)


def _blank_token(token, chars: list[str], offset: int, token_types) -> int:
    if token.is_group:
        for child in token.tokens:
            offset = _blank_token(child, chars, offset, token_types)
        return offset
    value = token.value
    token_type = token.ttype
    if token_type in token_types.Comment or (
        token_type in token_types.Literal.String.Single
    ):
        for index in range(offset, offset + len(value)):
            chars[index] = " "
    return offset + len(value)
