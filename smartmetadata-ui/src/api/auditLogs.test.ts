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
import { listAuditLogs } from './auditLogs';

function lastFetchUrl(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

describe('auditLogs API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists audit logs from GET /v1/audit/logs with official filter params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 7,
                eventTs: 1700000000000,
                eventType: 'CREATE',
                userName: 'admin',
                actorType: 'USER',
                entityType: 'table',
                entityFQN: 'svc.db.orders',
                summary: 'Table created',
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listAuditLogs({ userName: 'admin', actorType: 'USER', entityType: 'table' });
    expect(page.data[0]).toMatchObject({ id: 7, userName: 'admin', entityType: 'table' });
    const url = lastFetchUrl();
    expect(url).toContain('/api/v1/audit/logs');
    expect(url).toContain('userName=admin');
    expect(url).toContain('actorType=USER');
    expect(url).toContain('entityType=table');
  });

  it('keeps entries with no numeric id, keyed by the feed fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                changeEventId: 'ce1',
                summary: 'orphan',
                changeEvent: {
                  entityType: 'table',
                  entityFullyQualifiedName: 'svc.db.orders',
                  changeDescription: { fieldsAdded: [{ name: 'description', newValue: 'hi' }] },
                },
                rawEventJson: '{"x":1}',
              },
            ],
            paging: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listAuditLogs({});
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      changeEventId: 'ce1',
      summary: 'orphan',
      rawEventJson: '{"x":1}',
    });
    expect(page.data[0]?.changeEvent?.changeDescription?.fieldsAdded).toEqual([
      { name: 'description', oldValue: undefined, newValue: 'hi' },
    ]);
  });
});
