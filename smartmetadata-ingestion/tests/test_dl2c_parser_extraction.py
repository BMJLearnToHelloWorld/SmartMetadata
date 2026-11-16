# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""LineageParser integration tests for D-L2c structured extraction:
the parser exposes the winning branch's names, associates them with
runner endpoints, keys aliases and joins by structured identifiers,
and fails closed when extraction cannot run (design §5.5, §6 tests
4/13, Leaf A scope).
"""

from __future__ import annotations

import time

import pytest

from smartmetadata_ingestion.lineage import (
    Dialect,
    LineageParser,
    clean_table_name,
    query_parsing_failures,
)
from smartmetadata_ingestion.lineage import identifiers as identifiers_module
from smartmetadata_ingestion.lineage import parser as parser_module
from smartmetadata_ingestion.lineage.identifiers import (
    ExtractedName,
    ExtractionFailureReason,
    ExtractionResult,
    NameRole,
    StructuredIdentifier,
)
from smartmetadata_ingestion.lineage.parser import ParsedTableColumnJoin


@pytest.fixture(autouse=True)
def _clear_failures():
    query_parsing_failures().clear()
    yield
    query_parsing_failures().clear()


def test_parser_exposes_sqlglot_extraction_with_branch() -> None:
    parser = LineageParser(
        "INSERT INTO tgt(x,y) SELECT z.x,a.y FROM z JOIN a ON z.id=a.id",
        Dialect.POSTGRES,
    )
    assert parser.parser_name == "SqlGlot"
    result = parser.structured_extraction
    assert result.failed is False
    assert result.branch == "SqlGlot"
    assert [(n.identifier.texts, n.role) for n in result.names] == [
        (("tgt",), NameRole.TARGET),
        (("z",), NameRole.SOURCE),
        (("a",), NameRole.SOURCE),
    ]


def test_parser_associates_reversed_sources_by_identity_not_order() -> None:
    parser = LineageParser(
        "INSERT INTO tgt(x,y) SELECT z.x,a.y FROM z JOIN a ON z.id=a.id",
        Dialect.POSTGRES,
    )
    involved = [clean_table_name(table) for table in parser.involved_tables]
    assert involved == ["a", "tgt", "z"]
    associations = parser.endpoint_associations
    assert [a.identifier.texts for a in associations] == [("a",), ("tgt",), ("z",)]
    assert all(a.column_attribution_confirmed for a in associations)


def test_parser_self_join_table_once_columns_unconfirmed() -> None:
    parser = LineageParser(
        "SELECT * FROM orders o1 JOIN orders o2 ON o1.id=o2.id", Dialect.POSTGRES
    )
    associations = parser.endpoint_associations
    assert len(associations) == 1
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is False


def test_parser_four_part_name_survives_runner_loss() -> None:
    parser = LineageParser("SELECT * FROM srv.db1.sch1.tbl1", Dialect.TSQL)
    names = parser.structured_extraction.names
    assert [n.identifier.texts for n in names] == [("srv", "db1", "sch1", "tbl1")]
    associations = parser.endpoint_associations
    assert associations[0].identifier.texts == ("srv", "db1", "sch1", "tbl1")
    # The lossy view still drops the middle segment; only the
    # structured extraction keeps it.
    assert parser.clean_table_list == ["srv.db1.tbl1"]


def test_parser_quoted_dot_name_keeps_segments() -> None:
    parser = LineageParser('SELECT * FROM "sales.eu".orders', Dialect.POSTGRES)
    names = parser.structured_extraction.names
    assert names[0].identifier.texts == ("sales.eu", "orders")
    assert names[0].identifier.segments[0].quoted is True


def test_parser_quoted_default_segment_survives() -> None:
    parser = LineageParser('SELECT * FROM "<default>".orders', Dialect.POSTGRES)
    names = parser.structured_extraction.names
    assert names[0].identifier.texts == ("<default>", "orders")
    assert parser.endpoint_associations[0].identifier.texts == ("<default>", "orders")


def test_parser_extraction_uses_rewritten_tsql_text() -> None:
    # The SWITCH rewrite turns the statement into INSERT INTO <target>
    # SELECT * FROM <source>; extraction must see the rewritten text
    # the runner parsed, not the original SWITCH statement (which
    # sqlglot cannot parse as a query at all).
    parser = LineageParser("ALTER TABLE src.tbl SWITCH TO tgt.tbl", Dialect.TSQL)
    assert parser.parser_name == "SqlGlot"
    names = parser.structured_extraction.names
    assert [(n.identifier.texts, n.role) for n in names] == [
        (("tgt", "tbl"), NameRole.TARGET),
        (("src", "tbl"), NameRole.SOURCE),
    ]


def test_parser_unparsed_query_yields_empty_non_failed_extraction() -> None:
    parser = LineageParser("COPY mytable FROM '/tmp/f.csv'", Dialect.ANSI)
    assert parser.parser_name is None
    result = parser.structured_extraction
    assert result.failed is False
    assert result.names == ()
    assert parser.endpoint_associations == ()


def test_parser_extraction_fails_closed_without_registered_extractor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(parser_module, "_ensure_extractors_registered", lambda: None)
    monkeypatch.setattr(identifiers_module, "_EXTRACTORS", {})
    parser = LineageParser("SELECT * FROM orders", Dialect.POSTGRES)
    assert parser.parser_name == "SqlGlot"
    result = parser.structured_extraction
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.NO_EXTRACTOR
    assert result.names == ()
    assert all(a.identifier is None for a in parser.endpoint_associations)


def test_parser_extraction_timeout_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    def _slow(_text: str, _dialect: Dialect) -> ExtractionResult:
        time.sleep(0.5)
        return ExtractionResult()

    monkeypatch.setattr(parser_module, "_ensure_extractors_registered", lambda: None)
    monkeypatch.setattr(identifiers_module, "_EXTRACTORS", {"SqlGlot": _slow})
    parser = LineageParser("SELECT * FROM orders", Dialect.POSTGRES)
    assert parser.parser_name == "SqlGlot"
    # Shrink only the extraction budget after construction: the
    # cascade itself must not race the same tiny timeout.
    parser.timeout_seconds = 0.05
    result = parser.structured_extraction
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.TIMEOUT


def test_parser_table_aliases_use_structured_keys() -> None:
    parser = LineageParser(
        "SELECT * FROM shop.orders o JOIN shop.customers c ON o.cust_id = c.id",
        Dialect.POSTGRES,
    )
    aliases = parser.table_aliases
    assert all(isinstance(key, StructuredIdentifier) for key in aliases)
    assert aliases[StructuredIdentifier.single("o")].raw_name == "orders"
    assert aliases[StructuredIdentifier.single("c")].raw_name == "customers"
    orders_key = StructuredIdentifier.from_parts([("shop", False), ("orders", False)])
    assert aliases[orders_key].raw_name == "orders"
    assert aliases[StructuredIdentifier.single("orders")].raw_name == "orders"


def test_parser_table_aliases_first_wins_on_leaf_collision() -> None:
    parser = LineageParser("SELECT * FROM a.tbl JOIN b.tbl ON TRUE", Dialect.POSTGRES)
    aliases = parser.table_aliases
    leaf = StructuredIdentifier.single("tbl")
    assert clean_table_name(aliases[leaf]) == "a.tbl"


def test_parser_association_for_matches_by_identity() -> None:
    parser = LineageParser(
        "INSERT INTO tgt(x) SELECT x FROM src.tbl", Dialect.POSTGRES
    )
    for table in parser.involved_tables:
        association = parser.association_for(table)
        assert association is not None
        assert association.identifier is not None
    foreign = LineageParser("SELECT * FROM elsewhere.tbl", Dialect.POSTGRES)
    assert parser.association_for(foreign.involved_tables[0]) is None


def test_parser_table_joins_use_structured_keys() -> None:
    parser = LineageParser(
        "SELECT * FROM a.orders o JOIN b.customers c "
        "ON o.cust_id = c.id AND o.region = c.region",
        Dialect.POSTGRES,
    )
    joins = parser.table_joins
    assert all(isinstance(key, StructuredIdentifier) for key in joins)
    orders_key = StructuredIdentifier.from_parts([("a", False), ("orders", False)])
    customers_key = StructuredIdentifier.from_parts([("b", False), ("customers", False)])
    assert sorted(key.texts for key in joins) == [("a", "orders"), ("b", "customers")]
    orders_joins = {
        (
            entry.table_column.column,
            tuple((c.table.texts, c.column) for c in entry.joined_with),
        )
        for entry in joins[orders_key]
    }
    assert ("cust_id", ((("b", "customers"), "id"),)) in orders_joins
    assert ("region", ((("b", "customers"), "region"),)) in orders_joins
    assert all(
        isinstance(entry, ParsedTableColumnJoin)
        for entries in joins.values()
        for entry in entries
    )
    assert joins[customers_key]


def test_parser_table_joins_skip_ambiguous_qualifiers() -> None:
    names = parser_module.extract_sqlglot_names(
        "SELECT * FROM a.tbl JOIN b.tbl ON TRUE", Dialect.POSTGRES
    ).names
    qualifier_map = parser_module._structured_qualifier_map(names)
    # Both tables share the leaf qualifier "tbl": the text resolves
    # to two identifiers, so it resolves to nothing.
    assert "tbl" not in qualifier_map
    assert qualifier_map["a.tbl"].texts == ("a", "tbl")
    assert qualifier_map["b.tbl"].texts == ("b", "tbl")


def test_parser_table_joins_under_ansi_use_winner_dialect() -> None:
    # "ansi" is not a sqlglot dialect: the join re-parse must use
    # the winner's effective dialect (the default, ""), exactly as
    # the name extraction does, or ANSI queries silently lose every
    # join while their names extract fine.
    parser = LineageParser(
        "SELECT * FROM a.orders o JOIN b.customers c "
        "ON o.cust_id = c.id AND o.region = c.region",
        Dialect.ANSI,
    )
    assert parser.parser_name == "SqlGlot"
    joins = parser.table_joins
    assert sorted(key.texts for key in joins) == [("a", "orders"), ("b", "customers")]
    orders_key = StructuredIdentifier.from_parts([("a", False), ("orders", False)])
    customers_key = StructuredIdentifier.from_parts(
        [("b", False), ("customers", False)]
    )
    orders_joins = {
        (
            entry.table_column.column,
            tuple((c.table.texts, c.column) for c in entry.joined_with),
        )
        for entry in joins[orders_key]
    }
    assert ("cust_id", ((("b", "customers"), "id"),)) in orders_joins
    assert ("region", ((("b", "customers"), "region"),)) in orders_joins
    assert joins[customers_key]


@pytest.mark.parametrize(
    "dialect", [Dialect.IMPALA, Dialect.MARIADB, Dialect.VERTICA]
)
def test_parser_table_joins_empty_for_passthrough_dialects(dialect: Dialect) -> None:
    # Unchanged by the dialect-mapping fix: these values pass
    # through the winner's map unchanged and sqlglot still rejects
    # them, so the name extraction fails first and the join step
    # returns {} before ever re-parsing. No joins are invented
    # under a dialect the winner never parsed with.
    parser = LineageParser(
        "SELECT * FROM a.orders o JOIN b.customers c ON o.cust_id = c.id",
        dialect,
    )
    assert parser.table_joins == {}


def test_parser_qualifier_map_excludes_intermediate_and_keeps_functions() -> None:
    # Only binding candidates resolve qualifiers: a CTE occurrence
    # names no catalog table, so neither its name nor its alias may
    # resolve a join qualifier. Function occurrences are retained
    # deliberately — a qualifier can only match a leaf or alias
    # text, so a function name resolves exactly the qualifiers that
    # spell it.
    names = (
        ExtractedName(
            identifier=StructuredIdentifier.single("cte"),
            role=NameRole.INTERMEDIATE,
            alias="c",
            statement_index=0,
            node_index=0,
        ),
        ExtractedName(
            identifier=StructuredIdentifier.from_parts(
                [("sch", False), ("my_func", False)]
            ),
            role=NameRole.SOURCE,
            alias="f",
            statement_index=0,
            node_index=1,
            is_function=True,
        ),
        ExtractedName(
            identifier=StructuredIdentifier.single("t"),
            role=NameRole.SOURCE,
            alias=None,
            statement_index=0,
            node_index=2,
        ),
    )
    qualifier_map = parser_module._structured_qualifier_map(names)
    assert "cte" not in qualifier_map
    assert "c" not in qualifier_map
    assert qualifier_map["my_func"].texts == ("sch", "my_func")
    assert qualifier_map["sch.my_func"].texts == ("sch", "my_func")
    assert qualifier_map["f"].texts == ("sch", "my_func")
    assert qualifier_map["t"].texts == ("t",)


def test_parser_table_joins_skip_cte_qualifiers() -> None:
    # A join pair against a CTE reference is never built: the CTE
    # qualifier is excluded from the qualifier map, so the pair is
    # skipped at the parser, not merely dropped downstream when its
    # partner fails to bind.
    parser = LineageParser(
        "WITH cte AS (SELECT * FROM real_t) "
        "SELECT * FROM cte JOIN t ON cte.id = t.id",
        Dialect.POSTGRES,
    )
    assert parser.table_joins == {}


def test_parser_table_joins_empty_when_unparseable() -> None:
    parser = LineageParser("COPY mytable FROM '/tmp/f.csv'", Dialect.ANSI)
    assert parser.table_joins == {}


def test_clean_table_name_display_behavior_unchanged() -> None:
    parser = LineageParser('SELECT * FROM "MySchema"."Orders" o', Dialect.POSTGRES)
    assert parser.clean_table_list == ["MySchema.Orders"]
    assert clean_table_name(parser.involved_tables[0]) == "MySchema.Orders"


def test_parser_mysql_backtick_extraction() -> None:
    parser = LineageParser("SELECT * FROM `sales.eu`.orders", Dialect.MYSQL)
    names = parser.structured_extraction.names
    assert names[0].identifier.texts == ("sales.eu", "orders")
    assert names[0].identifier.segments[0].quoted is True
