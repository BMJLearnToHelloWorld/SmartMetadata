<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Card, Col, Empty, Row, Spin, Tabs, Typography } from 'ant-design-vue';
import { listSystemChartData, SYSTEM_CHART_NAMES } from '@/api/dataInsights';
import { searchAssets } from '@/api/search';
import { listTestCases } from '@/api/testCases';
import { listTestIncidents } from '@/api/testIncidents';
import type { FacetId } from '@/catalog/searchFacets';
import SmChart from '@/features/charts/SmChart.vue';
import { bucketsToPoints, insightResultsToSeries, namedSeries, testResultsToStatusPoints } from '@/features/charts/series';
import type { ChartSeries } from '@/features/charts/types';
import { seriesWindow } from '@/features/charts/types';

const { t, te } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const catalogTotal = ref(0);
const entitySeries = ref<ChartSeries[]>([]);
const serviceSeries = ref<ChartSeries[]>([]);
const tierSeries = ref<ChartSeries[]>([]);
const testSeries = ref<ChartSeries[]>([]);
const incidentSeries = ref<ChartSeries[]>([]);
const pipeline = ref<Array<{ name: string; title: string; series: ChartSeries[] }>>([]);
const pipelineError = ref('');
const pipelineTried = ref(false);

function facetBuckets(facets: Array<{ id: FacetId; buckets: Array<{ key: string; count: number }> }>, id: FacetId) {
  return facets.find((facet) => facet.id === id)?.buckets ?? [];
}

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

const pipelineHasPoints = computed(() => pipeline.value.some((chart) => chart.series.some((item) => item.points.length)));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  pipelineError.value = '';
  pipelineTried.value = false;
  try {
    const window = seriesWindow();
    const [search, tests, incidents] = await Promise.all([
      searchAssets('*', 0, 1),
      listTestCases({ limit: 100 }),
      listTestIncidents({ latest: true, limit: 100 }),
    ]);
    catalogTotal.value = search.total;
    entitySeries.value = namedSeries(
      t('insights.series.entityType'),
      bucketsToPoints(facetBuckets(search.facets, 'entityType')).map((point) => ({
        ...point,
        label: entityLabel(point.label),
      })),
    );
    serviceSeries.value = namedSeries(
      t('insights.series.serviceType'),
      bucketsToPoints(facetBuckets(search.facets, 'serviceType')),
    );
    tierSeries.value = namedSeries(
      t('insights.series.tier'),
      bucketsToPoints(facetBuckets(search.facets, 'tier')),
    );
    testSeries.value = namedSeries(
      t('insights.series.testStatus'),
      testResultsToStatusPoints(
        tests.data.map((item) => ({
          testCaseStatus: item.testCaseResult?.testCaseStatus || item.testCaseStatus,
        })),
      ),
    );
    incidentSeries.value = namedSeries(
      t('insights.series.incidentStatus'),
      testResultsToStatusPoints(incidents.data.map((item) => ({ testCaseStatus: item.testCaseResolutionStatusType }))),
    );
    pipelineTried.value = true;
    try {
      const data = await listSystemChartData(SYSTEM_CHART_NAMES, window.startTs, window.endTs);
      pipeline.value = SYSTEM_CHART_NAMES.flatMap((name) => {
        const series = insightResultsToSeries(name, data[name] ?? []);
        return [{ name, title: t(`insights.pipeline.${name}`), series }];
      });
    } catch (error) {
      pipeline.value = [];
      pipelineError.value = error instanceof Error ? error.message : t('insights.pipelineFailed');
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Spin :spinning="loading">
    <Typography.Title :level="4">{{ t('insights.title') }}</Typography.Title>
    <Typography.Paragraph type="secondary">{{ t('insights.lead') }}</Typography.Paragraph>
    <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="insights__alert" />
    <Tabs data-testid="insights-tabs">
      <Tabs.TabPane key="data-assets" :tab="t('insights.tabs.dataAssets')">
        <Typography.Paragraph>
          {{ t('insights.catalogTotal', { total: catalogTotal }) }}
        </Typography.Paragraph>
        <Row :gutter="[16, 16]">
          <Col :xs="24" :lg="12">
            <Card size="small" :title="t('insights.charts.entityType')">
              <Typography.Paragraph type="secondary">{{ t('insights.charts.entityTypeLead') }}</Typography.Paragraph>
              <SmChart kind="donut" test-id="insights-entity-chart" :series="entitySeries" :empty="t('charts.empty')" />
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" :title="t('insights.charts.serviceType')">
              <Typography.Paragraph type="secondary">{{ t('insights.charts.serviceTypeLead') }}</Typography.Paragraph>
              <SmChart kind="bar" test-id="insights-service-chart" :series="serviceSeries" :empty="t('charts.empty')" />
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" :title="t('insights.charts.tier')">
              <Typography.Paragraph type="secondary">{{ t('insights.charts.tierLead') }}</Typography.Paragraph>
              <SmChart kind="bar" test-id="insights-tier-chart" :series="tierSeries" :empty="t('charts.empty')" />
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" :title="t('insights.charts.testStatus')">
              <Typography.Paragraph type="secondary">{{ t('insights.charts.testStatusLead') }}</Typography.Paragraph>
              <SmChart kind="donut" test-id="insights-test-chart" :series="testSeries" :empty="t('charts.empty')" />
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" :title="t('insights.charts.incidents')">
              <Typography.Paragraph type="secondary">{{ t('insights.charts.incidentsLead') }}</Typography.Paragraph>
              <SmChart kind="donut" test-id="insights-incident-chart" :series="incidentSeries" :empty="t('charts.empty')" />
            </Card>
          </Col>
        </Row>
        <Typography.Title :level="5" class="insights__sub">{{ t('insights.pipelineTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('insights.pipelineLead') }}</Typography.Paragraph>
        <Alert v-if="pipelineError" type="warning" show-icon :message="pipelineError" class="insights__alert" />
        <Empty
          v-if="pipelineTried && !pipelineError && !pipelineHasPoints"
          data-testid="insights-pipeline-empty"
          :description="t('insights.pipelineEmpty')"
        />
        <Row v-else :gutter="[16, 16]">
          <Col v-for="chart in pipeline" :key="chart.name" :xs="24" :lg="12">
            <Card size="small" :title="chart.title">
              <SmChart
                kind="line"
                :test-id="`insights-pipeline-${chart.name}`"
                :series="chart.series"
                :empty="t('insights.pipelineEmpty')"
              />
            </Card>
          </Col>
        </Row>
      </Tabs.TabPane>
      <Tabs.TabPane key="app-analytics" :tab="t('insights.tabs.appAnalytics')">
        <Empty data-testid="insights-app-analytics-empty" :description="t('insights.appAnalyticsEmpty')" />
      </Tabs.TabPane>
      <Tabs.TabPane key="kpis" :tab="t('insights.tabs.kpis')">
        <Empty data-testid="insights-kpis-empty" :description="t('insights.kpisEmpty')" />
      </Tabs.TabPane>
    </Tabs>
  </Spin>
</template>

<style scoped>
.insights__alert {
  margin-block: 12px;
}
.insights__sub {
  margin-top: 20px;
}
</style>
