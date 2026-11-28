/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { DqDashboardChartFilters } from '@/quality/dashboard';
import { TEST_CASE_FILTER_KEYS } from '@/quality/testCaseFilters';

/**
 * URL-backed test-case list params (openmetadata-ui DataQuality.interface.ts
 * TestCaseSearchParams + useTestCaseFilters URL parse).
 */
export interface TestCaseListRouteParams {
  searchValue?: string;
  tableFqn?: string;
  testPlatforms?: string[];
  testCaseStatus?: string | string[];
  testCaseType?: string;
  tier?: string;
  tags?: string;
  serviceName?: string;
  dataQualityDimension?: string;
  dataProductFqn?: string;
  owner?: string;
  lastRunStartTs?: number;
  lastRunEndTs?: number;
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

function parsePlatforms(value: unknown): string[] | undefined {
  const direct = queryStringList(value);
  if (direct?.length) {
    return direct;
  }
  const csv = queryString(value);
  if (!csv) {
    return undefined;
  }
  const list = csv.split(',').map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function parseStatus(value: unknown): string | string[] | undefined {
  const list = queryStringList(value);
  if (list?.length) {
    return list.length === 1 ? list[0] : list;
  }
  return queryString(value);
}

function parseLastRun(query: LocationQuery): { startTs?: number; endTs?: number } {
  const startDirect = queryNumber(query.startTs);
  const endDirect = queryNumber(query.endTs);
  if (startDirect !== undefined || endDirect !== undefined) {
    return { startTs: startDirect, endTs: endDirect };
  }
  const nested = query.lastRunRange;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const rec = nested as Record<string, unknown>;
    return {
      startTs: queryNumber(rec.startTs),
      endTs: queryNumber(rec.endTs),
    };
  }
  return {
    startTs: queryNumber(query['lastRunRange[startTs]']),
    endTs: queryNumber(query['lastRunRange[endTs]']),
  };
}

export function parseTestCaseListRouteQuery(query: LocationQuery): TestCaseListRouteParams {
  const lastRun = parseLastRun(query);
  const params: TestCaseListRouteParams = {};
  const searchValue = queryString(query.searchValue);
  if (searchValue) {
    params.searchValue = searchValue;
  }
  const tableFqn = queryString(query.tableFqn);
  if (tableFqn) {
    params.tableFqn = tableFqn;
  }
  const platforms = parsePlatforms(query.testPlatforms);
  if (platforms) {
    params.testPlatforms = platforms;
  }
  const status = parseStatus(query.testCaseStatus);
  if (status) {
    params.testCaseStatus = status;
  }
  const type = queryString(query.testCaseType);
  if (type) {
    params.testCaseType = type;
  }
  const tier = queryString(query.tier);
  if (tier) {
    params.tier = tier;
  }
  const tags = queryString(query.tags);
  if (tags) {
    params.tags = tags;
  }
  const serviceName = queryString(query.serviceName);
  if (serviceName) {
    params.serviceName = serviceName;
  }
  const dimension = queryString(query.dataQualityDimension);
  if (dimension) {
    params.dataQualityDimension = dimension;
  }
  const dataProductFqn = queryString(query.dataProductFqn);
  if (dataProductFqn) {
    params.dataProductFqn = dataProductFqn;
  }
  const owner = queryString(query.owner);
  if (owner) {
    params.owner = owner;
  }
  if (lastRun.startTs !== undefined) {
    params.lastRunStartTs = lastRun.startTs;
  }
  if (lastRun.endTs !== undefined) {
    params.lastRunEndTs = lastRun.endTs;
  }
  return params;
}

function ownerFqnFromOwnerParam(owner?: string): string | undefined {
  if (!owner) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(owner) as { name?: string };
    return typeof parsed?.name === 'string' && parsed.name ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * DataQualityProvider.tsx fetchTestSummary filter mapping from page params.
 */
export function testCaseListParamsToChartFilters(
  params: TestCaseListRouteParams,
): DqDashboardChartFilters {
  const filters: DqDashboardChartFilters = {};
  if (params.tableFqn) {
    filters.entityFQN = params.tableFqn;
  }
  if (params.tier) {
    filters.tier = [params.tier];
  }
  if (params.tags) {
    filters.tags = params.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  if (params.dataProductFqn) {
    filters.dataProductFqns = [params.dataProductFqn];
  }
  const ownerFqn = ownerFqnFromOwnerParam(params.owner);
  if (ownerFqn) {
    filters.ownerFqn = ownerFqn;
  }
  if (params.lastRunStartTs !== undefined) {
    filters.startTs = params.lastRunStartTs;
  }
  if (params.lastRunEndTs !== undefined) {
    filters.endTs = params.lastRunEndTs;
  }
  if (params.serviceName) {
    filters.serviceName = params.serviceName;
  }
  if (params.testPlatforms?.length) {
    filters.testPlatforms = params.testPlatforms;
  }
  if (params.dataQualityDimension) {
    filters.dataQualityDimension = params.dataQualityDimension;
  }
  if (params.testCaseStatus) {
    filters.testCaseStatus = params.testCaseStatus;
  }
  if (params.testCaseType) {
    filters.testCaseType = params.testCaseType;
  }
  return filters;
}

export function dqProviderFiltersFromRouteQuery(query: LocationQuery): DqDashboardChartFilters {
  return testCaseListParamsToChartFilters(parseTestCaseListRouteQuery(query));
}

/** Build a router query patch for one official filter key. */
export function testCaseListQueryPatch(
  current: LocationQuery,
  key: keyof TestCaseListRouteParams,
  value: TestCaseListRouteParams[keyof TestCaseListRouteParams] | undefined,
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...current };
  const urlKey =
    key === 'tableFqn'
      ? TEST_CASE_FILTER_KEYS.table
      : key === 'lastRunStartTs' || key === 'lastRunEndTs'
        ? undefined
        : key;
  if (key === 'lastRunStartTs' || key === 'lastRunEndTs') {
    delete next.startTs;
    delete next.endTs;
    delete next.lastRunRange;
    if (value === undefined) {
      return next;
    }
    const start =
      key === 'lastRunStartTs' ? (value as number | undefined) : queryNumber(current.startTs);
    const end =
      key === 'lastRunEndTs' ? (value as number | undefined) : queryNumber(current.endTs);
    if (start !== undefined) {
      next.startTs = String(start);
    }
    if (end !== undefined) {
      next.endTs = String(end);
    }
    return next;
  }
  if (!urlKey) {
    return next;
  }
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    delete next[urlKey];
    return next;
  }
  if (Array.isArray(value)) {
    next[urlKey] = value;
  } else {
    next[urlKey] = String(value);
  }
  delete next.currentPage;
  return next;
}

export function mergeTestCaseListFiltersToQuery(
  current: LocationQuery,
  filters: TestCaseListRouteParams,
): LocationQueryRaw {
  let next: LocationQueryRaw = { ...current };
  const entries: Array<keyof TestCaseListRouteParams> = [
    'searchValue',
    'tableFqn',
    'testPlatforms',
    'testCaseStatus',
    'testCaseType',
    'tier',
    'tags',
    'serviceName',
    'dataQualityDimension',
    'dataProductFqn',
    'owner',
  ];
  for (const key of entries) {
    next = testCaseListQueryPatch(next, key, filters[key]);
  }
  if (filters.lastRunStartTs === undefined && filters.lastRunEndTs === undefined) {
    delete next.startTs;
    delete next.endTs;
  } else {
    if (filters.lastRunStartTs !== undefined) {
      next.startTs = String(filters.lastRunStartTs);
    }
    if (filters.lastRunEndTs !== undefined) {
      next.endTs = String(filters.lastRunEndTs);
    }
  }
  return next;
}