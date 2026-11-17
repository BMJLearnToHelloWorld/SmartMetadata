<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ArrowUpOutlined, DownOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Collapse, Skeleton, Tooltip } from 'ant-design-vue';
import type { ServiceKind } from '@/types/ingestion';
import {
  getChartTypeForWidget,
  getReadableCountString,
  PLATFORM_INSIGHTS_CHARTS,
} from './serviceInsightsUtils';

/**
 * Platform insights widget, ported from official
 * components/ServiceInsights/PlatformInsightsWidget/PlatformInsightsWidget.tsx
 * (pin a3012259ca). Numeric cards, never line charts. The accordion
 * starts open. The Healthy Data Assets chart renders only for
 * database services; chart entries without a chart type (the
 * formatter's empty-data shape) render no card. The `embedded`
 * variant is not ported: the service page tab always uses the
 * accordion form.
 */
export interface ChartSeriesData {
  chartType?: string;
  percentageChange?: number;
  currentPercentage: number;
  isIncreased?: boolean;
  noRecords?: boolean;
  numberOfDays: number;
}

const props = defineProps<{
  chartsData: ChartSeriesData[];
  isLoading: boolean;
  serviceKind: ServiceKind;
}>();

const { t } = useI18n();

const CHART_TITLE_KEYS: Record<string, string> = {
  assets_with_description: 'serviceDetail.insights.descriptionCoverage',
  assets_with_owners: 'serviceDetail.insights.ownershipCoverage',
  assets_with_pii: 'serviceDetail.insights.piiCoverage',
  assets_with_tier: 'serviceDetail.insights.tierCoverage',
  healthy_data_assets: 'serviceDetail.insights.healthyDataAssets',
};

const filteredCharts = computed(() =>
  PLATFORM_INSIGHTS_CHARTS.filter((chart) =>
    chart === 'healthy_data_assets' ? props.serviceKind === 'database' : true,
  ),
);

const filteredChartsData = computed(() =>
  props.chartsData.filter(
    (chart): chart is ChartSeriesData & { chartType: string } =>
      chart.chartType !== undefined &&
      (filteredCharts.value as readonly string[]).includes(
        getChartTypeForWidget(chart.chartType),
      ),
  ),
);

function chartTitle(chartType: string): string {
  return t(CHART_TITLE_KEYS[getChartTypeForWidget(chartType)] ?? '');
}
</script>

<template>
  <div class="platform-insights-widget">
    <Collapse expand-icon-position="end" :default-active-key="['1']">
      <template #expandIcon>
        <span class="platform-insights-widget__view-more">
          {{ t('serviceDetail.insights.viewMore') }}
          <DownOutlined />
        </span>
      </template>
      <Collapse.Panel key="1">
        <template #header>
          <div class="platform-insights-widget__header">
            <div class="platform-insights-widget__title">
              {{ t('serviceDetail.insights.platformInsightsTitle') }}
            </div>
            <div class="platform-insights-widget__description">
              {{ t('serviceDetail.insights.platformInsightsDescription') }}
            </div>
          </div>
        </template>
        <div class="platform-insights-widget__grid">
          <template v-if="isLoading">
            <div
              v-for="chartType in filteredCharts"
              :key="chartType"
              class="platform-insights-widget__card"
            >
              <Skeleton :paragraph="{ rows: 2 }" active />
            </div>
          </template>
          <template v-else>
            <div
              v-for="chart in filteredChartsData"
              :key="chart.chartType"
              class="platform-insights-widget__card"
            >
              <Tooltip :title="chartTitle(chart.chartType)">
                <div class="platform-insights-widget__card-title">
                  {{ chartTitle(chart.chartType) }}
                </div>
              </Tooltip>
              <div class="platform-insights-widget__card-value-row">
                <span class="platform-insights-widget__card-value">
                  {{ getReadableCountString(chart.currentPercentage) }}%
                </span>
                <span
                  v-if="chart.percentageChange !== undefined"
                  class="platform-insights-widget__badge"
                  :class="
                    chart.isIncreased
                      ? 'platform-insights-widget__badge--up'
                      : 'platform-insights-widget__badge--down'
                  "
                >
                  <ArrowUpOutlined
                    v-if="chart.percentageChange !== 0"
                    :class="{ 'platform-insights-widget__arrow--down': !chart.isIncreased }"
                  />
                  {{ getReadableCountString(chart.percentageChange) }}%
                </span>
              </div>
              <div
                v-if="chart.percentageChange !== undefined"
                class="platform-insights-widget__card-days"
              >
                {{
                  chart.numberOfDays === 1
                    ? t('serviceDetail.insights.inLastDay')
                    : t('serviceDetail.insights.inLastDays', { numberOfDays: chart.numberOfDays })
                }}
              </div>
            </div>
          </template>
        </div>
      </Collapse.Panel>
    </Collapse>
  </div>
</template>

<style scoped>
.platform-insights-widget__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.platform-insights-widget__title {
  font-size: 18px;
  font-weight: 500;
}

.platform-insights-widget__description {
  font-size: 14px;
  color: var(--sm-text-secondary);
}

.platform-insights-widget__view-more {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sm-brand);
}

.platform-insights-widget__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 16px;
}

.platform-insights-widget__card {
  padding: 16px;
  border-radius: 12px;
  background: var(--sm-bg-secondary);
}

.platform-insights-widget__card-title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-insights-widget__card-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.platform-insights-widget__card-value {
  font-size: 20px;
  font-weight: 600;
}

.platform-insights-widget__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--sm-radius-full);
  font-size: 12px;
  font-weight: 600;
}

.platform-insights-widget__badge--up {
  background: var(--sm-color-success-bg);
  color: var(--sm-color-success-text);
}

.platform-insights-widget__badge--down {
  background: var(--sm-color-error-bg);
  color: var(--sm-color-error-text);
}

.platform-insights-widget__arrow--down {
  transform: rotate(180deg);
}

.platform-insights-widget__card-days {
  overflow: hidden;
  margin-top: 4px;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-text-secondary);
}
</style>
