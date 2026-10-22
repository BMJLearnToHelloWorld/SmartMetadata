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
import { createTestIncident, listTestIncidents } from './testIncidents';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testIncidents API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists latest incidents from GET /v1/dataQuality/testCases/testCaseIncidentStatus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'inc1',
                testCaseResolutionStatusType: 'New',
                testCaseReference: { name: 'row_count', fullyQualifiedName: 'svc.db.schema.orders.row_count' },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestIncidents({ latest: true });
    expect(page.data[0]?.testCaseResolutionStatusType).toBe('New');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/testCaseIncidentStatus');
    expect(lastFetch().url).toContain('latest=true');
  });

  it('posts a resolution status with required type and testCaseReference', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          testCaseResolutionStatusType: 'Ack',
          testCaseReference: 'svc.db.schema.orders.row_count',
        });
        return new Response(JSON.stringify({ id: 'inc2', testCaseResolutionStatusType: 'Ack' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTestIncident({
      testCaseResolutionStatusType: 'Ack',
      testCaseReference: 'svc.db.schema.orders.row_count',
    });
    expect(created.id).toBe('inc2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('posts Resolved with schema-required failure reason and comment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          testCaseResolutionStatusType: 'Resolved',
          testCaseReference: 'svc.db.schema.orders.row_count',
          testCaseResolutionStatusDetails: {
            testCaseFailureReason: 'FalsePositive',
            testCaseFailureComment: 'Expected empty overnight',
          },
        });
        return new Response(JSON.stringify({ id: 'inc3', testCaseResolutionStatusType: 'Resolved' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    await createTestIncident({
      testCaseResolutionStatusType: 'Resolved',
      testCaseReference: 'svc.db.schema.orders.row_count',
      testCaseResolutionStatusDetails: {
        testCaseFailureReason: 'FalsePositive',
        testCaseFailureComment: 'Expected empty overnight',
      },
    });
    expect(lastFetch().init?.method).toBe('POST');
  });
});
