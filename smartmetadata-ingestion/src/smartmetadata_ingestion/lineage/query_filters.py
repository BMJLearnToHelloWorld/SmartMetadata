# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage DML pre-filters for query-log reads (design §3.3/§3.7).

The pin's lineage sources supply a DML predicate per connector so
the history read returns only statements that can create lineage.
The usage specs carry their own predicates (Snowflake excludes
statement classes that carry no usage signal), so the lineage
channel derives its own spec copy with the DML fragment REPLACING
the usage predicate — the two answer different questions, and ANDing
them would exclude CTAS/COPY rows from lineage reads, which the
reference lineage channel explicitly includes. The registered usage
specs themselves are never modified.

Each fragment is DATA for one engine, authored fresh against that
engine's history template: it references the template's own
query-text column and the engine's case-insensitive comparison, and
matches the statement forms that write a table from a query
(INSERT … SELECT, CREATE … AS SELECT, MERGE, UPDATE … FROM, and
SELECT … INTO where the engine supports it). The fragment is a
pre-filter only — the parser remains the authority, so a false
positive is merely parsed and a statement the fragment misses is
the only real risk, which is why the patterns stay broad
(``INSERT%SELECT`` rather than ``INSERT INTO … SELECT``).

Redshift deliberately has no fragment: its template reads
``STL_QUERYTEXT`` rows, each holding one 200-character chunk of the
statement, and the fragments are applied before the ``LISTAGG``
reassembly — a DML pattern on a chunk would drop statements whose
keywords span chunk boundaries. Redshift lineage reads parse every
row instead.
"""

from __future__ import annotations

from dataclasses import replace

from smartmetadata_ingestion.usage.query_log import QueryLogSpec

# Statement forms that can create lineage, as LIKE patterns over the
# query text. INSERT%SELECT covers INSERT INTO … SELECT and INSERT
# OVERWRITE … SELECT; CREATE%AS%SELECT covers CTAS and CREATE VIEW
# … AS SELECT (including OR REPLACE variants); MERGE%INTO covers
# MERGE INTO … WHEN MATCHED; UPDATE%FROM covers UPDATE … FROM;
# SELECT%INTO%FROM covers SELECT … INTO (T-SQL / Postgres).
_DML_PATTERNS = (
    "%INSERT%SELECT%",
    "%CREATE%AS%SELECT%",
    "%MERGE%INTO%",
    "%UPDATE%FROM%",
)
_SELECT_INTO_PATTERN = "%SELECT%INTO%FROM%"


def _fragment(column_expression: str, *, select_into: bool = False) -> str:
    """An OR of DML patterns over one query-text expression."""
    patterns = list(_DML_PATTERNS)
    if select_into:
        patterns.append(_SELECT_INTO_PATTERN)
    terms = " OR ".join(f"{column_expression} LIKE '{pattern}'" for pattern in patterns)
    return f"({terms})"


def _ilike_fragment(column: str, *, select_into: bool = False) -> str:
    """An OR of DML patterns over one query-text column, ILIKE."""
    patterns = list(_DML_PATTERNS)
    if select_into:
        patterns.append(_SELECT_INTO_PATTERN)
    terms = " OR ".join(f"{column} ILIKE '{pattern}'" for pattern in patterns)
    return f"({terms})"


# Engine key → DML fragment over the engine template's query-text
# column. Postgres-family templates use ILIKE (their column is
# already the comparison target); the rest wrap the column in UPPER
# because their LIKE is collation-sensitive. Keys match the
# registered query-log spec engine keys; an engine absent here
# reads unfiltered (see the module docstring for Redshift).
LINEAGE_DML_FILTERS: dict[str, str] = {
    "postgres": _ilike_fragment("s.query", select_into=True),
    "timescale": _ilike_fragment("s.query", select_into=True),
    "mysql": _fragment("UPPER(e.SQL_TEXT)"),
    "mssql": _fragment("UPPER(t.text)", select_into=True),
    "snowflake": _fragment("UPPER(QUERY_TEXT)"),
    "databricks": _fragment("UPPER(statement_text)"),
    "unitycatalog": _fragment("UPPER(statement_text)"),
}


def lineage_spec_for(spec: QueryLogSpec) -> QueryLogSpec:
    """The query-log spec for the lineage channel: the engine spec
    with its DML fragment REPLACING the usage predicate. The two
    predicates answer different questions — what counts as usage vs
    what can create lineage — so combining them would exclude CTAS
    and COPY rows from lineage reads. A spec copy is returned — the
    registered usage spec is untouched — and an engine with no
    fragment keeps its spec unchanged."""
    fragment = LINEAGE_DML_FILTERS.get(spec.engine_key)
    if not fragment:
        return spec
    return replace(spec, filters=fragment)
