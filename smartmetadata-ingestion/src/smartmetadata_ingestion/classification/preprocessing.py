# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Sample-value preprocessing for classification (design §2.5).

Values are flattened to strings before any recognizer sees them: nulls
never become the string ``"None"``, binary never reaches a recognizer,
and no case normalization is applied anywhere — recognizers match the
values as sampled. This module is pure text handling with no Presidio
dependency, so the core suite exercises it without the extra. The
date-spelling rule uses the dateutil parser when installed (declared
in the autoclassification extra) and a stdlib emulation otherwise.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)

# The parser the date rules are defined by (supplement §4). Declared in
# the autoclassification extra; the conditional import keeps this module
# importable — and the core suite green — without the extra. When it is
# absent, spells_a_date falls back to the stdlib emulation below and
# warns loudly, once, that the emulation's edges apply.
try:
    from dateutil.parser import parse as _dateutil_parse
except ImportError:  # unprovisioned environment; the extra declares it
    _dateutil_parse = None

_DATEUTIL_FALLBACK_WARNED = False

# Probe defaults for the two-default rule: they differ in every
# component, so a component that agrees across the two parses was
# supplied by the span itself.
_DATE_PROBE_DEFAULTS = (datetime(1900, 1, 1), datetime(2222, 7, 23))

# Strings longer than this are truncated before analysis: a single huge
# value must not dominate the analyzer's time or the explanation.
MAX_VALUE_CHARS = 5000

# Validity gate: content counts as analyzable only when at least one
# string survived AND distinct/total >= this ratio. A column of one
# repeated value carries no signal worth classifying on content.
MIN_DISTINCT_RATIO = 0.01

# Delimiters a column name splits on before camelCase boundaries are
# considered (design §2.7): underscore, dash, space, dot, slash.
_NAME_DELIMITERS = re.compile(r"[_\-\s./]+")

# CamelCase boundary: a lowercase letter immediately followed by an
# uppercase letter ONLY (``userName``). Digit->upper (``field2Name``)
# and acronym->word (``SSNNumber``) are NOT boundaries: the whole
# piece stays one token.
_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z])(?=[A-Z])")

# Month names a date spelling may use, full and abbreviated (the
# parser this emulates also accepts "sept").
_MONTH_NAMES = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

# Weekday names carry no year/month/day information: they are skipped
# when a span is scanned, never counted as a date component.
_WEEKDAY_NAMES = frozenset(
    {
        "mon",
        "monday",
        "tue",
        "tues",
        "tuesday",
        "wed",
        "wednesday",
        "thu",
        "thur",
        "thurs",
        "thursday",
        "fri",
        "friday",
        "sat",
        "saturday",
        "sun",
        "sunday",
    }
)

# Longest-first alternation so "sept" wins over "sep" and "thurs" over
# "thu" when a span is scanned for words.
_DATE_WORDS = "|".join(
    sorted({*_MONTH_NAMES, *_WEEKDAY_NAMES}, key=len, reverse=True)
)
_DATE_TOKEN = re.compile(rf"(?:{_DATE_WORDS})\.?|\d+|[a-z]+", re.IGNORECASE)

# Only these characters may appear between date tokens: separators
# (space, comma, dot, slash, dash). Anything else (letters outside
# month/weekday names, currency signs, stray colons) means the span
# is not a date spelling.
_DATE_SEPARATORS = re.compile(r"^[\s,./\-]*$")

# A trailing time-of-day, which supplies no year/month/day component.
# Matched only at the end of the span so date digits are never eaten.
_TIME_SUFFIX = re.compile(
    r"(?:^|[T ])"
    r"(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?"
    r"\s*([ap]m)?"
    r"\s*(Z|[+-]\d{2}:?\d{2}|UTC|GMT|UT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)?"
    r"\s*$",
    re.IGNORECASE,
)

# Ordinal suffixes on day numbers ("14th", "1st") are spelling noise.
_ORDINAL_SUFFIX = re.compile(r"(\d)(?:st|nd|rd|th)\b", re.IGNORECASE)

# Days per month in a non-leap year, for month+day spellings with no
# year: February 29 with no year is not a date under either probe
# default (1900 and 2222 are both non-leap years).
_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


@dataclass(frozen=True)
class PreparedValues:
    """Flattened column content plus the truncation count.

    ``truncated`` counts values cut to :data:`MAX_VALUE_CHARS`; the
    caller logs one warning per column from it instead of warning per
    value.
    """

    texts: list[str] = field(default_factory=list)
    truncated: int = 0


def prepare_column_values(values: list[Any]) -> PreparedValues:
    """Flatten one column's sample values to analyzable strings.

    Strings pass through (truncated); numbers and dates pass via their
    string form; binary is skipped; sequences and mappings flatten
    recursively (mappings contribute values only); nulls are skipped.
    Everything is stripped and empties dropped. Sample rows arrive
    acyclic (DB drivers / JSON), so the recursion needs no cycle guard.
    """
    texts: list[str] = []
    truncated = 0
    for value in values:
        for text in _flatten_value(value):
            stripped = text.strip()
            if not stripped:
                continue
            if len(stripped) > MAX_VALUE_CHARS:
                stripped = stripped[:MAX_VALUE_CHARS]
                truncated += 1
            texts.append(stripped)
    return PreparedValues(texts=texts, truncated=truncated)


def _flatten_value(value: Any) -> list[str]:
    """One value to zero or more strings, recursively."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (bytes, bytearray)):
        return []
    if isinstance(value, dict):
        flattened: list[str] = []
        for item in value.values():
            flattened.extend(_flatten_value(item))
        return flattened
    if isinstance(value, (list, tuple, set, frozenset)):
        flattened = []
        for item in value:
            flattened.extend(_flatten_value(item))
        return flattened
    # Numbers, dates, and every other scalar take the string form.
    return [str(value)]


def column_content_valid(texts: list[str]) -> bool:
    """Whether flattened content is analyzable (design §2.5 gate)."""
    if not texts:
        return False
    return len(set(texts)) / len(texts) >= MIN_DISTINCT_RATIO


def split_column_name(name: str) -> list[str]:
    """Split a column name into lowercase tokens.

    Delimiters first (``_``, ``-``, space, ``.``, ``/``), then camelCase
    boundaries within each segment. The tokens feed both the Presidio
    context for content analysis and the context-enhancement match.
    """
    tokens: list[str] = []
    for segment in _NAME_DELIMITERS.split(name):
        if not segment:
            continue
        for part in _CAMEL_BOUNDARY.split(segment):
            if part:
                tokens.append(part.lower())
    return tokens


def _warn_dateutil_fallback_once() -> None:
    """Warn, once per process, that the date rules run on the stdlib
    emulation because python-dateutil is not installed. The emulation
    diverges from the parser on known edges (dotted and compact
    spellings); the provisioned path always installs the extra."""
    global _DATEUTIL_FALLBACK_WARNED
    if _DATEUTIL_FALLBACK_WARNED:
        return
    _DATEUTIL_FALLBACK_WARNED = True
    logger.warning(
        "python-dateutil is not installed; date-spelling checks use the "
        "stdlib emulation, whose edges diverge from the dateutil parser "
        "(dotted and compact spellings). Install the autoclassification "
        "extra for the provisioned behavior."
    )


def spells_a_date(span: str) -> bool:
    """Whether a matched span spells a date (the date-patcher rule).

    The rule parses the span twice with the dateutil parser, with two
    probe defaults that differ in every component (1 January 1900 and
    23 July 2222), and requires at least 2 of year/month/day to agree
    across the parses — i.e. the span itself must supply at least two
    components. Either parse raising means the span does not spell a
    date. When python-dateutil is not installed, the stdlib emulation
    below applies instead, with a loud once-per-process warning; the
    emulation diverges from the parser on known edges, so the
    provisioned path always installs the extra.
    """
    if _dateutil_parse is not None:
        return _spells_a_date_with_dateutil(span)
    _warn_dateutil_fallback_once()
    parts = _supplied_date_parts(span)
    return parts is not None and len(parts) >= 2


def _spells_a_date_with_dateutil(span: str) -> bool:
    """The two-default rule against the real parser (supplement §4.2)."""
    try:
        first = _dateutil_parse(span, default=_DATE_PROBE_DEFAULTS[0])
        second = _dateutil_parse(span, default=_DATE_PROBE_DEFAULTS[1])
    except (ValueError, OverflowError):
        return False
    except Exception:
        logger.warning(
            "Unexpected dateutil parse failure for span %r; treating as not-a-date",
            span[:80],
        )
        return False
    agree = sum(
        (
            first.year == second.year,
            first.month == second.month,
            first.day == second.day,
        )
    )
    return agree >= 2


def _supplied_date_parts(span: str) -> set[str] | None:
    """The year/month/day components a span supplies, or None when
    the span is not parseable as a date at all.

    Returns an empty set for spans that parse but supply no date
    component (a bare time, a bare weekday). ``None`` means the
    reference parser would raise: unknown words, impossible values,
    or extra numbers.
    """
    text = span.strip()
    if not text:
        return None
    text = _ORDINAL_SUFFIX.sub(r"\1", text)
    remainder = _strip_time_suffix(text)
    if remainder is None:
        return None
    month, numbers = _scan_date_tokens(remainder)
    if month is None and numbers is None:
        return None
    if month is not None:
        return _parts_with_month_name(month, numbers or [])
    return _parts_numeric(numbers or [])


def _strip_time_suffix(text: str) -> str | None:
    """The span with a trailing time-of-day removed.

    Returns None when the trailing time itself is invalid (an hour
    of 25, say): the reference parser raises on the whole span.
    A span that is only a time yields an empty remainder.
    """
    match = _TIME_SUFFIX.search(text)
    if match is None:
        return text
    hour, minute = int(match.group(1)), int(match.group(2))
    second = int(match.group(3)) if match.group(3) is not None else 0
    if hour > 23 or minute > 59 or second > 59:
        return None
    return text[: match.start()].strip()


def _scan_date_tokens(text: str) -> tuple[int | None, list[int] | None]:
    """Scan a span (time already stripped) into a month and numbers.

    Returns ``(None, None)`` when the span holds an unknown word, a
    second month name, a number longer than four digits, or any
    character outside the separator set: none of those parse.
    """
    month: int | None = None
    numbers: list[int] = []
    position = 0
    for match in _DATE_TOKEN.finditer(text):
        if not _DATE_SEPARATORS.match(text[position : match.start()]):
            return None, None
        position = match.end()
        token = match.group(0).rstrip(".").lower()
        if token.isdigit():
            if len(token) > 4:
                return None, None
            numbers.append(int(token))
        elif token in _MONTH_NAMES:
            if month is not None:
                return None, None
            month = _MONTH_NAMES[token]
        elif token in _WEEKDAY_NAMES:
            continue
        else:
            return None, None
    if not _DATE_SEPARATORS.match(text[position:]):
        return None, None
    return month, numbers


def _parts_with_month_name(month: int, numbers: list[int]) -> set[str] | None:
    """Component assignment when a month name supplies the month."""
    if not numbers:
        return {"month"}
    if len(numbers) == 1:
        value = numbers[0]
        if value == 0:
            return None
        if value > 99:
            # A three- or four-digit number beside a month name is a
            # year ("2018 March", "March 2018").
            return {"month", "year"} if 1 <= value <= 9999 else None
        if 1 <= value <= 31:
            if value > _DAYS_IN_MONTH[month - 1]:
                return None
            return {"month", "day"}
        # A two-digit number too large for a day is a year ("March
        # 99" spells March 1999).
        return {"month", "year"}
    if len(numbers) == 2:
        first, second = numbers
        for day, year in ((first, second), (second, first)):
            full_year = _full_year(year)
            if full_year is not None and _valid_date(full_year, month, day):
                return {"month", "day", "year"}
        return None
    return None


def _parts_numeric(numbers: list[int]) -> set[str] | None:
    """Component assignment for spans with numbers only."""
    if not numbers:
        return set()
    if len(numbers) == 1:
        value = numbers[0]
        if value > 99:
            return {"year"} if 1 <= value <= 9999 else None
        return {"day"} if 1 <= value <= 31 else None
    if len(numbers) == 2:
        first, second = numbers
        # Month+day in either order, validated without a year.
        for month, day in ((first, second), (second, first)):
            if 1 <= month <= 12 and 1 <= day <= _DAYS_IN_MONTH[month - 1]:
                return {"month", "day"}
        # Year+month in either order, with a 3/4-digit year or a
        # 2-digit year beside a valid month ("2018-03", "03-99").
        for year, other in ((first, second), (second, first)):
            if _full_year(year) is not None and 1 <= other <= 12:
                return {"year", "month"}
        return None
    if len(numbers) == 3:
        first, second, third = numbers
        # The year sits first or last (a middle year is not a date
        # spelling); month/day take either order. Every assignment
        # is validated as a real calendar date.
        for year, month, day in (
            (first, second, third),
            (first, third, second),
            (third, first, second),
            (third, second, first),
        ):
            full_year = _full_year(year)
            if full_year is not None and _valid_date(full_year, month, day):
                return {"year", "month", "day"}
        return None
    return None


def _full_year(value: int) -> int | None:
    """A number as a year, or None when it cannot be one.

    Three- and four-digit numbers are literal years. One- and
    two-digit numbers use POSIX windowing (00–68 -> 2000s, 69–99 ->
    1900s), matching the reference parser's century rule for the
    leap-year check: "Feb 29 00" is 29 February 2000, a real date.
    """
    if 100 <= value <= 9999:
        return value
    if 0 <= value <= 99:
        return 2000 + value if value <= 68 else 1900 + value
    return None


def _valid_date(year: int, month: int, day: int) -> bool:
    """Whether year/month/day form a real calendar date."""
    if not 1 <= month <= 12 or not 1 <= day <= 31:
        return False
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def normalize_match_span(span: str) -> str:
    """The corroboration key for a matched span: case-folded with
    whitespace collapsed, so the same value in different cases or
    spacings counts as one distinct match."""
    return " ".join(span.casefold().split())
