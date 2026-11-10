/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { getDataQualityReport } from '@/api/dataQualityReports';
import { listTestCasesBySearch } from '@/api/testCases';
import {
  TABLE_STATUS_AGGREGATION,
  toSearchParams,
  toTableCountsQuery,
  toTableStatusCounts,
  type DataQualityFilters,
  type DataQualityViewer,
  type TableStatusCounts,
} from '@/catalog/dataQualityFilters';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import { getTestTableFqn } from './dataQualityTestRows';
import type { TestCase } from '@/types/quality';

/**
 * Test-result counts by status, plus the failing tests to list — ported from
 * the official framework (`hooks/useDataQualitySummary.ts`).
 *
 * ADR:2026-11-08-my-data-data-quality
 */

/** Latest results the card lists, of any status. */
export const DATA_QUALITY_ROWS = 8;
const COUNT_ONLY_PAGE_SIZE = 1;
const TTL_MS = 5 * 60 * 1000;

export interface DataQualitySummary {
  passed: ComputedRef<number>;
  failed: ComputedRef<number>;
  aborted: ComputedRef<number>;
  total: ComputedRef<number>;
  /**
   * The latest results of any status, failures first, for the card's rows —
   * a list grouped by table needs the passing tests beside the failing ones.
   */
  tests: ComputedRef<TestCase[]>;
  /**
   * Every result in scope per table the rows show, not just the rows: a table
   * header reads "3 failed" even when only one of them made the list. Empty
   * until the rows are in, since they decide which tables to count.
   */
  tableCounts: ComputedRef<Record<string, TableStatusCounts>>;
  /**
   * No test case exists at all, whatever the filters. A zero `total` only says
   * nothing *ran* in the selected scope and window; this is what tells "not
   * set up" apart from "quiet this week".
   */
  hasNoTests: ComputedRef<boolean>;
  /** First load only — a filter change keeps the previous counts on screen. */
  isLoading: ComputedRef<boolean>;
  isFetching: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  refetch: () => Promise<void>;
}

async function fetchByStatus(
  status: string | undefined,
  limit: number,
  filters: DataQualityFilters,
  userName?: string,
  fields = 'testCaseResult',
): Promise<{ tests: TestCase[]; total: number }> {
  const response = await listTestCasesBySearch({
    fields,
    includeAllTests: true,
    limit,
    q: '*',
    sortField: 'testCaseResult.timestamp',
    sortType: 'desc',
    testCaseStatus: status,
    ...toSearchParams(filters, userName),
  });
  return { tests: response.data ?? [], total: response.paging?.total ?? 0 };
}

/** Whether any test case exists — counted, never listed. */
async function fetchAnyTestCount(): Promise<number> {
  const response = await listTestCasesBySearch({
    includeAllTests: true,
    limit: COUNT_ONLY_PAGE_SIZE,
    q: '*',
  });
  return response.paging?.total ?? 0;
}

// Failures first, then aborted, then passing: the card is about what needs
// attention. Stable, so the newest result still leads within each status.
const STATUS_RANK: Record<string, number> = {
  Failed: 0,
  Aborted: 1,
  Success: 2,
};

function sortByStatus(tests: TestCase[]): TestCase[] {
  return [...tests].sort(
    (a, b) =>
      (STATUS_RANK[a.testCaseResult?.testCaseStatus ?? ''] ?? 3) -
      (STATUS_RANK[b.testCaseResult?.testCaseStatus ?? ''] ?? 3),
  );
}

export function useDataQualitySummary(
  filters: ComputedRef<DataQualityFilters> | Ref<DataQualityFilters>,
  userName?: string,
  viewer?: DataQualityViewer,
): DataQualitySummary {
  const filtersKey = computed(() => JSON.stringify(filters.value));

  const keyFor = (status: string) =>
    computed(() => `data-quality:${status}:${filtersKey.value}:${userName ?? ''}`);

  // Three limit-1 counts rather than one page counted client-side:
  // `paging.total` is the whole bucket, so the numbers stay true even
  // though only the failing page is materialised. A fourth, unfiltered
  // count tells an estate with no tests from a quiet window.
  const failedQuery = useWidgetLoad(keyFor('Failed'), () =>
    fetchByStatus('Failed', COUNT_ONLY_PAGE_SIZE, filters.value, userName),
  { ttlMs: TTL_MS });
  const passedQuery = useWidgetLoad(keyFor('Success'), () =>
    fetchByStatus('Success', COUNT_ONLY_PAGE_SIZE, filters.value, userName),
  { ttlMs: TTL_MS });
  const abortedQuery = useWidgetLoad(keyFor('Aborted'), () =>
    fetchByStatus('Aborted', COUNT_ONLY_PAGE_SIZE, filters.value, userName),
  { ttlMs: TTL_MS });
  // Unfiltered, so it is one key for every filter: fetched alongside the
  // counts on first load — not after them, which would chain a second round
  // trip — and served from cache on every filter change after that.
  const anyTestQuery = useWidgetLoad('data-quality:anyTest', fetchAnyTestCount, {
    ttlMs: TTL_MS,
  });
  const testsQuery = useWidgetLoad(
    computed(() => `data-quality:latest:${filtersKey.value}:${userName ?? ''}`),
    () =>
      fetchByStatus(
        undefined,
        DATA_QUALITY_ROWS,
        filters.value,
        userName,
        'testCaseResult,incidentStatus',
      ),
    { ttlMs: TTL_MS },
  );

  const tableFqns = computed(() =>
    Array.from(
      new Set((testsQuery.data.value?.tests ?? []).map((test) => getTestTableFqn(test.entityLink))),
    ).sort(),
  );

  // Waits on the rows by necessity: they decide which tables to count.
  // The counts only enrich the headers, so a failure here leaves the headers
  // counting the rows — never the card.
  const tableCounts = ref<Record<string, TableStatusCounts>>({});
  watch(
    tableFqns,
    async (fqns) => {
      if (!fqns.length) {
        tableCounts.value = {};
        return;
      }
      try {
        const report = await getDataQualityReport({
          aggregationQuery: TABLE_STATUS_AGGREGATION,
          index: 'testCase',
          q: toTableCountsQuery(filters.value, fqns, viewer),
        });
        tableCounts.value = toTableStatusCounts(report.data ?? []);
      } catch {
        tableCounts.value = {};
      }
    },
    { immediate: true },
  );

  const queries = [failedQuery, passedQuery, abortedQuery, anyTestQuery, testsQuery];
  const failed = computed(() => failedQuery.data.value?.total ?? 0);
  const passed = computed(() => passedQuery.data.value?.total ?? 0);
  const aborted = computed(() => abortedQuery.data.value?.total ?? 0);

  return {
    aborted,
    failed,
    tests: computed(() => sortByStatus(testsQuery.data.value?.tests ?? [])),
    tableCounts: computed(() => tableCounts.value),
    hasNoTests: computed(() => anyTestQuery.data.value === 0),
    isError: computed(() => queries.some((query) => query.isError.value)),
    isFetching: computed(() => queries.some((query) => query.isFetching.value)),
    isLoading: computed(() => queries.some((query) => query.isLoading.value)),
    passed,
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()));
    },
    total: computed(() => passed.value + failed.value + aborted.value),
  };
}
