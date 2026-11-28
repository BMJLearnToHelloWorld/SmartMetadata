/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { DqDashboardChartFilters } from '@/quality/dashboard';
import type { StatusCounts } from '@/quality/landing';
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

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function queryStringList(value: unknown): string[] | undefined {
  const list = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === 'string' && Boolean(item),
  );
  return list.length ? list : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function ownerFqnFromQuery(value: unknown): string | undefined {
  const raw = queryString(value);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as { name?: string };
    return typeof parsed?.name === 'string' && parsed.name ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map list-tab URL query into dashboard chart filters for the provider
 * summary batch (DataQualityProvider.tsx filterParams subset).
 */
export function dqProviderFiltersFromRoute(
  route: RouteLocationNormalizedLoaded,
): DqDashboardChartFilters {
  const q = route.query;
  const filters: DqDashboardChartFilters = {};
  const entityFQN = queryString(q.tableFqn);
  if (entityFQN) {
    filters.entityFQN = entityFQN;
  }
  const tier = queryString(q.tier);
  if (tier) {
    filters.tier = [tier];
  }
  const tags = queryString(q.tags);
  if (tags) {
    filters.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  const dataProductFqn = queryString(q.dataProductFqn);
  if (dataProductFqn) {
    filters.dataProductFqns = [dataProductFqn];
  }
  const ownerFqn = ownerFqnFromQuery(q.owner);
  if (ownerFqn) {
    filters.ownerFqn = ownerFqn;
  }
  const startTs = queryNumber(q.startTs);
  const endTs = queryNumber(q.endTs);
  if (startTs) {
    filters.startTs = startTs;
  }
  if (endTs) {
    filters.endTs = endTs;
  }
  const glossary = queryStringList(q.glossaryTerms);
  if (glossary) {
    filters.glossaryTerms = glossary;
  }
  return filters;
}