/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  filterCanvasNodes,
  lineagePathLabel,
  lineageServiceName,
  truncateLineageFqn,
} from './nodeChrome';
import type { LineageGraphNode } from './graphModel';

function node(partial: Partial<LineageGraphNode> & Pick<LineageGraphNode, 'id'>): LineageGraphNode {
  return {
    entityType: 'table',
    name: partial.name || partial.id,
    displayName: partial.displayName || partial.name || partial.id,
    fullyQualifiedName: partial.fullyQualifiedName || '',
    isCenter: false,
    serviceName: '',
    truncatedFqn: '',
    pathLabel: '',
    columns: [],
    ...partial,
  };
}

describe('lineageServiceName', () => {
  it('uses the first FQN segment as the service', () => {
    expect(lineageServiceName('svc.db.schema.orders')).toBe('svc');
    expect(lineageServiceName('kafka.orders_events')).toBe('kafka');
    expect(lineageServiceName('')).toBe('');
  });
});

describe('lineagePathLabel', () => {
  it('joins parent segments as a breadcrumb and drops the entity leaf', () => {
    expect(lineagePathLabel('svc.db.schema.orders')).toBe('svc / db / schema');
    expect(lineagePathLabel('kafka.orders_events')).toBe('kafka');
    expect(lineagePathLabel('orders')).toBe('');
    expect(lineagePathLabel('')).toBe('');
  });
});

describe('truncateLineageFqn', () => {
  it('keeps short FQNs and ellipsizes the middle of long ones', () => {
    expect(truncateLineageFqn('svc.db.t')).toBe('svc.db.t');
    expect(truncateLineageFqn('very-long-service.analytics.marts.fact_orders_daily_snapshot')).toBe(
      'very-long-service…fact_orders_daily_snapshot',
    );
  });
});

describe('filterCanvasNodes', () => {
  const nodes = [
    node({
      id: 'a',
      name: 'orders',
      displayName: 'Orders',
      fullyQualifiedName: 'svc.db.schema.orders',
      columns: [{ fqn: 'svc.db.schema.orders.id', name: 'id' }],
    }),
    node({
      id: 'b',
      name: 'raw_orders',
      displayName: 'Raw orders',
      fullyQualifiedName: 'svc.db.schema.raw_orders',
    }),
  ];

  it('returns every node when the query is blank', () => {
    expect(filterCanvasNodes(nodes, '  ').map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('matches display name, FQN, or a mapped column leaf', () => {
    expect(filterCanvasNodes(nodes, 'RAW').map((item) => item.id)).toEqual(['b']);
    expect(filterCanvasNodes(nodes, 'schema.orders').map((item) => item.id)).toEqual(['a']);
    expect(filterCanvasNodes(nodes, 'id').map((item) => item.id)).toEqual(['a']);
  });
});
