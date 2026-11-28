/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import {
  dqProviderFiltersFromRoute,
  testSummaryFromStatusCounts,
} from './dataQualityProvider';

describe('dataQualityProvider', () => {
  it('maps list-tab query params into dashboard chart filters', () => {
    const filters = dqProviderFiltersFromRoute({
      query: {
        tableFqn: 'sample.db.t',
        tier: 'Tier.Gold',
        tags: 'tag.a,tag.b',
        dataProductFqn: 'dp.fqn',
        owner: JSON.stringify({ name: 'alice' }),
        startTs: '1000',
        endTs: '2000',
        serviceName: 'mysql',
        testPlatforms: ['dbt'],
        testCaseStatus: 'Failed',
        testCaseType: 'table',
        dataQualityDimension: 'Completeness',
      },
    } as never);
    expect(filters).toEqual({
      entityFQN: 'sample.db.t',
      tier: ['Tier.Gold'],
      tags: ['tag.a', 'tag.b'],
      dataProductFqns: ['dp.fqn'],
      ownerFqn: 'alice',
      startTs: 1000,
      endTs: 2000,
      serviceName: 'mysql',
      testPlatforms: ['dbt'],
      testCaseStatus: 'Failed',
      testCaseType: 'table',
      dataQualityDimension: 'Completeness',
    });
  });

  it('builds TestSummary from status counts', () => {
    expect(testSummaryFromStatusCounts(null)).toEqual({
      success: 0,
      failed: 0,
      aborted: 0,
      total: 0,
    });
    expect(
      testSummaryFromStatusCounts({
        success: 3,
        failed: 1,
        aborted: 0,
        queued: 2,
        total: 6,
      }),
    ).toEqual({
      success: 3,
      failed: 1,
      aborted: 0,
      queued: 2,
      total: 6,
    });
  });
});