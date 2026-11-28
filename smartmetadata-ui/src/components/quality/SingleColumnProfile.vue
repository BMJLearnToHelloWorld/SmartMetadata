<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official SingleColumnProfile: column summary, data-quality test pie,
  count/proportion/math/sum/quartile charts, optional histogram and
  cardinality, and column custom-metric graphs. Vue3 + ant-design-vue +
  existing SmChart. No CCL React/CSS copy. Official CustomMetricGraphs overflow edit/delete menus follow
  TableProfilerProvider permissions.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Card, Typography } from 'ant-design-vue';
import { listColumnProfiles } from '@/api/profiler';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { ColumnProfileRecord } from '@/quality/columnProfile';
import { formatNumberWithComma } from '@/quality/columnProfile';
import {
  calculateColumnCustomMetrics,
  calculateColumnProfilerMetrics,
  getColumnCustomMetric,
  pointsForMetric,
  type ColumnMetricsCollections,
} from '@/quality/columnProfilerMetrics';
import { defaultProfilerRange, pointsForKey } from '@/quality/tableProfilerChart';
import type { ColumnProfile } from '@/types/quality';
import type { TestCaseCountByStatus } from '@/quality/testCaseSummary';
import type { OperationPermissions } from '@/api/permissions';
import type { CustomMetricRecord } from '@/api/customMetrics';
import CustomMetricGraphs from './CustomMetricGraphs.vue';
import ColumnSummary from './ColumnSummary.vue';

const props = defineProps<{
  activeColumnFqn: string;
  columns: ColumnProfileRecord[];
  isProfilingEnabled: boolean;
  testCaseSummary?: Record<string, TestCaseCountByStatus>;
  tableId?: string;
  permissions?: OperationPermissions;
}>();

const emit = defineEmits<{
  (event: 'edit-metric', metric: CustomMetricRecord): void;
  (event: 'metric-deleted'): void;
}>();

const { t } = useI18n();
const route = useRoute();

const PROFILER_WORKFLOW_DOCS =
  'https://docs.open-metadata.org/latest/how-to-guides/data-quality-observability/profiler/workflow';

const isLoading = ref(false);
const columnProfilerData = ref<ColumnProfile[]>([]);

const selectedColumn = computed(() =>
  props.columns.find((column) => column.fullyQualifiedName === props.activeColumnFqn),
);

const customMetrics = computed(() =>
  getColumnCustomMetric(props.columns, props.activeColumnFqn).map((metric) => ({
    ...metric,
    columnName: metric.columnName ?? selectedColumn.value?.name,
  })),
);

const metricTitles = computed<ColumnMetricsCollections>(() => ({
  countMetrics: {
    information: [
      { title: t('label.entity-count', { entity: t('label.distinct') }), dataKey: 'distinctCount' },
      { title: t('label.entity-count', { entity: t('label.null') }), dataKey: 'nullCount' },
      { title: t('label.entity-count', { entity: t('label.unique') }), dataKey: 'uniqueCount' },
      { title: t('label.entity-count', { entity: t('label.value-plural') }), dataKey: 'valuesCount' },
    ],
    data: [],
  },
  proportionMetrics: {
    information: [
      { title: t('label.entity-proportion', { entity: t('label.distinct') }), dataKey: 'distinctProportion' },
      { title: t('label.entity-proportion', { entity: t('label.null') }), dataKey: 'nullProportion' },
      { title: t('label.entity-proportion', { entity: t('label.unique') }), dataKey: 'uniqueProportion' },
    ],
    data: [],
  },
  mathMetrics: {
    information: [
      { title: t('label.max'), dataKey: 'max' },
      { title: t('label.mean'), dataKey: 'mean' },
      { title: t('label.min'), dataKey: 'min' },
    ],
    data: [],
  },
  sumMetrics: {
    information: [{ title: t('label.sum'), dataKey: 'sum' }],
    data: [],
  },
  quartileMetrics: {
    information: [
      { title: t('label.first-quartile'), dataKey: 'firstQuartile' },
      { title: t('label.median'), dataKey: 'median' },
      { title: t('label.inter-quartile-range'), dataKey: 'interQuartileRange' },
      { title: t('label.third-quartile'), dataKey: 'thirdQuartile' },
    ],
    data: [],
  },
}));

const columnMetric = computed(() =>
  calculateColumnProfilerMetrics(columnProfilerData.value, metricTitles.value),
);

const columnCustomMetrics = computed(() =>
  calculateColumnCustomMetrics(columnProfilerData.value, customMetrics.value),
);

const noProfilerMessage = computed(() =>
  props.isProfilingEnabled
    ? t('message.profiler-is-enabled-but-no-data-available')
    : t('message.no-profiler-card-message-with-link'),
);

const activeColumnTests = computed(
  () => props.testCaseSummary?.[props.activeColumnFqn?.toLocaleLowerCase()],
);

const columnTestSeries = computed<ChartSeries[]>(() => [
  { name: 'Success', points: [{ label: 'Success', value: activeColumnTests.value?.success ?? 0 }] },
  { name: 'Failed', points: [{ label: 'Failed', value: activeColumnTests.value?.failed ?? 0 }] },
  { name: 'Aborted', points: [{ label: 'Aborted', value: activeColumnTests.value?.aborted ?? 0 }] },
]);

const currentDay = computed(() => columnProfilerData.value[0]);
const firstDay = computed(() => columnProfilerData.value[columnProfilerData.value.length - 1]);

function seriesFor(collection: { information: { title: string; dataKey: string }[]; data: Array<Record<string, unknown>> }): ChartSeries[] {
  return collection.information.map((item) => ({
    name: item.title,
    points: pointsForMetric(collection.data, item.dataKey),
  }));
}

const customSeries = computed(() =>
  Object.entries(columnCustomMetrics.value).map(([name, rows]) => ({
    name,
    points: pointsForKey(rows ?? [], name),
  })),
);

function histogramSeries(profile: ColumnProfile | undefined, label: string): ChartSeries | null {
  if (!profile?.histogram) {
    return null;
  }
  return {
    name: label,
    points: profile.histogram.boundaries.map((boundary, index) => ({
      label: String(boundary),
      value: profile.histogram?.frequencies[index] ?? 0,
    })),
  };
}

const histogramSeriesList = computed(() => {
  const series = [
    histogramSeries(firstDay.value, t('label.data-distribution')),
    firstDay.value !== currentDay.value ? histogramSeries(currentDay.value, t('label.data-distribution')) : null,
  ].filter((item): item is ChartSeries => item !== null);
  return series;
});

function cardinalitySeries(profile: ColumnProfile | undefined, label: string): ChartSeries | null {
  const distribution = profile?.cardinalityDistribution;
  if (!distribution || distribution.allValuesUnique || !distribution.categories?.length) {
    return null;
  }
  return {
    name: label,
    points: distribution.categories.map((category, index) => ({
      label: String(category),
      value: distribution.counts?.[index] ?? 0,
    })),
  };
}

const cardinalitySeriesList = computed(() =>
  [
    cardinalitySeries(firstDay.value, t('label.cardinality')),
    firstDay.value !== currentDay.value ? cardinalitySeries(currentDay.value, t('label.cardinality')) : null,
  ].filter((item): item is ChartSeries => item !== null),
);

async function fetchColumnProfilerData(): Promise<void> {
  if (!props.activeColumnFqn) {
    columnProfilerData.value = [];
    isLoading.value = false;
    return;
  }
  const startTs = route.query.startTs ? Number(route.query.startTs) : defaultProfilerRange().startTs;
  const endTs = route.query.endTs ? Number(route.query.endTs) : defaultProfilerRange().endTs;
  isLoading.value = true;
  try {
    columnProfilerData.value = await listColumnProfiles(props.activeColumnFqn, startTs, endTs);
  } catch {
    columnProfilerData.value = [];
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.activeColumnFqn, route.query.startTs, route.query.endTs] as const,
  () => {
    void fetchColumnProfilerData();
  },
  { immediate: true },
);
</script>

<template>
  <div class="single-column-profile" data-testid="profiler-tab-container">
    <div v-if="selectedColumn" class="single-column-profile__header">
      <ColumnSummary :column="selectedColumn" />
      <Card data-testid="column-data-quality-tests">
        <template #title>{{ t('label.data-quality-test-plural') }}</template>
        <div class="single-column-profile__tests">
          <SmChart kind="donut" test-id="column-test-status-chart" :series="columnTestSeries" :empty="t('charts.empty')" />
          <div class="single-column-profile__legend">
            <div class="single-column-profile__total">
              <span data-testid="column-test-total">{{ activeColumnTests?.total ?? 0 }}</span>
              <Typography.Text type="secondary">{{ t('label.total-test-plural') }}</Typography.Text>
            </div>
            <div class="single-column-profile__legend-row">
              <span>Success</span>
              <span>{{ formatNumberWithComma(activeColumnTests?.success ?? 0) }}</span>
            </div>
            <div class="single-column-profile__legend-row">
              <span>Failed</span>
              <span>{{ formatNumberWithComma(activeColumnTests?.failed ?? 0) }}</span>
            </div>
            <div class="single-column-profile__legend-row">
              <span>Aborted</span>
              <span>{{ formatNumberWithComma(activeColumnTests?.aborted ?? 0) }}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <div class="single-column-profile__card" data-testid="count-metrics">
      <Typography.Text strong>{{ t('label.data-count-plural') }}</Typography.Text>
      <SmChart kind="line" test-id="count-metric-chart" :series="seriesFor(columnMetric.countMetrics)" :empty="noProfilerMessage" :height="240" />
    </div>
    <div class="single-column-profile__card" data-testid="proportion-metrics">
      <Typography.Text strong>{{ t('label.data-proportion-plural') }}</Typography.Text>
      <SmChart kind="line" test-id="proportion-metric-chart" :series="seriesFor(columnMetric.proportionMetrics)" :empty="noProfilerMessage" :height="240" />
    </div>
    <div class="single-column-profile__card" data-testid="math-metrics">
      <Typography.Text strong>{{ t('label.data-range') }}</Typography.Text>
      <SmChart kind="line" test-id="math-metric-chart" :series="seriesFor(columnMetric.mathMetrics)" :empty="noProfilerMessage" :height="240" />
    </div>
    <div class="single-column-profile__card" data-testid="sum-metrics">
      <Typography.Text strong>{{ t('label.data-aggregate') }}</Typography.Text>
      <SmChart kind="area" test-id="sum-metric-chart" :series="seriesFor(columnMetric.sumMetrics)" :empty="noProfilerMessage" :height="240" />
    </div>
    <div class="single-column-profile__card" data-testid="quartile-metrics">
      <Typography.Text strong>{{ t('label.data-quartile-plural') }}</Typography.Text>
      <SmChart kind="line" test-id="quartile-metric-chart" :series="seriesFor(columnMetric.quartileMetrics)" :empty="noProfilerMessage" :height="240" />
    </div>
    <div v-if="firstDay?.histogram || currentDay?.histogram" class="single-column-profile__card" data-testid="histogram-metrics">
      <Typography.Text strong>{{ t('label.data-distribution') }}</Typography.Text>
      <SmChart kind="bar" test-id="histogram-metric-chart" :series="histogramSeriesList" :empty="noProfilerMessage" :height="240" />
    </div>
    <div
      v-if="firstDay?.cardinalityDistribution || currentDay?.cardinalityDistribution"
      class="single-column-profile__card"
      data-testid="cardinality-distribution-metrics"
    >
      <Typography.Text strong>{{ t('label.cardinality') }}</Typography.Text>
      <p v-if="firstDay?.cardinalityDistribution?.allValuesUnique || currentDay?.cardinalityDistribution?.allValuesUnique">
        {{ t('asset.columns.allValuesUnique') }}
      </p>
      <SmChart
        v-else
        kind="bar"
        test-id="cardinality-metric-chart"
        :series="cardinalitySeriesList"
        :empty="noProfilerMessage"
        :height="240"
      />
    </div>
    <CustomMetricGraphs
      :series="customSeries"
      :custom-metrics="customMetrics"
      :empty-text="noProfilerMessage"
      :permissions="permissions"
      :table-id="tableId"
      @edit="emit('edit-metric', $event)"
      @deleted="emit('metric-deleted')"
    />
    <Typography.Paragraph v-if="!isProfilingEnabled" type="secondary" class="single-column-profile__docs">
      <a :href="PROFILER_WORKFLOW_DOCS" rel="noreferrer" target="_blank">{{ t('label.documentation') }}</a>
    </Typography.Paragraph>
  </div>
</template>

<style scoped>
.single-column-profile {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.single-column-profile__header {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.single-column-profile__header > * {
  flex: 1 1 20rem;
  min-width: 20rem;
}
.single-column-profile__tests {
  display: flex;
  align-items: center;
  gap: 12px;
}
.single-column-profile__legend {
  flex: 1;
  background: var(--sm-bg-elevated);
  border-radius: 6px;
  padding: 16px;
}
.single-column-profile__total {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}
.single-column-profile__legend-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  color: var(--sm-text-secondary);
}
.single-column-profile__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.single-column-profile__docs {
  margin: 0;
}
</style>
