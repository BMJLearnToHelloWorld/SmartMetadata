/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlossaryTerm } from '@/types/governance';
import { buildGlossaryGraphData, fetchAllGlossariesGraphData, fetchGlossaryGraphData } from './glossaryGraph';

function term(partial: Partial<GlossaryTerm> & { id: string; name: string }): GlossaryTerm {
  return {
    fullyQualifiedName: partial.name,
    relatedTerms: [],
    owners: [],
    tags: [],
    usageCount: 0,
    ...partial,
  } as GlossaryTerm;
}

describe('buildGlossaryGraphData', () => {
  it('builds parentOf edges from parents and relatedTo edges from relatedTerms', () => {
    const graph = buildGlossaryGraphData([
      term({ id: 'root', name: 'Root' }),
      term({ id: 'child', name: 'Child', parent: { name: 'Root', id: 'root' } }),
      term({
        id: 'sib',
        name: 'Sibling',
        relatedTerms: [{ name: 'Child', id: 'child', type: 'glossaryTerm' }],
      }),
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['root', 'child', 'sib']);
    expect(graph.edges).toEqual([
      { id: 'root|child|parentOf', source: 'root', target: 'child', relationType: 'parentOf' },
      { id: 'sib|child|relatedTo', source: 'sib', target: 'child', relationType: 'relatedTo' },
    ]);
  });

  it('keeps the TermRelation relationType instead of defaulting it away', () => {
    const graph = buildGlossaryGraphData([
      term({ id: 'a', name: 'A', relatedTerms: [{ name: 'B', id: 'b', relationType: 'broader' }] }),
      term({ id: 'b', name: 'B' }),
    ]);
    expect(graph.edges).toEqual([
      { id: 'a|b|broader', source: 'a', target: 'b', relationType: 'broader' },
    ]);
  });

  it('drops references to terms that were never loaded instead of inventing nodes', () => {
    const graph = buildGlossaryGraphData([
      term({ id: 'a', name: 'A', relatedTerms: [{ name: 'Ghost', id: 'ghost' }] }),
      term({ id: 'b', name: 'B', parent: { name: 'Ghost', id: 'ghost' } }),
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges).toEqual([]);
  });

  it('dedupes repeated edges and skips terms without an id', () => {
    const graph = buildGlossaryGraphData([
      term({ id: 'a', name: 'A', relatedTerms: [{ name: 'B', id: 'b' }, { name: 'B', id: 'b' }] }),
      term({ id: 'b', name: 'B' }),
      term({ id: '', name: '' }),
    ]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges).toHaveLength(1);
  });

  it('carries glossary ownership, FQN, description, and the isolated flag on nodes', () => {
    const graph = buildGlossaryGraphData([
      term({
        id: 'a',
        name: 'A',
        displayName: 'Term A',
        description: 'The first term.',
        fullyQualifiedName: 'Sales.A',
        glossary: { id: 'g1', name: 'Sales', displayName: 'Sales Glossary' },
        relatedTerms: [{ name: 'B', id: 'b', type: 'glossaryTerm' }],
      }),
      term({ id: 'b', name: 'B', glossary: { id: 'g1', name: 'Sales' } }),
      term({ id: 'lonely', name: 'Lonely', glossary: { id: 'g1', name: 'Sales' } }),
    ]);
    expect(graph.nodes).toEqual([
      {
        description: 'The first term.',
        fullyQualifiedName: 'Sales.A',
        glossaryId: 'g1',
        group: 'Sales Glossary',
        id: 'a',
        isolated: false,
        label: 'Term A',
      },
      {
        description: undefined,
        fullyQualifiedName: 'B',
        glossaryId: 'g1',
        group: 'Sales',
        id: 'b',
        isolated: false,
        label: 'B',
      },
      {
        description: undefined,
        fullyQualifiedName: 'Lonely',
        glossaryId: 'g1',
        group: 'Sales',
        id: 'lonely',
        isolated: true,
        label: 'Lonely',
      },
    ]);
  });
});

describe('fetchGlossaryGraphData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('pages the glossary terms and hydrates cross-glossary related terms via byIds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = (data: unknown): Response =>
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
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
        if (url.includes('/api/v1/glossaryTerms')) {
          return body({
            data: [
              {
                id: 'a',
                name: 'A',
                fullyQualifiedName: 'G.A',
                relatedTerms: [{ term: { id: 'x1', name: 'External', type: 'glossaryTerm' }, relationType: 'narrower' }],
              },
            ],
            paging: {},
          });
        }
        return body({}, 404);
      }),
    );
    const graph = await fetchGlossaryGraphData('g1');
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'x1']);
    expect(graph.edges).toEqual([
      { id: 'a|x1|narrower', source: 'a', target: 'x1', relationType: 'narrower' },
    ]);
  });
});

describe('fetchAllGlossariesGraphData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('merges glossaries and tolerates one failing glossary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = (data: unknown, status = 200): Response =>
          new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        if (url.includes('glossary=g2')) {
          return body({ message: 'boom' }, 500);
        }
        if (url.includes('glossary=g1')) {
          return body({ data: [{ id: 'a', name: 'A', fullyQualifiedName: 'G1.A', relatedTerms: [] }], paging: {} });
        }
        if (url.includes('glossary=g3')) {
          return body({ data: [{ id: 'b', name: 'B', fullyQualifiedName: 'G3.B', relatedTerms: [] }], paging: {} });
        }
        return body({}, 404);
      }),
    );
    const graph = await fetchAllGlossariesGraphData([
      { id: 'g1', name: 'G1' },
      { id: 'g2', name: 'G2' },
      { id: 'g3', name: 'G3' },
    ] as never);
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(graph.edges).toEqual([]);
  });
});
