# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import pytest

from smartmetadata_ingestion.connectors.select import is_selected, is_selected_table


def test_is_selected_regex_match() -> None:
    # re.match (pin filters.py:_filter): anchored at the start only, not
    # at the end — an unanchored pattern is a prefix match.
    assert is_selected("orders", include=["^orders$"], exclude=[]) is True
    assert is_selected("orders_v", include=["^orders$"], exclude=[]) is False
    assert is_selected("orders_v", include=["^orders.*$"], exclude=[]) is True
    assert is_selected("orders_v", include=["orders"], exclude=[]) is True
    assert is_selected("prod_db", include=["prod.*"], exclude=[]) is True
    assert is_selected("prod_db", include=["^orders$"], exclude=[]) is False


def test_is_selected_case_insensitive() -> None:
    assert is_selected("ORDERS", include=["^orders$"], exclude=[]) is True


def test_is_selected_star_includes_all() -> None:
    assert is_selected("anything", include=[".*"], exclude=[]) is True


def test_is_selected_empty_include_means_all() -> None:
    assert is_selected("anything", include=[], exclude=[]) is True


def test_is_selected_exclude_wins() -> None:
    assert is_selected("orders", include=[".*"], exclude=["^orders$"]) is False


def test_is_selected_invalid_regex_fails_loudly() -> None:
    with pytest.raises(ValueError, match="invalid filter pattern"):
        is_selected("orders", include=["["], exclude=[])


def test_is_selected_table_view_gate() -> None:
    assert (
        is_selected_table(
            "orders_v",
            "View",
            include_tables=[".*"],
            exclude_tables=[],
            include_views=False,
        )
        is False
    )
    assert (
        is_selected_table(
            "orders_v",
            "MaterializedView",
            include_tables=[".*"],
            exclude_tables=[],
            include_views=False,
        )
        is False
    )
    assert (
        is_selected_table(
            "orders",
            "Regular",
            include_tables=[".*"],
            exclude_tables=[],
            include_views=False,
        )
        is True
    )
    assert (
        is_selected_table(
            "orders_v",
            "View",
            include_tables=[".*"],
            exclude_tables=[],
            include_views=True,
        )
        is True
    )


def test_include_tables_gate_drops_tables_but_keeps_views() -> None:
    assert (
        is_selected_table(
            "orders",
            "Regular",
            include_tables=[".*"],
            exclude_tables=[],
            include_tables_enabled=False,
        )
        is False
    )
    assert (
        is_selected_table(
            "orders_v",
            "View",
            include_tables=[".*"],
            exclude_tables=[],
            include_tables_enabled=False,
        )
        is True
    )
    assert (
        is_selected_table(
            "orders",
            "Regular",
            include_tables=[".*"],
            exclude_tables=[],
            include_tables_enabled=True,
        )
        is True
    )


def test_fqn_filtering_matches_fqn_candidate_only_when_enabled() -> None:
    fqn = "warehouse.analytics.public.orders"
    assert (
        is_selected(
            "orders", include=[r"warehouse\.analytics.*"], exclude=[], fqn=fqn, use_fqn=True
        )
        is True
    )
    assert (
        is_selected("orders", include=[r"warehouse\.analytics.*"], exclude=[], fqn=fqn)
        is False
    )
    assert (
        is_selected("orders", include=[r"^orders$"], exclude=[], fqn=fqn, use_fqn=True)
        is False
    )
    assert is_selected("orders", include=[r"^orders$"], exclude=[], fqn=fqn) is True
    assert (
        is_selected("orders", include=[r"warehouse.*"], exclude=[], use_fqn=True)
        is False
    )
