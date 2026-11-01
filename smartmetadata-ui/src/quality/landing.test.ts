/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { TestCase, TestDefinition, TestSuite } from '@/types/quality';
import {
  coverageFrom,
  dimensionCards,
  filterCasesForSearch,
  governanceFiltersActive,
  healthFromCases,
  healthFromTableSuites,
  matchesOwner,
  NO_DIMENSION,
  parseDqTab,
  parseSuiteSubTab,
  statusCountsFromCases,
  successPercent,
  suiteTypeForSubTab,
  tableCountFromFacets,
  uniqueCoveredAssets,
} from './landing';

function testCase(partial: Partial<TestCase> & Pick<TestCase, 'id' | 'name'>): TestCase {
  return {
    testSuites: [],
    parameterValues: [],
    ...partial,
  };
}

describe('DQ landing helpers', () => {
  it('parses tabs and suite sub-tabs from the URL', () => {
    expect(parseDqTab(undefined)).toBe('dashboard');
    expect(parseDqTab('test-cases')).toBe('test-cases');
    expect(parseDqTab('test-suites')).toBe('test-suites');
    expect(parseDqTab('nope')).toBe('dashboard');
    expect(parseDqTab('summary')).toBe('dashboard');
    expect(parseSuiteSubTab('bundle-suites')).toBe('bundle-suites');
    expect(parseSuiteSubTab('')).toBe('table-suites');
    expect(suiteTypeForSubTab('table-suites')).toBe('basic');
    expect(suiteTypeForSubTab('bundle-suites')).toBe('logical');
  });

  it('counts latest test statuses without inventing missing buckets', () => {
    const counts = statusCountsFromCases([
      testCase({ id: '1', name: 'a', testCaseResult: { testCaseStatus: 'Success' } }),
      testCase({ id: '2', name: 'b', testCaseStatus: 'Failed' }),
      testCase({ id: '3', name: 'c', testCaseResult: { testCaseStatus: 'Aborted' } }),
      testCase({ id: '4', name: 'd' }),
    ]);
    expect(counts).toEqual({ success: 1, failed: 1, aborted: 1, queued: 0, total: 3 });
  });

  it('computes coverage from listed assets vs table facet count', () => {
    expect(coverageFrom(undefined, undefined)).toBeNull();
    expect(coverageFrom(9, 20897)).toEqual({ covered: 9, notCovered: 20888, total: 20897 });
    expect(coverageFrom(12, 10)).toEqual({ covered: 12, notCovered: 0, total: 12 });
    expect(
      uniqueCoveredAssets([
        testCase({ id: '1', name: 'a', entityFQN: 'svc.db.schema.orders' }),
        testCase({ id: '2', name: 'b', entityFQN: 'svc.db.schema.orders' }),
        testCase({ id: '3', name: 'c', entityFQN: 'svc.db.schema.users' }),
      ]),
    ).toBe(2);
  });

  it('treats an asset as unhealthy when any test failed or aborted', () => {
    expect(
      healthFromCases([
        testCase({ id: '1', name: 'a', entityFQN: 'orders', testCaseStatus: 'Success' }),
        testCase({ id: '2', name: 'b', entityFQN: 'orders', testCaseStatus: 'Failed' }),
        testCase({ id: '3', name: 'c', entityFQN: 'users', testCaseStatus: 'Success' }),
      ]),
    ).toEqual({ healthy: 1, unhealthy: 1, total: 2 });
  });

  it('counts table-suite health from summary failed/aborted', () => {
    const suites: TestSuite[] = [
      { id: '1', name: 't1', basic: true, tests: [], owners: [], summary: { failed: 0, aborted: 0, success: 2 } },
      { id: '2', name: 't2', basic: true, tests: [], owners: [], summary: { failed: 1 } },
      { id: '3', name: 'logical', basic: false, tests: [], owners: [], summary: { failed: 9 } },
    ];
    expect(healthFromTableSuites(suites)).toEqual({ healthy: 1, unhealthy: 1, total: 2 });
  });

  it('builds the eight dimension cards from definition metadata', () => {
    const definitions: TestDefinition[] = [
      {
        id: 'd1',
        name: 'completenessCheck',
        fullyQualifiedName: 'completenessCheck',
        testPlatforms: [],
        parameterDefinition: [],
        dataQualityDimension: 'Completeness',
      },
      {
        id: 'd2',
        name: 'integrityCheck',
        testPlatforms: [],
        parameterDefinition: [],
        dataQualityDimension: 'Integrity',
      },
    ];
    const cards = dimensionCards(
      [
        testCase({
          id: '1',
          name: 'a',
          testDefinition: { name: 'completenessCheck' },
          testCaseStatus: 'Success',
        }),
        testCase({
          id: '2',
          name: 'b',
          testDefinition: { name: 'integrityCheck' },
          testCaseStatus: 'Failed',
        }),
        testCase({ id: '3', name: 'c', testCaseStatus: 'Queued' }),
      ],
      definitions,
    );
    expect(cards).toHaveLength(8);
    expect(cards.find((card) => card.id === 'Completeness')).toMatchObject({ success: 1, total: 1 });
    expect(cards.find((card) => card.id === 'Integrity')).toMatchObject({ failed: 1, total: 1 });
    expect(cards.find((card) => card.id === NO_DIMENSION)).toMatchObject({ queued: 1, total: 1 });
    expect(cards.find((card) => card.id === 'Accuracy')?.total).toBe(0);
  });

  it('reads table count from search aggregations and flags governance filters', () => {
    expect(
      tableCountFromFacets([
        { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 20 }, { key: 'topic', count: 3 }] },
      ]),
    ).toBe(20);
    expect(governanceFiltersActive({})).toBe(false);
    expect(governanceFiltersActive({ owner: 'alice' })).toBe(true);
    expect(matchesOwner([{ name: 'alice' }], 'alice')).toBe(true);
    expect(matchesOwner([{ name: 'bob' }], 'alice')).toBe(false);
  });

  it('filters listed rows by name without inventing matches', () => {
    const rows = [
      testCase({ id: '1', name: 'row_count', entityFQN: 'svc.db.schema.orders' }),
      testCase({ id: '2', name: 'null_count', entityFQN: 'svc.db.schema.users' }),
    ];
    expect(filterCasesForSearch(rows, 'orders').map((item) => item.id)).toEqual(['1']);
    expect(filterCasesForSearch(rows, 'missing')).toEqual([]);
    expect(successPercent({ success: 2, total: 4 })).toBe(50);
    expect(successPercent(undefined)).toBeUndefined();
  });
});
