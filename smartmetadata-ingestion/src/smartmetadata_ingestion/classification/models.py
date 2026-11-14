# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""spaCy model selection, provisioning, and NLP-engine caching.

The language-to-model mapping is DATA, not branches: every language the
spaCy 3.8 catalog ships a medium model for maps to it, and every other
language falls back to the multilingual model. The wheel URLs follow
the spaCy models release layout; all 25 were verified resolvable
(HTTP 200) on 2026-11-14.

Models are provisioned INTO the images by the
``install-classification-models`` CLI command. Nothing here downloads
at run time: the warm-up check rejects a missing model loudly before
any engine is built, because the stock Presidio loader would otherwise
download the model on first use.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from smartmetadata_ingestion.errors import WorkflowError, WorkflowExecutionError

# Pinned spaCy model version (design §5.1): the engine, the provisioning
# command, and the images all resolve models at this version.
SPACY_MODEL_VERSION = "3.8.0"

# Multilingual fallback: languages without a dedicated medium model are
# analyzed with the multilingual NER model rather than skipped.
FALLBACK_MODEL_NAME = "xx_ent_wiki_sm"

# Language (ISO 639-1, per the classificationLanguages schema) to the
# spaCy 3.8 medium model for that language. "no" maps to the Bokmal
# model: the schema enum carries "no" while spaCy publishes the
# Norwegian model under "nb". "nb" itself is NOT a language identifier
# and has no entry here, and neither does "xx": the multilingual model
# is the fallback for languages without a dedicated model, reached by
# naming such a language, never by naming the model.
LANGUAGE_MODEL_NAMES: dict[str, str] = {
    "ca": "ca_core_news_md",
    "zh": "zh_core_web_md",
    "hr": "hr_core_news_md",
    "da": "da_core_news_md",
    "nl": "nl_core_news_md",
    "en": "en_core_web_md",
    "fi": "fi_core_news_md",
    "fr": "fr_core_news_md",
    "de": "de_core_news_md",
    "el": "el_core_news_md",
    "it": "it_core_news_md",
    "ja": "ja_core_news_md",
    "ko": "ko_core_news_md",
    "lt": "lt_core_news_md",
    "mk": "mk_core_news_md",
    "no": "nb_core_news_md",
    "pl": "pl_core_news_md",
    "pt": "pt_core_news_md",
    "ro": "ro_core_news_md",
    "ru": "ru_core_news_md",
    "sl": "sl_core_news_md",
    "es": "es_core_news_md",
    "sv": "sv_core_news_md",
    "uk": "uk_core_news_md",
}

# The ClassificationLanguage enum, transcribed from
# openmetadata-spec/.../schema/type/classificationLanguages.json (keep in
# sync with the schema): provisioning accepts exactly these identifiers.
# "any" is a valid identifier; "nb" and "xx" are absent by design.
CLASSIFICATION_LANGUAGES: frozenset[str] = frozenset(
    {
        "any",
        "af",
        "sq",
        "am",
        "ar",
        "hy",
        "az",
        "eu",
        "be",
        "bn",
        "bs",
        "bg",
        "ca",
        "zh",
        "hr",
        "cs",
        "da",
        "nl",
        "en",
        "et",
        "fi",
        "fr",
        "gl",
        "ka",
        "de",
        "el",
        "gu",
        "ht",
        "he",
        "hi",
        "hu",
        "is",
        "id",
        "ga",
        "it",
        "ja",
        "kn",
        "kk",
        "km",
        "ko",
        "ku",
        "ky",
        "lo",
        "lv",
        "lt",
        "mk",
        "ms",
        "ml",
        "mt",
        "mi",
        "mr",
        "mn",
        "my",
        "ne",
        "no",
        "ps",
        "fa",
        "pl",
        "pt",
        "pa",
        "ro",
        "ru",
        "sr",
        "si",
        "sk",
        "sl",
        "so",
        "es",
        "sw",
        "sv",
        "tl",
        "ta",
        "te",
        "th",
        "tr",
        "uk",
        "ur",
        "uz",
        "vi",
        "cy",
        "yi",
        "zu",
    }
)

# Near-miss guidance for the two codes callers most often mistake for
# language identifiers: "nb" is the Norwegian MODEL name (the language
# identifier is "no"), and "xx" is a model name fragment (the
# multilingual model is provisioned by naming a language without a
# dedicated model).
_LANGUAGE_HINTS: dict[str, str] = {
    "nb": "the Norwegian language identifier is 'no'",
    "xx": "name a language without a dedicated model (e.g. 'sw') to provision "
    "the multilingual model",
}

# Wheel layout of the spaCy models releases (facts, not expression):
# https://github.com/explosion/spacy-models/releases/download/<model>-<version>/<model>-<version>-py3-none-any.whl
MODEL_WHEEL_URL_TEMPLATE = (
    "https://github.com/explosion/spacy-models/releases/download/"
    "{model}-{version}/{model}-{version}-py3-none-any.whl"
)

# The NLP-engine cache is bounded: one engine per language, at most 32.
# Languages are bounded by the schema enum in practice, but the cache
# must stay bounded even for unexpected inputs (AGENTS.md).
_NLP_ENGINE_CACHE_SIZE = 32


def model_name_for_language(language: str) -> str:
    """The spaCy model for a run language.

    The run language ``any`` analyzes under the English engine, and any
    language without a dedicated model falls back to multilingual.
    """
    if language == "any":
        return LANGUAGE_MODEL_NAMES["en"]
    return LANGUAGE_MODEL_NAMES.get(language, FALLBACK_MODEL_NAME)


def model_wheel_url(model_name: str, *, version: str = SPACY_MODEL_VERSION) -> str:
    """The direct wheel URL for a pinned spaCy model release."""
    return MODEL_WHEEL_URL_TEMPLATE.format(model=model_name, version=version)


def provisioning_plan(languages: list[str]) -> list[tuple[str, str, str]]:
    """Strict language-to-model resolution for provisioning.

    Every segment must be an exact ClassificationLanguage identifier;
    anything else is rejected naming the bad identifier, and empty
    segments are never silently dropped (an empty string is not an
    identifier). Resolution shares the run-time mapping: ``any``
    resolves to the English model and languages without a dedicated
    model resolve to the multilingual fallback. Returns
    ``(language, model, wheel_url)`` triples, deduplicated by model
    in first-selection order.
    """
    plan: list[tuple[str, str, str]] = []
    seen_models: set[str] = set()
    for language in languages:
        if language not in CLASSIFICATION_LANGUAGES:
            hint = _LANGUAGE_HINTS.get(language)
            raise WorkflowError(
                f"unknown classification language {language!r}: not a "
                "ClassificationLanguage identifier" + (f" ({hint})" if hint else "")
            )
        model = model_name_for_language(language)
        if model in seen_models:
            continue
        seen_models.add(model)
        plan.append((language, model, model_wheel_url(model)))
    return plan


@dataclass
class InstallOutcome:
    """What one provisioning run did: the models it installed, and the
    models that were already available and needed no install. The two
    lists never overlap; together they cover the provisioning plan."""

    installed: list[str]
    already_available: list[str]


def _model_present(model_name: str) -> bool:
    """Whether a spaCy model is already usable, by the loader's own
    presence test (installed package or local path, as the warm-up
    gate checks it). A missing spaCy means absent: provisioning
    installs the model, and the model wheel carries its own spaCy
    dependency, so a fresh environment must install rather than fail
    here. Presence only — no version check, no load test."""
    try:
        import spacy
    except ImportError:
        return False
    return spacy.util.is_package(model_name) or Path(model_name).exists()


def install_models(
    languages: list[str],
    *,
    dry_run: bool = False,
    runner: Any = None,
    is_installed: Callable[[str], bool] | None = None,
) -> InstallOutcome:
    """Install the spaCy models for ``languages`` via pip.

    Each absent model installs from its pinned wheel URL with the
    running interpreter's pip, so the command works in the images
    (pip-based) and in any pip-managed environment. A model that is
    already present is left alone and reported as already available:
    the run never claims to have installed what was already there. A
    failed install raises loudly naming the model, the URL, and the
    manual equivalent; nothing is partially provisioned silently.
    ``runner`` and ``is_installed`` are the injectable seams for
    tests.
    """
    run = runner if runner is not None else subprocess.run
    present = is_installed if is_installed is not None else _model_present
    outcome = InstallOutcome(installed=[], already_available=[])
    for _language, model, url in provisioning_plan(languages):
        if present(model):
            if dry_run:
                print(f"{model} is already available")
            outcome.already_available.append(model)
            continue
        if dry_run:
            print(f"would install {model} from {url}")
            outcome.installed.append(model)
            continue
        result = run(
            [sys.executable, "-m", "pip", "install", "--no-cache-dir", url],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise WorkflowError(
                f"failed to install spaCy model {model} from {url} "
                f"(pip exit {result.returncode}): "
                f"{(result.stderr or '').strip() or 'no pip output'}; "
                f"install it manually with: pip install {url}"
            )
        outcome.installed.append(model)
    return outcome


def require_models_installed(model_names: list[str]) -> None:
    """Fail loudly when a needed spaCy model is not installed.

    This is the warm-up gate that keeps runtime downloads out of the
    deployed path: Presidio's stock loader downloads a missing model
    on first use, so the run must prove every needed model present
    BEFORE any engine is constructed. The check mirrors the loader's
    own presence test (installed package or local path).
    """
    try:
        import spacy
    except ImportError as exc:
        raise WorkflowExecutionError(
            "autoClassification requires the 'autoclassification' extra "
            "(presidio-analyzer + spaCy); install the ingestion package "
            "with the extra and provision models with "
            "'smartmetadata-ingest install-classification-models'"
        ) from exc
    missing = [
        model for model in model_names if not (spacy.util.is_package(model) or Path(model).exists())
    ]
    if missing:
        raise WorkflowExecutionError(
            "spaCy model(s) not installed: "
            + ", ".join(sorted(set(missing)))
            + "; provision them into the image with: "
            "smartmetadata-ingest install-classification-models "
            "--languages <codes> (no model is downloaded at run time)"
        )


@lru_cache(maxsize=_NLP_ENGINE_CACHE_SIZE)
def get_nlp_engine(language: str) -> Any:
    """The shared Presidio NLP engine for a language, cached per language.

    One engine per language: the engine's ``lang_code`` must equal the
    language analyses run under, and the model follows the mapping.
    The engine loads its model lazily on first use by the analyzer;
    the warm-up check in :func:`require_models_installed` has already
    proven the model present by then.
    """
    try:
        from presidio_analyzer.nlp_engine import SpacyNlpEngine
    except ImportError as exc:
        raise WorkflowExecutionError(
            "autoClassification requires the 'autoclassification' extra (presidio-analyzer + spaCy)"
        ) from exc
    # The "any" group always analyzes under the English engine; normalize
    # here so a stray "any" cannot mint a second engine for one model.
    language = "en" if language == "any" else language
    return SpacyNlpEngine(
        models=[
            {
                "lang_code": language,
                "model_name": model_name_for_language(language),
            }
        ]
    )
