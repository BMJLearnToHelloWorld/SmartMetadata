# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Recognizer construction from catalog configuration (design §2.6).

Five recognizer kinds come from the ``recognizerConfig`` of each
candidate tag: pattern, exact terms, context, custom (never executed),
and predefined (resolved by name from Presidio's set, with hardened
factory variants for the seed-used names). All Presidio imports are
function-level: this module imports without the optional extra, and a
missing extra fails loudly only when a recognizer is actually built.

The context-enhancement and threshold-filter decorators described in
the spec apply at analysis time (see ``analysis.py``): they need the
column being classified, which the factory never sees. This module
provides the per-recognizer configuration those decorators read.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import ipaddress
import logging
import re
from datetime import date
from functools import lru_cache
from typing import Any
from urllib.parse import urlsplit

from smartmetadata_ingestion.classification.preprocessing import spells_a_date
from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)

# The parser the Date validator rule is defined by (supplement §4.1).
# Declared in the autoclassification extra; the conditional import keeps
# this module importable without the extra. When it is absent, the
# hardened Date validator falls back to the stdlib check below and
# warns loudly, once, that the fallback's edges apply.
try:
    from dateutil.parser import parse as _dateutil_parse
except ImportError:  # unprovisioned environment; the extra declares it
    _dateutil_parse = None

_DATEUTIL_FALLBACK_WARNED = False


def _warn_dateutil_fallback_once() -> None:
    """Warn, once per process, that the Date validator runs on the
    stdlib fallback because python-dateutil is not installed. The
    fallback diverges from the parser on known edges; the provisioned
    path always installs the extra."""
    global _DATEUTIL_FALLBACK_WARNED
    if _DATEUTIL_FALLBACK_WARNED:
        return
    _DATEUTIL_FALLBACK_WARNED = True
    logger.warning(
        "python-dateutil is not installed; the Date validator uses the "
        "stdlib fallback, whose edges diverge from the dateutil parser. "
        "Install the autoclassification extra for the provisioned behavior."
    )

# Results scoring at or above this may be boosted to 1.0 by context
# enhancement; weaker matches stay weak even with matching context.
MIN_SCORE_FOR_ENHANCEMENT = 0.3

# A pattern without an explicit score matches at this confidence
# (the Pattern schema default).
DEFAULT_PATTERN_SCORE = 0.8

# Exact-term matches score higher than patterns: the term itself was
# listed, so the match is not a regex guess.
EXACT_TERM_SCORE = 0.9

# A context recognizer without a min/max score pair matches at this
# confidence.
DEFAULT_CONTEXT_SCORE = 0.6

# NER backends that resolve-and-skip when their library is absent: the
# name maps to the importable module whose presence proves the backend
# is installed. Azure needs endpoint credentials the recognizer schema
# does not carry, so it always skips (see _build_predefined).
BACKEND_MODULES: dict[str, str] = {
    "StanzaRecognizer": "stanza",
    "TransformersRecognizer": "transformers",
    "GLiNERRecognizer": "gliner",
}

# Splitter for the context-match rule: maximal runs of characters that
# are not lowercase letters or digits. Separators include spaces,
# underscores, hyphens, dots, and all other punctuation.
_CONTEXT_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")

# Timestamp keywords that suppress NHS results when one of them is a
# token of the split column name (exact whole-word equality, after
# lowercasing). See HardenedNhsRecognizer.
_NHS_TIMESTAMP_WORDS = frozenset(
    {
        "time",
        "timestamp",
        "date",
        "created",
        "updated",
        "modified",
        "deleted",
        "at",
        "on",
        "when",
        "epoch",
        "unix",
        "millis",
        "seconds",
        "utc",
        "gmt",
        "datetime",
        "expired",
        "expires",
        "transaction",
        "logged",
        "recorded",
        "started",
        "ended",
        "finished",
    }
)


def effective_recognizer_name(config: dict[str, Any]) -> str:
    """The name results carry for a configured recognizer.

    Predefined recognizers are renamed to the configured predefined
    name at construction; every other kind keeps the catalog name.
    """
    recognizer_config = config.get("recognizerConfig") or {}
    if recognizer_config.get("type") == "predefined":
        return str(recognizer_config.get("name") or config.get("name"))
    return str(config.get("name"))


def recognizer_config_language(config: dict[str, Any]) -> str:
    """The language a recognizer declares (schema default ``en``)."""
    recognizer_config = config.get("recognizerConfig") or {}
    return str(recognizer_config.get("supportedLanguage") or "en")


def recognizer_context_words(config: dict[str, Any]) -> list[str]:
    """The context words a recognizer declares (possibly none)."""
    recognizer_config = config.get("recognizerConfig") or {}
    context = recognizer_config.get("context") or []
    return [str(word) for word in context]


def recognizer_threshold(config: dict[str, Any]) -> float | None:
    """The configured confidence threshold, or None when unset.

    The filter applies only when the recognizer config sets the key:
    an absent threshold means no filtering, whatever the schema
    default would be.
    """
    if "confidenceThreshold" not in config:
        return None
    threshold = config.get("confidenceThreshold")
    return float(threshold) if threshold is not None else None


def is_spacy_ner_recognizer(config: dict[str, Any]) -> bool:
    """Whether a config builds a spaCy NER recognizer.

    Only the predefined SpacyRecognizer counts: the second NER pass
    and corroboration apply to spaCy results specifically, not to
    other NER backends.
    """
    recognizer_config = config.get("recognizerConfig") or {}
    return (
        recognizer_config.get("type") == "predefined"
        and recognizer_config.get("name") == "SpacyRecognizer"
    )


def _context_matches(context_words: list[str], context: list[str] | None) -> bool:
    """Whether any context word matches the analysis context
    (supplement §6.1).

    The context tokens are joined with single spaces and lowercased;
    the token set splits that text on every run of non-alphanumeric
    characters. Each word is lowercased whole (never camel-split):
    a one-part word matches by whole-token membership, a multi-part
    word matches only as the literal lowercased word inside the
    joined text, guarded against adjoining word characters — so
    underscore-joined words effectively never match split column
    text while space-joined phrases do, and camelCase words match
    only an all-lowercase single-token column name.

    This intentionally duplicates ``analysis.context_matches``:
    the UsBank override in this module needs the rule here, and
    importing the analysis copy would be circular. Keep the two
    implementations behaviorally identical; both are locked by
    their own §6.1 tests.
    """
    if not context_words or context is None:
        return False
    joined = " ".join(str(token) for token in context).lower()
    tokens = {part for part in _CONTEXT_TOKEN_SPLIT.split(joined) if part}
    for word in context_words:
        lowered = str(word).lower()
        parts = [part for part in _CONTEXT_TOKEN_SPLIT.split(lowered) if part]
        if not parts:
            continue
        if len(parts) == 1:
            if parts[0] in tokens:
                return True
            continue
        pattern = re.escape(lowered)
        if lowered[0].isalnum() or lowered[0] == "_":
            pattern = r"(?<!\w)" + pattern
        if lowered[-1].isalnum() or lowered[-1] == "_":
            pattern = pattern + r"(?!\w)"
        if re.search(pattern, joined):
            return True
    return False


def recognizer_excluded_for_column(
    config: dict[str, Any],
    *,
    entity_type: str,
    entity_fqn: str,
    column_dotted_path: str,
) -> bool:
    """Whether the recognizer's exception list excludes this column.

    The exact-link rule, per recognizer config: the column's fully
    qualified name (entity FQN + dotted column path) is split on
    dots; the last segment is the leaf name and the rest, rejoined,
    is the table FQN. The link
    ``<#E::table::<tableFQN>::columns::<leafName>>`` is built from
    those two parts and tested for exact whole-string membership in
    the config's exception set. No prefix matching, no FQN parsing
    of the entries, no normalization. The rule is table-only and
    leaf-name-only by construction: ``entity_type`` is accepted for
    the caller's convenience and ignored — entity-level links (no
    column part) and topic/container links can never match, and a
    nested column matches only via its leaf name in a link whose
    table part includes the ancestor path. The seed ships no
    exception lists, so the rule only fires on feedback the
    governance flow actually recorded.
    """
    _ = entity_type
    if not entity_fqn or not column_dotted_path:
        return False
    column_fqn = f"{entity_fqn}.{column_dotted_path}"
    table_fqn, _, leaf_name = column_fqn.rpartition(".")
    if not table_fqn or not leaf_name:
        return False
    link = f"<#E::table::{table_fqn}::columns::{leaf_name}>"
    exceptions = {
        str((entry or {}).get("entityLink") or "")
        for entry in config.get("exceptionList") or []
    }
    return link in exceptions


def build_tag_recognizers(
    configs: list[dict[str, Any]],
    *,
    tag_fqn: str,
    language: str,
) -> list[tuple[dict[str, Any], Any]]:
    """Build the usable recognizers for one tag in one language group.

    Disabled configs, custom configs, unresolvable predefined names,
    and absent NER backends are skipped with a log line each; the
    caller receives ``(config, recognizer)`` pairs for the rest.
    ``language`` is the effective language: the caller has already
    filtered by participation and normalized ``any`` to the group
    language.
    """
    built: list[tuple[dict[str, Any], Any]] = []
    for config in configs:
        name = config.get("name")
        if config.get("enabled") is False:
            logger.debug("recognizer %r disabled; skipping", name)
            continue
        recognizer = build_recognizer(config, tag_fqn=tag_fqn, language=language)
        if recognizer is not None:
            built.append((config, recognizer))
    return built


def build_recognizer(config: dict[str, Any], *, tag_fqn: str, language: str) -> Any | None:
    """Build one Presidio recognizer from a catalog config, or None.

    None means "do not execute": the custom kind (inert by a security
    decision), an unresolvable predefined name, or an absent optional
    backend. Malformed pattern configs raise instead of skipping: a
    config the server schema-validated must be buildable.
    """
    recognizer_config = config.get("recognizerConfig") or {}
    kind = recognizer_config.get("type")
    builder = _RECOGNIZER_BUILDERS.get(str(kind))
    if builder is None:
        logger.error(
            "recognizer %r has unknown recognizerConfig type %r; skipping",
            config.get("name"),
            kind,
        )
        return None
    return builder(config, tag_fqn=tag_fqn, language=language)


def _build_pattern(config: dict[str, Any], *, tag_fqn: str, language: str) -> Any:
    from presidio_analyzer import Pattern, PatternRecognizer

    recognizer_config = config["recognizerConfig"]
    flags = _regex_flags(recognizer_config.get("regexFlags"))
    patterns = []
    for raw in recognizer_config.get("patterns") or []:
        # OR-semantics: a configured score of 0 (or a missing one)
        # falls back to the default; only a nonzero score is honored.
        score = raw.get("score") or DEFAULT_PATTERN_SCORE
        pattern = Pattern(
            name=str(raw["name"]),
            regex=str(raw["regex"]),
            score=float(score),
        )
        # Fail fast on an invalid regex: compiling here surfaces a bad
        # pattern at run start instead of mid-run inside an analysis.
        _compile_pattern(pattern.regex, flags, config, pattern.name)
        patterns.append(pattern)
    return PatternRecognizer(
        supported_entity=tag_fqn,
        name=str(config.get("name")),
        supported_language=language,
        patterns=patterns,
        context=recognizer_config.get("context") or None,
        global_regex_flags=flags,
    )


def _build_exact_terms(config: dict[str, Any], *, tag_fqn: str, language: str) -> Any:
    from presidio_analyzer import Pattern, PatternRecognizer

    recognizer_config = config["recognizerConfig"]
    flags = _regex_flags(recognizer_config.get("regexFlags"))
    patterns = [
        Pattern(
            # The pattern name carries the raw term value with the
            # exact_term_ prefix; the regex is the escaped term.
            name=f"exact_term_{term}",
            regex=re.escape(str(term)),
            score=EXACT_TERM_SCORE,
        )
        for term in recognizer_config.get("exactTerms") or []
    ]
    return PatternRecognizer(
        supported_entity=tag_fqn,
        name=str(config.get("name")),
        supported_language=language,
        patterns=patterns,
        context=None,
        global_regex_flags=flags,
    )


def _build_context(config: dict[str, Any], *, tag_fqn: str, language: str) -> Any:
    from presidio_analyzer import Pattern, PatternRecognizer

    recognizer_config = config["recognizerConfig"]
    min_score = recognizer_config.get("minScore")
    max_score = recognizer_config.get("maxScore")
    # The midpoint applies only when BOTH bounds are truthy; a bound
    # of 0.0 is falsy and falls back to the default score.
    if min_score and max_score:
        score = (float(min_score) + float(max_score)) / 2
    else:
        score = DEFAULT_CONTEXT_SCORE
    # increaseFactorByCharLength has no behavior in the spec: the
    # field is schema-carried only, like requireExplicitMatch.
    patterns = []
    for word in recognizer_config.get("contextWords") or []:
        # The word adjacent to a word token on either side, matched
        # case-insensitively via the inline marker, with no
        # word-boundary anchors. The word is interpolated RAW: any
        # regex metacharacters in it act as regex operators.
        patterns.append(
            Pattern(
                name=f"context_{word}",
                regex=rf"(?i){word}\s+\w+|\w+\s+{word}",
                score=score,
            )
        )
    return PatternRecognizer(
        supported_entity=tag_fqn,
        name=str(config.get("name")),
        supported_language=language,
        patterns=patterns,
        context=None,
    )


def _build_custom(config: dict[str, Any], *, tag_fqn: str, language: str) -> None:
    # Custom recognizers never execute: running catalog-supplied code
    # is a security decision, not a missing feature.
    logger.warning(
        "recognizer %r is a custom recognizer; custom recognizers are never executed",
        config.get("name"),
    )
    return None


def _build_predefined(config: dict[str, Any], *, tag_fqn: str, language: str) -> Any | None:
    from presidio_analyzer import predefined_recognizers
    from presidio_analyzer.entity_recognizer import EntityRecognizer

    recognizer_config = config["recognizerConfig"]
    predefined_name = str(recognizer_config.get("name"))
    if predefined_name == "AzureAILanguageRecognizer":
        # The recognizer schema carries no endpoint or credentials, so
        # the Azure backend can never be configured; skip like any
        # other absent backend.
        logger.warning(
            "recognizer %r needs the Azure AI Language backend, which "
            "the recognizer schema cannot configure; skipping",
            config.get("name"),
        )
        return None
    backend_module = BACKEND_MODULES.get(predefined_name)
    if backend_module is not None:
        import importlib.util

        if importlib.util.find_spec(backend_module) is None:
            logger.warning(
                "recognizer %r needs the %s backend, which is not installed; skipping",
                config.get("name"),
                predefined_name,
            )
            return None
    recognizer_cls = getattr(predefined_recognizers, predefined_name, None)
    if not isinstance(recognizer_cls, type) or not issubclass(recognizer_cls, EntityRecognizer):
        logger.error(
            "recognizer %r names unknown predefined recognizer %r; skipping",
            config.get("name"),
            predefined_name,
        )
        return None
    hardened = _hardened_variant_classes().get(predefined_name)
    cls = hardened if hardened is not None else recognizer_cls
    kwargs: dict[str, Any] = {
        "supported_language": language,
        "context": _predefined_context(config),
    }
    # Supported entities pass through only to constructors that take
    # them (the NER recognizers). Single-entity pattern recognizers
    # keep their class default: relabeling their results with a
    # configured entity would misreport what was detected.
    entities = recognizer_config.get("supportedEntities")
    if entities and _accepts_parameter(cls, "supported_entities"):
        kwargs["supported_entities"] = [str(entity) for entity in entities]
    try:
        recognizer = cls(**kwargs)
    except Exception:
        logger.error(
            "recognizer %r (%s) failed to construct; skipping",
            config.get("name"),
            predefined_name,
            exc_info=True,
        )
        return None
    # The created recognizer carries the configured predefined name so
    # results resolve back to the catalog config for metadata.
    recognizer.name = predefined_name
    return recognizer


def _predefined_context(config: dict[str, Any]) -> list[str] | None:
    """The context list for a predefined recognizer.

    A configured non-empty list REPLACES the class default context
    entirely; an absent or empty one yields None so Presidio falls
    back to the class default. There is no merging anywhere in this
    chain.
    """
    context = recognizer_context_words(config)
    return context or None


def _accepts_parameter(cls: type, parameter: str) -> bool:
    import inspect

    try:
        params = inspect.signature(cls.__init__).parameters
    except (TypeError, ValueError):
        return False
    return parameter in params or any(
        param.kind == inspect.Parameter.VAR_KEYWORD for param in params.values()
    )


def _regex_flags(raw: dict[str, Any] | None) -> int:
    """The ``regex`` flags for a RegexFlags config.

    Absent config (or absent keys) means all three flags: the schema
    defaults each of ignoreCase/dotAll/multiline to true, and the
    default combination is IGNORECASE+DOTALL+MULTILINE.
    """
    import regex

    flags = raw or {}
    combined = 0
    if flags.get("ignoreCase", True):
        combined |= regex.I
    if flags.get("dotAll", True):
        combined |= regex.S
    if flags.get("multiline", True):
        combined |= regex.M
    return combined


def _compile_pattern(
    regex_text: str, flags: int, config: dict[str, Any], pattern_name: str
) -> None:
    import regex

    try:
        regex.compile(regex_text, flags)
    except regex.error as exc:
        raise WorkflowError(
            f"recognizer {config.get('name')!r} pattern {pattern_name!r} "
            f"has an invalid regex {regex_text!r}: {exc}"
        ) from exc


_RECOGNIZER_BUILDERS: dict[str, Any] = {
    "pattern": _build_pattern,
    "exact_terms": _build_exact_terms,
    "context": _build_context,
    "custom": _build_custom,
    "predefined": _build_predefined,
}


# --- Hardened-variant behavior tables and helpers -----------------------
#
# The shapes and checks below are behavior specifications written from
# the public algorithms and the behavioral supplement: what strings
# match, what validation applies, and what scores result. They live at
# module level (stdlib only) so the Presidio subclasses in
# ``_hardened_variant_classes`` stay thin wrappers over them.

# US driving-license whole-line shapes (supplement §1.1). Letters are
# written uppercase; matching is case-insensitive, so lowercase text
# matches too. ``D`` = digit, ``L`` = letter in the comments.
_US_LICENSE_SHAPES = (
    # Pure digit runs.
    r"\d{4}",
    r"\d{6}",
    r"\d{7}",
    r"\d{8}",
    r"\d{9}",
    r"\d{12}",
    r"\d{13}",
    r"\d{7,9}",
    r"[1-9][1-9]\d{5}",
    # Letter + digits, no separator.
    r"[A-Z]\d{6}",
    r"[A-Z]\d{7}",
    r"[A-Z]\d{8}",
    r"[A-Z]\d{9}",
    r"[A-Z]\d{11}",
    r"[A-Z]\d{12}",
    r"[A-Z]\d{14}",
    r"[A-Z]\d{4,8}",
    r"[A-Z]{2}\d{3,7}",
    r"[A-Z]{2}\d{6}[A-Z]",
    r"\d{3}[A-Z]{2}\d{4}",
    r"\d{7}[A-Z]",
    r"\d{2}[A-Z]{3}\d{5}",
    r"\d[A-Z]{2}\d{4}",
    r"\d{2}[A-Z]{2}\d{3}",
    r"\d{3}[A-Z]{1,3}",
    r"\d[A-Z]{3}\d{3}",
    r"\d{2}[A-Z]{2}\d",
    r"\d[A-Z]{2}\d{2}",
    r"\d{3}[A-Z]\d",
    r"\d[A-Z]\d{3}",
    # Dash-separated.
    r"\d{2}-\d{3}-\d{4}",
    r"[A-Z]-\d{3}-\d{3}-\d{3}",
    r"[A-Z]\d{3}-\d{3}-\d{2}-\d{3}-\d",
    r"[A-Z]\d{3}-\d{4}-\d{4}",
    r"\d{4}-\d{2}-\d{4}",
    r"[A-Z]\d{2}-\d{2}-\d{4}",
    r"[A-Z]\d{2}-\d{3}-\d{3}",
    r"[A-Z]\d{4}-\d{5}-\d{5}",
    r"[A-Z]{3}-\d{2}-\d{4}",
    r"\d{6}-\d{3}",
    r"[A-Z]\d{3}-\d{4}-\d{4}-\d{2}",
    r"\d{3}-[A-Z]{3}",
    r"[A-Z]{3}-\d{3}",
    r"[A-Z]{2}-\d{4}",
    r"\d{3}-[A-Z]{4}",
    r"[A-Z]{3}-\d{4}",
    r"[A-Z]\d{2}-[A-Z]{3}",
    r"\d-\d{5}[A-Z]",
    r"\d{2}-\d{4}[A-Z]",
    r"\d-[A-Z]\d{4}",
    r"\d{2}-[A-Z]\d{3}",
    r"\d{2}-[A-Z]{2}\d{2}",
    r"[A-Z]\d{2}-\d{2}[A-Z]",
    r"\d-\d{5}",
    r"\d-\d{4}[A-Z]",
    r"\d{2}-\d{5}",
    # Space-separated (single literal spaces unless noted).
    r"[A-Z] \d{3} \d{3} \d{3} \d{3}",
    r"[A-Z]\s\d{3}\s\d{3}\s\d{3}\s\d{3}",
    r"\d{3} \d{3} \d{3}",
    r"\d{2} \d{3} \d{3}",
    r"\d{3} [A-Z]{3}",
    r"\d{3} ?[A-Z]{3}",
    r"[A-Z]{3} [A-Z] \d{2}",
    r"[A-Z]\d{2} \d [A-Z]{2}",
    r"\d{3} \d [A-Z]{2}",
    r"[A-Z]{2} \d{4}",
    r"[A-Z]{3} \d{3}",
    r"[HZKLM][A-Z]{2} \d{3}",
    r"[A-Z] \d{6}",
    r"\d [A-Z] \d{5}",
    r"\d [A-Z] [A-Z] \d{4}",
    r"\d [A-Z] [A-Z]{2} \d{3}",
    r"\d [A-Z] \d [A-Z] \d [A-Z]{3}",
    r"\d [A-Z] \d{4} [A-Z]",
    r"\d{2} [A-Z] \d{4}",
    r"[A-Z]{2} \d{5}",
    r"[A-Z]{2} \d \d{4}",
    r"\d{4} [A-Z]{2}",
    r"\d [A-Z]{3} \d{2}",
    r"\d [A-Z]{2} \d{3}",
    r"\d{3} [A-Z]{2} \d",
    r"\d{2} [A-Z] [A-Z] \d{2}",
    r"\d [A-Z]{2} [A-Z] \d{2}",
    r"[A-Z]{2} \d [A-Z] \d [A-Z]",
    r"\d{3} \d{4}",
    r"[A-Z]{3} \d{4}",
    r"\d{2} [A-Z] \d{3}",
    r"\d{2} [A-Z] [A-Z]{2} \d",
    # Other separators: a literal bullet.
    r"\d{2}[A-Z]•\d{3}",
    # Washington shape: letters/asterisks, two letters, a digit,
    # letters-or-digits.
    r"[A-Z*]{1,6}[A-Z]{2}\d[A-Z0-9]{4,6}",
    # Month-encoded shapes. The first day part EXCLUDES 20-29.
    r"(?:0[1-9]|1[0-2])\d{3}[1-9]\d{3}41(?:0[1-9]|1[0-9]|3[01])\d{10}",
    r"(?:0[1-9]|1[0-2])[A-Z]{3}\d{2}(?:0[1-9]|[12][0-9]|3[01])\d",
)

# The SSN-shaped dashed form, deliberately demoted so a column of
# SSN-shaped values is not claimed by the license recognizer.
_US_LICENSE_SSN_SHAPE = r"\d{3}-\d{2}-\d{4}"

# Credit-card brand shapes over SANITIZED (digits-only) candidates.
# Each is an anchored whole-string shape scoring 0.7; validation is
# the inherited stock Luhn check, so only Luhn-valid cards survive.
_CARD_SHAPES = (
    ("Visa", r"\A4(?:\d{12}|\d{15}|\d{18})\Z"),
    (
        "Mastercard",
        r"\A(?:5[1-5]\d{14}|(?:222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)\d{12})\Z",
    ),
    ("American Express", r"\A3[47]\d{13}\Z"),
    ("Diners Club", r"\A(?:30[0-5]\d{11}|3[68]\d{12})\Z"),
    (
        "Discover",
        r"\A(?:6011\d{12}|622(?:12[6-9]|1[3-9]\d|[2-8]\d\d|9[01]\d|92[0-5])\d{10}"
        r"|64[4-9]\d{13}|65\d{14})\Z",
    ),
    ("JCB", r"\A35(?:2[8-9]|[3-8]\d)\d{12}\Z"),
    ("Maestro", r"\A(?:5018|5020|5038|5893|6304|6759|676[1-3])\d{8,15}\Z"),
    ("UnionPay", r"\A62\d{14,17}\Z"),
)

# The card-shape rule, applied to a candidate with runs of spaces
# collapsed to single spaces: 12-19 consecutive digits; four groups
# of 4 digits with ONE consistent separator (all spaces or all
# dashes), optionally plus a fifth group of 3; 4-6-5 grouping with a
# consistent separator; or a Diners-style 4-6-4 grouping (first
# group starting 300-305/36/38) with a consistent separator. Mixed
# separators fail.
_CARD_SHAPE_PATTERNS = (
    re.compile(r"\d{12,19}"),
    re.compile(r"\d{4}([ \-])\d{4}\1\d{4}\1\d{4}(?:\1\d{3})?"),
    re.compile(r"\d{4}([ \-])\d{6}\1\d{5}"),
    re.compile(r"(?:30[0-5]\d|3[68]\d\d)([ \-])\d{6}\1\d{4}"),
)

# Maximal runs of digits, spaces/tabs, and dashes that start and end
# with a digit; a lone digit is a candidate.
_CARD_CANDIDATE = re.compile(r"[0-9][0-9 \t\-]*[0-9]|[0-9]")

# Explicit-prefix recovery: a valid YYYY-MM-DD date followed by
# spaces, or leading digits followed by spaces (quantity prefix).
_CARD_DATE_PREFIX = re.compile(r"(\d{4})-(\d{2})-(\d{2})[ \t]+")
_CARD_QUANTITY_PREFIX = re.compile(r"\d+[ \t]+")

# The quantity prefix fires only when the text immediately before the
# candidate ends with the label `qty`/`quantity` + whitespace.
_CARD_QUANTITY_LABEL = re.compile(r"(?:qty|quantity)\s+$", re.IGNORECASE)

# IP token scan: maximal runs of word characters, colons, dots,
# percent signs, and hyphens.
_IP_TOKEN = re.compile(r"[\w:.%-]+")

# A URI-authority prefix before a token (scheme + optional userinfo
# and `[`) means a following `/digits` is a URI path, not a CIDR
# suffix.
_URI_AUTHORITY_BEFORE = re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*://(?:[^\s/@]*@)?\[?$")

# Singapore FIN/NRIC checksum: per-prefix offsets and check-letter
# tables. The M table ends `…NJLK`, differing from the F/G table's
# `…NMLK`. Weights over the 7 digits are 2, 7, 6, 5, 4, 3, 2.
_SG_FIN_WEIGHTS = (2, 7, 6, 5, 4, 3, 2)
_SG_FIN_OFFSETS = {"S": 0, "T": 4, "F": 0, "G": 4, "M": 3}
_SG_FIN_TABLES = {
    "S": "JZIHGFEDCBA",
    "T": "JZIHGFEDCBA",
    "F": "XWUTRQPNMLK",
    "G": "XWUTRQPNMLK",
    "M": "XWUTRQPNJLK",
}
_SG_FIN_SHAPE = re.compile(r"[STFGM][0-9]{7}[A-Z]")

# Finnish HETU century separators (the letter separators are the
# 2023 reform additions) and the 31-character check table.
_FI_CENTURIES = {
    "+": 1800,
    "-": 1900,
    "U": 1900,
    "V": 1900,
    "W": 1900,
    "X": 1900,
    "Y": 1900,
    "A": 2000,
    "B": 2000,
    "C": 2000,
    "D": 2000,
    "E": 2000,
    "F": 2000,
}
_FI_CHECK_CHARS = "0123456789ABCDEFHJKLMNPRSTUVWXY"

# Fallback shapes for the date validator when python-dateutil is not
# installed (declared in the autoclassification extra; the fallback
# covers unprovisioned environments): a lone month name or a lone
# time-of-day still parses. Full and partial dates go through
# spells_a_date; see _date_text_parseable.
_MONTH_NAME_ONLY = re.compile(
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?"
    r"|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?",
    re.IGNORECASE,
)


def _has_card_shape(candidate: str) -> bool:
    """Whether a candidate has card shape under the grouping rule."""
    collapsed = re.sub(r"[ \t]+", " ", candidate)
    return any(pattern.fullmatch(collapsed) for pattern in _CARD_SHAPE_PATTERNS)


def _valid_calendar_date(year: int, month: int, day: int) -> bool:
    """Whether year/month/day form a real calendar date."""
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def _validate_uppercased(validate: Any, pattern_text: str) -> bool | None:
    """The case-insensitive wrapper rule (EsNie/SgUen/EsNif).

    A non-ASCII match is rejected outright (uppercasing a non-ASCII
    lookalike could forge a valid checksum input). Otherwise the
    stock validator runs on the UPPERCASED text: failure rejects;
    success on an already-all-uppercase match boosts to 1.0; success
    on any other match keeps the pattern score (no-decision).
    """
    if not pattern_text.isascii():
        return False
    if not validate(pattern_text.upper()):
        return False
    return True if pattern_text.isupper() else None


def _date_text_parseable(text: str) -> bool:
    """Stdlib fallback for "the date parser accepts this text".

    Used by the hardened Date validator only when python-dateutil is
    not importable (the validator warns loudly, once, on that path).
    A span spelling a date parses; so do lone components the parser
    accepts (a bare year, a bare month name, a bare day, a bare time).
    Anything else keeps the pattern score.
    The validator never rejects on this path either way.
    """
    if spells_a_date(text):
        return True
    stripped = text.strip()
    if re.fullmatch(r"\d{4}", stripped):
        return 1 <= int(stripped) <= 9999
    day_match = re.fullmatch(r"(\d{1,2})(?:st|nd|rd|th)?", stripped, re.IGNORECASE)
    if day_match and 1 <= int(day_match.group(1)) <= 31:
        return True
    if _MONTH_NAME_ONLY.fullmatch(stripped):
        return True
    time_match = re.fullmatch(
        r"(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(?:[ap]m)?",
        stripped,
        re.IGNORECASE,
    )
    if time_match:
        hour, minute = int(time_match.group(1)), int(time_match.group(2))
        second = int(time_match.group(3)) if time_match.group(3) else 0
        return hour <= 23 and minute <= 59 and second <= 59
    return False


def _url_seed_span(
    text: str, start: int, end: int, host_regex: Any
) -> tuple[int, int] | None:
    """Remap one stock URL seed to its hardened span, or drop it.

    Steps: skip an opening quote; drop embedded seeds; extend the
    end to the next boundary tracking parenthesis depth (unclosed
    parens drop the seed); trim trailing prose punctuation unless
    the scan stopped at ``>``/quote; parse (prepending ``//`` for
    schemeless candidates, re-parsing after stripping trailing
    punctuation when there is no path/query/fragment); enforce the
    stock public-host policy (empty/http/https scheme, a hostname
    fully matching the stock base-URL host pattern).
    """
    if start < len(text) and text[start] in "\"'":
        start += 1
    if start > 0:
        before = text[start - 1]
        if before.isalnum() or before in "@._-":
            return None
    depth = 0
    index = start
    stopped_at: str | None = None
    while index < len(text):
        char = text[index]
        if char.isspace() or char in "<>\"'":
            stopped_at = char
            break
        if char == "(":
            depth += 1
        elif char == ")":
            if depth == 0:
                stopped_at = char
                break
            depth -= 1
        index += 1
    if depth > 0:
        return None
    end = index
    if stopped_at not in (">", '"', "'"):
        while end > start and text[end - 1] in ".,":
            end -= 1
    candidate = text[start:end]
    if not candidate or len(candidate) > 5000:
        return None

    def _parse(value: str) -> Any:
        to_parse = value if re.match(r"(?i)https?://", value) else "//" + value
        return urlsplit(to_parse)

    try:
        parsed = _parse(candidate)
        if not (parsed.path or parsed.query or parsed.fragment):
            stripped = candidate.rstrip(".,!;")
            if stripped != candidate:
                end -= len(candidate) - len(stripped)
                candidate = stripped
                parsed = _parse(candidate)
        _ = parsed.port
    except ValueError:
        return None
    if parsed.scheme not in ("", "http", "https"):
        return None
    try:
        hostname = parsed.hostname
    except ValueError:
        return None
    if not hostname or host_regex.fullmatch(hostname) is None:
        return None
    return (start, end)


def _ip_candidate_span(text: str, token_start: int, token_end: int) -> tuple[int, int] | None:
    """Reduce one token-scan token to an address span, or drop it.

    Steps: skip a non-hex label before the first colon; strip
    trailing dots; require a dot or colon and at most 45 characters;
    handle host:port (an IPv4 part before a single colon keeps the
    address only when the port is decimal 1-65535); require the
    candidate to parse as an IP address; apply the CIDR rule (a
    ``/digits`` suffix after the original token drops a shortened
    token or an invalid suffix, unless a URI-authority prefix
    precedes the token).
    """
    token = text[token_start:token_end]
    start, end = token_start, token_end
    colon = token.find(":")
    if colon != -1:
        label = token[:colon]
        if re.fullmatch(r"[A-Za-z_]\w*", label) and any(
            char not in "0123456789abcdefABCDEF" for char in label
        ):
            start = token_start + colon + 1
    while end > start and text[end - 1] == ".":
        end -= 1
    candidate = text[start:end]
    if ("." not in candidate and ":" not in candidate) or len(candidate) > 45:
        return None
    shortened = start != token_start or end != token_end
    if candidate.count(":") == 1:
        before, _, after = candidate.partition(":")
        try:
            ipaddress.IPv4Address(before)
        except ValueError:
            pass
        else:
            if not after.isdigit() or not 1 <= int(after) <= 65535:
                return None
            end = start + len(before)
            candidate = before
            shortened = True
    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    max_prefix = 32 if isinstance(address, ipaddress.IPv4Address) else 128
    if token_end < len(text) and text[token_end] == "/":
        suffix_match = re.match(r"/(\d+)", text[token_end:])
        if suffix_match is not None:
            digits = suffix_match.group(1)
            after_digits = token_end + 1 + len(digits)
            following = text[after_digits] if after_digits < len(text) else ""
            if not (following and (following.isalnum() or following in "_.")):
                if _URI_AUTHORITY_BEFORE.search(text[:token_start]) is None:
                    valid = (
                        len(digits) <= 3
                        and int(digits) <= max_prefix
                        and following not in ("/", ":", "%", "-")
                    )
                    if shortened or not valid:
                        return None
    return (start, end)


@lru_cache(maxsize=1)
def _hardened_variant_classes() -> dict[str, type]:
    """Seed-used predefined recognizers with hardened behavior.

    Twenty variants, one per hardened factory in the behavioral
    spec: pattern replacement, pattern append, validator wrappers
    delegating to the stock checks, analyze-level overrides, and
    context-enhancement overrides. Each variant is a fresh subclass
    over Presidio's public hooks. The classes are built lazily:
    defining them requires Presidio, and this module must import
    without the extra.
    """
    import regex
    from presidio_analyzer import Pattern, RecognizerResult
    from presidio_analyzer.predefined_recognizers import (
        AuAbnRecognizer,
        AuAcnRecognizer,
        AuTfnRecognizer,
        CreditCardRecognizer,
        DateRecognizer,
        EsNieRecognizer,
        EsNifRecognizer,
        FiPersonalIdentityCodeRecognizer,
        IbanRecognizer,
        InAadhaarRecognizer,
        IpRecognizer,
        ItFiscalCodeRecognizer,
        ItVatCodeRecognizer,
        NhsRecognizer,
        PlPeselRecognizer,
        SgFinRecognizer,
        SgUenRecognizer,
        UrlRecognizer,
        UsBankRecognizer,
        UsLicenseRecognizer,
    )
    from presidio_analyzer.predefined_recognizers.iban_patterns import BOS, EOS

    _url_host_regex = regex.compile(UrlRecognizer.BASE_URL_REGEX, regex.IGNORECASE)

    class HardenedCreditCardRecognizer(CreditCardRecognizer):
        """Analyze-level card detection: candidate iteration over
        digit/space/dash runs, card-shape tests with separator
        consistency, date/quantity-prefix and per-part/trailing-year
        recovery, and span remapping to the original text. Patterns
        are the eight anchored brand shapes over sanitized digits;
        validation is the inherited stock Luhn check."""

        PATTERNS = [
            Pattern(name, shape, 0.7) for name, shape in _CARD_SHAPES
        ]

        def analyze(
            self, text: str, entities: list[str], nlp_artifacts: Any = None,
            regex_flags: int | None = None,
        ) -> list[Any]:
            results: list[Any] = []
            for match in _CARD_CANDIDATE.finditer(text):
                results.extend(
                    self._analyze_candidate(
                        text, match.span(), entities, nlp_artifacts, regex_flags
                    )
                )
            return results

        def _analyze_candidate(
            self, text: str, span: tuple[int, int], entities: list[str],
            nlp_artifacts: Any, regex_flags: int | None,
        ) -> list[Any]:
            start, end = span
            candidate = text[start:end]
            if len(candidate) > 5000:
                return []
            if start > 0 and (text[start - 1].isalnum() or text[start - 1] in "_.-"):
                return []
            if end < len(text):
                after = text[end]
                if after.isalnum() or after in "_-":
                    return []
                if after == "." and end + 1 < len(text) and text[end + 1].isdigit():
                    return []
            index = start - 1
            while index >= 0 and text[index] in " \t":
                index -= 1
            if index >= 0 and text[index] == "+":
                return []
            if _has_card_shape(candidate):
                found = self._analyze_span(
                    text, start, end, entities, nlp_artifacts, regex_flags
                )
                if found:
                    return found
            date_match = _CARD_DATE_PREFIX.match(candidate)
            if date_match is not None:
                year, month, day = (int(group) for group in date_match.groups())
                if _valid_calendar_date(year, month, day):
                    remainder_start = start + date_match.end()
                    if _has_card_shape(text[remainder_start:end]):
                        found = self._analyze_span(
                            text, remainder_start, end,
                            entities, nlp_artifacts, regex_flags,
                        )
                        if found:
                            return found
            if _CARD_QUANTITY_LABEL.search(text[:start]) is not None:
                quantity_match = _CARD_QUANTITY_PREFIX.match(candidate)
                if quantity_match is not None:
                    remainder_start = start + quantity_match.end()
                    if _has_card_shape(text[remainder_start:end]):
                        found = self._analyze_span(
                            text, remainder_start, end,
                            entities, nlp_artifacts, regex_flags,
                        )
                        if found:
                            return found
            results: list[Any] = []
            parts = [
                (part.start(), part.end())
                for part in re.finditer(r"\S+", candidate)
            ]
            if len(parts) >= 2 and all(
                _has_card_shape(candidate[part_start:part_end])
                for part_start, part_end in parts
            ):
                for part_start, part_end in parts:
                    results.extend(
                        self._analyze_span(
                            text, start + part_start, start + part_end,
                            entities, nlp_artifacts, regex_flags,
                        )
                    )
            last_space = candidate.rfind(" ")
            if last_space > 0:
                suffix = candidate[last_space + 1 :]
                prefix = candidate[:last_space].rstrip()
                if (
                    re.fullmatch(r"(?:19|20)\d{2}", suffix)
                    and _has_card_shape(prefix)
                ):
                    results.extend(
                        self._analyze_span(
                            text, start, start + len(prefix),
                            entities, nlp_artifacts, regex_flags,
                        )
                    )
            return results

        def _analyze_span(
            self, text: str, start: int, end: int, entities: list[str],
            nlp_artifacts: Any, regex_flags: int | None,
        ) -> list[Any]:
            """Analyze one span as a card: sanitize, run the brand
            patterns, keep only results spanning the whole sanitized
            candidate, remapped to the original span."""
            sanitized = re.sub(r"[\- \t]", "", text[start:end])
            if not sanitized:
                return []
            kept: list[Any] = []
            for result in super().analyze(
                sanitized, entities,
                nlp_artifacts=nlp_artifacts, regex_flags=regex_flags,
            ):
                if result.start == 0 and result.end == len(sanitized):
                    result.start, result.end = start, end
                    kept.append(result)
            return kept

    class HardenedUrlRecognizer(UrlRecognizer):
        """Analyze-level URL hardening: stock results are seeds that
        are re-spanned (quote skip, extension with parenthesis
        tracking, punctuation trim) and re-validated (parse + stock
        public-host policy), keeping stock scores and explanations.
        Deduplicated by span: the first seed wins."""

        def analyze(
            self, text: str, entities: list[str], nlp_artifacts: Any = None,
            regex_flags: int | None = None,
        ) -> list[Any]:
            seeds = super().analyze(
                text, entities,
                nlp_artifacts=nlp_artifacts, regex_flags=regex_flags,
            )
            results: list[Any] = []
            seen_spans: set[tuple[int, int]] = set()
            for seed in seeds:
                span = _url_seed_span(text, seed.start, seed.end, _url_host_regex)
                if span is None or span in seen_spans:
                    continue
                seen_spans.add(span)
                seed.start, seed.end = span
                results.append(seed)
            return results

    class HardenedIpRecognizer(IpRecognizer):
        """Analyze-level IP detection: token scan with label skip,
        trailing-dot strip, host:port handling, ``ipaddress``
        validation, and the CIDR rule. Patterns are the three
        anchored shapes, INCLUDING the bare ``::`` at 0.1; the
        stock invalidator is inherited unchanged."""

        PATTERNS = [
            Pattern("IPv4", r"\A[0-9.]+\Z", 0.6),
            Pattern(
                "IPv6",
                r"\A(?!::\Z)[0-9A-Fa-f:.]+(?:%[0-9A-Za-z]+)?\Z",
                0.6,
            ),
            Pattern("IPv6", r"\A::\Z", 0.1),
        ]

        def analyze(
            self, text: str, entities: list[str], nlp_artifacts: Any = None,
            regex_flags: int | None = None,
        ) -> list[Any]:
            results: list[Any] = []
            for match in _IP_TOKEN.finditer(text):
                span = _ip_candidate_span(text, match.start(), match.end())
                if span is None:
                    continue
                start, end = span
                candidate = text[start:end]
                for result in super().analyze(
                    candidate, entities,
                    nlp_artifacts=nlp_artifacts, regex_flags=regex_flags,
                ):
                    if result.start == 0 and result.end == len(candidate):
                        result.start, result.end = start, end
                        results.append(result)
            return results

    class HardenedNhsRecognizer(NhsRecognizer):
        """Timestamp-context suppression: when the analysis context
        holds any timestamp keyword, ALL of this recognizer's
        results for the value are discarded. The stock checksum,
        pattern, and context default stand untouched; there is no
        checksum override of any kind. This step neither reads nor
        writes the context-enhancement flag: any flag on a
        surviving result comes from the decorator wrapping it."""

        def enhance_using_context(
            self, text: str, raw_recognizer_results: list[Any],
            other_raw_recognizer_results: list[Any], nlp_artifacts: Any,
            context: list[str] | None = None,
        ) -> list[Any]:
            if context is None:
                return raw_recognizer_results
            if any(
                str(word).lower() in _NHS_TIMESTAMP_WORDS for word in context
            ):
                return []
            return raw_recognizer_results

    class HardenedDateRecognizer(DateRecognizer):
        """Boost parseable dates to 1.0, keep the pattern score
        otherwise, never reject. Parseability is whatever the
        dateutil parser accepts; when dateutil is not installed the
        stdlib fallback in ``_date_text_parseable`` applies, with a
        loud once-per-process warning. This validator is NOT the
        date-spelling patcher: a bare year boosts here and is dropped
        there."""

        def validate_result(self, pattern_text: str) -> bool | None:
            if _dateutil_parse is not None:
                try:
                    _dateutil_parse(pattern_text)
                except Exception:
                    return None
                return True
            _warn_dateutil_fallback_once()
            return True if _date_text_parseable(pattern_text) else None

    class HardenedIbanRecognizer(IbanRecognizer):
        """Match-time case-insensitive IBAN matching: the recognizer
        is constructed with IGNORECASE added to the stock flags, so
        lowercase IBANs match at all. Validation is the stock
        checksum/format check unchanged: uppercase-valid boosts to
        1.0, lowercase/mixed-valid keeps the 0.5 pattern score."""

        def __init__(
            self,
            patterns: list[Any] | None = None,
            context: list[str] | None = None,
            supported_language: str = "en",
            supported_entity: str = "IBAN_CODE",
            exact_match: bool = False,
            bos_eos: tuple[str, str] = (BOS, EOS),
            regex_flags: int | None = None,
            replacement_pairs: list[tuple[str, str]] | None = None,
        ) -> None:
            _ = regex_flags
            super().__init__(
                patterns=patterns,
                context=context,
                supported_language=supported_language,
                supported_entity=supported_entity,
                exact_match=exact_match,
                bos_eos=bos_eos,
                regex_flags=regex.DOTALL | regex.MULTILINE | regex.IGNORECASE,
                replacement_pairs=replacement_pairs,
            )

    class HardenedEsNifRecognizer(EsNifRecognizer):
        """Case-insensitive NIF validation: ASCII guard, then the
        stock mod-23 check on the uppercased text, boosting only
        already-uppercase matches. The checksum itself is delegated,
        never reimplemented."""

        def validate_result(self, pattern_text: str) -> bool | None:
            return _validate_uppercased(super().validate_result, pattern_text)

    class HardenedUsLicenseRecognizer(UsLicenseRecognizer):
        """Whole-line license shapes replacing the stock substring
        patterns entirely: a shape matches only when it is exactly
        one line of the value. The SSN-shaped dashed form scores
        0.05; every other shape scores 0.3. No validation."""

        PATTERNS = [
            Pattern(
                "US Driver License",
                "^(?:" + "|".join(_US_LICENSE_SHAPES) + ")$",
                0.3,
            ),
            Pattern("US Driver License (SSN-shaped)", "^" + _US_LICENSE_SSN_SHAPE + "$", 0.05),
        ]

    class HardenedAuTfnRecognizer(AuTfnRecognizer):
        """TFN patterns replacing the stock set: label-prefixed
        forms at 0.7, whitespace- and hyphen-grouped forms at 0.1,
        bare 9 digits at 0.01. The stock mod-11 checksum validator
        stands unchanged.

        PROBE NOTE (TFN: prefix interaction, observed 2026-11-14
        through the real AnalyzerEngine): a ``TFN:``-prefixed match
        still carries the label letters when the stock validator
        runs, and the validator raises ValueError converting them
        to integers; nothing on the path catches it, so the run
        surfaces it as a per-column failure entry. That is the
        specified behavior: the validator is deliberately NOT
        fixed to strip the label.
        """

        PATTERNS = [
            Pattern(
                "TFN (High)",
                r"\bTFN:\s?(?:\d{3}\s\d{3}\s\d{3}|\d{3}-\d{3}-\d{3}|\d{9})\b",
                0.7,
            ),
            Pattern(
                "TFN (Medium)",
                r"\b(?:\d{3}\s\d{3}\s\d{3}|\d{3}-\d{3}-\d{3})\b",
                0.1,
            ),
            Pattern("TFN (Low)", r"\b\d{9}\b", 0.01),
        ]

    class HardenedInAadhaarRecognizer(InAadhaarRecognizer):
        """One grouped Aadhaar pattern replacing the stock bare-run
        pattern: 12 digits in three groups of 4 with at most one
        hyphen/space per boundary, guarded against embedding in a
        longer run. The stock Verhoeff validator stands unchanged."""

        PATTERNS = [
            Pattern(
                "AADHAAR (Very Weak)",
                r"(?<!\d)(?<!\d{4}[- ])\d{4}[- ]?\d{4}[- ]?\d{4}(?![- ]?\d)",
                0.01,
            ),
        ]

    class HardenedEsNieRecognizer(EsNieRecognizer):
        """Case-insensitive NIE validation: ASCII guard, then the
        stock control-letter check on the uppercased text, boosting
        only already-uppercase matches. Stock patterns stand."""

        def validate_result(self, pattern_text: str) -> bool | None:
            return _validate_uppercased(super().validate_result, pattern_text)

    class HardenedSgUenRecognizer(SgUenRecognizer):
        """Case-insensitive UEN validation: ASCII guard, then the
        stock format-dispatch checksum on the uppercased text,
        boosting only already-uppercase matches. Stock patterns
        stand."""

        def validate_result(self, pattern_text: str) -> bool | None:
            return _validate_uppercased(super().validate_result, pattern_text)

    class HardenedAuAbnRecognizer(AuAbnRecognizer):
        """Separator-tolerant ABN: the stock patterns plus a guarded
        hyphen-grouped pattern at 0.3. The stock mod-89 check
        stands, wrapped: a valid hyphenated match keeps its 0.3
        pattern score (no-decision) instead of boosting."""

        PATTERNS = [
            *AuAbnRecognizer.PATTERNS,
            Pattern(
                "ABN (Hyphenated)",
                r"(?<![\w-])(?<!\d[\s_-]+)\d{2}-\d{3}-\d{3}-\d{3}"
                r"(?![\w-])(?![\s_-]+\d)",
                0.3,
            ),
        ]

        def validate_result(self, pattern_text: str) -> bool | None:
            if not super().validate_result(pattern_text):
                return False
            return None if "-" in pattern_text else True

    class HardenedAuAcnRecognizer(AuAcnRecognizer):
        """Separator-tolerant ACN with the corrected checksum: the
        stock patterns plus a guarded hyphen-grouped pattern at
        0.3, and a replacement validator whose check digit is
        (10 - (sum mod 10)) mod 10 — the final wrap fixes the stock
        rule, which can never accept a check digit of 0. A valid
        hyphenated match keeps its 0.3 pattern score."""

        PATTERNS = [
            *AuAcnRecognizer.PATTERNS,
            Pattern(
                "ACN (Hyphenated)",
                r"(?<![\w-])(?<!\d[\s_-]+)\d{3}-\d{3}-\d{3}"
                r"(?![\w-])(?![\s_-]+\d)",
                0.3,
            ),
        ]

        def validate_result(self, pattern_text: str) -> bool | None:
            digits = re.sub(r"[^0-9]", "", pattern_text)
            if len(digits) != 9:
                return False
            weights = (8, 7, 6, 5, 4, 3, 2, 1)
            total = sum(
                int(digit) * weight
                for digit, weight in zip(digits[:8], weights, strict=True)
            )
            if (10 - (total % 10)) % 10 != int(digits[8]):
                return False
            return None if "-" in pattern_text else True

    class HardenedItVatRecognizer(ItVatCodeRecognizer):
        """Prefixed Italian VAT: the stock pattern plus an attached
        ``IT`` + 11 digits whole-word pattern at 0.1. Validation
        guards non-ASCII text, uppercases, strips one leading
        ``IT``, and delegates to the stock check."""

        PATTERNS = [
            *ItVatCodeRecognizer.PATTERNS,
            Pattern("IT Vat code (prefixed)", r"\bIT[0-9]{11}\b", 0.1),
        ]

        def validate_result(self, pattern_text: str) -> bool:
            if not pattern_text.isascii():
                return False
            upper = pattern_text.upper()
            if upper.startswith("IT"):
                upper = upper[2:]
            return super().validate_result(upper)

    class HardenedSgFinRecognizer(SgFinRecognizer):
        """Validating FIN/NRIC: stock patterns stand; a validator is
        ADDED (stock has none). The uppercased text must match the
        S/T/F/G/M shape, then the per-prefix checksum must pass.
        Success is ALWAYS no-decision: the pattern score is kept
        and only column context can raise it."""

        def validate_result(self, pattern_text: str) -> bool | None:
            upper = pattern_text.upper()
            if not upper.isascii() or _SG_FIN_SHAPE.fullmatch(upper) is None:
                return False
            prefix = upper[0]
            total = sum(
                int(digit) * weight
                for digit, weight in zip(upper[1:8], _SG_FIN_WEIGHTS, strict=True)
            )
            total += _SG_FIN_OFFSETS[prefix]
            if _SG_FIN_TABLES[prefix][total % 11] != upper[8]:
                return False
            return None

    class HardenedUsBankRecognizer(UsBankRecognizer):
        """Context-aware bank numbers: the stock pattern stands; the
        recognizer-level enhancement step eagerly boosts EVERY
        result to 1.0 when the instance context matches the passed
        context — with NO minimum-score floor, so even the 0.05
        base score boosts. Already-flagged results are skipped."""

        def enhance_using_context(
            self, text: str, raw_recognizer_results: list[Any],
            other_raw_recognizer_results: list[Any], nlp_artifacts: Any,
            context: list[str] | None = None,
        ) -> list[Any]:
            if (
                context is None
                or not self.context
                or not _context_matches(self.context, context)
            ):
                return raw_recognizer_results
            for result in raw_recognizer_results:
                metadata = result.recognition_metadata
                if metadata is None:
                    metadata = result.recognition_metadata = {}
                if metadata.get(RecognizerResult.IS_SCORE_ENHANCED_BY_CONTEXT_KEY):
                    continue
                result.score = 1.0
                metadata[RecognizerResult.IS_SCORE_ENHANCED_BY_CONTEXT_KEY] = True
            return raw_recognizer_results

    class HardenedPlPeselRecognizer(PlPeselRecognizer):
        """Guarded PESEL with the corrected checksum: the stock
        shape wrapped in digit guards (no embedding in a longer
        digit run), and a replacement validator using the
        10-complement check digit — the stock rule compares the raw
        remainder and rejects nearly every valid PESEL."""

        PATTERNS = [
            Pattern(
                PlPeselRecognizer.PATTERNS[0].name,
                f"(?<!\\d){PlPeselRecognizer.PATTERNS[0].regex}(?!\\d)",
                PlPeselRecognizer.PATTERNS[0].score,
            ),
        ]

        def validate_result(self, pattern_text: str) -> bool:
            digits = re.sub(r"[^0-9]", "", pattern_text)
            if len(digits) != 11:
                return False
            weights = (1, 3, 7, 9, 1, 3, 7, 9, 1, 3)
            total = sum(
                int(digit) * weight
                for digit, weight in zip(digits[:10], weights, strict=True)
            )
            return (10 - (total % 10)) % 10 == int(digits[10])

    class HardenedItFiscalCodeRecognizer(ItFiscalCodeRecognizer):
        """Fiscal-code validation with the None->False map: the
        stock validator returns no-decision on a checksum mismatch,
        which would let invalid codes survive at 0.3. Delegating
        with the map drops them; a stock True still boosts."""

        def validate_result(self, pattern_text: str) -> bool:
            result = super().validate_result(pattern_text)
            return False if result is None else result

    class HardenedFiPersonalIdentityCodeRecognizer(
        FiPersonalIdentityCodeRecognizer
    ):
        """Century-aware HETU validation replacing the stock check:
        ASCII guard, length edge kept at pattern score, the
        separator mapped to its century, the date validated as a
        real calendar date in the full 4-digit year (29 February
        1900 is rejected, 29 February 2000 accepted), and the
        mod-31 check character over the 9-digit number."""

        def validate_result(self, pattern_text: str) -> bool | None:
            if not pattern_text.isascii():
                return False
            upper = pattern_text.upper()
            if len(upper) != 11:
                return None
            century = _FI_CENTURIES.get(upper[6])
            if century is None:
                return False
            try:
                day = int(upper[0:2])
                month = int(upper[2:4])
                year = century + int(upper[4:6])
                number = int(upper[0:6] + upper[7:10])
            except ValueError:
                return False
            if not _valid_calendar_date(year, month, day):
                return False
            return _FI_CHECK_CHARS[number % 31] == upper[10]

    return {
        "CreditCardRecognizer": HardenedCreditCardRecognizer,
        "UrlRecognizer": HardenedUrlRecognizer,
        "IpRecognizer": HardenedIpRecognizer,
        "NhsRecognizer": HardenedNhsRecognizer,
        "DateRecognizer": HardenedDateRecognizer,
        "IbanRecognizer": HardenedIbanRecognizer,
        "EsNifRecognizer": HardenedEsNifRecognizer,
        "UsLicenseRecognizer": HardenedUsLicenseRecognizer,
        "AuTfnRecognizer": HardenedAuTfnRecognizer,
        "InAadhaarRecognizer": HardenedInAadhaarRecognizer,
        "EsNieRecognizer": HardenedEsNieRecognizer,
        "SgUenRecognizer": HardenedSgUenRecognizer,
        "AuAbnRecognizer": HardenedAuAbnRecognizer,
        "AuAcnRecognizer": HardenedAuAcnRecognizer,
        "ItVatCodeRecognizer": HardenedItVatRecognizer,
        "SgFinRecognizer": HardenedSgFinRecognizer,
        "UsBankRecognizer": HardenedUsBankRecognizer,
        "PlPeselRecognizer": HardenedPlPeselRecognizer,
        "ItFiscalCodeRecognizer": HardenedItFiscalCodeRecognizer,
        "FiPersonalIdentityCodeRecognizer": HardenedFiPersonalIdentityCodeRecognizer,
    }
