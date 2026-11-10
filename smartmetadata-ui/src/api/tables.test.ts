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
import { getTableByName } from './tables';

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
});
