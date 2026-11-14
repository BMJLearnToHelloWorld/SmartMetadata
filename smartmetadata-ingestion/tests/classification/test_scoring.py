# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for scoring gates and TagLabel building (§2.8–2.9)."""

from __future__ import annotations

import logging

import pytest

from smartmetadata_ingestion.classification.analysis import ScoredMatch, TagScore
from smartmetadata_ingestion.classification.candidates import CandidateTag
from smartmetadata_ingestion.classification.scoring import (
    MAX_TAGS_PER_COLUMN,
    build_reason,
    build_recognizer_metadata,
    build_tag_label,
    resolve_column_tags,
)


def _candidate(
    tag_fqn: str,
    *,
    classification: str | None = None,
    mutually_exclusive: bool = False,
    minimum_confidence: float = 0.0,
    conflict_resolution: str = "highest_confidence",
    priority: int = 50,
    recognizers: tuple[dict, ...] = (),
) -> CandidateTag:
    return CandidateTag(
        tag_fqn=tag_fqn,
        name=tag_fqn.split(".")[-1],
        classification=classification or tag_fqn.split(".", 1)[0],
        mutually_exclusive=mutually_exclusive,
        minimum_confidence=minimum_confidence,
        conflict_resolution=conflict_resolution,
        priority=priority,
        recognizers=recognizers,
    )


def _score(tag_fqn: str, score: float, *, column_name_matched: bool = False) -> TagScore:
    return TagScore(
        tag_fqn=tag_fqn,
        score=score,
        target="content",
        column_name_matched=column_name_matched,
    )


def _match(
    recognizer: str,
    score: float,
    *,
    pattern_name: str | None = None,
    pattern_regex: str | None = None,
    pattern_score: float | None = None,
    recognizer_identifier: str | None = None,
) -> ScoredMatch:
    return ScoredMatch(
        entity_type="EMAIL_ADDRESS",
        start=0,
        end=5,
        score=score,
        span_text="a@b.c",
        recognizer_name=recognizer,
        recognizer_identifier=recognizer_identifier,
        pattern_name=pattern_name,
        pattern_regex=pattern_regex,
        pattern_score=pattern_score,
    )


def test_unknown_tags_drop_silently() -> None:
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        {},
        existing_tag_fqns=[],
        run_confidence=80,
    )
    assert resolved == []


def test_already_applied_tags_drop() -> None:
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        {"PII.Sensitive": _candidate("PII.Sensitive")},
        existing_tag_fqns=["PII.Sensitive"],
        run_confidence=80,
    )
    assert resolved == []


def test_mutually_exclusive_classification_already_present_drops() -> None:
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        {"PII.Sensitive": _candidate("PII.Sensitive", mutually_exclusive=True)},
        existing_tag_fqns=["PII.None"],
        run_confidence=80,
    )
    assert resolved == []


def test_non_exclusive_classification_already_present_keeps() -> None:
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        {"PII.Sensitive": _candidate("PII.Sensitive")},
        existing_tag_fqns=["PII.None"],
        run_confidence=80,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]


def test_run_threshold_is_confidence_over_100_with_inclusive_boundary() -> None:
    candidates = {"PII.Sensitive": _candidate("PII.Sensitive")}
    assert (
        resolve_column_tags(
            [_score("PII.Sensitive", 0.79)],
            candidates,
            existing_tag_fqns=[],
            run_confidence=80,
        )
        == []
    )
    assert (
        len(
            resolve_column_tags(
                [_score("PII.Sensitive", 0.80)],
                candidates,
                existing_tag_fqns=[],
                run_confidence=80,
            )
        )
        == 1
    )


def test_minimum_confidence_gate_with_inclusive_boundary() -> None:
    candidates = {"PII.Sensitive": _candidate("PII.Sensitive", minimum_confidence=0.6)}
    assert (
        resolve_column_tags(
            [_score("PII.Sensitive", 0.59)],
            candidates,
            existing_tag_fqns=[],
            run_confidence=0,
        )
        == []
    )
    assert (
        len(
            resolve_column_tags(
                [_score("PII.Sensitive", 0.60)],
                candidates,
                existing_tag_fqns=[],
                run_confidence=0,
            )
        )
        == 1
    )


def test_highest_confidence_winner_uses_score_then_column_match_then_priority() -> None:
    candidates = {
        "PII.Sensitive": _candidate("PII.Sensitive", mutually_exclusive=True, priority=100),
        "PII.NonSensitive": _candidate("PII.NonSensitive", mutually_exclusive=True, priority=50),
    }
    # Higher score wins.
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9), _score("PII.NonSensitive", 0.95)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.NonSensitive"]
    # Tied score: column-name match wins over priority.
    resolved = resolve_column_tags(
        [
            _score("PII.Sensitive", 0.9),
            _score("PII.NonSensitive", 0.9, column_name_matched=True),
        ],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.NonSensitive"]
    # Tied score and match: priority wins.
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9), _score("PII.NonSensitive", 0.9)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]


def test_highest_priority_winner_uses_priority_then_score() -> None:
    candidates = {
        "PII.Sensitive": _candidate(
            "PII.Sensitive",
            mutually_exclusive=True,
            conflict_resolution="highest_priority",
            priority=100,
        ),
        "PII.NonSensitive": _candidate(
            "PII.NonSensitive",
            mutually_exclusive=True,
            conflict_resolution="highest_priority",
            priority=50,
        ),
    }
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.85), _score("PII.NonSensitive", 0.95)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]


def test_most_specific_winner_uses_fqn_depth_then_score() -> None:
    candidates = {
        "PII.Sensitive": _candidate(
            "PII.Sensitive",
            mutually_exclusive=True,
            conflict_resolution="most_specific",
        ),
        "PII.Sensitive.Email": _candidate(
            "PII.Sensitive.Email",
            mutually_exclusive=True,
            conflict_resolution="most_specific",
        ),
    }
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.95), _score("PII.Sensitive.Email", 0.85)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive.Email"]


def test_unknown_strategy_warns_and_selects_by_score_only(
    caplog: pytest.LogCaptureFixture,
) -> None:
    candidates = {
        "PII.Sensitive": _candidate(
            "PII.Sensitive",
            mutually_exclusive=True,
            conflict_resolution="bogus",
            priority=100,
        ),
        "PII.NonSensitive": _candidate(
            "PII.NonSensitive",
            mutually_exclusive=True,
            conflict_resolution="bogus",
            priority=50,
        ),
    }
    # Tied scores with differing column-match and priority: the
    # full highest-confidence key would pick NonSensitive (column
    # match); score-only selection keeps the first maximum in list
    # order, Sensitive.
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.classification.scoring"):
        resolved = resolve_column_tags(
            [
                _score("PII.Sensitive", 0.9),
                _score("PII.NonSensitive", 0.9, column_name_matched=True),
            ],
            candidates,
            existing_tag_fqns=[],
            run_confidence=0,
        )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]
    assert any(
        record.levelname == "WARNING" and "bogus" in record.message
        for record in caplog.records
    )
    # Differing scores: the higher score wins regardless of
    # priority or column-name match.
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.85), _score("PII.NonSensitive", 0.95)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.NonSensitive"]


def test_nested_tag_parent_fqn_is_not_the_classification() -> None:
    # An applied flat tag blocks flat candidates of its
    # mutually-exclusive classification, but not a nested tag: the
    # nested tag's parent FQN is PII.Parent, not the classification
    # FQN PII.
    candidates = {
        "PII.Parent.Child": _candidate("PII.Parent.Child", mutually_exclusive=True),
    }
    resolved = resolve_column_tags(
        [_score("PII.Parent.Child", 0.9)],
        candidates,
        existing_tag_fqns=["PII.None"],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Parent.Child"]
    # Symmetrically, an applied nested tag blocks nothing: its
    # parent FQN matches no classification in the map.
    candidates = {"PII.Sensitive": _candidate("PII.Sensitive", mutually_exclusive=True)}
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        candidates,
        existing_tag_fqns=["PII.Parent.Child"],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]
    # An applied tag FQN without a dot has no parent and blocks
    # nothing; an exact FQN match still drops the candidate.
    resolved = resolve_column_tags(
        [_score("PII.Sensitive", 0.9)],
        candidates,
        existing_tag_fqns=["PII"],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["PII.Sensitive"]
    resolved = resolve_column_tags(
        [_score("PII.Parent.Child", 0.9)],
        {"PII.Parent.Child": _candidate("PII.Parent.Child", mutually_exclusive=True)},
        existing_tag_fqns=["PII.Parent.Child"],
        run_confidence=0,
    )
    assert resolved == []


def test_small_lists_keep_resolver_order_without_sorting() -> None:
    candidates = {
        "A.One": _candidate("A.One"),
        "B.Two": _candidate("B.Two"),
        "C.Three": _candidate("C.Three"),
    }
    resolved = resolve_column_tags(
        [_score("A.One", 0.85), _score("B.Two", 0.95), _score("C.Three", 0.9)],
        candidates,
        existing_tag_fqns=[],
        run_confidence=0,
    )
    assert [s.tag_fqn for s in resolved] == ["A.One", "B.Two", "C.Three"]
    # Exactly at the cap, order is still resolver order.
    candidates = {f"C{i}.Tag": _candidate(f"C{i}.Tag") for i in range(MAX_TAGS_PER_COLUMN)}
    scores = [_score(f"C{i}.Tag", 0.99 - i * 0.01) for i in range(MAX_TAGS_PER_COLUMN)]
    scores.reverse()
    resolved = resolve_column_tags(scores, candidates, existing_tag_fqns=[], run_confidence=0)
    expected = [f"C{i}.Tag" for i in reversed(range(MAX_TAGS_PER_COLUMN))]
    assert [s.tag_fqn for s in resolved] == expected


def test_cap_keeps_the_top_scored_and_ties_keep_order(
    caplog: pytest.LogCaptureFixture,
) -> None:
    candidates = {f"C{i}.Tag": _candidate(f"C{i}.Tag") for i in range(MAX_TAGS_PER_COLUMN + 3)}
    scores = [_score(f"C{i}.Tag", 0.9 if i < 2 else 0.5) for i in range(MAX_TAGS_PER_COLUMN + 3)]
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.classification.scoring"):
        resolved = resolve_column_tags(scores, candidates, existing_tag_fqns=[], run_confidence=0)
    assert len(resolved) == MAX_TAGS_PER_COLUMN
    assert [s.tag_fqn for s in resolved[:2]] == ["C0.Tag", "C1.Tag"]
    assert [s.tag_fqn for s in resolved[2:]] == [f"C{i}.Tag" for i in range(2, MAX_TAGS_PER_COLUMN)]
    assert any(record.levelname == "WARNING" for record in caplog.records)


def test_tag_label_shape_is_suggested_generated_classification() -> None:
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(_match("EmailRecognizer", 0.9),),
    )
    label = build_tag_label(score, _candidate("PII.Sensitive"))
    assert label["tagFQN"] == "PII.Sensitive"
    assert label["source"] == "Classification"
    assert label["labelType"] == "Generated"
    assert label["state"] == "Suggested"
    assert "metadata" not in label


def test_reason_uses_the_detected_by_template_with_regexes_highest_first() -> None:
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(
            _match(
                "EmailRecognizer", 0.8, pattern_name="email", pattern_regex="a", pattern_score=0.8
            ),
            _match(
                "EmailRecognizer", 1.0, pattern_name="email", pattern_regex="a", pattern_score=1.0
            ),
            _match(
                "EmailRecognizer", 0.6, pattern_name="strict", pattern_regex="b", pattern_score=0.6
            ),
            _match("PhoneRecognizer", 0.95),
        ),
    )
    reason = build_reason(score)
    # The same regex at two explanation scores yields two pattern
    # lines; patterns render as regexes, never names; the NER-style
    # group has no pattern section but keeps its blank line; the
    # string ends with a blank line.
    assert reason == (
        "Detected by `EmailRecognizer` 3 times with an average score of 0.80.\n"
        "Patterns matched:\n"
        "\t- `a` (scored: 1.00)\n"
        "\t- `a` (scored: 0.80)\n"
        "\t- `b` (scored: 0.60)\n"
        "\n"
        "Detected by `PhoneRecognizer` 1 time with an average score of 0.95.\n"
        "\n"
    )


def test_reason_groups_by_recognizer_identifier_not_name() -> None:
    # Two instances sharing a name form separate groups, keyed and
    # sorted by identifier; results from one instance group
    # together; the header still shows the recognizer name.
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(
            _match("EmailRecognizer", 0.9, recognizer_identifier="EmailRecognizer_2"),
            _match("EmailRecognizer", 0.8, recognizer_identifier="EmailRecognizer_1"),
            _match("EmailRecognizer", 0.6, recognizer_identifier="EmailRecognizer_1"),
        ),
    )
    assert build_reason(score) == (
        "Detected by `EmailRecognizer` 2 times with an average score of 0.70.\n"
        "\n"
        "Detected by `EmailRecognizer` 1 time with an average score of 0.90.\n"
        "\n"
    )


def test_reason_orders_groups_alphabetically_not_by_score() -> None:
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(
            _match("ZebraRecognizer", 0.9),
            _match("AlphaRecognizer", 0.9),
            _match("MidRecognizer", 0.8),
        ),
    )
    reason = build_reason(score)
    assert reason == (
        "Detected by `AlphaRecognizer` 1 time with an average score of 0.90.\n"
        "\n"
        "Detected by `MidRecognizer` 1 time with an average score of 0.80.\n"
        "\n"
        "Detected by `ZebraRecognizer` 1 time with an average score of 0.90.\n"
        "\n"
    )


def test_reason_dedupes_identical_pattern_pairs() -> None:
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(
            _match("R", 0.7, pattern_name="p", pattern_regex="rx", pattern_score=0.7),
            _match("R", 0.8, pattern_name="p", pattern_regex="rx", pattern_score=0.7),
        ),
    )
    reason = build_reason(score)
    assert reason == (
        "Detected by `R` 2 times with an average score of 0.75.\n"
        "Patterns matched:\n"
        "\t- `rx` (scored: 0.70)\n"
        "\n"
    )


def test_reason_pattern_ties_keep_both_lines_without_a_defined_order() -> None:
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        all_results=(
            _match("R", 0.7, pattern_name="p", pattern_regex="xxx", pattern_score=0.7),
            _match("R", 0.7, pattern_name="q", pattern_regex="yyy", pattern_score=0.7),
        ),
    )
    lines = build_reason(score).split("\n")
    assert lines[0] == "Detected by `R` 2 times with an average score of 0.70."
    assert lines[1] == "Patterns matched:"
    # Equal scores have no defined relative order: assert the set
    # of lines, never their order.
    assert set(lines[2:4]) == {"\t- `xxx` (scored: 0.70)", "\t- `yyy` (scored: 0.70)"}
    assert lines[4:] == ["", ""]


def test_reason_includes_an_empty_pattern_that_metadata_ignores() -> None:
    # The reason gate is "pattern present" (non-None); the metadata
    # gate is "pattern truthy". An empty pattern therefore renders
    # in the reason but contributes no metadata entry.
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=({"id": "rec-1", "name": "R", "recognizerConfig": {"type": "pattern"}},),
    )
    match = _match("R", 0.5, pattern_name="p", pattern_regex="", pattern_score=0.5)
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.5,
        target="content",
        results=(match,),
        all_results=(match,),
    )
    assert build_reason(score) == (
        "Detected by `R` 1 time with an average score of 0.50.\n"
        "Patterns matched:\n"
        "\t- `` (scored: 0.50)\n"
        "\n"
    )
    metadata = build_recognizer_metadata(score, candidate)
    assert metadata is not None
    assert "patterns" not in metadata


def test_reason_is_empty_without_results() -> None:
    assert build_reason(_score("PII.Sensitive", 0.9)) == ""


def test_metadata_follows_the_winning_result_even_when_it_has_no_id() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=(
            {
                "id": "rec-1",
                "name": "EmailRecognizer",
                "recognizerConfig": {"type": "pattern"},
            },
        ),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=1.4,
        target="column_name",
        results=(
            _match(
                "EmailRecognizer", 0.9, pattern_name="email", pattern_regex="a", pattern_score=0.9
            ),
            _match(
                "EmailRecognizer", 0.7, pattern_name="email", pattern_regex="a", pattern_score=0.7
            ),
            _match("OtherRecognizer", 0.95),
        ),
    )
    metadata = build_recognizer_metadata(score, candidate)
    assert metadata is None  # the best result's recognizer has no catalog id


def test_metadata_resolves_predefined_configs_by_predefined_name() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=(
            {
                "id": "rec-9",
                "name": "Email Catalog Name",
                "recognizerConfig": {
                    "type": "predefined",
                    "name": "EmailRecognizer",
                },
            },
        ),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=1.4,
        target="content",
        results=(_match("EmailRecognizer", 0.9),),
    )
    metadata = build_recognizer_metadata(score, candidate)
    assert metadata == {
        "recognizerId": "rec-9",
        "recognizerName": "EmailRecognizer",
        "score": 1.0,
        "target": "content",
    }


def test_metadata_patterns_keep_distinct_triples_sorted_by_regex_desc() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=({"id": "rec-1", "name": "R", "recognizerConfig": {"type": "pattern"}},),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        results=(
            # The entry score is the explanation score (0.8), not
            # the boosted result score (1.0).
            _match("R", 1.0, pattern_name="p1", pattern_regex="aaa", pattern_score=0.8),
            _match("R", 0.9, pattern_name="p1", pattern_regex="aaa", pattern_score=0.9),
            _match("R", 0.7, pattern_name="p2", pattern_regex="zzz", pattern_score=0.7),
            _match("R", 0.6),
            # An exact duplicate triple collapses.
            _match("R", 0.85, pattern_name="p1", pattern_regex="aaa", pattern_score=0.8),
        ),
    )
    metadata = build_recognizer_metadata(score, candidate)
    assert metadata is not None
    patterns = metadata["patterns"]
    assert len(patterns) == 3
    assert patterns[0] == {"name": "p2", "regex": "zzz", "score": 0.7}
    # Same-regex entries have no defined relative order beyond the
    # regex sort: assert the set, never their order.
    assert {(entry["name"], entry["regex"], entry["score"]) for entry in patterns[1:]} == {
        ("p1", "aaa", 0.8),
        ("p1", "aaa", 0.9),
    }


def test_metadata_pattern_without_a_name_still_counts() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=({"id": "rec-1", "name": "R", "recognizerConfig": {"type": "pattern"}},),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        results=(_match("R", 0.5, pattern_regex="rx", pattern_score=0.5),),
    )
    metadata = build_recognizer_metadata(score, candidate)
    assert metadata is not None
    assert metadata["patterns"] == [{"name": None, "regex": "rx", "score": 0.5}]


def test_metadata_is_none_without_results_or_without_an_id() -> None:
    candidate = _candidate("PII.Sensitive")
    assert build_recognizer_metadata(_score("PII.Sensitive", 0.9), candidate) is None
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        results=(_match("EmailRecognizer", 0.9),),
    )
    assert build_recognizer_metadata(score, candidate) is None


def test_first_matching_config_without_an_id_yields_no_metadata() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=(
            {"name": "R", "recognizerConfig": {"type": "pattern"}},
            {"id": "rec-2", "name": "R", "recognizerConfig": {"type": "pattern"}},
        ),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        results=(_match("R", 0.9),),
    )
    assert build_recognizer_metadata(score, candidate) is None


def test_tag_label_carries_metadata_when_it_resolves() -> None:
    candidate = _candidate(
        "PII.Sensitive",
        recognizers=({"id": "rec-1", "name": "R", "recognizerConfig": {"type": "pattern"}},),
    )
    score = TagScore(
        tag_fqn="PII.Sensitive",
        score=0.9,
        target="content",
        results=(_match("R", 0.9),),
        all_results=(_match("R", 0.9),),
    )
    label = build_tag_label(score, candidate)
    assert label["metadata"] == {
        "recognizer": {
            "recognizerId": "rec-1",
            "recognizerName": "R",
            "score": 0.9,
            "target": "content",
        }
    }
