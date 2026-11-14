# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for per-tag analysis (design §2.7)."""

from __future__ import annotations

import importlib.util
import logging
from types import SimpleNamespace
from typing import Any

import pytest

from smartmetadata_ingestion.classification.analysis import (
    REPORT_SCORE_CUTOFF,
    ScoredMatch,
    TagAnalyzer,
    analyze_column,
    build_tag_analyzer,
    context_matches,
    group_configs_by_language,
    is_all_caps_value,
)
from smartmetadata_ingestion.classification.recognizers import effective_recognizer_name

needs_presidio = pytest.mark.skipif(
    importlib.util.find_spec("presidio_analyzer") is None,
    reason="autoclassification extra not installed",
)


def _match(
    recognizer: str,
    score: float,
    *,
    entity_type: str = "EMAIL_ADDRESS",
    span_text: str = "a@b.com",
    pattern_score: float | None = None,
    from_spacy_ner: bool = False,
    context_enhanced: bool = False,
) -> ScoredMatch:
    return ScoredMatch(
        entity_type=entity_type,
        start=0,
        end=len(span_text),
        score=score,
        span_text=span_text,
        recognizer_name=recognizer,
        pattern_score=pattern_score,
        from_spacy_ner=from_spacy_ner,
        context_enhanced=context_enhanced,
    )


def _config(name: str, *, target: str | None = None, **extra: Any) -> dict[str, Any]:
    config: dict[str, Any] = {
        "name": name,
        "recognizerConfig": {"type": "pattern"},
    }
    if target is not None:
        config["target"] = target
    config.update(extra)
    return config


def _analyzer(
    configs: list[dict[str, Any]],
    *,
    full: dict[str, list[ScoredMatch]] | None = None,
    spacy_only: dict[str, list[ScoredMatch]] | None = None,
    tag_fqn: str = "PII.Sensitive",
    language: str = "en",
    instance_contexts: dict[str, list[str] | None] | None = None,
) -> tuple[TagAnalyzer, list[tuple[str, str, list[str] | None]]]:
    calls: list[tuple[str, str, list[str] | None]] = []
    full_map = full or {}
    spacy_map = spacy_only or {}

    def analyze_fn(text: str, context_tokens: list[str] | None) -> list[ScoredMatch]:
        calls.append(("full", text, context_tokens))
        return list(full_map.get(text, []))

    def spacy_fn(text: str, context_tokens: list[str] | None) -> list[ScoredMatch]:
        calls.append(("spacy", text, context_tokens))
        return list(spacy_map.get(text, []))

    pairs: list[tuple[dict[str, Any], Any]] = []
    for config in configs:
        recognizer = None
        if instance_contexts is not None:
            name = effective_recognizer_name(config)
            if name in instance_contexts:
                recognizer = SimpleNamespace(context=instance_contexts[name])
        pairs.append((config, recognizer))
    analyzer = TagAnalyzer(
        tag_fqn=tag_fqn,
        language=language,
        pairs=pairs,
        analyze_fn=analyze_fn,
        spacy_analyze_fn=spacy_fn,
    )
    return analyzer, calls


def _column(**overrides: Any) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "column_dotted_path": "email",
        "column_tokens": ["email"],
        "entity_type": "table",
        "entity_fqn": "svc.db.sc.tbl",
        "content_valid": True,
    }
    kwargs.update(overrides)
    return kwargs


def _fake_result(
    entity_type: str,
    score: float,
    *,
    text: str = "John Doe",
    metadata: dict[str, Any] | None = None,
    explanation: Any = None,
) -> Any:
    return SimpleNamespace(
        entity_type=entity_type,
        start=0,
        end=len(text),
        score=score,
        analysis_explanation=explanation,
        recognition_metadata=metadata,
    )


def _fake_explanation(
    recognizer: str,
    *,
    pattern_name: str | None = None,
    pattern: str | None = None,
    original_score: float | None = None,
    score: float | None = None,
) -> Any:
    return SimpleNamespace(
        recognizer=recognizer,
        pattern_name=pattern_name,
        pattern=pattern,
        original_score=original_score,
        score=score,
    )


def _spacy_config() -> dict[str, Any]:
    return _config(
        "Spacy",
        recognizerConfig={"type": "predefined", "name": "SpacyRecognizer"},
    )


# --- Language grouping -------------------------------------------------------


def test_fixed_language_keeps_declared_and_any_recognizers() -> None:
    en = _config("En", recognizerConfig={"type": "pattern", "supportedLanguage": "en"})
    any_lang = _config("Any", recognizerConfig={"type": "pattern", "supportedLanguage": "any"})
    pl = _config("Pl", recognizerConfig={"type": "pattern", "supportedLanguage": "pl"})
    groups = group_configs_by_language([en, any_lang, pl], "en")
    assert groups == {"en": [en, any_lang]}
    assert group_configs_by_language([pl], "en") == {}


def test_any_language_groups_by_declaration_with_any_under_english() -> None:
    en = _config("En", recognizerConfig={"type": "pattern", "supportedLanguage": "en"})
    any_lang = _config("Any", recognizerConfig={"type": "pattern", "supportedLanguage": "any"})
    pl = _config("Pl", recognizerConfig={"type": "pattern", "supportedLanguage": "pl"})
    groups = group_configs_by_language([en, any_lang, pl], "any")
    assert groups == {"en": [en, any_lang], "pl": [pl]}


def test_all_caps_detection() -> None:
    assert is_all_caps_value("JOHN DOE") is True
    assert is_all_caps_value("ABC!") is True
    assert is_all_caps_value("John Doe") is False
    assert is_all_caps_value("ABC123") is False
    assert is_all_caps_value("123") is False
    assert is_all_caps_value("") is False


# --- Combination and cutoff ---------------------------------------------------


def test_no_analyzers_scores_nothing() -> None:
    assert analyze_column([], ["a@b.com"], **_column()) is None


def test_content_score_is_the_max_with_the_content_target() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={"a@b.com": [_match("R", 0.8)], "b@c.com": [_match("R", 0.6)]},
    )
    score = analyze_column([analyzer], ["a@b.com", "b@c.com"], **_column())
    assert score is not None
    assert score.score == 0.8
    assert score.target == "content"
    assert score.column_name_matched is False


def test_column_scores_sum_capped_and_win_ties() -> None:
    analyzer, _ = _analyzer(
        [_config("ContentR"), _config("NameR", target="column_name")],
        full={
            "a@b.com": [_match("ContentR", 0.6)],
            "email": [_match("NameR", 0.3), _match("NameR", 0.3)],
        },
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 0.6
    assert score.target == "column_name"
    assert score.column_name_matched is True
    assert len(score.results) == 2
    assert len(score.all_results) == 3


def test_column_sum_caps_at_one() -> None:
    analyzer, _ = _analyzer(
        [_config("R", target="column_name")],
        full={"email": [_match("R", 0.7), _match("R", 0.7)]},
    )
    score = analyze_column([analyzer], [], **_column())
    assert score is not None
    assert score.score == 1.0


def test_cutoff_drops_scores_at_or_below_it() -> None:
    analyzer, _ = _analyzer([_config("R")], full={"x": [_match("R", REPORT_SCORE_CUTOFF)]})
    assert analyze_column([analyzer], ["x"], **_column()) is None
    analyzer, _ = _analyzer([_config("R")], full={"x": [_match("R", REPORT_SCORE_CUTOFF + 0.01)]})
    assert analyze_column([analyzer], ["x"], **_column()) is not None


def test_invalid_content_skips_content_but_keeps_column_name() -> None:
    analyzer, calls = _analyzer(
        [_config("R", target="column_name")],
        full={"email": [_match("R", 0.9)]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column(content_valid=False))
    assert score is not None
    assert score.target == "column_name"
    assert calls == [("full", "email", None)]


def test_matches_union_across_language_groups() -> None:
    first, _ = _analyzer([_config("R")], full={"a@b.com": [_match("R", 0.7)]}, language="en")
    second, _ = _analyzer([_config("R")], full={"a@b.com": [_match("R", 0.9)]}, language="pl")
    score = analyze_column([first, second], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 0.9
    assert len(score.all_results) == 2


def test_column_name_analysis_reads_the_leaf_name_with_no_context() -> None:
    analyzer, calls = _analyzer(
        [_config("NameOnly", target="column_name"), _config("ContentOnly")],
        full={
            "city": [
                _match("NameOnly", 0.9),
                _match("ContentOnly", 0.9),
            ]
        },
    )
    score = analyze_column([analyzer], [], **_column(column_dotted_path="address.city"))
    assert score is not None
    assert [m.recognizer_name for m in score.results] == ["NameOnly"]
    assert ("full", "city", None) in calls
    assert not [call for call in calls if call[1] == "address.city"]


def test_column_name_analysis_ignores_parent_segments() -> None:
    # Matches keyed only under the dotted path or under a parent
    # segment must never fire: neither text is analyzed.
    analyzer, calls = _analyzer(
        [_config("NameOnly", target="column_name")],
        full={
            "address.city": [_match("NameOnly", 0.9)],
            "address": [_match("NameOnly", 0.9)],
        },
    )
    assert analyze_column([analyzer], [], **_column(column_dotted_path="address.city")) is None
    assert [call[1] for call in calls] == ["city"]


def test_content_pass_runs_only_content_targeted_recognizers() -> None:
    analyzer, _ = _analyzer(
        [_config("ContentR"), _config("NameR", target="column_name")],
        full={
            "x": [_match("ContentR", 0.7), _match("NameR", 0.9)],
            "email": [_match("NameR", 0.8)],
        },
    )
    score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    # The column_name-targeted 0.9 must not win the content pass; the
    # column pass still sees its own recognizer at 0.8.
    assert score.score == 0.8
    assert score.target == "column_name"
    assert [m.recognizer_name for m in score.results] == ["NameR"]
    assert [m.recognizer_name for m in score.all_results] == ["ContentR", "NameR"]


def test_all_caps_values_get_a_second_ner_pass_over_title_case() -> None:
    analyzer, calls = _analyzer(
        [_config("R")],
        full={"JOHN DOE": [], "JANE ROE": []},
        spacy_only={
            "John Doe": [
                _match("R", 0.85, entity_type="PERSON", span_text="John Doe", from_spacy_ner=True),
                _match(
                    "R",
                    0.95,
                    entity_type="DATE_TIME",
                    span_text="2018-03-14",
                    from_spacy_ner=True,
                ),
            ],
            "Jane Roe": [
                _match("R", 0.85, entity_type="PERSON", span_text="Jane Roe", from_spacy_ner=True),
                _match(
                    "R",
                    0.95,
                    entity_type="ORGANIZATION",
                    span_text="Jane Roe",
                    from_spacy_ner=True,
                ),
                _match("R", 0.95, entity_type="PERSON", span_text="Jane Roe"),
            ],
        },
    )
    score = analyze_column([analyzer], ["JOHN DOE", "JANE ROE"], **_column())
    assert score is not None
    # Only the two corroborated spaCy PERSON results survive: the
    # DATE_TIME, ORGANIZATION, and non-spaCy PERSON decoys score
    # higher but are filtered from the second pass.
    assert score.score == 0.85
    assert len(score.results) == 2
    assert ("spacy", "John Doe", ["email"]) in calls
    assert ("spacy", "Jane Roe", ["email"]) in calls
    analyzer, calls = _analyzer([_config("R")], full={"John Doe": []})
    analyze_column([analyzer], ["John Doe"], **_column())
    assert not [call for call in calls if call[0] == "spacy"]


def test_second_ner_pass_keeps_only_spacy_named_entities() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={"JOHN DOE": []},
        spacy_only={
            "John Doe": [
                _match(
                    "R",
                    0.9,
                    entity_type="DATE_TIME",
                    span_text="2018-03-14",
                    from_spacy_ner=True,
                )
            ]
        },
    )
    assert analyze_column([analyzer], ["JOHN DOE"], **_column()) is None
    analyzer, _ = _analyzer(
        [_config("R")],
        full={"JOHN DOE": []},
        spacy_only={"John Doe": [_match("R", 0.9, entity_type="PERSON", span_text="John Doe")]},
    )
    # A PERSON result the spaCy recognizer did not produce is not a
    # second-pass result either.
    assert analyze_column([analyzer], ["JOHN DOE"], **_column()) is None


# --- Decorators ---------------------------------------------------------------


def test_exception_exclusion_drops_the_match() -> None:
    # The exact-link rule (supplement §8), exercised through the
    # real predicate in _apply_decorators: only the exact table
    # link with the leaf name excludes. A link for another leaf,
    # another table, an entity-level link, or a topic link leaves
    # the match standing.
    exact = "<#E::table::svc.db.sc.tbl::columns::email>"
    config = _config("R", exceptionList=[{"entityLink": exact}])
    analyzer, _ = _analyzer([config], full={"a@b.com": [_match("R", 0.9)]})
    assert analyze_column([analyzer], ["a@b.com"], **_column()) is None
    for link in (
        "<#E::table::svc.db.sc.tbl::columns::other>",
        "<#E::table::svc.db.sc.other::columns::email>",
        "<#E::table::svc.db.sc.tbl>",
        "<#E::topic::svc.topic::fields::email>",
    ):
        config = _config("R", exceptionList=[{"entityLink": link}])
        analyzer, _ = _analyzer([config], full={"a@b.com": [_match("R", 0.9)]})
        score = analyze_column([analyzer], ["a@b.com"], **_column())
        assert score is not None
        assert score.score == 0.9
        assert [match.recognizer_name for match in score.results] == ["R"]


def test_excepted_match_cannot_corroborate_an_uncontextualized_ner_result() -> None:
    # Ordering proof (S-M1): exclusion in _apply_decorators runs
    # before corroboration, so an excepted recognizer's match can
    # never supply the second distinct span an uncontextualized
    # NER result needs, and no tag from the excepted recognizer
    # scores. Without the exception list the same two spans
    # corroborate and the tag scores (control case).
    exact = "<#E::table::svc.db.sc.tbl::columns::email>"
    ner = {
        "x": [
            _match(
                "R",
                0.9,
                entity_type="PERSON",
                span_text="Jane Roe",
                from_spacy_ner=True,
            ),
            _match(
                "S",
                0.9,
                entity_type="PERSON",
                span_text="John Doe",
                from_spacy_ner=True,
            ),
        ]
    }
    excepted = _config("R", exceptionList=[{"entityLink": exact}])
    analyzer, _ = _analyzer([excepted, _config("S")], full=ner)
    assert analyze_column([analyzer], ["x"], **_column()) is None
    analyzer, _ = _analyzer([_config("R"), _config("S")], full=ner)
    score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    assert score.score == 0.9
    assert len(score.results) == 2


def test_context_enhancement_boosts_to_one_and_marks_the_flag() -> None:
    config = _config("R", recognizerConfig={"type": "pattern", "context": ["email"]})
    analyzer, _ = _analyzer(
        [config],
        full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 1.0
    assert score.results[0].context_enhanced is True


def test_enhancement_skips_low_scores_and_already_enhanced_results() -> None:
    config = _config("R", recognizerConfig={"type": "pattern", "context": ["email"]})
    analyzer, _ = _analyzer([config], full={"x": [_match("R", 0.2, pattern_score=0.2)]})
    score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    assert score.score == 0.2
    assert score.results[0].context_enhanced is False
    # A result already carrying the enhancement flag (set by native
    # Presidio enhancement) is never re-boosted: the score stands.
    analyzer, _ = _analyzer(
        [config],
        full={"x": [_match("R", 0.9, pattern_score=0.8, context_enhanced=True)]},
    )
    score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    assert score.score == 0.9
    assert score.results[0].context_enhanced is True
    # A score above the pattern score WITHOUT the flag no longer
    # skips enhancement: the score-proxy detection is gone, only
    # the flag skips.
    analyzer, _ = _analyzer([config], full={"x": [_match("R", 0.9, pattern_score=0.8)]})
    score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    assert score.score == 1.0
    assert score.results[0].context_enhanced is True


def test_context_matches_uses_token_set_and_joined_text() -> None:
    assert context_matches(["email"], ["email"]) is True
    assert context_matches(["Email"], ["email"]) is True
    assert context_matches(["mail"], ["email"]) is False
    assert context_matches(["email"], ["email", "address"]) is True
    assert context_matches(["email"], ["email-address"]) is True
    assert context_matches(["address"], ["user", "email"]) is False
    assert context_matches([], ["email"]) is False
    assert context_matches(["email"], []) is False
    assert context_matches(["---"], ["email"]) is False


def test_context_matches_space_phrases_but_not_underscore_words() -> None:
    tokens = ["national", "health", "service"]
    assert context_matches(["national health service"], tokens) is True
    assert context_matches(["national_health_service"], tokens) is False
    assert context_matches(["bank_account"], ["bank", "account"]) is False
    assert context_matches(["nhs_number"], ["nhs", "number"]) is False
    assert context_matches(["tax file number"], ["tax", "file", "number"]) is True


def test_context_matches_camel_case_words_only_as_single_tokens() -> None:
    assert context_matches(["firstName"], ["first", "name"]) is False
    assert context_matches(["firstName"], ["firstname"]) is True
    assert context_matches(["userEmail"], ["user", "email"]) is False
    assert context_matches(["stateName"], ["state", "name"]) is False


def test_context_matches_guards_multi_part_words_at_word_boundaries() -> None:
    assert context_matches(["tax file number"], ["tax", "file", "numbering"]) is False
    assert context_matches(["tax file number"], ["atax", "file", "number"]) is False
    assert context_matches(["tax file number"], ["my", "tax", "file", "number"]) is True
    assert context_matches(["file number"], ["tax", "file", "number"]) is True


def test_enhancement_reads_class_default_context_without_config_context() -> None:
    config = _config("R", recognizerConfig={"type": "pattern"})
    analyzer, _ = _analyzer(
        [config],
        full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
        instance_contexts={"R": ["email"]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 1.0
    assert score.results[0].context_enhanced is True
    # The class-default boost lifts the match over the threshold,
    # since filtering runs after enhancement.
    config = _config("R", recognizerConfig={"type": "pattern"}, confidenceThreshold=0.6)
    analyzer, _ = _analyzer(
        [config],
        full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
        instance_contexts={"R": ["email"]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 1.0


def test_enhancement_config_context_replaces_class_default() -> None:
    config = _config("R", recognizerConfig={"type": "pattern", "context": ["other"]})
    analyzer, _ = _analyzer(
        [config],
        full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
        instance_contexts={"R": ["email"]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 0.5
    assert score.results[0].context_enhanced is False


def test_enhancement_without_any_context_words_does_not_boost() -> None:
    config = _config("R", recognizerConfig={"type": "pattern"})
    for instance_context in (None, []):
        analyzer, _ = _analyzer(
            [config],
            full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
            instance_contexts={"R": instance_context},
        )
        score = analyze_column([analyzer], ["a@b.com"], **_column())
        assert score is not None
        assert score.score == 0.5
        assert score.results[0].context_enhanced is False
    # An explicitly empty config list also falls back to the class
    # default (empty is falsy).
    config = _config("R", recognizerConfig={"type": "pattern", "context": []})
    analyzer, _ = _analyzer(
        [config],
        full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]},
        instance_contexts={"R": ["email"]},
    )
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 1.0


def test_enhancement_does_not_over_boost_underscore_or_camel_case_words() -> None:
    config = _config(
        "R", recognizerConfig={"type": "pattern", "context": ["national_health_service"]}
    )
    analyzer, _ = _analyzer([config], full={"x": [_match("R", 0.5, pattern_score=0.5)]})
    score = analyze_column(
        [analyzer],
        ["x"],
        **_column(
            column_dotted_path="national_health_service",
            column_tokens=["national", "health", "service"],
        ),
    )
    assert score is not None
    assert score.score == 0.5
    assert score.results[0].context_enhanced is False
    config = _config("R", recognizerConfig={"type": "pattern", "context": ["firstName"]})
    analyzer, _ = _analyzer([config], full={"x": [_match("R", 0.5, pattern_score=0.5)]})
    score = analyze_column(
        [analyzer],
        ["x"],
        **_column(column_dotted_path="firstName", column_tokens=["first", "name"]),
    )
    assert score is not None
    assert score.score == 0.5
    assert score.results[0].context_enhanced is False
    # The space-joined phrase form of the same words DOES boost.
    config = _config(
        "R", recognizerConfig={"type": "pattern", "context": ["national health service"]}
    )
    analyzer, _ = _analyzer([config], full={"x": [_match("R", 0.5, pattern_score=0.5)]})
    score = analyze_column(
        [analyzer],
        ["x"],
        **_column(
            column_dotted_path="national_health_service",
            column_tokens=["national", "health", "service"],
        ),
    )
    assert score is not None
    assert score.score == 1.0
    assert score.results[0].context_enhanced is True


def test_threshold_filter_runs_after_enhancement() -> None:
    config = _config(
        "R",
        recognizerConfig={"type": "pattern", "context": ["email"]},
        confidenceThreshold=0.6,
    )
    analyzer, _ = _analyzer([config], full={"a@b.com": [_match("R", 0.5, pattern_score=0.5)]})
    score = analyze_column([analyzer], ["a@b.com"], **_column())
    assert score is not None
    assert score.score == 1.0
    config = _config("R", confidenceThreshold=0.6)
    analyzer, _ = _analyzer([config], full={"a@b.com": [_match("R", 0.5)]})
    assert analyze_column([analyzer], ["a@b.com"], **_column()) is None


def test_unattributed_results_are_warned_and_dropped(
    caplog: pytest.LogCaptureFixture,
) -> None:
    analyzer, _ = _analyzer(
        [_config("Known")],
        full={"x": [_match("Unknown", 0.9), _match("Known", 0.7)]},
    )
    with caplog.at_level(logging.WARNING, logger="smartmetadata_ingestion.classification.analysis"):
        score = analyze_column([analyzer], ["x"], **_column())
    assert score is not None
    assert score.score == 0.7
    assert [m.recognizer_name for m in score.results] == ["Known"]
    assert "Unknown" in caplog.text
    # An unattributed result alone scores nothing, however high it
    # is: it bypasses neither the threshold nor exclusion by
    # existing, because it is dropped before either could apply.
    analyzer, _ = _analyzer([_config("Known")], full={"x": [_match("Unknown", 0.9)]})
    assert analyze_column([analyzer], ["x"], **_column()) is None


# --- Patchers and corroboration ------------------------------------------------


def test_date_patcher_drops_non_date_spans() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "19.99": [_match("R", 0.9, entity_type="DATE_TIME", span_text="19.99")],
            "2018-03-14": [_match("R", 0.9, entity_type="DATE_TIME", span_text="2018-03-14")],
        },
    )
    score = analyze_column([analyzer], ["19.99"], **_column())
    assert score is None
    score = analyze_column([analyzer], ["2018-03-14"], **_column())
    assert score is not None


def test_ner_digit_patcher_drops_digit_spans_for_names_only() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "A1B2": [_match("R", 0.9, entity_type="PERSON", span_text="A1B2")],
            "a1@b.com": [_match("R", 0.9, entity_type="EMAIL_ADDRESS", span_text="a1@b.com")],
        },
    )
    assert analyze_column([analyzer], ["A1B2"], **_column()) is None
    assert analyze_column([analyzer], ["a1@b.com"], **_column()) is not None


def test_corroboration_drops_a_lone_uncontextualized_ner_result() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "John Doe": [
                _match("R", 0.85, entity_type="PERSON", span_text="John Doe", from_spacy_ner=True)
            ]
        },
    )
    assert analyze_column([analyzer], ["John Doe"], **_column()) is None


def test_corroboration_keeps_two_distinct_spans() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "John Doe": [
                _match("R", 0.85, entity_type="PERSON", span_text="John Doe", from_spacy_ner=True)
            ],
            "Jane Roe": [
                _match("R", 0.85, entity_type="PERSON", span_text="Jane Roe", from_spacy_ner=True)
            ],
        },
    )
    score = analyze_column([analyzer], ["John Doe", "Jane Roe"], **_column())
    assert score is not None
    assert len(score.results) == 2


def test_corroboration_counts_case_and_spacing_variants_as_one_span() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "John  Doe": [
                _match("R", 0.85, entity_type="PERSON", span_text="John  Doe", from_spacy_ner=True)
            ],
            "john doe": [
                _match("R", 0.85, entity_type="PERSON", span_text="john doe", from_spacy_ner=True)
            ],
        },
    )
    assert analyze_column([analyzer], ["John  Doe", "john doe"], **_column()) is None


def test_corroboration_spares_enhanced_and_pattern_results() -> None:
    config = _config("R", recognizerConfig={"type": "pattern", "context": ["email"]})
    analyzer, _ = _analyzer(
        [config],
        full={
            "John Doe": [
                _match(
                    "R",
                    0.85,
                    entity_type="PERSON",
                    span_text="John Doe",
                    pattern_score=0.85,
                    from_spacy_ner=True,
                )
            ]
        },
    )
    score = analyze_column([analyzer], ["John Doe"], **_column())
    assert score is not None
    assert score.results[0].context_enhanced is True
    analyzer, _ = _analyzer(
        [_config("R")],
        full={"John Doe": [_match("R", 0.85, entity_type="PERSON", span_text="John Doe")]},
    )
    assert analyze_column([analyzer], ["John Doe"], **_column()) is not None


def test_corroboration_spares_presidio_enhanced_ner_results() -> None:
    analyzer, _ = _analyzer(
        [_config("R")],
        full={
            "John Doe": [
                _match(
                    "R",
                    0.85,
                    entity_type="PERSON",
                    span_text="John Doe",
                    from_spacy_ner=True,
                    context_enhanced=True,
                )
            ]
        },
    )
    # A lone NER result carrying the enhancement flag (set by native
    # Presidio enhancement) stands alone without corroboration, and
    # keeps its score: no config context exists to boost it further.
    score = analyze_column([analyzer], ["John Doe"], **_column())
    assert score is not None
    assert score.score == 0.85
    assert score.results[0].context_enhanced is True


def test_patchers_do_not_touch_column_name_matches() -> None:
    analyzer, _ = _analyzer(
        [_config("R", target="column_name")],
        full={"birthdate": [_match("R", 0.9, entity_type="DATE_TIME", span_text="birthdate")]},
    )
    score = analyze_column([analyzer], [], **_column(column_dotted_path="birthdate"))
    assert score is not None


# --- Result conversion ----------------------------------------------------------


def test_to_match_reads_enhancement_flag_from_metadata() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_spacy_config(), None)])
    flagged = analyzer._to_match(
        _fake_result(
            "PERSON",
            0.9,
            metadata={
                "recognizer_name": "SpacyRecognizer",
                "is_score_enhanced_by_context": True,
            },
        ),
        "John Doe",
    )
    assert flagged.context_enhanced is True
    assert flagged.recognizer_name == "SpacyRecognizer"
    unflagged = analyzer._to_match(
        _fake_result("PERSON", 0.9, metadata={"recognizer_name": "SpacyRecognizer"}),
        "John Doe",
    )
    assert unflagged.context_enhanced is False
    falsy = analyzer._to_match(
        _fake_result(
            "PERSON",
            0.9,
            metadata={
                "recognizer_name": "SpacyRecognizer",
                "is_score_enhanced_by_context": False,
            },
        ),
        "John Doe",
    )
    assert falsy.context_enhanced is False


def test_to_match_determines_spacy_ner_from_metadata_not_config() -> None:
    analyzer = TagAnalyzer(
        tag_fqn="PII.Sensitive",
        language="en",
        pairs=[(_spacy_config(), None), (_config("R"), None)],
    )
    person = analyzer._to_match(
        _fake_result("PERSON", 0.9, metadata={"recognizer_name": "SpacyRecognizer"}),
        "John Doe",
    )
    assert person.from_spacy_ner is True
    date_time = analyzer._to_match(
        _fake_result("DATE_TIME", 0.9, metadata={"recognizer_name": "SpacyRecognizer"}),
        "John Doe",
    )
    assert date_time.from_spacy_ner is False
    organization = analyzer._to_match(
        _fake_result("ORGANIZATION", 0.9, metadata={"recognizer_name": "SpacyRecognizer"}),
        "John Doe",
    )
    assert organization.from_spacy_ner is False
    other_name = analyzer._to_match(
        _fake_result("PERSON", 0.9, metadata={"recognizer_name": "OtherRecognizer"}),
        "John Doe",
    )
    assert other_name.from_spacy_ner is False
    # A pattern config literally named SpacyRecognizer still yields a
    # spaCy NER result when the metadata names it: which config owns
    # the result is irrelevant, only the metadata stamp counts.
    pattern_named = TagAnalyzer(
        tag_fqn="PII.Sensitive",
        language="en",
        pairs=[(_config("SpacyRecognizer"), None)],
    )
    stamped = pattern_named._to_match(
        _fake_result("PERSON", 0.9, metadata={"recognizer_name": "SpacyRecognizer"}),
        "John Doe",
    )
    assert stamped.from_spacy_ner is True


def test_to_match_tolerates_missing_metadata() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_spacy_config(), None)])
    match = analyzer._to_match(_fake_result("PERSON", 0.9, metadata=None), "John Doe")
    assert match.recognizer_name == "unknown"
    assert match.recognizer_identifier is None
    assert match.context_enhanced is False
    assert match.from_spacy_ner is False


def test_to_match_names_results_from_metadata_without_explanation() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_config("R"), None)])
    match = analyzer._to_match(
        _fake_result("EMAIL_ADDRESS", 0.9, text="a@b.com", metadata={"recognizer_name": "R"}),
        "a@b.com",
    )
    assert match.recognizer_name == "R"
    assert match.recognizer_identifier is None
    assert match.span_text == "a@b.com"
    assert match.pattern_name is None
    assert match.pattern_score is None


def test_to_match_stamps_recognizer_identifier_distinct_from_name() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_config("R"), None)])
    match = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.9,
            text="a@b.com",
            metadata={
                "recognizer_name": "EmailRecognizer",
                "recognizer_identifier": "EmailRecognizer_12345",
            },
        ),
        "a@b.com",
    )
    assert match.recognizer_name == "EmailRecognizer"
    assert match.recognizer_identifier == "EmailRecognizer_12345"
    # The identifier is stamped as-is, never rewritten to the name:
    # a construction-time name differing from the reset name stays.
    match = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.9,
            text="a@b.com",
            metadata={
                "recognizer_name": "EmailRecognizer",
                "recognizer_identifier": "HardenedEmailRecognizer_67890",
            },
        ),
        "a@b.com",
    )
    assert match.recognizer_name == "EmailRecognizer"
    assert match.recognizer_identifier == "HardenedEmailRecognizer_67890"


def test_to_match_uses_working_explanation_score_not_original() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_config("R"), None)])
    boosted = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            1.0,
            text="a@b.com",
            metadata={"recognizer_name": "R"},
            explanation=_fake_explanation(
                "R", pattern_name="email", pattern="\\S+@\\S+", original_score=0.5, score=1.0
            ),
        ),
        "a@b.com",
    )
    assert boosted.pattern_score == 1.0
    assert boosted.pattern_name == "email"
    improved = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.85,
            text="a@b.com",
            metadata={"recognizer_name": "R"},
            explanation=_fake_explanation("R", original_score=0.6, score=0.85),
        ),
        "a@b.com",
    )
    assert improved.pattern_score == 0.85


def test_to_match_sources_name_from_metadata_not_explanation() -> None:
    analyzer = TagAnalyzer(tag_fqn="PII.Sensitive", language="en", pairs=[(_config("R"), None)])
    named = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.9,
            text="a@b.com",
            metadata={"recognizer_name": "CurrentName"},
            explanation=_fake_explanation("StaleName", original_score=0.5, score=0.5),
        ),
        "a@b.com",
    )
    assert named.recognizer_name == "CurrentName"
    identified = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.9,
            text="a@b.com",
            metadata={"recognizer_identifier": "SomeId_1"},
            explanation=_fake_explanation("StaleName", original_score=0.5, score=0.5),
        ),
        "a@b.com",
    )
    assert identified.recognizer_name == "SomeId_1"
    assert identified.recognizer_identifier == "SomeId_1"
    unknown = analyzer._to_match(
        _fake_result(
            "EMAIL_ADDRESS",
            0.9,
            text="a@b.com",
            metadata={},
            explanation=_fake_explanation("StaleName", original_score=0.5, score=0.5),
        ),
        "a@b.com",
    )
    assert unknown.recognizer_name == "unknown"


# --- Live engine -----------------------------------------------------------------


@needs_presidio
def test_live_engine_runs_only_the_configured_recognizers() -> None:
    pytest.importorskip("spacy")
    config = _config(
        "CVV",
        recognizerConfig={
            "type": "pattern",
            "patterns": [{"name": "cvv", "regex": r"\b\d{3}-\d{3}\b", "score": 0.9}],
        },
    )
    analyzer = build_tag_analyzer("PII.Sensitive", [config], "en")
    assert analyzer is not None
    matches = analyzer.analyze_text("code 123-456 here", [])
    assert len(matches) == 1
    assert matches[0].recognizer_name == "CVV"
    assert matches[0].span_text == "123-456"
    # An email address matches nothing: no predefined recognizer leaks
    # into a registry built for one configured pattern.
    assert analyzer.analyze_text("write to alice@example.com", []) == []


@needs_presidio
def test_live_engine_retains_the_decision_process_for_pattern_results() -> None:
    # Decision-process retention (supplement §19.5): the mapped
    # match must carry the pattern data and the working pattern
    # score the reason rendering (§17) and metadata triples (§12)
    # consume. Without retention the engine strips every
    # explanation and all three fields land as None.
    pytest.importorskip("spacy")
    config = _config(
        "CVV",
        recognizerConfig={
            "type": "pattern",
            "patterns": [{"name": "cvv", "regex": r"\b\d{3}-\d{3}\b", "score": 0.9}],
        },
    )
    analyzer = build_tag_analyzer("PII.Sensitive", [config], "en")
    assert analyzer is not None
    matches = analyzer.analyze_text("code 123-456 here", [])
    assert len(matches) == 1
    match = matches[0]
    assert match.pattern_name == "cvv"
    assert match.pattern_regex == r"\b\d{3}-\d{3}\b"
    assert match.pattern_score is not None
    assert match.pattern_score == 0.9


@needs_presidio
def test_build_tag_analyzer_returns_none_without_usable_recognizers() -> None:
    assert build_tag_analyzer("PII.Sensitive", [], "en") is None
    assert (
        build_tag_analyzer(
            "PII.Sensitive",
            [_config("C", recognizerConfig={"type": "custom"})],
            "en",
        )
        is None
    )
