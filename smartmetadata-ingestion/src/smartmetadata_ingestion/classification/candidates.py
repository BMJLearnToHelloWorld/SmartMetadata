# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Candidate tag resolution from the catalog (design §2.4).

Candidates come from the server, never from local config: the run
lists classifications, keeps the enabled ones in the classification
filter, then lists each kept classification's tags and keeps the
enabled ones carrying recognizers. A failed fetch degrades to "no
candidates" with an error log — the run tags nothing rather than
failing on a catalog read — while a per-classification failure skips
only that classification. Results are cached per filter key for the
run: the catalog is read once, not once per entity.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.client.rest import (
    CLASSIFICATIONS_PATH,
    TAGS_PATH,
)

logger = logging.getLogger(__name__)

# Fields requested for the classification list: only what candidate
# resolution reads.
_CLASSIFICATION_FIELDS = "name,autoClassificationConfig,mutuallyExclusive"

# Fields requested for the tag list: only what candidate resolution,
# scoring, and metadata attribution read.
_TAG_FIELDS = (
    "name,fullyQualifiedName,recognizers,autoClassificationEnabled,"
    "autoClassificationPriority,classification"
)

# The default conflict strategy when a classification config does not
# name one (the autoClassificationConfig schema default).
DEFAULT_CONFLICT_RESOLUTION = "highest_confidence"

# The tag priority when a tag does not set one (the tag schema
# default, restated by the spec's conflict rule).
DEFAULT_TAG_PRIORITY = 50


@dataclass(frozen=True)
class CandidateTag:
    """One tag the engine may suggest, with its classification's rules."""

    tag_fqn: str
    name: str
    classification: str
    mutually_exclusive: bool
    minimum_confidence: float
    conflict_resolution: str
    priority: int
    recognizers: tuple[dict[str, Any], ...] = ()

    @property
    def fqn_depth(self) -> int:
        """Dot depth of the tag FQN: the most-specific tie-break."""
        return self.tag_fqn.count(".")


class CandidateStore:
    """Per-run candidate resolution with a per-filter cache.

    One store per run: the cache key space is the classification
    filter, which the workflow fixes to a single value, so the cache
    holds at most one entry in practice and never grows unbounded.
    """

    def __init__(self, client: Any) -> None:
        self._client = client
        self._cache: dict[tuple[str, ...], tuple[CandidateTag, ...]] = {}

    def candidates(self, classification_filter: tuple[str, ...]) -> tuple[CandidateTag, ...]:
        """The candidate tags for a classification filter, cached."""
        if classification_filter not in self._cache:
            self._cache[classification_filter] = self._resolve(classification_filter)
        return self._cache[classification_filter]

    def _resolve(self, classification_filter: tuple[str, ...]) -> tuple[CandidateTag, ...]:
        wanted = frozenset(classification_filter)
        try:
            classifications = list(
                self._client.iter_collection(
                    CLASSIFICATIONS_PATH,
                    extra_params={"fields": _CLASSIFICATION_FIELDS},
                )
            )
        except Exception:
            logger.error(
                "failed to list classifications; autoClassification will tag nothing this run",
                exc_info=True,
            )
            return ()
        found: list[CandidateTag] = []
        for classification in classifications:
            name = classification.get("name")
            if name not in wanted:
                continue
            config = classification.get("autoClassificationConfig") or {}
            if not config.get("enabled"):
                continue
            found.extend(self._tags_for_classification(classification, config))
        return tuple(found)

    def _tags_for_classification(
        self,
        classification: dict[str, Any],
        config: dict[str, Any],
    ) -> list[CandidateTag]:
        classification_name = str(classification.get("name"))
        parent = str(classification.get("fullyQualifiedName") or classification_name)
        try:
            tags = list(
                self._client.iter_collection(
                    TAGS_PATH,
                    extra_params={
                        "parent": parent,
                        "fields": _TAG_FIELDS,
                    },
                )
            )
        except Exception:
            logger.error(
                "failed to list tags for classification %r; skipping it",
                classification_name,
                exc_info=True,
            )
            return []
        minimum_confidence = config.get("minimumConfidence")
        candidates: list[CandidateTag] = []
        for tag in tags:
            recognizers = tag.get("recognizers") or []
            if not tag.get("autoClassificationEnabled") or not recognizers:
                continue
            priority = tag.get("autoClassificationPriority")
            candidates.append(
                CandidateTag(
                    tag_fqn=str(tag.get("fullyQualifiedName")),
                    name=str(tag.get("name")),
                    classification=classification_name,
                    mutually_exclusive=bool(classification.get("mutuallyExclusive", False)),
                    # Absent minimumConfidence reads as 0.0: the
                    # spec's rule, not the schema default.
                    minimum_confidence=(
                        float(minimum_confidence) if minimum_confidence is not None else 0.0
                    ),
                    conflict_resolution=str(
                        config.get("conflictResolution") or DEFAULT_CONFLICT_RESOLUTION
                    ),
                    priority=(int(priority) if priority is not None else DEFAULT_TAG_PRIORITY),
                    recognizers=tuple(dict(recognizer) for recognizer in recognizers),
                )
            )
        return candidates
