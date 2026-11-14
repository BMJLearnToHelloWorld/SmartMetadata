# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for the database sampler registry (design §2.3)."""

from __future__ import annotations

from smartmetadata_ingestion.profiler import (
    SAMPLER_BINDINGS,
    build_database_sampler,
    sampler_binding,
)

# The eleven fork database types with profiler sampler bindings, and
# the sample() arity each declares: (schema, table) for the 2-arg
# helpers, (database, schema, table) for the 3-arg ones.
EXPECTED_ARITY = {
    "databricks": True,
    "doris": False,
    "greenplum": True,
    "mariadb": False,
    "mssql": True,
    "mysql": False,
    "postgres": True,
    "redshift": True,
    "snowflake": True,
    "timescale": True,
    "unitycatalog": True,
}


def test_sampler_bindings_cover_the_eleven_database_types() -> None:
    assert set(SAMPLER_BINDINGS) == set(EXPECTED_ARITY)
    for source_type, takes_database in EXPECTED_ARITY.items():
        assert SAMPLER_BINDINGS[source_type].takes_database is takes_database
        assert isinstance(SAMPLER_BINDINGS[source_type].sampler, type)


def test_sampler_binding_normalizes_and_returns_none_for_unknown_types() -> None:
    assert sampler_binding("MySQL") is SAMPLER_BINDINGS["mysql"]
    assert sampler_binding("  postgres  ") is SAMPLER_BINDINGS["postgres"]
    assert sampler_binding("metabase") is None
    assert sampler_binding("kafka") is None
    assert sampler_binding("") is None


def test_build_database_sampler_returns_none_without_a_binding() -> None:
    assert build_database_sampler("metabase", {}) is None
    assert build_database_sampler("kafka", {}) is None
    assert build_database_sampler("", {}) is None
