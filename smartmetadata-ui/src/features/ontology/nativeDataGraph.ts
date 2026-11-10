/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ApiError } from '@/api/client';
import type { EntityRef } from '@/types/api';
import type { Glossary } from '@/types/governance';
import type {
  LineageNote,
  NativeAssetRow,
  NativeCluster,
  NativeDataGraph,
  NativeOntologyDataGraphPage,
  NativeOntologyDataGraphPageRequest,
  NativeTopology,
  OntologyDataGraph,
  PageFailure,
} from '@/types/ontologyDataGraph';
import {
  ASSET_BINDING_EDGE_KIND,
  ASSET_RELATION_TYPE,
  EMPTY_NATIVE_TOPOLOGY,
  NATIVE_ASSET_PAGE_SIZE,
  NATIVE_CLUSTER_PAGE_SIZE,
  NATIVE_CONTEXT_CONCEPT_LIMIT,
  NATIVE_INFERRED_RELATION_TYPE,
  NATIVE_LINEAGE_RELATION_TYPE,
} from '@/types/ontologyDataGraph';
import type { OntologyGraphData, OntologyGraphEdge, OntologyGraphNode } from './ontologyGraph';

/**
 * Native + glossary data-mode graph builders (official
 * utils/governance/ontology/OntologyNativeDataGraph.utils.ts +
 * components/OntologyExplorer/utils/graphBuilders.ts:
 * buildGraphFromOntologyData), ported exactly.
 *
 * Requests run ONE AT A TIME: each response replaces the `loaded`
 * context the next request must carry (see useNativeOntologyDataGraph).
 * Failure classification: 400 -> 'invalid', 412 -> 'stale', else 'other'
 * (pin reads axios status; the product's apiRequest throws ApiError with
 * the same status field).
 */

export { NATIVE_CLUSTER_PAGE_SIZE, NATIVE_ASSET_PAGE_SIZE, NATIVE_CONTEXT_CONCEPT_LIMIT };

export const clustersRequest = (
  loaded: NativeOntologyDataGraphPageRequest['loaded'],
  offset: number,
): NativeOntologyDataGraphPageRequest => ({
  loaded,
  page: { kind: 'clusters', limit: NATIVE_CLUSTER_PAGE_SIZE, offset },
});

export const bindingsRequest = (
  loaded: NativeOntologyDataGraphPageRequest['loaded'],
  conceptId: string,
  after: string,
): NativeOntologyDataGraphPageRequest => ({
  loaded,
  page: { kind: 'bindings', conceptId, after, limit: NATIVE_ASSET_PAGE_SIZE },
});

export const topologyRequest = (
  loaded: NativeOntologyDataGraphPageRequest['loaded'],
  after: string,
): NativeOntologyDataGraphPageRequest => ({
  loaded,
  page: { kind: 'topology', after },
});

export const classifyPageFailure = (error: unknown): PageFailure => {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 400) {
    return 'invalid';
  }
  return status === 412 ? 'stale' : 'other';
};

const toCluster = (cluster: NonNullable<NativeOntologyDataGraphPage['clusters']>[number]): NativeCluster => ({
  concept: cluster.concept,
  assetCount: cluster.assetCount,
  after: cluster.after,
  assets: cluster.assets.map((item) => ({
    id: item.asset.id ?? item.asset.fullyQualifiedName ?? item.asset.name,
    asset: item.asset,
    columnCount: item.columnCount,
    serviceType: item.serviceType,
  })),
});

export const applyClustersPage = (
  graph: NativeDataGraph,
  page: NativeOntologyDataGraphPage,
): NativeDataGraph => {
  const incoming = new Map((page.clusters ?? []).map((cluster) => [cluster.concept.id ?? '', toCluster(cluster)]));
  const replaced = graph.clusters.map((cluster) => incoming.get(cluster.concept.id ?? '') ?? cluster);
  const known = new Set(graph.clusters.map((cluster) => cluster.concept.id));
  return {
    ...graph,
    clusters: [...replaced, ...[...incoming.values()].filter((cluster) => !known.has(cluster.concept.id))],
    loaded: page.loaded,
    nextClusterOffset: page.nextClusterOffset,
    contextFull: page.contextFull,
  };
};

const countColumnPaths = (columns: Array<{ columnPath: string[] }> | undefined): number =>
  new Set((columns ?? []).map((column) => JSON.stringify(column.columnPath))).size;

export const applyBindingsPage = (
  graph: NativeDataGraph,
  conceptId: string,
  page: NativeOntologyDataGraphPage,
): NativeDataGraph => {
  const bindings = page.bindings;
  if (!bindings) {
    return graph;
  }
  return {
    ...graph,
    loaded: page.loaded,
    contextFull: page.contextFull,
    clusters: graph.clusters.map((cluster) => {
      if (cluster.concept.id !== conceptId) {
        return cluster;
      }
      const have = new Set(cluster.assets.map((row) => row.id));
      const added = bindings.assets
        .filter((binding) => !have.has(binding.assetId))
        .map(
          (binding): NativeAssetRow => ({
            id: binding.assetId,
            asset: binding.asset,
            columnCount: countColumnPaths(binding.columns),
            serviceType: binding.serviceType,
          }),
        );
      return { ...cluster, assets: [...cluster.assets, ...added], after: bindings.after };
    }),
  };
};

const conceptEdgeKey = (edge: { fromConceptId: string; toConceptId: string; propertyIri: string }): string =>
  `${edge.fromConceptId}|${edge.toConceptId}|${edge.propertyIri}`;
const lineageEdgeKey = (edge: { fromEntity: string; toEntity: string }): string =>
  `${edge.fromEntity}|${edge.toEntity}`;

const mergeUnique = <T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] => {
  const merged = new Map(current.map((item) => [keyOf(item), item]));
  incoming.forEach((item) => merged.set(keyOf(item), item));
  return [...merged.values()];
};

export const stageTopologyPage = (
  staged: NativeTopology,
  page: NativeOntologyDataGraphPage['topology'],
): NativeTopology => ({
  conceptEdges: mergeUnique(staged.conceptEdges, page.edges ?? [], conceptEdgeKey),
  lineageEdges: mergeUnique(staged.lineageEdges, page.lineageEdges ?? [], lineageEdgeKey),
});

const assetNodeId = (conceptId: string, assetId: string): string => `asset:${conceptId}:${assetId}`;

const toConceptNode = (cluster: NativeCluster, isLoadingAssets: boolean): OntologyGraphNode => {
  const loadedAssetCount = cluster.after
    ? cluster.assets.length
    : Math.max(cluster.assetCount, cluster.assets.length);
  return {
    id: cluster.concept.id ?? cluster.concept.fullyQualifiedName ?? cluster.concept.name,
    label: cluster.concept.displayName || cluster.concept.name || cluster.concept.fullyQualifiedName || cluster.concept.id || '',
    type: 'ontologyConcept',
    assetCount: cluster.assetCount,
    loadedAssetCount,
    isLoadingAssets,
    isDataModeSeed: true,
    entityRef: cluster.concept,
  };
};

const toAssetNode = (
  conceptId: string,
  row: NativeAssetRow,
  lineageNotes?: LineageNote[],
): OntologyGraphNode => ({
  id: assetNodeId(conceptId, row.id),
  label: row.asset.displayName || row.asset.name || row.asset.fullyQualifiedName || row.id,
  type: 'dataAsset',
  entityRef: row.asset,
  fullyQualifiedName: row.asset.fullyQualifiedName,
  serviceLabel: row.serviceType,
  columnCount: row.columnCount,
  lineageNotes,
});

const buildInferredEdges = (
  edges: NativeTopology['conceptEdges'],
  conceptIds: Set<string>,
): OntologyGraphEdge[] =>
  edges
    .filter(
      (edge) =>
        edge.fromConceptId !== edge.toConceptId &&
        conceptIds.has(edge.fromConceptId) &&
        conceptIds.has(edge.toConceptId),
    )
    .map((edge) => ({
      id: `inferred:${conceptEdgeKey(edge)}`,
      source: edge.fromConceptId,
      target: edge.toConceptId,
      label: edge.label ?? '',
      relationType: NATIVE_INFERRED_RELATION_TYPE,
      edgeKind: 'semanticProjection',
    }));

interface LineageRow {
  conceptId: string;
  nodeId: string;
  label: string;
}

interface NativeLineage {
  edges: OntologyGraphEdge[];
  notesByNodeId: Map<string, LineageNote[]>;
}

// Lineage between two rows of one card has no card-to-card edge to draw, so
// each row names the table on its other end instead.
const buildLineage = (
  edges: NativeTopology['lineageEdges'],
  clusters: NativeCluster[],
  lineageLabel: string,
): NativeLineage => {
  const rowsByAsset = new Map<string, LineageRow[]>();
  clusters.forEach((cluster) =>
    cluster.assets.forEach((row) =>
      rowsByAsset.set(row.id, [
        ...(rowsByAsset.get(row.id) ?? []),
        {
          conceptId: cluster.concept.id ?? '',
          nodeId: assetNodeId(cluster.concept.id ?? '', row.id),
          label: row.asset.displayName || row.asset.name || row.id,
        },
      ]),
    ),
  );
  const joined = new Map<string, OntologyGraphEdge>();
  const notesByNodeId = new Map<string, LineageNote[]>();
  const note = (nodeId: string, lineageNote: LineageNote): void => {
    notesByNodeId.set(nodeId, [...(notesByNodeId.get(nodeId) ?? []), lineageNote]);
  };
  edges.forEach((edge) => {
    (rowsByAsset.get(edge.fromEntity) ?? []).forEach((from) =>
      (rowsByAsset.get(edge.toEntity) ?? []).forEach((to) => {
        if (from.nodeId === to.nodeId) {
          return;
        }
        if (from.conceptId === to.conceptId) {
          note(from.nodeId, { direction: 'downstream', label: to.label });
          note(to.nodeId, { direction: 'upstream', label: from.label });
          return;
        }
        joined.set(`${from.nodeId}|${to.nodeId}`, {
          id: `lineage:${from.nodeId}:${to.nodeId}`,
          source: from.conceptId,
          target: to.conceptId,
          label: lineageLabel,
          relationType: NATIVE_LINEAGE_RELATION_TYPE,
          edgeKind: 'observedLineage',
          lineage: {
            from: { nodeId: from.nodeId, label: from.label },
            to: { nodeId: to.nodeId, label: to.label },
          },
        });
      }),
    );
  });
  return { edges: [...joined.values()], notesByNodeId };
};

export const buildNativeDataGraph = (
  graph: NativeDataGraph,
  loadingConceptIds: ReadonlySet<string>,
  lineageLabel: string,
): OntologyGraphData => {
  const conceptIds = new Set(graph.clusters.map((item) => item.concept.id ?? ''));
  const lineage = buildLineage(graph.topology.lineageEdges, graph.clusters, lineageLabel);
  const nodes = graph.clusters.flatMap((cluster) => [
    toConceptNode(cluster, loadingConceptIds.has(cluster.concept.id ?? '')),
    ...cluster.assets.map((row) =>
      toAssetNode(
        cluster.concept.id ?? '',
        row,
        lineage.notesByNodeId.get(assetNodeId(cluster.concept.id ?? '', row.id)),
      ),
    ),
  ]);
  const assetEdges = graph.clusters.flatMap((cluster) =>
    cluster.assets.map(
      (row): OntologyGraphEdge => ({
        id: `binding:${cluster.concept.id}:${row.id}`,
        source: cluster.concept.id ?? '',
        target: assetNodeId(cluster.concept.id ?? '', row.id),
        label: '',
        relationType: ASSET_RELATION_TYPE,
        edgeKind: 'assetBinding',
      }),
    ),
  );
  return {
    nodes,
    edges: [
      ...assetEdges,
      ...buildInferredEdges(graph.topology.conceptEdges, conceptIds),
      ...lineage.edges,
    ],
  };
};

/**
 * Glossary data mode (graphBuilders.ts: buildGraphFromOntologyData):
 * clusters -> term nodes (type glossaryTerm, assetCount, loadedAssetCount =
 * assets.length, isDataModeSeed, glossaryId/group from FQN) + asset nodes
 * (type dataAsset, entityRef, serviceLabel = asset.type) + tagged-with
 * edges (asset -> term); data.edges -> edges (id/from/to/label =
 * relationType / relationType / relationshipType).
 */
export function ontologyAssetNode(asset: EntityRef): OntologyGraphNode {
  const label = asset.displayName || asset.name || asset.fullyQualifiedName || asset.id || '';
  return {
    id: asset.id ?? asset.fullyQualifiedName ?? asset.name,
    label,
    originalLabel: label,
    type: 'dataAsset',
    entityRef: asset,
    fullyQualifiedName: asset.fullyQualifiedName,
    serviceLabel: asset.type,
  };
}

function glossaryForTerm(
  fullyQualifiedName: string,
  glossaries: readonly Glossary[],
): Glossary | undefined {
  return glossaries.find((glossary) => {
    const glossaryFqn = glossary.fullyQualifiedName ?? glossary.name;
    return fullyQualifiedName === glossaryFqn || fullyQualifiedName.startsWith(`${glossaryFqn}.`);
  });
}

export function buildGraphFromOntologyData(
  response: OntologyDataGraph,
  glossaries: readonly Glossary[],
): OntologyGraphData {
  const seedTermIds = new Set(response.seedTermIds ?? []);
  const nodes = new Map<string, OntologyGraphNode>();
  const edges: OntologyGraphEdge[] = (response.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.relationType,
    relationType: edge.relationType,
    relationshipType: edge.relationshipType,
    provenance: edge.provenance,
    status: edge.status,
    createdBy: edge.createdBy,
    createdAt: edge.createdAt,
  }));
  for (const cluster of response.clusters) {
    const term = cluster.term;
    const termId = term.id ?? term.fullyQualifiedName ?? term.name;
    const glossary = glossaryForTerm(term.fullyQualifiedName ?? '', glossaries);
    const label = term.displayName || term.name || term.fullyQualifiedName || termId;
    nodes.set(termId, {
      id: termId,
      label,
      originalLabel: label,
      type: 'glossaryTerm',
      assetCount: cluster.assetCount,
      loadedAssetCount: cluster.assets.length,
      isDataModeSeed: seedTermIds.has(termId),
      glossaryId: glossary?.id,
      group: glossary?.displayName ?? glossary?.name,
      fullyQualifiedName: term.fullyQualifiedName,
    });
    for (const asset of cluster.assets) {
      const assetNode = ontologyAssetNode(asset);
      nodes.set(assetNode.id, assetNode);
      edges.push({
        id: `${assetNode.id}|${termId}|${ASSET_RELATION_TYPE}`,
        source: assetNode.id,
        target: termId,
        label: 'tagged-with',
        relationType: ASSET_RELATION_TYPE,
        edgeKind: ASSET_BINDING_EDGE_KIND,
      });
    }
  }
  return { edges, nodes: [...nodes.values()] };
}

/**
 * Pin getOntologyAssetPath (OntologyConceptBindings.utils.ts): the asset's
 * type + FQN resolve to its detail path. The product's detail route is
 * `assets/:entityType/:fqn` (name 'asset'); unknown type or missing FQN
 * yields undefined and the click does nothing — same as pin.
 */
export function getOntologyAssetPath(asset: EntityRef): string | undefined {
  if (!asset.type || !asset.fullyQualifiedName) {
    return undefined;
  }
  return `/assets/${asset.type}/${encodeURIComponent(asset.fullyQualifiedName)}`;
}

export { EMPTY_NATIVE_TOPOLOGY };
