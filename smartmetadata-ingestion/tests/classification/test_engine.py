# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for the classification engine (design §2.1, §2.10)."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from smartmetadata_ingestion.classification.analysis import ScoredMatch, TagAnalyzer
from smartmetadata_ingestion.classification.candidates import CandidateTag
from smartmetadata_ingestion.classification.engine import (
    PII_CLASSIFICATION_FILTER,
    ClassificationEngine,
    resolve_store_sample_data,
)
from smartmetadata_ingestion.classification.preprocessing import MAX_VALUE_CHARS
from smartmetadata_ingestion.errors import WorkflowError

# --- Store-flag resolution ----------------------------------------------------


def test_store_flag_off_short_circuits() -> None:
    def _boom() -> dict[str, Any]:
        raise AssertionError("reader must not be consulted")

    assert resolve_store_sample_data(pipeline_store=False, settings_reader=_boom) is False


def test_store_flag_on_without_a_reader_or_settings() -> None:
    assert resolve_store_sample_data(pipeline_store=True, settings_reader=None) is True
    assert resolve_store_sample_data(pipeline_store=True, settings_reader=lambda: None) is True


def test_store_flag_on_with_absent_or_misshapen_settings() -> None:
    assert resolve_store_sample_data(pipeline_store=True, settings_reader=lambda: {}) is True
    assert (
        resolve_store_sample_data(
            pipeline_store=True, settings_reader=lambda: {"configValue": "junk"}
        )
        is True
    )
    assert (
        resolve_store_sample_data(
            pipeline_store=True,
            settings_reader=lambda: {"configValue": {"sampleDataConfig": "junk"}},
        )
        is True
    )
    assert (
        resolve_store_sample_data(
            pipeline_store=True,
            settings_reader=lambda: {"configValue": {"sampleDataConfig": {}}},
        )
        is True
    )


def test_store_flag_ands_with_the_server_setting() -> None:
    off = {"configValue": {"sampleDataConfig": {"storeSampleData": False}}}
    on = {"configValue": {"sampleDataConfig": {"storeSampleData": True}}}
    assert resolve_store_sample_data(pipeline_store=True, settings_reader=lambda: off) is False
    assert resolve_store_sample_data(pipeline_store=True, settings_reader=lambda: on) is True


# --- Engine wiring --------------------------------------------------------------


class _StubStore:
    def __init__(self, candidates: list[CandidateTag]) -> None:
        self._candidates = candidates
        self.calls: list[tuple[str, ...]] = []

    def candidates(self, classification_filter: tuple[str, ...]) -> tuple[CandidateTag, ...]:
        self.calls.append(classification_filter)
        return tuple(self._candidates)


def _candidate(
    tag_fqn: str = "PII.Sensitive",
    recognizers: tuple[dict[str, Any], ...] = (),
    **overrides: Any,
) -> CandidateTag:
    payload: dict[str, Any] = {
        "tag_fqn": tag_fqn,
        "name": tag_fqn.split(".")[-1],
        "classification": "PII",
        "mutually_exclusive": True,
        "minimum_confidence": 0.6,
        "conflict_resolution": "highest_confidence",
        "priority": 100,
        "recognizers": recognizers,
    }
    payload.update(overrides)
    return CandidateTag(**payload)


def _email_config(**extra: Any) -> dict[str, Any]:
    config: dict[str, Any] = {
        "id": "rec-1",
        "name": "EmailRecognizer",
        "recognizerConfig": {
            "type": "predefined",
            "name": "EmailRecognizer",
            "supportedLanguage": "en",
        },
        "confidenceThreshold": 0.6,
    }
    config.update(extra)
    return config


def _match(recognizer: str, score: float, span: str) -> ScoredMatch:
    return ScoredMatch(
        entity_type="EMAIL_ADDRESS",
        start=0,
        end=len(span),
        score=score,
        span_text=span,
        recognizer_name=recognizer,
        pattern_score=score,
    )


def _stub_factory(
    calls: list[tuple[str, str]],
) -> Any:
    def factory(tag_fqn: str, configs: list[dict[str, Any]], language: str) -> TagAnalyzer:
        calls.append((tag_fqn, language))

        def analyze_fn(text: str, context_tokens: list[str]) -> list[ScoredMatch]:
            if "@" in text:
                return [_match("EmailRecognizer", 0.9, text)]
            if text == "email":
                return [_match("EmailRecognizer", 0.9, text)]
            return []

        return TagAnalyzer(
            tag_fqn=tag_fqn,
            language=language,
            pairs=[(config, None) for config in configs],
            analyze_fn=analyze_fn,
        )

    return factory


def _table(columns: list[dict[str, Any]]) -> dict[str, Any]:
    return {"fullyQualifiedName": "svc.db.sc.tbl", "columns": columns}


def test_warm_up_is_idempotent_and_uses_the_pii_filter() -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    calls: list[tuple[str, str]] = []
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory(calls),
    )
    assert engine.has_candidates is False
    engine.warm_up()
    engine.warm_up()
    assert store.calls == [PII_CLASSIFICATION_FILTER]
    assert PII_CLASSIFICATION_FILTER == ("PII",)
    assert engine.has_candidates is True
    assert calls == [("PII.Sensitive", "en")]


def test_warm_up_with_no_candidates_tags_nothing_and_loads_no_model() -> None:
    store = _StubStore([])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    assert engine.has_candidates is False
    outcome = engine.classify_entity(_table([{"name": "email"}]), "table", [])
    assert outcome.column_tags == [] and outcome.failures == []


def test_warm_up_with_the_production_factory_and_no_candidates_needs_no_models() -> None:
    store = _StubStore([])
    engine = ClassificationEngine(client=None, language="en", confidence=80, candidate_store=store)
    engine.warm_up()
    assert engine.has_candidates is False


def test_warm_up_groups_configs_by_language() -> None:
    pl_config = _email_config(
        recognizerConfig={
            "type": "predefined",
            "name": "EmailRecognizer",
            "supportedLanguage": "pl",
        }
    )
    store = _StubStore([_candidate(recognizers=(_email_config(), pl_config))])
    calls: list[tuple[str, str]] = []
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory(calls),
    )
    engine.warm_up()
    assert calls == [("PII.Sensitive", "en")]
    calls.clear()
    engine_any = ClassificationEngine(
        client=None,
        language="any",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory(calls),
    )
    engine_any.warm_up()
    assert sorted(calls) == [("PII.Sensitive", "en"), ("PII.Sensitive", "pl")]


def test_classify_before_warm_up_tags_nothing() -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    outcome = engine.classify_entity(_table([{"name": "email"}]), "table", [{"email": "a@b.com"}])
    assert outcome.column_tags == []


def test_classify_entity_without_an_fqn_fails_loud() -> None:
    engine = ClassificationEngine(
        client=None, language="en", confidence=80, candidate_store=_StubStore([])
    )
    with pytest.raises(WorkflowError, match="no fullyQualifiedName"):
        engine.classify_entity({"columns": []}, "table", [])


def test_offline_fixture_content_classification_end_to_end() -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    outcome = engine.classify_entity(
        _table([{"name": "email"}, {"name": "age"}]),
        "table",
        [{"email": "alice@example.com", "age": 30}],
    )
    assert [tag.column_fqn for tag in outcome.column_tags] == ["svc.db.sc.tbl.email"]
    label = outcome.column_tags[0].tag_label
    assert label["tagFQN"] == "PII.Sensitive"
    assert label["source"] == "Classification"
    assert label["labelType"] == "Generated"
    assert label["state"] == "Suggested"
    assert label["reason"] == (
        "Detected by `EmailRecognizer` 1 time with an average score of 0.90.\n\n"
    )
    assert label["metadata"] == {
        "recognizer": {
            "recognizerId": "rec-1",
            "recognizerName": "EmailRecognizer",
            "score": 0.9,
            "target": "content",
        }
    }
    assert outcome.failures == []


def test_run_confidence_threshold_blocks_low_scores() -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=95,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    outcome = engine.classify_entity(
        _table([{"name": "email"}]),
        "table",
        [{"email": "alice@example.com"}],
    )
    assert outcome.column_tags == []


def test_sampled_fields_authoritative_skips_unmapped_columns_entirely() -> None:
    seen_texts: list[str] = []

    def factory(tag_fqn: str, configs: list[dict[str, Any]], language: str) -> TagAnalyzer:
        def analyze_fn(text: str, context_tokens: list[str]) -> list[ScoredMatch]:
            seen_texts.append(text)
            return []

        return TagAnalyzer(
            tag_fqn=tag_fqn,
            language=language,
            pairs=[(config, None) for config in configs],
            analyze_fn=analyze_fn,
        )

    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=factory,
    )
    engine.warm_up()
    engine.classify_entity(
        _table([{"name": "email"}, {"name": "phone"}]),
        "table",
        [{"email": "a@b.com"}],
    )
    assert "phone" not in seen_texts
    assert "email" in seen_texts


def test_topic_rows_none_classifies_by_name_only() -> None:
    config = _email_config(target="column_name")
    store = _StubStore([_candidate(recognizers=(config,))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    topic = {
        "fullyQualifiedName": "svc.orders",
        "messageSchema": {"schemaFields": [{"name": "email"}]},
    }
    outcome = engine.classify_entity(topic, "topic", None)
    assert [tag.column_fqn for tag in outcome.column_tags] == ["svc.orders.email"]
    assert outcome.column_tags[0].tag_label["metadata"]["recognizer"]["target"] == ("column_name")


def test_unmapped_sample_fields_warn_and_never_analyze(
    caplog: pytest.LogCaptureFixture,
) -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    with caplog.at_level(logging.WARNING):
        outcome = engine.classify_entity(
            _table([{"name": "email"}]),
            "table",
            [{"email": "a@b.com", "stray": "x@y.z"}],
        )
    assert "stray" in caplog.text
    assert [tag.column_fqn for tag in outcome.column_tags] == ["svc.db.sc.tbl.email"]


def test_per_column_exception_becomes_a_failure_without_aborting() -> None:
    def factory(tag_fqn: str, configs: list[dict[str, Any]], language: str) -> TagAnalyzer:
        def analyze_fn(text: str, context_tokens: list[str]) -> list[ScoredMatch]:
            if text == "boom":
                raise RuntimeError("recognizer exploded")
            if "@" in text:
                return [_match("EmailRecognizer", 0.9, text)]
            return []

        return TagAnalyzer(
            tag_fqn=tag_fqn,
            language=language,
            pairs=[(config, None) for config in configs],
            analyze_fn=analyze_fn,
        )

    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=factory,
    )
    engine.warm_up()
    outcome = engine.classify_entity(
        _table([{"name": "email"}, {"name": "boom"}]),
        "table",
        [{"email": "a@b.com", "boom": "x"}],
    )
    assert [tag.column_fqn for tag in outcome.column_tags] == ["svc.db.sc.tbl.email"]
    assert len(outcome.failures) == 1
    assert outcome.failures[0].column_fqn == "svc.db.sc.tbl.boom"
    assert outcome.failures[0].message == "recognizer exploded"
    assert "recognizer exploded" in outcome.failures[0].stack_trace
    assert "Traceback" in outcome.failures[0].stack_trace


def test_truncation_warns_once_per_column(caplog: pytest.LogCaptureFixture) -> None:
    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=_stub_factory([]),
    )
    engine.warm_up()
    long_value = "x" * (MAX_VALUE_CHARS + 5) + "@example.com"
    with caplog.at_level(logging.WARNING):
        engine.classify_entity(
            _table([{"name": "email"}]),
            "table",
            [{"email": long_value}],
        )
    assert "truncated to" in caplog.text


# --- Warm-up failure must not leave the engine "warmed" (S-L22) ------------


def test_warm_up_failure_during_candidate_fetch_retries_on_the_next_call() -> None:
    attempts: list[tuple[str, ...]] = []

    class _FlakyStore:
        def candidates(self, classification_filter: tuple[str, ...]) -> tuple[CandidateTag, ...]:
            attempts.append(classification_filter)
            if len(attempts) == 1:
                raise RuntimeError("catalog unavailable")
            return (_candidate(recognizers=(_email_config(),)),)

    calls: list[tuple[str, str]] = []
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=_FlakyStore(),
        analyzer_factory=_stub_factory(calls),
    )
    with pytest.raises(RuntimeError, match="catalog unavailable"):
        engine.warm_up()
    assert engine.has_candidates is False
    engine.warm_up()
    assert attempts == [PII_CLASSIFICATION_FILTER, PII_CLASSIFICATION_FILTER]
    assert engine.has_candidates is True
    assert calls == [("PII.Sensitive", "en")]
    outcome = engine.classify_entity(
        _table([{"name": "email"}]), "table", [{"email": "alice@example.com"}]
    )
    assert [tag.column_fqn for tag in outcome.column_tags] == ["svc.db.sc.tbl.email"]


def test_warm_up_failure_during_analyzer_build_retries_on_the_next_call() -> None:
    attempts = 0

    def factory(tag_fqn: str, configs: list[dict[str, Any]], language: str) -> TagAnalyzer:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("analyzer build exploded")
        return _stub_factory([])(tag_fqn, configs, language)

    store = _StubStore([_candidate(recognizers=(_email_config(),))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=factory,
    )
    with pytest.raises(RuntimeError, match="analyzer build exploded"):
        engine.warm_up()
    assert engine.has_candidates is False
    engine.warm_up()
    assert attempts == 2
    assert engine.has_candidates is True
    engine.warm_up()
    assert attempts == 2
    assert store.calls == [PII_CLASSIFICATION_FILTER, PII_CLASSIFICATION_FILTER]


# --- Content context uses the leaf name only (N-1) ---------------------------


def test_nested_column_parent_segment_cannot_boost_content_match() -> None:
    """A parent segment's context word must not boost a nested column's
    content match: the content pass sees the leaf name's tokens only."""
    seen_tokens: list[list[str] | None] = []

    def factory(tag_fqn: str, configs: list[dict[str, Any]], language: str) -> TagAnalyzer:
        def analyze_fn(text: str, context_tokens: list[str] | None) -> list[ScoredMatch]:
            seen_tokens.append(context_tokens)
            if "@" in text:
                return [_match("EmailRecognizer", 0.5, text)]
            return []

        return TagAnalyzer(
            tag_fqn=tag_fqn,
            language=language,
            pairs=[(config, None) for config in configs],
            analyze_fn=analyze_fn,
        )

    config = _email_config(
        confidenceThreshold=0.4,
        recognizerConfig={
            "type": "predefined",
            "name": "EmailRecognizer",
            "supportedLanguage": "en",
            "context": ["email"],
        },
    )
    store = _StubStore([_candidate(recognizers=(config,))])
    engine = ClassificationEngine(
        client=None,
        language="en",
        confidence=80,
        candidate_store=store,
        analyzer_factory=factory,
    )
    engine.warm_up()
    outcome = engine.classify_entity(
        _table([{"name": "email", "children": [{"name": "note"}]}]),
        "table",
        [{"email": {"note": "alice@example.com"}}],
    )
    # The content pass saw the leaf tokens only: the parent segment
    # "email" never reached context matching, so the 0.5 match was not
    # boosted to 1.0 and the run threshold (0.8) blocks the tag.
    assert seen_tokens == [["note"], None]
    assert outcome.column_tags == []
    assert outcome.failures == []
