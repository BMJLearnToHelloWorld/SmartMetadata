<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Card, Col, Empty, Progress, Row, Select, Spin, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { listSystemChartData, SYSTEM_CHART_NAMES, type SystemChartData } from '@/api/dataInsights';
import {
  DATA_REPORT_INDEXES,
  getAggregateChartData,
  type DataInsightAggregateRow,
} from '@/api/dataInsights';
import { getTeamByName } from '@/api/teams';
import { searchAssets } from '@/api/search';
import { listTestCases } from '@/api/testCases';
import { listTestIncidents } from '@/api/testIncidents';
import { INSIGHT_DATE_PRESETS, insightsDatePresetFromKey } from '@/catalog/insightsTabs';
import type { FacetId } from '@/catalog/searchFacets';
import SmChart from '@/features/charts/SmChart.vue';
import { bucketsToPoints, formatChartTs, insightResultsToSeries, namedSeries, testResultsToStatusPoints } from '@/features/charts/series';
import type { ChartSeries } from '@/features/charts/types';
import { seriesWindow } from '@/features/charts/types';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';

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
const webError = ref('');
const webTried = ref(false);
const mostActiveUsers = ref<DataInsightAggregateRow[]>([]);
const dailyActiveSeries = ref<ChartSeries[]>([]);
const pageViewEntities = ref<DataInsightAggregateRow[]>([]);
const datePreset = ref(insightsDatePresetFromKey('last30').key);
const orgName = ref('');
const systemData = ref<SystemChartData>({});

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function facetBuckets(facets: Array<{ id: FacetId; buckets: Array<{ key: string; count: number }> }>, id: FacetId) {
  return facets.find((facet) => facet.id === id)?.buckets ?? [];
}

const pipelineHasPoints = computed(() => pipeline.value.some((chart) => chart.series.some((item) => item.points.length)));

/**
 * Data Insight summary (official DataInsightSummary.tsx +
 * utils/DataInsightUtils.tsx getEntitiesChartSummary +
 * components/DataInsight/EntitySummaryProgressBar.component.tsx):
 * the heading names the Organization team (GET /teams/name/Organization,
 * silent on failure like the official fetch), the cards read the latest
 * value of the entity system charts, and the progress bars show each
 * group's share of the total, clamped to 0-100 like the official bar.
 *
 * Adaptation, stated plainly: the official cards read dedicated
 * `*_summary_card` preview charts, which this console does not call
 * (no preview API exists here); the cards below read the same four
 * system charts the pipeline section already fetches. Total assets sums
 * the latest per-entity-type counts (the groups partition the catalog);
 * the description/owner cards read their percentage series' latest point.
 * The tier series is grouped counts, not a percentage, so it is NOT
 * rendered as a fake "%" card — its distribution appears as progress
 * bars instead.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function latestPoint(points: readonly { count?: number; day?: number }[]): { count?: number; day?: number } | undefined {
  let best: { count?: number; day?: number } | undefined;
  for (const point of points) {
    if (!best || (point.day ?? 0) > (best.day ?? 0)) {
      best = point;
    }
  }
  return best;
}

function latestByGroup(points: readonly { count?: number; day?: number; group?: string }[]): Array<{ group: string; count: number }> {
  const byGroup = new Map<string, { count?: number; day?: number }>();
  for (const point of points) {
    const group = point.group ?? '';
    const current = byGroup.get(group);
    if (!current || (point.day ?? 0) > (current.day ?? 0)) {
      byGroup.set(group, point);
    }
  }
  return [...byGroup.entries()].map(([group, point]) => ({ group, count: point.count ?? 0 }));
}

const totalAssets = computed(() =>
  latestByGroup(systemData.value.total_data_assets ?? []).reduce((sum, item) => sum + item.count, 0),
);

const summaryCards = computed(() => {
  const data = systemData.value;
  const hasData =
    (data.total_data_assets?.length ?? 0) > 0 ||
    (data.percentage_of_data_asset_with_description?.length ?? 0) > 0 ||
    (data.percentage_of_data_asset_with_owner?.length ?? 0) > 0;
  if (!hasData) {
    return [];
  }
  return [
    {
      id: 'total',
      label: t('insights.summary.totalAssets'),
      value: round2(totalAssets.value),
      suffix: '',
    },
    {
      id: 'description',
      label: t('insights.summary.withDescription'),
      value: round2(latestPoint(data.percentage_of_data_asset_with_description ?? [])?.count ?? 0),
      suffix: '%',
    },
    {
      id: 'owner',
      label: t('insights.summary.withOwner'),
      value: round2(latestPoint(data.percentage_of_data_asset_with_owner ?? [])?.count ?? 0),
      suffix: '%',
    },
  ];
});

function progressRows(points: readonly { count?: number; day?: number; group?: string }[], total: number) {
  return latestByGroup(points)
    .map((item) => ({
      group: item.group,
      count: item.count,
      percent: total > 0 ? Math.min(100, Math.max(0, (item.count / total) * 100)) : 0,
    }))
    .toSorted((a, b) => b.count - a.count);
}

const entityProgress = computed(() =>
  totalAssets.value > 0 ? progressRows(systemData.value.total_data_assets ?? [], totalAssets.value) : [],
);
const tierProgress = computed(() =>
  totalAssets.value > 0 ? progressRows(systemData.value.total_data_assets_by_tier ?? [], totalAssets.value) : [],
);

const summaryTitle = computed(() =>
  orgName.value
    ? t('insights.summaryFor', { organization: orgName.value })
    : t('insights.summaryTitle'),
);

async function loadOrganization(): Promise<void> {
  try {
    const team = await getTeamByName('Organization');
    orgName.value = team.displayName || team.name;
  } catch {
    // Official fetchOrganizationDetails swallows this too: the heading
    // falls back to the generic summary title, never an error state.
    orgName.value = '';
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  pipelineError.value = '';
  pipelineTried.value = false;
  const window = seriesWindow(insightsDatePresetFromKey(datePreset.value).days);
  try {
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
      systemData.value = data;
      pipeline.value = SYSTEM_CHART_NAMES.flatMap((name) => {
        const series = insightResultsToSeries(name, data[name] ?? []);
        return [{ name, title: t(`insights.pipeline.${name}`), series }];
      });
    } catch (error) {
      systemData.value = {};
      pipeline.value = [];
      pipelineError.value = error instanceof Error ? error.message : t('insights.pipelineFailed');
    }
    // Web-activity landing aggregation (official DataInsightSummary):
    // MostActiveUsers + DailyActiveUsers + PageViewsByEntities via
    // /aggregate. Each chart settles independently; the section only
    // errors when all three fail, and never breaks the page.
    webTried.value = true;
    webError.value = '';
    try {
      const [mostActive, dailyActive, pageViews] = await Promise.allSettled([
        getAggregateChartData({
          dataInsightChartName: 'MostActiveUsers',
          dataReportIndex: DATA_REPORT_INDEXES.webAnalyticUserActivity,
          startTs: window.startTs,
          endTs: window.endTs,
        }),
        getAggregateChartData({
          dataInsightChartName: 'DailyActiveUsers',
          dataReportIndex: DATA_REPORT_INDEXES.webAnalyticUserActivity,
          startTs: window.startTs,
          endTs: window.endTs,
        }),
        getAggregateChartData({
          dataInsightChartName: 'PageViewsByEntities',
          dataReportIndex: DATA_REPORT_INDEXES.webAnalyticEntityView,
          startTs: window.startTs,
          endTs: window.endTs,
        }),
      ]);
      const rowsOf = (settled: PromiseSettledResult<unknown>): DataInsightAggregateRow[] => {
        if (settled.status !== 'fulfilled') {
          return [];
        }
        const results = settled.value as Array<{ data?: DataInsightAggregateRow[] }>;
        return results.flatMap((item) => item.data ?? []);
      };
      const mostActiveRows = rowsOf(mostActive);
      mostActiveUsers.value = [...mostActiveRows]
        .toSorted((a, b) => (b.sessions ?? b.pageViews ?? 0) - (a.sessions ?? a.pageViews ?? 0))
        .slice(0, 5);
      const dailyRows = rowsOf(dailyActive);
      const byDay = new Map<string, number>();
      for (const row of dailyRows) {
        if (row.timestamp === undefined || row.activeUsers === undefined) {
          continue;
        }
        const label = formatChartTs(row.timestamp);
        if (!label) {
          continue;
        }
        byDay.set(label, (byDay.get(label) ?? 0) + row.activeUsers);
      }
      dailyActiveSeries.value = namedSeries(
        t('insights.web.dailyActive'),
        [...byDay.entries()].toSorted((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value })),
      );
      pageViewEntities.value = [...rowsOf(pageViews)]
        .toSorted((a, b) => (b.pageViews ?? 0) - (a.pageViews ?? 0))
        .slice(0, 5);
      if (
        mostActive.status === 'rejected' &&
        dailyActive.status === 'rejected' &&
        pageViews.status === 'rejected'
      ) {
        webError.value = t('insights.webFailed');
      }
    } catch (error) {
      webError.value = error instanceof Error ? error.message : t('insights.webFailed');
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onDatePresetChange(value: string): void {
  datePreset.value = value;
  void load();
}

onMounted(() => {
  void load();
  void loadOrganization();
});
</script>

<template>
  <PageLayout test-id="data-assets-layout">
    <PageHeader :header="t('insights.tabs.dataAssets')" :sub-header="t('insights.lead')" />
    <Typography.Title :level="5" data-testid="insights-summary-title" class="insights__sub">
      {{ summaryTitle }}
    </Typography.Title>
    <div v-if="summaryCards.length" data-testid="insights-summary">
      <Row :gutter="[16, 16]">
        <Col v-for="card in summaryCards" :key="card.id" :xs="24" :md="8">
          <Card size="small" :title="card.label" :data-testid="`insights-summary-${card.id}`">
            <Typography.Title :level="4">{{ card.value }}{{ card.suffix }}</Typography.Title>
          </Card>
        </Col>
      </Row>
      <div v-if="entityProgress.length" data-testid="insights-entity-progress">
        <Typography.Title :level="5" class="insights__sub">{{ t('insights.summary.byEntityType') }}</Typography.Title>
        <div v-for="row in entityProgress" :key="row.group" data-testid="insights-entity-progress-row">
          <span>{{ entityLabel(row.group) }} — {{ row.count }}</span>
          <Progress :percent="row.percent" />
        </div>
      </div>
      <div v-if="tierProgress.length" data-testid="insights-tier-progress">
        <Typography.Title :level="5" class="insights__sub">{{ t('insights.summary.byTier') }}</Typography.Title>
        <div v-for="row in tierProgress" :key="row.group" data-testid="insights-tier-progress-row">
          <span>{{ row.group }} — {{ row.count }}</span>
          <Progress :percent="row.percent" />
        </div>
      </div>
    </div>
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="insights__alert" />
      <Typography.Paragraph>
        {{ t('insights.catalogTotal', { total: catalogTotal }) }}
      </Typography.Paragraph>
      <Row :gutter="[16, 16]">
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.entityType')">
            <Typography.Paragraph type="secondary">{{ t('insights.charts.entityTypeLead') }}</Typography.Paragraph>
            <SmChart kind="donut" test-id="insights-entity-chart" :series="entitySeries" :colors="SM_DATA_INSIGHT_COLORS" :empty="t('charts.empty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.serviceType')">
            <Typography.Paragraph type="secondary">{{ t('insights.charts.serviceTypeLead') }}</Typography.Paragraph>
            <SmChart kind="bar" test-id="insights-service-chart" :series="serviceSeries" :colors="SM_DATA_INSIGHT_COLORS" :empty="t('charts.empty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.tier')">
            <Typography.Paragraph type="secondary">{{ t('insights.charts.tierLead') }}</Typography.Paragraph>
            <SmChart kind="bar" test-id="insights-tier-chart" :series="tierSeries" :colors="SM_DATA_INSIGHT_COLORS" :empty="t('charts.empty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.testStatus')">
            <Typography.Paragraph type="secondary">{{ t('insights.charts.testStatusLead') }}</Typography.Paragraph>
            <SmChart kind="donut" test-id="insights-test-chart" :series="testSeries" :colors="SM_DATA_INSIGHT_COLORS" :empty="t('charts.empty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.incidents')">
            <Typography.Paragraph type="secondary">{{ t('insights.charts.incidentsLead') }}</Typography.Paragraph>
            <SmChart kind="donut" test-id="insights-incident-chart" :series="incidentSeries" :colors="SM_DATA_INSIGHT_COLORS" :empty="t('charts.empty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.serviceDescription')">
            <SmState state="empty" test-id="insights-service-description-empty" :empty-text="t('insights.serviceChartsEmpty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.charts.serviceOwner')">
            <SmState state="empty" test-id="insights-service-owner-empty" :empty-text="t('insights.serviceChartsEmpty')" />
          </Card>
        </Col>
      </Row>
      <Typography.Title :level="5" class="insights__sub">{{ t('insights.pipelineTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('insights.pipelineLead') }}</Typography.Paragraph>
      <Select
        :value="datePreset"
        data-testid="insights-date-preset"
        style="width: 180px"
        :options="INSIGHT_DATE_PRESETS.map((preset) => ({ value: preset.key, label: t(preset.labelKey) }))"
        @change="(value) => onDatePresetChange(value as string)"
      />
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
              :colors="SM_DATA_INSIGHT_COLORS"
              :empty="t('insights.pipelineEmpty')"
            />
          </Card>
        </Col>
      </Row>
      <Typography.Title :level="5" class="insights__sub">{{ t('insights.webTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('insights.webLead') }}</Typography.Paragraph>
      <Alert v-if="webError" type="warning" show-icon :message="webError" class="insights__alert" />
      <Empty
        v-if="webTried && !webError && !mostActiveUsers.length && !dailyActiveSeries.length && !pageViewEntities.length"
        data-testid="insights-web-empty"
        :description="t('insights.webEmpty')"
      />
      <Row v-else :gutter="[16, 16]">
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.web.dailyActive')">
            <SmChart
              kind="line"
              test-id="insights-web-daily-active"
              :series="dailyActiveSeries"
              :colors="SM_DATA_INSIGHT_COLORS"
              :empty="t('insights.webEmpty')"
            />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.web.mostActive')">
            <ul v-if="mostActiveUsers.length" data-testid="insights-web-users">
              <li v-for="user in mostActiveUsers" :key="user.userName ?? ''">
                {{ user.userName }} — {{ t('insights.web.sessions', { count: user.sessions ?? user.pageViews ?? 0 }) }}
              </li>
            </ul>
            <Empty v-else :description="t('insights.webEmpty')" />
          </Card>
        </Col>
        <Col :xs="24" :lg="12">
          <Card size="small" :title="t('insights.web.pageViews')">
            <ul v-if="pageViewEntities.length" data-testid="insights-web-entities">
              <li v-for="entity in pageViewEntities" :key="entity.entityFqn ?? ''">
                {{ entity.entityFqn }} — {{ t('insights.web.views', { count: entity.pageViews ?? 0 }) }}
              </li>
            </ul>
            <Empty v-else :description="t('insights.webEmpty')" />
          </Card>
        </Col>
      </Row>
    </Spin>
  </PageLayout>
</template>

<style scoped>
.insights__alert {
  margin-block: 12px;
}
.insights__sub {
  margin-top: 20px;
}
</style>
