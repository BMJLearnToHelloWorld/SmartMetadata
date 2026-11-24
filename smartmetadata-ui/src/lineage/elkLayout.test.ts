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
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import { ELKLayout } from './elkLayout';
import { layoutLineageGraph, mapEntityLineage } from './graphModel';

describe('ELKLayout', () => {
  it('has the pin default layout options', () => {
    expect(ELKLayout.layoutOptions).toEqual({
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.componentComponent': '180',
      'elk.spacing.edgeEdge': '24',
      'elk.spacing.edgeNode': '48',
      'elk.spacing.nodeNode': '110',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '32',
      'elk.layered.spacing.edgeNodeBetweenLayers': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '280',
      'elk.layered.thoroughness': '8',
      'elk.partitioning.activate': 'false',
    });
  });

  it('returns the same ELK instance on subsequent calls', () => {
    expect(ELKLayout.getElk()).toBe(ELKLayout.getElk());
  });

  it('collapses parallel edges to one per source/target pair and positions every node', async () => {
    const nodes: ElkNode[] = [
      { id: 'a', width: 260, height: 78 },
      { id: 'b', width: 260, height: 78 },
    ];
    const edges: ElkExtendedEdge[] = [
      { id: 'e1', sources: ['a'], targets: ['b'] },
      { id: 'e2', sources: ['a'], targets: ['b'] },
      { id: 'e3', sources: ['b'], targets: ['a'] },
    ];
    const laid = await ELKLayout.layoutGraph(nodes, edges);
    expect(laid.edges).toHaveLength(2);
    expect(laid.children).toHaveLength(2);
    for (const child of laid.children ?? []) {
      expect(typeof child.x).toBe('number');
      expect(typeof child.y).toBe('number');
    }
  });

  it('accepts per-band spacing overrides over the defaults', async () => {
    const laid = await ELKLayout.layoutGraph(
      [{ id: 'a', width: 260, height: 78 }],
      [],
      { 'elk.layered.spacing.nodeNodeBetweenLayers': '150' },
    );
    expect(laid.children).toHaveLength(1);
    expect(laid.children?.[0].x).toBeDefined();
  });
});

describe('layoutLineageGraph (ELK)', () => {
  it('returns an empty node list for an empty model without loading the engine', async () => {
    const positioned = await layoutLineageGraph({
      centerId: '',
      nodes: [],
      edges: [],
      columnMappings: [],
      hasColumnLineage: false,
    });
    expect(positioned.nodes).toEqual([]);
  });

  it('positions every node and keeps the model edges unchanged, even with parallel edges', async () => {
    const model = mapEntityLineage({
      entity: { id: 'c', type: 'table', name: 'c', fullyQualifiedName: 't.c' },
      nodes: [{ id: 'u', type: 'table', name: 'u', fullyQualifiedName: 't.u' }],
      upstreamEdges: [
        {
          fromEntity: 'u',
          toEntity: 'c',
          lineageDetails: { columnsLineage: [{ fromColumns: ['t.u.a'], toColumn: 't.c.a' }] },
        },
        {
          fromEntity: 'u',
          toEntity: 'c',
          lineageDetails: { columnsLineage: [{ fromColumns: ['t.u.b'], toColumn: 't.c.b' }] },
        },
      ],
      downstreamEdges: [],
    });
    expect(model.edges).toHaveLength(2);
    const positioned = await layoutLineageGraph(model);
    expect(positioned.nodes).toHaveLength(2);
    expect(positioned.edges).toEqual(model.edges);
    const byId = Object.fromEntries(positioned.nodes.map((node) => [node.id, node]));
    expect(byId['u'].position.x).toBeLessThan(byId['c'].position.x);
  });
});
