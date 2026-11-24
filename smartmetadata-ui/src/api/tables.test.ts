/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { getTableByName, getTableShardingByName, listTables, patchTableDetails } from './tables';

describe('tables API (P2-6)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads columns from GET /v1/tables/name/{fqn}?fields=columns', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(
          JSON.stringify({
            fullyQualifiedName: 'svc.db.schema.orders',
            name: 'orders',
            columns: [
              { name: 'id', dataType: 'INT' },
              { name: 'code', dataType: 'STRING' },
              { dataType: 'STRING' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const table = await getTableByName('svc.db.schema.orders');
    expect(seenUrl).toContain('/api/v1/tables/name/svc.db.schema.orders');
    expect(seenUrl).toContain('fields=columns');
    expect(table.fullyQualifiedName).toBe('svc.db.schema.orders');
    expect(table.columns).toEqual([
      { name: 'id', dataType: 'INT' },
      { name: 'code', dataType: 'STRING' },
    ]);
  });

  it('returns an empty column list when the table carries none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'orders' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    const table = await getTableByName('svc.db.schema.orders');
    expect(table.columns).toEqual([]);
  });

  it('reads sharding fields from GET /v1/tables/name/{fqn}?fields=tableSharding,tableType (D17)', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(
          JSON.stringify({
            id: 't-1',
            fullyQualifiedName: 'svc.db.schema.orders20240101',
            name: 'orders20240101',
            tableType: 'Sharded',
            tableSharding: { prefix: 'orders' },
            deleted: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const table = await getTableShardingByName('svc.db.schema.orders20240101');
    expect(seenUrl).toContain('/api/v1/tables/name/svc.db.schema.orders20240101');
    expect(seenUrl).toContain('fields=tableSharding%2CtableType');
    expect(table).toEqual({
      id: 't-1',
      fullyQualifiedName: 'svc.db.schema.orders20240101',
      tableType: 'Sharded',
      tableSharding: { prefix: 'orders' },
      deleted: false,
    });
  });

  it('reads a table without sharding as prefix-less (D17)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 't-2', fullyQualifiedName: 'svc.db.schema.plain', name: 'plain' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    const table = await getTableShardingByName('svc.db.schema.plain');
    expect(table.tableSharding).toBeUndefined();
    expect(table.tableType).toBeUndefined();
    expect(table.deleted).toBeUndefined();
  });
});

describe('tables API (D-2 batch 4: SchemaTablesTab list + patch)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists tables by schema FQN with the pin field set and maps rows', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 't1',
                name: 'orders',
                displayName: 'Orders',
                fullyQualifiedName: 'svc.db.schema.orders',
                description: 'Order lines',
                owners: [{ id: 'u1', name: 'amy', type: 'user' }],
                domains: [],
                dataProducts: [],
                tags: [{ tagFQN: 'Tier.Tier1', name: 'Tier1' }],
                certification: { tagLabel: { tagFQN: 'Certification.Gold', name: 'Gold' } },
              },
              { name: 'nameless-row' },
            ],
            paging: { total: 2, after: 'cursor-1' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const page = await listTables({ databaseSchema: 'svc.db.schema', limit: 10 });
    expect(seenUrl).toContain('/api/v1/tables');
    expect(seenUrl).toContain('databaseSchema=svc.db.schema');
    expect(seenUrl).toContain('fields=tags%2Cowners%2Cdomains%2CdataProducts%2Ccertification');
    expect(seenUrl).toContain('include=non-deleted');
    expect(page.data).toHaveLength(2);
    expect(page.data[0]).toMatchObject({
      id: 't1',
      displayName: 'Orders',
      certification: { tagLabel: expect.objectContaining({ tagFQN: 'Certification.Gold' }) },
    });
    expect(page.data[0].owners).toHaveLength(1);
    expect(page.after).toBe('cursor-1');
  });

  it('passes include=deleted through for the show-deleted listing', async () => {
    let seenUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        seenUrl = String(input);
        return new Response(JSON.stringify({ data: [], paging: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await listTables({ databaseSchema: 'svc.db.schema', include: 'deleted' });
    expect(seenUrl).toContain('include=deleted');
  });

  it('patches a table displayName and maps the updated row', async () => {
    let seenOptions: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seenOptions = init;
        return new Response(
          JSON.stringify({ id: 't1', name: 'orders', displayName: 'Orders v2', fullyQualifiedName: 'svc.db.schema.orders' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const updated = await patchTableDetails('t1', [{ op: 'replace', path: '/displayName', value: 'Orders v2' }]);
    expect(seenOptions?.method).toBe('PATCH');
    expect((seenOptions?.headers as Record<string, string>)['Content-Type']).toBe('application/json-patch+json');
    expect(updated.displayName).toBe('Orders v2');
  });
});
