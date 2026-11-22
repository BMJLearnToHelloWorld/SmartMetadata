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
  collapseLineageModel,
  dqHighlight,
  extractDqNodeIds,
  layoutLineageGraph,
  lineageNeighbors,
  lineageNodeNeighbors,
  lineageNodeSide,
  lineageNodeSize,
  mapEntityLineage,
  mapSearchLineage,
  mergeLineageModels,
} from './graphModel';

const PAYLOAD = {
  entity: {
    id: 'center-id',
    type: 'table',
    name: 'orders',
    displayName: 'Orders',
    fullyQualifiedName: 'svc.db.schema.orders',
  },
  nodes: [
    {
      id: 'up-id',
      type: 'table',
      name: 'raw_orders',
      fullyQualifiedName: 'svc.db.schema.raw_orders',
    },
    {
      id: 'down-id',
      type: 'topic',
      name: 'orders_events',
      fullyQualifiedName: 'kafka.orders_events',
    },
  ],
  upstreamEdges: [
    {
      fromEntity: 'up-id',
      toEntity: 'center-id',
      description: 'nightly ingest',
      lineageDetails: {
        source: 'QueryLineage',
        sqlQuery: 'select id from raw_orders',
        pipeline: { name: 'orders_etl', type: 'pipeline' },
        columnsLineage: [
          {
            fromColumns: ['svc.db.schema.raw_orders.id'],
            toColumn: 'svc.db.schema.orders.id',
            function: 'identity',
          },
        ],
      },
    },
  ],
  downstreamEdges: [
    {
      fromEntity: { id: 'center-id' },
      toEntity: { id: 'down-id' },
    },
  ],
};

describe('mapEntityLineage', () => {
  it('joins UUID edges to entity references and keeps column mappings from the API', () => {
    const model = mapEntityLineage(PAYLOAD);
    expect(model.centerId).toBe('center-id');
    expect(model.nodes.map((node) => node.id).sort()).toEqual(['center-id', 'down-id', 'up-id']);
    expect(model.nodes.find((node) => node.isCenter)?.fullyQualifiedName).toBe('svc.db.schema.orders');
    expect(model.edges).toHaveLength(2);

    const upstream = model.edges.find((edge) => edge.source === 'up-id');
    expect(upstream?.target).toBe('center-id');
    expect(upstream?.label).toBe('nightly ingest');
    expect(upstream?.sourceKind).toBe('QueryLineage');
    expect(upstream?.pipelineName).toBe('orders_etl');
    expect(upstream?.columnMappings).toEqual([
      {
        fromColumns: ['svc.db.schema.raw_orders.id'],
        toColumn: 'svc.db.schema.orders.id',
        function: 'identity',
      },
    ]);
    expect(model.hasColumnLineage).toBe(true);
    expect(model.columnMappings).toHaveLength(1);
    expect(model.nodes.find((node) => node.isCenter)?.serviceName).toBe('svc');
    expect(model.nodes.find((node) => node.isCenter)?.pathLabel).toBe('svc / db / schema');
    expect(model.nodes.find((node) => node.isCenter)?.columns).toEqual([
      { fqn: 'svc.db.schema.orders.id', name: 'id' },
    ]);

    const downstream = model.edges.find((edge) => edge.target === 'down-id');
    expect(downstream?.source).toBe('center-id');
    expect(downstream?.label).toBe('');
  });

  it('labels an edge from the first column mapping when the API sends no description', () => {
    const model = mapEntityLineage({
      entity: { id: 'a', type: 'table', name: 'a', fullyQualifiedName: 't.a' },
      nodes: [{ id: 'b', type: 'table', name: 'b', fullyQualifiedName: 't.b' }],
      upstreamEdges: [
        {
          fromEntity: 'b',
          toEntity: 'a',
          lineageDetails: {
            columnsLineage: [{ fromColumns: ['t.b.col'], toColumn: 't.a.col' }],
          },
        },
      ],
    });
    expect(model.edges[0].label).toBe('t.b.col → t.a.col');
  });

  it('creates stub nodes for edge endpoints the payload omitted', () => {
    const model = mapEntityLineage({
      entity: { id: 'center', type: 'table', name: 'center', fullyQualifiedName: 't.center' },
      nodes: [],
      upstreamEdges: [{ fromEntity: 'ghost', toEntity: 'center' }],
    });
    expect(model.nodes.some((node) => node.id === 'ghost')).toBe(true);
    expect(model.nodes.find((node) => node.id === 'ghost')?.name).toBe('ghost');
  });

  it('returns an empty graph when the payload has no primary entity', () => {
    expect(mapEntityLineage(null)).toEqual({
      centerId: '',
      nodes: [],
      edges: [],
      columnMappings: [],
      hasColumnLineage: false,
    });
    expect(mapEntityLineage({})).toMatchObject({ centerId: '', nodes: [], edges: [] });
  });
});

describe('mapSearchLineage', () => {
  it('maps FQN-keyed nodes and top-level column lineage to the graph model', () => {
    const model = mapSearchLineage(
      {
        nodes: {
          'svc.db.schema.orders': {
            entity: { id: 'center-id', type: 'table', name: 'orders', displayName: 'orders', fullyQualifiedName: 'svc.db.schema.orders' },
            nodeDepth: 0,
          },
          'svc.db.schema.raw_orders': {
            entity: { id: 'up-id', type: 'table', name: 'raw_orders', fullyQualifiedName: 'svc.db.schema.raw_orders' },
            nodeDepth: 1,
          },
        },
        upstreamEdges: {
          e1: {
            fromEntity: { id: 'up-id', fullyQualifiedName: 'svc.db.schema.raw_orders', type: 'table' },
            toEntity: { id: 'center-id', fullyQualifiedName: 'svc.db.schema.orders', type: 'table' },
            columns: [{ fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id' }],
          },
        },
        downstreamEdges: {},
      },
      'svc.db.schema.orders',
    );
    expect(model.centerId).toBe('center-id');
    expect(model.nodes.find((node) => node.isCenter)?.fullyQualifiedName).toBe('svc.db.schema.orders');
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({ source: 'up-id', target: 'center-id' });
    expect(model.columnMappings).toEqual([
      { fromColumns: ['svc.db.schema.raw_orders.id'], toColumn: 'svc.db.schema.orders.id', function: undefined },
    ]);
    expect(model.hasColumnLineage).toBe(true);
  });

  it('falls back to the nodeDepth-0 node when the requested FQN is absent', () => {
    const model = mapSearchLineage(
      {
        nodes: {
          't.a': { entity: { id: 'a', type: 'table', name: 'a', fullyQualifiedName: 't.a' }, nodeDepth: 0 },
          't.b': { entity: { id: 'b', type: 'table', name: 'b', fullyQualifiedName: 't.b' }, nodeDepth: 1 },
        },
        upstreamEdges: {},
        downstreamEdges: {},
      },
      't.missing',
    );
    expect(model.centerId).toBe('a');
  });

  it('returns an empty graph when the search result has no nodes', () => {
    expect(mapSearchLineage({ nodes: {}, upstreamEdges: {}, downstreamEdges: {} }, 't.a')).toMatchObject({
      centerId: '',
      nodes: [],
      edges: [],
    });
  });
});

describe('lineageNeighbors', () => {
  it('splits mapped edges into upstream and downstream nodes', () => {
    const neighbors = lineageNeighbors(mapEntityLineage(PAYLOAD));
    expect(neighbors.upstream.map((node) => node.id)).toEqual(['up-id']);
    expect(neighbors.downstream.map((node) => node.id)).toEqual(['down-id']);
  });
});

describe('mergeLineageModels / collapseLineageModel', () => {
  function chainModel(): ReturnType<typeof mapEntityLineage> {
    return mapEntityLineage({
      entity: { id: 'center', type: 'table', name: 'center', fullyQualifiedName: 't.center' },
      nodes: [
        { id: 'up', type: 'table', name: 'up', fullyQualifiedName: 't.up' },
        { id: 'down', type: 'table', name: 'down', fullyQualifiedName: 't.down' },
      ],
      upstreamEdges: [{ fromEntity: 'up', toEntity: 'center' }],
      downstreamEdges: [{ fromEntity: 'center', toEntity: 'down' }],
    });
  }

  it('merges an expand fetch into the graph and keeps the base center', () => {
    const base = chainModel();
    const extra = mapSearchLineage(
      {
        nodes: {
          't.up': {
            entity: { id: 'up', type: 'table', name: 'up', fullyQualifiedName: 't.up' },
            nodeDepth: 0,
          },
          't.grand': {
            entity: { id: 'grand', type: 'table', name: 'grand', fullyQualifiedName: 't.grand' },
            nodeDepth: 1,
          },
        },
        upstreamEdges: {
          e1: {
            fromEntity: { id: 'grand', fullyQualifiedName: 't.grand', type: 'table' },
            toEntity: { id: 'up', fullyQualifiedName: 't.up', type: 'table' },
          },
        },
        downstreamEdges: {},
      },
      't.up',
    );
    const merged = mergeLineageModels(base, extra);
    expect(merged.centerId).toBe('center');
    expect(merged.nodes.map((node) => node.id).sort()).toEqual(['center', 'down', 'grand', 'up']);
    expect(merged.edges).toHaveLength(3);
    expect(merged.edges.some((edge) => edge.source === 'grand' && edge.target === 'up')).toBe(true);
    // Merging the same fetch twice does not duplicate edges.
    expect(mergeLineageModels(merged, extra).edges).toHaveLength(3);
  });

  it('collapses one direction at a time', () => {
    const model = mapEntityLineage({
      entity: { id: 'center', type: 'table', name: 'center', fullyQualifiedName: 't.center' },
      nodes: [
        { id: 'a', type: 'table', name: 'a', fullyQualifiedName: 't.a' },
        { id: 'b', type: 'table', name: 'b', fullyQualifiedName: 't.b' },
        { id: 'shared', type: 'table', name: 'shared', fullyQualifiedName: 't.shared' },
      ],
      upstreamEdges: [
        { fromEntity: 'a', toEntity: 'center' },
        { fromEntity: 'shared', toEntity: 'center' },
      ],
      downstreamEdges: [
        { fromEntity: 'center', toEntity: 'b' },
        { fromEntity: 'a', toEntity: 'shared' },
      ],
    });
    // Downstream of the center is only 'b'; the upstream side is untouched.
    const downCollapsed = collapseLineageModel(model, 'center', 'downstream');
    expect(downCollapsed.nodes.map((node) => node.id).sort()).toEqual([
      'a',
      'center',
      'shared',
    ]);
    expect(downCollapsed.edges).toHaveLength(3);
    // Upstream of the center is 'a' and 'shared' (a also feeds shared, but
    // both are reachable, so neither has another path out).
    const upCollapsed = collapseLineageModel(model, 'center', 'upstream');
    expect(upCollapsed.nodes.map((node) => node.id).sort()).toEqual(['b', 'center']);
  });

  it('keeps a shared node that still feeds a node outside the collapsed set', () => {
    const model = mapEntityLineage({
      entity: { id: 'center', type: 'table', name: 'center', fullyQualifiedName: 't.center' },
      nodes: [
        { id: 'a', type: 'table', name: 'a', fullyQualifiedName: 't.a' },
        { id: 'shared', type: 'table', name: 'shared', fullyQualifiedName: 't.shared' },
        { id: 'd', type: 'table', name: 'd', fullyQualifiedName: 't.d' },
      ],
      upstreamEdges: [
        { fromEntity: 'a', toEntity: 'center' },
        { fromEntity: 'shared', toEntity: 'center' },
      ],
      downstreamEdges: [{ fromEntity: 'shared', toEntity: 'd' }],
    });
    // Upstream of the center is {a, shared}; shared also feeds 'd', which
    // is outside the reachable set, so shared survives the collapse.
    const collapsed = collapseLineageModel(model, 'center', 'upstream');
    expect(collapsed.nodes.map((node) => node.id).sort()).toEqual(['center', 'd', 'shared']);
    expect(collapsed.edges.some((edge) => edge.source === 'shared')).toBe(true);
  });

  it('reports upstream/downstream presence per node', () => {
    const neighbors = lineageNodeNeighbors(chainModel(), 'center');
    expect(neighbors).toEqual({ hasUpstream: true, hasDownstream: true });
    expect(lineageNodeNeighbors(chainModel(), 'up')).toEqual({
      hasUpstream: false,
      hasDownstream: true,
    });
  });

  it('reads paging child counts from search nodes and sides from the center', () => {
    const model = mapSearchLineage(
      {
        nodes: {
          't.center': {
            entity: { id: 'center', type: 'table', name: 'center', fullyQualifiedName: 't.center' },
            nodeDepth: 0,
            paging: { entityUpstreamCount: 2, entityDownstreamCount: 1 },
          },
          't.up': {
            entity: { id: 'up', type: 'table', name: 'up', fullyQualifiedName: 't.up' },
            nodeDepth: 1,
            paging: { entityUpstreamCount: 3, entityDownstreamCount: 0 },
          },
          't.down': {
            entity: { id: 'down', type: 'table', name: 'down', fullyQualifiedName: 't.down' },
            nodeDepth: 1,
          },
        },
        upstreamEdges: {
          e1: {
            fromEntity: { id: 'up', fullyQualifiedName: 't.up', type: 'table' },
            toEntity: { id: 'center', fullyQualifiedName: 't.center', type: 'table' },
          },
        },
        downstreamEdges: {
          e2: {
            fromEntity: { id: 'center', fullyQualifiedName: 't.center', type: 'table' },
            toEntity: { id: 'down', fullyQualifiedName: 't.down', type: 'table' },
          },
        },
      },
      't.center',
    );
    const byId = Object.fromEntries(model.nodes.map((node) => [node.id, node]));
    expect(byId.center.upstreamCount).toBe(2);
    expect(byId.center.downstreamCount).toBe(1);
    expect(byId.up.upstreamCount).toBe(3);
    expect(byId.down.upstreamCount).toBe(0);
    expect(lineageNodeSide(model, 'center')).toBe('center');
    expect(lineageNodeSide(model, 'up')).toBe('upstream');
    expect(lineageNodeSide(model, 'down')).toBe('downstream');
    expect(lineageNodeSide(model, 'missing')).toBe('other');
  });
});

describe('dqHighlight / extractDqNodeIds', () => {
  it('extracts DQ node ids from the DQ lineage payload', () => {
    expect(
      extractDqNodeIds({
        nodes: [
          { id: 'up-id', fullyQualifiedName: 't.up' },
          { id: 'up-id', fullyQualifiedName: 't.up' },
          { fullyQualifiedName: 't.no-id' },
        ],
        edges: [],
      }),
    ).toEqual(['up-id']);
    expect(extractDqNodeIds({ nodes: {} })).toEqual([]);
  });

  it('highlights DQ nodes and every edge downstream of them', () => {
    const model = mapEntityLineage(PAYLOAD);
    const highlight = dqHighlight(model, ['up-id']);
    expect(highlight.nodeIds).toEqual(['up-id']);
    // up-id -> center -> down-id: both downstream edges highlight.
    expect(highlight.edgeIds.sort()).toEqual(
      model.edges.map((edge) => edge.id).sort(),
    );
    expect(dqHighlight(model, ['missing-id'])).toEqual({ nodeIds: [], edgeIds: [] });
  });
});

describe('layoutLineageGraph', () => {
  it('places upstream nodes left of the center and downstream nodes to the right', () => {
    const positioned = layoutLineageGraph(mapEntityLineage(PAYLOAD));
    const byId = Object.fromEntries(positioned.nodes.map((node) => [node.id, node]));
    expect(byId['up-id'].position.x).toBeLessThan(byId['center-id'].position.x);
    expect(byId['down-id'].position.x).toBeGreaterThan(byId['center-id'].position.x);
  });

  it('grows a node when its mapped columns are expanded', () => {
    const model = mapEntityLineage(PAYLOAD);
    const center = model.nodes.find((node) => node.isCenter);
    expect(center).toBeTruthy();
    const collapsed = lineageNodeSize(center!);
    const expanded = lineageNodeSize(center!, new Set([center!.id]));
    expect(expanded.height).toBeGreaterThan(collapsed.height);
  });

  it('lays a multi-hop chain out left-to-right without overlapping nodes (dagre/ELK parity)', () => {
    const model = mapEntityLineage({
      entity: { id: 'c0', type: 'table', name: 'c0', fullyQualifiedName: 't.c0' },
      nodes: [
        { id: 'c1', type: 'table', name: 'c1', fullyQualifiedName: 't.c1' },
        { id: 'c2', type: 'table', name: 'c2', fullyQualifiedName: 't.c2' },
        { id: 'c3', type: 'table', name: 'c3', fullyQualifiedName: 't.c3' },
      ],
      upstreamEdges: [
        { fromEntity: 'c3', toEntity: 'c2' },
        { fromEntity: 'c2', toEntity: 'c1' },
        { fromEntity: 'c1', toEntity: 'c0' },
      ],
      downstreamEdges: [],
    });
    const positioned = layoutLineageGraph(model);
    const byId = Object.fromEntries(positioned.nodes.map((node) => [node.id, node]));
    const xs = ['c3', 'c2', 'c1', 'c0'].map((id) => byId[id].position.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
    // No two node rectangles intersect.
    const rects = positioned.nodes.map((node) => {
      const size = lineageNodeSize(node);
      return { x: node.position.x, y: node.position.y, w: size.width, h: size.height };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlaps =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });
});
