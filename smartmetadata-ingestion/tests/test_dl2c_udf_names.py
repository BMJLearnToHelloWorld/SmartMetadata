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

D-L2c H adds one more gate in the same selection layer: a bare,
unquoted call whose leaf names a built-in function (``BUILTIN_FUNCTION_NAMES``)
is filtered before any catalog lookup, so the SqlFluff/SqlParse branches
converge with the SqlGlot branch, which never emits modeled builtins.
Qualified (``sch.COUNT``) and quoted (``"COUNT"``) names are never filtered.
"""

from __future__ import annotations

from typing import Any

import sqlglot
from sqlglot import exp

from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage import query_lineage as query_lineage_module
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    ExtractedName,
    ExtractionResult,
    NameRole,
    StructuredIdentifier,
    UnsupportedReason,
)
from smartmetadata_ingestion.lineage.parser import (
    LineageParser,
    QueryParserType,
)
from smartmetadata_ingestion.lineage.query_lineage import QueryLineageProcessor
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.lineage.sqlfluff_extract import (
    extract_sqlfluff_names,
)
from smartmetadata_ingestion.lineage.sqlglot_extract import (
    extract_sqlglot_names,
)
from smartmetadata_ingestion.lineage.sqlparse_extract import (
    extract_sqlparse_names,
)
from smartmetadata_ingestion.lineage.udf_names import (
    BUILTIN_FUNCTION_NAMES,
    FUNCTION_COLUMN_PATTERN,
    column_parent_identifier,
    udf_names_from_extraction,
)
from smartmetadata_ingestion.records import BindingContext, FieldSource


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


# --- D-L2c H: built-in function names never expand a catalog UDF ---


def _counting_callback() -> tuple[list[StructuredIdentifier], Any]:
    filtered: list[StructuredIdentifier] = []

    def callback(identifier: StructuredIdentifier) -> None:
        filtered.append(identifier)

    return filtered, callback


def test_builtin_function_call_is_filtered_before_lookup() -> None:
    extraction = ExtractionResult(
        names=(_function(("COUNT",), 0), _function(("my_func",), 1))
    )
    filtered, callback = _counting_callback()
    names = udf_names_from_extraction(
        extraction, ["COUNT(*)", "my_func(x)"], on_builtin_filtered=callback
    )
    assert [name.texts for name in names] == [("my_func",)]
    assert [name.texts for name in filtered] == [("COUNT",)]


def test_builtin_filter_is_case_insensitive() -> None:
    for spelling in ("count", "Count", "COUNT"):
        extraction = ExtractionResult(names=(_function((spelling,), 0),))
        filtered, callback = _counting_callback()
        names = udf_names_from_extraction(
            extraction, [f"{spelling}(*)"], on_builtin_filtered=callback
        )
        assert names == []
        assert len(filtered) == 1


def test_builtin_filter_skips_quoted_and_qualified_names() -> None:
    # A quoted leaf is the caller naming a catalog object on purpose:
    # the column text names the call while the extraction proves the
    # quoted spelling, so the predicate sees the quote, not the text.
    quoted = ExtractionResult(
        names=(_function(("COUNT",), 0, quoted=(True,)),)
    )
    filtered, callback = _counting_callback()
    names = udf_names_from_extraction(
        quoted, ["COUNT(x)"], on_builtin_filtered=callback
    )
    assert [name.texts for name in names] == [("COUNT",)]
    assert filtered == []
    # A qualifier is the same kind of evidence: sch.COUNT names a
    # catalog object, never a bare built-in call. The column text
    # names the bare leaf, as in the qualifiers test above, while
    # the extraction supplies the qualified identifier.
    qualified = ExtractionResult(
        names=(_function(("sch", "COUNT"), 0),)
    )
    filtered, callback = _counting_callback()
    names = udf_names_from_extraction(
        qualified, ["COUNT(x)"], on_builtin_filtered=callback
    )
    assert [name.texts for name in names] == [("sch", "COUNT")]
    assert filtered == []


def test_builtin_filter_does_not_touch_cte_names() -> None:
    # A CTE named "count" is INTERMEDIATE, excluded before the filter
    # predicate ever runs, so it must not count as filtered either.
    extraction = ExtractionResult(
        names=(_function(("count",), 0, role=NameRole.INTERMEDIATE),)
    )
    filtered, callback = _counting_callback()
    assert (
        udf_names_from_extraction(
            extraction, ["count(x)"], on_builtin_filtered=callback
        )
        == []
    )
    assert filtered == []


def test_builtin_filter_is_silent_without_a_callback() -> None:
    # Existing callers that pass no callback see the same filtered
    # list; only the count is lost.
    extraction = ExtractionResult(names=(_function(("COUNT",), 0),))
    assert udf_names_from_extraction(extraction, ["COUNT(*)"]) == []


def test_three_branches_agree_on_builtin_and_real_udf() -> None:
    # The same probe SQL through each branch extractor, then the
    # shared selection layer: COUNT is empty on all three (SqlGlot
    # never emits it; the other two emit it and the filter drops it),
    # my_func is present on all three. This is the branch-difference
    # convergence H exists for.
    extractors = (
        extract_sqlfluff_names,
        extract_sqlparse_names,
        extract_sqlglot_names,
    )
    for dialect in (Dialect.MYSQL, Dialect.POSTGRES):
        for extractor in extractors:
            count_result = extractor("SELECT COUNT(*) FROM t", dialect)
            assert udf_names_from_extraction(count_result, ["COUNT(*)"]) == []
            func_result = extractor("SELECT my_func(x) FROM t", dialect)
            assert [
                name.texts
                for name in udf_names_from_extraction(
                    func_result, ["my_func(x)"]
                )
            ] == [("my_func",)]


class _FakeCatalogClient:
    """A catalog holding a UDF named COUNT plus a real my_func,
    recording every stored-procedure lookup."""

    def __init__(self, *, with_count_udf: bool = True) -> None:
        self._tables = {
            "svc.db.public.src2": _catalog_table("svc.db.public.src2"),
            "svc.db.public.tgt2": _catalog_table("svc.db.public.tgt2"),
        }
        procedures: dict[str, dict[str, Any]] = {
            "svc.db.public.my_func": _catalog_procedure(
                "svc.db.public.my_func",
                "INSERT INTO tgt2 SELECT x FROM src2",
            ),
        }
        if with_count_udf:
            procedures["svc.db.public.count"] = _catalog_procedure(
                "svc.db.public.count", "SELECT 1"
            )
        self._procedures = procedures
        self.procedure_calls: list[str] = []

    def get_table_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        entity = self._tables.get(fqn.lower())
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_stored_procedure_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        self.procedure_calls.append(fqn)
        entity = self._procedures.get(fqn.lower())
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def iter_collection(
        self, path: str, *, limit: int = 100, extra_params=None
    ) -> list[dict[str, Any]]:
        return []


def _catalog_table(fqn: str) -> dict[str, Any]:
    return {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }


def _catalog_procedure(fqn: str, code: str) -> dict[str, Any]:
    return {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
        "storedProcedureCode": {"code": code},
    }


def _missing_context() -> BindingContext:
    return BindingContext(
        database_name=None,
        database_schema=None,
        database_source=FieldSource.MISSING,
        schema_source=FieldSource.MISSING,
    )


def _expand_processor(
    client: _FakeCatalogClient,
) -> tuple[LineageBindingResolver, QueryLineageProcessor]:
    resolver = LineageBindingResolver(
        client, "svc", default_database="db", default_schema="public"  # type: ignore[arg-type]
    )
    processor = QueryLineageProcessor(
        resolver,
        service_name="svc",
        dialect=Dialect.POSTGRES,
        parser_type=QueryParserType.SQLFLUFF,
    )
    return resolver, processor


def test_builtin_udf_never_reaches_the_catalog() -> None:
    # The SqlFluff branch emits COUNT, the catalog holds a UDF named
    # COUNT, and still no lookup happens: the filter sits before
    # resolve_udf, so the body is never fetched, let alone expanded.
    # The parser type is forced to SqlFluff on purpose — under AUTO
    # the SqlGlot branch would win and emit nothing, which would
    # prove nothing about the filter.
    client = _FakeCatalogClient(with_count_udf=True)
    resolver, processor = _expand_processor(client)
    parser = LineageParser(
        "SELECT COUNT(*) FROM t",
        dialect=Dialect.POSTGRES,
        parser_type=QueryParserType.SQLFLUFF,
    )
    expansions = processor._expand_udfs(
        parser, ["COUNT(*)"], 0, [], [], set(), _missing_context()
    )
    assert expansions == 0
    assert client.procedure_calls == []
    assert resolver.binding_counts["builtin_function_filtered"] == 1
    # The filtered call never becomes a UDF miss either: the
    # unresolved_udf_count baseline changes (DRAFT-H §4.1).
    assert resolver.unresolved_udf_count == 0
    # Same, without a same-named UDF in the catalog: still zero
    # lookups and zero misses — previously this was a 404 + a miss.
    client = _FakeCatalogClient(with_count_udf=False)
    resolver, processor = _expand_processor(client)
    parser = LineageParser(
        "SELECT COUNT(*) FROM t",
        dialect=Dialect.POSTGRES,
        parser_type=QueryParserType.SQLFLUFF,
    )
    expansions = processor._expand_udfs(
        parser, ["COUNT(*)"], 0, [], [], set(), _missing_context()
    )
    assert expansions == 0
    assert client.procedure_calls == []
    assert resolver.binding_counts["builtin_function_filtered"] == 1
    assert resolver.unresolved_udf_count == 0


def test_real_udf_still_expands_once() -> None:
    client = _FakeCatalogClient(with_count_udf=True)
    resolver, processor = _expand_processor(client)
    parser = LineageParser(
        "SELECT my_func(x) FROM t",
        dialect=Dialect.POSTGRES,
        parser_type=QueryParserType.SQLFLUFF,
    )
    expansions = processor._expand_udfs(
        parser, ["my_func(x)"], 0, [], [], set(), _missing_context()
    )
    assert expansions == 1
    assert client.procedure_calls == ["svc.db.public.my_func"]
    assert resolver.binding_counts["builtin_function_filtered"] == 0


# --- D-L2c H: lock-table test (DRAFT-H §2.3/§6) ---

# The design's fixed probe corpus (DRAFT-H appendix table, 68 rows):
# every name the design probed, including the MY_FUNC control. The
# lock test recomputes B = E_fluff ∩ E_parse ∩ M_glot over exactly
# this corpus, live, and compares it with the signed-in table
# restricted to the corpus — so a library pin upgrade that moves the
# triple turns this test red instead of silently changing the table.
_APPENDIX_CORPUS: tuple[str, ...] = (
    "COUNT", "SUM", "AVG", "MIN", "MAX", "STDDEV", "STDDEV_POP",
    "STDDEV_SAMP", "VARIANCE", "VAR_POP", "VAR_SAMP", "STRING_AGG",
    "ARRAY_AGG", "JSON_AGG", "GROUP_CONCAT", "BIT_AND", "BIT_OR",
    "COALESCE", "NULLIF", "IFNULL", "NVL", "IF", "CASE", "CAST",
    "CONVERT", "TRY_CAST", "CONCAT", "CONCAT_WS", "SUBSTRING", "SUBSTR",
    "TRIM", "LTRIM", "RTRIM", "UPPER", "LOWER", "LENGTH", "CHAR_LENGTH",
    "REPLACE", "LEFT", "RIGHT", "ABS", "CEIL", "CEILING", "FLOOR",
    "ROUND", "POWER", "SQRT", "MOD", "NOW", "CURRENT_DATE",
    "CURRENT_TIMESTAMP", "DATE_ADD", "DATE_FORMAT", "EXTRACT", "YEAR",
    "MONTH", "DAY", "ROW_NUMBER", "RANK", "DENSE_RANK", "LAG", "LEAD",
    "FIRST_VALUE", "GREATEST", "LEAST", "RANDOM", "UUID", "MY_FUNC",
)

_PROBE_TEMPLATES: tuple[str, ...] = (
    "SELECT {name}(x) FROM t",
    "SELECT {name}(x, y) FROM t",
    "SELECT {name}(x, y, z) FROM t",
    "SELECT {name}() FROM t",
    "SELECT {name}(*) FROM t",
)

_SPECIAL_PROBES: dict[str, dict[str, str]] = {
    "COUNT": {"mysql": "SELECT COUNT(*) FROM t",
              "postgres": "SELECT COUNT(*) FROM t"},
    "CAST": {"mysql": "SELECT CAST(x AS CHAR) FROM t",
             "postgres": "SELECT CAST(x AS CHAR) FROM t"},
    "TRY_CAST": {"mysql": "SELECT TRY_CAST(x AS CHAR) FROM t",
                 "postgres": "SELECT TRY_CAST(x AS CHAR) FROM t"},
    "EXTRACT": {"mysql": "SELECT EXTRACT(YEAR FROM d) FROM t",
                "postgres": "SELECT EXTRACT(YEAR FROM d) FROM t"},
    "CONVERT": {"mysql": "SELECT CONVERT(x, CHAR) FROM t",
                "postgres": "SELECT CONVERT(x, 'UTF8', 'LATIN1') FROM t"},
    "DATE_ADD": {"mysql": "SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM t",
                 "postgres": "SELECT DATE_ADD(d, INTERVAL '1 day') FROM t"},
    "DATE_FORMAT": {"mysql": "SELECT DATE_FORMAT(d, '%Y') FROM t",
                    "postgres": "SELECT DATE_FORMAT(d, '%Y') FROM t"},
}


def _glot_modeled(sql: str, dialect: str) -> bool | None:
    """M_glot on one probe sentence: True when sqlglot parses it and
    the tree holds a modeled (non-Anonymous) Func node; False when it
    parses but holds none; None on parse error. Node-class check only —
    alias classes (VAR_POP → VariancePop) and differently-named modeled
    classes (STRING_AGG → GroupConcat) both count as modeled."""
    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except Exception:
        return None
    if tree is None:
        return None
    return any(
        not isinstance(node, exp.Anonymous)
        for node in tree.find_all(exp.Func)
    )


def _branch_emits(extractor: Any, name: str, sql: str, dialect: Dialect) -> bool | None:
    try:
        result = extractor(sql, dialect)
    except Exception:
        return None
    if result.failed:
        return None
    return any(
        occurrence.identifier is not None
        and occurrence.identifier.leaf.text.upper() == name
        for occurrence in result.function_names
    )


def _name_in_builtin_table(name: str, dialect: str) -> bool:
    """Whether `name` satisfies E_fluff ∧ E_parse ∧ M_glot under one
    dialect on some arity-correct probe sentence."""
    enum = Dialect.MYSQL if dialect == "mysql" else Dialect.POSTGRES
    probes = [
        _SPECIAL_PROBES.get(name, {}).get(dialect),
        *(_PROBE_TEMPLATES),
    ]
    for probe in probes:
        if probe is None:
            continue
        sql = probe.format(name=name)
        if _glot_modeled(sql, dialect) is not True:
            continue
        fluff = _branch_emits(extract_sqlfluff_names, name, sql, enum)
        parse = _branch_emits(extract_sqlparse_names, name, sql, enum)
        if fluff is None or parse is None:
            continue
        if fluff and parse:
            return True
    return False


def test_builtin_function_names_match_recomputed_intersection() -> None:
    # The signed-in table restricted to the fixed corpus must equal
    # the triple recomputed live over that corpus, in both dialects.
    # A pin upgrade that moves any name turns this red on purpose.
    recomputed = {
        name
        for name in _APPENDIX_CORPUS
        if _name_in_builtin_table(name, "mysql")
        and _name_in_builtin_table(name, "postgres")
    }
    assert recomputed == {
        name for name in _APPENDIX_CORPUS if name in BUILTIN_FUNCTION_NAMES
    }
    # SqlGlot leaves these unmodeled (Anonymous) in 29.0.1, so the
    # triple can never hold for them — they are the method's known
    # boundary, not omissions (DRAFT-H §2.6).
    assert "JSON_AGG" not in BUILTIN_FUNCTION_NAMES
    assert "NOW" not in BUILTIN_FUNCTION_NAMES
    # The control name is a real UDF spelling, never a builtin.
    assert "MY_FUNC" not in BUILTIN_FUNCTION_NAMES
    # The table is the full mechanical enumeration, not the corpus.
    assert len(BUILTIN_FUNCTION_NAMES) > 500
    assert "COUNT" in BUILTIN_FUNCTION_NAMES
    assert "STRING_AGG" in BUILTIN_FUNCTION_NAMES
    assert "LTRIM" in BUILTIN_FUNCTION_NAMES
