# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import pytest
from smartmetadata_ingestion.fqn import build_fqn, parent_fqn, quote_name


def test_plain_parts_join_with_dots() -> None:
    assert build_fqn("warehouse", "analytics", "public", "orders") == (
        "warehouse.analytics.public.orders"
    )


def test_quotes_parts_that_contain_dots() -> None:
    assert quote_name("db.prod") == '"db.prod"'
    assert build_fqn("svc", "db.prod") == 'svc."db.prod"'


def test_empty_part_rejected() -> None:
    with pytest.raises(ValueError):
        quote_name("")


def test_parent_fqn_drops_last_segment() -> None:
    assert (
        parent_fqn("svc.db.public.customers.id") == "svc.db.public.customers"
    )


def test_parent_fqn_keeps_quoted_dots() -> None:
    # A quoted segment's dot is data, not a separator: the parent of a
    # column in table "weird.name" is that table, quotes intact.
    assert (
        parent_fqn('svc.db.public."weird.name".id')
        == 'svc.db.public."weird.name"'
    )
    assert parent_fqn(build_fqn("svc", "db.prod", "public", "t", "c")) == (
        'svc."db.prod".public.t'
    )


def test_parent_fqn_rejects_single_segment_and_unbalanced_quotes() -> None:
    with pytest.raises(ValueError):
        parent_fqn("only")
    with pytest.raises(ValueError):
        parent_fqn('svc.db."unbalanced.id')
