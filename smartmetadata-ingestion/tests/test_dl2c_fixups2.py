# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Regression tests for the Leaf G integration fixups (D-L2c).

Two gaps remained after the F fixups integrated; each section below
locks one fix, and nothing else:

- Fix 1: the runner's intermediate view is not the extraction's
  INTERMEDIATE role — a runner-intermediate table is written by one
  statement and read by a later one, so its endpoint carries both
  the SOURCE and TARGET roles. Mapping it to INTERMEDIATE matched
  no extracted occurrence and dropped the temporary-table hop.
- Fix 2: the SqlFluff branch marks a CREATE VIEW target TARGET —
  the view being created is the first direct table_reference of the
  create_view_statement, the same shape the existing write-target
  rule already covers for the other write statements.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import NameRole
from smartmetadata_ingestion.lineage.parser import (
    PARSER_SQLFLUFF,
    LineageParser,
    QueryParserType,
)
from smartmetadata_ingestion.lineage.sqlfluff_extract import extract_sqlfluff_names
from smartmetadata_ingestion.lineage.view_lineage import wrap_view_definition

# --- Fix 1: runner-intermediate endpoints carry SOURCE and TARGET ---

_TEMP_SQL = (
    "INSERT INTO tmp_stage SELECT * FROM public.orders; "
    "INSERT INTO public.target SELECT * FROM tmp_stage"
)

_CTE_SQL = "WITH cte AS (SELECT * FROM public.orders) SELECT * FROM cte"


def test_runner_intermediate_endpoint_carries_source_and_target_roles() -> None:
    parser = LineageParser(_TEMP_SQL, dialect=Dialect.POSTGRES)
    assert [str(table) for table in parser.intermediate_tables] == [
        "<default>.tmp_stage"
    ]
    by_name = {
        str(table): descriptor
        for table, descriptor in zip(
            parser.involved_tables, parser._endpoint_descriptors(), strict=True
        )
    }
    descriptor = by_name["<default>.tmp_stage"]
    assert descriptor.roles == frozenset({NameRole.SOURCE, NameRole.TARGET})

    # The staging table appears twice in the extraction — written in
    # the first statement, read in the second — with no alias at
    # either occurrence, so under contract revision 9 its table
    # identity and its column attribution both confirm: the two
    # occurrences present a single attribution target.
    occurrences = [
        name
        for name in parser.structured_extraction.names
        if name.identifier is not None and name.identifier.texts == ("tmp_stage",)
    ]
    assert {name.role for name in occurrences} == {
        NameRole.TARGET,
        NameRole.SOURCE,
    }
    assert len(occurrences) == 2
    associations = {
        str(table): association
        for table, association in zip(
            parser.involved_tables, parser.endpoint_associations, strict=True
        )
    }
    association = associations["<default>.tmp_stage"]
    assert association.identifier is not None
    assert association.identifier.texts == ("tmp_stage",)
    assert association.reason is None
    assert association.column_attribution_confirmed
    assert association.column_reason is None
    # The neighbours confirm as before: the remap touches only the
    # intermediate view's contribution.
    assert associations["public.orders"].identifier is not None
    assert associations["public.orders"].identifier.texts == ("public", "orders")
    assert associations["public.orders"].column_attribution_confirmed
    assert associations["public.target"].identifier is not None
    assert associations["public.target"].identifier.texts == ("public", "target")
    assert associations["public.target"].column_attribution_confirmed


@pytest.mark.parametrize(
    "parser_type", [None, QueryParserType.SQLFLUFF], ids=["cascade", "sqlfluff"]
)
def test_cte_query_endpoints_unaffected_by_intermediate_remap(
    parser_type: QueryParserType | None,
) -> None:
    if parser_type is None:
        parser = LineageParser(_CTE_SQL, dialect=Dialect.POSTGRES)
    else:
        parser = LineageParser(
            _CTE_SQL, dialect=Dialect.POSTGRES, parser_type=parser_type
        )
    # CTE references never appear in a runner view: the intermediate
    # view is empty, so the remap has nothing to act on here.
    assert parser.intermediate_tables == []
    assert [str(table) for table in parser.involved_tables] == ["public.orders"]
    descriptors = parser._endpoint_descriptors()
    assert len(descriptors) == 1
    assert descriptors[0].roles == frozenset({NameRole.SOURCE})
    assert NameRole.INTERMEDIATE not in descriptors[0].roles
    (association,) = parser.endpoint_associations
    assert association.identifier is not None
    assert association.identifier.texts == ("public", "orders")
    assert association.column_attribution_confirmed
    # INTERMEDIATE still lives only on the extraction side, where
    # the CTE reference belongs. Order differs by branch and proves
    # nothing, so the occurrences are compared as a set.
    assert {
        (name.identifier.texts, name.role)
        for name in parser.structured_extraction.names
        if name.identifier is not None
    } == {
        (("cte",), NameRole.INTERMEDIATE),
        (("public", "orders"), NameRole.SOURCE),
    }


# --- Fix 2: SqlFluff CREATE VIEW targets are TARGET ---


@pytest.mark.parametrize(
    ("sql", "dialect", "target_texts"),
    [
        (
            wrap_view_definition("SELECT id FROM public.orders"),
            Dialect.MARIADB,
            ("__lineage_view__",),
        ),
        (
            "CREATE VIEW myview AS SELECT id FROM public.orders",
            Dialect.POSTGRES,
            ("myview",),
        ),
        (
            "CREATE VIEW sch.myview AS SELECT id FROM public.orders",
            Dialect.POSTGRES,
            ("sch", "myview"),
        ),
        (
            "CREATE OR REPLACE VIEW myview AS SELECT id FROM public.orders",
            Dialect.POSTGRES,
            ("myview",),
        ),
        (
            "CREATE VIEW myview (a, b) AS SELECT id, email FROM public.orders",
            Dialect.POSTGRES,
            ("myview",),
        ),
    ],
    ids=["wrapped-mariadb", "bare", "qualified", "or-replace", "column-list"],
)
def test_create_view_target_is_target_in_sqlfluff_branch(
    sql: str, dialect: Dialect, target_texts: tuple[str, ...]
) -> None:
    result = extract_sqlfluff_names(sql, dialect)
    assert not result.failed
    assert [name.role for name in result.names] == [
        NameRole.TARGET,
        NameRole.SOURCE,
    ]
    assert result.names[0].identifier is not None
    assert result.names[0].identifier.texts == target_texts
    assert result.names[1].identifier is not None
    assert result.names[1].identifier.texts == ("public", "orders")


def test_create_view_target_confirms_through_sqlfluff_winner_parser() -> None:
    parser = LineageParser(
        wrap_view_definition("SELECT id FROM public.orders"),
        dialect=Dialect.MARIADB,
        parser_type=QueryParserType.SQLFLUFF,
    )
    extraction = parser.structured_extraction
    assert extraction.branch == PARSER_SQLFLUFF
    assert not extraction.failed
    assert [name.role for name in extraction.names] == [
        NameRole.TARGET,
        NameRole.SOURCE,
    ]
    associations = {
        str(table): association
        for table, association in zip(
            parser.involved_tables, parser.endpoint_associations, strict=True
        )
    }
    target = associations["<default>.__lineage_view__"]
    assert target.identifier is not None
    assert target.identifier.texts == ("__lineage_view__",)
    assert target.column_attribution_confirmed
    assert associations["public.orders"].identifier is not None
    assert associations["public.orders"].identifier.texts == ("public", "orders")
