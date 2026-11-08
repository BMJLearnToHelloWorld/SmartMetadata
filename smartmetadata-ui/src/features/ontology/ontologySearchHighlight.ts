/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';

/**
 * Graph search highlight (official components/OntologyExplorer/utils/
 * graphSearchHighlight.ts: computeGraphSearchHighlight, Vue port).
 * Single search box: highlights nodes, groups (ontologies / glossaries),
 * and relation types whose text matches. Entity matches remain the only
 * bright nodes while their incident edges retain context; relation
 * matches also highlight both edge endpoints.
 */

/** Official normalize: lower-case, NFD, diacritics stripped. */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function textMatches(query: string, value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return normalizeSearchText(value).includes(query);
}

export interface SearchHighlightGroup {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
}

export interface SearchHighlightRelationType {
  name: string;
  displayName?: string;
  description?: string;
}

export interface GraphSearchHighlight {
  active: true;
  highlightedNodeIds: readonly string[];
  highlightedEdgeKeys: readonly string[];
  highlightedGroupIds: readonly string[];
}

/** Official ontologyEdgeKey: from::to::relationType. */
export function ontologyEdgeKey(edge: Pick<OntologyGraphEdge, 'source' | 'target' | 'relationType'>): string {
  return `${edge.source}::${edge.target}::${edge.relationType}`;
}

export function computeOntologySearchHighlight(
  nodes: readonly OntologyGraphNode[],
  edges: readonly OntologyGraphEdge[],
  rawQuery: string,
  groups: readonly SearchHighlightGroup[],
  relationTypes: readonly SearchHighlightRelationType[] = [],
): GraphSearchHighlight | null {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query) {
    return null;
  }

  const entityMatchedNodeIds = new Set<string>();
  const highlightedGroupIds = new Set<string>();

  for (const node of nodes) {
    if (
      textMatches(query, node.id) ||
      textMatches(query, node.label) ||
      textMatches(query, node.fullyQualifiedName) ||
      textMatches(query, node.description)
    ) {
      entityMatchedNodeIds.add(node.id);
    }
  }

  for (const group of groups) {
    if (
      group.id &&
      (textMatches(query, group.name) ||
        textMatches(query, group.displayName) ||
        textMatches(query, group.fullyQualifiedName) ||
        textMatches(query, group.description))
    ) {
      highlightedGroupIds.add(group.id);
    }
  }
  for (const node of nodes) {
    const groupId = node.ontologyId ?? node.glossaryId;
    if (groupId && highlightedGroupIds.has(groupId)) {
      entityMatchedNodeIds.add(node.id);
    }
  }

  const matchedRelationNames = new Set<string>();
  for (const relationType of relationTypes) {
    if (
      textMatches(query, relationType.name) ||
      textMatches(query, relationType.displayName) ||
      textMatches(query, relationType.description)
    ) {
      matchedRelationNames.add(relationType.name);
    }
  }

  const relationMatchedEdgeKeys = new Set<string>();
  for (const edge of edges) {
    if (matchedRelationNames.has(edge.relationType) || textMatches(query, edge.relationType) || textMatches(query, edge.label)) {
      relationMatchedEdgeKeys.add(ontologyEdgeKey(edge));
    }
  }

  const entityIncidentEdgeKeys = new Set<string>();
  for (const edge of edges) {
    if (entityMatchedNodeIds.has(edge.source) || entityMatchedNodeIds.has(edge.target)) {
      entityIncidentEdgeKeys.add(ontologyEdgeKey(edge));
    }
  }

  const highlightedEdgeKeys = new Set<string>([...relationMatchedEdgeKeys, ...entityIncidentEdgeKeys]);
  const highlightedNodeIds = new Set<string>(entityMatchedNodeIds);
  for (const edge of edges) {
    if (relationMatchedEdgeKeys.has(ontologyEdgeKey(edge))) {
      highlightedNodeIds.add(edge.source);
      highlightedNodeIds.add(edge.target);
    }
  }

  return {
    active: true,
    highlightedEdgeKeys: [...highlightedEdgeKeys].sort((a, b) => a.localeCompare(b)),
    highlightedGroupIds: [...highlightedGroupIds].sort((a, b) => a.localeCompare(b)),
    highlightedNodeIds: [...highlightedNodeIds].sort((a, b) => a.localeCompare(b)),
  };
}
