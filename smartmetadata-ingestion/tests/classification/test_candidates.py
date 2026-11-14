# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for candidate tag resolution (design §2.4)."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from smartmetadata_ingestion.classification.candidates import CandidateStore
from smartmetadata_ingestion.client.rest import CLASSIFICATIONS_PATH, TAGS_PATH


class _FakeClient:
    def __init__(
        self,
        classifications: list[dict[str, Any]],
        tags_by_parent: dict[str, list[dict[str, Any]]],
        *,
        fail_classifications: bool = False,
        fail_parents: frozenset[str] = frozenset(),
    ) -> None:
        self._classifications = classifications
        self._tags_by_parent = tags_by_parent
        self._fail_classifications = fail_classifications
        self._fail_parents = fail_parents
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def iter_collection(
        self, path: str, *, limit: int = 100, extra_params: dict[str, Any] | None = None
    ) -> Any:
        params = dict(extra_params or {})
        self.calls.append((path, params))
        if path == CLASSIFICATIONS_PATH:
            if self._fail_classifications:
                raise RuntimeError("catalog down")
            return iter(self._classifications)
        if params.get("parent") in self._fail_parents:
            raise RuntimeError("tag list down")
        return iter(self._tags_by_parent.get(params.get("parent", ""), []))


def _classification(
    name: str, *, enabled: bool = True, fqn: str | None = None, **config: Any
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "fullyQualifiedName": fqn if fqn is not None else name,
        "mutuallyExclusive": True,
        "autoClassificationConfig": {"enabled": enabled, **config},
    }
    return payload


def _tag(
    fqn: str, *, enabled: bool = True, recognizers: list[dict] | None = None, **extra: Any
) -> dict[str, Any]:
    return {
        "name": fqn.split(".")[-1],
        "fullyQualifiedName": fqn,
        "autoClassificationEnabled": enabled,
        "recognizers": recognizers if recognizers is not None else [{"name": "r1"}],
        **extra,
    }


def test_only_enabled_filter_classifications_with_enabled_recognizer_tags() -> None:
    client = _FakeClient(
        [
            _classification("PII"),
            _classification("Tier", enabled=False),
            _classification("Other"),
        ],
        {
            "PII": [
                _tag("PII.Sensitive"),
                _tag("PII.None", enabled=False),
                _tag("PII.Bare", recognizers=[]),
            ],
            "Other": [_tag("Other.Tag")],
        },
    )
    candidates = CandidateStore(client).candidates(("PII",))
    assert [c.tag_fqn for c in candidates] == ["PII.Sensitive"]
    assert candidates[0].classification == "PII"
    assert candidates[0].mutually_exclusive is True
    assert candidates[0].recognizers == ({"name": "r1"},)


def test_listing_params_scope_by_parent_and_fields() -> None:
    client = _FakeClient([_classification("PII")], {"PII": []})
    CandidateStore(client).candidates(("PII",))
    assert client.calls[0][0] == CLASSIFICATIONS_PATH
    assert "autoClassificationConfig" in client.calls[0][1]["fields"]
    assert client.calls[1] == (
        TAGS_PATH,
        {
            "parent": "PII",
            "fields": (
                "name,fullyQualifiedName,recognizers,autoClassificationEnabled,"
                "autoClassificationPriority,classification"
            ),
        },
    )


def test_parent_falls_back_to_the_classification_name() -> None:
    classification = _classification("PII")
    del classification["fullyQualifiedName"]
    client = _FakeClient([classification], {"PII": [_tag("PII.Sensitive")]})
    candidates = CandidateStore(client).candidates(("PII",))
    assert [c.tag_fqn for c in candidates] == ["PII.Sensitive"]


def test_absent_minimum_confidence_reads_as_zero_not_the_schema_default() -> None:
    client = _FakeClient([_classification("PII")], {"PII": [_tag("PII.Sensitive")]})
    (candidate,) = CandidateStore(client).candidates(("PII",))
    assert candidate.minimum_confidence == 0.0
    assert candidate.conflict_resolution == "highest_confidence"
    assert candidate.priority == 50


def test_present_config_values_carry_through() -> None:
    client = _FakeClient(
        [_classification("PII", minimumConfidence=0.75, conflictResolution="most_specific")],
        {"PII": [_tag("PII.Sensitive", autoClassificationPriority=100)]},
    )
    (candidate,) = CandidateStore(client).candidates(("PII",))
    assert candidate.minimum_confidence == 0.75
    assert candidate.conflict_resolution == "most_specific"
    assert candidate.priority == 100


def test_fqn_depth_counts_dots() -> None:
    client = _FakeClient(
        [_classification("PII")],
        {"PII": [_tag("PII.Sensitive"), _tag("PII.Deep.Child")]},
    )
    candidates = CandidateStore(client).candidates(("PII",))
    assert [c.fqn_depth for c in candidates] == [1, 2]


def test_results_cache_per_filter_key() -> None:
    client = _FakeClient([_classification("PII")], {"PII": [_tag("PII.Sensitive")]})
    store = CandidateStore(client)
    first = store.candidates(("PII",))
    second = store.candidates(("PII",))
    assert first is second
    assert len(client.calls) == 2


def test_classification_list_failure_degrades_to_no_candidates(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient([], {}, fail_classifications=True)
    with caplog.at_level(logging.ERROR):
        assert CandidateStore(client).candidates(("PII",)) == ()
    assert "failed to list classifications" in caplog.text


def test_per_classification_failure_skips_only_that_classification(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client = _FakeClient(
        [_classification("PII"), _classification("Custom")],
        {
            "PII": [_tag("PII.Sensitive")],
            "Custom": [_tag("Custom.Tag")],
        },
        fail_parents=frozenset({"Custom"}),
    )
    with caplog.at_level(logging.ERROR):
        candidates = CandidateStore(client).candidates(("PII", "Custom"))
    assert [c.tag_fqn for c in candidates] == ["PII.Sensitive"]
    assert "failed to list tags for classification 'Custom'" in caplog.text
