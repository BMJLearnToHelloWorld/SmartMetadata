# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import pytest
from smartmetadata_ingestion.fqn import build_fqn, quote_name


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
