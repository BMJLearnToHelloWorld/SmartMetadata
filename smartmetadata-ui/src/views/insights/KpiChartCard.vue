<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Progress, Row, Tooltip, Typography } from 'ant-design-vue';
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import type { InsightResultPoint } from '@/api/dataInsights';
import { getLatestKpiResult, listKpiResults } from '@/api/kpi';
import SmState from '@/components/shared/SmState.vue';
import { formatChartTs } from '@/features/charts/series';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import { hexToRgba } from '@/theme/customTheme';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import type { Kpi, KpiResult } from '@/types/kpi';

/**
 * Official KPIChart (openmetadata-ui components/DataInsight/KPIChart.tsx),
 * in the product's dev_ui language: the Data Assets page's KPI section
 * (id="kpi-charts", pin :234) between the summary cards and the six
 * system cards. Left 16/24 is the KPI-result line chart (500px, pin
 * GRAPH_HEIGHT), right 8/24 is the latest result per KPI (pin
 * KPILatestResultsV1); no KPI at all shows the NoDataPlaceholder copy
 * with an Add KPI button (pin :296-318). The series colour is the
 * palette index in KPI-list order (pin chartColor(palette, index),
 * :187), and the tooltip formats each value with `%` only when every
 * plotted KPI is PERCENTAGE — pin formats per series by metricType
 * (:197-201) but SmChart carries a single whole-chart switch, so a
 * mixed-metric chart shows no suffix rather than a wrong one.
 */
const props = withDefaults(
  defineProps<{
    /** KPI definitions, in list order (pin kpiList, from the provider). */
    kpis: Kpi[];
    /** Chart window, in ms (pin chartFilter.startTs/endTs). */
    startTs: number;
    endTs: number;
    /** KPI-list loading state (pin isKpiLoading). */
    loading: boolean;
    testId?: string;
  }>(),
  { testId: 'insights-kpi' },
);

const { t, locale } = useI18n();
const router = useRouter();

const results = ref<Record<string, InsightResultPoint[]>>({});
const latest = ref<Record<string, { kpi: Kpi; result: KpiResult }>>({});
const resultsLoading = ref(false);

/** Palette index in KPI-list order (pin chartColor(palette, index)). */
function seriesColor(index: number): string {
  return SM_DATA_INSIGHT_COLORS[index % SM_DATA_INSIGHT_COLORS.length] ?? SM_DATA_INSIGHT_COLORS[0];
}

/**
 * Pin KPIChart.tsx:88-98 + :126-174: per-KPI result history and latest
 * result, both Promise.allSettled — a failed KPI is silently dropped
 * (the outer catch never fires under allSettled, like pin's). The
 * latest result is only kept when its KPI carries a targetValue (pin's
 * two isUndefined guards); the window change clears the old results
 * first (pin :212-215 reset effect).
 */
async function fetchResults(): Promise<void> {
  const kpis = props.kpis;
  results.value = {};
  latest.value = {};
  if (!kpis.length) {
    return;
  }
  resultsLoading.value = true;
  try {
    const seriesResponses = await Promise.allSettled(
      kpis.map((kpi) =>
        listKpiResults(kpi.fullyQualifiedName || kpi.name, { startTs: props.startTs, endTs: props.endTs }),
      ),
    );
    const nextResults: Record<string, InsightResultPoint[]> = {};
    seriesResponses.forEach((response, index) => {
      const kpi = kpis[index] as Kpi;
      if (response.status === 'fulfilled') {
        nextResults[kpi.name] = response.value;
      }
    });
    results.value = nextResults;
    const latestResponses = await Promise.allSettled(
      kpis.map((kpi) => getLatestKpiResult(kpi.fullyQualifiedName || kpi.name)),
    );
    const nextLatest: Record<string, { kpi: Kpi; result: KpiResult }> = {};
    latestResponses.forEach((response, index) => {
      const kpi = kpis[index] as Kpi;
      if (response.status !== 'fulfilled' || !response.value || kpi.targetValue === undefined) {
        return;
      }
      nextLatest[kpi.fullyQualifiedName || kpi.name] = { kpi, result: response.value };
    });
    latest.value = nextLatest;
  } finally {
    resultsLoading.value = false;
  }
}

watch(
  () => [props.kpis, props.startTs, props.endTs],
  () => {
    void fetchResults();
  },
  { deep: true },
);

onMounted(() => {
  void fetchResults();
});

const kpiSeries = computed<ChartSeries[]>(() =>
  props.kpis.flatMap((kpi, index) => {
    const points = (results.value[kpi.name] ?? []).flatMap((point) => {
      if (point.count === undefined || !Number.isFinite(point.count) || point.day === undefined) {
        return [];
      }
      const label = formatChartTs(point.day);
      return label ? [{ label, value: point.count }] : [];
    });
    if (!points.length) {
      return [];
    }
    return [{ name: kpi.name, points, color: seriesColor(index) }];
  }),
);

const hasData = computed(() => kpiSeries.value.length > 0);

/** KPIs that actually plot, for the tooltip `%` switch (see header). */
const plottedKpis = computed(() =>
  props.kpis.filter((kpi) => (results.value[kpi.name] ?? []).length > 0),
);
const allPercentage = computed(
  () => plottedKpis.value.length > 0 && plottedKpis.value.every((kpi) => kpi.metricType === 'PERCENTAGE'),
);

/** Latest results in KPI-list order, with their series colour. */
const latestItems = computed(() =>
  props.kpis.flatMap((kpi, index) => {
    const entry = latest.value[kpi.fullyQualifiedName || kpi.name];
    if (!entry || !entry.result.targetResult[0]) {
      return [];
    }
    return [{ kpi, result: entry.result, color: seriesColor(index) }];
  }),
);

/** Pin DateTimeUtils.ts:355-358 getDaysRemaining: days to endDate, truncated toward zero. */
function daysRemaining(endDate?: number): number {
  if (endDate === undefined) {
    return 0;
  }
  return Math.trunc((endDate - Date.now()) / 86_400_000);
}

function isTargetMet(item: { result: KpiResult }): boolean {
  return item.result.targetResult[0]?.targetMet === true;
}

function currentValue(item: { result: KpiResult }): number {
  return Number(item.result.targetResult[0]?.value);
}

function targetValue(item: { kpi: Kpi }): number {
  return item.kpi.targetValue ?? Number.NaN;
}

/** Pin KPILatestResultsV1.tsx:143-160: progress is current/target, clamped 0–100. */
function progressValue(item: { kpi: Kpi; result: KpiResult }): number {
  const target = targetValue(item);
  if (!target) {
    return 0;
  }
  return Math.min(100, Math.max(0, (currentValue(item) / target) * 100));
}

/** Pin KPILatestResultsV1.tsx:69-76: percentage values toFixed(2) + `%`, numbers as-is. */
function formatTargetValue(value: number, isPercentage: boolean): string {
  return isPercentage ? `${value.toFixed(2)}%` : String(value);
}

/**
 * Pin utils/DataInsightUtils.tsx:91-103 getKpiResultFeedback, with the
 * pin locale strings (insights.kpiChart.target*). The fourth branch
 * (days left, not met) is unreachable in the tooltip — pin only shows
 * the tooltip when daysLeft <= 0 or the target is met — but the mapping
 * is kept complete.
 */
function feedbackText(daysLeft: number, met: boolean): string {
  if (daysLeft > 0 && met) {
    return t('insights.kpiChart.targetAchievedBeforeTime');
  }
  if (daysLeft <= 0 && !met) {
    return t('insights.kpiChart.targetOverdue', { count: daysLeft });
  }
  if (met) {
    return t('insights.kpiChart.targetAchieved');
  }
  return t('insights.kpiChart.daysLeft', { days: daysLeft });
}

/** Pin KPIChart.tsx:86 handleAddKpi -> ROUTES.ADD_KPI; the product's
 * equivalent is the existing insights-kpis-add route (KpiFormView). */
function onAddKpi(): void {
  void router.push({ name: 'insights-kpis-add' });
}
</script>

<template>
  <Card size="small" id="kpi-charts" :data-testid="`${testId}-card`" class="kpi-chart-card">
    <Typography.Title :level="5" class="kpi-chart-card__title">{{ t('insights.kpiChart.title') }}</Typography.Title>
    <Typography.Paragraph type="secondary" class="kpi-chart-card__sub">
      {{ t('insights.kpiChart.subtitle') }}
    </Typography.Paragraph>
    <SmState v-if="loading || resultsLoading" state="loading" :test-id="`${testId}-loading`" />
    <div v-else-if="!kpis.length" class="kpi-chart__no-data">
      <SmState state="empty" :test-id="`${testId}-empty`" :empty-text="t('insights.kpiChart.noKpi')" />
      <Button type="primary" :data-testid="`${testId}-add`" @click="onAddKpi">
        {{ t('insights.kpis.add') }}
      </Button>
    </div>
    <SmState
      v-else-if="!hasData"
      state="empty"
      :test-id="`${testId}-no-results`"
      :empty-text="t('insights.kpis.noHistory')"
    />
    <Row v-else :gutter="32">
      <Col :xs="24" :lg="16">
        <div id="kpi-chart">
          <SmChart
            kind="line"
            :test-id="testId"
            :series="kpiSeries"
            :colors="SM_DATA_INSIGHT_COLORS"
            :height="500"
            hide-legend
            :tooltip-percentage="allPercentage"
            :tooltip-locale="locale"
            :empty="t('insights.kpis.noHistory')"
          />
        </div>
      </Col>
      <Col v-if="latestItems.length" :xs="24" :lg="8">
        <div :data-testid="`${testId}-latest`" class="kpi-chart__latest-list">
          <div
            v-for="item in latestItems"
            :key="item.kpi.fullyQualifiedName || item.kpi.name"
            :data-testid="`${testId}-latest-${item.kpi.name}`"
            class="kpi-chart__latest"
          >
            <div
              class="kpi-chart__days"
              :style="{
                backgroundColor: hexToRgba(item.color, 0.1) ?? undefined,
                color: item.color,
              }"
            >
              <CheckCircleOutlined
                v-if="isTargetMet(item)"
                :data-testid="`${testId}-success`"
                class="kpi-chart__days-icon"
              />
              <template v-else>
                <span class="kpi-chart__days-number">{{ Math.max(0, daysRemaining(item.kpi.endDate)) }}</span>
                <span class="kpi-chart__days-label">{{ t('insights.kpiChart.daysLeftLabel') }}</span>
              </template>
            </div>
            <div class="kpi-chart__latest-body">
              <div class="kpi-chart__latest-head">
                <span class="kpi-chart__latest-name">{{ item.kpi.displayName || item.kpi.name }}</span>
                <Tooltip
                  v-if="daysRemaining(item.kpi.endDate) <= 0 || isTargetMet(item)"
                  :title="feedbackText(daysRemaining(item.kpi.endDate), isTargetMet(item))"
                >
                  <InfoCircleOutlined class="kpi-chart__latest-info" />
                </Tooltip>
              </div>
              <Progress
                :percent="progressValue(item)"
                :show-info="false"
                :stroke-color="item.color"
                size="small"
              />
              <div class="kpi-chart__latest-values">
                <span>{{ formatTargetValue(currentValue(item), item.kpi.metricType === 'PERCENTAGE') }}</span>
                <span>{{ formatTargetValue(targetValue(item), item.kpi.metricType === 'PERCENTAGE') }}</span>
              </div>
            </div>
          </div>
        </div>
      </Col>
    </Row>
  </Card>
</template>

<style scoped>
.kpi-chart-card__title {
  margin-bottom: 4px;
}
.kpi-chart-card__sub {
  margin-bottom: 12px;
}
.kpi-chart__no-data {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-block: 16px;
}
.kpi-chart__latest-list {
  display: grid;
  gap: 16px;
}
.kpi-chart__latest {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* Pin KPILatestResultsV1 kpi-days-section: the coloured days badge. */
.kpi-chart__days {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 56px;
  min-height: 56px;
  padding: 8px;
  border-radius: var(--sm-radius-card);
}
.kpi-chart__days-icon {
  font-size: 20px;
}
.kpi-chart__days-number {
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
}
.kpi-chart__days-label {
  font-size: 12px;
  line-height: 18px;
}
.kpi-chart__latest-body {
  flex: 1;
  min-width: 0;
}
.kpi-chart__latest-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 18px;
}
.kpi-chart__latest-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.kpi-chart__latest-info {
  flex-shrink: 0;
}
.kpi-chart__latest-values {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  line-height: 18px;
}
</style>
