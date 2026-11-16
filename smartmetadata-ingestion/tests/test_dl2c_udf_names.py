# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the D-L2c UDF/column entry helpers
(design §5.5 UDF and column-binding entries, contract §g2/§g3,
Leaf B scope).

The heuristic that decides *which* calls are UDF candidates is
pinned verbatim — column-path shape, unchanged — while the names
returned are the extraction's structured identifiers, qualifiers
included. The column helper returns a parent identifier only on a
confirmed table identity plus a confirmed column attribution, and
never falls back to a cleaned string name.
"""

from __future__ import annotations

from smartmetadata_ingestion.lineage import query_lineage as query_lineage_module
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    ExtractedName,
    ExtractionResult,
    NameRole,
    StructuredIdentifier,
    UnsupportedReason,
)
from smartmetadata_ingestion.lineage.parser import LineageParser
from smartmetadata_ingestion.lineage.udf_names import (
    FUNCTION_COLUMN_PATTERN,
    column_parent_identifier,
    udf_names_from_extraction,
)


def _function(
    texts: tuple[str, ...],
    node_index: int,
    *,
    quoted: tuple[bool, ...] | None = None,
    role: NameRole = NameRole.SOURCE,
) -> ExtractedName:
    flags = quoted if quoted is not None else tuple(False for _ in texts)
    return ExtractedName(
        identifier=StructuredIdentifier.from_parts(zip(texts, flags, strict=True)),
        role=role,
        alias=None,
        statement_index=0,
        node_index=node_index,
        is_function=True,
    )


def _table(texts: tuple[str, ...], node_index: int) -> ExtractedName:
    return ExtractedName(
        identifier=StructuredIdentifier.from_parts(
            [(text, False) for text in texts]
        ),
        role=NameRole.SOURCE,
        alias=None,
        statement_index=0,
        node_index=node_index,
    )


def _unsupported_function(node_index: int) -> ExtractedName:
    return ExtractedName(
        identifier=None,
        role=NameRole.SOURCE,
        alias=None,
        statement_index=0,
        node_index=node_index,
        is_function=True,
        unsupported_reason=UnsupportedReason.DYNAMIC_IDENTIFIER,
    )


def test_function_column_pattern_is_verbatim_and_single_definition() -> None:
    # The heuristic's pattern text is unchanged from the definition
    # that lived in query_lineage.py; this module is now its only
    # home, and query_lineage.py imports the same object.
    assert FUNCTION_COLUMN_PATTERN.pattern == r"\A([A-Za-z_][\w$]*)\s*\("
    assert query_lineage_module.FUNCTION_COLUMN_PATTERN is FUNCTION_COLUMN_PATTERN
    assert not hasattr(query_lineage_module, "_FUNCTION_COLUMN")


def test_udf_names_keep_qualifiers_from_extraction() -> None:
    extraction = ExtractionResult(
        names=(
            _function(("my_schema", "my_func"), 0),
            _table(("t",), 1),
        )
    )
    names = udf_names_from_extraction(extraction, ["my_func(x)"])
    assert [name.texts for name in names] == [("my_schema", "my_func")]


def test_udf_names_require_a_heuristic_call_in_column_texts() -> None:
    extraction = ExtractionResult(
        names=(
            _function(("my_func",), 0),
            _function(("other_func",), 1),
        )
    )
    assert udf_names_from_extraction(extraction, ["my_func(x)"]) == [
        StructuredIdentifier.single("my_func")
    ]
    assert udf_names_from_extraction(extraction, []) == []
    assert udf_names_from_extraction(extraction, ["plain_column"]) == []


def test_udf_names_never_synthesize_from_column_texts() -> None:
    # A heuristic call with no matching extraction occurrence yields
    # nothing: the column text names the call, but only the
    # extraction may supply the identifier.
    extraction = ExtractionResult(names=(_table(("t",), 0),))
    assert udf_names_from_extraction(extraction, ["ghost_func(x)"]) == []


def test_udf_names_ignore_table_occurrences_and_unsupported() -> None:
    extraction = ExtractionResult(
        names=(
            _table(("my_func",), 0),
            _unsupported_function(1),
            _function(("my_func",), 2),
        )
    )
    names = udf_names_from_extraction(extraction, ["my_func(x)"])
    assert [name.texts for name in names] == [("my_func",)]


def test_udf_names_skip_intermediate_occurrences() -> None:
    # A function occurrence sharing a CTE's name is INTERMEDIATE:
    # it names a query-local definition, never a catalog function,
    # so it must not reach UDF resolution even when the column-path
    # heuristic names the call. Only binding candidates qualify.
    extraction = ExtractionResult(
        names=(
            _function(("my_func",), 0, role=NameRole.INTERMEDIATE),
            _function(("my_func",), 1),
        )
    )
    names = udf_names_from_extraction(extraction, ["my_func(x)"])
    assert [name.texts for name in names] == [("my_func",)]
    only_intermediate = ExtractionResult(
        names=(_function(("my_func",), 0, role=NameRole.INTERMEDIATE),)
    )
    assert udf_names_from_extraction(only_intermediate, ["my_func(x)"]) == []


def test_udf_names_deduplicate_keeping_first_occurrence_order() -> None:
    extraction = ExtractionResult(
        names=(
            _function(("b_func",), 0),
            _function(("a_func",), 1),
            _function(("b_func",), 2),
        )
    )
    names = udf_names_from_extraction(extraction, ["a_func(x)", "b_func(y)"])
    assert [name.texts for name in names] == [("b_func",), ("a_func",)]


def test_heuristic_shape_is_preserved_verbatim() -> None:
    # A space before the parenthesis still counts (the heuristic
    # allows it); a qualified call in the column text does not name
    # the function, because the heuristic anchors a bare name at
    # the start — exactly as the old string path behaved.
    extraction = ExtractionResult(names=(_function(("my_func",), 0),))
    assert udf_names_from_extraction(extraction, ["my_func (x)"]) == [
        StructuredIdentifier.single("my_func")
    ]
    assert udf_names_from_extraction(extraction, ["sch.my_func(x)"]) == []


def test_column_parent_identifier_returns_confirmed_parent() -> None:
    parser = LineageParser("SELECT a.x FROM sch.tbl AS a", Dialect.POSTGRES)
    (table,) = parser.involved_tables
    identifier = column_parent_identifier(table, parser)
    assert identifier is not None
    assert identifier.texts == ("sch", "tbl")


def test_column_parent_identifier_skips_unconfirmed_columns() -> None:
    # A self-join confirms one table identity but leaves every
    # column's alias unproven: the parent must not be guessed onto
    # either alias.
    parser = LineageParser(
        "SELECT * FROM orders o1 JOIN orders o2 ON o1.id=o2.id", Dialect.POSTGRES
    )
    (table,) = parser.involved_tables
    assert column_parent_identifier(table, parser) is None


def test_column_parent_identifier_returns_none_for_foreign_table() -> None:
    parser = LineageParser("SELECT * FROM sch.tbl", Dialect.POSTGRES)
    foreign = LineageParser("SELECT * FROM elsewhere.tbl", Dialect.POSTGRES)
    assert column_parent_identifier(foreign.involved_tables[0], parser) is None


def test_column_parent_identifier_never_falls_back_to_clean_name() -> None:
    # A quoted dotted name survives whole in the confirmed
    # identifier; a cleaned string name would have split it into
    # three parts, so the segment count itself proves no fallback.
    parser = LineageParser('SELECT * FROM "sales.eu".orders', Dialect.POSTGRES)
    (table,) = parser.involved_tables
    identifier = column_parent_identifier(table, parser)
    assert identifier is not None
    assert identifier.texts == ("sales.eu", "orders")
    assert identifier.segments[0].quoted is True
