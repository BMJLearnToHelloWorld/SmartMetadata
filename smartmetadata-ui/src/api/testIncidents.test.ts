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
import { createTestIncident, getTestCaseIncidentByStateId, listTestCaseIncidentsFromSearch, listTestIncidents, patchTestIncident, severityPatch } from './testIncidents';

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

describe('listTestCaseIncidentsFromSearch (W2-2 classic list source)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads /search/list with the official defaults and never sends severity', async () => {
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
                testCaseResolutionStatusDetails: {
                  assignee: { id: 'alice', name: 'alice', type: 'user', displayName: 'Alice' },
                  testCaseFailureReason: 'FalsePositive',
                  testCaseFailureComment: 'Expected empty overnight',
                },
                updatedAt: 1760000000000,
                failureSummary: 'row_count failed',
                metrics: [{ name: 'rowCount', value: 0 }],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCaseIncidentsFromSearch({ include: 'non-deleted' });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/dataQuality/testCases/testCaseIncidentStatus/search/list');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
    expect(url).toContain('latest=true');
    expect(url).toContain('include=non-deleted');
    expect(url).not.toContain('severity');
    // P0 model: details, updatedAt, failureSummary and metrics survive the map.
    const row = page.data[0];
    expect(row?.testCaseResolutionStatusDetails?.assignee?.name).toBe('alice');
    expect(row?.testCaseResolutionStatusDetails?.testCaseFailureReason).toBe('FalsePositive');
    expect(row?.updatedAt).toBe(1760000000000);
    expect(row?.failureSummary).toBe('row_count failed');
    expect(row?.metrics).toEqual([{ name: 'rowCount', value: 0 }]);
  });

  it('forwards filters, paging offset and the date field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    );
    await listTestCaseIncidentsFromSearch({
      limit: 10,
      offset: 20,
      testCaseFQN: 'svc.db.schema.orders.row_count',
      assignee: 'alice',
      testCaseResolutionStatusType: 'Ack',
      startTs: 1759000000000,
      endTs: 1760000000000,
      dateField: 'updatedAt',
      domain: 'finance',
    });
    const url = lastFetch().url;
    expect(url).toContain('offset=20');
    expect(url).toContain('testCaseFQN=svc.db.schema.orders.row_count');
    expect(url).toContain('assignee=alice');
    expect(url).toContain('testCaseResolutionStatusType=Ack');
    expect(url).toContain('startTs=1759000000000');
    expect(url).toContain('endTs=1760000000000');
    expect(url).toContain('dateField=updatedAt');
    expect(url).toContain('domain=finance');
  });

  it('reads one incident back by stateId with limit 1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 'inc1', testCaseResolutionStatusType: 'Ack' }], paging: { total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const row = await getTestCaseIncidentByStateId('task-1');
    expect(row?.id).toBe('inc1');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/testCaseIncidentStatus/stateId/task-1');
    expect(lastFetch().url).toContain('limit=1');
  });

  it('returns undefined when the stateId read-back finds no row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    expect(await getTestCaseIncidentByStateId('task-gone')).toBeUndefined();
  });

  it('PATCHes severity as JSON Patch with the json-patch content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('Content-Type')).toBe('application/json-patch+json');
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body ?? '[]'))).toEqual([
          { op: 'replace', path: '/severity', value: 'Severity3' },
        ]);
        return new Response(JSON.stringify({ id: 'inc1', severity: 'Severity3' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const patched = await patchTestIncident('inc1', [{ op: 'replace', path: '/severity', value: 'Severity3' }]);
    expect(patched.severity).toBe('Severity3');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/testCaseIncidentStatus/inc1');
  });

  it('severityPatch replaces, adds, removes and skips unchanged values', () => {
    expect(severityPatch('Severity2', 'Severity3')).toEqual([
      { op: 'replace', path: '/severity', value: 'Severity3' },
    ]);
    expect(severityPatch(undefined, 'Severity1')).toEqual([
      { op: 'add', path: '/severity', value: 'Severity1' },
    ]);
    expect(severityPatch('Severity2', undefined)).toEqual([{ op: 'remove', path: '/severity' }]);
    expect(severityPatch(undefined, undefined)).toEqual([]);
    // Equal values still produce a replace op; the view guards unchanged
    // selections before calling, so this never reaches the server.
    expect(severityPatch('Severity2', 'Severity2')).toEqual([
      { op: 'replace', path: '/severity', value: 'Severity2' },
    ]);
  });
});
