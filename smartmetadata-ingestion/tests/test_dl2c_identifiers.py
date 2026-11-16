# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for D-L2c structured identifiers, folding, the
SqlGlot extractor matrix, and the association rules (design §5.5,
§5.5b, §6 tests 4/6/13, Leaf A scope).

The extraction matrix is the fidelity proof: every case that the
string path used to corrupt — quoted dots, four-part names, quoted
"<default>", dynamic IDENTIFIER() — must come back as distinct
structured identifiers, or as explicitly unsupported occurrences,
never as a guessed string.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.folding import (
    FOLDING_TABLE,
    FoldRule,
    fallback_eligible,
    fold_identifier,
    fold_segment,
    folding_rule,
)
from smartmetadata_ingestion.lineage.identifiers import (
    DEFAULT_SENTINEL,
    EndpointAssociation,
    EndpointDescriptor,
    ExtractedName,
    ExtractionFailureReason,
    ExtractionResult,
    IdentifierSegment,
    NameRole,
    StructuredIdentifier,
    UnconfirmedReason,
    UnsupportedReason,
    associate_endpoints,
    extract_names,
    normalize_engine_key,
    register_extractor,
)
from smartmetadata_ingestion.lineage.sqlglot_extract import extract_sqlglot_names

# --- IdentifierSegment / StructuredIdentifier -------------------------------


def test_segment_identity_ignores_fold_provenance() -> None:
    folded = IdentifierSegment("orders", False, "Orders")
    plain = IdentifierSegment("orders", False)
    assert folded == plain
    assert hash(folded) == hash(plain)
    assert folded.pre_fold_text == "Orders"
    assert plain.pre_fold_text == "orders"


def test_segment_quoted_flag_participates_in_identity() -> None:
    assert IdentifierSegment("orders", True) != IdentifierSegment("orders", False)
    assert hash(IdentifierSegment("orders", True)) != hash(IdentifierSegment("orders", False))


def test_segment_rejects_empty_text() -> None:
    with pytest.raises(ValueError):
        IdentifierSegment("")


def test_identifier_is_frozen_and_hashable() -> None:
    identifier = StructuredIdentifier.single("orders")
    with pytest.raises(FrozenInstanceError):
        identifier.segments = ()  # type: ignore[assignment]
    assert {identifier: "bound"}[StructuredIdentifier.single("orders")] == "bound"


def test_identifier_constructors_agree() -> None:
    expected = StructuredIdentifier.from_parts([("sales", False), ("orders", False)])
    assert StructuredIdentifier.from_segments(expected.segments) == expected
    assert expected.texts == ("sales", "orders")
    assert expected.leaf == IdentifierSegment("orders", False)
    assert expected.qualifiers == (IdentifierSegment("sales", False),)
    assert len(expected) == 2


def test_unquoted_default_sentinel_is_dropped_at_construction() -> None:
    identifier = StructuredIdentifier.from_parts(
        [(DEFAULT_SENTINEL, False), ("orders", False)]
    )
    assert identifier.texts == ("orders",)


def test_quoted_default_segment_is_a_real_name() -> None:
    identifier = StructuredIdentifier.from_parts([(DEFAULT_SENTINEL, True), ("orders", False)])
    assert identifier.texts == (DEFAULT_SENTINEL, "orders")
    assert identifier.segments[0].quoted is True


def test_identifier_rejects_empty_and_sentinel_only() -> None:
    with pytest.raises(ValueError):
        StructuredIdentifier(())
    with pytest.raises(ValueError):
        StructuredIdentifier.single(DEFAULT_SENTINEL)


def test_display_requotes_dotted_segments_and_never_splits() -> None:
    identifier = StructuredIdentifier.from_parts([("sales.eu", True), ("orders", False)])
    assert identifier.display() == '"sales.eu".orders'
    three_parts = StructuredIdentifier.from_parts(
        [("sales", False), ("eu", False), ("orders", False)]
    )
    assert three_parts != identifier


def test_normalize_engine_key() -> None:
    assert normalize_engine_key("PostgreSQL") == "postgresql"
    assert normalize_engine_key("TimescaleDB") == "timescaledb"
    assert normalize_engine_key("  My-SQL_2 ") == "mysql2"
    assert normalize_engine_key(None) == ""
    assert normalize_engine_key("") == ""


# --- Folding (§5.5b) --------------------------------------------------------


def test_folding_table_covers_design_rows() -> None:
    assert FOLDING_TABLE["postgres"].unquoted is FoldRule.LOWER
    assert FOLDING_TABLE["postgres"].quoted is FoldRule.PRESERVE
    assert FOLDING_TABLE["snowflake"].unquoted is FoldRule.UPPER
    assert FOLDING_TABLE["snowflake"].quoted is FoldRule.PRESERVE
    assert FOLDING_TABLE["redshift"].unquoted is FoldRule.LOWER
    assert FOLDING_TABLE["redshift"].quoted is FoldRule.UNKNOWN
    assert FOLDING_TABLE["postgresql"] == FOLDING_TABLE["postgres"]
    assert FOLDING_TABLE["timescaledb"] == FOLDING_TABLE["timescale"]
    assert FOLDING_TABLE["greenplum"] == FOLDING_TABLE["postgres"]


def test_unknown_engines_do_not_fold() -> None:
    engines: tuple[str | None, ...] = (
        "mysql",
        "mariadb",
        "doris",
        "mssql",
        "databricks",
        "unitycatalog",
        "trino",
        None,
        "",
    )
    for engine in engines:
        assert folding_rule(engine, quoted=False) is FoldRule.UNKNOWN
        assert folding_rule(engine, quoted=True) is FoldRule.UNKNOWN


def test_fold_pg_unquoted_orders_to_lowercase() -> None:
    identifier = StructuredIdentifier.from_parts([("Orders", False)])
    folded = fold_identifier(identifier, "postgres")
    assert folded.texts == ("orders",)
    assert folded.segments[0].pre_fold_text == "Orders"
    assert folded.segments[0].quoted is False
    # The folded name matches the catalog spelling; the written
    # spelling no longer exact-matches a quoted mixed-case object.
    assert folded == StructuredIdentifier.from_parts([("orders", False)])
    assert folded != StructuredIdentifier.from_parts([("Orders", True)])


def test_fold_snowflake_unquoted_to_uppercase() -> None:
    identifier = StructuredIdentifier.from_parts([("sales", False), ("orders", False)])
    assert fold_identifier(identifier, "snowflake").texts == ("SALES", "ORDERS")


def test_fold_never_touches_quoted_segments_on_pg_and_snowflake() -> None:
    identifier = StructuredIdentifier.from_parts([("Orders", True)])
    assert fold_identifier(identifier, "postgres") == identifier
    assert fold_identifier(identifier, "snowflake") == identifier


def test_fold_redshift_quoted_keeps_written_spelling() -> None:
    identifier = StructuredIdentifier.from_parts([("Orders", True), ("Line", False)])
    folded = fold_identifier(identifier, "redshift")
    assert folded.texts == ("Orders", "line")


def test_fold_unknown_engine_is_identity() -> None:
    identifier = StructuredIdentifier.from_parts([("Orders", False), ("Mixed", True)])
    assert fold_identifier(identifier, "mysql") == identifier
    assert fold_identifier(identifier, None) == identifier


def test_fold_segment_keeps_original_only_when_changed() -> None:
    assert fold_segment(IdentifierSegment("orders", False), "postgres").original is None
    folded = fold_segment(IdentifierSegment("Orders", False), "postgres")
    assert folded.text == "orders"
    assert folded.original == "Orders"


def test_fallback_eligibility_follows_quoted_rule() -> None:
    quoted = StructuredIdentifier.from_parts([("Orders", True)])
    unquoted = StructuredIdentifier.from_parts([("Orders", False)])
    assert fallback_eligible(quoted, "postgres") is False
    assert fallback_eligible(quoted, "snowflake") is False
    assert fallback_eligible(quoted, "redshift") is True
    assert fallback_eligible(quoted, "mysql") is True
    assert fallback_eligible(unquoted, "postgres") is True
    mixed = StructuredIdentifier.from_parts([("sales", False), ("Orders", True)])
    assert fallback_eligible(mixed, "postgres") is False
    assert fallback_eligible(mixed, "redshift") is True


# --- Extractor registry / dispatcher ---------------------------------------


def test_dispatch_without_extractor_fails_closed() -> None:
    result = extract_names("NoSuchBranch", "SELECT * FROM orders", Dialect.POSTGRES)
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.NO_EXTRACTOR
    assert result.names == ()
    assert result.branch == "NoSuchBranch"


def test_dispatch_converts_extractor_errors_to_failure() -> None:
    def _boom(_text: str, _dialect: Dialect) -> ExtractionResult:
        raise RuntimeError("boom")

    register_extractor("BoomBranch", _boom)
    result = extract_names("BoomBranch", "SELECT * FROM orders", Dialect.POSTGRES)
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.EXTRACTOR_ERROR


def test_dispatch_stamps_the_registry_branch() -> None:
    def _empty(_text: str, _dialect: Dialect) -> ExtractionResult:
        return ExtractionResult(branch="wrong")

    register_extractor("StampBranch", _empty)
    result = extract_names("StampBranch", "SELECT * FROM orders", Dialect.POSTGRES)
    assert result.branch == "StampBranch"
    assert result.failed is False


def test_extraction_result_invariants() -> None:
    with pytest.raises(ValueError):
        ExtractionResult(failed=True)
    with pytest.raises(ValueError):
        ExtractionResult(failure_reason=ExtractionFailureReason.PARSE_ERROR)


def test_extracted_name_needs_identifier_or_reason() -> None:
    with pytest.raises(ValueError):
        ExtractedName(
            identifier=None,
            role=NameRole.SOURCE,
            alias=None,
            statement_index=0,
            node_index=0,
        )
    with pytest.raises(ValueError):
        ExtractedName(
            identifier=StructuredIdentifier.single("orders"),
            role=NameRole.SOURCE,
            alias=None,
            statement_index=0,
            node_index=0,
            unsupported_reason=UnsupportedReason.DYNAMIC_IDENTIFIER,
        )


# --- SqlGlot extraction matrix (§6 test 4) ----------------------------------


def _extract(sql: str, dialect: Dialect = Dialect.POSTGRES) -> ExtractionResult:
    return extract_sqlglot_names(sql, dialect)


def _names(result: ExtractionResult) -> list[ExtractedName]:
    assert result.failed is False, result.failure_reason
    return list(result.names)


def test_extract_bare_and_qualified_names() -> None:
    names = _names(_extract("SELECT * FROM orders"))
    assert [n.identifier.texts for n in names] == [("orders",)]
    names = _names(_extract("SELECT * FROM sales.orders"))
    assert [n.identifier.texts for n in names] == [("sales", "orders")]
    names = _names(_extract("SELECT * FROM db.sales.orders"))
    assert [n.identifier.texts for n in names] == [("db", "sales", "orders")]


def test_extract_four_and_five_part_names_keep_every_segment() -> None:
    names = _names(_extract("SELECT * FROM srv.db.sch.tbl", Dialect.TSQL))
    assert [n.identifier.texts for n in names] == [("srv", "db", "sch", "tbl")]
    names = _names(_extract("SELECT * FROM a.b.c.d.e"))
    assert [n.identifier.texts for n in names] == [("a", "b", "c", "d", "e")]


def test_extract_quoted_dot_differs_from_three_parts() -> None:
    quoted = _names(_extract('SELECT * FROM "sales.eu".orders'))
    plain = _names(_extract("SELECT * FROM sales.eu.orders"))
    assert len(quoted) == 1 and len(plain) == 1
    assert quoted[0].identifier.texts == ("sales.eu", "orders")
    assert quoted[0].identifier.segments[0].quoted is True
    assert plain[0].identifier.texts == ("sales", "eu", "orders")
    assert quoted[0].identifier != plain[0].identifier


def test_extract_mysql_backtick_quoted_dot() -> None:
    names = _names(_extract("SELECT * FROM `sales.eu`.orders", Dialect.MYSQL))
    assert names[0].identifier.texts == ("sales.eu", "orders")
    assert names[0].identifier.segments[0].quoted is True


def test_extract_tsql_bracket_names_are_quoted() -> None:
    names = _names(_extract("SELECT * FROM [my db].[dbo].[orders]", Dialect.TSQL))
    assert names[0].identifier.texts == ("my db", "dbo", "orders")
    assert all(segment.quoted for segment in names[0].identifier.segments)


def test_extract_quoted_default_segment_survives() -> None:
    names = _names(_extract('SELECT * FROM "<default>".orders'))
    assert names[0].identifier.texts == ("<default>", "orders")
    assert names[0].identifier.segments[0].quoted is True
    assert names[0].fidelity_proven is True


def test_extract_aliases_carry_text_and_quoted_flag() -> None:
    names = _names(_extract("SELECT * FROM shop.orders o JOIN shop.customers c ON TRUE"))
    by_leaf = {n.identifier.leaf.text: n for n in names}
    assert by_leaf["orders"].alias == "o"
    assert by_leaf["orders"].alias_quoted is False
    assert by_leaf["customers"].alias == "c"
    quoted = _names(_extract('SELECT * FROM tbl AS "Quoted"'))
    assert quoted[0].alias == "Quoted"
    assert quoted[0].alias_quoted is True


def test_extract_roles_insert_create_update_delete_merge() -> None:
    insert = _names(_extract("INSERT INTO tgt SELECT * FROM src.tbl"))
    assert [(n.identifier.texts, n.role) for n in insert] == [
        (("tgt",), NameRole.TARGET),
        (("src", "tbl"), NameRole.SOURCE),
    ]
    insert_cols = _names(_extract("INSERT INTO tgt(x, y) SELECT * FROM z"))
    assert insert_cols[0].role is NameRole.TARGET
    create = _names(_extract("CREATE TABLE tgt AS SELECT * FROM src.tbl"))
    assert create[0].role is NameRole.TARGET
    update = _names(_extract("UPDATE tgt SET x = 1 FROM src.tbl WHERE TRUE"))
    assert update[0].role is NameRole.TARGET
    delete = _names(_extract("DELETE FROM tgt USING src.tbl WHERE TRUE"))
    assert delete[0].role is NameRole.TARGET
    merge = _names(
        _extract(
            "MERGE INTO tgt USING src.tbl ON tgt.id = src.tbl.id "
            "WHEN MATCHED THEN UPDATE SET x = 1",
            Dialect.SNOWFLAKE,
        )
    )
    assert merge[0].role is NameRole.TARGET
    assert merge[1].role is NameRole.SOURCE


def test_extract_same_table_source_and_target() -> None:
    names = _names(_extract("INSERT INTO t SELECT * FROM t"))
    assert [(n.identifier.texts, n.role) for n in names] == [
        (("t",), NameRole.TARGET),
        (("t",), NameRole.SOURCE),
    ]


def test_extract_multi_statement_scope() -> None:
    names = _names(_extract("SELECT * FROM sales.orders; SELECT * FROM other.tbl"))
    assert [(n.identifier.texts, n.statement_index) for n in names] == [
        (("sales", "orders"), 0),
        (("other", "tbl"), 1),
    ]


def test_extract_subquery_and_union_tables_are_sources() -> None:
    names = _names(_extract("SELECT * FROM x.tbl WHERE y IN (SELECT z FROM q.tbl2)"))
    assert [(n.identifier.texts, n.role) for n in names] == [
        (("x", "tbl"), NameRole.SOURCE),
        (("q", "tbl2"), NameRole.SOURCE),
    ]
    names = _names(_extract("SELECT * FROM a.tbl1 UNION ALL SELECT * FROM b.tbl2"))
    assert [n.role for n in names] == [NameRole.SOURCE, NameRole.SOURCE]


def test_extract_cte_references_are_intermediate_not_candidates() -> None:
    names = _names(_extract("WITH tmp AS (SELECT * FROM base.tbl) SELECT * FROM tmp"))
    by_text = {n.identifier.texts: n for n in names}
    assert by_text[("base", "tbl")].role is NameRole.SOURCE
    assert by_text[("base", "tbl")].is_binding_candidate is True
    assert by_text[("tmp",)].role is NameRole.INTERMEDIATE
    assert by_text[("tmp",)].is_binding_candidate is False


def test_extract_cte_name_inside_own_definition_is_a_real_table() -> None:
    names = _names(_extract("WITH x AS (SELECT * FROM x) SELECT * FROM x"))
    # One occurrence is the real table inside the CTE's own
    # definition, the other the CTE reference outside it. Visit
    # order is not part of the contract, so the roles are compared
    # as a set: exactly one SOURCE and one INTERMEDIATE.
    assert sorted(n.role for n in names) == [NameRole.INTERMEDIATE, NameRole.SOURCE]


def test_extract_table_functions() -> None:
    names = _names(_extract("SELECT * FROM sch.my_func(a) AS t"))
    assert len(names) == 1
    assert names[0].identifier.texts == ("sch", "my_func")
    assert names[0].is_function is True
    assert names[0].alias == "t"
    quoted = _names(_extract('SELECT * FROM sch."MyFunc"(1)'))
    assert quoted[0].identifier.texts == ("sch", "MyFunc")
    assert quoted[0].identifier.leaf.quoted is True
    four = _names(_extract("SELECT * FROM srv.db.sch.f(1)"))
    assert four[0].identifier.texts == ("srv", "db", "sch", "f")
    assert four[0].is_function is True


def test_extract_scalar_functions_qualified_and_nested() -> None:
    names = _names(_extract("SELECT sch.myfunc(1), myfunc2(2) FROM t"))
    funcs = [n for n in names if n.is_function]
    assert [n.identifier.texts for n in funcs] == [("sch", "myfunc"), ("myfunc2",)]
    nested = _names(_extract("SELECT COALESCE(f(x), 1) FROM t"))
    funcs = [n for n in nested if n.is_function]
    assert [n.identifier.texts for n in funcs] == [("f",)]
    quoted = _names(_extract('SELECT "sch"."MyFunc"(1) FROM t'))
    funcs = [n for n in quoted if n.is_function]
    assert funcs[0].identifier.texts == ("sch", "MyFunc")
    assert funcs[0].identifier.leaf.quoted is True


def test_extract_builtins_are_not_function_candidates() -> None:
    names = _names(_extract("SELECT COUNT(*), SUM(x) FROM t"))
    assert [n.is_function for n in names] == [False]
    assert names[0].identifier.texts == ("t",)


def test_extract_identifier_literal_reparses_segments() -> None:
    names = _names(
        _extract("SELECT * FROM IDENTIFIER('sales.orders')", Dialect.SNOWFLAKE)
    )
    assert len(names) == 1
    assert names[0].identifier.texts == ("sales", "orders")
    assert names[0].fidelity_proven is True
    quoted = _names(
        _extract("SELECT * FROM IDENTIFIER('\"sales.eu\".orders')", Dialect.SNOWFLAKE)
    )
    assert quoted[0].identifier.texts == ("sales.eu", "orders")
    assert quoted[0].identifier.segments[0].quoted is True


def test_extract_identifier_dynamic_forms_are_unsupported() -> None:
    for sql in (
        "SELECT * FROM IDENTIFIER($tbl)",
        "SELECT * FROM IDENTIFIER('a' || 'b')",
        "SELECT * FROM IDENTIFIER('orders', 'extra')",
        "SELECT * FROM IDENTIFIER('')",
        "SELECT * FROM IDENTIFIER('orders JOIN other')",
        "SELECT * FROM IDENTIFIER('orders; SELECT * FROM x')",
        "SELECT * FROM IDENTIFIER('IDENTIFIER(''orders'')')",
    ):
        result = _extract(sql, Dialect.SNOWFLAKE)
        assert result.failed is False, sql
        assert len(result.names) == 1, sql
        name = result.names[0]
        assert name.identifier is None, sql
        assert name.unsupported_reason is not None, sql
        assert name.fidelity_proven is False, sql


def test_extract_identifier_with_qualifier_is_unsupported() -> None:
    names = _names(_extract("SELECT * FROM db.IDENTIFIER('x')", Dialect.SNOWFLAKE))
    assert len(names) == 1
    assert names[0].identifier is None
    assert names[0].unsupported_reason is UnsupportedReason.DYNAMIC_IDENTIFIER


def test_extract_identifier_literal_with_extra_structure_is_unsupported() -> None:
    # The re-parse must yield a bare table reference: a literal
    # carrying a clause, a join, or a subquery names more than a
    # table, and resolving it would silently drop the rest. Each
    # shape below reports UNPARSEABLE_IDENTIFIER_LITERAL.
    for sql in (
        "SELECT * FROM IDENTIFIER('orders WHERE x = 1')",
        "SELECT * FROM IDENTIFIER('(SELECT * FROM orders)')",
        "SELECT * FROM IDENTIFIER('orders LIMIT 1')",
        "SELECT * FROM IDENTIFIER('orders GROUP BY x')",
        "SELECT * FROM IDENTIFIER('orders ORDER BY x')",
        "SELECT * FROM IDENTIFIER('orders HAVING x > 1')",
        "SELECT * FROM IDENTIFIER('orders PIVOT (SUM(x) FOR y IN (1, 2))')",
    ):
        result = _extract(sql, Dialect.SNOWFLAKE)
        assert result.failed is False, sql
        assert len(result.names) == 1, sql
        (name,) = result.names
        assert name.identifier is None, sql
        assert name.is_function is True, sql
        assert name.fidelity_proven is False, sql
        assert (
            name.unsupported_reason
            is UnsupportedReason.UNPARSEABLE_IDENTIFIER_LITERAL
        ), sql


def test_extract_identifier_literal_with_scalar_nested_identifier_is_unsupported() -> None:
    # A nested IDENTIFIER in a scalar position must be found too:
    # the whole re-parsed tree is swept for IDENTIFIER functions,
    # not just the table node. The sweep runs before the
    # bare-reference check, so the nested dynamic reference names
    # the reason even though a WHERE clause is also present.
    result = _extract(
        "SELECT * FROM IDENTIFIER('t WHERE y = IDENTIFIER(''zzz'')')",
        Dialect.SNOWFLAKE,
    )
    assert result.failed is False
    assert len(result.names) == 1
    (name,) = result.names
    assert name.identifier is None
    assert name.is_function is True
    assert name.fidelity_proven is False
    assert name.unsupported_reason is UnsupportedReason.DYNAMIC_IDENTIFIER


def test_extract_identifier_literal_alias_is_dropped() -> None:
    # Locked trade-off, not a defect: an alias inside the literal
    # is accepted and discarded — it belongs to the literal's own
    # re-parse, not to the outer occurrence. An alias on the outer
    # IDENTIFIER() call still wins, as for any other table.
    names = _names(
        _extract("SELECT * FROM IDENTIFIER('orders AS o')", Dialect.SNOWFLAKE)
    )
    assert len(names) == 1
    assert names[0].identifier.texts == ("orders",)
    assert names[0].alias is None
    assert names[0].fidelity_proven is True
    outer = _names(
        _extract(
            "SELECT * FROM IDENTIFIER('orders AS o') AS q", Dialect.SNOWFLAKE
        )
    )
    assert outer[0].identifier.texts == ("orders",)
    assert outer[0].alias == "q"


def test_extract_nested_table_functions_emit_each_name_once() -> None:
    # A nested call chain emits each function name exactly once:
    # only the outermost call's arguments are visited, and nested
    # calls are reached by recursion through them.
    names = _names(_extract("SELECT * FROM f(g(h()))"))
    assert [n.identifier.texts for n in names] == [("f",), ("g",), ("h",)]
    assert all(n.is_function for n in names)
    siblings = _names(_extract("SELECT * FROM f(g(x), h(y))"))
    assert [n.identifier.texts for n in siblings] == [("f",), ("g",), ("h",)]
    qualified = _names(_extract("SELECT * FROM sch.f(g(h()))"))
    assert [n.identifier.texts for n in qualified] == [
        ("sch", "f"),
        ("g",),
        ("h",),
    ]


def test_extract_non_identifier_name_paths() -> None:
    # NON_IDENTIFIER_NAME locks for the SqlGlot branch: a modeled
    # builtin in a table position has no name leaf to read, a
    # dotted table shape can end in a non-identifier tail, and a
    # function inside an unprovable dotted spine cannot be proven
    # qualified or bare. Each yields an unsupported occurrence,
    # never a guessed name, and the query's other names survive.
    for sql in ("SELECT * FROM COUNT(*)", "SELECT * FROM SUM(x)"):
        result = _extract(sql)
        assert result.failed is False, sql
        assert len(result.names) == 1, sql
        (name,) = result.names
        assert name.identifier is None, sql
        assert name.is_function is True, sql
        assert name.unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME, sql
    dotted = _names(_extract("SELECT * FROM f(1).g"))
    assert len(dotted) == 1
    assert dotted[0].identifier is None
    assert dotted[0].unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME
    spine = _names(_extract("SELECT (1).f(x) FROM t"))
    assert [n.identifier.texts if n.identifier else None for n in spine] == [
        None,
        ("t",),
    ]
    assert spine[0].unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME
    assert spine[0].is_function is True
    assert spine[1].fidelity_proven is True


def test_extract_parse_failure_fails_whole_extraction() -> None:
    result = _extract("SELECT * FROM")
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
    assert result.names == ()


def test_extract_empty_and_comment_only_yield_no_names() -> None:
    assert _extract("").names == ()
    assert _extract("   -- only a comment").names == ()
    assert _extract("").failed is False


def test_extract_call_statement_yields_no_table_names() -> None:
    # CALL is Leaf B's entry (regex/AST in procedure_lineage); the
    # table extractor must not invent a table name from it.
    result = _extract("CALL srv.db.sch.proc()")
    assert result.failed is False
    assert result.table_names == ()


# --- Association rules (§5.5 corrected, §0b) --------------------------------


def _name(
    texts: tuple[str, ...],
    role: NameRole = NameRole.SOURCE,
    alias: str | None = None,
    statement_index: int = 0,
    node_index: int = 0,
    *,
    quoted: tuple[bool, ...] | None = None,
) -> ExtractedName:
    flags = quoted if quoted is not None else tuple(False for _ in texts)
    return ExtractedName(
        identifier=StructuredIdentifier.from_parts(list(zip(texts, flags, strict=True))),
        role=role,
        alias=alias,
        statement_index=statement_index,
        node_index=node_index,
    )


def _descriptor(
    raw_name: str,
    schema_name: str | None = None,
    alias: str | None = None,
    roles: frozenset[NameRole] = frozenset({NameRole.SOURCE}),
) -> EndpointDescriptor:
    return EndpointDescriptor(
        raw_name=raw_name, schema_name=schema_name, alias=alias, roles=roles
    )


def test_association_ignores_order_reverse_sources() -> None:
    # AST order [z, a]; runner order [a, z]. Pairing by position
    # would swap identities; structural identity must not.
    names = [_name(("z",), node_index=0), _name(("a",), node_index=1)]
    descriptors = [_descriptor("a", alias="a"), _descriptor("z", alias="z")]
    associations = associate_endpoints(descriptors, names)
    assert [a.identifier.texts for a in associations] == [("a",), ("z",)]
    assert all(a.column_attribution_confirmed for a in associations)


def test_association_self_join_confirms_table_once_columns_unconfirmed() -> None:
    names = [
        _name(("orders",), alias="o1", node_index=0),
        _name(("orders",), alias="o2", node_index=1),
    ]
    associations = associate_endpoints([_descriptor("orders", alias="o1")], names)
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is False
    assert (
        associations[0].column_reason is UnconfirmedReason.COLUMN_ATTRIBUTION_AMBIGUOUS
    )


def test_association_four_part_name_confirms_via_first_two_segments() -> None:
    names = [_name(("srv", "db1", "sch1", "tbl1"))]
    associations = associate_endpoints([_descriptor("tbl1", "srv.db1")], names)
    assert associations[0].identifier.texts == ("srv", "db1", "sch1", "tbl1")
    assert associations[0].column_attribution_confirmed is True


def test_association_five_part_name_confirms() -> None:
    names = [_name(("a", "b", "c", "d", "e"))]
    associations = associate_endpoints([_descriptor("e", "a.b")], names)
    assert associations[0].identifier.texts == ("a", "b", "c", "d", "e")


def test_association_quoted_dot_vs_three_parts_is_ambiguous() -> None:
    names = [
        _name(("sales.eu", "orders"), quoted=(True, False), node_index=0),
        _name(("sales", "eu", "orders"), node_index=1),
    ]
    associations = associate_endpoints([_descriptor("orders", "sales.eu")], names)
    assert associations[0].identifier is None
    assert associations[0].reason is UnconfirmedReason.AMBIGUOUS_IDENTITY


def test_association_quoted_default_alone_confirms_bare_ambiguity_does_not() -> None:
    quoted_only = [_name(("<default>", "orders"), quoted=(True, False))]
    associations = associate_endpoints([_descriptor("orders")], quoted_only)
    assert associations[0].identifier.texts == ("<default>", "orders")
    both = [
        _name(("<default>", "orders"), quoted=(True, False), node_index=0),
        _name(("orders",), node_index=1),
    ]
    associations = associate_endpoints([_descriptor("orders")], both)
    assert associations[0].identifier is None
    assert associations[0].reason is UnconfirmedReason.AMBIGUOUS_IDENTITY


def test_association_role_mismatch_is_unconfirmed() -> None:
    names = [_name(("tgt",), role=NameRole.TARGET)]
    associations = associate_endpoints([_descriptor("tgt")], names)
    assert associations[0].identifier is None
    assert associations[0].reason is UnconfirmedReason.NO_COMPATIBLE_NAME


def test_association_role_union_source_and_target() -> None:
    names = [
        _name(("t",), role=NameRole.TARGET, node_index=0),
        _name(("t",), role=NameRole.SOURCE, node_index=1),
    ]
    descriptor = _descriptor(
        "t", roles=frozenset({NameRole.SOURCE, NameRole.TARGET})
    )
    associations = associate_endpoints([descriptor], names)
    assert associations[0].identifier.texts == ("t",)
    # Contract revision 9: both occurrences carry no alias, so the
    # alias set has one value and column attribution confirms — the
    # confirmed object is the attribution target, not the occurrence
    # count. (Previously: any second occurrence left columns
    # unconfirmed.)
    assert associations[0].column_attribution_confirmed is True
    assert associations[0].column_reason is None


def test_association_explicit_alias_mismatch_is_unconfirmed() -> None:
    names = [_name(("orders",), alias="o2")]
    associations = associate_endpoints([_descriptor("orders", alias="o1")], names)
    assert associations[0].identifier is None
    assert associations[0].reason is UnconfirmedReason.NO_COMPATIBLE_NAME


def test_association_alias_match_confirms_columns() -> None:
    names = [_name(("orders",), alias="o")]
    associations = associate_endpoints([_descriptor("orders", alias="o")], names)
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is True


def test_association_default_alias_with_aliased_occurrence_leaves_columns_unconfirmed() -> None:
    names = [_name(("orders",), alias="o")]
    associations = associate_endpoints([_descriptor("orders", alias="orders")], names)
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is False


def test_association_two_endpoints_claiming_one_identity_is_ambiguous() -> None:
    names = [_name(("orders",))]
    descriptors = [_descriptor("orders"), _descriptor("orders")]
    associations = associate_endpoints(descriptors, names)
    assert all(a.identifier is None for a in associations)
    assert all(a.reason is UnconfirmedReason.AMBIGUOUS_IDENTITY for a in associations)


def test_association_no_compatible_name() -> None:
    names = [_name(("sales", "orders"))]
    associations = associate_endpoints([_descriptor("orders", "other")], names)
    assert associations[0].identifier is None
    assert associations[0].reason is UnconfirmedReason.NO_COMPATIBLE_NAME
    associations = associate_endpoints([_descriptor("orders")], names)
    assert associations[0].identifier is None


def test_association_ignores_intermediate_and_unsupported_names() -> None:
    names = [
        _name(("tmp",), role=NameRole.INTERMEDIATE),
        ExtractedName(
            identifier=None,
            role=NameRole.SOURCE,
            alias=None,
            statement_index=0,
            node_index=1,
            unsupported_reason=UnsupportedReason.DYNAMIC_IDENTIFIER,
        ),
    ]
    associations = associate_endpoints([_descriptor("tmp")], names)
    assert associations[0].identifier is None


def test_association_multi_statement_same_table_confirms_table_and_columns() -> None:
    names = [
        _name(("orders",), statement_index=0, node_index=0),
        _name(("orders",), statement_index=1, node_index=0),
    ]
    associations = associate_endpoints([_descriptor("orders")], names)
    assert associations[0].identifier.texts == ("orders",)
    # Contract revision 9: both occurrences carry no alias, so the
    # alias set has one value and column attribution confirms — the
    # confirmed object is the attribution target, not the occurrence
    # count. (Previously: any second occurrence left columns
    # unconfirmed.)
    assert associations[0].column_attribution_confirmed is True
    assert associations[0].column_reason is None


def test_association_result_aligns_with_descriptors() -> None:
    associations = associate_endpoints(
        [_descriptor("a"), _descriptor("missing"), _descriptor("z")],
        [_name(("a",)), _name(("z",))],
    )
    assert isinstance(associations[0], EndpointAssociation)
    assert associations[0].identifier.texts == ("a",)
    assert associations[1].identifier is None
    assert associations[2].identifier.texts == ("z",)
