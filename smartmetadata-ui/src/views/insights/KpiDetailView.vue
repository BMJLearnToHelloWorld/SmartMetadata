<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions } from 'ant-design-vue';
import { getKpiByName, getLatestKpiResult, listKpiResults } from '@/api/kpi';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmChart from '@/features/charts/SmChart.vue';
import { formatChartTs } from '@/features/charts/series';
import { seriesWindow, type ChartSeries } from '@/features/charts/types';
import SmState from '@/components/shared/SmState.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { Kpi, KpiResult } from '@/types/kpi';

/**
 * Official standalone KPI detail page (pages/KPIPage): definition plus a
 * result-history chart. The list keeps its Stage 6 selection preview; this
 * page is the canonical detail, reached from the list View action and by
 * direct URL, and it alone carries the history chart.
 */
const props = defineProps<{ fqn: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const kpi = ref<Kpi | null>(null);
const latest = ref<KpiResult | undefined>(undefined);
const history = ref<ChartSeries[]>([]);

function formatTs(value?: number): string {
  if (!value) {
    return '—';
  }
  return new Date(value < 1e12 ? value * 1000 : value).toLocaleString();
}

const historySeries = computed<ChartSeries[]>(() => history.value);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const found = await getKpiByName(decodeURIComponent(props.fqn));
    kpi.value = found;
    const window = seriesWindow(30);
    const [points, latestResult] = await Promise.all([
      listKpiResults(found.name, { startTs: window.startTs, endTs: window.endTs }),
      getLatestKpiResult(found.name),
    ]);
    latest.value = latestResult;
    const chartPoints = points
      .filter((point) => point.day !== undefined && point.count !== undefined)
      .map((point) => ({ label: formatChartTs(point.day), value: point.count ?? 0 }));
    history.value = chartPoints.length ? [{ name: t('insights.kpis.history'), points: chartPoints }] : [];
  } catch (error) {
    kpi.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmBreadcrumb
    :items="[
      { label: t('insights.tabs.kpis'), routeName: 'insights-kpis' },
      { label: entityLabel(kpi) || props.fqn },
    ]"
  />
  <PageHeader
    :header="entityLabel(kpi) || props.fqn"
    :sub-header="t('insights.kpis.detailLead')"
    test-id="kpi-detail-header"
  />
  <SmState
    v-if="loading || errorMessage || !kpi"
    :state="loading ? 'loading' : errorMessage ? 'error' : 'empty'"
    :error-text="errorMessage || undefined"
    :empty-text="t('crud.empty')"
    show-retry
    @retry="load"
  />
  <template v-else>
    <Descriptions bordered :column="1" size="small" data-testid="kpi-detail">
      <Descriptions.Item :label="t('crud.name')">{{ kpi.name }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.displayName')">{{ kpi.displayName || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.description')">{{ kpi.description || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.metricType')">{{ kpi.metricType || '—' }}</Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.target')">
        {{ kpi.targetValue === undefined ? '—' : kpi.targetValue }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.current')">
        {{ latest?.targetResult[0]?.value ?? kpi.kpiResult?.targetResult[0]?.value ?? '—' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.targetMet')">
        {{
          (latest?.targetResult[0]?.targetMet ?? kpi.kpiResult?.targetResult[0]?.targetMet) ===
          undefined
            ? '—'
            : (latest?.targetResult[0]?.targetMet ?? kpi.kpiResult?.targetResult[0]?.targetMet)
              ? t('crud.yes')
              : t('crud.no')
        }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.chart')">
        {{ kpi.dataInsightChart?.displayName || kpi.dataInsightChart?.name || '—' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.start')">{{ formatTs(kpi.startDate) }}</Descriptions.Item>
      <Descriptions.Item :label="t('insights.kpis.end')">{{ formatTs(kpi.endDate) }}</Descriptions.Item>
      <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(kpi.owners) || '—' }}</Descriptions.Item>
    </Descriptions>
    <Button
      data-testid="kpi-detail-edit"
      style="margin-top: 12px"
      @click="router.push({ name: 'insights-kpis-edit', params: { fqn: kpi.fullyQualifiedName || kpi.name } })"
    >
      {{ t('crud.edit') }}
    </Button>
    <SmChart
      kind="line"
      test-id="kpi-history-chart"
      :series="historySeries"
      :empty="t('insights.kpis.noHistory')"
      style="margin-top: 16px"
    />
  </template>
</template>
