# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Per-tag analysis: content and column-name scoring (design §2.7).

One analyzer per candidate tag (per language group) runs two
independent analyses: the column's sampled content and the column's
name. Content results pass through the date and named-entity patchers
plus corroboration; column-name results do not. The final score is the
maximum of the two, the winning target breaks ties toward the column
name, and tags scoring at or below the cutoff are never reported.

The Presidio engine is wrapped behind :class:`TagAnalyzer`, whose
``analyze_fn`` seams let tests drive every rule here with canned
matches and no model. All Presidio imports are function-level.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.classification.preprocessing import (
    normalize_match_span,
    spells_a_date,
)
from smartmetadata_ingestion.classification.recognizers import (
    MIN_SCORE_FOR_ENHANCEMENT,
    build_tag_recognizers,
    effective_recognizer_name,
    is_spacy_ner_recognizer,
    recognizer_config_language,
    recognizer_context_words,
    recognizer_excluded_for_column,
    recognizer_threshold,
)

logger = logging.getLogger(__name__)

# A tag scoring at or below this is not reported at all, however the
# score was reached.
REPORT_SCORE_CUTOFF = 0.1

# The maximum score a result can carry: context enhancement boosts to
# this ceiling, and the column-name sum is capped at it.
MAX_SCORE = 1.0

# Corroboration minimum (pin-style name): an uncontextualized spaCy NER
# result stands only when at least this many distinct normalized spans
# of its entity type appear across the sample.
_MIN_DISTINCT_UNCONTEXTUALIZED_NER_MATCHES = 2

# NER entity types the named-entity patcher and corroboration govern.
NER_ENTITY_TYPES = frozenset({"PERSON", "LOCATION", "NRP"})

# The entity type the date patcher governs.
DATE_TIME_ENTITY = "DATE_TIME"

# Stock Presidio recognition-metadata keys (RecognizerResult
# constants), spelled as literals so this module imports without the
# optional extra. The enhancement flag is set by recognizer-level
# context enhancement when it boosts a result; corroboration reads
# exactly this key. The name key stamps the recognizer's current name
# on every result the engine returns. The identifier key stamps the
# per-instance id fixed at construction (from the construction-time
# name plus a per-instance id): it must never be rewritten to equal
# the final name (supplement §18c).
RECOGNIZER_NAME_KEY = "recognizer_name"
RECOGNIZER_IDENTIFIER_KEY = "recognizer_identifier"
IS_SCORE_ENHANCED_BY_CONTEXT_KEY = "is_score_enhanced_by_context"

# Fallback recognizer name when recognition metadata carries neither
# a name nor an identifier (supplement §12).
UNKNOWN_RECOGNIZER_NAME = "unknown"

# The recognizer name a spaCy NER result carries in its recognition
# metadata: the factory resets predefined recognizers to the
# configured predefined name, which is "SpacyRecognizer" for the
# seed's spaCy configs.
SPACY_RECOGNIZER_NAME = "SpacyRecognizer"

# Splits joined context text and context words into tokens: maximal
# runs of characters that are not lowercase letters or digits
# (supplement §6.1 step 2). Separators include spaces, underscores,
# hyphens, dots, and all other punctuation.
_CONTEXT_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


@dataclass
class ScoredMatch:
    """One recognizer result, normalized for the spec's rules.

    ``pattern_score`` is the explanation's WORKING score — the
    post-validation/invalidation score, including native enhancement
    improvements — or None when the result carries no explanation
    (retention is on for every engine call in this chain, so in
    production the explanation is present). ``recognizer_name`` comes from recognition
    metadata only (name, then identifier, then "unknown"); it is
    never taken from the explanation, whose recognizer field can
    differ after the factory name reset. ``recognizer_identifier``
    is the metadata identifier stamped as-is: fixed at recognizer
    construction, it is never rewritten to equal the final name.
    ``context_enhanced`` is set from the Presidio enhancement flag
    in the result's recognition metadata at conversion, or by
    column-context enhancement in this module; it is what
    corroboration reads. ``from_spacy_ner`` is determined from
    recognition metadata (entity type plus the metadata recognizer
    name), never from config names.
    """

    entity_type: str
    start: int
    end: int
    score: float
    span_text: str
    recognizer_name: str
    recognizer_identifier: str | None = None
    pattern_name: str | None = None
    pattern_regex: str | None = None
    pattern_score: float | None = None
    context_enhanced: bool = False
    from_spacy_ner: bool = False


@dataclass(frozen=True)
class TagScore:
    """A tag's combined score for one column.

    ``results`` are the winning target's matches (the evidence the
    recognizer metadata describes); ``all_results`` feed the
    explanation, which is built from both analyses.
    """

    tag_fqn: str
    score: float
    target: str
    results: tuple[ScoredMatch, ...] = ()
    all_results: tuple[ScoredMatch, ...] = ()
    column_name_matched: bool = False


AnalyzeFn = Callable[[str, list[str] | None], list[ScoredMatch]]


def _resolve_context_words(config: dict[str, Any], recognizer: Any | None) -> list[str]:
    """The context words driving enhancement for one recognizer.

    A non-empty config list REPLACES the class default entirely —
    there is no merging. When the config carries none, the
    recognizer instance's own context is read: construction with no
    config context leaves the class-default words on the instance
    (supplement §6.3, §0), and 31 of the 43 seed configs carry no
    config context, so those defaults drive most enhancement.
    """
    words = recognizer_context_words(config)
    if words:
        return words
    instance_context = getattr(recognizer, "context", None)
    if isinstance(instance_context, str):
        return [instance_context]
    if isinstance(instance_context, (list, tuple)):
        return [str(word) for word in instance_context]
    return []


class TagAnalyzer:
    """One tag's Presidio analyzers for one language group.

    The full analyzer runs every usable recognizer for the tag; the
    spaCy-only analyzer (built only when the tag has spaCy NER
    recognizers) runs the second NER pass over title-cased values.
    Tests construct this directly with ``analyze_fn`` seams instead
    of engines.
    """

    def __init__(
        self,
        *,
        tag_fqn: str,
        language: str,
        pairs: list[tuple[dict[str, Any], Any]],
        engine: Any | None = None,
        spacy_engine: Any | None = None,
        analyze_fn: AnalyzeFn | None = None,
        spacy_analyze_fn: AnalyzeFn | None = None,
    ) -> None:
        self.tag_fqn = tag_fqn
        self.language = language
        self._configs_by_name: dict[str, dict[str, Any]] = {}
        self._context_words_by_name: dict[str, list[str]] = {}
        for config, recognizer in pairs:
            # First config wins per effective name: duplicate names
            # within one language group are pathological, and the
            # language filter already separates the seed's. The
            # enhancement context follows the same winner.
            name = effective_recognizer_name(config)
            if name not in self._configs_by_name:
                self._configs_by_name[name] = config
                self._context_words_by_name[name] = _resolve_context_words(config, recognizer)
        self._engine = engine
        self._spacy_engine = spacy_engine
        self._analyze_fn = analyze_fn
        self._spacy_analyze_fn = spacy_analyze_fn

    def analyze_text(self, text: str, context_tokens: list[str] | None) -> list[ScoredMatch]:
        """Analyze text with every recognizer for the tag.

        ``context_tokens`` is None for the column-name pass: the leaf
        name is analyzed with no context list at all (supplement §9),
        so no column-context boost can fire there.
        """
        if self._analyze_fn is not None:
            return self._analyze_fn(text, context_tokens)
        if self._engine is None:
            return []
        return self._run_engine(self._engine, text, context_tokens)

    def analyze_text_spacy_only(
        self, text: str, context_tokens: list[str] | None
    ) -> list[ScoredMatch]:
        """Analyze text with only the tag's spaCy NER recognizers."""
        if self._spacy_analyze_fn is not None:
            return self._spacy_analyze_fn(text, context_tokens)
        if self._spacy_engine is None:
            return []
        return self._run_engine(self._spacy_engine, text, context_tokens)

    def config_for(self, recognizer_name: str) -> dict[str, Any] | None:
        """The catalog config behind a result's recognizer name."""
        return self._configs_by_name.get(recognizer_name)

    def context_words_for(self, recognizer_name: str) -> list[str]:
        """The context words driving enhancement for a result's
        recognizer: the config list when the config carries one, else
        the recognizer instance's own (class-default) context."""
        return self._context_words_by_name.get(recognizer_name, [])

    def recognizer_target(self, recognizer_name: str) -> str | None:
        """The analysis target a result's recognizer declares.

        None when the name resolves to no configured recognizer: the
        attribution gate in ``_apply_decorators`` decides those, so
        target filters pass them through instead of dropping them
        silently. An unset target means content (the schema default).
        """
        config = self._configs_by_name.get(recognizer_name)
        if config is None:
            return None
        return str(config.get("target") or "content")

    def recognizer_targets_column_name(self, recognizer_name: str) -> bool:
        """Whether a result's recognizer targets column names."""
        return self.recognizer_target(recognizer_name) == "column_name"

    def _run_engine(
        self, engine: Any, text: str, context_tokens: list[str] | None
    ) -> list[ScoredMatch]:
        # Decision-process retention (supplement §19.5): without it
        # the engine strips every explanation, emptying the reason
        # pattern lines (§17) and the metadata pattern triples
        # (§12). Both engine paths funnel through here.
        results = engine.analyze(
            text,
            language=self.language,
            context=context_tokens,
            return_decision_process=True,
        )
        return [self._to_match(result, text) for result in results]

    def _to_match(self, result: Any, text: str) -> ScoredMatch:
        explanation = result.analysis_explanation
        pattern_name = None
        pattern_regex = None
        pattern_score = None
        if explanation is not None:
            pattern_name = explanation.pattern_name
            pattern_regex = explanation.pattern
            # The WORKING explanation score (supplement §12): updated
            # by validation/invalidation and by native enhancement,
            # unlike the immutable original pattern score.
            pattern_score = explanation.score
        metadata = result.recognition_metadata or {}
        if not isinstance(metadata, dict):
            metadata = {}
        metadata_name = str(metadata.get(RECOGNIZER_NAME_KEY) or "")
        identifier = metadata.get(RECOGNIZER_IDENTIFIER_KEY)
        identifier = str(identifier) if identifier else None
        # The recognizer name comes from recognition metadata only
        # (supplement §12): metadata name, then identifier, then
        # "unknown". The explanation's recognizer field is never
        # used: it holds the name at result-creation time and can
        # differ after the factory name reset.
        name = metadata_name or identifier or UNKNOWN_RECOGNIZER_NAME
        entity_type = str(result.entity_type)
        return ScoredMatch(
            entity_type=entity_type,
            start=int(result.start),
            end=int(result.end),
            score=float(result.score),
            span_text=text[int(result.start) : int(result.end)],
            recognizer_name=name,
            recognizer_identifier=identifier,
            pattern_name=pattern_name,
            pattern_regex=pattern_regex,
            pattern_score=(float(pattern_score) if pattern_score is not None else None),
            context_enhanced=bool(metadata.get(IS_SCORE_ENHANCED_BY_CONTEXT_KEY)),
            from_spacy_ner=(
                entity_type in NER_ENTITY_TYPES and metadata_name == SPACY_RECOGNIZER_NAME
            ),
        )


def build_tag_analyzer(
    tag_fqn: str,
    configs: list[dict[str, Any]],
    language: str,
) -> TagAnalyzer | None:
    """Build one tag's analyzers for one language group, or None.

    None means the tag has no usable recognizer in this group. An
    engine is NEVER built over an empty registry: Presidio would fill
    it with every predefined recognizer, suggesting tags from
    recognizers the catalog never configured.
    """
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry

    from smartmetadata_ingestion.classification.models import get_nlp_engine

    pairs = build_tag_recognizers(configs, tag_fqn=tag_fqn, language=language)
    if not pairs:
        return None
    nlp_engine = get_nlp_engine(language)
    registry = RecognizerRegistry(
        recognizers=[recognizer for _config, recognizer in pairs],
        supported_languages=[language],
    )
    engine = AnalyzerEngine(
        registry=registry,
        nlp_engine=nlp_engine,
        supported_languages=[language],
    )
    spacy_pairs = [pair for pair in pairs if is_spacy_ner_recognizer(pair[0])]
    spacy_engine = None
    if spacy_pairs:
        spacy_registry = RecognizerRegistry(
            recognizers=[recognizer for _config, recognizer in spacy_pairs],
            supported_languages=[language],
        )
        spacy_engine = AnalyzerEngine(
            registry=spacy_registry,
            nlp_engine=nlp_engine,
            supported_languages=[language],
        )
    return TagAnalyzer(
        tag_fqn=tag_fqn,
        language=language,
        pairs=pairs,
        engine=engine,
        spacy_engine=spacy_engine,
    )


def group_configs_by_language(
    configs: list[dict[str, Any]], run_language: str
) -> dict[str, list[dict[str, Any]]]:
    """Partition recognizer configs into language groups for a run.

    A fixed run language keeps only recognizers declaring that
    language or ``any``. The run language ``any`` groups recognizers
    by their declared language, with ``any``-language recognizers
    under the English engine.
    """
    if run_language != "any":
        participating = [
            config
            for config in configs
            if recognizer_config_language(config) in ("any", run_language)
        ]
        return {run_language: participating} if participating else {}
    groups: dict[str, list[dict[str, Any]]] = {}
    for config in configs:
        language = recognizer_config_language(config)
        groups.setdefault("en" if language == "any" else language, []).append(config)
    return groups


def is_all_caps_value(text: str) -> bool:
    """Whether a value qualifies for the second NER pass: all-caps
    alphabetic text without digits, title-cased for spaCy, whose NER
    misses shouting case."""
    return (
        any(char.isalpha() for char in text)
        and text == text.upper()
        and not any(char.isdigit() for char in text)
    )


def analyze_column(
    analyzers: list[TagAnalyzer],
    texts: list[str],
    *,
    column_dotted_path: str,
    column_tokens: list[str],
    entity_type: str,
    entity_fqn: str,
    content_valid: bool,
) -> TagScore | None:
    """Score one tag for one column across its language groups.

    Content analysis runs only over valid content; column-name
    analysis always runs (the column has an FQN). Matches union
    across groups before the combination rule applies.
    """
    if not analyzers:
        return None
    tag_fqn = analyzers[0].tag_fqn
    content_matches: list[ScoredMatch] = []
    column_matches: list[ScoredMatch] = []
    for analyzer in analyzers:
        if content_valid:
            content_matches.extend(
                _analyze_content(
                    analyzer,
                    texts,
                    column_tokens=column_tokens,
                    entity_type=entity_type,
                    entity_fqn=entity_fqn,
                    column_dotted_path=column_dotted_path,
                )
            )
        column_matches.extend(
            _analyze_column_name(
                analyzer,
                column_dotted_path,
                entity_type=entity_type,
                entity_fqn=entity_fqn,
            )
        )
    return _combine(tag_fqn, content_matches, column_matches)


def _analyze_content(
    analyzer: TagAnalyzer,
    texts: list[str],
    *,
    column_tokens: list[str],
    entity_type: str,
    entity_fqn: str,
    column_dotted_path: str,
) -> list[ScoredMatch]:
    matches: list[ScoredMatch] = []
    for text in texts:
        matches.extend(analyzer.analyze_text(text, column_tokens))
        if is_all_caps_value(text):
            # The second NER pass keeps spaCy named-entity results
            # only (supplement §15): a Spacy config's DATE_TIME or
            # ORGANIZATION results never survive it.
            second_pass = analyzer.analyze_text_spacy_only(text.title(), column_tokens)
            matches.extend(match for match in second_pass if _is_spacy_named_entity(match))
    # Content analysis runs only content-targeted recognizers. The
    # seed carries zero column_name-targeted recognizers, so the
    # filter is moot on seed data today — but routing must still be
    # explicit, and unattributed names pass through to the
    # attribution gate in _apply_decorators instead of vanishing.
    matches = [
        match
        for match in matches
        if analyzer.recognizer_target(match.recognizer_name) in (None, "content")
    ]
    matches = _apply_decorators(
        analyzer,
        matches,
        column_tokens=column_tokens,
        entity_type=entity_type,
        entity_fqn=entity_fqn,
        column_dotted_path=column_dotted_path,
    )
    matches = _apply_date_patcher(matches)
    matches = _apply_ner_digit_patcher(matches)
    return _apply_corroboration(matches)


def _analyze_column_name(
    analyzer: TagAnalyzer,
    column_dotted_path: str,
    *,
    entity_type: str,
    entity_fqn: str,
) -> list[ScoredMatch]:
    # The column-name pass analyzes the LEAF name only, with no
    # context list (supplement §9): parent segments are never part
    # of the analyzed text, and no context boost can fire. The
    # dotted path joins segment names with dots, so the leaf is its
    # last segment; a leaf name containing a literal dot is
    # indistinguishable in this representation, which the column
    # walk and sample mapping share.
    leaf_name = column_dotted_path.rsplit(".", 1)[-1]
    matches = [
        match
        for match in analyzer.analyze_text(leaf_name, None)
        if analyzer.recognizer_target(match.recognizer_name) in (None, "column_name")
    ]
    # No patchers and no corroboration for column-name analysis: the
    # name is one string, not a sample, and patchers judge content.
    return _apply_decorators(
        analyzer,
        matches,
        column_tokens=None,
        entity_type=entity_type,
        entity_fqn=entity_fqn,
        column_dotted_path=column_dotted_path,
    )


def _apply_decorators(
    analyzer: TagAnalyzer,
    matches: list[ScoredMatch],
    *,
    column_tokens: list[str] | None,
    entity_type: str,
    entity_fqn: str,
    column_dotted_path: str,
) -> list[ScoredMatch]:
    """The per-recognizer decorators: exception exclusion, context
    enhancement, then the threshold filter, in that order."""
    kept: list[ScoredMatch] = []
    for match in matches:
        config = analyzer.config_for(match.recognizer_name)
        if config is None:
            # Unattributed results are dropped, loudly. With no
            # config there is no exception list to check and no
            # threshold to apply, so keeping one would suggest a
            # tag from a recognizer the catalog never configured.
            # Production occurrence: names come from recognition
            # metadata, which the engine stamps from each registry
            # recognizer's current (factory-reset) name — and the
            # registry holds only configured recognizers, so names
            # resolve today. Retention keeps explanations attached
            # but cannot yield unknown names: identity resolves
            # through recognition metadata, never the explanation. The proof
            # depends on every recognizer stamping its own current
            # name; a result pre-stamped with a foreign name (e.g.
            # from a future analyze-level override remapping
            # results) would break it, so dropping stays
            # fail-closed.
            logger.warning(
                "dropping result from unconfigured recognizer %r for tag %s "
                "(entity type %s); no exception list or threshold applies",
                match.recognizer_name,
                analyzer.tag_fqn,
                match.entity_type,
            )
            continue
        if recognizer_excluded_for_column(
            config,
            entity_type=entity_type,
            entity_fqn=entity_fqn,
            column_dotted_path=column_dotted_path,
        ):
            continue
        _enhance_match(match, analyzer.context_words_for(match.recognizer_name), column_tokens)
        threshold = recognizer_threshold(config)
        if threshold is not None and match.score < threshold:
            continue
        kept.append(match)
    return kept


def context_matches(context_words: list[str], context_tokens: list[str]) -> bool:
    """Whether any context word matches the analysis context
    (supplement §6.1).

    The tokens are joined with spaces and lowercased; a token set is
    built by splitting that text on non-letter/non-digit runs. Each
    word is lowercased whole (never camel-split) and split the same
    way: a one-part word matches by whole-token membership, a
    multi-part word matches only as the literal lowercased word
    (separators literal) inside the joined text, guarded against
    adjoining word characters. Underscore-joined words therefore
    effectively never match split column text, while space-joined
    phrases do; camelCase words match only an all-lowercase
    single-token column name. A word with no letter/digit parts
    matches nothing.

    This intentionally duplicates ``recognizers._context_matches``:
    the UsBank override needs the rule in the recognizers module,
    and importing this copy from there would be circular. Keep the
    two implementations behaviorally identical; both are locked by
    their own §6.1 tests.
    """
    joined = " ".join(context_tokens).lower()
    token_set = {part for part in _CONTEXT_TOKEN_SPLIT.split(joined) if part}
    for word in context_words:
        lowered = word.lower()
        parts = [part for part in _CONTEXT_TOKEN_SPLIT.split(lowered) if part]
        if not parts:
            continue
        if len(parts) == 1:
            if parts[0] in token_set:
                return True
            continue
        pattern = ""
        if lowered[0].isalnum() or lowered[0] == "_":
            pattern += r"(?<!\w)"
        pattern += re.escape(lowered)
        if lowered[-1].isalnum() or lowered[-1] == "_":
            pattern += r"(?!\w)"
        if re.search(pattern, joined):
            return True
    return False


def _enhance_match(
    match: ScoredMatch, context_words: list[str], column_tokens: list[str] | None
) -> None:
    """Boost a match to MAX_SCORE when a context word matches the
    split column name, under the supplement §6.4 guards: no context
    list passed (the column-name pass) or no context words means no
    boost; an already context-enhanced result is never re-boosted;
    results below the enhancement threshold are never boosted. A
    boost sets the flag corroboration reads."""
    if column_tokens is None or not context_words:
        return
    if match.context_enhanced:
        return
    if match.score < MIN_SCORE_FOR_ENHANCEMENT:
        return
    if context_matches(context_words, column_tokens):
        match.score = MAX_SCORE
        match.context_enhanced = True


def _apply_date_patcher(matches: list[ScoredMatch]) -> list[ScoredMatch]:
    """Drop DATE_TIME results whose span does not spell a date."""
    return [
        match
        for match in matches
        if match.entity_type != DATE_TIME_ENTITY or spells_a_date(match.span_text)
    ]


def _apply_ner_digit_patcher(matches: list[ScoredMatch]) -> list[ScoredMatch]:
    """Drop PERSON/LOCATION/NRP results whose span contains a digit:
    names and places do not contain digits, so such spans are NER
    misfires on codes and identifiers."""
    return [
        match
        for match in matches
        if match.entity_type not in NER_ENTITY_TYPES
        or not any(char.isdigit() for char in match.span_text)
    ]


def _apply_corroboration(matches: list[ScoredMatch]) -> list[ScoredMatch]:
    """Drop uncontextualized spaCy NER results without corroboration.

    An uncontextualized result stands only when its entity type has at
    least two distinct normalized matches across the sample. Pattern
    results, vetted results, and context-enhanced NER results stand
    alone and pass through untouched.
    """
    distinct: dict[str, set[str]] = {}
    for match in matches:
        if _needs_corroboration(match):
            distinct.setdefault(match.entity_type, set()).add(normalize_match_span(match.span_text))
    corroborated = {
        entity_type
        for entity_type, spans in distinct.items()
        if len(spans) >= _MIN_DISTINCT_UNCONTEXTUALIZED_NER_MATCHES
    }
    return [
        match
        for match in matches
        if not _needs_corroboration(match) or match.entity_type in corroborated
    ]


def _is_spacy_named_entity(match: ScoredMatch) -> bool:
    """Whether a match is a spaCy named-entity result: a
    PERSON/LOCATION/NRP result whose recognition metadata named the
    spaCy recognizer (carried on the match as ``from_spacy_ner``)."""
    return match.from_spacy_ner and match.entity_type in NER_ENTITY_TYPES


def _needs_corroboration(match: ScoredMatch) -> bool:
    return _is_spacy_named_entity(match) and not match.context_enhanced


def _combine(
    tag_fqn: str,
    content_matches: list[ScoredMatch],
    column_matches: list[ScoredMatch],
) -> TagScore | None:
    content_score = max((match.score for match in content_matches), default=0.0)
    column_score = min(sum(match.score for match in column_matches), MAX_SCORE)
    final_score = max(content_score, column_score)
    if final_score <= REPORT_SCORE_CUTOFF:
        return None
    if column_matches and column_score >= content_score:
        target = "column_name"
        results = column_matches
    else:
        target = "content"
        results = content_matches
    return TagScore(
        tag_fqn=tag_fqn,
        score=final_score,
        target=target,
        results=tuple(results),
        all_results=tuple([*content_matches, *column_matches]),
        column_name_matched=bool(column_matches),
    )


__all__ = [
    "DATE_TIME_ENTITY",
    "MAX_SCORE",
    "NER_ENTITY_TYPES",
    "REPORT_SCORE_CUTOFF",
    "ScoredMatch",
    "TagAnalyzer",
    "TagScore",
    "analyze_column",
    "build_tag_analyzer",
    "context_matches",
    "group_configs_by_language",
    "is_all_caps_value",
]
