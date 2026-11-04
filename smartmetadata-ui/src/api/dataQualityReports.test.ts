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
import {
  cardinalityFromReportRows,
  dimensionCardsFromReportRows,
  statusCountsFromReportRows,
} from '@/quality/landing';
import {
  DQ_COVERED_ASSETS_AGGREGATION,
  DQ_DIMENSION_STATUS_AGGREGATION,
  DQ_NO_DIMENSION_QUERY,
  DQ_STATUS_AGGREGATION,
  DQ_TABLE_INDEX,
  DQ_TEST_CASE_INDEX,
  DQ_TOTAL_TABLES_AGGREGATION,
  getDataQualityReportBatch,
} from './dataQualityReports';

function lastFetchBody(): Record<string, unknown> {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return JSON.parse(String(call[1]?.body ?? '{}')) as Record<string, unknown>;
}

describe('dataQualityReports API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('posts one batch with official aggregation queries and maps reports by key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                key: 'status',
                report: {
                  metadata: { keys: ['sterms#status'], dimensions: ['testCaseResult.testCaseStatus'], metrics: ['document_count'] },
                  data: [
                    { 'testCaseResult.testCaseStatus': 'Success', document_count: '4' },
                    { 'testCaseResult.testCaseStatus': 'Failed', document_count: '2' },
                  ],
                },
              },
              {
                key: 'covered',
                report: {
                  metadata: { keys: ['cardinality#entityWithTests'], dimensions: [], metrics: ['originEntityFQN'] },
                  data: [{ originEntityFQN: '7' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const reports = await getDataQualityReportBatch([
      { key: 'status', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_STATUS_AGGREGATION },
      { key: 'covered', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_COVERED_ASSETS_AGGREGATION },
    ]);
    const body = lastFetchBody();
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain(
      '/api/v1/dataQuality/testSuites/dataQualityReport/batch',
    );
    const requests = body.requests as Array<Record<string, unknown>>;
    expect(requests.map((item) => item.key)).toEqual(['status', 'covered']);
    expect(requests[0]?.aggregationQuery).toBe(DQ_STATUS_AGGREGATION);
    expect(reports.get('status')?.data).toHaveLength(2);
    expect(reports.get('covered')?.data[0]?.originEntityFQN).toBe('7');
    expect(DQ_DIMENSION_STATUS_AGGREGATION).toContain('dataQualityDimensionName');
    expect(DQ_TOTAL_TABLES_AGGREGATION).toContain('fullyQualifiedName');
    expect(DQ_TABLE_INDEX).toBe('table');
    expect(JSON.parse(DQ_NO_DIMENSION_QUERY).query.bool.must_not[0].exists.field).toBe(
      'dataQualityDimensionName',
    );
  });

  it('rejects when an item carries an error instead of a report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ results: [{ key: 'status', error: 'index unavailable' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    await expect(
      getDataQualityReportBatch([
        { key: 'status', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_STATUS_AGGREGATION },
      ]),
    ).rejects.toThrow('index unavailable');
  });

  it('rejects when a requested key returns no report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      getDataQualityReportBatch([
        { key: 'status', index: DQ_TEST_CASE_INDEX, aggregationQuery: DQ_STATUS_AGGREGATION },
      ]),
    ).rejects.toThrow('returned no report');
  });
});

describe('aggregation-row mappers', () => {
  it('buckets statuses case-insensitively from term rows', () => {
    const counts = statusCountsFromReportRows([
      { 'testCaseResult.testCaseStatus': 'Success', document_count: '4' },
      { 'testCaseResult.testCaseStatus': 'failed', document_count: '2' },
      { 'testCaseResult.testCaseStatus': 'Aborted', document_count: '1' },
      { 'testCaseResult.testCaseStatus': 'Queued', document_count: '3' },
    ]);
    expect(counts).toEqual({ success: 4, failed: 2, aborted: 1, queued: 3, total: 10 });
  });

  it('builds dimension cards from nested rows and maps missing dimensions to No Dimension', () => {
    const cards = dimensionCardsFromReportRows([
      { dataQualityDimensionName: 'Accuracy', 'testCaseResult.testCaseStatus': 'Success', document_count: '2' },
      { dataQualityDimensionName: 'Accuracy', 'testCaseResult.testCaseStatus': 'Failed', document_count: '1' },
      { 'testCaseResult.testCaseStatus': 'Failed', document_count: '5' },
    ]);
    const accuracy = cards.find((card) => card.id === 'Accuracy');
    const none = cards.find((card) => card.id === 'No Dimension');
    expect(accuracy).toMatchObject({ success: 2, failed: 1, total: 3 });
    expect(none).toMatchObject({ failed: 5, total: 5 });
  });

  it('reads cardinality counts from the aggregated field', () => {
    expect(cardinalityFromReportRows([{ originEntityFQN: '7' }], 'originEntityFQN')).toBe(7);
    expect(cardinalityFromReportRows([], 'originEntityFQN')).toBeUndefined();
    expect(cardinalityFromReportRows([{ originEntityFQN: 'n/a' }], 'originEntityFQN')).toBeUndefined();
  });
});
