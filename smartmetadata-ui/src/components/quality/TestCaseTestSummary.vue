<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSummary (OSS reference).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Spin, Typography } from 'ant-design-vue';
import { listTestCaseResults } from '@/api/testCaseResults';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
import type { TestCase, TestCaseResult } from '@/types/quality';
import { useTestCaseSelectedRun } from '@/composables/useTestCaseSelectedRun';
import {
  getMeasuredResult,
  getResultHistoryCaptionText,
  hasTestCaseNeverRun,
} from '@/quality/testSummary.utils';
import { getPastDaysRange, TEST_SUMMARY_DEFAULT_DAYS } from '@/quality/testSummaryDateRange';
import { getSelectedRun } from '@/quality/runDetailsCard.utils';
import type { IncidentDateRange } from '@/quality/incidentDatePresets';
import TestSummaryGraph from '@/components/quality/TestSummaryGraph.vue';
import RunSummaryTiles from '@/components/quality/RunSummaryTiles.vue';
import TestCaseRunDetailsCard from '@/components/quality/TestCaseRunDetailsCard.vue';
import FailedTestCaseSampleData from '@/components/quality/FailedTestCaseSampleData.vue';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{
  testCase: TestCase;
}>();

const { t } = useI18n();
const { selectedRunTimestamp, setSelectedRunTimestamp } = useTestCaseSelectedRun();

const initialRange = getPastDaysRange(TEST_SUMMARY_DEFAULT_DAYS);
const dateRange = ref({ startTs: initialRange.startTs, endTs: initialRange.endTs });
const rangeKey = ref('last30days');
const results = ref<TestCaseResult[]>([]);
const loading = ref(true);
const loadError = ref('');
const retryCount = ref(0);
const selectedTimeRange = ref(t('label.last-number-of-days', { numberOfDays: TEST_SUMMARY_DEFAULT_DAYS }));

const caption = computed(() => getResultHistoryCaptionText(props.testCase, t));

const measuredResults = computed(() =>
  results.value.map((result) => getMeasuredResult(props.testCase, result)),
);

const selectedRun = computed(() => getSelectedRun(measuredResults.value, selectedRunTimestamp.value));

const neverRun = computed(() => hasTestCaseNeverRun(props.testCase, results.value));

async function fetchResults(): Promise<void> {
  const fqn = props.testCase.fullyQualifiedName;
  if (!fqn) {
    results.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const page = await listTestCaseResults(fqn, {
      startTs: dateRange.value.startTs,
      endTs: dateRange.value.endTs,
    });
    results.value = page.data;
    if (selectedRunTimestamp.value === undefined && props.testCase.testCaseResult?.timestamp) {
      setSelectedRunTimestamp(props.testCase.testCaseResult.timestamp);
    }
  } catch (error) {
    loadError.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-case-result') }));
    results.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [
    props.testCase.fullyQualifiedName,
    props.testCase.testCaseResult?.timestamp,
    dateRange.value.startTs,
    dateRange.value.endTs,
    retryCount.value,
  ],
  () => {
    void fetchResults();
  },
  { immediate: true },
);

function onDateRangeApply(range: IncidentDateRange): void {
  dateRange.value = { startTs: range.startTs, endTs: range.endTs };
  rangeKey.value = range.key;
  selectedTimeRange.value = range.title;
}

function onSelectRun(timestamp: number): void {
  setSelectedRunTimestamp(timestamp);
}
</script>

<template>
  <section class="test-case-test-summary" data-testid="test-summary-container">
    <header class="test-case-test-summary__header">
      <div>
        <Typography.Title :level="5" class="test-case-test-summary__title">
          {{ t('label.result-history') }}
        </Typography.Title>
        <p class="test-case-test-summary__caption" data-testid="result-history-caption">{{ caption }}</p>
      </div>
      <IncidentDateRangeFilter
        :start-ts="dateRange.startTs"
        :end-ts="dateRange.endTs"
        :range-key="rangeKey"
        :range-title="selectedTimeRange"
        official-labels
        show-selected-custom-range
        use-calendar-day-bounds
        test-id="test-summary-date-range"
        @apply="onDateRangeApply"
      />
    </header>

    <Spin v-if="loading" />
    <div v-else-if="loadError" class="test-case-test-summary__error" data-testid="test-summary-load-error">
      <p>{{ loadError }}</p>
      <Button type="primary" @click="retryCount++">{{ t('label.retry') }}</Button>
    </div>
    <div
      v-else-if="neverRun"
      class="test-case-test-summary__never-run"
      data-testid="test-summary-never-run"
    >
      <Typography.Title :level="5">{{ t('message.no-runs-recorded-yet') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('message.test-case-results-after-first-run') }}</Typography.Paragraph>
    </div>
    <template v-else>
      <div data-testid="graph-container">
        <TestSummaryGraph
          :test-case-parameter-value="testCase.parameterValues"
          :test-case-results="measuredResults"
          :test-definition-name="testCase.testDefinition?.name"
          :selected-timestamp="selectedRunTimestamp"
          :selected-time-range="selectedTimeRange"
          @select-run="onSelectRun"
        />
      </div>
      <RunSummaryTiles :results="results" />
      <TestCaseRunDetailsCard
        :test-case="testCase"
        :results="measuredResults"
        :selected-run="selectedRun"
        :on-back-to-latest="() => setSelectedRunTimestamp(undefined)"
      />
      <FailedTestCaseSampleData :test-case="testCase" />
    </template>
  </section>
</template>

<style scoped>
.test-case-test-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.test-case-test-summary__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.test-case-test-summary__title {
  margin: 0 !important;
}
.test-case-test-summary__caption {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--sm-text-secondary);
}
.test-case-test-summary__error,
.test-case-test-summary__never-run {
  border: 1px dashed var(--sm-border-color);
  border-radius: 12px;
  padding: 32px 16px;
  text-align: center;
}
</style>