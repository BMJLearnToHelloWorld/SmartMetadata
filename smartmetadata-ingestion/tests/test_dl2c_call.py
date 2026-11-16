# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Behavioral tests for the D-L2c CALL-name extraction rewrite and
the procedure channel's migrated call sites (design §5.5 CALL
entry, §6 test 5, contract §e2/§f, Leaf B scope).

The extraction matrix pins the rewrite: four-part names survive
whole, quoted dotted segments are never split, and all three quote
shapes keep their quoted flags. The channel tests use a resolver
stub speaking the new protocol to prove the call side passes a
structured name plus a once-built binding context — the real
resolver implementation is Leaf C's, and its behavior is covered by
its own tests.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.procedure_lineage import (
    ProcedureCall,
    ProcedureLineageChannel,
    extract_call_name,
)
from smartmetadata_ingestion.lineage.query_lineage import LineageEdge, ProcessedQuery
from smartmetadata_ingestion.records import BindingContext, FieldSource

SERVICE = "svc"
PROC_FQN = "svc.db.public.load_orders"


def _shape(name: StructuredIdentifier | None) -> tuple[tuple[str, ...], tuple[bool, ...]] | None:
    if name is None:
        return None
    return (
        name.texts,
        tuple(segment.quoted for segment in name.segments),
    )


def test_four_part_call_name_survives_whole() -> None:
    assert _shape(extract_call_name("CALL srv.db.sch.proc()")) == (
        ("srv", "db", "sch", "proc"),
        (False, False, False, False),
    )


def test_longer_call_names_are_never_truncated() -> None:
    # The segment count is unbounded by design: capping it would
    # silently truncate a longer name onto the wrong object, so
    # every segment survives and the resolver decides what an
    # over-long name means.
    assert _shape(extract_call_name("CALL a.b.c.d.e()")) == (
        ("a", "b", "c", "d", "e"),
        (False, False, False, False, False),
    )


def test_bare_call_name_variants() -> None:
    assert _shape(extract_call_name("CALL load_orders()")) == (
        ("load_orders",),
        (False,),
    )
    assert _shape(extract_call_name("call public.load_orders(1, 'x')")) == (
        ("public", "load_orders"),
        (False, False),
    )
    assert _shape(extract_call_name("CALL db.public.load_orders()")) == (
        ("db", "public", "load_orders"),
        (False, False, False),
    )
    assert _shape(extract_call_name("CALL   load_orders  ()")) == (
        ("load_orders",),
        (False,),
    )


def test_quoted_dot_call_names_are_never_split() -> None:
    assert _shape(extract_call_name('CALL "my.sch".load_orders()')) == (
        ("my.sch", "load_orders"),
        (True, False),
    )
    assert _shape(extract_call_name("CALL `my.sch`.load_orders()")) == (
        ("my.sch", "load_orders"),
        (True, False),
    )
    assert _shape(extract_call_name("CALL [my.sch].[load_orders]()")) == (
        ("my.sch", "load_orders"),
        (True, True),
    )


def test_all_three_quote_shapes_keep_quoted_flags() -> None:
    assert _shape(extract_call_name('CALL "public"."load_orders"()')) == (
        ("public", "load_orders"),
        (True, True),
    )
    assert _shape(extract_call_name("CALL `public`.`load_orders`()")) == (
        ("public", "load_orders"),
        (True, True),
    )
    assert _shape(extract_call_name("CALL [public].[load_orders]()")) == (
        ("public", "load_orders"),
        (True, True),
    )
    assert _shape(extract_call_name('CALL "sch".`tbl`.[proc]()')) == (
        ("sch", "tbl", "proc"),
        (True, True, True),
    )


def test_escaped_quote_closers_unescape() -> None:
    assert _shape(extract_call_name('CALL "a""b".proc()')) == (
        ('a"b', "proc"),
        (True, False),
    )
    assert _shape(extract_call_name("CALL `a``b`.proc()")) == (
        ("a`b", "proc"),
        (True, False),
    )
    assert _shape(extract_call_name("CALL [a]]b].proc()")) == (
        ("a]b", "proc"),
        (True, False),
    )


def test_quoted_default_segment_is_a_real_call_name() -> None:
    assert _shape(extract_call_name('CALL "<default>".proc()')) == (
        ("<default>", "proc"),
        (True, False),
    )


def test_non_calls_yield_no_name() -> None:
    assert extract_call_name("SELECT * FROM t") is None
    assert extract_call_name("") is None
    assert extract_call_name("RECALL load_orders()") is None
    assert extract_call_name("CALL ()") is None
    assert extract_call_name("CALL") is None


class _StubResolver:
    """A resolver speaking the new protocol: structured name plus
    binding context, capturing both for assertion."""

    def __init__(self, entity: dict[str, Any] | None, code: str | None) -> None:
        self._entity = entity
        self._code = code
        self.calls: list[tuple[StructuredIdentifier, BindingContext]] = []

    def resolve_procedure(
        self, name: StructuredIdentifier, *, context: BindingContext
    ) -> dict[str, Any] | None:
        self.calls.append((name, context))
        return self._entity

    def procedure_code(self, entity: dict[str, Any]) -> str | None:
        del entity
        return self._code


class _StubProcessor:
    """A body processor capturing the context it is handed and
    returning one canned edge."""

    def __init__(self) -> None:
        self.contexts: list[BindingContext] = []

    def process(self, sql_text: str, **kwargs: Any) -> ProcessedQuery:
        del sql_text
        self.contexts.append(kwargs["context"])
        return ProcessedQuery(
            edges=[
                LineageEdge(
                    from_fqn="svc.db.public.orders",
                    to_fqn="svc.db.public.target",
                )
            ],
            masked_query="SELECT * FROM orders",
        )


def _channel(
    resolver: _StubResolver, processor: _StubProcessor, **kwargs: Any
) -> ProcedureLineageChannel:
    return ProcedureLineageChannel(
        processor,  # type: ignore[arg-type]
        resolver,  # type: ignore[arg-type]
        service_name=SERVICE,
        include_stored_procedures=kwargs.get("include", []),
        exclude_stored_procedures=kwargs.get("exclude", []),
        use_fqn_for_filtering=kwargs.get("use_fqn", False),
    )


def _entity() -> dict[str, Any]:
    return {"fullyQualifiedName": PROC_FQN, "id": "id-proc"}


def test_channel_passes_structured_name_and_context() -> None:
    resolver = _StubResolver(_entity(), "SELECT 1")
    processor = _StubProcessor()
    channel = _channel(resolver, processor)
    records, outcome, _ = channel.process_one(
        ProcedureCall(
            call_text="CALL srv.db.public.load_orders()",
            database_name="db",
            schema_name="public",
        )
    )
    assert outcome.skipped_unresolved == 0
    assert outcome.skipped_unparseable == 0
    assert len(resolver.calls) == 1
    name, context = resolver.calls[0]
    assert _shape(name) == (
        ("srv", "db", "public", "load_orders"),
        (False, False, False, False),
    )
    assert context.database_name == "db"
    assert context.database_schema == "public"
    assert context.database_source is FieldSource.ROW_NATIVE
    assert context.schema_source is FieldSource.ROW_NATIVE
    # The body is processed against the same once-built context.
    assert processor.contexts == [context]
    assert outcome.edges == 1
    assert outcome.procedure_edges == 2
    assert len(records) == 3


def test_channel_marks_missing_context_fields_missing() -> None:
    resolver = _StubResolver(None, None)
    channel = _channel(resolver, _StubProcessor())
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="CALL load_orders()")
    )
    assert outcome.skipped_unresolved == 1
    assert len(resolver.calls) == 1
    _, context = resolver.calls[0]
    assert context.database_name is None
    assert context.database_schema is None
    assert context.database_source is FieldSource.MISSING
    assert context.schema_source is FieldSource.MISSING


def test_channel_marks_each_field_source_independently() -> None:
    resolver = _StubResolver(None, None)
    channel = _channel(resolver, _StubProcessor())
    channel.process_one(
        ProcedureCall(
            call_text="CALL load_orders()",
            database_name="db",
        )
    )
    _, context = resolver.calls[0]
    assert context.database_source is FieldSource.ROW_NATIVE
    assert context.schema_source is FieldSource.MISSING


def test_channel_skips_unparseable_call_without_resolving() -> None:
    resolver = _StubResolver(_entity(), "SELECT 1")
    channel = _channel(resolver, _StubProcessor())
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="SELECT * FROM t")
    )
    assert outcome.skipped_unparseable == 1
    assert resolver.calls == []


def test_channel_filter_uses_structured_segments() -> None:
    # The exclude pattern matches the leaf name, which comes from
    # the structured segments — not from splitting a string.
    resolver = _StubResolver(_entity(), "SELECT 1")
    channel = _channel(resolver, _StubProcessor(), exclude=["load_orders"])
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text='CALL db."my.sch".load_orders()')
    )
    assert outcome.skipped_filtered == 1
    assert resolver.calls == []


def test_channel_fqn_filter_keeps_quoted_dot_segment_whole() -> None:
    # With FQN filtering, the candidate FQN is built from the
    # structured segments: the quoted "my.sch" stays one segment,
    # so the candidate is svc.db."my.sch".load_orders — not the
    # svc.my.sch.load_orders a string split would have built.
    resolver = _StubResolver(_entity(), "SELECT 1")
    channel = _channel(
        resolver,
        _StubProcessor(),
        include=[r'svc\.db\."my\.sch"\.load_orders'],
        use_fqn=True,
    )
    channel.process_one(
        ProcedureCall(call_text='CALL db."my.sch".load_orders()')
    )
    assert len(resolver.calls) == 1
    stale = _StubResolver(_entity(), "SELECT 1")
    stale_channel = _channel(
        stale,
        _StubProcessor(),
        include=[r"svc\.my\.sch\.load_orders"],
        use_fqn=True,
    )
    _, outcome, _ = stale_channel.process_one(
        ProcedureCall(call_text='CALL db."my.sch".load_orders()')
    )
    assert outcome.skipped_filtered == 1
    assert stale.calls == []


def test_channel_skips_procedure_without_code() -> None:
    resolver = _StubResolver(_entity(), None)
    processor = _StubProcessor()
    channel = _channel(resolver, processor)
    _, outcome, _ = channel.process_one(
        ProcedureCall(call_text="CALL load_orders()")
    )
    assert outcome.skipped_no_code == 1
    assert processor.contexts == []
