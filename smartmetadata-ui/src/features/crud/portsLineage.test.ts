/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { EntityRef } from '@/types/api';
import {
  buildPortsLineageGraph,
  PORTS_LINEAGE_CENTER_NODE_ID,
  portsLineageHandleId,
} from './portsLineage';

const PRODUCT = {
  id: 'dp-1',
  name: 'churn',
  displayName: 'Churn',
  fullyQualifiedName: 'marketing.churn',
};

const INPUT: EntityRef = {
  id: 't1',
  name: 'orders',
  type: 'table',
  fullyQualifiedName: 'svc.db.orders',
};
const OUTPUT: EntityRef = {
  id: 't2',
  name: 'events',
  type: 'table',
  fullyQualifiedName: 'svc.db.events',
};

describe('portsLineageHandleId', () => {
  it('prefers the fully qualified name and falls back to the id', () => {
    expect(portsLineageHandleId(INPUT)).toBe('svc.db.orders');
    expect(portsLineageHandleId({ id: 'x', name: 'x' })).toBe('x');
    expect(portsLineageHandleId({ name: 'x' })).toBe('');
  });
});

describe('buildPortsLineageGraph', () => {
  it('builds pin geometry: center node, input left, output right, smoothstep edges', () => {
    const { nodes, edges } = buildPortsLineageGraph(PRODUCT, [INPUT], [OUTPUT]);

    expect(nodes).toHaveLength(3);
    const center = nodes.find((node) => node.id === PORTS_LINEAGE_CENTER_NODE_ID);
    expect(center?.type).toBe('dataProductNode');
    // Pin: x = HORIZONTAL_SPACING + NODE_WIDTH (440), y = centerY - 50.
    expect(center?.position).toEqual({ x: 440, y: 20 });
    expect(center?.draggable).toBe(false);

    const input = nodes.find((node) => node.id === 'input-svc.db.orders');
    expect(input?.type).toBe('portNode');
    expect(input?.position.x).toBe(0);
    const output = nodes.find((node) => node.id === 'output-svc.db.events');
    expect(output?.type).toBe('portNode');
    // Pin: x = 2 * (HORIZONTAL_SPACING + NODE_WIDTH) (880).
    expect(output?.position.x).toBe(880);

    expect(edges).toHaveLength(2);
    const inEdge = edges.find((edge) => edge.id === 'edge-input-svc.db.orders-to-center');
    expect(inEdge).toMatchObject({
      source: 'input-svc.db.orders',
      target: PORTS_LINEAGE_CENTER_NODE_ID,
      sourceHandle: 'svc.db.orders',
      targetHandle: 'dp-1-left',
      type: 'smoothstep',
    });
    const outEdge = edges.find((edge) => edge.id === 'edge-center-to-output-svc.db.events');
    expect(outEdge).toMatchObject({
      source: PORTS_LINEAGE_CENTER_NODE_ID,
      target: 'output-svc.db.events',
      sourceHandle: 'dp-1-right',
      targetHandle: 'svc.db.events',
      type: 'smoothstep',
    });
  });

  it('centers port columns vertically when the sides are uneven', () => {
    const second: EntityRef = {
      id: 't3',
      name: 'raw',
      type: 'table',
      fullyQualifiedName: 'svc.db.raw',
    };
    const { nodes } = buildPortsLineageGraph(PRODUCT, [INPUT, second], [OUTPUT]);
    // totalHeight = 2 * 140 = 280; input rows at y 0 and 140, output at 70.
    const inputs = nodes
      .filter((node) => node.id.startsWith('input-'))
      .map((node) => node.position.y);
    expect(inputs).toEqual([0, 140]);
    expect(nodes.find((node) => node.id === 'output-svc.db.events')?.position.y).toBe(70);
  });

  it('builds a center-only graph when there are no ports', () => {
    const { nodes, edges } = buildPortsLineageGraph(PRODUCT, [], []);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});
