# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from smartmetadata_ingestion.datatypes import (
    check_col_length,
    map_doris_type,
    map_mysql_type,
    map_postgres_type,
    map_snowflake_type,
)


def test_maps_common_postgres_types() -> None:
    assert map_postgres_type("integer") == "INT"
    assert map_postgres_type("timestamp with time zone") == "TIMESTAMPZ"
    assert map_postgres_type("character varying") == "VARCHAR"
    assert map_postgres_type("jsonb") == "JSON"
    assert map_postgres_type("integer[]") == "ARRAY"


def test_maps_mysql_and_snowflake_types() -> None:
    assert map_mysql_type("int") == "INT"
    assert map_mysql_type("varchar") == "VARCHAR"
    assert map_mysql_type("datetime") == "DATETIME"
    assert map_mysql_type("json") == "JSON"
    assert map_snowflake_type("NUMBER") == "NUMBER"
    assert map_snowflake_type("TIMESTAMP_TZ") == "TIMESTAMPZ"
    assert map_snowflake_type("VARIANT") == "JSON"
    assert map_snowflake_type("ARRAY") == "ARRAY"


def test_unknown_type_falls_back_to_string() -> None:
    assert map_postgres_type("cidr") == "STRING"
    assert map_postgres_type(None) == "STRING"
    assert map_mysql_type(None) == "STRING"
    assert map_snowflake_type("unknown_udt") == "STRING"


def test_check_col_length_keeps_length_for_lengthed_types() -> None:
    assert check_col_length("CHAR", 10) == 10
    assert check_col_length("VARCHAR", 20) == 20
    assert check_col_length("BINARY", 16) == 16
    assert check_col_length("VARBINARY", 32) == 32


def test_check_col_length_unbounded_length_defaults_to_one() -> None:
    assert check_col_length("VARCHAR", None) == 1
    assert check_col_length("CHAR", 0) == 1


def test_check_col_length_drops_length_for_other_types() -> None:
    # MySQL reports 4294967295 (2^32-1) for LONGTEXT/LONGBLOB; the
    # value must never reach the wire for a non-lengthed type.
    for data_type in ("TEXT", "BLOB", "MEDIUMTEXT", "LONGBLOB", "INT", "DECIMAL", "JSON"):
        assert check_col_length(data_type, 4294967295) is None
        assert check_col_length(data_type, 20) is None


def test_check_col_length_matches_type_case_insensitively() -> None:
    assert check_col_length("varchar", 20) == 20
    assert check_col_length("text", 4294967295) is None


def test_doris_version_suffixed_types_strip_to_base() -> None:
    # Pin DorisSource._parse_type: DATEV2 -> DATE, DECIMALV3 -> DECIMAL.
    assert map_doris_type("DATEV2") == "DATE"
    assert map_doris_type("datetimev2(6)") == "DATETIME"
    assert map_doris_type("DECIMALV3(9,0)") == "DECIMAL"
    assert map_doris_type("decimalv2") == "DECIMAL"
    assert map_doris_type("datev2") == "DATE"


def test_doris_native_types() -> None:
    # Native names map to themselves: the pin's Doris path puts
    # _parse_type output directly into dataType (no get_column_type
    # pass), and all of these are valid spec-enum members.
    assert map_doris_type("largeint") == "LARGEINT"
    assert map_doris_type("variant") == "VARIANT"
    assert map_doris_type("ipv4") == "IPV4"
    assert map_doris_type("ipv6") == "IPV6"
    assert map_doris_type("hll") == "HLL"
    assert map_doris_type("bitmap") == "BITMAP"
    assert map_doris_type("quantile_state") == "QUANTILE_STATE"
    assert map_doris_type("agg_state") == "AGG_STATE"
    assert map_doris_type("string") == "STRING"
    # Doris has no OBJECT type; the pin would drop such a column, the
    # fork labels it UNKNOWN instead of inventing a mapping.
    assert map_doris_type("object") == "UNKNOWN"


def test_doris_complex_type_prefixes() -> None:
    assert map_doris_type("array<int(11)>") == "ARRAY"
    assert map_doris_type("map<string,int>") == "MAP"
    assert map_doris_type("struct<a:int>") == "STRUCT"
    assert map_doris_type("int[]") == "ARRAY"


def test_doris_mysql_compatible_names_still_map() -> None:
    assert map_doris_type("varchar") == "VARCHAR"
    assert map_doris_type("bigint") == "BIGINT"
    assert map_doris_type("decimal") == "DECIMAL"
    assert map_doris_type("longtext") == "TEXT"
    assert map_doris_type("datetime") == "DATETIME"


def test_doris_unknown_and_falsy_fall_back_to_unknown() -> None:
    # Deliberately NOT the fork's STRING default: the pin drops a column
    # whose parsed type is not an enum member, and the fork never drops
    # columns on type mapping, so UNKNOWN is the honest equivalent.
    assert map_doris_type(None) == "UNKNOWN"
    assert map_doris_type("") == "UNKNOWN"
    assert map_doris_type("some_future_type") == "UNKNOWN"


def test_doris_mapping_is_case_insensitive() -> None:
    assert map_doris_type("VARCHAR") == "VARCHAR"
    assert map_doris_type("LargeInt") == "LARGEINT"
    assert map_doris_type("IPV4") == "IPV4"
    assert map_doris_type("Array<String>") == "ARRAY"
