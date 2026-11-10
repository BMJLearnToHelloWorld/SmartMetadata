/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mapAggregateBuckets, postAggregateFieldOptions, searchAssets } from '@/api/search';

/**
 * Curated-assets pure helpers, ported from the official framework
 * (openmetadata-ui `utils/CuratedAssetsPureUtils.ts`,
 * `utils/CuratedAssetsUtils.tsx`, `constants/AdvancedSearch.constants.ts`).
 *
 * ADR:2026-11-08-my-data-curated-assets
 */

/** Entity types the curated-assets editor offers, official `CURATED_ASSETS_LIST`. */
export const CURATED_ASSETS_LIST: readonly string[] = [
  'all',
  'apiCollection',
  'apiEndpoint',
  'chart',
  'container',
  'dashboard',
  'dashboardDataModel',
  'database',
  'databaseSchema',
  'dataProduct',
  'glossaryTerm',
  'knowledgePage',
  'metric',
  'mlmodel',
  'pipeline',
  'searchIndex',
  'storedProcedure',
  'table',
  'topic',
];

/** Query filter strings that are considered empty (official `EMPTY_QUERY_FILTER_STRINGS`). */
export const EMPTY_QUERY_FILTER_STRINGS: readonly string[] = [
  '{"query":{"bool":{"must":[]}}}',
  '{}',
  '',
];

export interface AggregateBucketLike {
  key: string;
  doc_count: number;
}

/**
 * Official `getModifiedQueryFilterWithSelectedAssets`: the selected entity
 * types narrow the *filter*, not the index — an `entityType` should-clause
 * ANDed onto the saved filter. `all` (or no selection) leaves the filter
 * untouched.
 */
export function getModifiedQueryFilterWithSelectedAssets(
  queryFilterObject: Record<string, unknown>,
  selectedResource?: string[],
): Record<string, unknown> {
  if (!selectedResource?.length || selectedResource.includes('all')) {
    return queryFilterObject;
  }
  const entityTypeFilter = {
    bool: {
      should: selectedResource.map((resource) => ({
        term: { entityType: resource },
      })),
    },
  };
  if (!queryFilterObject.query) {
    return { query: { bool: { must: [entityTypeFilter] } } };
  }
  return {
    query: {
      bool: {
        must: [queryFilterObject.query, entityTypeFilter],
      },
    },
  };
}

/** Official `getTotalResourceCount`: the buckets' counts for the selected resources. */
export function getTotalResourceCount(
  entityCounts: AggregateBucketLike[],
  selectedResource: string[],
): number {
  return entityCounts.reduce((acc, bucket) => {
    const isResourceFromAllOptionsInBucket =
      selectedResource.includes('all') && CURATED_ASSETS_LIST.includes(bucket.key);
    const isSelectedResourceInBucket = selectedResource.includes(bucket.key);
    if (isResourceFromAllOptionsInBucket || isSelectedResourceInBucket) {
      return acc + bucket.doc_count;
    }
    return acc;
  }, 0);
}

/**
 * Official `getSelectedResourceCount`: one search against the `all` index
 * with the filter, counting the entityType aggregation buckets. A failure
 * reports zero rather than taking the editor down.
 */
export async function getSelectedResourceCount(args: {
  selectedResource: string[];
  queryFilter?: string;
  shouldUpdateResourceList?: boolean;
}): Promise<{ entityCount: number; resourcesWithNonZeroCount?: string[] }> {
  const { selectedResource, queryFilter, shouldUpdateResourceList = true } = args;
  try {
    const page = await searchAssets('', 0, 0, {
      index: 'all',
      includeAggregations: true,
      query_filter: queryFilter ?? '{}',
    });
    const buckets: AggregateBucketLike[] = (page.facets ?? [])
      .find((facet) => facet.id === 'entityType')
      ?.buckets.map((bucket) => ({ key: bucket.key, doc_count: bucket.count })) ?? [];
    const resourcesWithNonZeroCount = buckets.reduce<string[]>((acc, bucket) => {
      const isResourceFromAllOptionsInBucket =
        selectedResource.includes('all') && CURATED_ASSETS_LIST.includes(bucket.key);
      const isSelectedResourceInBucket = selectedResource.includes(bucket.key);
      if (
        (isSelectedResourceInBucket || isResourceFromAllOptionsInBucket) &&
        bucket.doc_count > 0
      ) {
        return [...acc, bucket.key];
      }
      return acc;
    }, []);
    return {
      entityCount: getTotalResourceCount(buckets, selectedResource),
      ...(shouldUpdateResourceList ? { resourcesWithNonZeroCount } : {}),
    };
  } catch {
    return { entityCount: 0 };
  }
}

/**
 * Official `isValidElasticsearchQuery`: a saved filter is valid when it
 * parses, carries a `query`, and — for a bool query — has a non-empty valid
 * must/should and a valid must_not.
 */
export function isValidElasticsearchQuery(queryFilterString: string): boolean {
  if (!queryFilterString || EMPTY_QUERY_FILTER_STRINGS.includes(queryFilterString)) {
    return false;
  }
  try {
    const parsed = JSON.parse(queryFilterString) as Record<string, unknown>;
    if (!parsed.query) {
      return false;
    }
    const query = parsed.query as Record<string, unknown>;
    if (query.bool) {
      const bool = query.bool as {
        must?: unknown[];
        should?: unknown[];
        must_not?: unknown;
      };
      const validRequired = (clause?: unknown[]): boolean =>
        !Array.isArray(clause) || (clause.length > 0 && clause.every(isValidCondition));
      const validMustNot = (clause?: unknown): boolean =>
        !clause || (Array.isArray(clause) ? clause.every(isValidCondition) : isValidCondition(clause));
      return validRequired(bool.must) && validRequired(bool.should) && validMustNot(bool.must_not);
    }
    return true;
  } catch {
    return false;
  }
}

function isValidCondition(condition: unknown): boolean {
  if (!condition || typeof condition !== 'object') {
    return false;
  }
  const rec = condition as Record<string, unknown>;
  if (rec.term) {
    const keys = Object.keys(rec.term as Record<string, unknown>);
    return keys.length > 0 && keys.every((field) => field.trim() !== '');
  }
  if (rec.terms) {
    const keys = Object.keys(rec.terms as Record<string, unknown>);
    return keys.length > 0 && keys.every((field) => field.trim() !== '');
  }
  if (rec.exists) {
    const field = (rec.exists as Record<string, unknown>).field;
    return typeof field === 'string' && field.trim() !== '';
  }
  if (rec.bool) {
    const bool = rec.bool as { must?: unknown[]; should?: unknown[]; must_not?: unknown };
    const validRequired = (clause?: unknown[]): boolean =>
      !Array.isArray(clause) || (clause.length > 0 && clause.every(isValidCondition));
    return validRequired(bool.must) && validRequired(bool.should);
  }
  return true;
}

/**
 * Which of the listed assets have a failing test right now, as a set of
 * lowercased FQNs — ported from official `useCuratedAssets.ts`
 * `fetchFailingAssets`. The data-asset documents carry no test outcome, so
 * the answer comes from the test-case index: one aggregation over the page's
 * FQNs, keeping only test cases whose latest result failed.
 */
export async function fetchFailingAssets(fqns: string[]): Promise<Set<string>> {
  const response = await postAggregateFieldOptions({
    deleted: false,
    fieldName: 'originEntityFQN',
    index: 'testCase',
    query: JSON.stringify({
      query: {
        bool: {
          must: [
            { terms: { originEntityFQN: fqns } },
            { term: { 'testCaseResult.testCaseStatus': 'Failed' } },
          ],
        },
      },
    }),
    size: fqns.length,
  });
  return new Set(
    mapAggregateBuckets(response, 'originEntityFQN').map((bucket) => bucket.key.toLowerCase()),
  );
}

/**
 * The Explore URL for a curated source — product adaptation of official
 * `getCuratedExploreURL` (`CuratedAssetsSummaryWidget.tsx`).
 *
 * Official sends a saved filter through the advanced-search tree and a chip
 * rule as a `quickFilter` JSON. This console's Explore reads facet params
 * from the URL (`filtersFromQuery`) and accepts a `query_filter` string
 * (SearchView passes it through to `searchAssets`), so: a saved filter
 * travels as `query_filter` JSON, and a chip rule travels as the facet
 * params its clauses name (`tier.tagFQN` → `tier`, `certification…` →
 * `certification`) — both land on exactly the matches the card counts.
 */
export function getCuratedExploreURL(args: {
  queryFilter?: string;
  resources?: string[];
  rule: { termKey: string; termValue: string }[];
}): { name: string; query: Record<string, string> } {
  if (args.queryFilter) {
    return { name: 'search', query: { query_filter: args.queryFilter } };
  }
  const query: Record<string, string> = {};
  for (const clause of args.rule) {
    if (clause.termKey === 'tier.tagFQN') {
      query.tier = clause.termValue;
    } else if (clause.termKey === 'certification.tagLabel.tagFQN') {
      query.certification = clause.termValue;
    }
  }
  return { name: 'search', query };
}
