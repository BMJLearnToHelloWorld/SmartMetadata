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

/**
 * Aggregation-row mappers for the dataQualityReport batch (api/dataQualityReports.ts).
 * Row shape is fixed server-side (SearchIndexUtils.parseAggregationResults):
 * one entry per aggregation dimension holding the bucket key, plus
 * `document_count` for term leaves. Status values are compared
 * case-insensitively: the official dashboard transform reads lowercase
 * (`success`/`failed`/`aborted`) while the official unhealthy filter
 * sends capitalized (`Failed`/`Aborted`), so neither casing is trusted
 * blindly — the live index value is still owed a live-pass check.
 */
export const DQ_STATUS_FIELD = 'testCaseResult.testCaseStatus';
export const DQ_DIMENSION_FIELD = 'dataQualityDimensionName';
export const DQ_DOCUMENT_COUNT_FIELD = 'document_count';

type ReportRow = Record<string, string | undefined>;

function rowCount(row: ReportRow): number {
  const parsed = Number(row[DQ_DOCUMENT_COUNT_FIELD]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function statusCountsFromReportRows(rows: ReportRow[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const row of rows) {
    // Unlike statusCountsFromCases (one row per case), one aggregation row
    // stands for document_count cases — sum the counts, don't count rows.
    const status = row[DQ_STATUS_FIELD]?.trim().toLowerCase();
    const count = rowCount(row);
    if (status === 'success') {
      counts.success += count;
    } else if (status === 'failed') {
      counts.failed += count;
    } else if (status === 'aborted') {
      counts.aborted += count;
    } else if (status === 'queued') {
      counts.queued += count;
    }
  }
  counts.total = counts.success + counts.failed + counts.aborted + counts.queued;
  return counts;
}

export function dimensionCardsFromReportRows(rows: ReportRow[]): DimensionCard[] {
  const byId = new Map<string, StatusCounts>();
  for (const id of [...DQ_DIMENSIONS, NO_DIMENSION]) {
    byId.set(id, emptyStatusCounts());
  }
  for (const row of rows) {
    const id = normalizeDimension(row[DQ_DIMENSION_FIELD]);
    const counts = byId.get(id) ?? emptyStatusCounts();
    // Dimension rows carry their own document_count per (dimension, status)
    // pair; bumpStatus counts 1 per row, so count by documents instead.
    const status = row[DQ_STATUS_FIELD]?.trim().toLowerCase();
    const count = rowCount(row);
    if (status === 'success') {
      counts.success += count;
    } else if (status === 'failed') {
      counts.failed += count;
    } else if (status === 'aborted') {
      counts.aborted += count;
    } else if (status === 'queued') {
      counts.queued += count;
    }
    counts.total = counts.success + counts.failed + counts.aborted + counts.queued;
    byId.set(id, counts);
  }
  return [...DQ_DIMENSIONS, NO_DIMENSION].map((id) => ({
    id,
    ...(byId.get(id) ?? emptyStatusCounts()),
  }));
}

/** Cardinality leaf rows carry the count under the aggregated field name. */
export function cardinalityFromReportRows(rows: ReportRow[], field: string): number | undefined {
  for (const row of rows) {
    const parsed = Number(row[field]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
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

/**
 * ES `q` payloads for the dataQualityReport batch, mirroring the official
 * dashboard builders (openmetadata-ui
 * utils/DataQuality/DataQualityPureUtils.ts: buildDataQualityDashboardFilters
 * for the testCase index, buildDataQualityTableFilters for the table index;
 * rest/dataQualityDashboardAPI.ts: fetchTestCaseSummary* /
 * fetchEntityCoveredWithDQ / fetchTotalEntityCount pass the built `must`
 * array as `q: { query: { bool: { must } } }`).
 *
 * Mapping, single-valued product filters to the official multi-valued
 * filter fields: owner -> ownerFqn, tag -> tags[tag], tier -> tier[tier],
 * certification -> certification[cert], dataProduct -> dataProductFqns[dp].
 * The testCase-index clauses are the dashboard builder's verbatim shapes
 * (nested owners/tags, bool-should tier/certification/dataProducts);
 * the table-index clauses are the table builder's shapes (flat bool-should
 * term clauses — the table index carries no test-case-only fields, so the
 * nested testCase forms must not leak into it). Both builders append
 * `{ term: { deleted: false } }`.
 *
 * glossaryTerm has NO official dashboard-filter counterpart (neither
 * builder mentions glossary terms), so it is deliberately left out of the
 * aggregation query rather than invented as a field: it keeps affecting
 * only the search-list path, and the dashboard cards say so via the
 * existing filter residual when the search list is unavailable.
 */
export type DqEsClause = Record<string, unknown>;

function dqMustForOwner(owner: string): DqEsClause {
  return {
    nested: {
      path: 'owners',
      query: { term: { 'owners.name': owner } },
    },
  };
}

function dqMustForTags(tag: string): DqEsClause {
  return {
    nested: {
      path: 'tags',
      query: {
        bool: {
          should: [{ match: { 'tags.tagFQN': tag } }],
        },
      },
    },
  };
}

function dqShouldTerm(field: string, value: string, minimumShouldMatch = true): DqEsClause {
  return {
    bool: {
      should: [{ term: { [field]: value } }],
      ...(minimumShouldMatch ? { minimum_should_match: 1 } : {}),
    },
  };
}

export function dqDashboardMustFilters(filters: DqGovernanceFilters): DqEsClause[] {
  const must: DqEsClause[] = [];
  if (filters.owner?.trim()) {
    must.push(dqMustForOwner(filters.owner));
  }
  if (filters.certification?.trim()) {
    must.push(dqShouldTerm('certification.tagLabel.tagFQN', filters.certification, false));
  }
  if (filters.tag?.trim()) {
    must.push(dqMustForTags(filters.tag));
  }
  if (filters.tier?.trim()) {
    must.push(dqShouldTerm('tier.tagFQN', filters.tier));
  }
  if (filters.dataProduct?.trim()) {
    must.push(dqShouldTerm('dataProducts.fullyQualifiedName', filters.dataProduct));
  }
  must.push({ term: { deleted: false } });
  return must;
}

export function dqTableMustFilters(filters: DqGovernanceFilters): DqEsClause[] {
  const must: DqEsClause[] = [];
  if (filters.owner?.trim()) {
    must.push(dqMustForOwner(filters.owner));
  }
  if (filters.tag?.trim()) {
    must.push({
      bool: { should: [{ term: { 'tags.tagFQN': filters.tag } }] },
    });
  }
  if (filters.tier?.trim()) {
    must.push({
      bool: { should: [{ term: { 'tier.tagFQN': filters.tier } }] },
    });
  }
  if (filters.certification?.trim()) {
    must.push(dqShouldTerm('certification.tagLabel.tagFQN', filters.certification, false));
  }
  if (filters.dataProduct?.trim()) {
    must.push(dqShouldTerm('dataProducts.fullyQualifiedName', filters.dataProduct));
  }
  must.push({ term: { deleted: false } });
  return must;
}

export function buildDqDashboardQuery(filters: DqGovernanceFilters): string {
  return JSON.stringify({ query: { bool: { must: dqDashboardMustFilters(filters) } } });
}

export function buildDqTableQuery(filters: DqGovernanceFilters): string {
  return JSON.stringify({ query: { bool: { must: dqTableMustFilters(filters) } } });
}

/**
 * Official fetchTestCaseSummaryByNoDimension: every dashboard filter
 * except dimension, plus `must_not exists` on the dimension index field,
 * so dimension-less cases land on the No Dimension card instead of
 * vanishing from the terms aggregation.
 */
export function buildDqNoDimensionQuery(filters: DqGovernanceFilters): string {
  return JSON.stringify({
    query: {
      bool: {
        must: dqDashboardMustFilters(filters),
        must_not: [{ exists: { field: DQ_DIMENSION_FIELD } }],
      },
    },
  });
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
