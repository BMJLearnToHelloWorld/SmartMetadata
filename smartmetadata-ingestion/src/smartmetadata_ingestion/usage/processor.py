# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage query processor (design §3.4, clean-room to the spec).

Turns raw ``TableQuery`` records from a query-log source into
``ParsedData``: the query parsed once, with the tables it touched, the
joins it implies, and the day it ran on. Queries that touch no tables
contribute nothing downstream and parse to ``None``.

The processor never decides policy: masking, cost, and lifecycle
decisions live in the stage and sink, which read the fields carried
here. Unexpected parser failures raise ``QueryParseFailure`` so the
workflow can record them on the step status instead of silently
dropping the query.
"""

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from ..lineage.dialect import Dialect
from ..lineage.identifiers import StructuredIdentifier
from ..lineage.parser import (
    LINEAGE_PARSING_TIMEOUT,
    LineageParser,
    ParsedTableColumnJoin,
    QueryParserType,
)
from ..records import BindingContext, TableQueryRecord

logger = logging.getLogger(__name__)

# Leading keywords whose statement type is unambiguous from the first
# word alone. WITH is deliberately absent: a CTE body's statement type
# is only known after the CTE list, and guessing SELECT would
# misclassify e.g. WITH ... INSERT. Queries whose type cannot be
# derived carry None and simply yield no lifecycle aspect.
_DERIVABLE_QUERY_TYPES = frozenset(
    {
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "CREATE",
        "DROP",
        "ALTER",
        "MERGE",
        "TRUNCATE",
    }
)

_LEADING_COMMENT = re.compile(r"\A\s*(?:--[^\n]*\n|/\*.*?\*/\s*)+", re.DOTALL)
_LEADING_WORD = re.compile(r"\A([A-Za-z]+)")


class QueryParseFailure(Exception):
    """An unexpected failure parsing one query (not a bad query — the
    parser absorbs those). Raised so the workflow records the failure
    on the step status; never raised for queries that simply touch no
    tables, which parse to ``None``."""


@dataclass(frozen=True)
class ParsedData:
    """One parsed query, shaped per the ``queryParserData`` spec
    schema (``ParsedData``) plus carrier fields the stage needs
    without re-parsing.

    ``tables`` are structured identifiers — only endpoints whose
    association the parser confirmed enter binding; unconfirmed
    endpoints never do. ``joins`` is keyed the same way, with
    parsed (pre-binding) join columns. ``binding_context`` is the
    record's frozen row context, constructed once at this boundary;
    the binding path reads only it, never the retained
    ``database_name``/``database_schema`` fields, which staging
    still reads for the row-context values. ``date`` is the analysis
    day as a millisecond timestamp string. ``masked_sql`` is the
    literal-masked query text and ``query_hash`` the MD5-8 of the
    raw query, both straight from the parser; the stage decides
    which text is stored (masked unless ``exclude_usage``).
    ``unsupported_name_count``/``fidelity_skip_branch`` carry the
    extraction-level counts to the stage, which forwards them into
    the resolver's counters — the parse step has no resolver of its
    own. This type is never serialized: the stage resolves it into
    string-FQN staging records, so the structured form needs no
    round-trip shape.
    """

    tables: list[StructuredIdentifier]
    joins: dict[StructuredIdentifier, list[ParsedTableColumnJoin]]
    database_name: str | None
    database_schema: str | None
    binding_context: BindingContext
    sql: str
    query_type: str | None
    exclude_usage: bool
    dialect: str
    user_name: str | None
    date: str
    service_name: str
    duration: float | None
    cost: float | None
    query_id: str | None = None
    masked_sql: str = ""
    query_hash: str = ""
    parser_name: str | None = None
    unsupported_name_count: int = 0
    fidelity_skip_branch: str | None = None


def _day_start_ms(analysis_date: str | None) -> str:
    """Truncate an ISO analysis timestamp to its UTC day, as a
    millisecond timestamp string. An absent or unparseable value
    falls back to today: the row still ran, and dropping it for a
    malformed timestamp would hide usage."""
    parsed: datetime | None = None
    if analysis_date:
        try:
            parsed = datetime.fromisoformat(analysis_date.replace("Z", "+00:00"))
        except ValueError:
            logger.warning("Unparseable analysis date %r; using today", analysis_date)
    if parsed is None:
        parsed = datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    day_start = parsed.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return str(int(day_start.timestamp() * 1000))


def _derive_query_type(sql: str) -> str | None:
    """The statement type from the leading keyword, for engines whose
    history views do not report one. Comments and whitespace are
    skipped; anything ambiguous yields ``None`` rather than a guess."""
    stripped = sql
    while True:
        match = _LEADING_COMMENT.match(stripped)
        if not match:
            break
        stripped = stripped[match.end() :]
    match = _LEADING_WORD.match(stripped.lstrip())
    if not match:
        return None
    word = match.group(1).upper()
    return word if word in _DERIVABLE_QUERY_TYPES else None


def parse_sql_statement(
    record: TableQueryRecord,
    dialect: Dialect,
    parser_type: QueryParserType,
    timeout_seconds: float = LINEAGE_PARSING_TIMEOUT,
    on_fidelity_skip: Callable[[str], None] | None = None,
) -> ParsedData | None:
    """Parse one query-log record. Returns ``None`` when the parser
    reports no involved tables: the query contributes no counts, no
    joins, and no cost. Unexpected parser errors raise
    ``QueryParseFailure``; malformed queries do not — the parser
    absorbs them into empty views. Table names come from the
    structured extraction via the association verdicts: only
    confirmed endpoints enter binding, sorted by segment texts and
    deduplicated; a failed extraction leaves no tables and marks
    the fidelity skip for the stage to count. When the extraction
    failed and there are no involved tables, ``on_fidelity_skip``
    (if given) is called with the winning branch before returning
    ``None``: with no ``ParsedData`` to carry the count, the
    callback is the only way the usage chain learns of the skip.
    The ``None`` return itself never changes — an empty-table
    ``ParsedData`` would wrongly add a cost record downstream."""
    try:
        parser = LineageParser(
            record.query,
            dialect=dialect,
            timeout_seconds=timeout_seconds,
            parser_type=parser_type,
        )
        involved = parser.involved_tables
        extraction = parser.structured_extraction
        associations = parser.endpoint_associations
        joins = parser.table_joins
    except Exception as exc:
        raise QueryParseFailure(f"failed to parse query {record.label()}") from exc
    if not involved:
        if extraction.failed and on_fidelity_skip is not None:
            on_fidelity_skip(extraction.branch)
        return None
    tables = sorted(
        {
            association.identifier
            for association in associations
            if association.identifier is not None
        },
        key=lambda identifier: identifier.texts,
    )
    return ParsedData(
        tables=tables,
        joins=joins,
        database_name=record.database_name,
        database_schema=record.database_schema,
        binding_context=BindingContext.from_record(record),
        sql=record.query,
        query_type=record.query_type or _derive_query_type(record.query),
        exclude_usage=record.exclude_usage,
        dialect=dialect.value,
        user_name=record.user_name,
        date=_day_start_ms(record.analysis_date),
        service_name=record.service_name,
        duration=record.duration,
        cost=record.cost,
        query_id=record.query_id,
        masked_sql=parser.masked_query,
        query_hash=parser.query_hash,
        parser_name=parser.parser_name,
        unsupported_name_count=len(extraction.unsupported_names),
        fidelity_skip_branch=extraction.branch if extraction.failed else None,
    )
