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
import { layoutLineageGraph, mapEntityLineage } from './graphModel';

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

describe('layoutLineageGraph', () => {
  it('places upstream nodes left of the center and downstream nodes to the right', () => {
    const positioned = layoutLineageGraph(mapEntityLineage(PAYLOAD));
    const byId = Object.fromEntries(positioned.nodes.map((node) => [node.id, node]));
    expect(byId['up-id'].position.x).toBeLessThan(byId['center-id'].position.x);
    expect(byId['down-id'].position.x).toBeGreaterThan(byId['center-id'].position.x);
  });
});
