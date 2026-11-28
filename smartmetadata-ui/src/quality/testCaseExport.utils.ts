/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official DataQualityPureUtils.getTestCaseExportFilters + TestCaseExport.utils.
 */
import type { SearchTestCasesQuery } from '@/api/testCases';

export type TestCaseExportFilters = Pick<
  SearchTestCasesQuery,
  | 'testCaseStatus'
  | 'testCaseType'
  | 'entityLink'
  | 'tags'
  | 'tier'
  | 'owner'
  | 'q'
  | 'testPlatforms'
  | 'dataQualityDimension'
  | 'serviceName'
  | 'dataProductFqn'
  | 'startTimestamp'
  | 'endTimestamp'
>;

const TEST_CASE_EXPORT_FILTER_KEYS: (keyof TestCaseExportFilters)[] = [
  'testCaseStatus',
  'testCaseType',
  'entityLink',
  'tags',
  'tier',
  'owner',
  'q',
  'testPlatforms',
  'dataQualityDimension',
  'serviceName',
  'dataProductFqn',
  'startTimestamp',
  'endTimestamp',
];

function isEmptyFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/** Keeps only list params the exportAsync endpoint accepts (official pin). */
export function getTestCaseExportFilters(
  params?: Partial<SearchTestCasesQuery>,
): TestCaseExportFilters {
  const picked: TestCaseExportFilters = {};
  if (!params) {
    return picked;
  }
  for (const key of TEST_CASE_EXPORT_FILTER_KEYS) {
    const value = params[key];
    if (!isEmptyFilterValue(value)) {
      (picked as Record<string, unknown>)[key] = value;
    }
  }
  return picked;
}