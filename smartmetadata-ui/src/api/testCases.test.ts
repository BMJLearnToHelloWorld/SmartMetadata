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
import { toEntityLink } from '@/quality/entityLink';
import {
  createTestCase,
  deleteTestCaseFailedSampleData,
  getTestCaseFailedSampleData,
  isTestCaseSearchListAvailable,
  listTestCaseDimensionResults,
  listTestCases,
  listTestCasesBySearch,
  updateTestCase,
} from './testCases';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('testCases API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fetches dimension results from GET /v1/dataQuality/testCases/dimensionResults/{fqn} (A15)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                dimensionValues: [{ value: 'US' }],
                testCaseStatus: 'Failed',
                impactScore: 0.9,
                excludedFromRollUp: true,
                timestamp: 1700000000000,
                dimensionKey: 'country=US',
              },
              { dimensionValues: 'not-an-array' },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCaseDimensionResults('svc.db.schema.orders.row_count', {
      dimensionName: 'country',
      startTs: 1699000000000,
      endTs: 1700000000000,
    });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      testCaseStatus: 'Failed',
      impactScore: 0.9,
      excludedFromRollUp: true,
      dimensionKey: 'country=US',
    });
    expect(page.data[0]?.dimensionValues).toEqual([{ value: 'US' }]);
    expect(lastFetch().url).toContain(
      '/api/v1/dataQuality/testCases/dimensionResults/svc.db.schema.orders.row_count',
    );
    expect(lastFetch().url).toContain('dimensionName=country');
  });

  it('maps inlined incidentStatus objects and parses entityPermissions from list responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                incidentStatus: {
                  id: 'inc1',
                  testCaseResolutionStatusType: 'Ack',
                },
              },
            ],
            paging: { total: 1 },
            entityPermissions: {
              tc1: {
                resource: 'testCase',
                permissions: [{ operation: 'EditStatus', access: 'allow' }],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCases({ includePermissions: true });
    expect(page.data[0]?.incidentStatus?.testCaseResolutionStatusType).toBe('Ack');
    expect(page.entityPermissions?.tc1?.permissions[0]?.operation).toBe('EditStatus');
    expect(lastFetch().url).toContain('includePermissions=true');
  });

  it('lists cases from GET /v1/dataQuality/testCases and can filter by entityFQN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                entityFQN: 'svc.db.schema.orders',
                testCaseResult: { testCaseStatus: 'Success', timestamp: 1 },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTestCases({ entityFQN: 'svc.db.schema.orders', includeAllTests: true });
    expect(page.data[0]?.testCaseResult?.testCaseStatus).toBe('Success');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases');
    expect(lastFetch().url).toContain('entityFQN=svc.db.schema.orders');
    expect(lastFetch().url).toContain('includeAllTests=true');
  });

  it('creates a case with schema-required name, testDefinition, and entityLink', async () => {
    const entityLink = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'row_count',
          testDefinition: 'tableRowCountToBeBetween',
          entityLink,
        });
        return new Response(JSON.stringify({ id: 'tc2', name: 'row_count', entityLink }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTestCase({
      name: 'row_count',
      testDefinition: 'tableRowCountToBeBetween',
      entityLink,
      parameterValues: [
        { name: 'minValue', value: '1' },
        { name: 'maxValue', value: '100' },
      ],
    });
    expect(created.id).toBe('tc2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates a case through PUT /v1/dataQuality/testCases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'tc2', name: 'row_count' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateTestCase({
      name: 'row_count',
      testDefinition: 'tableRowCountToBeBetween',
      entityLink: toEntityLink('table', 'svc.db.schema.orders'),
      description: 'Updated',
    });
    expect(lastFetch().init?.method).toBe('PUT');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases');
  });

  it('lists via GET /v1/dataQuality/testCases/search/list when the index is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: 'tc1', name: 'row_count' }], paging: { total: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const page = await listTestCasesBySearch({ q: 'orders', testCaseStatus: 'Failed', offset: 0 });
    expect(page.data[0]?.name).toBe('row_count');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/search/list');
    expect(lastFetch().url).toContain('q=orders');
    expect(lastFetch().url).toContain('testCaseStatus=Failed');
  });

  it('fetches failed rows sample from GET …/failedRowsSample', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ columns: ['col_a'], rows: [['x']] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const data = await getTestCaseFailedSampleData('tc-id-1');
    expect(data.columns).toEqual(['col_a']);
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/tc-id-1/failedRowsSample');
    expect(lastFetch().init?.method ?? 'GET').toBe('GET');
  });

  it('deletes failed rows sample via DELETE …/failedRowsSample', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await deleteTestCaseFailedSampleData('tc-id-2');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/tc-id-2/failedRowsSample');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('treats search/list 404 as residual, not as a thrown list failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );
    await expect(isTestCaseSearchListAvailable()).resolves.toBe(false);
  });
});
