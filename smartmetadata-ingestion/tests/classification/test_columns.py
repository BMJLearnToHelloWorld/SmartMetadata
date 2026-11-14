# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for classification column adaptation (design §2.10)."""

from __future__ import annotations

import logging

import pytest

from smartmetadata_ingestion.classification.columns import (
    MAX_COLUMN_DEPTH,
    ColumnSampleMap,
    LeafColumn,
    column_fqn,
    iter_leaf_columns,
    map_sample_to_columns,
)


def _table(columns: list[dict]) -> dict:
    return {"fullyQualifiedName": "svc.db.sc.tbl", "columns": columns}


def test_table_columns_walk_in_catalog_order() -> None:
    leaves = iter_leaf_columns(_table([{"name": "a"}, {"name": "b"}, {"name": "c"}]), "table")
    assert [leaf.dotted_path for leaf in leaves] == ["a", "b", "c"]
    assert leaves[1].pointer_segments == ("columns", 1)


def test_nested_columns_recurse_with_dotted_paths() -> None:
    leaves = iter_leaf_columns(
        _table(
            [
                {
                    "name": "address",
                    "children": [{"name": "city"}, {"name": "zip"}],
                }
            ]
        ),
        "table",
    )
    assert [leaf.dotted_path for leaf in leaves] == ["address.city", "address.zip"]
    assert leaves[0].pointer_segments == ("columns", 0, "children", 0)
    assert leaves[1].pointer_segments == ("columns", 0, "children", 1)


def test_container_and_topic_roots() -> None:
    container = {"dataModel": {"columns": [{"name": "key"}]}}
    assert [leaf.dotted_path for leaf in iter_leaf_columns(container, "container")] == ["key"]
    assert iter_leaf_columns(container, "container")[0].pointer_segments == (
        "dataModel",
        "columns",
        0,
    )
    topic = {"messageSchema": {"schemaFields": [{"name": "payload"}]}}
    assert [leaf.dotted_path for leaf in iter_leaf_columns(topic, "topic")] == ["payload"]
    assert iter_leaf_columns(topic, "topic")[0].pointer_segments == (
        "messageSchema",
        "schemaFields",
        0,
    )


def test_missing_or_misshapen_roots_yield_nothing() -> None:
    assert iter_leaf_columns({}, "table") == []
    assert iter_leaf_columns({"columns": None}, "table") == []
    assert iter_leaf_columns({"columns": "nope"}, "table") == []
    assert iter_leaf_columns({"columns": [{"name": "a"}, "junk", None]}, "table") != []
    assert [
        leaf.dotted_path
        for leaf in iter_leaf_columns({"columns": [{"name": "a"}, "junk"]}, "table")
    ] == ["a"]


def test_unknown_entity_type_fails_loud() -> None:
    with pytest.raises(ValueError, match="unknown entity type"):
        iter_leaf_columns(_table([]), "dashboard")


def test_existing_tag_fqns_read_from_labels() -> None:
    leaves = iter_leaf_columns(
        _table(
            [
                {
                    "name": "email",
                    "tags": [
                        {"tagFQN": "PII.Sensitive"},
                        {"tagFQN": "Tier.Tier1"},
                        {"noFQN": True},
                        "junk",
                    ],
                }
            ]
        ),
        "table",
    )
    assert leaves[0].existing_tag_fqns == ("PII.Sensitive", "Tier.Tier1")


def test_depth_cap_treats_the_capped_column_as_a_leaf(
    caplog: pytest.LogCaptureFixture,
) -> None:
    column: dict = {"name": "leaf"}
    for depth in range(MAX_COLUMN_DEPTH + 2):
        column = {"name": f"level{depth}", "children": [column]}
    with caplog.at_level(logging.WARNING):
        leaves = iter_leaf_columns(_table([column]), "table")
    assert len(leaves) == 1
    assert leaves[0].dotted_path.count(".") == MAX_COLUMN_DEPTH
    assert "nesting cap" in caplog.text


def test_shared_leaf_object_yielded_once() -> None:
    shared = {"name": "shared"}
    leaves = iter_leaf_columns(_table([shared, shared]), "table")
    assert [leaf.dotted_path for leaf in leaves] == ["shared"]


def test_self_cycle_terminates_and_yields_nothing() -> None:
    column: dict = {"name": "loop"}
    column["children"] = [column]
    assert iter_leaf_columns(_table([column]), "table") == []


def _leaf(path: str) -> LeafColumn:
    return LeafColumn(dotted_path=path, column={"name": path}, pointer_segments=("columns", 0))


def test_empty_sample_has_no_fields() -> None:
    assert map_sample_to_columns([], [_leaf("a")]) == ColumnSampleMap(mapped={}, has_fields=False)
    assert map_sample_to_columns([{}, {}], [_leaf("a")]).has_fields is False


def test_sample_maps_by_dotted_path_with_per_row_values() -> None:
    result = map_sample_to_columns([{"a": 1, "b": 2}, {"a": 3}, {"b": 4}], [_leaf("a"), _leaf("b")])
    assert result.has_fields is True
    assert result.mapped == {"a": [1, 3], "b": [2, 4]}
    assert result.unmapped_fields == ()


def test_unmapped_fields_reported_sorted_and_never_mapped() -> None:
    result = map_sample_to_columns([{"zebra": 1, "apple": 2, "a": 3}], [_leaf("a")])
    assert result.mapped == {"a": [3]}
    assert result.unmapped_fields == ("apple", "zebra")


def test_nested_rows_flatten_to_dotted_paths() -> None:
    result = map_sample_to_columns(
        [{"address": {"city": "NYC", "zip": "10001"}}],
        [_leaf("address.city"), _leaf("address.zip")],
    )
    assert result.mapped == {"address.city": ["NYC"], "address.zip": ["10001"]}
    assert result.unmapped_fields == ()


def test_non_empty_parent_is_not_a_field_but_empty_dict_is() -> None:
    result = map_sample_to_columns(
        [{"address": {"city": "NYC"}, "meta": {}}], [_leaf("address.city")]
    )
    assert result.unmapped_fields == ("meta",)
    assert "address" not in result.unmapped_fields


def test_exact_full_name_key_beats_the_nested_walk() -> None:
    result = map_sample_to_columns(
        [{"address.city": "flat", "address": {"city": "nested"}}],
        [_leaf("address.city")],
    )
    assert result.mapped == {"address.city": ["flat"]}


def test_column_fqn_joins_entity_and_path() -> None:
    assert column_fqn("svc.db.sc.tbl", "address.city") == "svc.db.sc.tbl.address.city"
