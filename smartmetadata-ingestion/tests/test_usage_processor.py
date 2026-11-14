# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import pytest

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.parser import QueryParserType
from smartmetadata_ingestion.records import TableQueryRecord
from smartmetadata_ingestion.usage import processor
from smartmetadata_ingestion.usage.processor import QueryParseFailure, parse_sql_statement


def _record(**overrides):
    values = {
        "query": "SELECT * FROM shop.orders",
        "service_name": "warehouse",
    }
    values.update(overrides)
    return TableQueryRecord(**values)


def test_parse_counts_target_only_insert_values() -> None:
    parsed = parse_sql_statement(
        _record(query="INSERT INTO shop.orders (id) VALUES (1)"),
        Dialect.ANSI,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == ["shop.orders"]
    assert parsed.query_type == "INSERT"


def test_parse_counts_create_table() -> None:
    parsed = parse_sql_statement(
        _record(query="CREATE TABLE shop.orders (id INT)"),
        Dialect.ANSI,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == ["shop.orders"]
    assert parsed.query_type == "CREATE"


def test_parse_returns_none_when_query_touches_no_tables() -> None:
    assert (
        parse_sql_statement(_record(query="SELECT 1"), Dialect.ANSI, QueryParserType.AUTO) is None
    )


def test_parse_carries_record_fields_and_parser_views() -> None:
    parsed = parse_sql_statement(
        _record(
            query="SELECT o.id FROM shop.orders o JOIN shop.customers c ON o.cust_id = c.id",
            query_type="SELECT",
            user_name="alice",
            database_name="shop",
            database_schema="public",
            duration=12.5,
            cost=3.0,
            analysis_date="2026-11-13T15:30:00Z",
        ),
        Dialect.POSTGRES,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.tables == ["shop.customers", "shop.orders"]
    assert parsed.database_name == "shop"
    assert parsed.database_schema == "public"
    assert parsed.sql.startswith("SELECT o.id")
    assert parsed.query_type == "SELECT"
    assert parsed.exclude_usage is False
    assert parsed.dialect == "postgres"
    assert parsed.user_name == "alice"
    assert parsed.duration == 12.5
    assert parsed.cost == 3.0
    assert parsed.service_name == "warehouse"
    assert parsed.joins, "the join must surface in the parsed views"


def test_parse_truncates_analysis_date_to_utc_day() -> None:
    parsed = parse_sql_statement(
        _record(analysis_date="2026-11-13T15:30:00Z"), Dialect.ANSI, QueryParserType.AUTO
    )
    assert parsed is not None
    expected = int(datetime(2026, 11, 13, tzinfo=timezone.utc).timestamp() * 1000)
    assert parsed.date == str(expected)


def test_parse_falls_back_to_today_for_missing_analysis_date() -> None:
    parsed = parse_sql_statement(_record(), Dialect.ANSI, QueryParserType.AUTO)
    assert parsed is not None
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    assert parsed.date == str(int(today.timestamp() * 1000))


def test_parse_derives_query_type_from_leading_keyword() -> None:
    parsed = parse_sql_statement(
        _record(
            query="/* nightly */ -- load\n"
            "INSERT INTO shop.orders SELECT * FROM staging.orders"
        ),
        Dialect.ANSI,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.query_type == "INSERT"


def test_parse_leaves_query_type_unset_for_cte() -> None:
    parsed = parse_sql_statement(
        _record(query="WITH recent AS (SELECT * FROM shop.orders) SELECT * FROM recent"),
        Dialect.ANSI,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.query_type is None


def test_parse_prefers_record_query_type_over_derivation() -> None:
    parsed = parse_sql_statement(
        _record(query="SELECT * FROM shop.orders", query_type="SELECT"),
        Dialect.ANSI,
        QueryParserType.AUTO,
    )
    assert parsed is not None
    assert parsed.query_type == "SELECT"


def test_parse_carries_masked_text_and_raw_hash() -> None:
    query = "SELECT * FROM shop.orders WHERE total > 100"
    parsed = parse_sql_statement(_record(query=query), Dialect.ANSI, QueryParserType.AUTO)
    assert parsed is not None
    assert "100" not in parsed.masked_sql
    assert "?" in parsed.masked_sql
    assert parsed.query_hash == hashlib.md5(query.encode()).hexdigest()[:8]
    assert parsed.parser_name in ("SqlGlot", "SqlFluff", "SqlParse")


def test_parse_failure_raises_query_parse_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(*args, **kwargs):
        raise RuntimeError("parser exploded")

    monkeypatch.setattr(processor, "LineageParser", _boom)
    with pytest.raises(QueryParseFailure, match="failed to parse query"):
        parse_sql_statement(_record(), Dialect.ANSI, QueryParserType.AUTO)
