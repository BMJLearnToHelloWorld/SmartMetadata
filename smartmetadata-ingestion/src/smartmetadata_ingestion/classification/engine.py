# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Classification engine: per-entity orchestration (design §2.1, §2.10).

The engine wires candidates, analyzers, and scoring for one run. It is
constructed cheaply and warmed explicitly: warm-up fetches the
candidates, proves the needed spaCy models installed (failing loudly
before any entity work, so no model is ever downloaded at run time),
and builds one analyzer per candidate tag per language group. With no
candidates the engine tags nothing and loads no model. Per-column
exceptions are collected as failures and never abort the remaining
columns.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

import logging
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from smartmetadata_ingestion.classification.analysis import (
    TagAnalyzer,
    analyze_column,
    build_tag_analyzer,
    group_configs_by_language,
)
from smartmetadata_ingestion.classification.candidates import (
    CandidateStore,
    CandidateTag,
)
from smartmetadata_ingestion.classification.columns import (
    LeafColumn,
    column_fqn,
    iter_leaf_columns,
    map_sample_to_columns,
)
from smartmetadata_ingestion.classification.models import (
    model_name_for_language,
    require_models_installed,
)
from smartmetadata_ingestion.classification.preprocessing import (
    MAX_VALUE_CHARS,
    column_content_valid,
    prepare_column_values,
    split_column_name,
)
from smartmetadata_ingestion.classification.scoring import (
    build_tag_label,
    resolve_column_tags,
)
from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)

# The classification filter is fixed to the single name PII: only the
# PII classification can supply candidate tags. One constant, at the
# construction site, never repeated at call sites.
PII_CLASSIFICATION_FILTER: tuple[str, ...] = ("PII",)

AnalyzerFactory = Callable[[str, list[dict[str, Any]], str], TagAnalyzer | None]


@dataclass(frozen=True)
class ColumnTag:
    """One suggested label for one column."""

    column_fqn: str
    tag_label: dict[str, Any]


@dataclass(frozen=True)
class ColumnFailure:
    """A column whose classification failed without aborting the run.

    The traceback is captured where the exception was caught, so the
    step entry the workflow records carries the real failure site —
    never a traceback fabricated at the recording site.
    """

    column_fqn: str
    message: str
    stack_trace: str = ""


@dataclass
class EntityClassification:
    """The classification outcome for one entity."""

    column_tags: list[ColumnTag] = field(default_factory=list)
    failures: list[ColumnFailure] = field(default_factory=list)


def resolve_store_sample_data(
    *,
    pipeline_store: bool,
    settings_reader: Callable[[], dict[str, Any] | None] | None,
) -> bool:
    """Whether sampled rows persist for this run (design §2.3).

    The pipeline flag ANDs with the server profiler setting when the
    setting exists; when the server setting is absent or unreadable,
    the pipeline flag alone decides. This differs deliberately from
    the messaging metadata pipeline's double gate, which fails
    closed on unreadable settings because it governs fetching: here
    fetching is unconditional (the pipeline's existence is the
    intent) and only persisting is gated.
    """
    if not pipeline_store:
        return False
    if settings_reader is None:
        return True
    settings = settings_reader()
    if settings is None:
        return True
    config_value = settings.get("configValue")
    sample_data_config = (
        config_value.get("sampleDataConfig") if isinstance(config_value, dict) else None
    )
    if not isinstance(sample_data_config, dict):
        return True
    if sample_data_config.get("storeSampleData") is False:
        return False
    return True


class ClassificationEngine:
    """The PII processor for one autoClassification run."""

    def __init__(
        self,
        client: Any,
        *,
        language: str,
        confidence: float,
        classification_filter: tuple[str, ...] = PII_CLASSIFICATION_FILTER,
        candidate_store: CandidateStore | None = None,
        analyzer_factory: AnalyzerFactory | None = None,
    ) -> None:
        self._language = language
        self._confidence = confidence
        self._classification_filter = classification_filter
        self._candidate_store = candidate_store or CandidateStore(client)
        self._analyzer_factory = analyzer_factory or build_tag_analyzer
        # Only the production factory builds real engines, so only it
        # needs the model warm-up check; injected stub factories
        # analyze without models.
        self._needs_models = analyzer_factory is None
        self._warmed = False
        self._candidates_by_fqn: dict[str, CandidateTag] = {}
        self._analyzers: dict[str, list[TagAnalyzer]] = {}

    def warm_up(self) -> None:
        """Fetch candidates, prove models present, build analyzers.

        The warmed flag is set only after the whole build succeeds: a
        warm-up failure must leave the engine unwarmed, so a retry
        re-runs the fetch and build instead of silently tagging
        nothing with empty analyzers.
        """
        if self._warmed:
            return
        candidates = self._candidate_store.candidates(self._classification_filter)
        self._candidates_by_fqn = {candidate.tag_fqn: candidate for candidate in candidates}
        if not candidates:
            logger.info("no enabled autoClassification candidates; the run will tag nothing")
            self._warmed = True
            return
        grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
        for candidate in candidates:
            grouped[candidate.tag_fqn] = group_configs_by_language(
                list(candidate.recognizers), self._language
            )
        if self._needs_models:
            models = sorted(
                {
                    model_name_for_language(language)
                    for groups in grouped.values()
                    for language in groups
                }
            )
            require_models_installed(models)
        for candidate in candidates:
            analyzers = []
            for language, configs in grouped[candidate.tag_fqn].items():
                analyzer = self._analyzer_factory(candidate.tag_fqn, configs, language)
                if analyzer is not None:
                    analyzers.append(analyzer)
            if analyzers:
                self._analyzers[candidate.tag_fqn] = analyzers
        self._warmed = True

    @property
    def has_candidates(self) -> bool:
        """Whether any tag has a usable analyzer after warm-up."""
        return bool(self._analyzers)

    def classify_entity(
        self,
        entity: dict[str, Any],
        entity_type: str,
        rows: list[dict[str, Any]] | None,
    ) -> EntityClassification:
        """Classify one entity's columns from its sample rows.

        ``rows`` is None for topics: messages carry no field
        attribution, so topic columns classify by name only. Per-
        column exceptions become failures; they never abort the
        remaining columns.
        """
        outcome = EntityClassification()
        entity_fqn = str(entity.get("fullyQualifiedName") or "")
        if not entity_fqn:
            raise WorkflowError("entity has no fullyQualifiedName")
        leaves = iter_leaf_columns(entity, entity_type)
        if not leaves or not self._analyzers:
            return outcome
        sample_map = map_sample_to_columns(rows or [], leaves)
        if sample_map.unmapped_fields:
            logger.warning(
                "sample fields with no catalog column on %s (values never analyzed): %s",
                entity_fqn,
                ", ".join(sample_map.unmapped_fields),
            )
        for leaf in leaves:
            if sample_map.has_fields and leaf.dotted_path not in sample_map.mapped:
                # Sampled-fields-authoritative: unmapped columns are
                # skipped entirely, not even by name.
                continue
            values = sample_map.mapped.get(leaf.dotted_path, [])
            try:
                self._classify_column(leaf, entity_fqn, entity_type, values, outcome)
            except Exception as exc:
                outcome.failures.append(
                    ColumnFailure(
                        column_fqn=column_fqn(entity_fqn, leaf.dotted_path),
                        message=str(exc),
                        stack_trace="".join(
                            traceback.format_exception(type(exc), exc, exc.__traceback__)
                        ),
                    )
                )
                logger.warning(
                    "classification failed for column %s.%s: %s",
                    entity_fqn,
                    leaf.dotted_path,
                    exc,
                    exc_info=True,
                )
        return outcome

    def _classify_column(
        self,
        leaf: LeafColumn,
        entity_fqn: str,
        entity_type: str,
        values: list[Any],
        outcome: EntityClassification,
    ) -> None:
        prepared = prepare_column_values(values)
        if prepared.truncated:
            logger.warning(
                "%d sample value(s) for column %s.%s truncated to %d chars",
                prepared.truncated,
                entity_fqn,
                leaf.dotted_path,
                MAX_VALUE_CHARS,
            )
        content_valid = column_content_valid(prepared.texts)
        # Content context comes from the LEAF name only: splitting the
        # dotted path would let parent segments boost or suppress this
        # column's matches. The exact leaf name is read from the column
        # object, the same derivation the column walk uses — unlike the
        # column-name pass, which only ever sees the dotted path.
        tokens = split_column_name(str(leaf.column.get("name") or ""))
        scores = []
        for _tag_fqn, analyzers in self._analyzers.items():
            score = analyze_column(
                analyzers,
                prepared.texts,
                column_dotted_path=leaf.dotted_path,
                column_tokens=tokens,
                entity_type=entity_type,
                entity_fqn=entity_fqn,
                content_valid=content_valid,
            )
            if score is not None:
                scores.append(score)
        resolved = resolve_column_tags(
            scores,
            self._candidates_by_fqn,
            existing_tag_fqns=list(leaf.existing_tag_fqns),
            run_confidence=self._confidence,
        )
        for score in resolved:
            outcome.column_tags.append(
                ColumnTag(
                    column_fqn=column_fqn(entity_fqn, leaf.dotted_path),
                    tag_label=build_tag_label(score, self._candidates_by_fqn[score.tag_fqn]),
                )
            )
