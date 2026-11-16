# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the D-L2c SqlFluff and SqlParse branch
extractors (design §5.5, §6 test 4, Leaf B scope).

Both branches run the same fidelity matrix the SqlGlot branch
proved: every case the string path used to corrupt — quoted dots,
four-part names, quoted "<default>", CTEs, roles, function names —
must come back as the same structured identifiers, or as explicitly
unsupported occurrences, never as a guessed string. Where a branch
cannot prove fidelity, the test pins the fail-closed outcome
instead of the name.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    ExtractionFailureReason,
    ExtractionResult,
    NameRole,
    UnsupportedReason,
    extract_names,
)
from smartmetadata_ingestion.lineage.parser import (
    PARSER_SQLFLUFF,
    PARSER_SQLPARSE,
    LineageParser,
    QueryParserType,
    _ensure_extractors_registered,
)
from smartmetadata_ingestion.lineage.sqlfluff_extract import extract_sqlfluff_names
from smartmetadata_ingestion.lineage.sqlglot_extract import extract_sqlglot_names
from smartmetadata_ingestion.lineage.sqlparse_extract import extract_sqlparse_names

Extractor = Callable[[str, Dialect], ExtractionResult]

EXTRACTORS: list[tuple[str, Extractor]] = [
    ("sqlfluff", extract_sqlfluff_names),
    ("sqlparse", extract_sqlparse_names),
]

ALL_EXTRACTORS: list[tuple[str, Extractor]] = [
    ("sqlglot", extract_sqlglot_names),
    *EXTRACTORS,
]


def _shapes(result: ExtractionResult) -> list[tuple[tuple[str, ...], tuple[bool, ...]]]:
    """The (texts, quoted flags) of every proven identifier, in
    extraction order: the shape binding compares, without roles or
    aliases."""
    return [
        (
            name.identifier.texts,
            tuple(segment.quoted for segment in name.identifier.segments),
        )
        for name in result.names
        if name.identifier is not None
    ]


def _roles(result: ExtractionResult) -> list[NameRole]:
    return [name.role for name in result.names]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_quoted_dot_differs_from_three_parts(
    branch: str, extract: Extractor
) -> None:
    del branch
    quoted = extract('SELECT * FROM "sales.eu".orders', Dialect.POSTGRES)
    assert not quoted.failed
    assert _shapes(quoted) == [(("sales.eu", "orders"), (True, False))]
    plain = extract("SELECT * FROM sales.eu.orders", Dialect.POSTGRES)
    assert not plain.failed
    assert _shapes(plain) == [(("sales", "eu", "orders"), (False, False, False))]
    assert _shapes(quoted) != _shapes(plain)


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_four_part_name_keeps_every_segment(branch: str, extract: Extractor) -> None:
    del branch
    four = extract("SELECT * FROM srv.db.sch.tbl", Dialect.TSQL)
    assert not four.failed
    assert _shapes(four) == [(("srv", "db", "sch", "tbl"), (False, False, False, False))]
    three = extract("SELECT * FROM srv.db.tbl", Dialect.TSQL)
    assert _shapes(three) == [(("srv", "db", "tbl"), (False, False, False))]
    assert _shapes(four) != _shapes(three)


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_mysql_backtick_quoted_dot(branch: str, extract: Extractor) -> None:
    del branch
    result = extract("SELECT * FROM `sales.eu`.orders", Dialect.MYSQL)
    assert not result.failed
    assert _shapes(result) == [(("sales.eu", "orders"), (True, False))]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_tsql_bracket_names_are_quoted(branch: str, extract: Extractor) -> None:
    del branch
    result = extract("SELECT * FROM [srv].[db].[sch].[tbl]", Dialect.TSQL)
    assert not result.failed
    assert _shapes(result) == [
        (("srv", "db", "sch", "tbl"), (True, True, True, True))
    ]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_quoted_default_segment_survives(branch: str, extract: Extractor) -> None:
    del branch
    result = extract('SELECT * FROM "<default>".orders', Dialect.POSTGRES)
    assert not result.failed
    assert _shapes(result) == [(("<default>", "orders"), (True, False))]


def test_unquoted_sentinel_never_binds_sqlfluff() -> None:
    # An unquoted <default> is not a name in any dialect: sqlfluff
    # cannot parse it, so the whole extraction fails closed instead
    # of yielding a placeholder segment.
    result = extract_sqlfluff_names("SELECT * FROM <default>.orders", Dialect.POSTGRES)
    assert result.failed
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
    assert result.names == ()


def test_unquoted_sentinel_never_binds_sqlparse() -> None:
    # sqlparse lexes the angle brackets as operators, so no name
    # token ever appears in the table position: nothing is emitted,
    # and in particular no unquoted "<default>" segment exists.
    result = extract_sqlparse_names("SELECT * FROM <default>.orders", Dialect.POSTGRES)
    assert not result.failed
    assert result.names == ()
    assert all(
        segment.text != "<default>" or segment.quoted
        for name in result.names
        if name.identifier is not None
        for segment in name.identifier.segments
    )


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_cte_references_are_intermediate(branch: str, extract: Extractor) -> None:
    del branch
    result = extract(
        "WITH cte AS (SELECT * FROM real_t) SELECT * FROM cte", Dialect.POSTGRES
    )
    assert not result.failed
    assert _shapes(result) == [(("real_t",), (False,)), (("cte",), (False,))]
    assert _roles(result) == [NameRole.SOURCE, NameRole.INTERMEDIATE]
    assert [name.is_binding_candidate for name in result.names] == [True, False]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_cte_name_inside_own_definition_is_a_real_table(
    branch: str, extract: Extractor
) -> None:
    del branch
    result = extract(
        "WITH cte AS (SELECT * FROM cte) SELECT * FROM cte", Dialect.POSTGRES
    )
    assert not result.failed
    assert _roles(result) == [NameRole.SOURCE, NameRole.INTERMEDIATE]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_multiple_ctes_and_materialized(branch: str, extract: Extractor) -> None:
    del branch
    multi = extract(
        "WITH a AS (SELECT * FROM t1), b AS (SELECT * FROM t2) "
        "SELECT * FROM a JOIN b ON 1=1",
        Dialect.POSTGRES,
    )
    assert not multi.failed
    assert _roles(multi) == [
        NameRole.SOURCE,
        NameRole.SOURCE,
        NameRole.INTERMEDIATE,
        NameRole.INTERMEDIATE,
    ]
    materialized = extract(
        "WITH cte AS MATERIALIZED (SELECT * FROM real_t) SELECT * FROM cte",
        Dialect.POSTGRES,
    )
    assert not materialized.failed
    assert _roles(materialized) == [NameRole.SOURCE, NameRole.INTERMEDIATE]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_write_target_roles(branch: str, extract: Extractor) -> None:
    del branch
    cases = [
        ("INSERT INTO tgt SELECT * FROM src", [NameRole.TARGET, NameRole.SOURCE]),
        ("UPDATE sch.tgt SET a=1 FROM src", [NameRole.TARGET, NameRole.SOURCE]),
        ("DELETE FROM sch.tgt WHERE a=1", [NameRole.TARGET]),
        ("CREATE TABLE new_t AS SELECT * FROM old_t", [NameRole.TARGET, NameRole.SOURCE]),
        (
            "MERGE INTO tgt USING src ON tgt.id = src.id "
            "WHEN MATCHED THEN UPDATE SET a = 1",
            [NameRole.TARGET, NameRole.SOURCE],
        ),
    ]
    for sql, expected in cases:
        result = extract(sql, Dialect.POSTGRES)
        assert not result.failed, sql
        assert _roles(result) == expected, sql


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_insert_column_list_is_a_target_not_a_function(
    branch: str, extract: Extractor
) -> None:
    del branch
    result = extract("INSERT INTO t (a, b) VALUES (1, 2)", Dialect.POSTGRES)
    assert not result.failed
    assert len(result.names) == 1
    (name,) = result.names
    assert name.identifier is not None and name.identifier.texts == ("t",)
    assert name.role is NameRole.TARGET
    assert not name.is_function


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_aliases_carry_text_and_quoted_flag(branch: str, extract: Extractor) -> None:
    del branch
    bare = extract("SELECT * FROM sch.tbl t", Dialect.POSTGRES)
    assert [(name.alias, name.alias_quoted) for name in bare.names] == [("t", False)]
    keyword = extract("SELECT a.x FROM sch.tbl AS a", Dialect.POSTGRES)
    assert [(name.alias, name.alias_quoted) for name in keyword.names] == [("a", False)]
    quoted = extract('SELECT * FROM "my tbl".orders AS "my alias"', Dialect.POSTGRES)
    assert [(name.alias, name.alias_quoted) for name in quoted.names] == [
        ("my alias", True)
    ]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_scalar_and_table_function_names(branch: str, extract: Extractor) -> None:
    del branch
    scalar = extract("SELECT my_schema.my_func(x) FROM t", Dialect.POSTGRES)
    assert not scalar.failed
    functions = scalar.function_names
    assert len(functions) == 1
    assert functions[0].identifier is not None
    assert functions[0].identifier.texts == ("my_schema", "my_func")
    assert functions[0].is_function
    table_fn = extract("SELECT * FROM my_func() AS f", Dialect.POSTGRES)
    assert not table_fn.failed
    assert len(table_fn.function_names) == 1
    assert table_fn.function_names[0].alias == "f"
    qualified_table_fn = extract("SELECT * FROM sch.my_func()", Dialect.POSTGRES)
    assert qualified_table_fn.function_names[0].identifier is not None
    assert qualified_table_fn.function_names[0].identifier.texts == ("sch", "my_func")
    nested = extract("SELECT f(g(x)) FROM t", Dialect.POSTGRES)
    assert [name.identifier.texts for name in nested.function_names] == [("f",), ("g",)]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_builtins_are_emitted_as_function_occurrences(
    branch: str, extract: Extractor
) -> None:
    # Neither tree models builtins, so unlike the SqlGlot branch
    # (whose modeled builtins produce no name), COUNT is emitted as
    # a function occurrence here. That is faithful — the call is in
    # the text — and what keeps it from expanding as a UDF is not
    # the column-path heuristic: the heuristic only matches NAME(
    # shape, so a COUNT(*) column path does name COUNT. The real
    # gate chain is heuristic (shape) -> extraction occurrence
    # (branch difference: SqlGlot emits no occurrence, these
    # branches emit COUNT) -> resolve_udf catalog lookup, which
    # 404s and skips.
    del branch
    result = extract("SELECT COUNT(*) FROM t", Dialect.POSTGRES)
    assert not result.failed
    assert [name.identifier.texts for name in result.function_names] == [("COUNT",)]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_dynamic_identifier_is_unsupported(branch: str, extract: Extractor) -> None:
    del branch
    for sql in (
        "SELECT * FROM IDENTIFIER('sch.tbl')",
        "SELECT IDENTIFIER('sch.tbl') FROM t",
    ):
        result = extract(sql, Dialect.SNOWFLAKE)
        assert not result.failed, sql
        assert len(result.unsupported_names) == 1, sql
        (unsupported,) = result.unsupported_names
        assert unsupported.unsupported_reason is UnsupportedReason.DYNAMIC_IDENTIFIER
        assert unsupported.is_function
        assert unsupported.identifier is None


@pytest.mark.parametrize("branch,extract", ALL_EXTRACTORS, ids=[name for name, _ in ALL_EXTRACTORS])
def test_plain_table_named_identifier_binds_in_all_branches(
    branch: str, extract: Extractor
) -> None:
    # A plain table named "identifier" is an ordinary name, not a
    # dynamic reference: the IDENTIFIER() check must be gated on
    # the call shape, so the bare name binds in every branch.
    del branch
    for sql, texts in (
        ("SELECT * FROM identifier", ("identifier",)),
        ("SELECT * FROM sch.identifier", ("sch", "identifier")),
    ):
        result = extract(sql, Dialect.POSTGRES)
        assert not result.failed, sql
        assert len(result.names) == 1, sql
        (name,) = result.names
        assert name.identifier is not None, sql
        assert name.identifier.texts == texts, sql
        assert name.fidelity_proven is True, sql
        assert name.is_function is False, sql


@pytest.mark.parametrize("branch,extract", ALL_EXTRACTORS, ids=[name for name, _ in ALL_EXTRACTORS])
def test_identifier_call_never_binds_the_name_identifier(
    branch: str, extract: Extractor
) -> None:
    # No branch ever binds "IDENTIFIER" itself as a name. The call
    # resolves differently per branch, by contract: SqlGlot
    # re-parses the single string literal and binds the table it
    # names (contract §b2), while SqlFluff and SqlParse report
    # every IDENTIFIER() call unsupported — but in no branch does
    # an occurrence carry the identifier ("IDENTIFIER",).
    result = extract("SELECT * FROM IDENTIFIER('x')", Dialect.SNOWFLAKE)
    assert not result.failed
    assert len(result.names) == 1
    (name,) = result.names
    assert not (
        name.identifier is not None and name.identifier.texts == ("IDENTIFIER",)
    )
    if branch == "sqlglot":
        assert name.identifier is not None
        assert name.identifier.texts == ("x",)
        assert name.fidelity_proven is True
    else:
        assert name.identifier is None
        assert name.is_function is True
        assert name.unsupported_reason is UnsupportedReason.DYNAMIC_IDENTIFIER


def test_sqlparse_identifier_call_as_write_target_is_unsupported() -> None:
    # IDENTIFIER() as a write target is still dynamic: the target
    # conversion that turns "INSERT INTO t (a, b)" into a table
    # name must not strip the function gate the dynamic check
    # relies on, or the call would bind as a table named
    # "IDENTIFIER".
    result = extract_sqlparse_names(
        "INSERT INTO IDENTIFIER('x') SELECT * FROM t", Dialect.SNOWFLAKE
    )
    assert not result.failed
    assert len(result.names) == 2
    target, source = result.names
    assert target.identifier is None
    assert target.is_function is True
    assert target.role is NameRole.TARGET
    assert target.unsupported_reason is UnsupportedReason.DYNAMIC_IDENTIFIER
    assert source.identifier is not None
    assert source.identifier.texts == ("t",)
    assert source.fidelity_proven is True


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_multi_statement_scope(branch: str, extract: Extractor) -> None:
    del branch
    result = extract("SELECT * FROM a; SELECT * FROM b", Dialect.POSTGRES)
    assert not result.failed
    assert [name.statement_index for name in result.names] == [0, 1]
    assert _shapes(result) == [(("a",), (False,)), (("b",), (False,))]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_joins_comma_lists_subqueries_and_derived_tables(
    branch: str, extract: Extractor
) -> None:
    del branch
    joined = extract("SELECT * FROM t1 JOIN t2 ON t1.id=t2.id", Dialect.POSTGRES)
    assert _shapes(joined) == [(("t1",), (False,)), (("t2",), (False,))]
    left = extract("SELECT * FROM t1 LEFT OUTER JOIN t2 ON 1=1", Dialect.POSTGRES)
    assert _shapes(left) == [(("t1",), (False,)), (("t2",), (False,))]
    comma = extract("SELECT * FROM a, b", Dialect.POSTGRES)
    assert _shapes(comma) == [(("a",), (False,)), (("b",), (False,))]
    derived = extract(
        "SELECT * FROM (SELECT * FROM inner_t) AS sub", Dialect.POSTGRES
    )
    assert _shapes(derived) == [(("inner_t",), (False,))]
    assert derived.names[0].alias is None
    exists = extract(
        "SELECT * FROM t WHERE EXISTS (SELECT 1 FROM u WHERE u.id=t.id)",
        Dialect.POSTGRES,
    )
    assert _shapes(exists) == [(("t",), (False,)), (("u",), (False,))]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_column_references_and_string_literals_name_no_tables(
    branch: str, extract: Extractor
) -> None:
    del branch
    result = extract("SELECT a.x, b.y FROM sch.tbl AS a", Dialect.POSTGRES)
    assert _shapes(result) == [(("sch", "tbl"), (False, False))]
    fake = extract("SELECT * FROM t WHERE x = 'FROM fake'", Dialect.POSTGRES)
    assert _shapes(fake) == [(("t",), (False,))]


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_empty_and_nameless_queries_yield_no_names(branch: str, extract: Extractor) -> None:
    del branch
    assert extract("", Dialect.POSTGRES).names == ()
    assert not extract("", Dialect.POSTGRES).failed
    assert extract("SELECT 1", Dialect.POSTGRES).names == ()


@pytest.mark.parametrize("branch,extract", EXTRACTORS, ids=[name for name, _ in EXTRACTORS])
def test_on_duplicate_key_update_names_no_columns(branch: str, extract: Extractor) -> None:
    del branch
    result = extract(
        "INSERT INTO t VALUES (1) ON DUPLICATE KEY UPDATE a=1", Dialect.MYSQL
    )
    assert not result.failed
    assert _shapes(result) == [(("t",), (False,))]
    assert _roles(result) == [NameRole.TARGET]


def test_sqlfluff_unparsable_section_fails_the_whole_extraction() -> None:
    # Backtick quoting is not valid in the ANSI dialect, so the FROM
    # clause is unparsable: the extraction fails instead of binding
    # the query's other names while silently dropping this one.
    result = extract_sqlfluff_names("SELECT * FROM `t`.orders", Dialect.ANSI)
    assert result.failed
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
    assert result.names == ()


def test_sqlfluff_quoted_function_name_fails_closed_in_mysql() -> None:
    # The MySQL dialect reads a double-quoted function name as a
    # string literal and leaves the call unparsable; the branch
    # cannot prove the name, so the extraction fails closed.
    result = extract_sqlfluff_names('SELECT "my_func"(x) FROM t', Dialect.MYSQL)
    assert result.failed
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR


def test_dispatch_stamps_branch_and_reaches_both_extractors() -> None:
    _ensure_extractors_registered()
    fluff = extract_names(
        PARSER_SQLFLUFF, "SELECT * FROM sch.tbl", Dialect.POSTGRES
    )
    assert fluff.branch == PARSER_SQLFLUFF
    assert not fluff.failed
    assert _shapes(fluff) == [(("sch", "tbl"), (False, False))]
    parse = extract_names(
        PARSER_SQLPARSE, "SELECT * FROM sch.tbl", Dialect.POSTGRES
    )
    assert parse.branch == PARSER_SQLPARSE
    assert not parse.failed
    assert _shapes(parse) == [(("sch", "tbl"), (False, False))]


def test_parser_sqlfluff_winner_exposes_structured_extraction() -> None:
    parser = LineageParser(
        'SELECT * FROM "sales.eu".orders',
        dialect=Dialect.POSTGRES,
        parser_type=QueryParserType.SQLFLUFF,
    )
    extraction = parser.structured_extraction
    assert extraction.branch == PARSER_SQLFLUFF
    assert not extraction.failed
    assert _shapes(extraction) == [(("sales.eu", "orders"), (True, False))]


def test_star_qualifier_fails_closed_in_every_branch() -> None:
    # The SqlParse NON_IDENTIFIER_NAME lock: "sch.*" reads as a
    # per-name unsupported occurrence there. SqlGlot and SqlFluff
    # fail the whole extraction on the same input instead. Both
    # are fail-closed: no branch binds a name out of "sch.*".
    parse = extract_sqlparse_names("SELECT * FROM sch.*", Dialect.POSTGRES)
    assert not parse.failed
    assert len(parse.unsupported_names) == 1
    (unsupported,) = parse.unsupported_names
    assert unsupported.unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME
    assert unsupported.identifier is None
    assert unsupported.is_function is False
    for extract in (extract_sqlglot_names, extract_sqlfluff_names):
        result = extract("SELECT * FROM sch.*", Dialect.POSTGRES)
        assert result.failed
        assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
        assert result.names == ()


def test_sqlfluff_non_identifier_name_paths_are_defensive() -> None:
    # No SQL input was found that reaches the per-name
    # NON_IDENTIFIER_NAME outcomes in _emit_table/_emit_function
    # (via _reference_segments/_function_name_segments returning
    # None): every malformed-name shape probed below fails the
    # whole extraction first, because _has_unparsable rejects any
    # unparsable section before the walk. The per-name paths are
    # therefore defensive code, locked here by the probe battery
    # itself: if a future input reaches them, this test fails and
    # the new behavior must be locked explicitly instead.
    # Probe method: extract_sqlfluff_names run directly over each
    # shape in Dialect.POSTGRES; every shape failed closed with
    # PARSE_ERROR and zero names.
    shapes = (
        "SELECT * FROM sch.*",
        "SELECT * FROM t.1",
        "SELECT * FROM 123",
        "SELECT * FROM f.1(x)",
        "SELECT 1.5(x) FROM t",
        "SELECT * FROM f.*(x)",
        "SELECT * FROM t WHERE x = f.1(y)",
    )
    for sql in shapes:
        result = extract_sqlfluff_names(sql, Dialect.POSTGRES)
        assert result.failed, sql
        assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR, sql
        assert result.names == (), sql


def test_sqlparse_truncated_dotted_name_is_unsupported() -> None:
    # "t.1" lexes as a name plus a ".1" float tail: the leading
    # part must not bind while the rest is silently dropped. The
    # same holds for a qualified name and for the truncated name
    # inside a comma list, where the surviving names still bind.
    for sql in (
        "SELECT * FROM t.1",
        "SELECT * FROM t .1",
        "SELECT * FROM sch.tbl.1",
    ):
        result = extract_sqlparse_names(sql, Dialect.POSTGRES)
        assert not result.failed, sql
        assert len(result.names) == 1, sql
        (name,) = result.names
        assert name.identifier is None, sql
        assert name.unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME, sql
    listed = extract_sqlparse_names("SELECT * FROM a, t.1", Dialect.POSTGRES)
    assert not listed.failed
    assert [
        name.identifier.texts if name.identifier is not None else None
        for name in listed.names
    ] == [("a",), None]
    assert listed.names[1].unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME


def test_sqlparse_truncated_function_call_is_unsupported() -> None:
    # A function call with a dotted tail ("f().1") names no table
    # either: the truncated call is an unsupported occurrence that
    # keeps its function marking, so it never binds as a table.
    result = extract_sqlparse_names("SELECT * FROM f().1", Dialect.POSTGRES)
    assert not result.failed
    assert len(result.names) == 1
    (name,) = result.names
    assert name.identifier is None
    assert name.is_function is True
    assert name.unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME


def test_sqlparse_literal_in_table_position_is_unsupported() -> None:
    # A literal in a table position names no table: it is an
    # unsupported occurrence, not a silent absence — with or
    # without a surviving table beside it.
    for sql in ("SELECT * FROM 123", "SELECT * FROM 'foo'"):
        result = extract_sqlparse_names(sql, Dialect.POSTGRES)
        assert not result.failed, sql
        assert len(result.names) == 1, sql
        (name,) = result.names
        assert name.identifier is None, sql
        assert name.unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME, sql
    listed = extract_sqlparse_names("SELECT * FROM 123, u", Dialect.POSTGRES)
    assert not listed.failed
    assert [
        name.identifier.texts if name.identifier is not None else None
        for name in listed.names
    ] == [None, ("u",)]
    assert listed.names[0].unsupported_reason is UnsupportedReason.NON_IDENTIFIER_NAME


def test_sqlparse_dot_tail_guard_ignores_clean_forms() -> None:
    # Guards against the dot-tail peek misfiring: a dotted name
    # grouped with spaces still binds whole, and a float literal
    # that is not adjacent to a table name (inside WHERE, inside a
    # VALUES list) adds no unsupported count.
    grouped = extract_sqlparse_names("SELECT * FROM t. orders", Dialect.POSTGRES)
    assert _shapes(grouped) == [(("t", "orders"), (False, False))]
    assert grouped.unsupported_names == ()
    where = extract_sqlparse_names(
        "SELECT * FROM t WHERE x > .5", Dialect.POSTGRES
    )
    assert _shapes(where) == [(("t",), (False,))]
    assert where.unsupported_names == ()
    values = extract_sqlparse_names(
        "INSERT INTO t VALUES (.5, 1)", Dialect.POSTGRES
    )
    assert _shapes(values) == [(("t",), (False,))]
    assert values.unsupported_names == ()


def test_sqlparse_lateral_view_emits_only_the_base_table() -> None:
    # A keyword directly after the table name (LATERAL VIEW) must
    # not gain an unsupported count from the following-token peek:
    # only the base table is emitted, with no unsupported names.
    result = extract_sqlparse_names(
        "SELECT * FROM t LATERAL VIEW explode(arr) AS x", Dialect.POSTGRES
    )
    assert not result.failed
    assert _shapes(result) == [(("t",), (False,))]
    assert result.unsupported_names == ()
