# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from smartmetadata_ingestion.datatypes import (
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
