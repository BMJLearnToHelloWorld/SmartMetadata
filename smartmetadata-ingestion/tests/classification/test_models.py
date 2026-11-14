# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for classification model selection/provisioning."""

from __future__ import annotations

import sys

import pytest

from smartmetadata_ingestion.classification.models import (
    CLASSIFICATION_LANGUAGES,
    FALLBACK_MODEL_NAME,
    LANGUAGE_MODEL_NAMES,
    SPACY_MODEL_VERSION,
    InstallOutcome,
    get_nlp_engine,
    install_models,
    model_name_for_language,
    model_wheel_url,
    provisioning_plan,
    require_models_installed,
)
from smartmetadata_ingestion.errors import WorkflowError, WorkflowExecutionError


def test_mapping_covers_the_schema_languages_with_medium_models() -> None:
    assert len(LANGUAGE_MODEL_NAMES) == 24
    assert LANGUAGE_MODEL_NAMES["en"] == "en_core_web_md"
    assert LANGUAGE_MODEL_NAMES["es"] == "es_core_news_md"
    assert LANGUAGE_MODEL_NAMES["zh"] == "zh_core_web_md"
    assert LANGUAGE_MODEL_NAMES["ja"] == "ja_core_news_md"
    assert "nb" not in LANGUAGE_MODEL_NAMES
    assert "xx" not in LANGUAGE_MODEL_NAMES


def test_no_maps_to_the_bokmal_model_but_nb_is_not_a_language() -> None:
    assert LANGUAGE_MODEL_NAMES["no"] == "nb_core_news_md"
    assert model_name_for_language("no") == "nb_core_news_md"
    assert "nb" not in CLASSIFICATION_LANGUAGES
    assert model_name_for_language("nb") == FALLBACK_MODEL_NAME


def test_run_resolution_any_means_english_unknown_means_fallback() -> None:
    assert model_name_for_language("any") == "en_core_web_md"
    assert model_name_for_language("sw") == FALLBACK_MODEL_NAME
    assert model_name_for_language("xx") == FALLBACK_MODEL_NAME
    assert model_name_for_language("bogus") == FALLBACK_MODEL_NAME


def test_classification_languages_match_the_schema_enum() -> None:
    assert len(CLASSIFICATION_LANGUAGES) == 82
    assert "any" in CLASSIFICATION_LANGUAGES
    assert "en" in CLASSIFICATION_LANGUAGES
    assert "no" in CLASSIFICATION_LANGUAGES
    assert "sw" in CLASSIFICATION_LANGUAGES
    assert "zu" in CLASSIFICATION_LANGUAGES
    assert "nb" not in CLASSIFICATION_LANGUAGES
    assert "xx" not in CLASSIFICATION_LANGUAGES


def test_wheel_url_follows_the_release_layout() -> None:
    assert model_wheel_url("en_core_web_md") == (
        "https://github.com/explosion/spacy-models/releases/download/"
        "en_core_web_md-3.8.0/en_core_web_md-3.8.0-py3-none-any.whl"
    )
    assert model_wheel_url("es_core_news_md", version="3.7.0").endswith(
        "es_core_news_md-3.7.0-py3-none-any.whl"
    )
    assert SPACY_MODEL_VERSION == "3.8.0"


def test_provisioning_plan_dedupes_shared_models() -> None:
    plan = provisioning_plan(["en", "any", "no"])
    assert [model for _, model, _ in plan] == ["en_core_web_md", "nb_core_news_md"]
    assert plan[0][0] == "en"
    plan = provisioning_plan(["any", "en"])
    assert [model for _, model, _ in plan] == ["en_core_web_md"]
    assert plan[0][0] == "any"
    plan = provisioning_plan(["sw", "af"])
    assert [model for _, model, _ in plan] == [FALLBACK_MODEL_NAME]
    assert plan[0][0] == "sw"


def test_provisioning_plan_accepts_any_as_the_english_model() -> None:
    plan = provisioning_plan(["any"])
    assert plan == [("any", "en_core_web_md", model_wheel_url("en_core_web_md"))]


def test_provisioning_plan_accepts_unmapped_languages_as_the_fallback() -> None:
    plan = provisioning_plan(["sw"])
    assert plan == [("sw", FALLBACK_MODEL_NAME, model_wheel_url(FALLBACK_MODEL_NAME))]


def test_provisioning_plan_rejects_non_enum_identifiers() -> None:
    with pytest.raises(WorkflowError) as excinfo:
        provisioning_plan(["nb"])
    message = str(excinfo.value)
    assert "unknown classification language 'nb'" in message
    assert "'no'" in message
    with pytest.raises(WorkflowError, match="unknown classification language 'xx'"):
        provisioning_plan(["xx"])
    with pytest.raises(WorkflowError, match="unknown classification language 'bogus'"):
        provisioning_plan(["bogus"])
    with pytest.raises(WorkflowError, match="unknown classification language 'bogus'"):
        provisioning_plan(["en", "bogus"])
    with pytest.raises(WorkflowError, match="unknown classification language ''"):
        provisioning_plan(["en", ""])


def test_install_models_dry_run_calls_no_runner(capsys: pytest.CaptureFixture[str]) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("dry run must not invoke the runner")

    outcome = install_models(
        ["en", "es"], dry_run=True, runner=_boom, is_installed=lambda model: False
    )
    assert outcome == InstallOutcome(
        installed=["en_core_web_md", "es_core_news_md"], already_available=[]
    )
    captured = capsys.readouterr().out
    assert "would install en_core_web_md" in captured
    assert "would install es_core_news_md" in captured


def test_install_models_dry_run_reports_already_available_models(
    capsys: pytest.CaptureFixture[str],
) -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("dry run must not invoke the runner")

    outcome = install_models(
        ["en", "es"],
        dry_run=True,
        runner=_boom,
        is_installed=lambda model: model == "en_core_web_md",
    )
    assert outcome == InstallOutcome(
        installed=["es_core_news_md"], already_available=["en_core_web_md"]
    )
    captured = capsys.readouterr().out
    assert "en_core_web_md is already available" in captured
    assert "would install es_core_news_md" in captured


class _FakeResult:
    def __init__(self, returncode: int, stderr: str = "") -> None:
        self.returncode = returncode
        self.stderr = stderr


def test_install_models_invokes_pip_with_the_wheel_url() -> None:
    calls: list[list[str]] = []

    def _runner(cmd: list[str], **kwargs: object) -> _FakeResult:
        calls.append(cmd)
        return _FakeResult(0)

    outcome = install_models(["en"], runner=_runner, is_installed=lambda model: False)
    assert outcome == InstallOutcome(installed=["en_core_web_md"], already_available=[])
    assert calls == [
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-cache-dir",
            model_wheel_url("en_core_web_md"),
        ]
    ]


def test_install_models_skips_already_available_models_without_pip() -> None:
    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("an available model must not invoke pip")

    outcome = install_models(["en"], runner=_boom, is_installed=lambda model: True)
    assert outcome == InstallOutcome(installed=[], already_available=["en_core_web_md"])


def test_install_models_mixes_installed_and_already_available() -> None:
    calls: list[list[str]] = []

    def _runner(cmd: list[str], **kwargs: object) -> _FakeResult:
        calls.append(cmd)
        return _FakeResult(0)

    outcome = install_models(
        ["en", "es"],
        runner=_runner,
        is_installed=lambda model: model == "en_core_web_md",
    )
    assert outcome == InstallOutcome(
        installed=["es_core_news_md"], already_available=["en_core_web_md"]
    )
    assert len(calls) == 1
    assert calls[0][-1] == model_wheel_url("es_core_news_md")


def test_install_models_failure_is_loud_and_names_the_manual_fix() -> None:
    def _failing_runner(cmd: list[str], **kwargs: object) -> _FakeResult:
        return _FakeResult(1, "network unreachable")

    with pytest.raises(WorkflowError) as excinfo:
        install_models(["en"], runner=_failing_runner, is_installed=lambda model: False)
    message = str(excinfo.value)
    assert "en_core_web_md" in message
    assert "pip exit 1" in message
    assert "network unreachable" in message
    assert "pip install https://github.com/explosion/spacy-models" in message


def test_require_models_installed_passes_for_an_installed_model() -> None:
    pytest.importorskip("spacy")
    require_models_installed(["en_core_web_md"])


def test_require_models_installed_fails_loud_for_a_missing_model() -> None:
    pytest.importorskip("spacy")
    with pytest.raises(WorkflowExecutionError, match="not installed"):
        require_models_installed(["definitely_not_a_model_xyz"])


def test_require_models_installed_without_spacy_names_the_extra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(sys.modules, "spacy", None)
    with pytest.raises(WorkflowExecutionError, match="autoclassification.*extra"):
        require_models_installed(["en_core_web_md"])


def test_get_nlp_engine_caches_per_language_and_normalizes_any() -> None:
    pytest.importorskip("presidio_analyzer")
    get_nlp_engine.cache_clear()
    try:
        first = get_nlp_engine("en")
        assert get_nlp_engine("en") is first
        assert first.models[0]["lang_code"] == "en"
        assert first.models[0]["model_name"] == "en_core_web_md"
        any_engine = get_nlp_engine("any")
        assert any_engine.models[0]["lang_code"] == "en"
        assert any_engine.models[0]["model_name"] == "en_core_web_md"
    finally:
        get_nlp_engine.cache_clear()
