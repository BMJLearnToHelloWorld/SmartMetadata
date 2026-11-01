/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { SearchFacet } from '@/catalog/searchFacets';
import type { EntityRef } from '@/types/api';
import type { TestCase, TestDefinition, TestSuite } from '@/types/quality';

/**
 * Official DataQualityPage tab keys (DataQualityPage.interface.ts):
 * dashboard / test-cases / test-suites, default dashboard. The pre-Stage 5
 * product key 'summary' is kept only as a legacy alias below so old
 * ?tab=summary URLs still land on the dashboard tab.
 */
export const DQ_LANDING_TABS = ['dashboard', 'test-cases', 'test-suites'] as const;
export type DqLandingTab = (typeof DQ_LANDING_TABS)[number];

const LEGACY_DQ_TAB_ALIASES: Record<string, DqLandingTab> = {
  summary: 'dashboard',
};

export const DQ_SUITE_SUBTABS = ['table-suites', 'bundle-suites'] as const;
export type DqSuiteSubTab = (typeof DQ_SUITE_SUBTABS)[number];

export const DQ_DIMENSIONS = [
  'Accuracy',
  'Completeness',
  'Consistency',
  'Integrity',
  'SQL',
  'Uniqueness',
  'Validity',
] as const;

export const NO_DIMENSION = 'No Dimension';

export const DQ_GOVERNANCE_FILTERS = [
  'owner',
  'tier',
  'certification',
  'tag',
  'glossaryTerm',
  'dataProduct',
] as const;

export type DqGovernanceFilterId = (typeof DQ_GOVERNANCE_FILTERS)[number];

export interface DqGovernanceFilters {
  owner?: string;
  tier?: string;
  certification?: string;
  tag?: string;
  glossaryTerm?: string;
  dataProduct?: string;
}

export interface StatusCounts {
  success: number;
  failed: number;
  aborted: number;
  queued: number;
  total: number;
}

export interface CoverageCounts {
  covered: number;
  notCovered: number;
  total: number;
}

export interface HealthCounts {
  healthy: number;
  unhealthy: number;
  total: number;
}

export interface DimensionCard extends StatusCounts {
  id: string;
}

export function parseDqTab(value: unknown): DqLandingTab {
  if (value === 'test-cases' || value === 'test-suites' || value === 'dashboard') {
    return value;
  }
  if (typeof value === 'string' && value in LEGACY_DQ_TAB_ALIASES) {
    return LEGACY_DQ_TAB_ALIASES[value];
  }
  return 'dashboard';
}

export function parseSuiteSubTab(value: unknown): DqSuiteSubTab {
  return value === 'bundle-suites' ? 'bundle-suites' : 'table-suites';
}

export function suiteTypeForSubTab(subTab: DqSuiteSubTab): 'basic' | 'logical' {
  return subTab === 'table-suites' ? 'basic' : 'logical';
}

export function emptyStatusCounts(): StatusCounts {
  return { success: 0, failed: 0, aborted: 0, queued: 0, total: 0 };
}

export function testCaseStatus(item: TestCase): string | undefined {
  return item.testCaseResult?.testCaseStatus || item.testCaseStatus;
}

function bumpStatus(counts: StatusCounts, status?: string): void {
  const key = status?.trim().toLowerCase();
  if (key === 'success') {
    counts.success += 1;
  } else if (key === 'failed') {
    counts.failed += 1;
  } else if (key === 'aborted') {
    counts.aborted += 1;
  } else if (key === 'queued') {
    counts.queued += 1;
  }
  counts.total = counts.success + counts.failed + counts.aborted + counts.queued;
}

export function statusCountsFromCases(cases: TestCase[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const item of cases) {
    bumpStatus(counts, testCaseStatus(item));
  }
  return counts;
}

export function coverageFrom(
  coveredHint: number | undefined,
  tableCount: number | undefined,
): CoverageCounts | null {
  if (coveredHint === undefined && tableCount === undefined) {
    return null;
  }
  const covered = Math.max(0, coveredHint ?? 0);
  const total = Math.max(tableCount ?? 0, covered);
  return { covered, notCovered: Math.max(0, total - covered), total };
}

export function uniqueCoveredAssets(cases: TestCase[]): number {
  const keys = new Set<string>();
  for (const item of cases) {
    const key = item.entityFQN || item.entityLink;
    if (key) {
      keys.add(key);
    }
  }
  return keys.size;
}

export function healthFromCases(cases: TestCase[]): HealthCounts {
  const byAsset = new Map<string, boolean>();
  for (const item of cases) {
    const key = item.entityFQN || item.entityLink || item.id || item.name;
    if (!key) {
      continue;
    }
    const status = testCaseStatus(item);
    const unhealthy = status === 'Failed' || status === 'Aborted';
    byAsset.set(key, Boolean(byAsset.get(key)) || unhealthy);
  }
  let unhealthy = 0;
  let healthy = 0;
  for (const failed of byAsset.values()) {
    if (failed) {
      unhealthy += 1;
    } else {
      healthy += 1;
    }
  }
  return { healthy, unhealthy, total: healthy + unhealthy };
}

export function healthFromTableSuites(suites: TestSuite[]): HealthCounts {
  let healthy = 0;
  let unhealthy = 0;
  for (const suite of suites) {
    if (suite.basic === false) {
      continue;
    }
    const failed = suite.summary?.failed ?? 0;
    const aborted = suite.summary?.aborted ?? 0;
    if (failed > 0 || aborted > 0) {
      unhealthy += 1;
    } else {
      healthy += 1;
    }
  }
  return { healthy, unhealthy, total: healthy + unhealthy };
}

export function dimensionByDefinition(definitions: TestDefinition[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const definition of definitions) {
    const dim = definition.dataQualityDimension?.trim();
    if (!dim) {
      continue;
    }
    for (const key of [definition.fullyQualifiedName, definition.name, definition.id]) {
      if (key) {
        map.set(key, dim);
      }
    }
  }
  return map;
}

export function normalizeDimension(raw?: string): string {
  const value = raw?.trim();
  if (!value) {
    return NO_DIMENSION;
  }
  const match = DQ_DIMENSIONS.find((item) => item.toLowerCase() === value.toLowerCase());
  return match ?? NO_DIMENSION;
}

export function dimensionCards(cases: TestCase[], definitions: TestDefinition[]): DimensionCard[] {
  const lookup = dimensionByDefinition(definitions);
  const byId = new Map<string, StatusCounts>();
  for (const id of [...DQ_DIMENSIONS, NO_DIMENSION]) {
    byId.set(id, emptyStatusCounts());
  }
  for (const item of cases) {
    const defKey =
      item.testDefinition?.fullyQualifiedName || item.testDefinition?.name || item.testDefinition?.id;
    const id = normalizeDimension(defKey ? lookup.get(defKey) : undefined);
    const counts = byId.get(id) ?? emptyStatusCounts();
    bumpStatus(counts, testCaseStatus(item));
    byId.set(id, counts);
  }
  return [...DQ_DIMENSIONS, NO_DIMENSION].map((id) => ({
    id,
    ...(byId.get(id) ?? emptyStatusCounts()),
  }));
}

export function tableCountFromFacets(facets: SearchFacet[]): number | undefined {
  const entity = facets.find((facet) => facet.id === 'entityType');
  const table = entity?.buckets.find((bucket) => bucket.key.toLowerCase() === 'table');
  return table?.count;
}

export function facetOptions(facets: SearchFacet[], id: SearchFacet['id']): Array<{ value: string; label: string }> {
  return (facets.find((facet) => facet.id === id)?.buckets ?? []).map((bucket) => ({
    value: bucket.key,
    label: `${bucket.key} (${bucket.count})`,
  }));
}

export function governanceFiltersActive(filters: DqGovernanceFilters): boolean {
  return DQ_GOVERNANCE_FILTERS.some((key) => Boolean(filters[key]?.trim()));
}

function refMatches(ref: EntityRef, value: string): boolean {
  const needle = value.trim().toLowerCase();
  return [ref.name, ref.displayName, ref.fullyQualifiedName].some(
    (part) => part?.trim().toLowerCase() === needle,
  );
}

export function matchesOwner(owners: EntityRef[] | undefined, owner?: string): boolean {
  if (!owner?.trim()) {
    return true;
  }
  return (owners ?? []).some((item) => refMatches(item, owner));
}

export function filterCasesForSearch(
  cases: TestCase[],
  query: string,
): TestCase[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return cases;
  }
  return cases.filter((item) => {
    const haystack = [
      item.name,
      item.displayName,
      item.fullyQualifiedName,
      item.entityFQN,
      item.entityLink,
      item.testDefinition?.name,
      item.testDefinition?.fullyQualifiedName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function filterSuitesForSearch(suites: TestSuite[], query: string): TestSuite[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return suites;
  }
  return suites.filter((item) => {
    const haystack = [item.name, item.displayName, item.fullyQualifiedName, item.basicEntityReference]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function successPercent(summary?: { success?: number; total?: number; failed?: number; aborted?: number; queued?: number }): number | undefined {
  const total =
    summary?.total ??
    (summary?.success ?? 0) + (summary?.failed ?? 0) + (summary?.aborted ?? 0) + (summary?.queued ?? 0);
  if (!total) {
    return undefined;
  }
  return Math.round(((summary?.success ?? 0) / total) * 100);
}
