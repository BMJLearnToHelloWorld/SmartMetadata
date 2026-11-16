# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Regression tests for the Leaf H integration fixups (D-L2c).

Two gaps remained after the G fixups integrated; each section below
locks one fix, and nothing else:

- Fix 1: column attribution confirms when every occurrence of an
  identifier carries the same alias (contract revision 9). What
  confirmation must establish is the attribution target, not the
  occurrence count, so a staging table written once and read once
  confirms its columns, while a multi-alias self-join still does
  not. End-to-end recovery of the existing
  ``test_temp_graph_flushes_composed_edge_at_end`` is proven by the
  gate run, not by a test here; that existing test is untouched.
- Fix 2: the SqlFluff branch marks a CREATE MATERIALIZED VIEW
  target TARGET — the view being created is the first direct
  table_reference of the create_materialized_view_statement, the
  same shape the existing write-target rule already covers. The
  MariaDB dialect has no materialized-view syntax at all, so its
  case locks the fail-closed parse failure instead of a role.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    EndpointDescriptor,
    ExtractedName,
    ExtractionFailureReason,
    NameRole,
    StructuredIdentifier,
    UnconfirmedReason,
    associate_endpoints,
)
from smartmetadata_ingestion.lineage.parser import LineageParser
from smartmetadata_ingestion.lineage.sqlfluff_extract import extract_sqlfluff_names

# --- Fix 1: alias-consistent occurrences confirm column attribution ---


def _name(
    texts: tuple[str, ...],
    role: NameRole = NameRole.SOURCE,
    alias: str | None = None,
    statement_index: int = 0,
    node_index: int = 0,
) -> ExtractedName:
    return ExtractedName(
        identifier=StructuredIdentifier.from_parts(
            [(text, False) for text in texts]
        ),
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


def test_temp_table_shape_confirms_columns() -> None:
    # The temporary-table shape: one identifier, two occurrences
    # (written in one statement, read in the next), neither aliased.
    # Both occurrences present a single attribution target, so the
    # columns confirm; under the old exactly-one-occurrence rule
    # this shape could never confirm.
    names = [
        _name(("tmp_stage",), role=NameRole.TARGET, statement_index=0),
        _name(("tmp_stage",), role=NameRole.SOURCE, statement_index=1, node_index=1),
    ]
    descriptor = _descriptor(
        "tmp_stage",
        alias="tmp_stage",
        roles=frozenset({NameRole.SOURCE, NameRole.TARGET}),
    )
    (association,) = associate_endpoints([descriptor], names)
    assert association.identifier is not None
    assert association.identifier.texts == ("tmp_stage",)
    assert association.reason is None
    assert association.column_attribution_confirmed is True
    assert association.column_reason is None


def test_multi_alias_self_join_columns_stay_unconfirmed() -> None:
    # The design's explicit case: two aliases for one table confirm
    # the table once but leave columns unconfirmed, because no
    # occurrence can say which alias a column belonged to. The
    # refined rule keeps this: the aliases differ.
    names = [
        _name(("orders",), alias="o1", node_index=0),
        _name(("orders",), alias="o2", node_index=1),
    ]
    associations = associate_endpoints([_descriptor("orders", alias="o1")], names)
    assert associations[0].identifier is not None
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is False
    assert (
        associations[0].column_reason
        is UnconfirmedReason.COLUMN_ATTRIBUTION_AMBIGUOUS
    )


@pytest.mark.parametrize(
    ("descriptor_alias", "confirmed"),
    [
        ("o", True),
        ("orders", False),
        (None, False),
    ],
    ids=["endpoint-pins", "default-alias", "no-alias"],
)
def test_same_alias_twice_pins_by_endpoint(
    descriptor_alias: str | None, confirmed: bool
) -> None:
    # Two occurrences under one alias present a single target, so
    # confirmation turns entirely on the existing alias-pinning
    # check: only an endpoint carrying that alias pins it.
    names = [
        _name(("orders",), alias="o", node_index=0),
        _name(("orders",), alias="o", node_index=1),
    ]
    associations = associate_endpoints(
        [_descriptor("orders", alias=descriptor_alias)], names
    )
    assert associations[0].identifier is not None
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is confirmed


def test_mixed_aliased_and_unaliased_occurrences_stay_unconfirmed() -> None:
    # An absent alias counts as one alias value, so a mix of an
    # unaliased occurrence and an aliased one presents two targets
    # and stays unconfirmed.
    names = [
        _name(("orders",), node_index=0),
        _name(("orders",), alias="o", node_index=1),
    ]
    associations = associate_endpoints([_descriptor("orders")], names)
    assert associations[0].identifier is not None
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is False
    assert (
        associations[0].column_reason
        is UnconfirmedReason.COLUMN_ATTRIBUTION_AMBIGUOUS
    )


@pytest.mark.parametrize(
    ("occurrence_alias", "descriptor_alias", "confirmed"),
    [
        (None, None, True),
        ("o", "o", True),
        ("o", "orders", False),
    ],
    ids=["unaliased", "alias-pins", "default-alias-skips"],
)
def test_single_occurrence_behaviour_unchanged(
    occurrence_alias: str | None,
    descriptor_alias: str | None,
    confirmed: bool,
) -> None:
    # A single occurrence has exactly one alias by construction, so
    # the refined rule reduces to the old rule here: behaviour for
    # single occurrences is identical before and after the fix.
    names = [_name(("orders",), alias=occurrence_alias)]
    associations = associate_endpoints(
        [_descriptor("orders", alias=descriptor_alias)], names
    )
    assert associations[0].identifier is not None
    assert associations[0].identifier.texts == ("orders",)
    assert associations[0].column_attribution_confirmed is confirmed


def test_temp_table_shape_confirms_columns_through_parser() -> None:
    parser = LineageParser(
        "INSERT INTO tmp_stage SELECT * FROM public.orders; "
        "INSERT INTO public.target SELECT * FROM tmp_stage",
        dialect=Dialect.POSTGRES,
    )
    occurrences = [
        name
        for name in parser.structured_extraction.names
        if name.identifier is not None and name.identifier.texts == ("tmp_stage",)
    ]
    assert len(occurrences) == 2
    assert {name.role for name in occurrences} == {
        NameRole.TARGET,
        NameRole.SOURCE,
    }
    assert all(name.alias is None for name in occurrences)
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
    assert association.column_attribution_confirmed is True
    assert association.column_reason is None
    assert associations["public.orders"].column_attribution_confirmed
    assert associations["public.target"].column_attribution_confirmed


# --- Fix 2: SqlFluff CREATE MATERIALIZED VIEW targets are TARGET ---

_MV_SQL = "CREATE MATERIALIZED VIEW myview AS SELECT id FROM public.orders"


@pytest.mark.parametrize(
    "dialect",
    [Dialect.POSTGRES, Dialect.BIGQUERY, Dialect.CLICKHOUSE, Dialect.REDSHIFT],
    ids=["postgres", "bigquery", "clickhouse", "redshift"],
)
def test_create_materialized_view_target_is_target_in_sqlfluff_branch(
    dialect: Dialect,
) -> None:
    # These four dialects parse the statement as a
    # create_materialized_view_statement whose first direct
    # table_reference is the view being created; the fix marks it
    # TARGET while the SELECT's source stays SOURCE.
    result = extract_sqlfluff_names(_MV_SQL, dialect)
    assert not result.failed
    assert [name.role for name in result.names] == [
        NameRole.TARGET,
        NameRole.SOURCE,
    ]
    assert result.names[0].identifier is not None
    assert result.names[0].identifier.texts == ("myview",)
    assert result.names[1].identifier is not None
    assert result.names[1].identifier.texts == ("public", "orders")


def test_create_materialized_view_target_is_target_in_snowflake() -> None:
    # Snowflake's grammar parses the statement as a
    # create_view_statement, already covered by the CREATE VIEW fix,
    # so the target is TARGET here too; this locks that the
    # materialized-view form keeps that role.
    result = extract_sqlfluff_names(_MV_SQL, Dialect.SNOWFLAKE)
    assert not result.failed
    assert [name.role for name in result.names] == [
        NameRole.TARGET,
        NameRole.SOURCE,
    ]
    assert result.names[0].identifier is not None
    assert result.names[0].identifier.texts == ("myview",)
    assert result.names[1].identifier is not None
    assert result.names[1].identifier.texts == ("public", "orders")


def test_create_materialized_view_fails_closed_in_mariadb() -> None:
    # MariaDB has no materialized-view syntax: the dialect rejects
    # the statement outright, so extraction fails closed with no
    # names rather than marking any role. The added statement type
    # is inert here because the node never appears.
    result = extract_sqlfluff_names(_MV_SQL, Dialect.MARIADB)
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
    assert result.names == ()
