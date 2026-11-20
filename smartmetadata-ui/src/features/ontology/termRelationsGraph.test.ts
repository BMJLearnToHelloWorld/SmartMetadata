/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OntologyGraphData, OntologyGraphNode } from './ontologyGraph';
import {
  appendTermAssets,
  applyTermAssetCounts,
  fetchTermRelationsGraphData,
  filterTermNeighbourhood,
  termAssetPageSize,
} from './termRelationsGraph';

function graph(): OntologyGraphData {
  return {
    edges: [
      { edgeKind: 'ontology', id: 'parent-root-a', label: 'Parent', relationType: 'parentOf', source: 'root', target: 'a' },
      { edgeKind: 'ontology', id: 'a-b|relatedTo', label: 'relatedTo', relationType: 'relatedTo', source: 'a', target: 'b' },
      { edgeKind: 'ontology', id: 'b-c|relatedTo', label: 'relatedTo', relationType: 'relatedTo', source: 'b', target: 'c' },
      { edgeKind: 'ontology', id: 'x-y|relatedTo', label: 'relatedTo', relationType: 'relatedTo', source: 'x', target: 'y' },
    ],
    nodes: [
      { id: 'root', label: 'Root', type: 'glossaryTerm' },
      { id: 'a', label: 'A', fullyQualifiedName: 'G.A', type: 'glossaryTerm' },
      { id: 'b', label: 'B', fullyQualifiedName: 'G.B', type: 'glossaryTerm' },
      { id: 'c', label: 'C', fullyQualifiedName: 'G.C', type: 'glossaryTerm' },
      { id: 'x', label: 'X', type: 'glossaryTerm' },
      { id: 'y', label: 'Y', type: 'glossaryTerm' },
    ],
  };
}

describe('filterTermNeighbourhood', () => {
  it('keeps only edges touching the focal term plus their endpoint nodes (pin 1-hop filter)', () => {
    const scoped = filterTermNeighbourhood(graph(), 'a');
    expect(scoped.nodes.map((node) => node.id)).toEqual(['root', 'a', 'b']);
    expect(scoped.edges.map((edge) => edge.id)).toEqual(['parent-root-a', 'a-b|relatedTo']);
  });

  it('keeps the focal node plus only its direct neighbours', () => {
    const scoped = filterTermNeighbourhood(graph(), 'c');
    expect(scoped.nodes.map((node) => node.id)).toEqual(['b', 'c']);
    expect(scoped.edges.map((edge) => edge.id)).toEqual(['b-c|relatedTo']);
  });

  it('is empty apart from the focal id when the term is not in the graph', () => {
    const scoped = filterTermNeighbourhood(graph(), 'ghost');
    expect(scoped.nodes).toEqual([]);
    expect(scoped.edges).toEqual([]);
  });
});

describe('applyTermAssetCounts', () => {
  it('looks up FQN first, then original label, then label', () => {
    const input: OntologyGraphNode[] = [
      { id: 'a', label: 'A', fullyQualifiedName: 'G.A', type: 'glossaryTerm' },
      { id: 'b', label: 'B', originalLabel: 'Bee', type: 'glossaryTerm' },
      { id: 'c', label: 'C', type: 'glossaryTerm' },
      { id: 'd', label: 'D', type: 'glossaryTerm' },
    ];
    const nodes = applyTermAssetCounts(input, { 'G.A': 3, Bee: 5, C: 7 });
    expect(nodes.map((node) => node.assetCount)).toEqual([3, 5, 7, undefined]);
  });

  it('does not mutate the input nodes', () => {
    const input: OntologyGraphNode[] = [{ id: 'a', label: 'A', fullyQualifiedName: 'G.A', type: 'glossaryTerm' }];
    const out = applyTermAssetCounts(input, { 'G.A': 2 });
    expect(out[0]).not.toBe(input[0]);
    expect(input[0].assetCount).toBeUndefined();
  });
});

describe('appendTermAssets', () => {
  it('adds dataAsset nodes and tagged-with edges and records totals (pin appendTermAssetsForTerm)', () => {
    const next = appendTermAssets(
      graph(),
      'a',
      [
        { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
        { id: 't2', name: 'customers', type: 'table', fullyQualifiedName: 'svc.db.customers' },
      ],
      9,
      'Tagged With',
    );
    expect(next.nodes.filter((node) => node.type === 'dataAsset').map((node) => node.id)).toEqual(['t1', 't2']);
    expect(next.nodes.find((node) => node.id === 't1')).toMatchObject({
      label: 'orders',
      serviceLabel: 'table',
    });
    expect(
      next.edges.filter((edge) => edge.relationType === 'hasGlossaryTerm'),
    ).toEqual([
      {
        edgeKind: 'assetBinding',
        id: 't1|a|hasGlossaryTerm',
        label: 'Tagged With',
        relationType: 'hasGlossaryTerm',
        source: 't1',
        target: 'a',
      },
      {
        edgeKind: 'assetBinding',
        id: 't2|a|hasGlossaryTerm',
        label: 'Tagged With',
        relationType: 'hasGlossaryTerm',
        source: 't2',
        target: 'a',
      },
    ]);
    expect(next.nodes.find((node) => node.id === 'a')).toMatchObject({
      assetCount: 9,
      loadedAssetCount: 2,
    });
  });

  it('dedupes a repeated page and advances the loaded offset on load-more', () => {
    const first = appendTermAssets(
      graph(),
      'a',
      [{ id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' }],
      3,
      'Tagged With',
    );
    const second = appendTermAssets(
      first,
      'a',
      [
        { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
        { id: 't2', name: 'customers', type: 'table', fullyQualifiedName: 'svc.db.customers' },
      ],
      3,
      'Tagged With',
      1,
    );
    expect(second.nodes.filter((node) => node.type === 'dataAsset')).toHaveLength(2);
    expect(second.edges.filter((edge) => edge.relationType === 'hasGlossaryTerm')).toHaveLength(2);
    expect(second.nodes.find((node) => node.id === 'a')).toMatchObject({
      assetCount: 3,
      loadedAssetCount: 3,
    });
  });
});

describe('termAssetPageSize', () => {
  it('clamps to [1, 100] like pin appendTermAssetsForTerm', () => {
    expect(termAssetPageSize(6)).toBe(6);
    expect(termAssetPageSize(0)).toBe(1);
    expect(termAssetPageSize(500)).toBe(100);
  });
});

describe('fetchTermRelationsGraphData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(countsStatus = 200): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = (data: unknown, status = 200): Response =>
          new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
            status,
          });
        if (url.includes('/api/v1/glossaryTerms/assets/counts')) {
          return body({ 'G.A': 4, 'G.B': 2 }, countsStatus);
        }
        if (url.includes('/api/v1/glossaryTerms/byIds')) {
          return body([
            {
              id: 'x1',
              name: 'External',
              fullyQualifiedName: 'Other.External',
              relatedTerms: [],
            },
          ]);
        }
        if (url.includes('/api/v1/glossaryTerms/term1')) {
          return body({
            fullyQualifiedName: 'G.A',
            glossary: { id: 'g1', name: 'G' },
            id: 'term1',
            name: 'A',
            relatedTerms: [{ term: { id: 'x1', name: 'External', type: 'glossaryTerm' }, relationType: 'relatedTo' }],
          });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return body({
            data: [
              {
                fullyQualifiedName: 'G.A',
                id: 'a',
                name: 'A',
                relatedTerms: [{ term: { id: 'x1', name: 'External', type: 'glossaryTerm' }, relationType: 'narrower' }],
              },
              { fullyQualifiedName: 'G.B', id: 'b', name: 'B', relatedTerms: [] },
            ],
            paging: {},
          });
        }
        return body({}, 404);
      }),
    );
  }

  it('loads the whole glossary, resolves related terms transitively, and applies counts', async () => {
    stubFetch();
    const { counts, graph: loaded } = await fetchTermRelationsGraphData({
      glossaryFqn: 'G',
      glossaryId: 'g1',
      termId: 'a',
    });
    expect(loaded.nodes.map((node) => node.id)).toEqual(['a', 'b', 'x1']);
    expect(counts).toEqual({ 'G.A': 4, 'G.B': 2 });
    expect(loaded.edges.map((edge) => edge.id)).toEqual(['a-x1|narrower']);
  });

  it('degrades to empty counts when the counts endpoint fails', async () => {
    stubFetch(500);
    const { counts } = await fetchTermRelationsGraphData({
      glossaryFqn: 'G',
      glossaryId: 'g1',
      termId: 'a',
    });
    expect(counts).toEqual({});
  });

  it('seeds from the focal term alone when no glossary id is given', async () => {
    stubFetch();
    const { graph: loaded } = await fetchTermRelationsGraphData({ termId: 'term1' });
    expect(loaded.nodes.map((node) => node.id)).toEqual(['term1', 'x1']);
    expect(loaded.edges.map((edge) => edge.id)).toEqual(['term1-x1|relatedTo']);
  });
});
