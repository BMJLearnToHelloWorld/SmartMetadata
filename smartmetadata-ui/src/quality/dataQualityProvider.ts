/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { StatusCounts } from '@/quality/landing';
import { dqProviderFiltersFromRouteQuery } from '@/quality/testCaseListRouteParams';
import type { TestSummary } from '@/types/quality';

/** Pin INITIAL_TEST_SUMMARY (constants/TestSuite.constant.ts). */
export const INITIAL_DATA_QUALITY_TEST_SUMMARY: TestSummary = {
  success: 0,
  failed: 0,
  aborted: 0,
  total: 0,
};

export function testSummaryFromStatusCounts(counts: StatusCounts | null): TestSummary {
  if (!counts?.total) {
    return { ...INITIAL_DATA_QUALITY_TEST_SUMMARY };
  }
  return {
    success: counts.success,
    failed: counts.failed,
    aborted: counts.aborted,
    queued: counts.queued,
    total: counts.total,
  };
}

/** Map list-tab URL query into dashboard chart filters (DataQualityProvider.tsx). */
export function dqProviderFiltersFromRoute(route: RouteLocationNormalizedLoaded) {
  return dqProviderFiltersFromRouteQuery(route.query);
}