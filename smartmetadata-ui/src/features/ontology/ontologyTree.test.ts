/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildOntologyTreeIndex,
  filterTreeIndexForSearch,
  orderTreeRows,
} from './ontologyTree';
import type { OntologyGraphData } from './ontologyGraph';

function node(id: string, label: string, group = 'Sales'): { id: string; label: string; group: string } {
  return { id, label, group };
}

describe('buildOntologyTreeIndex', () => {
  it('builds hierarchy from subClassOf edges with roots first', () => {
    const graph: OntologyGraphData = {
      nodes: [
        node('child', 'Child'),
        node('parent', 'Parent'),
        node('grandchild', 'Grandchild'),
      ],
      edges: [
        { id: 'e1', label: 'isA', relationType: 'subClassOf', source: 'child', target: 'parent' },
        { id: 'e2', label: 'isA', relationType: 'subClassOf', source: 'grandchild', target: 'child' },
      ],
    };
    const index = buildOntologyTreeIndex(graph);
    expect(index.roots).toEqual(['parent']);
    expect(index.parents.get('child')).toEqual(['parent']);
    expect(index.parents.get('grandchild')).toEqual(['child']);
    expect(index.children.get('parent')).toEqual(['child']);
    expect(index.relationCounts.get('child')).toBe(2);
    expect(index.isolatedIds).toEqual([]);
    const rows = orderTreeRows(index);
    expect(rows.map((row) => `${row.node.id}:${row.depth}`)).toEqual([
      'parent:0',
      'child:1',
      'grandchild:2',
    ]);
  });

  it('lists isolated concepts separately and counts only incident edges', () => {
    const graph: OntologyGraphData = {
      nodes: [node('a', 'A'), node('b', 'B'), node('lonely', 'Lonely')],
      edges: [{ id: 'e1', label: 'isA', relationType: 'subClassOf', source: 'a', target: 'b' }],
    };
    const index = buildOntologyTreeIndex(graph);
    expect(index.isolatedIds).toEqual(['lonely']);
    expect(index.relationCounts.get('lonely')).toBeUndefined();
    const rows = orderTreeRows(index);
    expect(rows.find((row) => row.node.id === 'lonely')?.isIsolated).toBe(true);
    expect(rows.find((row) => row.node.id === 'a')?.isIsolated).toBe(false);
  });

  it('derives parents from parentOf edges in the opposite direction', () => {
    const graph: OntologyGraphData = {
      nodes: [
        { id: 't1', label: 'Term 1', glossaryId: 'g1', group: 'Glossary One' },
        { id: 't2', label: 'Term 2', glossaryId: 'g1', group: 'Glossary One' },
      ],
      edges: [{ id: 'e1', relationType: 'parentOf', source: 't1', target: 't2' }],
    };
    const index = buildOntologyTreeIndex(graph);
    expect(index.parents.get('t2')).toEqual(['t1']);
    expect(index.roots).toEqual(['t1']);
  });

  it('does not crash on parent cycles or missing parents', () => {
    const graph: OntologyGraphData = {
      nodes: [node('a', 'A'), node('b', 'B'), node('orphan', 'Orphan')],
      edges: [
        { id: 'e1', relationType: 'subClassOf', source: 'a', target: 'b' },
        { id: 'e2', relationType: 'subClassOf', source: 'b', target: 'a' },
        { id: 'e3', relationType: 'subClassOf', source: 'orphan', target: 'ghost' },
      ],
    };
    const index = buildOntologyTreeIndex(graph);
    const rows = orderTreeRows(index);
    expect(rows.map((row) => row.node.id).sort()).toEqual(['a', 'b', 'orphan']);
    // The cycle still yields a root representative instead of vanishing.
    expect(index.roots.length).toBeGreaterThan(0);
    expect(index.parents.get('orphan')).toEqual([]);
  });

  it('keeps parents within the same group only', () => {
    const graph: OntologyGraphData = {
      nodes: [
        node('a', 'A', 'Sales'),
        node('b', 'B', 'Finance'),
      ],
      edges: [{ id: 'e1', relationType: 'subClassOf', source: 'a', target: 'b' }],
    };
    const index = buildOntologyTreeIndex(graph);
    expect(index.parents.get('a')).toEqual([]);
    // Roots are ordered by (group, label, id): 'Finance' sorts before 'Sales'.
    expect(index.roots).toEqual(['b', 'a']);
  });

  it('counts a duplicated edge id once', () => {
    const graph: OntologyGraphData = {
      nodes: [node('a', 'A'), node('b', 'B')],
      edges: [
        { id: 'dup', relationType: 'subClassOf', source: 'a', target: 'b' },
        { id: 'dup', relationType: 'subClassOf', source: 'a', target: 'b' },
      ],
    };
    const index = buildOntologyTreeIndex(graph);
    expect(index.relationCounts.get('a')).toBe(1);
  });
});

describe('filterTreeIndexForSearch', () => {
  const graph: OntologyGraphData = {
    nodes: [
      node('parent', 'Party'),
      node('child', 'Customer'),
      node('other', 'Order'),
    ],
    edges: [
      { id: 'e1', relationType: 'subClassOf', source: 'child', target: 'parent' },
    ],
  };

  it('returns matches plus their ancestor chains', () => {
    const index = buildOntologyTreeIndex(graph);
    const visible = filterTreeIndexForSearch(index, 'cust');
    expect([...visible].sort()).toEqual(['child', 'parent']);
  });

  it('matches FQN and description, case- and diacritic-insensitively', () => {
    const withFqn: OntologyGraphData = {
      nodes: [
        { id: 'c1', label: 'Cafe', fullyQualifiedName: 'sales.Café', description: 'A coffee shop' },
        node('o1', 'Order'),
      ],
      edges: [],
    };
    const index = buildOntologyTreeIndex(withFqn);
    expect([...filterTreeIndexForSearch(index, 'cafe')].sort()).toEqual(['c1']);
    expect([...filterTreeIndexForSearch(index, 'coffee')].sort()).toEqual(['c1']);
  });

  it('returns everything for a blank query and nothing for no match', () => {
    const index = buildOntologyTreeIndex(graph);
    expect(filterTreeIndexForSearch(index, '  ').size).toBe(3);
    expect(filterTreeIndexForSearch(index, 'zzz').size).toBe(0);
  });
});
