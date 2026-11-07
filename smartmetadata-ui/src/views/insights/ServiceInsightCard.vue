<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Input, Progress, Typography } from 'ant-design-vue';
import SmChart from '@/features/charts/SmChart.vue';
import SmState from '@/components/shared/SmState.vue';
import type { ChartSeries } from '@/features/charts/types';
import { SM_COLOR_PRIMARY, SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';

export interface ServiceLatestValue {
  service: string;
  value: number;
}

/**
 * One official DataInsightChartCard (openmetadata-ui
 * components/DataInsight/DataInsightChartCard.tsx), in the product's
 * dev_ui language: left line chart (one series per service), right column
 * with the headline % (global summary card), the change in percentage
 * points over the window, the KPI target when one exists, and the
 * per-service latest % list (descending, searchable, click a row to
 * filter the chart to that service — official legend-click behaviour).
 * Service names are rendered as-is: official passes pluralize={false}
 * for the service cards, so no plural suffix is ever added.
 *
 * States are exclusive and honestly named: loading while fetching, error
 * when the fetch failed (never a fake empty state), empty only when the
 * fetch succeeded with no points. (ADR:2026-11-07-data-insights-service-cards)
 */
const props = defineProps<{
  title: string;
  headline?: number;
  change?: number;
  days: number;
  target?: number;
  series: ChartSeries[];
  latestByService: ServiceLatestValue[];
  loading: boolean;
  failed: boolean;
  testId: string;
  emptyText: string;
  errorText: string;
}>();

const { t } = useI18n();

const search = ref('');
const selected = ref<string[]>([]);

const hasData = computed(() => props.series.some((item) => item.points.length));

const filteredServices = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return props.latestByService;
  }
  return props.latestByService.filter((item) => item.service.toLowerCase().includes(query));
});

const visibleSeries = computed(() =>
  selected.value.length
    ? props.series.filter((item) => selected.value.includes(item.name))
    : props.series,
);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatChange(value: number): string {
  // +0 normalises -0 so a zero change never renders as "-0.00".
  const rounded = Math.round(value * 100) / 100 + 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/** Official dataInsightColor: palette index by the service's rank. */
function colorFor(service: string): string {
  const index = props.latestByService.findIndex((item) => item.service === service);
  return SM_DATA_INSIGHT_COLORS[index % SM_DATA_INSIGHT_COLORS.length] ?? SM_DATA_INSIGHT_COLORS[0];
}

function toggleService(service: string): void {
  selected.value = selected.value.includes(service)
    ? selected.value.filter((item) => item !== service)
    : [...selected.value, service];
}
</script>

<template>
  <Card size="small" :title="title">
    <SmState v-if="loading" state="loading" :test-id="`${testId}-loading`" />
    <SmState
      v-else-if="failed"
      state="error"
      :test-id="`${testId}-error`"
      :error-text="errorText"
    />
    <SmState
      v-else-if="!hasData"
      state="empty"
      :test-id="`${testId}-empty`"
      :empty-text="emptyText"
    />
    <div v-else>
      <div v-if="headline !== undefined" :data-testid="`${testId}-headline`">
        <Typography.Title :level="4">{{ round2(headline) }}%</Typography.Title>
        <Progress
          :percent="Math.min(100, Math.max(0, headline))"
          :show-info="false"
          :stroke-color="SM_COLOR_PRIMARY"
          size="small"
        />
        <Typography.Paragraph v-if="change !== undefined" type="secondary">
          {{ t('insights.service.change', { value: formatChange(change), days }) }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="target !== undefined" type="secondary">
          {{ t('insights.service.target', { value: round2(target) }) }}
        </Typography.Paragraph>
      </div>
      <SmChart
        kind="line"
        :test-id="testId"
        :series="visibleSeries"
        :colors="SM_DATA_INSIGHT_COLORS"
        :empty="emptyText"
      />
      <Input
        v-model:value="search"
        :data-testid="`${testId}-search`"
        :placeholder="t('insights.service.searchPlaceholder')"
        allow-clear
      />
      <ul :data-testid="`${testId}-services`" class="service-card__list">
        <li
          v-for="item in filteredServices"
          :key="item.service"
          :data-testid="`${testId}-service`"
          :class="['service-card__row', { 'service-card__row--dim': selected.length && !selected.includes(item.service) }]"
          @click="toggleService(item.service)"
        >
          <div class="service-card__meta">
            <span class="service-card__name">{{ item.service }}</span>
            <span class="service-card__value">{{ round2(item.value) }}%</span>
          </div>
          <Progress
            :percent="Math.min(100, Math.max(0, item.value))"
            :show-info="false"
            :stroke-color="colorFor(item.service)"
            size="small"
          />
        </li>
      </ul>
      <div v-if="selected.length" class="service-card__clear">
        <Button type="link" :data-testid="`${testId}-clear`" @click="selected = []">
          {{ t('insights.service.clear') }}
        </Button>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.service-card__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.service-card__row {
  min-width: 0;
  margin-block-end: 8px;
  cursor: pointer;
}
.service-card__row--dim {
  opacity: 0.45;
}
.service-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 18px;
}
.service-card__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.service-card__value {
  flex-shrink: 0;
}
.service-card__clear {
  display: flex;
  justify-content: flex-end;
}
</style>
