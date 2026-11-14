# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the parsing core, written from the spec.

Known queries in, expected tables/columns/joins out. No test here
translates a pin test: the expectations come from design-sql-parsing
§3.2 (cascade order, hash, masking, T-SQL rewrite, dialect map).
"""

from __future__ import annotations

import hashlib
import time

import pytest

from smartmetadata_ingestion.config import QueryParserConfig, SourceConfig
from smartmetadata_ingestion.lineage import (
    Dialect,
    LineageParser,
    QueryParserType,
    clean_raw_query,
    clean_table_name,
    dialect_for_connection_type,
    mask_query,
    query_parsing_failures,
    resolve_parser_type,
    rewrite_switch_statements,
)
from smartmetadata_ingestion.lineage import parser as parser_module


@pytest.fixture(autouse=True)
def _clear_failures():
    query_parsing_failures().clear()
    yield
    query_parsing_failures().clear()


def _names(tables) -> list[str]:
    return sorted(clean_table_name(table) for table in tables)


def test_query_hash_is_md5_prefix_of_raw_query() -> None:
    raw = "SELECT * FROM orders WHERE id = 7"
    parser = LineageParser(raw, Dialect.POSTGRES)
    assert parser.query_hash == hashlib.md5(raw.encode("utf-8")).hexdigest()[:8]
    assert parser.suffixed_query_hash == f"{parser.query_hash}-SqlGlot"


def test_copy_from_filesystem_path_is_filtered_not_crashed() -> None:
    # The path COPY yields a schema-less Path object from the library;
    # the statement filter must remove it before parsing, so the
    # query contributes nothing instead of crashing the table views.
    parser = LineageParser("COPY mytable FROM '/tmp/f.csv'", Dialect.ANSI)
    assert parser.parser_name is None
    assert parser.clean_table_list == []
    assert parser.involved_tables == []
    parser = LineageParser("  copy mytable from '/tmp/f.csv'  ", Dialect.ANSI)
    assert parser.parser_name is None


def test_stage_copy_into_forms_are_kept() -> None:
    # Stage COPY INTO moves data between stages and tables: lineage.
    for query in (
        "COPY INTO mytable FROM @mystage",
        "COPY INTO @mystage FROM mytable",
    ):
        parser = LineageParser(query, Dialect.SNOWFLAKE)
        assert parser.parser_name is not None
        assert "mytable" in parser.clean_table_list


def test_create_trigger_and_routine_statements_are_filtered() -> None:
    for query, dialect in (
        (
            "CREATE TRIGGER trg AFTER INSERT ON t BEGIN SELECT 1; END",
            Dialect.ANSI,
        ),
        (
            "CREATE FUNCTION f() RETURNS INT AS 'SELECT 1' LANGUAGE sql",
            Dialect.POSTGRES,
        ),
        (
            "CREATE OR REPLACE PROCEDURE p() AS BEGIN SELECT 1; END",
            Dialect.SNOWFLAKE,
        ),
    ):
        parser = LineageParser(query, dialect)
        assert parser.parser_name is None
        assert parser.clean_table_list == []


def test_clean_raw_query_unescapes_newlines() -> None:
    assert clean_raw_query("SELECT *\\nFROM t") == "SELECT *\nFROM t"
    assert clean_raw_query(None) == ""
    assert clean_raw_query("   ") == ""


def test_clean_table_name_tolerates_schema_less_path_objects() -> None:
    # Belt-and-braces for the COPY filter: a path object reaching the
    # name function yields its path string instead of raising, so it
    # can be skipped downstream as an unbindable name.
    from collate_sqllineage.core.models import Path

    assert clean_table_name(Path("/tmp/f.csv")) == "/tmp/f.csv"


def test_involved_tables_include_targets() -> None:
    values = LineageParser("INSERT INTO t (a) VALUES (1)", Dialect.ANSI)
    assert _names(values.involved_tables) == ["t"]
    created = LineageParser("CREATE TABLE t (a INT)", Dialect.ANSI)
    assert _names(created.involved_tables) == ["t"]
    ctas = LineageParser(
        "INSERT INTO analytics.daily_orders (id) SELECT o.id FROM shop.orders o",
        Dialect.ANSI,
    )
    assert _names(ctas.involved_tables) == ["analytics.daily_orders", "shop.orders"]


def test_merge_when_matched_parses_without_tail_stripping() -> None:
    # The MERGE tail strip is deliberately omitted: SqlGlot parses
    # WHEN MATCHED clauses, so the merge's source and target resolve.
    parser = LineageParser(
        "MERGE INTO target t USING source s ON t.id = s.id "
        "WHEN MATCHED THEN UPDATE SET t.v = s.v "
        "WHEN NOT MATCHED THEN INSERT (id, v) VALUES (s.id, s.v)",
        Dialect.ANSI,
    )
    assert _names(parser.source_tables) == ["source"]
    assert _names(parser.target_tables) == ["target"]


def test_sqlglot_wins_simple_select_and_tables_are_cleaned() -> None:
    parser = LineageParser(
        "SELECT a.id, b.name FROM shop.orders a JOIN shop.customers b ON a.cust_id = b.id",
        Dialect.POSTGRES,
    )
    assert parser.parser_name == "SqlGlot"
    assert _names(parser.source_tables) == ["shop.customers", "shop.orders"]
    assert parser.target_tables == []
    assert parser.clean_table_list == ["shop.customers", "shop.orders"]
    assert _names(parser.involved_tables) == ["shop.customers", "shop.orders"]


def test_unqualified_table_names_drop_default_schema_marker() -> None:
    parser = LineageParser("SELECT * FROM orders", Dialect.ANSI)
    assert parser.clean_table_list == ["orders"]
    assert _names(parser.source_tables) == ["orders"]


def test_clean_table_names_preserve_case_as_written() -> None:
    parser = LineageParser("SELECT * FROM SHOP.Orders", Dialect.SNOWFLAKE)
    assert parser.clean_table_list == ["SHOP.Orders"]


def test_column_lineage_insert_select() -> None:
    parser = LineageParser(
        "INSERT INTO analytics.daily_orders (id, total) "
        "SELECT o.id, o.amt FROM shop.orders o",
        Dialect.ANSI,
    )
    assert _names(parser.target_tables) == ["analytics.daily_orders"]
    pairs = {(str(source), str(target)) for source, target in parser.column_lineage}
    assert ("shop.orders.id", "analytics.daily_orders.id") in pairs
    assert ("shop.orders.amt", "analytics.daily_orders.total") in pairs


def test_intermediate_tables_from_temp_table_flow() -> None:
    parser = LineageParser(
        "CREATE TEMP TABLE tmp AS SELECT a FROM t1; "
        "INSERT INTO t2 SELECT a FROM tmp",
        Dialect.ANSI,
    )
    assert _names(parser.intermediate_tables) == ["tmp"]
    assert "tmp" in parser.clean_table_list
    assert _names(parser.target_tables) == ["t2"]


def test_table_aliases_map_alias_and_name() -> None:
    parser = LineageParser(
        "SELECT * FROM shop.orders o JOIN shop.customers c ON o.cust_id = c.id",
        Dialect.POSTGRES,
    )
    aliases = parser.table_aliases
    assert clean_table_name(aliases["o"]) == "shop.orders"
    assert clean_table_name(aliases["c"]) == "shop.customers"
    assert clean_table_name(aliases["shop.orders"]) == "shop.orders"


def test_table_joins_from_join_on_equality() -> None:
    parser = LineageParser(
        "SELECT * FROM a.orders o JOIN b.customers c "
        "ON o.cust_id = c.id AND o.region = c.region",
        Dialect.POSTGRES,
    )
    joins = parser.table_joins
    assert sorted(joins) == ["a.orders", "b.customers"]
    orders_joins = {
        (entry.table_column.column, tuple((c.table, c.column) for c in entry.joined_with))
        for entry in joins["a.orders"]
    }
    assert ("cust_id", (("b.customers", "id"),)) in orders_joins
    assert ("region", (("b.customers", "region"),)) in orders_joins
    customers_joins = {
        (entry.table_column.column, tuple((c.table, c.column) for c in entry.joined_with))
        for entry in joins["b.customers"]
    }
    assert ("id", (("a.orders", "cust_id"),)) in customers_joins


def test_table_joins_from_where_equality_and_unqualified_skipped() -> None:
    parser = LineageParser(
        "SELECT * FROM a.orders o, b.customers c "
        "WHERE o.cust_id = c.id AND status = 'OPEN'",
        Dialect.POSTGRES,
    )
    assert "a.orders" in parser.table_joins
    assert "b.customers" in parser.table_joins
    # The unqualified `status` comparison and the literal contribute no join.
    assert all(
        entry.table_column.column == "cust_id" for entry in parser.table_joins["a.orders"]
    )


def test_table_joins_serialize_to_spec_shape() -> None:
    parser = LineageParser(
        "SELECT * FROM a.orders o JOIN b.customers c ON o.cust_id = c.id",
        Dialect.POSTGRES,
    )
    entry = parser.table_joins["a.orders"][0]
    assert entry.to_dict() == {
        "tableColumn": {"table": "a.orders", "column": "cust_id"},
        "joinedWith": [{"table": "b.customers", "column": "id"}],
    }


def test_sqlparse_fallback_rescues_malformed_query() -> None:
    parser = LineageParser("SELECT * FROM t WHERE x =", Dialect.ANSI)
    assert parser.parser_name == "SqlParse"
    assert _names(parser.source_tables) == ["t"]
    assert [failure.parser for failure in parser.failures] == ["SqlGlot", "SqlFluff"]
    assert len(query_parsing_failures().failures()) == 2


def test_forced_sqlfluff_wins_without_sqlglot_attempt() -> None:
    parser = LineageParser(
        "SELECT * FROM orders", Dialect.ANSI, parser_type=QueryParserType.SQLFLUFF
    )
    assert parser.parser_name == "SqlFluff"
    assert parser.failures == []


def test_sqlglot_unknown_dialect_falls_through_to_sqlfluff() -> None:
    # sqlglot has no mariadb dialect; the cascade must fall through to
    # SqlFluff instead of failing the query.
    parser = LineageParser("SELECT * FROM orders", Dialect.MARIADB)
    assert parser.parser_name == "SqlFluff"
    assert [failure.parser for failure in parser.failures] == ["SqlGlot"]


def test_all_attempts_failing_yields_empty_views_not_an_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _always_fail(func, timeout_seconds):
        raise RuntimeError("boom")

    monkeypatch.setattr(parser_module, "_run_with_timeout", _always_fail)
    parser = LineageParser("SELECT * FROM orders", Dialect.ANSI)
    assert parser.parser_name is None
    assert parser.source_tables == []
    assert parser.clean_table_list == []
    assert parser.column_lineage == []
    assert parser.table_joins == {}
    assert parser.suffixed_query_hash == parser.query_hash
    assert [failure.parser for failure in parser.failures] == [
        "SqlGlot",
        "SqlFluff",
        "SqlParse",
    ]


def test_empty_and_none_queries_have_no_parser() -> None:
    for raw in (None, "", "   \n  "):
        parser = LineageParser(raw, Dialect.ANSI)
        assert parser.parser_name is None
        assert parser.clean_table_list == []
        assert parser.masked_query == ""


def test_timeout_helper_enforces_budget() -> None:
    def _slow():
        time.sleep(0.5)
        return "done"

    with pytest.raises(TimeoutError):
        parser_module._run_with_timeout(_slow, 0.05)


def test_masking_replaces_strings_numbers_and_in_lists() -> None:
    masked = mask_query(
        "SELECT * FROM t WHERE name = 'Alice' AND amt > 10 "
        "AND id IN (1, 2, 3) AND dt >= '2026-01-01'"
    )
    assert masked == (
        "SELECT * FROM t WHERE name = ? AND amt > ? "
        "AND id IN (?, ?, ?) AND dt >= ?"
    )
    assert "Alice" not in masked
    assert "2026-01-01" not in masked


def test_masking_preserves_identifiers_keywords_and_null() -> None:
    masked = mask_query(
        'SELECT "My Col", [bracketed], `backtick`, t1.col2 FROM "orders" '
        "WHERE x IS NULL AND flag = TRUE AND n = 42"
    )
    assert '"My Col"' in masked
    assert "[bracketed]" in masked
    assert "`backtick`" in masked
    assert '"orders"' in masked
    assert "NULL" in masked
    assert "TRUE" in masked
    assert masked.endswith("n = ?")


def test_mask_query_masks_dollar_quoted_strings() -> None:
    # Dollar-quoted strings are dialect syntax the dialect-blind
    # SqlParse walk cannot lex; the dialect-aware stage must mask
    # them on every dollar-quote dialect.
    for dialect in (Dialect.SNOWFLAKE, Dialect.POSTGRES, Dialect.REDSHIFT):
        assert (
            mask_query("SELECT * FROM t WHERE x = $$secret$$", dialect)
            == "SELECT * FROM t WHERE x = ?"
        )
    assert (
        mask_query("SELECT * FROM t WHERE x = $tag$secret$tag$", Dialect.SNOWFLAKE)
        == "SELECT * FROM t WHERE x = ?"
    )


def test_mask_query_masks_mixed_dollar_and_plain_literals() -> None:
    # The union masks both kinds in one query. Chaining the stages
    # would lose one: masked placeholders do not re-parse.
    assert (
        mask_query(
            "SELECT * FROM t WHERE a = $$secret$$ AND b = 'plain' AND c = 42",
            Dialect.SNOWFLAKE,
        )
        == "SELECT * FROM t WHERE a = ? AND b = ? AND c = ?"
    )


def test_mask_query_union_covers_each_stage_blind_spots() -> None:
    # SqlFluff leaves Snowflake DATE literals and Redshift hex
    # literals unmasked; SqlParse catches them. The union masks
    # both, while the DATE keyword itself survives.
    assert (
        mask_query("SELECT * FROM t WHERE d = DATE '2026-01-01'", Dialect.SNOWFLAKE)
        == "SELECT * FROM t WHERE d = DATE ?"
    )
    assert (
        mask_query("SELECT * FROM t WHERE x = 0x1F", Dialect.REDSHIFT)
        == "SELECT * FROM t WHERE x = ?"
    )


def test_mask_query_keeps_backtick_identifiers_and_placeholders() -> None:
    # A query one stage cannot parse still masks through the other
    # stage; identifiers and parameter markers are not literals.
    assert (
        mask_query("SELECT `id`, `name` FROM t WHERE x = 'secret'", Dialect.SNOWFLAKE)
        == "SELECT `id`, `name` FROM t WHERE x = ?"
    )
    assert (
        mask_query("SELECT * FROM t WHERE x = $1 AND y = :named", Dialect.SNOWFLAKE)
        == "SELECT * FROM t WHERE x = $1 AND y = :named"
    )


def test_masking_handles_escaped_quotes_and_function_args() -> None:
    masked = mask_query("SELECT * FROM t WHERE name = 'it''s' AND total > abs(-5)")
    assert "it" not in masked
    assert masked == "SELECT * FROM t WHERE name = ? AND total > abs(?)"


def test_parser_masked_query_has_no_literals() -> None:
    parser = LineageParser(
        "SELECT * FROM shop.orders WHERE cust = 'Alice' AND amt > 10", Dialect.POSTGRES
    )
    assert parser.masked_query == "SELECT * FROM shop.orders WHERE cust = ? AND amt > ?"
    assert parser.query == "SELECT * FROM shop.orders WHERE cust = 'Alice' AND amt > 10"


def test_tsql_switch_rewrite_to_insert_select() -> None:
    rewritten = rewrite_switch_statements(
        "ALTER TABLE dbo.staging SWITCH TO dbo.orders"
    )
    assert rewritten == "INSERT INTO dbo.orders SELECT * FROM dbo.staging"


def test_tsql_switch_rewrite_with_partitions_and_brackets() -> None:
    rewritten = rewrite_switch_statements(
        "ALTER TABLE [dbo].[staging] SWITCH PARTITION 1 TO [dbo].[orders] PARTITION 1;"
    )
    assert rewritten == "INSERT INTO [dbo].[orders] SELECT * FROM [dbo].[staging];"


def test_tsql_switch_inside_string_is_not_rewritten() -> None:
    query = "SELECT 'ALTER TABLE a SWITCH TO b' FROM t"
    assert rewrite_switch_statements(query) == query


def test_tsql_switch_rewrite_feeds_parser_lineage() -> None:
    parser = LineageParser(
        "ALTER TABLE dbo.staging SWITCH TO dbo.orders", Dialect.TSQL
    )
    assert parser.parser_name == "SqlGlot"
    assert _names(parser.source_tables) == ["dbo.staging"]
    assert _names(parser.target_tables) == ["dbo.orders"]


def test_non_tsql_dialect_does_not_rewrite_switch() -> None:
    parser = LineageParser(
        "ALTER TABLE dbo.staging SWITCH TO dbo.orders", Dialect.POSTGRES
    )
    assert parser.masked_query == "ALTER TABLE dbo.staging SWITCH TO dbo.orders"


def test_dialect_map_covers_fork_connection_types() -> None:
    assert dialect_for_connection_type("Postgres") is Dialect.POSTGRES
    assert dialect_for_connection_type("Greenplum") is Dialect.POSTGRES
    assert dialect_for_connection_type("Timescale") is Dialect.POSTGRES
    assert dialect_for_connection_type("Mysql") is Dialect.MYSQL
    assert dialect_for_connection_type("Doris") is Dialect.MYSQL
    assert dialect_for_connection_type("MariaDB") is Dialect.MARIADB
    assert dialect_for_connection_type("Mssql") is Dialect.TSQL
    assert dialect_for_connection_type("AzureSQL") is Dialect.TSQL
    assert dialect_for_connection_type("Snowflake") is Dialect.SNOWFLAKE
    assert dialect_for_connection_type("Redshift") is Dialect.REDSHIFT
    assert dialect_for_connection_type("Databricks") is Dialect.DATABRICKS
    assert dialect_for_connection_type("UnityCatalog") is Dialect.DATABRICKS
    assert dialect_for_connection_type("SingleStore") is Dialect.MYSQL


def test_dialect_map_defaults_to_ansi() -> None:
    assert dialect_for_connection_type("SomethingNew") is Dialect.ANSI
    assert dialect_for_connection_type(None) is Dialect.ANSI
    assert dialect_for_connection_type("Informix") is Dialect.ANSI


def test_resolve_parser_type_absent_config_means_auto() -> None:
    assert resolve_parser_type(None) is QueryParserType.AUTO
    assert resolve_parser_type({}) is QueryParserType.AUTO
    assert resolve_parser_type(QueryParserConfig()) is QueryParserType.AUTO
    # A usage-shaped SourceConfig carries no queryParserConfig: Auto is
    # derived from the absent field, never hardcoded per pipeline type.
    config = SourceConfig(type="postgres-usage", service_name="svc")
    assert config.query_parser_config is None
    assert resolve_parser_type(config.query_parser_config) is QueryParserType.AUTO


def test_resolve_parser_type_honors_configured_type() -> None:
    assert (
        resolve_parser_type(QueryParserConfig(type="SqlFluff"))
        is QueryParserType.SQLFLUFF
    )
    assert resolve_parser_type({"type": "SqlGlot"}) is QueryParserType.SQLGLOT
    assert resolve_parser_type("SqlFluff") is QueryParserType.SQLFLUFF
    with pytest.raises(ValueError):
        resolve_parser_type({"type": "SqlParse"})
    with pytest.raises(ValueError):
        resolve_parser_type("Nope")
