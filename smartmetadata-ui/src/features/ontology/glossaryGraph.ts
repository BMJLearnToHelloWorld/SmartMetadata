/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getGlossaryTermsByIds, listGlossaryTerms } from '@/api/glossaryTerms';
import type { Glossary } from '@/types/governance';
import type { OntologyGraphData, OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';
import type { GlossaryTerm } from '@/types/governance';

/**
 * Glossary relations graph (M-Next A3), mirroring official
 * OntologyExplorer scope=glossary (useOntologyExplorer.ts +
 * utils/graphBuilders.ts) over the product's existing endpoints — no
 * graph endpoint is invented and no graph is faked:
 *
 * - Nodes: every term of the glossary, fetched paginated via
 *   listGlossaryTerms({ glossary, limit, after }) (official caps the
 *   render at 1500 terms: fetchAllTermsForGlossary).
 * - Parent edges: parent.id -> term.id, relationType 'parentOf'
 *   (graphBuilders.ts: parent edge, label 'Parent').
 * - Related-term edges: term -> related term, relationType taken from the
 *   TermRelation entry, defaulting to 'relatedTo' (graphBuilders.ts).
 * - Cross-glossary related terms are hydrated via getGlossaryTermsByIds
 *   (GET /v1/glossaryTerms/byIds, an existing server endpoint), walked
 *   transitively up to 5 levels in batches of 100; a failed batch is
 *   remembered and not retried (official resolveRelatedTerms semantics).
 * - A related reference that still resolves to no loaded term is dropped:
 *   the graph never invents a node for it.
 */
export const MAX_GRAPH_TERMS = 1500;
const GRAPH_PAGE_SIZE = 100;
const BY_IDS_BATCH_SIZE = 100;
const MAX_RESOLUTION_DEPTH = 5;
/** Official fetchAllGlossariesPaginated concurrency for the all-glossaries scope. */
const GLOSSARY_CONCURRENCY = 8;

export function buildGlossaryGraphData(terms: readonly GlossaryTerm[]): OntologyGraphData {
  const nodes: OntologyGraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const term of terms) {
    if (!term.id || nodeIds.has(term.id)) {
      continue;
    }
    nodeIds.add(term.id);
    nodes.push({
      description: term.description,
      fullyQualifiedName: term.fullyQualifiedName,
      glossaryId: term.glossary?.id,
      group: term.glossary?.displayName || term.glossary?.name,
      id: term.id,
      label: term.displayName || term.name || term.fullyQualifiedName || term.id,
    });
  }
  const edges: OntologyGraphEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (source: string, target: string, relationType: string): void => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) {
      return;
    }
    const key = `${source}|${target}|${relationType}`;
    if (seenEdges.has(key)) {
      return;
    }
    seenEdges.add(key);
    edges.push({ id: key, source, target, relationType });
  };
  for (const term of terms) {
    if (!term.id || !nodeIds.has(term.id)) {
      continue;
    }
    if (term.parent?.id) {
      addEdge(term.parent.id, term.id, 'parentOf');
    }
    for (const related of term.relatedTerms ?? []) {
      if (related.id) {
        addEdge(term.id, related.id, related.relationType || 'relatedTo');
      }
    }
  }
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of nodes) {
    node.isolated = !connected.has(node.id);
  }
  return { nodes, edges };
}

async function resolveRelatedTerms(terms: GlossaryTerm[]): Promise<void> {
  const loadedIds = new Set(terms.map((term) => term.id).filter((id): id is string => Boolean(id)));
  const skippedIds = new Set<string>();
  for (let depth = 0; depth < MAX_RESOLUTION_DEPTH; depth++) {
    const missing = new Set<string>();
    for (const term of terms) {
      for (const related of term.relatedTerms ?? []) {
        const id = related.id;
        if (id && !loadedIds.has(id) && !skippedIds.has(id)) {
          missing.add(id);
        }
      }
    }
    const missingIds = [...missing];
    if (missingIds.length === 0) {
      return;
    }
    for (let i = 0; i < missingIds.length; i += BY_IDS_BATCH_SIZE) {
      const batch = missingIds.slice(i, i + BY_IDS_BATCH_SIZE);
      try {
        const fetched = await getGlossaryTermsByIds(batch);
        for (const term of fetched) {
          if (term.id && !loadedIds.has(term.id)) {
            terms.push(term);
            loadedIds.add(term.id);
          }
        }
      } catch {
        batch.forEach((id) => skippedIds.add(id));
      }
    }
  }
}

export async function fetchGlossaryGraphData(glossaryId: string): Promise<OntologyGraphData> {
  const terms: GlossaryTerm[] = [];
  let after: string | undefined;
  do {
    const page = await listGlossaryTerms({ glossary: glossaryId, limit: GRAPH_PAGE_SIZE, after });
    terms.push(...page.data);
    after = page.after;
  } while (after && terms.length < MAX_GRAPH_TERMS);
  const collected = terms.slice(0, MAX_GRAPH_TERMS);
  await resolveRelatedTerms(collected);
  return buildGlossaryGraphData(collected);
}

/**
 * All-glossaries scope (official useOntologyExplorer
 * fetchGraphDataFromDatabase): every glossary fetched in batches of 8
 * with Promise.allSettled — one glossary failing must not fail the
 * scope. Graphs merge by node/edge id; a term pulled in as another
 * glossary's related term keeps its first copy.
 */
export async function fetchAllGlossariesGraphData(
  glossaries: readonly Glossary[],
): Promise<OntologyGraphData> {
  const graphs: OntologyGraphData[] = [];
  for (let start = 0; start < glossaries.length; start += GLOSSARY_CONCURRENCY) {
    const batch = glossaries.slice(start, start + GLOSSARY_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((glossary) => fetchGlossaryGraphData(glossary.id)));
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        graphs.push(result.value);
      }
    }
  }
  const nodes: OntologyGraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (!nodeIds.has(node.id)) {
        nodeIds.add(node.id);
        nodes.push(node);
      }
    }
  }
  const edges: OntologyGraphEdge[] = [];
  const edgeIds = new Set<string>();
  for (const graph of graphs) {
    for (const edge of graph.edges) {
      if (!edgeIds.has(edge.id)) {
        edgeIds.add(edge.id);
        edges.push(edge);
      }
    }
  }
  return { edges, nodes };
}
