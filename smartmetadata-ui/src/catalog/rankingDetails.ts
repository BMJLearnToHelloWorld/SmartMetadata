/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SearchExplanation, SearchHit } from '@/types/api';

/**
 * Ranking details (Explore D12), ported from pin
 * `components/ExploreV1/ExploreSearchCard/ExploreSearchCard.tsx`:
 * the card section the Tools → Ranking details toggle reveals.
 *
 * The pin code renders score, ranking stages (from `matched_queries`
 * names), score reasons (parsed out of the `_explanation` tree) and
 * signal boosts (the `function_score` subtree). This module is the pure
 * half of that port — no i18n calls here, so it is unit-testable in
 * isolation; the view translates the locale keys this module returns.
 * Behaviour notes copied from the pin comments:
 * - `formatScoreValue`: 2 decimals at >= 10, else 4.
 * - Reasons keep only nodes with a positive value and a readable
 *   description, sorted by value desc, deduped, capped at 4.
 * - Elasticsearch renders the `function_score` clause as its own
 *   explanation subtree, so the tier/status/usage/vote boosts never
 *   surface in the lexical `Reason` list — they are a sibling of it.
 *   An enclosing `min of` is the `max_boost` cap, and a `sum of` above
 *   that is `boost_mode: sum`, which is what lets the score split into
 *   lexical vs signal.
 */
export const MAX_RANKING_REASONS = 4;
export const MAX_EXPLANATION_DEPTH = 8;

const FUNCTION_SCORE_PREFIX = 'function score, score mode';
const MATCH_FILTER_PREFIX = 'match filter:';
const MAX_BOOST_DESCRIPTION = 'maxboost';
const CAPPED_SIGNAL_PREFIX = 'min of';
const SUMMED_SIGNAL_PREFIX = 'sum of';
const IGNORED_EXPLANATION_FIELDS = new Set(['deleted']);

export interface RankingStage {
  name: string;
  /** Locale key for the stage label; absent for an unknown stage (render the name). */
  labelKey?: string;
  /** Locale key for the stage description. */
  descriptionKey: string;
}

export interface ScoreReason {
  description: string;
  value: number;
}

export interface SignalBoosts {
  contributions: { label: string; value: number }[];
  isCapped: boolean;
  lexicalScore: number | undefined;
  maxBoost: number | undefined;
  rawTotal: number;
  total: number;
}

export interface RankingDetails {
  score: number | undefined;
  stages: RankingStage[];
  reasons: ScoreReason[];
  boosts: SignalBoosts | undefined;
}

const RANKING_STAGE_LABEL_KEYS: Record<string, string> = {
  exactName: 'explore.rankingExactName',
  closeName: 'explore.rankingCloseName',
  structuralContext: 'explore.rankingStructuralContext',
  descriptionContext: 'explore.rankingDescriptionContext',
};

const RANKING_STAGE_DESCRIPTION_KEYS: Record<string, string> = {
  exactName: 'explore.rankingExactNameExplanation',
  closeName: 'explore.rankingCloseNameExplanation',
  structuralContext: 'explore.rankingStructuralContextExplanation',
  descriptionContext: 'explore.rankingDescriptionContextExplanation',
};

export function formatScoreValue(value: number): string {
  return value.toFixed(value >= 10 ? 2 : 4);
}

function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').trim();
}

function startsWithDescription(
  explanation: SearchExplanation | undefined,
  prefix: string,
): boolean {
  return Boolean(
    explanation &&
      normalizeDescription(explanation.description).toLowerCase().startsWith(prefix),
  );
}

function formatExplanationFieldMatch(fieldValue: string): string | undefined {
  const fieldMatch = fieldValue.match(/^([^:]+):(.+?)(?: in \d+)?$/);
  if (!fieldMatch?.[1] || !fieldMatch?.[2]) {
    return undefined;
  }
  const field = fieldMatch[1].replace(/\.keyword$/, '');
  return IGNORED_EXPLANATION_FIELDS.has(field) ? undefined : `${field}: ${fieldMatch[2]}`;
}

function getReadableExplanation(description: string): string | undefined {
  const normalizedDescription = description.replace(/\s+/g, ' ').trim();
  const weightMatch = normalizedDescription.match(/^weight\(([^)]+)\)/i);
  if (weightMatch?.[1]) {
    return formatExplanationFieldMatch(weightMatch[1]);
  }
  const exactMatch = normalizedDescription.match(/^ConstantScore\(([^)]+)\)/i);
  if (exactMatch?.[1]) {
    return formatExplanationFieldMatch(exactMatch[1]);
  }
  const signalMatch = normalizedDescription.match(/^field value function: .*doc\['([^']+)'\]/i);
  if (signalMatch?.[1]) {
    return signalMatch[1];
  }
  return undefined;
}

export function rankingStagesFromMatchedQueries(matchedQueries?: string[]): RankingStage[] {
  const stageNames = new Set<string>();
  for (const queryName of matchedQueries ?? []) {
    if (!queryName.startsWith('ranking:')) {
      continue;
    }
    const stageName = queryName.split(':')[1];
    if (stageName) {
      stageNames.add(stageName);
    }
  }
  return [...stageNames].map((stageName) => ({
    name: stageName,
    ...(RANKING_STAGE_LABEL_KEYS[stageName]
      ? { labelKey: RANKING_STAGE_LABEL_KEYS[stageName] }
      : {}),
    descriptionKey:
      RANKING_STAGE_DESCRIPTION_KEYS[stageName] ?? 'explore.rankingGenericStage',
  }));
}

export function scoreReasonsFromExplanation(explanation?: SearchExplanation): ScoreReason[] {
  const reasons: ScoreReason[] = [];
  const visitExplanation = (node: SearchExplanation | undefined, depth = 0): void => {
    if (!node || depth > MAX_EXPLANATION_DEPTH) {
      return;
    }
    const description = getReadableExplanation(node.description);
    if (node.value > 0 && description) {
      reasons.push({ description, value: node.value });
    }
    node.details?.forEach((detail) => visitExplanation(detail, depth + 1));
  };
  visitExplanation(explanation);
  const seenDescriptions = new Set<string>();
  return reasons
    .sort((left, right) => right.value - left.value)
    .filter(({ description }) => {
      if (seenDescriptions.has(description)) {
        return false;
      }
      seenDescriptions.add(description);
      return true;
    })
    .slice(0, MAX_RANKING_REASONS);
}

interface SignalSubtree {
  grandParent?: SearchExplanation;
  node: SearchExplanation;
  parent?: SearchExplanation;
}

function findSignalSubtree(root?: SearchExplanation): SignalSubtree | undefined {
  let found: SignalSubtree | undefined;
  const visit = (
    node: SearchExplanation | undefined,
    parent: SearchExplanation | undefined,
    grandParent: SearchExplanation | undefined,
    depth: number,
  ): void => {
    if (!node || found || depth > MAX_EXPLANATION_DEPTH) {
      return;
    }
    if (startsWithDescription(node, FUNCTION_SCORE_PREFIX)) {
      found = { grandParent, node, parent };
      return;
    }
    node.details?.forEach((detail) => visit(detail, node, parent, depth + 1));
  };
  visit(root, undefined, undefined, 0);
  return found;
}

function getSignalLabel(detail: SearchExplanation, baselineLabel: string): string {
  const description = normalizeDescription(detail.description);
  const fieldValueMatch = description.match(/^field value function: [^(]*\(doc\['([^']+)'\]/i);
  if (fieldValueMatch?.[1]) {
    return fieldValueMatch[1];
  }
  const filter = detail.details?.find((child) => startsWithDescription(child, MATCH_FILTER_PREFIX));
  if (!filter) {
    // The `match_all` weight every document receives, which exists so
    // `boost_mode: multiply` cannot zero out the lexical score. Naming
    // it keeps the contributions adding up to the total.
    return baselineLabel;
  }
  const filterDescription = normalizeDescription(filter.description).slice(MATCH_FILTER_PREFIX.length);
  return getReadableExplanation(filterDescription) ?? filterDescription.trim();
}

export function signalBoostsFromExplanation(
  explanation: SearchExplanation | undefined,
  baselineLabel: string,
): SignalBoosts | undefined {
  const subtree = findSignalSubtree(explanation);
  if (!subtree) {
    return undefined;
  }
  const { grandParent, node, parent } = subtree;
  const capNode = startsWithDescription(parent, CAPPED_SIGNAL_PREFIX) ? parent : undefined;
  const maxBoost = capNode?.details?.find(
    (detail) => normalizeDescription(detail.description).toLowerCase() === MAX_BOOST_DESCRIPTION,
  )?.value;
  const signalRoot = capNode ?? node;
  const combiner = capNode ? grandParent : parent;
  return {
    contributions: (node.details ?? [])
      .map((detail) => ({
        label: getSignalLabel(detail, baselineLabel),
        value: detail.value,
      }))
      .sort((left, right) => right.value - left.value),
    isCapped: maxBoost !== undefined && node.value > maxBoost,
    lexicalScore: startsWithDescription(combiner, SUMMED_SIGNAL_PREFIX)
      ? (combiner?.value ?? 0) - signalRoot.value
      : undefined,
    maxBoost,
    rawTotal: node.value,
    total: signalRoot.value,
  };
}

/**
 * The ranking section for one hit, or null when there is nothing to show
 * (pin's `RankingDetailsSection` renders null when there are no stages
 * and no score). Callers pass the hit fields only when the toggle is on,
 * exactly as pin's `SearchedData` does.
 */
export function buildRankingDetails(
  hit: Pick<SearchHit, 'score' | 'explanation' | 'matchedQueries'>,
  baselineLabel: string,
): RankingDetails | null {
  const stages = rankingStagesFromMatchedQueries(hit.matchedQueries);
  if (stages.length === 0 && hit.score === undefined) {
    return null;
  }
  return {
    score: hit.score,
    stages,
    reasons: scoreReasonsFromExplanation(hit.explanation),
    boosts: signalBoostsFromExplanation(hit.explanation, baselineLabel),
  };
}
