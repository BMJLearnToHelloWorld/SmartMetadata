<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDataQualityPagePath } from '@/utils/fqnPaths';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Col, DatePicker, Empty, Row, Select, Space, Spin, Typography } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import SmChart from '@/features/charts/SmChart.vue';
import { formatChartTs, namedSeries } from '@/features/charts/series';
import { seriesWindow } from '@/features/charts/types';
import {
  buildDqTestCaseListQuery,
  DQ_HEALTH_PIE_SEGMENT_ORDER,
  DQ_TEST_CASE_PIE_SEGMENT_ORDER,
  fetchDqDashboardAggregations,
  fetchDqDashboardFilterOptions,
  fetchDqDashboardTimeSeries,
  filterStateToChartFilters,
  initialDqFilterState,
  visibleDqFilters,
  type DqDashboardAggregations,
  type DqDashboardChartFilters,
  type DqDashboardFilterOptions,
  type DqDashboardFilterState,
  type DqDashboardTimeSeries,
  type DqHiddenFilter,
  type DqIncidentStatus,
  type DqTestCaseListDrill,
  type DqTestCaseStatus,
} from '@/quality/dashboard';
import type { ChartPoint } from '@/features/charts/types';
import { convertMillisecondsToHumanReadableFormat } from '@/utils/workflowDateTime';

/**
 * Shared DataQualityDashboard (pin
 * components/DataQuality/DataQualityDashboard/DataQualityDashboard.component.tsx
 * + DqDashboardSectionContent.component.tsx, DQ_DASHBOARD_SECTIONS order):
 * filter bar (hiddenFilters hides facets one by one) + four chart cards
 * (data-health, data-dimensions, test-case-status, incident-metrics).
 *
 * Product deltas, all named: the owner dropdown is multi-select but
 * the query carries only the first pick (pin handleOwnerChange takes
 * owners[0] into the singular ownerFqn). Drill-down, pin
 * DqDashboardSectionContent + the three pie widgets: each donut routes
 * per slice (SmChart `segment-click`, pin CustomPieChart onSegmentClick)
 * — coverage covered→suites / not-covered→explore; health
 * healthy→[Success, Queued] / unhealthy→[Failed, Aborted]
 * (BINARY_STATUS_PIE_SEGMENT_ORDER); results success/failed/aborted→the
 * matching status list (TEST_CASE_STATUS_PIE_SEGMENT_ORDER). The
 * dimension cards and the status / incident-count area charts carry
 * their exact slice (dimension / status / incident status + range) in
 * the query. The two incident-time charts stay display-only, pin
 * parity (no redirectPath). Area charts use the shared SmChart 'area'
 * kind (pin CustomAreaChart). Governance view keeps the card border
 * and drops the shadow, pin parity (`tw:shadow-none` on the section
 * card). The legend line under each donut is plain text, like pin's
 * non-clickable legend tiles.
 */
const props = withDefaults(
  defineProps<{
    initialFilters?: DqDashboardChartFilters;
    hideFilterBar?: boolean;
    hiddenFilters?: DqHiddenFilter[];
    isGovernanceView?: boolean;
    className?: string;
  }>(),
  {
    hideFilterBar: false,
    hiddenFilters: () => [],
    isGovernanceView: false,
  },
);

const { t } = useI18n();
const router = useRouter();

const loadingAggregations = ref(false);
const loadingTimeSeries = ref(false);
const aggregationsError = ref('');
const timeSeriesError = ref('');
const range = ref(seriesWindow(30));
const filters = reactive<DqDashboardFilterState>(initialDqFilterState(props.initialFilters));
const options = ref<DqDashboardFilterOptions | null>(null);
const aggregations = ref<DqDashboardAggregations | null>(null);
const timeSeries = ref<DqDashboardTimeSeries | null>(null);

const visibleFilters = computed(() => visibleDqFilters(props.hiddenFilters));
const showFilterBar = computed(() => !props.hideFilterBar);

const chartFilters = computed<DqDashboardChartFilters>(() =>
  filterStateToChartFilters(filters, range.value, {
    entityFQN: props.initialFilters?.entityFQN,
    domainFqn: props.initialFilters?.domainFqn,
  }),
);

const rangeLabel = computed(
  () => `${formatChartTs(range.value.startTs)} - ${formatChartTs(range.value.endTs)}`,
);

/** RangePicker value, pin DatePickerMenu parity (default: last 30 days). */
const rangePickerValue = computed<[Dayjs, Dayjs]>(() => [
  dayjs(range.value.startTs),
  dayjs(range.value.endTs),
]);

const coverageSeries = computed(() =>
  aggregations.value?.coverage?.total
    ? namedSeries(t('label.data-asset-plural-coverage'), [
        { label: t('label.covered'), value: aggregations.value.coverage.covered },
        { label: t('label.uncovered'), value: aggregations.value.coverage.notCovered },
      ])
    : [],
);
const healthSeries = computed(() =>
  aggregations.value?.health?.total
    ? namedSeries(t('label.healthy-data-asset-plural'), [
        { label: t('label.healthy'), value: aggregations.value.health.healthy },
        { label: t('label.unhealthy'), value: aggregations.value.health.unhealthy },
      ])
    : [],
);
const resultsSeries = computed(() =>
  aggregations.value?.results?.total
    ? namedSeries(t('label.total-entity', { entity: t('label.test-plural') }), [
        { label: t('label.success'), value: aggregations.value.results.success },
        { label: t('label.failed'), value: aggregations.value.results.failed },
        { label: t('label.aborted'), value: aggregations.value.results.aborted },
      ])
    : [],
);

function areaSeries(name: string, points: ChartPoint[]) {
  return points.length ? [{ name, points }] : [];
}

const successSeries = computed(() =>
  areaSeries(t('label.success'), timeSeries.value?.statusByDay.Success ?? []),
);
const abortedSeries = computed(() =>
  areaSeries(t('label.aborted'), timeSeries.value?.statusByDay.Aborted ?? []),
);
const failedSeries = computed(() =>
  areaSeries(t('label.failed'), timeSeries.value?.statusByDay.Failed ?? []),
);
const openIncidentSeries = computed(() =>
  areaSeries(t('label.open-incident-plural'), timeSeries.value?.incidentsByDay.open ?? []),
);
const resolvedIncidentSeries = computed(() =>
  areaSeries(t('label.resolved-incident-plural'), timeSeries.value?.incidentsByDay.resolved ?? []),
);
const responseTimeSeries = computed(() =>
  areaSeries(t('label.response-time'), timeSeries.value?.incidentTime.response ?? []),
);
const resolutionTimeSeries = computed(() =>
  areaSeries(t('label.resolution-time'), timeSeries.value?.incidentTime.resolution ?? []),
);

function latestValue(points: ChartPoint[]): number {
  return points.length ? points[points.length - 1].value : 0;
}

function averageValue(points: ChartPoint[]): string {
  if (!points.length) {
    return '--';
  }
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return convertMillisecondsToHumanReadableFormat(total / points.length);
}

/** Official StatusCardWidget: raw dimension title; only NoDimension is translated. */
function dimensionLabel(id: string): string {
  if (id === 'NoDimension') {
    return t('label.no-dimension');
  }
  return id;
}

function setFilter(id: keyof DqDashboardFilterState, value: unknown): void {
  filters[id] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/** Pin FilterSelectDropdown showSelectAll parity: pick every loaded option. */
function selectAll(id: keyof DqDashboardFilterState): void {
  filters[id] = (options.value?.[id] ?? []).map((option) => option.value);
}

/**
 * Date-range change, pin handleDateRangeChange parity: the picked span
 * is normalized to start-of-day / end-of-day. Clearing the picker
 * restores the default last-30-days range instead of empty charts.
 */
function onRangeChange(dates: unknown): void {
  const pair = Array.isArray(dates) ? (dates as Array<{ valueOf: () => number } | null>) : null;
  const start = pair?.[0];
  const end = pair?.[1];
  if (start && end) {
    range.value = {
      startTs: dayjs(start.valueOf()).startOf('day').valueOf(),
      endTs: dayjs(end.valueOf()).endOf('day').valueOf(),
    };
  } else {
    range.value = seriesWindow(30);
  }
  reload();
}

/**
 * Drill-down navigation, pin DqDashboardSectionContent parity: the
 * test-case list opens on its tab with the dashboard's current slice
 * (buildDqTestCaseListQuery) plus the clicked status / dimension; the
 * suites route redirects to the same page's test-suites tab; the
 * incident manager opens with the incident status + the current range
 * (pin QueryString of testCaseResolutionStatusType/startTs/endTs).
 */
function openTestCases(drill?: DqTestCaseListDrill): void {
  void router.push({
    path: getDataQualityPagePath('test-cases'),
    query: { ...buildDqTestCaseListQuery(chartFilters.value, drill) },
  });
}

function openTestSuites(): void {
  void router.push({ path: getDataQualityPagePath('test-suites') });
}

/** Pin DataAssetsCoveragePieChartWidget: not-covered → explore. */
function openExplore(): void {
  void router.push({ name: 'search' });
}

/**
 * Per-segment donut routing (pin DqDashboardSectionContent + the three
 * pie widgets; SmChart `segment-click` carries the slice index in
 * series order, pin CustomPieChart onSegmentClick).
 */
function openCoverageSegment(index: number): void {
  if (index === 0) {
    openTestSuites();
  } else if (index === 1) {
    openExplore();
  }
}

function openHealthSegment(index: number): void {
  const statuses = DQ_HEALTH_PIE_SEGMENT_ORDER[index];
  if (statuses) {
    openTestCases({ testCaseStatus: [...statuses] });
  }
}

function openResultsSegment(index: number): void {
  const status = DQ_TEST_CASE_PIE_SEGMENT_ORDER[index];
  if (status) {
    openTestCases({ testCaseStatus: status });
  }
}

function openIncidents(status: DqIncidentStatus): void {
  void router.push({
    name: 'observability-incidents',
    query: {
      testCaseResolutionStatusType: status,
      startTs: String(range.value.startTs),
      endTs: String(range.value.endTs),
    },
  });
}

function openStatusCases(status: DqTestCaseStatus): void {
  openTestCases({ testCaseStatus: status });
}

async function loadAggregations(): Promise<void> {
  loadingAggregations.value = true;
  aggregationsError.value = '';
  try {
    aggregations.value = await fetchDqDashboardAggregations(chartFilters.value, range.value);
  } catch (error) {
    aggregations.value = null;
    aggregationsError.value = error instanceof Error ? error.message : t('server.unexpected-error');
  } finally {
    loadingAggregations.value = false;
  }
}

async function loadTimeSeries(): Promise<void> {
  loadingTimeSeries.value = true;
  timeSeriesError.value = '';
  try {
    timeSeries.value = await fetchDqDashboardTimeSeries(chartFilters.value, range.value);
  } catch (error) {
    timeSeries.value = null;
    timeSeriesError.value = error instanceof Error ? error.message : t('server.unexpected-error');
  } finally {
    loadingTimeSeries.value = false;
  }
}

function reload(): void {
  void loadAggregations();
  void loadTimeSeries();
}

watch(
  filters,
  () => {
    reload();
  },
  { deep: true },
);

// In-place navigation (e.g. Term view pushing a child term on the same
// route) reuses this component instance, so the parent's new
// initialFilters would otherwise leave `filters` — and therefore the
// queries — scoped to the previous entity. Reseed only when the prop
// itself changes, so a manual choice on the filter bar is never
// clobbered by this watcher. Reseeding `filters` fires the deep watcher
// above, which reloads; when the reseed changes nothing (only
// entityFQN/domainFqn moved, which chartFilters reads straight from
// the prop), reload explicitly.
watch(
  () => props.initialFilters,
  (next) => {
    const nextState = initialDqFilterState(next);
    const changed = (Object.keys(nextState) as Array<keyof DqDashboardFilterState>).some(
      (key) => filters[key].join('|') !== nextState[key].join('|'),
    );
    Object.assign(filters, nextState);
    if (!changed) {
      reload();
    }
  },
  { deep: true },
);

onMounted(async () => {
  try {
    options.value = await fetchDqDashboardFilterOptions(
      visibleFilters.value.includes('glossaryTerms'),
    );
  } catch {
    options.value = null;
  }
  reload();
});
</script>

<template>
  <div
    data-testid="dq-dashboard-container"
    :class="['dq-dashboard', props.className, { 'dq-dashboard--governance': props.isGovernanceView }]"
  >
    <div v-if="showFilterBar" class="dq-dashboard__filters" data-testid="dq-dashboard-filters">
      <Select
        v-if="visibleFilters.includes('owner')"
        :value="filters.owner"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.owner')"
        :options="options?.owner ?? []"
        data-testid="dq-dashboard-filter-owner"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('owner', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('owner')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <Select
        v-if="visibleFilters.includes('tier')"
        :value="filters.tier"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.tier')"
        :options="options?.tier ?? []"
        data-testid="dq-dashboard-filter-tier"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('tier', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('tier')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <Select
        v-if="visibleFilters.includes('certification')"
        :value="filters.certification"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.certification')"
        :options="options?.certification ?? []"
        data-testid="dq-dashboard-filter-certification"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('certification', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('certification')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <Select
        v-if="visibleFilters.includes('tags')"
        :value="filters.tag"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.tag')"
        :options="options?.tag ?? []"
        data-testid="dq-dashboard-filter-tag"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('tag', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('tag')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <Select
        v-if="visibleFilters.includes('glossaryTerms')"
        :value="filters.glossaryTerm"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.glossary-term')"
        :options="options?.glossaryTerm ?? []"
        data-testid="dq-dashboard-filter-glossary"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('glossaryTerm', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('glossaryTerm')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <Select
        v-if="visibleFilters.includes('dataProducts')"
        :value="filters.dataProduct"
        mode="multiple"
        allow-clear
        show-search
        :placeholder="t('label.data-product')"
        :options="options?.dataProduct ?? []"
        data-testid="dq-dashboard-filter-data-product"
        class="dq-dashboard__filter"
        @change="(value) => setFilter('dataProduct', value)"
      >
        <template #dropdownRender="{ menuNode }">
          <div class="dq-dashboard__select-all">
            <Button type="link" size="small" @click="selectAll('dataProduct')">{{ t('label.select-all') }}</Button>
          </div>
          <component :is="menuNode" />
        </template>
      </Select>
      <span class="dq-dashboard__range-label" data-testid="dq-dashboard-range-label">{{ rangeLabel }}</span>
      <div data-testid="dq-dashboard-filter-range" class="dq-dashboard__filter dq-dashboard__filter--range">
        <DatePicker.RangePicker
          :value="rangePickerValue"
          :aria-label="t('label.last-run')"
          @change="onRangeChange"
        />
      </div>
    </div>

    <Spin :spinning="loadingAggregations || loadingTimeSeries">
      <Space direction="vertical" size="middle" style="width: 100%">
        <Card
          data-testid="dq-dashboard-health"
          class="dq-dashboard__card"
          :title="t('label.data-health')"
        >
          <Typography.Paragraph type="secondary">{{ t('message.data-health-sub-header') }}</Typography.Paragraph>
          <Empty
            v-if="!loadingAggregations && !aggregations?.coverage?.total && !aggregations?.health?.total && !aggregations?.results?.total"
            data-testid="dq-dashboard-health-empty"
            :description="t('label.no-data')"
          />
          <Row v-else :gutter="[16, 16]">
            <Col :xs="24" :lg="8">
              <div class="dq-donut" data-testid="dq-dashboard-coverage-card">
                <div class="dq-donut__title">{{ t('label.data-asset-plural-coverage') }}</div>
                <div class="dq-donut__center">{{ aggregations?.coverage?.total ?? 0 }}</div>
                <SmChart
                  kind="donut"
                  test-id="dq-dashboard-coverage-chart"
                  :series="coverageSeries"
                  :empty="t('label.no-data')"
                  :height="200"
                  segment-clickable
                  @segment-click="openCoverageSegment"
                />
                <div class="dq-donut__legend">
                  {{ t('label.covered') }} {{ aggregations?.coverage?.covered ?? 0 }} ·
                  {{ t('label.uncovered') }} {{ aggregations?.coverage?.notCovered ?? 0 }}
                </div>
              </div>
            </Col>
            <Col :xs="24" :lg="8">
              <div class="dq-donut" data-testid="dq-dashboard-healthy-card">
                <div class="dq-donut__title">{{ t('label.healthy-data-asset-plural') }}</div>
                <div class="dq-donut__center">{{ aggregations?.health?.total ?? 0 }}</div>
                <SmChart
                  kind="donut"
                  test-id="dq-dashboard-healthy-chart"
                  :series="healthSeries"
                  :empty="t('label.no-data')"
                  :height="200"
                  segment-clickable
                  @segment-click="openHealthSegment"
                />
                <div class="dq-donut__legend">
                  {{ t('label.healthy') }} {{ aggregations?.health?.healthy ?? 0 }} ·
                  {{ t('label.unhealthy') }} {{ aggregations?.health?.unhealthy ?? 0 }}
                </div>
              </div>
            </Col>
            <Col :xs="24" :lg="8">
              <div class="dq-donut" data-testid="dq-dashboard-results-card">
                <div class="dq-donut__title">{{ t('label.total-entity', { entity: t('label.test-plural') }) }}</div>
                <div class="dq-donut__center">{{ aggregations?.results?.total ?? 0 }}</div>
                <SmChart
                  kind="donut"
                  test-id="dq-dashboard-results-chart"
                  :series="resultsSeries"
                  :empty="t('label.no-data')"
                  :height="200"
                  segment-clickable
                  @segment-click="openResultsSegment"
                />
                <div class="dq-donut__legend">
                  {{ t('label.success') }} {{ aggregations?.results?.success ?? 0 }} ·
                  {{ t('label.failed') }} {{ aggregations?.results?.failed ?? 0 }} ·
                  {{ t('label.aborted') }} {{ aggregations?.results?.aborted ?? 0 }}
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        <Card
          data-testid="dq-dashboard-dimensions"
          class="dq-dashboard__card"
          :title="t('label.data-dimensions')"
        >
          <Typography.Paragraph type="secondary">{{ t('message.data-dimensions-sub-header') }}</Typography.Paragraph>
          <Alert v-if="aggregationsError" type="error" show-icon :message="aggregationsError" data-testid="dq-dashboard-dimensions-error" />
          <div v-else class="dq-dims">
            <button
              v-for="card in aggregations?.dimensions ?? []"
              :key="card.id"
              type="button"
              class="dq-dim"
              :data-testid="`dq-dashboard-dimension-${card.id}`"
              @click="openTestCases({ dataQualityDimension: card.id })"
            >
              <div class="dq-dim__name">{{ dimensionLabel(card.id) }}</div>
              <div class="dq-dim__total">{{ card.total }}</div>
              <div class="dq-dim__pills">
                <span class="dq-dim__pill dq-dim__pill--success">{{ card.success }}</span>
                <span class="dq-dim__pill dq-dim__pill--failed">{{ card.failed }}</span>
                <span class="dq-dim__pill dq-dim__pill--aborted">{{ card.aborted }}</span>
              </div>
            </button>
          </div>
        </Card>

        <Card
          data-testid="dq-dashboard-status"
          class="dq-dashboard__card"
          :title="t('label.test-case-status')"
        >
          <Typography.Paragraph type="secondary">{{ t('message.test-case-status-sub-header') }}</Typography.Paragraph>
          <Alert v-if="timeSeriesError" type="error" show-icon :message="timeSeriesError" data-testid="dq-dashboard-status-error" />
          <Row v-else :gutter="[16, 16]">
            <Col :xs="24" :md="8">
              <button type="button" class="dq-status-chart dq-status-chart--link" data-testid="dq-dashboard-status-success" @click="openStatusCases('Success')">
                <div class="dq-status-chart__label">{{ t('label.success') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-status-success-value">{{ latestValue(timeSeries?.statusByDay.Success ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-status-success-chart"
                  :series="successSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </button>
            </Col>
            <Col :xs="24" :md="8">
              <button type="button" class="dq-status-chart dq-status-chart--link" data-testid="dq-dashboard-status-aborted" @click="openStatusCases('Aborted')">
                <div class="dq-status-chart__label">{{ t('label.aborted') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-status-aborted-value">{{ latestValue(timeSeries?.statusByDay.Aborted ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-status-aborted-chart"
                  :series="abortedSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </button>
            </Col>
            <Col :xs="24" :md="8">
              <button type="button" class="dq-status-chart dq-status-chart--link" data-testid="dq-dashboard-status-failed" @click="openStatusCases('Failed')">
                <div class="dq-status-chart__label">{{ t('label.failed') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-status-failed-value">{{ latestValue(timeSeries?.statusByDay.Failed ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-status-failed-chart"
                  :series="failedSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </button>
            </Col>
          </Row>
        </Card>

        <Card
          data-testid="dq-dashboard-incidents"
          class="dq-dashboard__card"
          :title="t('label.incident-metrics')"
        >
          <Typography.Paragraph type="secondary">{{ t('message.incident-metrics-sub-header') }}</Typography.Paragraph>
          <Alert v-if="timeSeriesError" type="error" show-icon :message="timeSeriesError" data-testid="dq-dashboard-incidents-error" />
          <Row v-else :gutter="[16, 16]">
            <Col :xs="24" :md="6">
              <button type="button" class="dq-status-chart dq-status-chart--link" data-testid="dq-dashboard-incidents-open" @click="openIncidents('New')">
                <div class="dq-status-chart__label">{{ t('label.open-incident-plural') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-incidents-open-value">{{ latestValue(timeSeries?.incidentsByDay.open ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-incidents-open-chart"
                  :series="openIncidentSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </button>
            </Col>
            <Col :xs="24" :md="6">
              <button type="button" class="dq-status-chart dq-status-chart--link" data-testid="dq-dashboard-incidents-resolved" @click="openIncidents('Resolved')">
                <div class="dq-status-chart__label">{{ t('label.resolved-incident-plural') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-incidents-resolved-value">{{ latestValue(timeSeries?.incidentsByDay.resolved ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-incidents-resolved-chart"
                  :series="resolvedIncidentSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </button>
            </Col>
            <Col :xs="24" :md="6">
              <div class="dq-status-chart" data-testid="dq-dashboard-incidents-response">
                <div class="dq-status-chart__label">{{ t('label.response-time') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-incidents-response-value">{{ averageValue(timeSeries?.incidentTime.response ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-incidents-response-chart"
                  :series="responseTimeSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </div>
            </Col>
            <Col :xs="24" :md="6">
              <div class="dq-status-chart" data-testid="dq-dashboard-incidents-resolution">
                <div class="dq-status-chart__label">{{ t('label.resolution-time') }}</div>
                <div class="dq-status-chart__value" data-testid="dq-dashboard-incidents-resolution-value">{{ averageValue(timeSeries?.incidentTime.resolution ?? []) }}</div>
                <SmChart
                  kind="area"
                  test-id="dq-dashboard-incidents-resolution-chart"
                  :series="resolutionTimeSeries"
                  :empty="t('label.no-data')"
                  :height="120"
                />
              </div>
            </Col>
          </Row>
        </Card>
      </Space>
    </Spin>
  </div>
</template>

<style scoped>
.dq-dashboard__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}
.dq-dashboard__filter {
  min-width: 160px;
}
.dq-dashboard__filter--range {
  margin-left: auto;
}
.dq-dashboard__select-all {
  padding: 4px 8px 0;
}
.dq-dashboard__range-label {
  color: var(--sm-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
/* Governance view (pin `tw:shadow-none` on the section card): the card
   keeps its border and drops only the shadow. */
.dq-dashboard--governance .dq-dashboard__card {
  box-shadow: none;
}
/* The donut is a plain div now, not a button: only the chart slices
   navigate (pin pie widgets are Cards), so the pointer cursor lives
   on the clickable chart canvas, not on the whole card. */
.dq-donut {
  display: block;
  width: 100%;
  padding: 8px;
  border: 0;
  background: transparent;
  text-align: center;
  color: inherit;
}
.dq-donut__title {
  font-weight: 600;
}
.dq-donut__center,
.dq-donut__legend {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.dq-dims {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.dq-dim {
  display: block;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-container);
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.dq-dim__name {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.dq-dim__total {
  font-size: 22px;
  font-weight: 600;
}
.dq-dim__pills {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.dq-dim__pill {
  min-width: 24px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.dq-dim__pill--success {
  background: var(--sm-color-success-bg);
  color: var(--sm-color-success-text);
}
.dq-dim__pill--failed {
  background: var(--sm-color-error-bg);
  color: var(--sm-color-error-text);
}
.dq-dim__pill--aborted {
  background: var(--sm-color-warning-bg);
  color: var(--sm-color-warning-text);
}
/* Clickable area charts are buttons (status + incident counts); the
   incident-time charts keep the plain div and stay display-only. */
.dq-status-chart {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
}
.dq-status-chart--link {
  cursor: pointer;
}
.dq-status-chart__label {
  color: var(--sm-text-secondary);
}
.dq-status-chart__value {
  font-size: 22px;
  font-weight: 600;
}
</style>
