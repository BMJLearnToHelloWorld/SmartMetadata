# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from smartmetadata_ingestion.datatypes import map_postgres_type


def test_maps_common_postgres_types() -> None:
    assert map_postgres_type("integer") == "INT"
    assert map_postgres_type("timestamp with time zone") == "TIMESTAMPZ"
    assert map_postgres_type("character varying") == "VARCHAR"
    assert map_postgres_type("jsonb") == "JSON"
    assert map_postgres_type("integer[]") == "ARRAY"


def test_unknown_type_falls_back_to_string() -> None:
    assert map_postgres_type("cidr") == "STRING"
    assert map_postgres_type(None) == "STRING"
