/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DATA_QUALITY_FILTERS,
  toSearchParams,
  toTableCountsQuery,
  toTableStatusCounts,
} from './dataQualityFilters';

describe('dataQualityFilters', () => {
  it('defaults to all scope and the 30-day window', () => {
    expect(DEFAULT_DATA_QUALITY_FILTERS).toEqual({
      range: '30',
      scope: 'all',
      testCaseType: 'all',
    });
  });

  it('omits all-valued filters instead of sending them', () => {
    const params = toSearchParams(DEFAULT_DATA_QUALITY_FILTERS, 'admin');
    expect(params.followedBy).toBeUndefined();
    expect(params.owner).toBeUndefined();
    expect(params.testCaseType).toBeUndefined();
    expect(params.endTimestamp - params.startTimestamp).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('resolves mine to owner and followed to followedBy', () => {
    expect(toSearchParams({ range: '7', scope: 'mine', testCaseType: 'all' }, 'admin').owner).toBe(
      'admin',
    );
    expect(
      toSearchParams({ range: '7', scope: 'followed', testCaseType: 'tableColumn' }, 'admin')
        .followedBy,
    ).toBe('admin');
    expect(
      toSearchParams({ range: '7', scope: 'followed', testCaseType: 'tableColumn' }, 'admin')
        .testCaseType,
    ).toBe('tableColumn');
  });

  it('builds the per-table counts query with the window and the tables', () => {
    const parsed = JSON.parse(
      toTableCountsQuery(DEFAULT_DATA_QUALITY_FILTERS, ['db.schema.t1', 'db.schema.t2']),
    ) as { query: { bool: { must: unknown[] } } };
    const must = parsed.query.bool.must;
    expect(must).toContainEqual({ term: { deleted: false } });
    expect(must).toContainEqual({
      terms: { originEntityFQN: ['db.schema.t1', 'db.schema.t2'] },
    });
  });

  it('folds report rows into per-table status counts, keyed lowercase', () => {
    const counts = toTableStatusCounts([
      { originEntityFQN: 'DB.Schema.T1', 'testCaseResult.testCaseStatus': 'failed', document_count: '2' },
      { originEntityFQN: 'db.schema.t1', 'testCaseResult.testCaseStatus': 'success', document_count: '3' },
      { originEntityFQN: 'db.schema.t2', 'testCaseResult.testCaseStatus': 'aborted', document_count: '1' },
      { originEntityFQN: 'db.schema.t2', 'testCaseResult.testCaseStatus': 'Queued', document_count: '9' },
    ]);
    expect(counts).toEqual({
      'db.schema.t1': { passed: 3, failed: 2, aborted: 0 },
      'db.schema.t2': { passed: 0, failed: 0, aborted: 1 },
    });
  });
});
