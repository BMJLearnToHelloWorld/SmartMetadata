/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { OntologyGraphData, OntologyGraphNode } from './ontologyGraph';
import type { OntologyHealthSummary, OntologySummary } from '@/types/ontologyDataGraph';
import { ONTOLOGY_HEALTH_PREVIEW_SIZE } from '@/types/ontologyDataGraph';

/**
 * Ontology health (official utils/governance/ontology/OntologyStudio.utils.ts:
 * getOntologyHealthSummary + the summary-endpoint composition in
 * useOntologyExplorer.ts). Ported exactly:
 *
 * - scopedTerms: term nodes (type glossaryTerm / glossaryTermIsolated /
 *   ontologyConcept) whose glossary is selected, or all when no filter.
 * - connected: endpoint of >= 1 edge (both endpoints count); edges are
 *   deduped by relation id — both directions of one stored relation share
 *   the id, so they count once.
 * - isolated sorted by label localeCompare; connectedPercent rounded.
 * - empty / zero terms -> all zeros.
 * - summary override: the endpoint's counts win over the derived ones;
 *   isolatedTerms come from the endpoint's isolatedPreview, typed
 *   'glossaryTermIsolated'; on endpoint error the caller falls back to
 *   the derived summary and hydrates unresolved labels (label === id)
 *   via getGlossaryTermsByIds.
 */

/** Official graphBuilders.ts: isTermNode. */
export function isTermNode(node: OntologyGraphNode): boolean {
  return node.type === 'glossaryTerm' || node.type === 'glossaryTermIsolated' || node.type === 'ontologyConcept';
}

export interface HealthFilters {
  glossaryIds?: string[];
}

function selectedGlossaryIds(filters: HealthFilters): Set<string> {
  return new Set((filters.glossaryIds ?? []).filter((id) => id && id !== 'all'));
}

export function scopedTerms(graphData: OntologyGraphData | null, filters: HealthFilters): OntologyGraphNode[] {
  if (!graphData) {
    return [];
  }
  const glossaryIds = selectedGlossaryIds(filters);
  return graphData.nodes.filter(
    (node) =>
      isTermNode(node) &&
      (glossaryIds.size === 0 || (node.glossaryId !== undefined && glossaryIds.has(node.glossaryId))),
  );
}

function termRelations(graphData: OntologyGraphData, termIds: Set<string>): OntologyGraphData['edges'] {
  const relationIds = new Set<string>();
  return graphData.edges.filter((edge) => {
    if (!termIds.has(edge.source) || !termIds.has(edge.target)) {
      return false;
    }
    if (edge.id) {
      if (relationIds.has(edge.id)) {
        return false;
      }
      relationIds.add(edge.id);
    }
    return true;
  });
}

export function getOntologyHealthSummary(
  graphData: OntologyGraphData | null,
  filters: HealthFilters,
): OntologyHealthSummary {
  const terms = scopedTerms(graphData, filters);
  if (!graphData || terms.length === 0) {
    return { connectedPercent: 0, connectedTermCount: 0, isolatedTerms: terms, totalTermCount: terms.length };
  }
  const termIds = new Set(terms.map((term) => term.id));
  const connectedIds = new Set<string>();
  termRelations(graphData, termIds).forEach((edge) => {
    if (termIds.has(edge.source)) {
      connectedIds.add(edge.source);
    }
    if (termIds.has(edge.target)) {
      connectedIds.add(edge.target);
    }
  });
  const isolatedTerms = terms
    .filter((term) => !connectedIds.has(term.id))
    .sort((left, right) => left.label.localeCompare(right.label));
  const connectedTermCount = terms.length - isolatedTerms.length;
  return {
    connectedPercent: Math.round((connectedTermCount / terms.length) * 100),
    connectedTermCount,
    isolatedTerms,
    totalTermCount: terms.length,
  };
}

/** Official resolveOntologyTermLabel: displayName, else name, else id. */
export function resolveOntologyTermLabel(node: OntologyGraphNode): string {
  return node.label || node.id;
}

/**
 * Compose the panel's health from the summary endpoint: the endpoint's
 * counts win; isolatedTerms come from isolatedPreview. `isolatedTermCount`
 * (the panel's override prop) is the endpoint's isolatedTerms count when
 * present, else the derived list length.
 */
export function composeOntologyHealthSummary(summary: OntologySummary): {
  health: OntologyHealthSummary;
  isolatedTermCount: number;
} {
  const isolatedTerms: OntologyGraphNode[] = (summary.isolatedPreview ?? []).map((ref) => ({
    id: ref.id ?? ref.fullyQualifiedName ?? ref.name,
    label: ref.displayName || ref.name || ref.fullyQualifiedName || ref.id || '',
    fullyQualifiedName: ref.fullyQualifiedName,
    type: 'glossaryTermIsolated',
  }));
  const connectedTermCount = summary.totalTerms - summary.isolatedTerms;
  return {
    health: {
      connectedPercent: summary.connectedPercentage,
      connectedTermCount,
      isolatedTerms,
      totalTermCount: summary.totalTerms,
    },
    isolatedTermCount: summary.isolatedTerms,
  };
}

/**
 * Fallback hydration (useOntologyExplorer.ts): when the summary endpoint
 * errors, the derived summary is used and the first 5 isolated terms
 * whose label is unresolved (label === id) are hydrated via
 * getGlossaryTermsByIds. Returns the ids to hydrate.
 */
export function isolatedTermIdsToHydrate(health: OntologyHealthSummary): string[] {
  return health.isolatedTerms
    .slice(0, ONTOLOGY_HEALTH_PREVIEW_SIZE)
    .filter((term) => term.id && resolveOntologyTermLabel(term) === term.id)
    .map((term) => term.id);
}
