/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getGlossaryTerm, getGlossaryTermsAssetCounts } from '@/api/glossaryTerms';
import type { EntityRef } from '@/types/api';
import {
  ASSET_BINDING_EDGE_KIND,
  ASSET_RELATION_TYPE,
  DATA_MODE_ASSET_MAX_LOAD,
} from '@/types/ontologyDataGraph';
import { ontologyAssetNode } from './nativeDataGraph';
import type { OntologyGraphData, OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';
import { buildGlossaryGraphData, fetchGlossaryGraphData, resolveRelatedTerms } from './glossaryGraph';

/**
 * Term-scope relations graph (B-15 Lane C), mirroring official
 * OntologyExplorer scope='term' (useOntologyExplorer.ts +
 * useOntologyGraphDerived.ts + GlossaryTermUtils.tsx
 * buildRelationsGraphTab):
 *
 * - Load: the focal term's whole glossary via fetchGlossaryGraphData
 *   (paginated list + resolveRelatedTerms transitively to depth 5),
 *   exactly the term branch's fetchAllGlossaryData(termGlossaryId)
 *   path; asset counts come from getGlossaryTermsAssetCounts(parent =
 *   glossary FQN), best-effort (a counts failure leaves counts empty,
 *   the graph still renders — pin fetchTermAssetCounts semantics).
 * - Display: the one-hop neighbourhood of the focal term only
 *   (useOntologyGraphDerived.ts: the term filter keeps edges touching
 *   entityId plus their endpoint nodes). The five-deep resolution is
 *   still needed at load time so cross-glossary related terms exist
 *   to be shown as neighbours.
 * - Data mode: per-term asset pages via getGlossaryTermAssets, merged
 *   as tagged-with assetBinding edges (pin appendTermAssetsForTerm).
 *
 * No-glossary fallback (a term whose glossary ref is absent): pin
 * loads the whole catalogue in that case; the product has no paginated
 * global term loader, so the fallback seeds from the focal term alone
 * and resolves its related terms transitively instead. The visible
 * neighbourhood is identical; only the out-of-neighbourhood backdrop
 * is absent.
 */

/** Pin useOntologyGraphDerived.ts term filter: 1-hop ego graph. */
export function filterTermNeighbourhood(
  graph: OntologyGraphData,
  termId: string,
): OntologyGraphData {
  const termEdges = graph.edges.filter((edge) => edge.source === termId || edge.target === termId);
  const visibleNodeIds = new Set<string>([termId]);
  termEdges.forEach((edge) => {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  });
  return {
    edges: termEdges,
    nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.id)),
  };
}

/**
 * Pin fetchTermAssetCounts lookup: FQN first, then original label,
 * then display label. Returns new node objects; the input is untouched.
 */
export function applyTermAssetCounts(
  nodes: readonly OntologyGraphNode[],
  counts: Readonly<Record<string, number>>,
): OntologyGraphNode[] {
  return nodes.map((node) => {
    const lookupKeys = [node.fullyQualifiedName, node.originalLabel, node.label].filter(
      (key): key is string => Boolean(key),
    );
    const matchedKey = lookupKeys.find((key) => key in counts);
    if (matchedKey === undefined) {
      return node;
    }
    return { ...node, assetCount: counts[matchedKey] };
  });
}

export interface TermRelationsGraphLoad {
  graph: OntologyGraphData;
  counts: Record<string, number>;
}

export async function fetchTermRelationsGraphData(input: {
  termId: string;
  glossaryId?: string;
  glossaryFqn?: string;
}): Promise<TermRelationsGraphLoad> {
  let graph: OntologyGraphData;
  if (input.glossaryId) {
    graph = await fetchGlossaryGraphData(input.glossaryId);
  } else {
    const term = await getGlossaryTerm(input.termId);
    const terms = [term];
    await resolveRelatedTerms(terms);
    graph = buildGlossaryGraphData(terms);
  }
  let counts: Record<string, number> = {};
  try {
    counts = await getGlossaryTermsAssetCounts(input.glossaryFqn);
  } catch {
    counts = {};
  }
  return { counts, graph };
}

/**
 * Pin appendTermAssetsForTerm: asset nodes (ontologyAssetNode) plus
 * tagged-with assetBinding edges asset -> term, deduped by node/edge
 * id; the term node records the page total and the loaded count.
 * `fromOffset` is the count already loaded for the term (0 on the
 * first page, the previous loadedAssetCount on load-more).
 * `edgeLabel` is the caller-supplied i18n text for the edge
 * (pin: t('label.tagged-with')); the helper itself stays free of
 * user-facing copy so it can be unit-tested without an i18n setup.
 */
export function appendTermAssets(
  graph: OntologyGraphData,
  termId: string,
  assets: readonly EntityRef[],
  total: number,
  edgeLabel: string,
  fromOffset = 0,
): OntologyGraphData {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const nextNodes = [...graph.nodes];
  const nextEdges: OntologyGraphEdge[] = [...graph.edges];
  for (const asset of assets) {
    const assetNode = ontologyAssetNode(asset);
    if (!nodeIds.has(assetNode.id)) {
      nodeIds.add(assetNode.id);
      nextNodes.push(assetNode);
    }
    const edgeId = `${assetNode.id}|${termId}|${ASSET_RELATION_TYPE}`;
    if (!edgeIds.has(edgeId)) {
      edgeIds.add(edgeId);
      nextEdges.push({
        edgeKind: ASSET_BINDING_EDGE_KIND,
        id: edgeId,
        label: edgeLabel,
        relationType: ASSET_RELATION_TYPE,
        source: assetNode.id,
        target: termId,
      });
    }
  }
  return {
    edges: nextEdges,
    nodes: nextNodes.map((node) =>
      node.id === termId
        ? {
            ...node,
            assetCount: total,
            isLoadingAssets: false,
            loadedAssetCount: fromOffset + assets.length,
          }
        : node,
    ),
  };
}

/** Pin appendTermAssetsForTerm page size: min(max, max(1, pageSize)). */
export function termAssetPageSize(pageSize: number): number {
  return Math.min(DATA_MODE_ASSET_MAX_LOAD, Math.max(1, pageSize));
}
