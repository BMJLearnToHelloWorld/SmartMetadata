/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { LineageGraphModel } from './graphModel';
import { impactColumnRows, impactEntityRows, impactRowsToCsv } from './impact';

function node(id: string, name: string): LineageGraphModel['nodes'][number] {
  return {
    id,
    entityType: 'table',
    name,
    displayName: name,
    fullyQualifiedName: `svc.db.schema.${name}`,
    isCenter: id === 'center',
    serviceName: 'svc',
    pathLabel: 'svc / db / schema',
    truncatedFqn: name,
    columns: [],
  };
}

const MODEL: LineageGraphModel = {
  centerId: 'center',
  nodes: [node('up', 'raw_orders'), node('center', 'orders'), node('down', 'orders_mart')],
  edges: [
    {
      id: 'e1',
      source: 'up',
      target: 'center',
      label: '',
      columnMappings: [{ fromColumns: ['raw_orders.id'], toColumn: 'orders.id' }],
    },
    {
      id: 'e2',
      source: 'center',
      target: 'down',
      label: '',
      columnMappings: [{ fromColumns: ['orders.id'], toColumn: 'orders_mart.id' }],
    },
  ],
  columnMappings: [],
  hasColumnLineage: true,
};

describe('graph-derived impact', () => {
  it('walks upstream and downstream from the center with BFS depth', () => {
    expect(impactEntityRows(MODEL, 'downstream').map((row) => row.name)).toEqual(['orders_mart']);
    expect(impactEntityRows(MODEL, 'downstream')[0]?.depth).toBe(1);
    expect(impactEntityRows(MODEL, 'upstream').map((row) => row.name)).toEqual(['raw_orders']);
  });

  it('derives column rows only from traversed edges', () => {
    const rows = impactColumnRows(MODEL, 'downstream');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromColumns: 'orders.id', toColumn: 'orders_mart.id', depth: 1 });
    expect(impactColumnRows(MODEL, 'upstream')).toHaveLength(1);
  });

  it('renders CSV with only the headers the product model can fill', () => {
    const csv = impactRowsToCsv(impactEntityRows(MODEL, 'downstream'));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Display Name,Name,Fully Qualified Name,Entity Type,Direction,Level');
    expect(lines[1]).toContain('table,downstream,1');
    expect(csv).not.toContain('owners');
  });

  it('returns no rows for an empty graph instead of inventing impact', () => {
    const empty: LineageGraphModel = {
      centerId: '',
      nodes: [],
      edges: [],
      columnMappings: [],
      hasColumnLineage: false,
    };
    expect(impactEntityRows(empty, 'downstream')).toEqual([]);
    expect(impactColumnRows(empty, 'upstream')).toEqual([]);
  });
});
