/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchHit } from '@/types/api';
import {
  buildShardedFamilyQueryFilter,
  findShardedFamilies,
  parseShardName,
} from './tableSharding';

function hit(fqn: string): SearchHit {
  return {
    name: fqn.split('.').at(-1) ?? fqn,
    fullyQualifiedName: fqn,
    entityType: 'table',
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
  };
}

describe('parseShardName (pin TableShardingUtils)', () => {
  it('parses a dated shard suffix into prefix + logical name', () => {
    expect(parseShardName('orders20240101')).toEqual({
      prefix: 'orders',
      date: '2024-01-01',
      logicalName: 'ordersyyyymmdd',
    });
  });

  it('strips a trailing $YYYYMMDD before parsing', () => {
    expect(parseShardName('orders20240101$20240101')).toEqual({
      prefix: 'orders',
      date: '2024-01-01',
      logicalName: 'ordersyyyymmdd',
    });
  });

  it('rejects a non-date suffix and an impossible calendar date', () => {
    expect(parseShardName('orders')).toBeUndefined();
    expect(parseShardName('orders20240230')).toBeUndefined();
    expect(parseShardName('orders00000101')).toBeUndefined();
  });

  it('rejects a stray $ that is not a trailing date suffix', () => {
    expect(parseShardName('ord$ers20240101')).toBeUndefined();
  });
});

describe('buildShardedFamilyQueryFilter (pin findShardedFamilies terms)', () => {
  it('returns undefined for a query that cannot name a sharded family', () => {
    expect(buildShardedFamilyQueryFilter('orders')).toBeUndefined();
    expect(buildShardedFamilyQueryFilter('')).toBeUndefined();
    expect(buildShardedFamilyQueryFilter('a.b.c.d.e20240101')).toBeUndefined();
  });

  it('builds the BigQuery + Sharded + logical-name terms for a bare shard name', () => {
    const built = buildShardedFamilyQueryFilter('orders20240101');
    expect(built?.candidate).toEqual({ prefix: 'orders', date: '2024-01-01', logicalName: 'ordersyyyymmdd' });
    const filter = JSON.parse(built?.queryFilter ?? '');
    expect(filter.query.bool.must).toContainEqual({ term: { serviceType: 'BigQuery' } });
    expect(filter.query.bool.must).toContainEqual({ term: { tableType: 'Sharded' } });
    expect(filter.query.bool.must).toContainEqual({ term: { 'name.keyword': 'ordersyyyymmdd' } });
  });

  it('maps leading FQN parts to service / database / schema qualifier terms', () => {
    const built = buildShardedFamilyQueryFilter('svc.db.schema.orders20240101');
    const filter = JSON.parse(built?.queryFilter ?? '');
    expect(filter.query.bool.must).toContainEqual({ term: { 'service.name': 'svc' } });
    expect(filter.query.bool.must).toContainEqual({ term: { 'database.name': 'db' } });
    expect(filter.query.bool.must).toContainEqual({ term: { 'databaseSchema.name': 'schema' } });
  });

  it('merges a saved query_filter in front of the shard terms', () => {
    const saved = JSON.stringify({ query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } } });
    const built = buildShardedFamilyQueryFilter('orders20240101', saved);
    const filter = JSON.parse(built?.queryFilter ?? '');
    expect(filter.query.bool.must[0]).toEqual({
      bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] },
    });
  });

  it('ignores an unparseable saved query_filter', () => {
    const built = buildShardedFamilyQueryFilter('orders20240101', '{not json');
    expect(JSON.parse(built?.queryFilter ?? '').query.bool.must).toHaveLength(3);
  });
});

describe('findShardedFamilies (pin TableShardingUtils)', () => {
  it('keeps only candidates whose sharding prefix matches, deduped by id', async () => {
    const searchTables = vi.fn(async () => [
      hit('svc.db.schema.orders20240101'),
      hit('svc.db.schema.orders20240102'),
      hit('svc.db.schema.orders20240101'),
    ]);
    const fetchTable = vi.fn(async (fqn: string) => ({
      id: `id-${fqn}`,
      fullyQualifiedName: fqn,
      tableSharding: { prefix: fqn.endsWith('20240102') ? 'other' : 'orders' },
    }));
    const families = await findShardedFamilies('svc.db.schema.orders20240101', {
      searchTables,
      fetchTable,
    });
    expect(searchTables).toHaveBeenCalledTimes(1);
    expect(families).toEqual([
      { id: 'id-svc.db.schema.orders20240101', fullyQualifiedName: 'svc.db.schema.orders20240101' },
    ]);
  });

  it('drops deleted tables unless includeDeleted', async () => {
    const searchTables = vi.fn(async () => [hit('svc.db.schema.orders20240101')]);
    const fetchTable = vi.fn(async (fqn: string) => ({
      id: 'id-1',
      fullyQualifiedName: fqn,
      tableSharding: { prefix: 'orders' },
      deleted: true,
    }));
    await expect(
      findShardedFamilies('orders20240101', { searchTables, fetchTable }),
    ).resolves.toEqual([]);
    await expect(
      findShardedFamilies('orders20240101', { searchTables, fetchTable, includeDeleted: true }),
    ).resolves.toEqual([{ id: 'id-1', fullyQualifiedName: 'svc.db.schema.orders20240101' }]);
  });

  it('returns no rows when the search fails or a table read fails', async () => {
    await expect(
      findShardedFamilies('orders20240101', {
        searchTables: async () => {
          throw new Error('down');
        },
        fetchTable: async () => undefined,
      }),
    ).resolves.toEqual([]);
    await expect(
      findShardedFamilies('orders20240101', {
        searchTables: async () => [hit('svc.db.schema.orders20240101')],
        fetchTable: async () => {
          throw new Error('down');
        },
      }),
    ).resolves.toEqual([]);
  });
});
