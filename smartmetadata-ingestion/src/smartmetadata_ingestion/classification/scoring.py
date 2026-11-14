# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Thresholds, conflict resolution, and TagLabel building (design §2.8–2.9).

Scored tags pass four gates in order: already-applied and
mutually-exclusive pre-filtering, the run threshold, the per-
classification minimum confidence (with conflict resolution inside
mutually-exclusive classifications), and the per-column cap. Survivors
become Suggested/Generated TagLabels carrying the recognizer
explanation and, when a catalog recognizer id resolves, the recognizer
metadata. Tags are suggested, never confirmed.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
from functools import partial
from typing import Any

from smartmetadata_ingestion.classification.analysis import (
    ScoredMatch,
    TagScore,
)
from smartmetadata_ingestion.classification.candidates import CandidateTag

logger = logging.getLogger(__name__)

# At most this many tags per column; overflow keeps the top-scored.
MAX_TAGS_PER_COLUMN = 10

# The score ceiling: a recognizer result never scores above 1.0, so
# the metadata score caps here rather than reporting a sum above it.
MAX_SCORE = 1.0


def resolve_column_tags(
    scores: list[TagScore],
    candidates: dict[str, CandidateTag],
    *,
    existing_tag_fqns: list[str],
    run_confidence: float,
) -> list[TagScore]:
    """The tags to suggest for one column, after all four gates.

    ``existing_tag_fqns`` are the tag FQNs already on the column.
    ``run_confidence`` is the pipeline confidence knob (0–100); the
    run threshold is ``run_confidence / 100``. The cap sorts only
    when more than ``MAX_TAGS_PER_COLUMN`` tags survive; smaller
    lists keep resolver order. Residual ties keep input order (the
    overflow sort is stable).
    """
    run_threshold = run_confidence / 100
    existing = set(existing_tag_fqns)
    # Classification FQN -> whether it is mutually exclusive. A
    # candidate's classification is the classification name, which is
    # its FQN: classifications are top-level, tags nest beneath them.
    classification_exclusive = {
        candidate.classification: candidate.mutually_exclusive
        for candidate in candidates.values()
    }
    # Parent FQNs of already-applied tags that belong to a
    # mutually-exclusive classification: candidates under one of
    # these parents are skipped. The parent is everything before the
    # LAST dot, so a nested tag's parent never equals its
    # classification FQN and is never blocked this way.
    blocked_parents: set[str] = set()
    for fqn in existing_tag_fqns:
        parent_fqn = _parent_fqn(fqn)
        if parent_fqn and classification_exclusive.get(parent_fqn):
            blocked_parents.add(parent_fqn)
    survivors: list[TagScore] = []
    for score in scores:
        candidate = candidates.get(score.tag_fqn)
        if candidate is None:
            continue
        if score.tag_fqn in existing:
            continue
        if _parent_fqn(score.tag_fqn) in blocked_parents:
            continue
        if score.score < run_threshold:
            continue
        if score.score < candidate.minimum_confidence:
            continue
        survivors.append(score)
    resolved: list[TagScore] = []
    by_classification: dict[str, list[TagScore]] = {}
    for score in survivors:
        candidate = candidates[score.tag_fqn]
        by_classification.setdefault(candidate.classification, []).append(score)
    for group in by_classification.values():
        candidate = candidates[group[0].tag_fqn]
        if not candidate.mutually_exclusive:
            resolved.extend(group)
            continue
        resolved.append(_conflict_winner(group, candidates))
    if len(resolved) > MAX_TAGS_PER_COLUMN:
        logger.warning(
            "column resolved %d tags, keeping the top %d by score",
            len(resolved),
            MAX_TAGS_PER_COLUMN,
        )
        resolved.sort(key=lambda score: score.score, reverse=True)
        resolved = resolved[:MAX_TAGS_PER_COLUMN]
    return resolved


def _parent_fqn(tag_fqn: str) -> str:
    """Everything before the last dot: the parent FQN.

    The empty string when the FQN has no dot; such a tag has no
    parent to block or be blocked by.
    """
    return tag_fqn.rsplit(".", 1)[0] if "." in tag_fqn else ""


def _key_highest_priority(
    candidates: dict[str, CandidateTag], score: TagScore
) -> tuple[int, float]:
    return (candidates[score.tag_fqn].priority, score.score)


def _key_most_specific(candidates: dict[str, CandidateTag], score: TagScore) -> tuple[int, float]:
    return (candidates[score.tag_fqn].fqn_depth, score.score)


def _key_highest_confidence(
    candidates: dict[str, CandidateTag], score: TagScore
) -> tuple[float, bool, int]:
    return (
        score.score,
        score.column_name_matched,
        candidates[score.tag_fqn].priority,
    )


# Conflict strategies to their sort keys. ``highest_confidence``
# is handled explicitly in ``_conflict_winner`` so that an unknown
# strategy value cannot silently take its tie-breaks: unknown values
# fall back to score-only selection, with a warning.
_CONFLICT_KEYS = {
    "highest_priority": _key_highest_priority,
    "most_specific": _key_most_specific,
}


def _conflict_winner(group: list[TagScore], candidates: dict[str, CandidateTag]) -> TagScore:
    """The single winner inside a mutually-exclusive classification.

    An unset strategy reads as highest_confidence (the schema
    default). An unrecognized strategy warns and selects by score
    only: on ties the first maximum in list order wins, with no
    column-name-match or priority tie-break.
    """
    candidate = candidates[group[0].tag_fqn]
    strategy = candidate.conflict_resolution or "highest_confidence"
    if strategy == "highest_confidence":
        return max(group, key=partial(_key_highest_confidence, candidates))
    key_fn = _CONFLICT_KEYS.get(strategy)
    if key_fn is not None:
        return max(group, key=partial(key_fn, candidates))
    logger.warning(
        "unknown conflict resolution strategy %r; selecting the winner by score only",
        strategy,
    )
    return max(group, key=lambda score: score.score)


def build_tag_label(score: TagScore, candidate: CandidateTag) -> dict[str, Any]:
    """A Suggested/Generated TagLabel for a resolved tag score."""
    label: dict[str, Any] = {
        "tagFQN": score.tag_fqn,
        "source": "Classification",
        "labelType": "Generated",
        "state": "Suggested",
        "reason": build_reason(score),
    }
    metadata = build_recognizer_metadata(score, candidate)
    if metadata is not None:
        label["metadata"] = {"recognizer": metadata}
    return label


def build_reason(score: TagScore) -> str:
    """The recognizer explanation for a tag score.

    Groups all results (both analyses) by recognizer; per group a
    header line stating the recognizer name, match count, and
    average score to two decimals, followed by the patterns matched
    as regexes with their scores, highest first, and a blank line.
    No results means no explanation: the empty string.

    The header and pattern templates are adopted verbatim as
    observable behavior under parent decision D-1, like the ETag
    format in ``patching.py``: they are the user-visible
    ``TagLabel.reason`` rendering, not code structure.
    """
    if not score.all_results:
        return ""
    groups: dict[str, list[ScoredMatch]] = {}
    for match in score.all_results:
        groups.setdefault(_reason_group_key(match), []).append(match)
    lines: list[str] = []
    for key in sorted(groups):
        matches = groups[key]
        name = matches[0].recognizer_name or key
        count = len(matches)
        average = sum(match.score for match in matches) / count
        lines.append(
            f"Detected by `{name}` {count} {'time' if count == 1 else 'times'} "
            f"with an average score of {average:.2f}."
        )
        patterns = _reason_patterns(matches)
        if patterns:
            lines.append("Patterns matched:")
            lines.extend(
                f"\t- `{regex}` (scored: {pattern_score:.2f})"
                for regex, pattern_score in patterns
            )
        lines.append("")
    # The final newline terminates the last group's blank line, so
    # the rendered string ends with a blank line.
    return "\n".join(lines) + "\n"


def _reason_group_key(match: ScoredMatch) -> str:
    """The reason-string group key for a result.

    The grouping key is the recognizer metadata identifier: two
    different recognizer instances sharing a name form separate
    groups, and groups sort alphabetically on the identifier, not
    the name. The identifier is fixed at construction and does not
    change when the factory later resets the recognizer's name, so
    the two must never be conflated. When the identifier is absent
    the name stands in: the construction-time identifier is always
    present in production (the engine stamps it on every result),
    so None occurs only in hand-built matches, where the name is
    the only identity available.
    """
    if match.recognizer_identifier:
        return match.recognizer_identifier
    return match.recognizer_name or "unknown"


def _reason_patterns(matches: list[ScoredMatch]) -> list[tuple[str, float]]:
    """Distinct (regex, explanation-score) pairs, score descending.

    Only results whose explanation pattern is present contribute;
    results without a pattern (NER results) count toward the group
    but yield no pattern line. Pairs with equal scores have no
    defined relative order: the sort is stable over first-seen
    order, and tests must not assert a tie order.
    """
    seen: dict[tuple[str, float], None] = {}
    for match in matches:
        if match.pattern_regex is None:
            continue
        seen.setdefault((match.pattern_regex, _explanation_score(match)), None)
    return sorted(seen, key=lambda pair: pair[1], reverse=True)


def _explanation_score(match: ScoredMatch) -> float:
    """The result's explanation score.

    ``pattern_score`` is the explanation score the analysis layer
    stamped on the match; the analysis layer must stamp the working
    score (``explanation.score``), not the original pattern score. A
    result without one falls back to its own score, the only score
    it has.
    """
    return match.pattern_score if match.pattern_score is not None else match.score


def build_recognizer_metadata(score: TagScore, candidate: CandidateTag) -> dict[str, Any] | None:
    """The recognizer metadata for a tag score, or None.

    Attributed to the winning target's highest-scoring result's
    recognizer. None when no catalog recognizer id resolves for that
    recognizer: without an id there is no metadata at all.
    """
    if not score.results:
        return None
    best = max(score.results, key=lambda match: match.score)
    recognizer_id = _resolve_recognizer_id(best.recognizer_name, candidate)
    if recognizer_id is None:
        return None
    metadata: dict[str, Any] = {
        "recognizerId": recognizer_id,
        "recognizerName": best.recognizer_name,
        "score": min(score.score, MAX_SCORE),
        "target": score.target,
    }
    patterns = _metadata_patterns(
        [match for match in score.results if match.recognizer_name == best.recognizer_name]
    )
    if patterns:
        metadata["patterns"] = [
            {"name": name, "regex": regex, "score": pattern_score}
            for name, regex, pattern_score in patterns
        ]
    return metadata


def _resolve_recognizer_id(recognizer_name: str, candidate: CandidateTag) -> str | None:
    """The catalog id of a configured recognizer by effective name.

    Predefined configs match on the configured predefined name; other
    kinds match on the catalog name. First match wins.
    """
    for config in candidate.recognizers:
        recognizer_config = config.get("recognizerConfig") or {}
        if recognizer_config.get("type") == "predefined":
            effective = recognizer_config.get("name")
        else:
            effective = config.get("name")
        if effective == recognizer_name:
            recognizer_id = config.get("id")
            return str(recognizer_id) if recognizer_id else None
    return None


def _metadata_patterns(
    matches: list[ScoredMatch],
) -> list[tuple[str | None, str, float]]:
    """Distinct (name, regex, score) triples, sorted by regex descending.

    A result contributes iff its explanation pattern is truthy; the
    pattern name is not required. The same name and regex at
    different working scores are distinct entries — only fully
    identical triples collapse.
    """
    seen: dict[tuple[str | None, str, float], None] = {}
    for match in matches:
        if not match.pattern_regex:
            continue
        seen.setdefault(
            (match.pattern_name, match.pattern_regex, _explanation_score(match)), None
        )
    return sorted(seen, key=lambda triple: triple[1], reverse=True)
