/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import {
  dqProviderFiltersFromRouteQuery,
  mergeTestCaseListFiltersToQuery,
  parseTestCaseListRouteQuery,
  testCaseListParamsToChartFilters,
} from './testCaseListRouteParams';

describe('testCaseListRouteParams', () => {
  it('parses official list query keys into route params', () => {
    expect(
      parseTestCaseListRouteQuery({
        searchValue: 'dq',
        tableFqn: 't1',
        testPlatforms: ['OpenMetadata', 'dbt'],
        testCaseStatus: ['Success', 'Queued'],
        testCaseType: 'column',
        serviceName: 'mysql',
        dataQualityDimension: 'Completeness',
        startTs: '100',
        endTs: '200',
      }),
    ).toMatchObject({
      searchValue: 'dq',
      tableFqn: 't1',
      testPlatforms: ['OpenMetadata', 'dbt'],
      testCaseStatus: ['Success', 'Queued'],
      testCaseType: 'column',
      serviceName: 'mysql',
      dataQualityDimension: 'Completeness',
      lastRunStartTs: 100,
      lastRunEndTs: 200,
    });
  });

  it('maps list params to provider chart filters (DataQualityProvider.tsx pick)', () => {
    const chart = testCaseListParamsToChartFilters({
      tableFqn: 'sample.db.t',
      tier: 'Tier.Gold',
      tags: 'a,b',
      dataProductFqn: 'dp',
      owner: JSON.stringify({ name: 'alice' }),
      serviceName: 'mysql',
      testPlatforms: ['dbt'],
      dataQualityDimension: 'Completeness',
      testCaseStatus: 'Failed',
      testCaseType: 'table',
      lastRunStartTs: 10,
      lastRunEndTs: 20,
    });
    expect(chart).toEqual({
      entityFQN: 'sample.db.t',
      tier: ['Tier.Gold'],
      tags: ['a', 'b'],
      dataProductFqns: ['dp'],
      ownerFqn: 'alice',
      serviceName: 'mysql',
      testPlatforms: ['dbt'],
      dataQualityDimension: 'Completeness',
      testCaseStatus: 'Failed',
      testCaseType: 'table',
      startTs: 10,
      endTs: 20,
    });
    expect(dqProviderFiltersFromRouteQuery({ serviceName: 'mysql' }).serviceName).toBe('mysql');
  });

  it('writes filter changes back to the route query', () => {
    const next = mergeTestCaseListFiltersToQuery(
      { tab: 'test-cases' },
      { serviceName: 'postgres', testCaseStatus: 'Aborted' },
    );
    expect(next).toMatchObject({
      tab: 'test-cases',
      serviceName: 'postgres',
      testCaseStatus: 'Aborted',
    });
    expect(next.currentPage).toBeUndefined();
  });
});