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
  attachColumnPorts,
  columnBelongsToNode,
  columnLeafName,
  columnLineageEdges,
  highlightForColumn,
} from './columnPorts';
import { mapEntityLineage } from './graphModel';

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
  ],
  upstreamEdges: [
    {
      fromEntity: 'up-id',
      toEntity: 'center-id',
      lineageDetails: {
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
  downstreamEdges: [],
};

describe('column FQN helpers', () => {
  it('treats a column FQN as belonging to its parent entity FQN', () => {
    expect(columnBelongsToNode('svc.db.schema.orders.id', 'svc.db.schema.orders')).toBe(true);
    expect(columnBelongsToNode('svc.db.schema.orders.id', 'svc.db.schema.raw_orders')).toBe(false);
    expect(columnLeafName('svc.db.schema.orders.id')).toBe('id');
  });
});

describe('attachColumnPorts', () => {
  it('adds only columns that the lineage GET already mapped', () => {
    const model = attachColumnPorts(mapEntityLineage(PAYLOAD));
    const center = model.nodes.find((node) => node.id === 'center-id');
    const upstream = model.nodes.find((node) => node.id === 'up-id');
    expect(center?.columns).toEqual([{ fqn: 'svc.db.schema.orders.id', name: 'id' }]);
    expect(upstream?.columns).toEqual([{ fqn: 'svc.db.schema.raw_orders.id', name: 'id' }]);
  });

  it('does not invent ports when the API sent no columnsLineage', () => {
    const model = attachColumnPorts(
      mapEntityLineage({
        entity: { id: 'a', type: 'table', name: 'a', fullyQualifiedName: 't.a' },
        nodes: [{ id: 'b', type: 'table', name: 'b', fullyQualifiedName: 't.b' }],
        upstreamEdges: [{ fromEntity: 'b', toEntity: 'a' }],
      }),
    );
    expect(model.nodes.every((node) => node.columns.length === 0)).toBe(true);
  });
});

describe('columnLineageEdges', () => {
  it('builds handle-to-handle edges from columnsLineage without dropping entity edges', () => {
    const model = attachColumnPorts(mapEntityLineage(PAYLOAD));
    const columnEdges = columnLineageEdges(model);
    expect(model.edges).toHaveLength(1);
    expect(columnEdges).toEqual([
      expect.objectContaining({
        source: 'up-id',
        target: 'center-id',
        sourceHandle: 'svc.db.schema.raw_orders.id',
        targetHandle: 'svc.db.schema.orders.id',
        isColumnEdge: true,
      }),
    ]);
  });
});

describe('highlightForColumn', () => {
  it('returns the nodes and entity edges that mention the column FQN', () => {
    const model = attachColumnPorts(mapEntityLineage(PAYLOAD));
    const highlighted = highlightForColumn(model, 'svc.db.schema.orders.id');
    expect(highlighted.nodeIds.sort()).toEqual(['center-id']);
    expect(highlighted.edgeIds).toHaveLength(1);
  });
});
