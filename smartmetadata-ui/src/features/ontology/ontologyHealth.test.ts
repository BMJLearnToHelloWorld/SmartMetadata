/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { OntologyGraphData, OntologyGraphNode } from './ontologyGraph';
import {
  composeOntologyHealthSummary,
  getOntologyHealthSummary,
  isolatedTermIdsToHydrate,
  isTermNode,
  scopedTerms,
} from './ontologyHealth';
import type { OntologySummary } from '@/types/ontologyDataGraph';

function term(id: string, label: string, glossaryId?: string): OntologyGraphNode {
  return { id, label, type: 'glossaryTerm', glossaryId };
}

function graph(): OntologyGraphData {
  return {
    nodes: [
      term('t1', 'Alpha', 'g1'),
      term('t2', 'Beta', 'g1'),
      term('t3', 'Gamma', 'g2'),
      { id: 'a1', label: 'Table', type: 'dataAsset' },
    ],
    edges: [
      { id: 'r1', source: 't1', target: 't2', relationType: 'relatedTo' },
      // Same relation id in the other direction counts once (pin dedup).
      { id: 'r1', source: 't2', target: 't1', relationType: 'relatedTo' },
    ],
  };
}

describe('isTermNode', () => {
  it('counts glossary terms, isolated terms and concepts, not assets', () => {
    expect(isTermNode(term('t1', 'Alpha'))).toBe(true);
    expect(isTermNode({ id: 'x', label: 'X', type: 'glossaryTermIsolated' })).toBe(true);
    expect(isTermNode({ id: 'x', label: 'X', type: 'ontologyConcept' })).toBe(true);
    expect(isTermNode({ id: 'x', label: 'X', type: 'dataAsset' })).toBe(false);
    expect(isTermNode({ id: 'x', label: 'X' })).toBe(false);
  });
});

describe('scopedTerms', () => {
  it('returns all term nodes without a filter and only the glossary ones with one', () => {
    expect(scopedTerms(graph(), {})).toHaveLength(3);
    expect(scopedTerms(graph(), { glossaryIds: ['g1'] }).map((node) => node.id)).toEqual(['t1', 't2']);
    expect(scopedTerms(graph(), { glossaryIds: ['all'] })).toHaveLength(3);
    expect(scopedTerms(null, {})).toEqual([]);
  });
});

describe('getOntologyHealthSummary', () => {
  it('counts both endpoints of an edge as connected and rounds the percent', () => {
    const health = getOntologyHealthSummary(graph(), {});
    expect(health.totalTermCount).toBe(3);
    expect(health.connectedTermCount).toBe(2);
    expect(health.connectedPercent).toBe(67);
    expect(health.isolatedTerms.map((node) => node.id)).toEqual(['t3']);
  });

  it('sorts isolated terms by label and ignores edges touching non-terms', () => {
    const data = graph();
    data.nodes.push(term('t4', 'Aardvark', 'g2'));
    data.edges.push({ id: 'r2', source: 't3', target: 'a1', relationType: 'tagged-with' });
    const health = getOntologyHealthSummary(data, {});
    expect(health.isolatedTerms.map((node) => node.id)).toEqual(['t4', 't3']);
  });

  it('returns all zeros for an empty graph', () => {
    const health = getOntologyHealthSummary({ nodes: [], edges: [] }, {});
    expect(health).toEqual({ connectedPercent: 0, connectedTermCount: 0, isolatedTerms: [], totalTermCount: 0 });
  });
});

describe('composeOntologyHealthSummary', () => {
  it('lets the endpoint counts win and types preview terms as isolated', () => {
    const summary: OntologySummary = {
      connectedPercentage: 80,
      isolatedPreview: [
        { id: 't9', name: 'Zulu', displayName: 'Zulu', type: 'glossaryTerm' },
      ],
      isolatedTerms: 2,
      totalRelations: 8,
      totalTerms: 10,
    };
    const composed = composeOntologyHealthSummary(summary);
    expect(composed.health.connectedPercent).toBe(80);
    expect(composed.health.connectedTermCount).toBe(8);
    expect(composed.health.totalTermCount).toBe(10);
    expect(composed.health.isolatedTerms).toEqual([
      expect.objectContaining({ id: 't9', label: 'Zulu', type: 'glossaryTermIsolated' }),
    ]);
    expect(composed.isolatedTermCount).toBe(2);
  });
});

describe('isolatedTermIdsToHydrate', () => {
  it('takes the first five isolated terms, then keeps only unresolved labels', () => {
    // 'Named 6' sorts before the 't*' labels, so it consumes one of the
    // five slots and is then filtered out (its label is resolved).
    const health = getOntologyHealthSummary(
      {
        nodes: Array.from({ length: 7 }, (_, index) => ({
          id: `t${index}`,
          label: index < 6 ? `t${index}` : 'Named 6',
          type: 'glossaryTerm' as const,
        })),
        edges: [],
      },
      {},
    );
    expect(isolatedTermIdsToHydrate(health)).toEqual(['t0', 't1', 't2', 't3']);
  });

  it('returns the first five when all labels are unresolved', () => {
    const health = getOntologyHealthSummary(
      {
        nodes: Array.from({ length: 7 }, (_, index) => ({
          id: `t${index}`,
          label: `t${index}`,
          type: 'glossaryTerm' as const,
        })),
        edges: [],
      },
      {},
    );
    expect(isolatedTermIdsToHydrate(health)).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });
});
