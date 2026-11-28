/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { computed, ref, unref, watch, type MaybeRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  fetchDqDashboardAggregations,
  type DqDashboardAggregations,
} from '@/quality/dashboard';
import {
  dqProviderFiltersFromRoute,
  INITIAL_DATA_QUALITY_TEST_SUMMARY,
  testSummaryFromStatusCounts,
} from '@/quality/dataQualityProvider';
import type { DqLandingTab } from '@/quality/landing';
import type { TestSummary } from '@/types/quality';

/**
 * Pin DataQualityProvider: shared summary fetch for list tabs with a
 * loading gate before child tab bodies mount.
 */
export function useDataQualityTestCaseSummary(options: {
  activeTab: Ref<DqLandingTab>;
  ownsTheUrl: Ref<boolean>;
  route: MaybeRef<RouteLocationNormalizedLoaded>;
  canViewTestCaseBasic: Ref<boolean>;
}) {
  const isTestCaseSummaryLoading = ref(true);
  const testCaseSummary = ref<TestSummary>({ ...INITIAL_DATA_QUALITY_TEST_SUMMARY });
  const providerAggregations = ref<DqDashboardAggregations | null>(null);

  const filterKey = computed(() =>
    JSON.stringify(dqProviderFiltersFromRoute(unref(options.route))),
  );

  watch(
    [options.activeTab, options.ownsTheUrl, options.canViewTestCaseBasic, filterKey],
    async (_newValues, _oldValues, onCleanup) => {
      let ignore = false;
      onCleanup(() => {
        ignore = true;
      });

      if (!options.ownsTheUrl.value || options.activeTab.value === 'dashboard') {
        isTestCaseSummaryLoading.value = false;
        return;
      }

      if (!options.canViewTestCaseBasic.value) {
        isTestCaseSummaryLoading.value = false;
        return;
      }

      isTestCaseSummaryLoading.value = true;
      try {
        const filters = dqProviderFiltersFromRoute(unref(options.route));
        const range =
          filters.startTs !== undefined && filters.endTs !== undefined
            ? { startTs: filters.startTs, endTs: filters.endTs }
            : undefined;
        const agg = await fetchDqDashboardAggregations(filters, range);
        if (!ignore) {
          providerAggregations.value = agg;
          testCaseSummary.value = testSummaryFromStatusCounts(agg.results);
        }
      } catch {
        if (!ignore) {
          providerAggregations.value = null;
          testCaseSummary.value = { ...INITIAL_DATA_QUALITY_TEST_SUMMARY };
        }
      } finally {
        if (!ignore) {
          isTestCaseSummaryLoading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return {
    isTestCaseSummaryLoading,
    testCaseSummary,
    providerAggregations,
  };
}