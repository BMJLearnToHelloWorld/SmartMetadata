# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for recognizer construction (design §2.6)."""

from __future__ import annotations

import importlib.util
import logging
from typing import Any

import pytest

from smartmetadata_ingestion.classification.recognizers import (
    DEFAULT_CONTEXT_SCORE,
    DEFAULT_PATTERN_SCORE,
    EXACT_TERM_SCORE,
    build_recognizer,
    build_tag_recognizers,
    effective_recognizer_name,
    is_spacy_ner_recognizer,
    recognizer_config_language,
    recognizer_context_words,
    recognizer_excluded_for_column,
    recognizer_threshold,
)
from smartmetadata_ingestion.errors import WorkflowError

# Construction tests need the optional extra; the pure config-accessor,
# exception-list, and checksum tests run in the core suite without it.
needs_presidio = pytest.mark.skipif(
    importlib.util.find_spec("presidio_analyzer") is None,
    reason="autoclassification extra not installed",
)
needs_regex = pytest.mark.skipif(
    importlib.util.find_spec("regex") is None,
    reason="regex module not installed",
)
needs_dateutil = pytest.mark.skipif(
    importlib.util.find_spec("dateutil") is None,
    reason="python-dateutil not installed",
)


def _config(
    name: str, kind: str, *, recognizer_config: dict[str, Any] | None = None, **extra: Any
) -> dict[str, Any]:
    config: dict[str, Any] = {
        "name": name,
        "recognizerConfig": {"type": kind, **(recognizer_config or {})},
    }
    config.update(extra)
    return config


def _predefined(
    name: str, language: str = "en", context: list[str] | None = None
) -> Any:
    """Build one predefined recognizer, failing the test if skipped."""
    recognizer_config: dict[str, Any] = {"name": name}
    if context is not None:
        recognizer_config["context"] = context
    recognizer = build_recognizer(
        _config(name, "predefined", recognizer_config=recognizer_config),
        tag_fqn="PII.Sensitive",
        language=language,
    )
    assert recognizer is not None
    return recognizer


def _analyze(recognizer: Any, text: str) -> list[tuple[int, int, float]]:
    """Analyze spans as (start, end, score) triples."""
    return [
        (result.start, result.end, round(result.score, 2))
        for result in recognizer.analyze(text, entities=recognizer.supported_entities)
    ]


# --- Pure config accessors (no Presidio construction) ---------------------


def test_effective_name_predefined_uses_the_predefined_name() -> None:
    config = _config(
        "Catalog Name",
        "predefined",
        recognizer_config={"name": "EmailRecognizer"},
    )
    assert effective_recognizer_name(config) == "EmailRecognizer"


def test_effective_name_falls_back_to_the_catalog_name() -> None:
    config = _config("Catalog Name", "predefined", recognizer_config={})
    assert effective_recognizer_name(config) == "Catalog Name"
    assert effective_recognizer_name(_config("Pattern One", "pattern")) == "Pattern One"


def test_config_language_defaults_to_en() -> None:
    assert recognizer_config_language(_config("R", "pattern")) == "en"
    assert (
        recognizer_config_language(
            _config("R", "predefined", recognizer_config={"supportedLanguage": "pl"})
        )
        == "pl"
    )
    assert (
        recognizer_config_language(
            _config("R", "predefined", recognizer_config={"supportedLanguage": ""})
        )
        == "en"
    )


def test_context_words_and_threshold_accessors() -> None:
    config = _config(
        "R",
        "pattern",
        recognizer_config={"context": ["email", "mail"]},
        confidenceThreshold=0.6,
    )
    assert recognizer_context_words(config) == ["email", "mail"]
    assert recognizer_threshold(config) == 0.6
    assert recognizer_context_words(_config("R", "pattern")) == []
    assert recognizer_threshold(_config("R", "pattern")) is None
    assert recognizer_threshold(_config("R", "pattern", confidenceThreshold=None)) is None


def test_is_spacy_ner_recognizer_only_for_the_predefined_spacy_kind() -> None:
    assert is_spacy_ner_recognizer(
        _config("R", "predefined", recognizer_config={"name": "SpacyRecognizer"})
    )
    assert not is_spacy_ner_recognizer(
        _config("R", "predefined", recognizer_config={"name": "EmailRecognizer"})
    )
    assert not is_spacy_ner_recognizer(_config("R", "pattern"))


def test_exception_list_exact_table_column_link_only() -> None:
    # The pin exact-link rule (supplement §8): table-only,
    # leaf-name-only, exact set membership. The entity type is
    # ignored by construction; entity-level links never exclude.
    kwargs = {
        "entity_type": "table",
        "entity_fqn": "svc.db.sc.tbl",
    }
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.tbl::columns::email>"},
        ],
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="email", **kwargs) is True
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="other", **kwargs) is False
    )
    # Entity-level links do not exclude any column.
    config = _config(
        "R",
        "pattern",
        exceptionList=[{"entityLink": "<#E::table::svc.db.sc.tbl>"}],
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="email", **kwargs) is False
    )
    # Nested columns: the leaf name joins the table FQN, so only
    # the leaf-joined link matches — never the dotted-path link.
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.tbl.address::columns::city>"},
        ],
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="address.city", **kwargs)
        is True
    )
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.tbl::columns::address.city>"},
        ],
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="address.city", **kwargs)
        is False
    )
    # One character of difference does not match.
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.tbl::columns::emai>"},
        ],
    )
    assert (
        recognizer_excluded_for_column(config, column_dotted_path="email", **kwargs) is False
    )
    # The rule is table-only by construction: the passed entity
    # type is ignored, so a table link still matches for a topic.
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.tbl::columns::email>"},
        ],
    )
    assert (
        recognizer_excluded_for_column(
            config,
            entity_type="topic",
            entity_fqn="svc.db.sc.tbl",
            column_dotted_path="email",
        )
        is True
    )


def test_exception_list_ignores_other_entities_and_malformed_links() -> None:
    config = _config(
        "R",
        "pattern",
        exceptionList=[
            {"entityLink": "<#E::table::svc.db.sc.other::columns::email>"},
            {"entityLink": "<#E::topic::svc.db.sc.tbl::columns::email>"},
            {"entityLink": "<#E::container::svc.db.sc.tbl::columns::email>"},
            {"entityLink": "not-a-link"},
            {"entityLink": ""},
            {},
        ],
    )
    assert (
        recognizer_excluded_for_column(
            config,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_dotted_path="email",
        )
        is False
    )
    assert (
        recognizer_excluded_for_column(
            _config("R", "pattern"),
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_dotted_path="email",
        )
        is False
    )
    assert (
        recognizer_excluded_for_column(
            config,
            entity_type="table",
            entity_fqn="",
            column_dotted_path="email",
        )
        is False
    )
    assert (
        recognizer_excluded_for_column(
            config,
            entity_type="table",
            entity_fqn="svc.db.sc.tbl",
            column_dotted_path="",
        )
        is False
    )


# --- Pattern / exact-terms / context builders ------------------------------


@needs_presidio
def test_pattern_builder_carries_config_and_defaults() -> None:
    config = _config(
        "CVV",
        "pattern",
        recognizer_config={
            "patterns": [
                {"name": "cvv", "regex": r"\b\d{3}\b"},
                {"name": "cvv4", "regex": r"\b\d{4}\b", "score": 0.9},
            ],
            "context": ["cvv", "security code"],
        },
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.name == "CVV"
    assert recognizer.supported_language == "en"
    assert recognizer.supported_entities == ["PII.Sensitive"]
    assert [p.name for p in recognizer.patterns] == ["cvv", "cvv4"]
    assert recognizer.patterns[0].score == DEFAULT_PATTERN_SCORE
    assert recognizer.patterns[1].score == 0.9
    assert recognizer.context == ["cvv", "security code"]


@needs_presidio
def test_pattern_builder_score_zero_falls_back_to_the_default() -> None:
    # `or` semantics (supplement §11): an explicit 0 is falsy and
    # falls back to the default pattern score, like a missing score.
    config = _config(
        "Zero",
        "pattern",
        recognizer_config={"patterns": [{"name": "z", "regex": "x", "score": 0}]},
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.patterns[0].score == DEFAULT_PATTERN_SCORE


@needs_presidio
def test_pattern_builder_fails_fast_on_an_invalid_regex() -> None:
    config = _config(
        "Bad",
        "pattern",
        recognizer_config={"patterns": [{"name": "bad", "regex": "[unclosed"}]},
    )
    with pytest.raises(WorkflowError, match="invalid regex"):
        build_recognizer(config, tag_fqn="PII.Sensitive", language="en")


@needs_presidio
def test_exact_terms_builder_escapes_terms_at_the_exact_score() -> None:
    config = _config(
        "Terms",
        "exact_terms",
        recognizer_config={"exactTerms": ["john.doe", "a+b", "a.b"]},
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert [p.name for p in recognizer.patterns] == [
        "exact_term_john.doe",
        "exact_term_a+b",
        "exact_term_a.b",
    ]
    assert [p.regex for p in recognizer.patterns] == [r"john\.doe", r"a\+b", r"a\.b"]
    assert all(p.score == EXACT_TERM_SCORE for p in recognizer.patterns)
    assert recognizer.context is None


@needs_presidio
def test_context_builder_uses_adjacency_and_the_midpoint_score() -> None:
    config = _config(
        "Ctx",
        "context",
        recognizer_config={
            "contextWords": ["passport"],
            "minScore": 0.4,
            "maxScore": 0.8,
        },
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert len(recognizer.patterns) == 1
    assert recognizer.patterns[0].name == "context_passport"
    assert recognizer.patterns[0].score == pytest.approx(0.6)
    # Raw interpolation, inline (?i), no word boundaries.
    assert recognizer.patterns[0].regex == r"(?i)passport\s+\w+|\w+\s+passport"


@needs_presidio
def test_context_builder_midpoint_requires_truthy_bounds() -> None:
    # The midpoint applies only when BOTH bounds are truthy; a 0.0
    # bound falls back to the default context score (§11).
    config = _config(
        "Ctx",
        "context",
        recognizer_config={
            "contextWords": ["passport"],
            "minScore": 0.0,
            "maxScore": 0.8,
        },
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.patterns[0].score == DEFAULT_CONTEXT_SCORE


@needs_presidio
def test_context_builder_interpolates_words_raw() -> None:
    # The word is interpolated unescaped: regex metacharacters in
    # the word stay live in the pattern (§11).
    config = _config(
        "Ctx",
        "context",
        recognizer_config={"contextWords": ["a+b"]},
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.patterns[0].regex == r"(?i)a+b\s+\w+|\w+\s+a+b"


@needs_presidio
def test_context_builder_defaults_to_the_context_score_without_bounds() -> None:
    config = _config("Ctx", "context", recognizer_config={"contextWords": ["passport"]})
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.patterns[0].score == DEFAULT_CONTEXT_SCORE


@needs_regex
def test_regex_flags_default_all_true_and_honor_overrides() -> None:
    import regex

    from smartmetadata_ingestion.classification.recognizers import _regex_flags

    assert _regex_flags(None) == regex.I | regex.S | regex.M
    assert _regex_flags({}) == regex.I | regex.S | regex.M
    assert _regex_flags({"ignoreCase": False}) == regex.S | regex.M
    assert _regex_flags({"ignoreCase": False, "dotAll": False, "multiline": False}) == 0


# --- Custom / unknown / disabled -------------------------------------------


def test_custom_recognizers_never_execute(
    caplog: pytest.LogCaptureFixture,
) -> None:
    config = _config("Custom One", "custom")
    with caplog.at_level(logging.WARNING):
        assert build_recognizer(config, tag_fqn="PII.Sensitive", language="en") is None
    assert "never executed" in caplog.text


def test_unknown_kind_skips_with_an_error_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    config = _config("Mystery", "bogus")
    with caplog.at_level(logging.ERROR):
        assert build_recognizer(config, tag_fqn="PII.Sensitive", language="en") is None
    assert "unknown recognizerConfig type" in caplog.text


@needs_presidio
def test_tag_builder_skips_disabled_and_custom_configs() -> None:
    configs = [
        _config("Off", "pattern", enabled=False),
        _config("Custom", "custom"),
        _config(
            "On",
            "pattern",
            recognizer_config={"patterns": [{"name": "p", "regex": "x"}]},
        ),
    ]
    built = build_tag_recognizers(configs, tag_fqn="PII.Sensitive", language="en")
    assert [config["name"] for config, _ in built] == ["On"]


# --- Predefined -------------------------------------------------------------


@needs_presidio
def test_predefined_uses_the_class_default_entity_for_pattern_classes() -> None:
    config = _config(
        "Email Catalog",
        "predefined",
        recognizer_config={
            "name": "EmailRecognizer",
            "supportedEntities": ["CREDIT_CARD"],
        },
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.name == "EmailRecognizer"
    assert recognizer.supported_entities == ["EMAIL_ADDRESS"]


@needs_presidio
def test_predefined_passes_entities_to_ner_constructors() -> None:
    config = _config(
        "Spacy Catalog",
        "predefined",
        recognizer_config={
            "name": "SpacyRecognizer",
            "supportedEntities": ["PERSON"],
        },
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.name == "SpacyRecognizer"
    assert recognizer.supported_entities == ["PERSON"]


@needs_presidio
def test_predefined_context_passes_through_or_falls_back_to_the_default() -> None:
    config = _config(
        "Email Catalog",
        "predefined",
        recognizer_config={"name": "EmailRecognizer", "context": ["mailbox"]},
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.context == ["mailbox"]
    config = _config(
        "Email Catalog",
        "predefined",
        recognizer_config={"name": "EmailRecognizer"},
    )
    recognizer = build_recognizer(config, tag_fqn="PII.Sensitive", language="en")
    assert recognizer is not None
    assert recognizer.context == ["email"]


@needs_presidio
def test_predefined_unknown_name_skips(
    caplog: pytest.LogCaptureFixture,
) -> None:
    config = _config(
        "Nope",
        "predefined",
        recognizer_config={"name": "NoSuchRecognizer"},
    )
    with caplog.at_level(logging.ERROR):
        assert build_recognizer(config, tag_fqn="PII.Sensitive", language="en") is None
    assert "unknown predefined recognizer" in caplog.text


@needs_presidio
def test_azure_backend_always_skips(caplog: pytest.LogCaptureFixture) -> None:
    config = _config(
        "Azure",
        "predefined",
        recognizer_config={"name": "AzureAILanguageRecognizer"},
    )
    with caplog.at_level(logging.WARNING):
        assert build_recognizer(config, tag_fqn="PII.Sensitive", language="en") is None
    assert "Azure AI Language" in caplog.text


@needs_presidio
def test_absent_ner_backends_skip(caplog: pytest.LogCaptureFixture) -> None:
    for backend in ("StanzaRecognizer", "TransformersRecognizer", "GLiNERRecognizer"):
        import importlib.util

        module = {
            "StanzaRecognizer": "stanza",
            "TransformersRecognizer": "transformers",
            "GLiNERRecognizer": "gliner",
        }[backend]
        if importlib.util.find_spec(module) is not None:
            pytest.skip(f"{module} is installed; the skip path is untestable here")
        config = _config(backend, "predefined", recognizer_config={"name": backend})
        with caplog.at_level(logging.WARNING):
            assert build_recognizer(config, tag_fqn="PII.Sensitive", language="en") is None
        assert backend in caplog.text


# --- Hardened variants -------------------------------------------------------


@needs_presidio
def test_hardened_credit_card_analyze_level_shapes_and_luhn() -> None:
    recognizer = _predefined("CreditCardRecognizer")
    # Brand shapes, bare and grouped, boost to 1.0 on a valid Luhn check.
    assert _analyze(recognizer, "4111111111111111") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "4111 1111 1111 1111") == [(0, 19, 1.0)]
    assert _analyze(recognizer, "4111-1111-1111-1111") == [(0, 19, 1.0)]
    assert _analyze(recognizer, "5500005555555559") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "2223000048410010") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "378282246310005") == [(0, 15, 1.0)]
    assert _analyze(recognizer, "30569309025904") == [(0, 14, 1.0)]
    assert _analyze(recognizer, "6011111111111117") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "3530111333300000") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "6759649826438453") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "6222021234567894") == [(0, 16, 1.0)]
    # A 19-digit card in five same-separator groups.
    assert _analyze(recognizer, "4111 1111 1111 1111 110") == [(0, 23, 1.0)]
    # A failing Luhn check drops the match entirely.
    assert _analyze(recognizer, "4111111111111112") == []
    assert _analyze(recognizer, "378282246310006") == []
    # Mixed separators match no shape.
    assert _analyze(recognizer, "4111 1111-1111 1111") == []
    # Embedding guards: letters or dot-digits adjacent to the run.
    assert _analyze(recognizer, "x4111111111111111") == []
    assert _analyze(recognizer, "4111111111111111x") == []
    assert _analyze(recognizer, "4111111111111111.5") == []
    # Date-prefix recovery: a valid leading date is stripped, and
    # the remainder is reported with its original span.
    assert _analyze(recognizer, "2026-03-14 4111111111111111") == [(11, 27, 1.0)]
    assert _analyze(recognizer, "2026-13-45 4111111111111111") == []
    # Quantity-prefix recovery: a leading count after a qty label.
    assert _analyze(recognizer, "qty 2 4111111111111111") == [(6, 22, 1.0)]
    assert _analyze(recognizer, "quantity 3 4111111111111111") == [(11, 27, 1.0)]
    # A phone-prefixed run is skipped wholesale.
    assert _analyze(recognizer, "call +1 4111111111111111") == []
    # Per-part recovery: two cards in one candidate both report.
    assert _analyze(recognizer, "4111111111111111 5500005555555559") == [
        (0, 16, 1.0),
        (17, 33, 1.0),
    ]
    # A trailing year is stripped and the card reports.
    assert _analyze(recognizer, "4111111111111111 2026") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "378282246310005 2026") == [(0, 15, 1.0)]


@needs_presidio
def test_hardened_url_analyze_level_trim_and_hostname() -> None:
    recognizer = _predefined("UrlRecognizer")
    # Trailing punctuation is trimmed; the span covers the URL only.
    assert _analyze(recognizer, "Visit https://example.com/path?x=1.") == [(6, 34, 0.6)]
    assert _analyze(recognizer, "www.example.com, next") == [(0, 15, 0.5)]
    # Quotes are excluded from the span.
    assert _analyze(recognizer, '"https://example.com"') == [(1, 20, 0.6)]
    # Balanced parentheses are kept; an unclosed paren drops the seed.
    assert _analyze(recognizer, "see (https://example.com/a_(b)) end") == [(5, 30, 0.6)]
    assert _analyze(recognizer, "https://example.com/a(b") == []
    # A seed stopped by a boundary char keeps its trailing dot.
    assert _analyze(recognizer, "<https://example.com/a.>") == [(1, 23, 0.6)]
    # The hostname must match the URL host rule: emails, bare IPs,
    # bad TLDs, and out-of-range ports are dropped.
    assert _analyze(recognizer, "user@example.com") == []
    assert _analyze(recognizer, "http://192.168.1.1/") == []
    assert _analyze(recognizer, "https://example.invalidtld/x") == []
    assert _analyze(recognizer, "https://example.com:99999/x") == []
    assert _analyze(recognizer, "https://example.com:8080/x") == [(0, 26, 0.6)]
    assert _analyze(recognizer, "example.com/path?q=1, next") == [(0, 20, 0.5)]


@needs_presidio
def test_hardened_ip_analyze_level_tokens() -> None:
    recognizer = _predefined("IpRecognizer")
    assert _analyze(recognizer, "1.2.3.4") == [(0, 7, 0.6)]
    # The bare scope pattern is kept at 0.1.
    assert _analyze(recognizer, "::") == [(0, 2, 0.1)]
    # Labels and ports are excluded from the reported span.
    assert _analyze(recognizer, "host:1.2.3.4") == [(5, 12, 0.6)]
    assert _analyze(recognizer, "1.2.3.4:8080") == [(0, 7, 0.6)]
    assert _analyze(recognizer, "1.2.3.4.") == [(0, 7, 0.6)]
    # Out-of-range ports and bad port text drop the token.
    assert _analyze(recognizer, "1.2.3.4:99999") == []
    assert _analyze(recognizer, "1.2.3.4:abc") == []
    # CIDR suffixes: a valid prefix keeps the address; an invalid
    # one drops it; a port-shortened CIDR drops it too.
    assert _analyze(recognizer, "1.2.3.4/24") == [(0, 7, 0.6)]
    assert _analyze(recognizer, "1.2.3.4/33") == []
    assert _analyze(recognizer, "1.2.3.4:80/24") == []
    # Digits followed by a word character are not a CIDR suffix.
    assert _analyze(recognizer, "1.2.3.4/24a") == [(0, 7, 0.6)]
    # The URI exception: an address inside a URI keeps its CIDR.
    assert _analyze(recognizer, "http://1.2.3.4/24") == [(7, 14, 0.6)]
    # IPv6, zones, and embedded IPv4.
    assert _analyze(recognizer, "2001:db8::1") == [(0, 11, 0.6)]
    assert _analyze(recognizer, "fe80::1") == [(0, 7, 0.6)]
    assert _analyze(recognizer, "fe80::1%eth0") == [(0, 12, 0.6)]
    assert _analyze(recognizer, "::ffff:1.2.3.4") == [(0, 14, 0.6)]
    assert _analyze(recognizer, "999.1.1.1") == []


@needs_presidio
def test_hardened_nhs_stock_checksum_and_replace_only_context() -> None:
    recognizer = _predefined(
        "NhsRecognizer", context=["nhs", "national_health_service", "nhs_number"]
    )
    # The stock checksum stands: no reimplementation, no override.
    assert recognizer.validate_result("9999999999") is True
    assert recognizer.validate_result("999 999 9999") is True
    assert recognizer.validate_result("9999999998") is False
    assert _analyze(recognizer, "999 999 9999") == [(0, 12, 1.0)]
    # Replace-only: the configured context is exactly the seed
    # list — no stock words are merged in.
    assert recognizer.context == ["nhs", "national_health_service", "nhs_number"]


@needs_presidio
def test_hardened_nhs_timestamp_suppression_is_flag_neutral() -> None:
    from presidio_analyzer import RecognizerResult

    recognizer = _predefined("NhsRecognizer", context=["nhs"])
    flag_key = RecognizerResult.IS_SCORE_ENHANCED_BY_CONTEXT_KEY

    def _result(score: float, flagged: bool) -> RecognizerResult:
        metadata = {flag_key: True} if flagged else {}
        return RecognizerResult("UK_NHS", 0, 12, score, None, metadata)

    # A timestamp token anywhere in the context suppresses all.
    result = _result(1.0, flagged=False)
    assert (
        recognizer.enhance_using_context(
            "9999999999", [result], [], None, context=["created", "at"]
        )
        == []
    )
    # Suppression applies regardless of any flag the result carries.
    flagged = _result(1.0, flagged=True)
    assert (
        recognizer.enhance_using_context(
            "9999999999", [flagged], [], None, context=["updated"]
        )
        == []
    )
    # Otherwise results pass through UNCHANGED: the override neither
    # reads nor writes the flag (§19), so a flagged result keeps its
    # flag and score, and an unflagged one gains no flag.
    flagged = _result(0.5, flagged=True)
    out = recognizer.enhance_using_context(
        "9999999999", [flagged], [], None, context=["patient"]
    )
    assert out[0] is flagged
    assert out[0].score == 0.5
    assert out[0].recognition_metadata[flag_key] is True
    plain = _result(0.5, flagged=False)
    out = recognizer.enhance_using_context("9999999999", [plain], [], None, context=None)
    assert out[0] is plain
    assert flag_key not in out[0].recognition_metadata
    # Near-miss words do not suppress.
    assert (
        recognizer.enhance_using_context(
            "9999999999", [plain], [], None, context=["updates"]
        )
        == [plain]
    )


@needs_presidio
def test_hardened_date_boosts_parseable_and_never_rejects() -> None:
    recognizer = _predefined("DateRecognizer")
    # Parseable spans boost to 1.0; anything else keeps the pattern
    # score (None); the validator NEVER returns False.
    assert recognizer.validate_result("2018-03-14") is True
    assert recognizer.validate_result("March 14") is True
    assert recognizer.validate_result("1999") is True
    assert recognizer.validate_result("March") is True
    assert recognizer.validate_result("hello") is None
    assert recognizer.validate_result("2026-13-45") is None
    for text in ("2018-03-14", "March 14", "1999", "March", "hello", "2026-13-45"):
        assert recognizer.validate_result(text) is not False
    assert _analyze(recognizer, "2018-03-14") == [(0, 10, 1.0)]


@needs_presidio
@needs_dateutil
def test_hardened_date_validator_dateutil_edges() -> None:
    # Observed dateutil 2.9.0.post0 behavior: a plain parse accepts all
    # of these, so the validator boosts each to 1.0 — including "19.99",
    # whose outcome the stdlib emulation left deliberately unasserted.
    recognizer = _predefined("DateRecognizer")
    assert recognizer.validate_result("19.99") is True
    assert recognizer.validate_result("March 32") is True
    assert recognizer.validate_result("12.31") is True
    assert recognizer.validate_result("3.14") is True
    assert recognizer.validate_result("20180314") is True


@needs_presidio
def test_hardened_date_validator_fallback_warns_once(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    # With python-dateutil unavailable the validator falls back to the
    # stdlib check and warns loudly, once per process. Only the
    # validator binding is simulated absent here; the asserted outcomes
    # hold under both date-spelling implementations.
    monkeypatch.setattr(
        "smartmetadata_ingestion.classification.recognizers._dateutil_parse",
        None,
    )
    monkeypatch.setattr(
        "smartmetadata_ingestion.classification.recognizers._DATEUTIL_FALLBACK_WARNED",
        False,
    )
    recognizer = _predefined("DateRecognizer")
    with caplog.at_level(
        logging.WARNING,
        logger="smartmetadata_ingestion.classification.recognizers",
    ):
        assert recognizer.validate_result("19.99") is None
        assert recognizer.validate_result("March 32") is True
        assert recognizer.validate_result("2018-03-14") is True
    assert caplog.text.count("python-dateutil is not installed") == 1


@needs_presidio
def test_hardened_iban_matches_lowercase_at_analyze_level() -> None:
    recognizer = _predefined("IbanRecognizer")
    # IGNORECASE at match time: the lowercase IBAN matches and is
    # kept at the 0.5 pattern score; the uppercase one boosts.
    assert _analyze(recognizer, "GB29NWBK60161331926819") == [(0, 22, 1.0)]
    assert _analyze(recognizer, "gb29nwbk60161331926819") == [(0, 22, 0.5)]
    assert _analyze(recognizer, "GB29NWBK60161331926818") == []


@needs_presidio
def test_hardened_nif_ascii_guard_and_uppercase_semantics() -> None:
    recognizer = _predefined("EsNifRecognizer", language="es")
    assert recognizer.validate_result("12345678Z") is True
    assert recognizer.validate_result("12345678z") is None
    assert recognizer.validate_result("12345678A") is False
    # The ASCII guard runs BEFORE uppercasing: long s uppercases to
    # S, which would validate — the guard must reject it anyway.
    assert "12345679ſ".upper() == "12345679S"
    assert recognizer.validate_result("12345679S") is True
    assert recognizer.validate_result("12345679ſ") is False
    assert _analyze(recognizer, "12345678Z") == [(0, 9, 1.0)]
    assert _analyze(recognizer, "12345678z") == [(0, 9, 0.5)]


@needs_presidio
def test_hardened_us_license_whole_line_shapes_only() -> None:
    recognizer = _predefined("UsLicenseRecognizer")
    assert _analyze(recognizer, "A123456") == [(0, 7, 0.3)]
    assert _analyze(recognizer, "a123456") == [(0, 7, 0.3)]
    # A shape embedded in a longer line does not match.
    assert _analyze(recognizer, "xx A123456 yy") == []
    # A shape alone on its line inside a multi-line value matches.
    assert _analyze(recognizer, "foo\nA123456\nbar") == [(4, 11, 0.3)]
    # The SSN-shaped dashed form scores 0.05.
    assert _analyze(recognizer, "123-45-6789") == [(0, 11, 0.05)]
    # A bare 14-digit run matches no shape.
    assert _analyze(recognizer, "12345678901234") == []
    # Month-encoded shapes: day 15 matches, day 25 is excluded.
    assert _analyze(recognizer, "03123456741151234567890") == [(0, 23, 0.3)]
    assert _analyze(recognizer, "03123456741251234567890") == []


@needs_presidio
def test_hardened_au_tfn_patterns_and_labeled_raise() -> None:
    recognizer = _predefined("AuTfnRecognizer")
    assert _analyze(recognizer, "123 456 782") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "123-456-782") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "123456782") == [(0, 9, 1.0)]
    assert _analyze(recognizer, "123 456 781") == []
    # A TFN:-labeled match raises inside the stock validator: the
    # label letters reach the integer conversion. That raise IS the
    # specified behavior (probe §18f) — the validator is deliberately
    # not fixed, and the run surfaces it as a per-column failure.
    with pytest.raises(ValueError, match="invalid literal for int"):
        recognizer.analyze("TFN: 123 456 782", entities=recognizer.supported_entities)
    with pytest.raises(ValueError, match="invalid literal for int"):
        recognizer.analyze("TFN:123456782", entities=recognizer.supported_entities)


@needs_presidio
def test_hardened_in_aadhaar_grouped_forms_and_digit_guards() -> None:
    recognizer = _predefined("InAadhaarRecognizer")
    assert _analyze(recognizer, "234567890124") == [(0, 12, 1.0)]
    assert _analyze(recognizer, "2345 6789 0124") == [(0, 14, 1.0)]
    assert _analyze(recognizer, "2345-6789-0124") == [(0, 14, 1.0)]
    assert _analyze(recognizer, "2345 6789-0124") == [(0, 14, 1.0)]
    # A 12-digit run embedded in a longer digit run cannot match.
    assert _analyze(recognizer, "12345678901234") == []


@needs_presidio
def test_hardened_es_nie_case_insensitive_validation() -> None:
    recognizer = _predefined("EsNieRecognizer", language="es")
    assert _analyze(recognizer, "X1234567L") == [(0, 9, 1.0)]
    assert _analyze(recognizer, "x1234567l") == [(0, 9, 0.5)]
    # The ASCII guard runs BEFORE uppercasing (long s → S).
    assert "X1234586ſ".upper() == "X1234586S"
    assert recognizer.validate_result("X1234586S") is True
    assert recognizer.validate_result("X1234586ſ") is False


@needs_presidio
def test_hardened_sg_uen_formats_and_case() -> None:
    recognizer = _predefined("SgUenRecognizer")
    assert _analyze(recognizer, "12345678M") == [(0, 9, 1.0)]
    assert _analyze(recognizer, "12345678m") == [(0, 9, 0.3)]
    assert _analyze(recognizer, "T12LP0000F") == [(0, 10, 1.0)]
    assert _analyze(recognizer, "T12LP1234L") == [(0, 10, 1.0)]
    assert _analyze(recognizer, "t12lp0000f") == [(0, 10, 0.3)]
    assert _analyze(recognizer, "202012345H") == [(0, 10, 1.0)]
    assert _analyze(recognizer, "202012345h") == [(0, 10, 0.3)]
    # A future-year Format B registration is rejected.
    assert _analyze(recognizer, "299912345A") == []


@needs_presidio
def test_hardened_au_abn_hyphenated_keeps_pattern_score() -> None:
    recognizer = _predefined("AuAbnRecognizer")
    assert _analyze(recognizer, "51-824-753-556") == [(0, 14, 0.3)]
    assert _analyze(recognizer, "51 824 753 556") == [(0, 14, 1.0)]
    assert _analyze(recognizer, "51-824-753-555") == []
    # The hyphenated pattern is guarded against embedding and
    # against digit-adjacent prose.
    assert _analyze(recognizer, "x51-824-753-556") == []
    assert _analyze(recognizer, "1 51-824-753-556") == []
    assert _analyze(recognizer, "51-824-753-556 2") == []
    assert _analyze(recognizer, "51-824-753-556 - more") == [(0, 14, 0.3)]


@needs_presidio
def test_hardened_au_acn_check_digit_zero() -> None:
    from presidio_analyzer.predefined_recognizers import (
        AuAcnRecognizer as StockAuAcnRecognizer,
    )

    recognizer = _predefined("AuAcnRecognizer")
    # The corrected check digit accepts a 0 check digit, which the
    # stock rule can never accept.
    assert StockAuAcnRecognizer().validate_result("123456780") is False
    assert recognizer.validate_result("123456780") is True
    assert _analyze(recognizer, "123-456-780") == [(0, 11, 0.3)]
    assert _analyze(recognizer, "004 085 616") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "004085616") == [(0, 9, 1.0)]
    assert _analyze(recognizer, "123456781") == []


@needs_presidio
def test_hardened_it_vat_prefixed_forms() -> None:
    recognizer = _predefined("ItVatCodeRecognizer", language="it")
    assert _analyze(recognizer, "IT07643520567") == [(0, 13, 1.0)]
    assert _analyze(recognizer, "it07643520567") == [(0, 13, 1.0)]
    assert _analyze(recognizer, "07643520567") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "00000000000") == []
    assert _analyze(recognizer, "12345678901") == []
    # Non-ASCII text is rejected before delegation.
    assert recognizer.validate_result("07643520567é") is False


@needs_presidio
def test_hardened_sg_fin_checksum_never_boosts() -> None:
    recognizer = _predefined("SgFinRecognizer")
    # Valid FINs keep the 0.5 pattern score — success is always
    # no-decision, never a boost.
    assert _analyze(recognizer, "S2740116C") == [(0, 9, 0.5)]
    assert _analyze(recognizer, "T2740116Z") == [(0, 9, 0.5)]
    assert _analyze(recognizer, "F1234567N") == [(0, 9, 0.5)]
    assert _analyze(recognizer, "G1234567X") == [(0, 9, 0.5)]
    assert _analyze(recognizer, "s2740116c") == [(0, 9, 0.5)]
    # The M prefix uses its own check table.
    assert _analyze(recognizer, "M7654321J") == [(0, 9, 0.5)]
    assert _analyze(recognizer, "M1234567K") == [(0, 9, 0.5)]
    # Checksum failures and weak-prefix shapes drop out.
    assert _analyze(recognizer, "S2740116D") == []
    assert _analyze(recognizer, "A1234567B") == []


@needs_presidio
def test_hardened_us_bank_no_floor_boost_and_flag() -> None:
    from presidio_analyzer import RecognizerResult

    seed_context = ["account", "acct", "bank", "debit", "bank_account", "account_number"]
    recognizer = _predefined("UsBankRecognizer", context=seed_context)
    flag_key = RecognizerResult.IS_SCORE_ENHANCED_BY_CONTEXT_KEY
    # The seed context REPLACES the class default (replace-only).
    assert recognizer.context == seed_context
    # The stock pattern scores 0.05 — below the decorator's 0.3
    # floor — so the no-floor distinction is observable.
    assert [p.score for p in recognizer.patterns] == [0.05]
    assert _analyze(recognizer, "12345678") == [(0, 8, 0.05)]

    def _result(score: float) -> RecognizerResult:
        return RecognizerResult("US_BANK_NUMBER", 0, 8, score, None, {})

    # With a matching context the 0.05 result boosts to 1.0 and
    # carries the flag (§19: the flag's second writer).
    result = _result(0.05)
    out = recognizer.enhance_using_context(
        "12345678", [result], [], None, context=["account", "number"]
    )
    assert out[0].score == 1.0
    assert out[0].recognition_metadata[flag_key] is True
    # Already-flagged results are skipped.
    flagged = RecognizerResult("US_BANK_NUMBER", 0, 8, 0.5, None, {flag_key: True})
    out = recognizer.enhance_using_context(
        "12345678", [flagged], [], None, context=["bank"]
    )
    assert out[0].score == 0.5
    # No context, or no match, passes through unchanged.
    plain = _result(0.05)
    assert (
        recognizer.enhance_using_context("12345678", [plain], [], None, context=None)
        == [plain]
    )
    assert (
        recognizer.enhance_using_context("12345678", [plain], [], None, context=["other"])
        == [plain]
    )
    assert plain.score == 0.05
    assert flag_key not in plain.recognition_metadata


@needs_presidio
def test_hardened_us_bank_context_match_follows_the_single_word_rule() -> None:
    from presidio_analyzer import RecognizerResult

    flag_key = RecognizerResult.IS_SCORE_ENHANCED_BY_CONTEXT_KEY

    def _boosted(instance_context: list[str], passed: list[str]) -> bool:
        recognizer = _predefined("UsBankRecognizer", context=instance_context)
        result = RecognizerResult("US_BANK_NUMBER", 0, 8, 0.05, None, {})
        out = recognizer.enhance_using_context(
            "12345678", [result], [], None, context=passed
        )
        return out[0].recognition_metadata.get(flag_key) is True

    # Underscore words never match split tokens.
    assert _boosted(["bank_account"], ["bank", "account"]) is False
    # A space-joined phrase matches.
    assert _boosted(["bank account"], ["bank", "account"]) is True
    # CamelCase words are never split: they match only whole tokens.
    assert _boosted(["bankAccount"], ["bank", "account"]) is False
    assert _boosted(["bankAccount"], ["bankaccount"]) is True


@needs_presidio
def test_hardened_pl_pesel_corrected_checksum_and_guards() -> None:
    from presidio_analyzer.predefined_recognizers import (
        PlPeselRecognizer as StockPlPeselRecognizer,
    )

    recognizer = _predefined("PlPeselRecognizer", language="pl")
    # A valid PESEL the stock rule rejects.
    assert StockPlPeselRecognizer().validate_result("44051401359") is False
    assert recognizer.validate_result("44051401359") is True
    assert _analyze(recognizer, "44051401359") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "44051401358") == []
    # Digit guards: no embedding in a longer digit run.
    assert _analyze(recognizer, "1440514013591") == []


@needs_presidio
def test_hardened_it_fiscal_code_invalid_dropped() -> None:
    from presidio_analyzer.predefined_recognizers import (
        ItFiscalCodeRecognizer as StockItFiscalCodeRecognizer,
    )

    recognizer = _predefined("ItFiscalCodeRecognizer", language="it")
    # The stock validator returns no-decision on a checksum
    # mismatch; the hardened map turns that into a rejection.
    assert StockItFiscalCodeRecognizer().validate_result("RSSMRA80A01H501X") is None
    assert recognizer.validate_result("RSSMRA80A01H501X") is False
    assert _analyze(recognizer, "RSSMRA80A01H501U") == [(0, 16, 1.0)]
    assert _analyze(recognizer, "RSSMRA80A01H501X") == []


@needs_presidio
def test_hardened_fi_personal_identity_code_century_dates() -> None:
    from presidio_analyzer.predefined_recognizers import (
        FiPersonalIdentityCodeRecognizer as StockFiRecognizer,
    )

    recognizer = _predefined("FiPersonalIdentityCodeRecognizer", language="fi")
    # 29 February 1900 is not a real date; the stock check accepts
    # it and the hardened check rejects it.
    assert StockFiRecognizer().validate_result("290200-1239") is True
    assert recognizer.validate_result("290200-1239") is False
    assert _analyze(recognizer, "290200-1239") == []
    # 29 February 2000 is real.
    assert _analyze(recognizer, "290200A1239") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "131052-308T") == [(0, 11, 1.0)]
    assert _analyze(recognizer, "010100U001F") == [(0, 11, 1.0)]
    # A wrong check character drops the match.
    assert _analyze(recognizer, "131052-308X") == []
    # Length edges keep the pattern score; bad separators reject.
    assert recognizer.validate_result("short") is None
    assert recognizer.validate_result("131052Z308T") is False
