# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Regression tests for the Leaf F integration fixups (D-L2c).

Three gaps surfaced when the B/C/D waves integrated; each section
below locks one fix, and nothing else:

- Fix 1: the SqlGlot extractor's dialect mapping — it must parse
  with the same effective dialect the cascade winner does, or every
  ANSI-resolved run binds zero queries.
- Fix 2: UDF candidate selection is case-insensitive — the runner
  bakes call text in upper case while extraction keeps the SQL's
  written case, so an exact comparison drops real UDFs.
- Fix 3: the view lineage channel migrated to the new ``process``
  signature, with its binding context sourced from the view entity
  itself (``FieldSource.ENTITY``).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from collate_sqllineage.core.parser.sqlglot.analyzer import (
    DIALECT_MAP,
    DIALECT_OVERRIDES,
)
from collate_sqllineage.core.parser.sqlglot.dialects import CollateSnowflake

from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.identifiers import (
    ExtractedName,
    ExtractionFailureReason,
    ExtractionResult,
    NameRole,
    StructuredIdentifier,
)
from smartmetadata_ingestion.lineage.sqlglot_extract import (
    _effective_sqlglot_dialect,
    extract_sqlglot_names,
)
from smartmetadata_ingestion.lineage.udf_names import udf_names_from_extraction
from smartmetadata_ingestion.lineage.view_lineage import (
    ViewItem,
    ViewLineageChannel,
    wrap_view_definition,
)
from smartmetadata_ingestion.records import BindingContext, FieldSource

# --- Fix 1: SqlGlot dialect mapping mirrors the cascade winner ---


def test_effective_sqlglot_dialect_matches_winner_for_every_dialect() -> None:
    # The expected value is computed from collate's own mapping data
    # exactly as SqlGlotLineageAnalyzer.__init__ computes it (map,
    # then override lookup on the mapped name), so this test locks
    # the extractor to the winner rather than to a second copy of
    # the table. The enumeration is asserted too: every product
    # Dialect member must be covered, with no silent omission.
    members = list(Dialect)
    assert len(members) == 20
    for dialect in members:
        mapped = DIALECT_MAP.get(dialect.value, dialect.value)
        expected = DIALECT_OVERRIDES.get(mapped, mapped)
        assert _effective_sqlglot_dialect(dialect) == expected


def test_ansi_dialect_maps_to_default_and_extracts() -> None:
    # "ansi" is not a sqlglot dialect: passing it straight through
    # raised ValueError and failed the whole extraction, so every
    # ANSI-resolved run bound zero queries. The winner maps it to
    # the default dialect (""), and the extractor must do the same.
    assert _effective_sqlglot_dialect(Dialect.ANSI) == ""
    result = extract_sqlglot_names(
        "INSERT INTO shop.orders (id) VALUES (1)", Dialect.ANSI
    )
    assert result.failed is False
    assert result.failure_reason is None
    targets = [
        name.identifier.texts
        for name in result.names
        if name.role is NameRole.TARGET and name.identifier is not None
    ]
    assert targets == [("shop", "orders")]


def test_snowflake_extraction_uses_winner_override_class() -> None:
    # Snowflake parses through the winner's override dialect class,
    # not sqlglot's stock Snowflake: identity, not equality, proves
    # the override is the dialect in use. Both parse call sites —
    # the main parse and the IDENTIFIER() literal re-parse — run
    # under it, so both shapes must still yield structured names.
    assert _effective_sqlglot_dialect(Dialect.SNOWFLAKE) is CollateSnowflake
    inserted = extract_sqlglot_names(
        "INSERT INTO db.sch.orders (id) VALUES (1)", Dialect.SNOWFLAKE
    )
    assert inserted.failed is False
    assert [
        name.identifier.texts
        for name in inserted.names
        if name.identifier is not None
    ] == [("db", "sch", "orders")]
    dynamic = extract_sqlglot_names(
        "SELECT * FROM IDENTIFIER('mydb.myschema.orders')", Dialect.SNOWFLAKE
    )
    assert dynamic.failed is False
    assert [
        (name.identifier.texts, name.role)
        for name in dynamic.names
        if name.identifier is not None
    ] == [(("mydb", "myschema", "orders"), NameRole.SOURCE)]


@pytest.mark.parametrize("dialect", [Dialect.IMPALA, Dialect.MARIADB, Dialect.VERTICA])
def test_unknown_passthrough_dialects_fail_closed_without_fallback(
    dialect: Dialect,
) -> None:
    # These values pass through the winner's map unchanged and
    # sqlglot still rejects them, so the SqlGlot branch never wins
    # for them in the cascade and the extractor is never consulted.
    # The extractor must fail closed exactly as the winner does,
    # not invent a fallback dialect that would parse the query
    # under semantics the winner never used.
    assert _effective_sqlglot_dialect(dialect) == dialect.value
    result = extract_sqlglot_names("SELECT * FROM orders", dialect)
    assert result.failed is True
    assert result.failure_reason is ExtractionFailureReason.PARSE_ERROR
    assert result.names == ()


# --- Fix 2: UDF candidate selection is case-insensitive ---


def _function_extraction(identifier: StructuredIdentifier) -> ExtractionResult:
    return ExtractionResult(
        names=(
            ExtractedName(
                identifier=identifier,
                role=NameRole.SOURCE,
                alias=None,
                statement_index=0,
                node_index=0,
                is_function=True,
            ),
        )
    )


@pytest.mark.parametrize(
    ("written", "quoted", "column_text"),
    [
        ("my_udf", False, "MY_UDF(db.public.orders.id)"),
        ("MY_UDF", False, "my_udf(db.public.orders.id)"),
        ("My_Udf", False, "mY_uDf(db.public.orders.id)"),
        ("My_UDF", True, "MY_UDF(db.public.orders.id)"),
    ],
)
def test_udf_selection_folds_case_but_returns_identifier_verbatim(
    written: str, quoted: bool, column_text: str
) -> None:
    # The comparison folds case on both sides — the runner bakes
    # the call upper-case, extraction keeps the written case — but
    # the identifier itself must come back one word unchanged:
    # case and quoted mark exactly as extracted, into binding.
    identifier = StructuredIdentifier.from_parts([(written, quoted)])
    selected = udf_names_from_extraction(
        _function_extraction(identifier), [column_text]
    )
    assert selected == [identifier]
    assert selected[0].leaf.text == written
    assert selected[0].leaf.quoted is quoted


def test_udf_selection_still_rejects_other_call_names() -> None:
    # Case folding must not become indiscriminate: a column path
    # naming a different function selects nothing.
    identifier = StructuredIdentifier.single("my_udf")
    assert (
        udf_names_from_extraction(
            _function_extraction(identifier), ["other_fn(db.public.orders.id)"]
        )
        == []
    )


def test_udf_selection_from_real_extraction_lowercase_query() -> None:
    # The exact query shape from the integration report: the query
    # writes my_udf in lower case, the runner bakes the column
    # text upper-case, and the UDF must still be selected — with
    # the extracted (lower-case) identifier, verbatim.
    extraction = extract_sqlglot_names(
        "INSERT INTO db.public.target "
        "SELECT my_udf(db.public.orders.id) FROM db.public.orders",
        Dialect.POSTGRES,
    )
    assert extraction.failed is False
    selected = udf_names_from_extraction(
        extraction, ["MY_UDF(DB.PUBLIC.ORDERS.ID)"]
    )
    assert [identifier.texts for identifier in selected] == [("my_udf",)]
    assert selected[0].leaf.text == "my_udf"


# --- Fix 3: view channel migrated to the new process signature ---


def test_field_source_entity_value() -> None:
    # Contract revision 7: context segments sourced from the entity
    # being processed itself carry this value on the wire.
    assert FieldSource.ENTITY.value == "entity"


class _CapturingProcessor:
    """Records the process call the channel makes; edges are out of
    scope here — the existing channel tests prove the real path."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def process(
        self,
        sql_text: str,
        *,
        context: BindingContext,
        target_override_fqn: str | None = None,
        **_kwargs: Any,
    ) -> SimpleNamespace:
        self.calls.append(
            {
                "sql_text": sql_text,
                "context": context,
                "target_override_fqn": target_override_fqn,
            }
        )
        return SimpleNamespace(edges=[], temp_hops=[])


class _CatalogedResolver:
    def table_exists(self, fqn: str) -> bool:
        return True


def test_view_channel_passes_entity_binding_context() -> None:
    # The view's own catalog position is the binding context: both
    # segments always carry values, both sources are ENTITY — never
    # a log row — and the target override still carries the view
    # FQN. The old database_name=/database_schema= call raised
    # TypeError under the new signature.
    processor = _CapturingProcessor()
    channel = ViewLineageChannel(
        processor,  # type: ignore[arg-type]
        _CatalogedResolver(),  # type: ignore[arg-type]
        SimpleNamespace(),  # type: ignore[arg-type]
        service_name="svc",
        override_view_lineage=False,
        incremental_lineage_processing=False,
        include_databases=[],
        exclude_databases=[],
        include_schemas=[],
        exclude_schemas=[],
        include_tables=[],
        exclude_tables=[],
    )
    definition = "SELECT id FROM db.public.orders"
    view = ViewItem(
        database="db", schema="public", name="orders_v", definition=definition
    )
    records, outcome, hops = channel.process_one(view)
    assert records == []
    assert hops == []
    assert outcome.seen == 1
    assert outcome.edges == 0
    assert len(processor.calls) == 1
    call = processor.calls[0]
    assert call["sql_text"] == wrap_view_definition(definition)
    assert call["context"] == BindingContext(
        database_name="db",
        database_schema="public",
        database_source=FieldSource.ENTITY,
        schema_source=FieldSource.ENTITY,
    )
    assert call["target_override_fqn"] == "svc.db.public.orders_v"
