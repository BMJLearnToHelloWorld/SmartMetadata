import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISIBLE_TEST_CASE_FILTERS,
  TEST_CASE_ADVANCED_FILTER_MENU,
  TEST_CASE_FILTER_KEYS,
  TEST_CASE_PLATFORMS,
  insightPercent,
  requiresSearchPath,
  toggleTestCaseFilter,
} from './testCaseFilters';

describe('testCaseFilters', () => {
  it('defaults to the live official visible set (table, type, status, tags)', () => {
    expect(DEFAULT_VISIBLE_TEST_CASE_FILTERS).toEqual([
      TEST_CASE_FILTER_KEYS.table,
      TEST_CASE_FILTER_KEYS.type,
      TEST_CASE_FILTER_KEYS.status,
      TEST_CASE_FILTER_KEYS.tags,
    ]);
    expect(DEFAULT_VISIBLE_TEST_CASE_FILTERS).not.toContain(TEST_CASE_FILTER_KEYS.lastRun);
  });

  it('lists every official TEST_CASE_FILTERS key in the 高级 menu', () => {
    expect(TEST_CASE_ADVANCED_FILTER_MENU).toEqual([
      TEST_CASE_FILTER_KEYS.lastRun,
      TEST_CASE_FILTER_KEYS.table,
      TEST_CASE_FILTER_KEYS.platform,
      TEST_CASE_FILTER_KEYS.type,
      TEST_CASE_FILTER_KEYS.status,
      TEST_CASE_FILTER_KEYS.tags,
      TEST_CASE_FILTER_KEYS.tier,
      TEST_CASE_FILTER_KEYS.service,
      TEST_CASE_FILTER_KEYS.dimension,
      TEST_CASE_FILTER_KEYS.dataProduct,
    ]);
  });

  it('toggles a filter key without inventing extras', () => {
    const next = toggleTestCaseFilter(DEFAULT_VISIBLE_TEST_CASE_FILTERS, TEST_CASE_FILTER_KEYS.platform);
    expect(next).toContain(TEST_CASE_FILTER_KEYS.platform);
    expect(toggleTestCaseFilter(next, TEST_CASE_FILTER_KEYS.platform)).toEqual(
      DEFAULT_VISIBLE_TEST_CASE_FILTERS,
    );
  });

  it('uses official TestPlatform enum values as option labels', () => {
    expect(TEST_CASE_PLATFORMS).toEqual([
      'OpenMetadata',
      'GreatExpectations',
      'dbt',
      'Deequ',
      'Soda',
      'Other',
    ]);
  });

  it('formats official two-decimal insight percentages', () => {
    expect(insightPercent(20, 30)).toBe('66.67%');
    expect(insightPercent(5, 12)).toBe('41.67%');
    expect(insightPercent(12, 15000)).toBe('0.08%');
    expect(insightPercent(0, 0)).toBe('0%');
  });

  it('forces the search path when an advanced official param is set', () => {
    expect(requiresSearchPath({})).toBe(false);
    expect(requiresSearchPath({ serviceName: 'mysql' })).toBe(true);
    expect(requiresSearchPath({ testPlatforms: ['OpenMetadata'] })).toBe(true);
    expect(requiresSearchPath({ lastRunStartTs: 1, lastRunEndTs: 2 })).toBe(true);
  });
});
