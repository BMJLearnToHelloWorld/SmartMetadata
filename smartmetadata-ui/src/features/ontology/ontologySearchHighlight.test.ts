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
import { computeOntologySearchHighlight } from './ontologySearchHighlight';
import type { OntologyGraphData } from './ontologyGraph';

const graph: OntologyGraphData = {
  nodes: [
    {
      id: 'c1',
      label: 'Customer',
      ontologyId: 'o1',
      ontologyFqn: 'sales',
      group: 'Sales',
      fullyQualifiedName: 'sales.Customer',
      description: 'A party that buys.',
    },
    {
      id: 'c2',
      label: 'Party',
      ontologyId: 'o1',
      ontologyFqn: 'sales',
      group: 'Sales',
      fullyQualifiedName: 'sales.Party',
    },
    { id: 'c3', label: 'Order', ontologyId: 'o2', ontologyFqn: 'shop', group: 'Shop' },
  ],
  edges: [
    { id: 'e1', label: 'isA', relationType: 'subClassOf', source: 'c1', target: 'c2' },
    { id: 'e2', label: 'has order', relationType: 'objectProperty', source: 'c1', target: 'c3' },
  ],
};

const groups = [
  { id: 'o1', name: 'Sales', displayName: 'Sales', fullyQualifiedName: 'sales' },
  { id: 'o2', name: 'Shop', displayName: 'Shop', fullyQualifiedName: 'shop' },
];

describe('computeOntologySearchHighlight', () => {
  it('returns null for a blank query', () => {
    expect(computeOntologySearchHighlight(graph.nodes, graph.edges, '  ', groups)).toBeNull();
  });

  it('matches a node label and highlights its incident edges', () => {
    const result = computeOntologySearchHighlight(graph.nodes, graph.edges, 'cust', groups);
    expect(result).not.toBeNull();
    expect(result?.highlightedNodeIds).toEqual(['c1']);
    expect(result?.highlightedEdgeKeys).toEqual(['c1::c2::subClassOf', 'c1::c3::objectProperty']);
  });

  it('matches FQN and description, case- and diacritic-insensitively', () => {
    expect(computeOntologySearchHighlight(graph.nodes, graph.edges, 'SALES.CUSTOMER', groups)?.highlightedNodeIds).toEqual(['c1']);
    expect(computeOntologySearchHighlight(graph.nodes, graph.edges, 'buys', groups)?.highlightedNodeIds).toEqual(['c1']);
  });

  it('matches a group and highlights its member nodes', () => {
    const result = computeOntologySearchHighlight(graph.nodes, graph.edges, 'shop', groups);
    expect(result?.highlightedNodeIds).toEqual(['c3']);
    expect(result?.highlightedGroupIds).toEqual(['o2']);
  });

  it('matches a relation type and highlights both endpoints', () => {
    const result = computeOntologySearchHighlight(graph.nodes, graph.edges, 'objectProperty', groups);
    expect(result?.highlightedNodeIds).toEqual(['c1', 'c3']);
    expect(result?.highlightedEdgeKeys).toEqual(['c1::c3::objectProperty']);
  });

  it('matches an edge label and returns an empty highlight for no hit', () => {
    const labelHit = computeOntologySearchHighlight(graph.nodes, graph.edges, 'has order', groups);
    expect(labelHit?.highlightedEdgeKeys).toEqual(['c1::c3::objectProperty']);
    expect(labelHit?.highlightedNodeIds).toEqual(['c1', 'c3']);
    const miss = computeOntologySearchHighlight(graph.nodes, graph.edges, 'zzz', groups);
    expect(miss).toEqual({
      active: true,
      highlightedNodeIds: [],
      highlightedEdgeKeys: [],
      highlightedGroupIds: [],
    });
  });
});
