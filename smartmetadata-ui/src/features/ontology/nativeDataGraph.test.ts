/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import type { EntityRef } from '@/types/api';
import type {
  NativeDataGraph,
  NativeOntologyDataGraphPage,
  OntologyDataGraph,
} from '@/types/ontologyDataGraph';
import { EMPTY_NATIVE_DATA_GRAPH, EMPTY_NATIVE_TOPOLOGY } from '@/types/ontologyDataGraph';
import {
  applyBindingsPage,
  applyClustersPage,
  buildGraphFromOntologyData,
  buildNativeDataGraph,
  classifyPageFailure,
  getOntologyAssetPath,
  ontologyAssetNode,
  stageTopologyPage,
} from './nativeDataGraph';
import type { Glossary } from '@/types/governance';

function ref(id: string, name: string, type = 'table'): EntityRef {
  return { id, name, displayName: name, type, fullyQualifiedName: `svc.${name}` };
}

function page(overrides: Partial<NativeOntologyDataGraphPage>): NativeOntologyDataGraphPage {
  return {
    contextFull: false,
    loaded: [{ bindingRevision: 1, conceptId: 'c1' }],
    topology: { edges: [], lineageEdges: [] },
    ...overrides,
  };
}

describe('classifyPageFailure', () => {
  it('maps 400 to invalid, 412 to stale, and anything else to other', () => {
    expect(classifyPageFailure(new ApiError(400, '', 'bad'))).toBe('invalid');
    expect(classifyPageFailure(new ApiError(412, '', 'stale'))).toBe('stale');
    expect(classifyPageFailure(new ApiError(500, '', 'boom'))).toBe('other');
    expect(classifyPageFailure(new Error('boom'))).toBe('other');
  });
});

describe('applyClustersPage', () => {
  it('replaces clusters with the same concept and appends new ones', () => {
    const first = applyClustersPage(EMPTY_NATIVE_DATA_GRAPH, page({
      clusters: [
        { concept: ref('c1', 'Customer'), assetCount: 2, assets: [{ asset: ref('a1', 'T1'), columnCount: 0 }] },
      ],
      nextClusterOffset: 1,
    }));
    expect(first.clusters).toHaveLength(1);
    expect(first.nextClusterOffset).toBe(1);
    const second = applyClustersPage(first, page({
      clusters: [
        { concept: ref('c1', 'Customer'), assetCount: 3, assets: [] },
        { concept: ref('c2', 'Order'), assetCount: 0, assets: [] },
      ],
    }));
    expect(second.clusters.map((cluster) => cluster.concept.id)).toEqual(['c1', 'c2']);
    expect(second.clusters[0]?.assetCount).toBe(3);
  });
});

describe('applyBindingsPage', () => {
  it('appends only new assets and updates the after cursor', () => {
    const graph: NativeDataGraph = {
      ...EMPTY_NATIVE_DATA_GRAPH,
      clusters: [
        {
          concept: ref('c1', 'Customer'),
          assetCount: 3,
          assets: [{ id: 'a1', asset: ref('a1', 'T1'), columnCount: 0 }],
          after: 'cur1',
        },
      ],
    };
    const next = applyBindingsPage(graph, 'c1', page({
      bindings: {
        after: 'cur2',
        assets: [
          { asset: ref('a1', 'T1'), assetId: 'a1', assetType: 'table', columns: [] },
          { asset: ref('a2', 'T2'), assetId: 'a2', assetType: 'table', columns: [{ columnPath: ['id'], propertyId: 'p1' }] },
        ],
        revision: 2,
      },
    }));
    const cluster = next.clusters[0]!;
    expect(cluster.assets.map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(cluster.assets[1]?.columnCount).toBe(1);
    expect(cluster.after).toBe('cur2');
  });

  it('returns the graph unchanged when the page carries no bindings', () => {
    const graph: NativeDataGraph = { ...EMPTY_NATIVE_DATA_GRAPH };
    expect(applyBindingsPage(graph, 'c1', page({}))).toBe(graph);
  });
});

describe('stageTopologyPage', () => {
  it('merges concept and lineage edges without duplicates', () => {
    const first = stageTopologyPage(EMPTY_NATIVE_TOPOLOGY, {
      edges: [{ fromConceptId: 'c1', toConceptId: 'c2', propertyIri: 'https://x#p' }],
      lineageEdges: [{ fromEntity: 'a1', toEntity: 'a2' }],
    });
    const second = stageTopologyPage(first, {
      edges: [
        { fromConceptId: 'c1', toConceptId: 'c2', propertyIri: 'https://x#p' },
        { fromConceptId: 'c2', toConceptId: 'c3', propertyIri: 'https://x#q' },
      ],
      lineageEdges: [{ fromEntity: 'a1', toEntity: 'a2' }],
    });
    expect(second.conceptEdges).toHaveLength(2);
    expect(second.lineageEdges).toHaveLength(1);
  });
});

describe('buildNativeDataGraph', () => {
  it('builds concept + asset nodes, binding edges, inferred edges and lineage notes', () => {
    const graph: NativeDataGraph = {
      clusters: [
        {
          concept: ref('c1', 'Customer'),
          assetCount: 2,
          assets: [
            { id: 'a1', asset: ref('a1', 'T1'), columnCount: 1 },
            { id: 'a2', asset: ref('a2', 'T2'), columnCount: 0 },
          ],
        },
        {
          concept: ref('c2', 'Order'),
          assetCount: 1,
          assets: [{ id: 'a1', asset: ref('a1', 'T1'), columnCount: 1 }],
        },
      ],
      loaded: [],
      contextFull: false,
      topology: {
        conceptEdges: [{ fromConceptId: 'c1', toConceptId: 'c2', propertyIri: 'https://x#p', label: 'places' }],
        lineageEdges: [{ fromEntity: 'a1', toEntity: 'a2' }],
      },
    };
    const built = buildNativeDataGraph(graph, new Set(), 'Lineage');
    expect(built.nodes.map((node) => node.id)).toEqual([
      'c1', 'asset:c1:a1', 'asset:c1:a2', 'c2', 'asset:c2:a1',
    ]);
    const kinds = built.edges.map((edge) => edge.edgeKind).sort();
    expect(kinds).toEqual(['assetBinding', 'assetBinding', 'assetBinding', 'observedLineage', 'semanticProjection']);
    const inferred = built.edges.find((edge) => edge.edgeKind === 'semanticProjection');
    expect(inferred?.source).toBe('c1');
    expect(inferred?.target).toBe('c2');
    // Lineage between rows of the same card becomes notes, not an edge.
    const sameCard = buildNativeDataGraph(
      {
        ...graph,
        clusters: [graph.clusters[0]!],
        topology: { conceptEdges: [], lineageEdges: [{ fromEntity: 'a1', toEntity: 'a2' }] },
      },
      new Set(),
      'Lineage',
    );
    expect(sameCard.edges.some((edge) => edge.edgeKind === 'observedLineage')).toBe(false);
    const row = sameCard.nodes.find((node) => node.id === 'asset:c1:a1');
    expect(row?.lineageNotes).toEqual([{ direction: 'downstream', label: 'T2' }]);
  });
});

describe('ontologyAssetNode / getOntologyAssetPath', () => {
  it('uses the bare asset id and resolves the product asset route', () => {
    const asset = ref('a1', 'Customers');
    const node = ontologyAssetNode(asset);
    expect(node.id).toBe('a1');
    expect(node.type).toBe('dataAsset');
    expect(node.serviceLabel).toBe('table');
    expect(getOntologyAssetPath(asset)).toBe('/assets/table/svc.Customers');
    expect(getOntologyAssetPath({ id: 'x', name: 'NoFqn', type: 'table' })).toBeUndefined();
  });
});

describe('buildGraphFromOntologyData', () => {
  it('builds term + asset nodes and tagged-with edges from the data endpoint', () => {
    const response: OntologyDataGraph = {
      clusters: [
        {
          term: { id: 't1', name: 'Customer', displayName: 'Customer', type: 'glossaryTerm', fullyQualifiedName: 'G.Customer' },
          assetCount: 2,
          assets: [ref('a1', 'T1')],
        },
      ],
      seedTermIds: ['t1'],
      edges: [
        { id: 'r1', from: 't1', to: 't2', relationType: 'relatedTo' },
      ],
      lineageEdges: [],
      paging: { total: 1, offset: 0, limit: 12 },
    };
    const glossaries: Glossary[] = [
      { id: 'g1', name: 'G', displayName: 'G', fullyQualifiedName: 'G', owners: [], reviewers: [], tags: [], domains: [] },
    ];
    const built = buildGraphFromOntologyData(response, glossaries);
    const termNode = built.nodes.find((node) => node.id === 't1');
    expect(termNode?.type).toBe('glossaryTerm');
    expect(termNode?.glossaryId).toBe('g1');
    expect(termNode?.assetCount).toBe(2);
    expect(termNode?.loadedAssetCount).toBe(1);
    expect(termNode?.isDataModeSeed).toBe(true);
    expect(built.nodes.some((node) => node.id === 'a1' && node.type === 'dataAsset')).toBe(true);
    const tagged = built.edges.find((edge) => edge.relationType === 'hasGlossaryTerm');
    expect(tagged?.source).toBe('a1');
    expect(tagged?.target).toBe('t1');
    expect(tagged?.label).toBe('tagged-with');
    expect(built.edges.some((edge) => edge.id === 'r1' && edge.label === 'relatedTo')).toBe(true);
  });
});
