<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official test-cases tab PieChartSummaryPanel / useTestSummaryCards
  (所有测试 / 健康的数据资产 / 数据资产覆盖范围) as Vue3 + ant-design-vue donuts.
  No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SmChart from '@/features/charts/SmChart.vue';
import { namedSeries } from '@/features/charts/series';
import type { CoverageCounts, HealthCounts, StatusCounts } from '@/quality/landing';
import { insightPercent } from '@/quality/testCaseFilters';

const props = defineProps<{
  results?: StatusCounts | null;
  health?: HealthCounts | null;
  coverage?: CoverageCounts | null;
}>();

const { t } = useI18n();

const visible = computed(
  () => Boolean(props.results || props.health || props.coverage),
);

/** Official useTestSummaryCards segment order: success, aborted, failed. */
const resultsSeries = computed(() =>
  props.results && props.results.total
    ? namedSeries(t('quality.testCases.allTests'), [
        { label: t('quality.landing.success'), value: props.results.success },
        { label: t('quality.landing.aborted'), value: props.results.aborted },
        { label: t('quality.landing.failed'), value: props.results.failed },
      ])
    : [],
);

const healthSeries = computed(() =>
  props.health && props.health.total
    ? namedSeries(t('quality.testCases.healthyAssets'), [
        { label: t('quality.landing.healthy'), value: props.health.healthy },
        { label: t('quality.landing.unhealthy'), value: props.health.unhealthy },
      ])
    : [],
);

const coverageSeries = computed(() =>
  props.coverage && props.coverage.total
    ? namedSeries(t('quality.testCases.coverage'), [
        { label: t('quality.landing.covered'), value: props.coverage.covered },
        { label: t('quality.landing.notCovered'), value: props.coverage.notCovered },
      ])
    : [],
);

const resultsPercent = computed(() => insightPercent(props.results?.success ?? 0, props.results?.total ?? 0));
const healthPercent = computed(() => insightPercent(props.health?.healthy ?? 0, props.health?.total ?? 0));
const coveragePercent = computed(() => insightPercent(props.coverage?.covered ?? 0, props.coverage?.total ?? 0));
</script>

<template>
  <div v-if="visible" class="tc-insights" data-testid="test-cases-insights">
    <div class="tc-insights__card" data-testid="test-cases-insight-all">
      <div class="tc-insights__meta">
        <div class="tc-insights__title">{{ t('quality.testCases.allTests') }}</div>
        <strong class="tc-insights__value">{{ results?.total ?? 0 }}</strong>
        <div class="tc-insights__legend">
          {{ t('quality.landing.success') }} {{ results?.success ?? 0 }} ·
          {{ t('quality.landing.aborted') }} {{ results?.aborted ?? 0 }} ·
          {{ t('quality.landing.failed') }} {{ results?.failed ?? 0 }}
        </div>
      </div>
      <div class="tc-insights__chart">
        <div class="tc-insights__percent">{{ resultsPercent }}</div>
        <SmChart kind="donut" test-id="test-cases-insight-all-chart" :series="resultsSeries" :empty="t('quality.landing.chartEmpty')" :height="140" />
      </div>
    </div>
    <div class="tc-insights__card" data-testid="test-cases-insight-health">
      <div class="tc-insights__meta">
        <div class="tc-insights__title">{{ t('quality.testCases.healthyAssets') }}</div>
        <strong class="tc-insights__value">{{ health?.healthy ?? 0 }}</strong>
      </div>
      <div class="tc-insights__chart">
        <div class="tc-insights__percent">{{ healthPercent }}</div>
        <SmChart kind="donut" test-id="test-cases-insight-health-chart" :series="healthSeries" :empty="t('quality.landing.chartEmpty')" :height="140" />
      </div>
    </div>
    <div class="tc-insights__card" data-testid="test-cases-insight-coverage">
      <div class="tc-insights__meta">
        <div class="tc-insights__title">{{ t('quality.testCases.coverage') }}</div>
        <strong class="tc-insights__value">{{ coverage?.covered ?? 0 }}</strong>
      </div>
      <div class="tc-insights__chart">
        <div class="tc-insights__percent">{{ coveragePercent }}</div>
        <SmChart kind="donut" test-id="test-cases-insight-coverage-chart" :series="coverageSeries" :empty="t('quality.landing.chartEmpty')" :height="140" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tc-insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.tc-insights__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--sm-bg-container);
}
.tc-insights__title {
  color: var(--sm-text-secondary);
  font-size: 13px;
}
.tc-insights__value {
  display: block;
  font-size: 28px;
  line-height: 1.2;
}
.tc-insights__legend,
.tc-insights__percent {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.tc-insights__chart {
  position: relative;
  width: 140px;
  flex: 0 0 140px;
  text-align: center;
}
.tc-insights__percent {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  pointer-events: none;
  z-index: 1;
}
</style>
