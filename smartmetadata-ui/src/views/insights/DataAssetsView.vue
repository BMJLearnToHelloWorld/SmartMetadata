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
import { fetchLoggedInUser } from '@/api/auth';
import {
  ABSOLUTE_VALUE_CHART_NAMES,
  computeChangeInPercentagePoints,
  DATA_REPORT_INDEXES,
  getAggregateChartData,
  getQueryFilterForDataInsightChart,
  latestSummaryCount,
  listSystemChartData,
  PIPELINE_CHART_NAMES,
  SERVICE_ABSOLUTE_VALUE_CHART,
  SERVICE_CHART_NAMES,
  SERVICE_SUMMARY_CARD_CHART,
  SUMMARY_CARD_CHART_NAMES,
  type DataInsightAggregateRow,
  type SystemChartData,
} from '@/api/dataInsights';
import { listKpis } from '@/api/kpi';
import { getResourcePermission, toOperationPermissions } from '@/api/permissions';
import { listTags } from '@/api/tags';
import { getTeamByName, listTeams } from '@/api/teams';
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
import type { Kpi } from '@/types/kpi';
import ServiceInsightCard from './ServiceInsightCard.vue';

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
const datePreset = ref(insightsDatePresetFromKey('last7').key);
const orgName = ref('');
const systemData = ref<SystemChartData>({});
const permissionChecked = ref(false);
const canViewInsights = ref(false);
const selectedTeams = ref<string[]>([]);
const selectedTiers = ref<string[]>([]);
const teamOptions = ref<Array<{ value: string; label: string }>>([]);
const tierOptions = ref<Array<{ value: string; label: string }>>([]);
const serviceData = ref<SystemChartData>({});
const serviceError = ref('');
const serviceTried = ref(false);
const kpiList = ref<Kpi[]>([]);

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
 * silent on failure like the official fetch).
 *
 * The cards read the dedicated `*_summary_card` preview charts through the
 * bulk listChartData endpoint (the single-chart preview
 * GET /v1/analytics/dataInsights/system/charts/name/{fqn}/data exists
 * server-side; this console uses the bulk call). Total assets sums the
 * latest per-entity-type counts (the groups partition the catalog); the
 * description/owner cards read their summary card's latest-day value,
 * which is the global % — not the percentage series' latest point, which
 * is a single entity type's value (ADR:2026-11-07-data-insights-service-cards).
 * A description/owner card is omitted when its summary card has no value
 * rather than falling back to the old approximation. The tier series is
 * grouped counts, not a percentage, so it is NOT rendered as a fake "%"
 * card — its distribution appears as progress bars instead.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
  const service = serviceData.value;
  const hasData =
    (data.total_data_assets?.length ?? 0) > 0 ||
    (service.data_assets_with_description_summary_card?.length ?? 0) > 0 ||
    (service.data_assets_with_owner_summary_card?.length ?? 0) > 0;
  if (!hasData) {
    return [];
  }
  const cards: Array<{ id: string; label: string; value: number; suffix: string }> = [
    {
      id: 'total',
      label: t('insights.summary.totalAssets'),
      value: round2(totalAssets.value),
      suffix: '',
    },
  ];
  const description = latestSummaryCount(service.data_assets_with_description_summary_card ?? []);
  if (description !== undefined) {
    cards.push({
      id: 'description',
      label: t('insights.summary.withDescription'),
      value: round2(description),
      suffix: '%',
    });
  }
  const owner = latestSummaryCount(service.data_assets_with_owner_summary_card ?? []);
  if (owner !== undefined) {
    cards.push({
      id: 'owner',
      label: t('insights.summary.withOwner'),
      value: round2(owner),
      suffix: '%',
    });
  }
  return cards;
});

function progressRows(points: readonly { count?: number; day?: number; group?: string }[], total: number) {
  return latestByGroup(points)
    .map((item) => ({
      group: item.group,
      count: item.count,
      percent: total > 0 ? Math.min(100, Math.max(0, (item.count / total) * 100)) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

const entityProgress = computed(() =>
  totalAssets.value > 0 ? progressRows(systemData.value.total_data_assets ?? [], totalAssets.value) : [],
);
const tierProgress = computed(() =>
  totalAssets.value > 0 ? progressRows(systemData.value.total_data_assets_by_tier ?? [], totalAssets.value) : [],
);

/** Official EntitySummaryProgressBar strokeColor: palette index by sorted row. */
function progressColor(index: number): string {
  return SM_DATA_INSIGHT_COLORS[index % SM_DATA_INSIGHT_COLORS.length] ?? SM_DATA_INSIGHT_COLORS[0];
}

const summaryTitle = computed(() =>
  orgName.value
    ? t('insights.summaryFor', { organization: orgName.value })
    : t('insights.summaryTitle'),
);

/**
 * Official DataInsightChartCard.tsx targetValue: the KPI whose
 * dataInsightChart is the description/owner KPI chart
 * (CreateKpiRequest.dataInsightChart enum, `*_kpi` names). The stored
 * EntityReference has also been seen with the bare percentage-chart name,
 * which names the same coverage, so both forms match. No KPI means no
 * target is shown (D-D-5: no "Add KPI" entry point in this batch).
 */
function kpiTargetFor(chartName: (typeof SERVICE_CHART_NAMES)[number]): number | undefined {
  const kpiChart =
    chartName === 'percentage_of_service_with_description'
      ? 'percentage_of_data_asset_with_description_kpi'
      : 'percentage_of_data_asset_with_owner_kpi';
  const percentageChart = kpiChart.replace(/_kpi$/, '');
  const found = kpiList.value.find((kpi) => {
    const ref = kpi.dataInsightChart?.name ?? kpi.dataInsightChart?.fullyQualifiedName;
    return ref === kpiChart || ref === percentageChart;
  });
  return found?.targetValue;
}

function serviceCard(chartName: (typeof SERVICE_CHART_NAMES)[number]) {
  const points = serviceData.value[chartName] ?? [];
  const absolutePoints = serviceData.value[SERVICE_ABSOLUTE_VALUE_CHART[chartName]] ?? [];
  const totalPoints = systemData.value.total_data_assets ?? [];
  const hasChangeInputs = totalPoints.length > 0 && absolutePoints.length > 0;
  return {
    title: t(
      chartName === 'percentage_of_service_with_description'
        ? 'insights.charts.serviceDescription'
        : 'insights.charts.serviceOwner',
    ),
    headline: latestSummaryCount(serviceData.value[SERVICE_SUMMARY_CARD_CHART[chartName]] ?? []),
    change: hasChangeInputs
      ? computeChangeInPercentagePoints(totalPoints, absolutePoints)
      : undefined,
    days: insightsDatePresetFromKey(datePreset.value).days,
    target: kpiTargetFor(chartName),
    series: insightResultsToSeries(chartName, points),
    latestByService: latestByGroup(points)
      .map((item) => ({ service: item.group, value: item.count }))
      .sort((a, b) => b.value - a.value),
  };
}

const serviceDescriptionCard = computed(() => serviceCard('percentage_of_service_with_description'));
const serviceOwnerCard = computed(() => serviceCard('percentage_of_service_with_owner'));

/**
 * Gate: official DataInsightPage.component.tsx requires Operation.ViewAll
 * + ResourceEntity.DATA_INSIGHT_CHART, with no content and no chart
 * requests without it. The resource name is `dataInsightChart`, verified
 * against the server tree at this baseline: Entity.DATA_INSIGHT_CHART =
 * "dataInsightChart" (Entity.java:253), DataInsightChartResource calls
 * super(Entity.DATA_INSIGHT_CHART, …) (DataInsightChartResource.java:75),
 * and the EntityResource constructor registers it via
 * Entity.registerResourcePermissions → ResourceRegistry.addResource
 * (EntityResource.java:181, Entity.java:493-497), so
 * GET /v1/permissions/dataInsightChart resolves. The isAdminUser line is
 * the P1 dual-line lock: an admin passes even if the permission call
 * disagrees. A failed check fails closed — placeholder, no requests.
 * (ADR:2026-11-07-data-insights-service-cards)
 */
async function loadPermissions(): Promise<boolean> {
  try {
    const [permissions, user] = await Promise.all([
      getResourcePermission('dataInsightChart'),
      fetchLoggedInUser().catch(() => undefined),
    ]);
    canViewInsights.value =
      user?.isAdmin === true || toOperationPermissions(permissions).ViewAll === true;
  } catch (error) {
    console.warn('[data-insights] permission check failed; page hidden', error);
    canViewInsights.value = false;
  } finally {
    permissionChecked.value = true;
  }
  return canViewInsights.value;
}

/**
 * Team/tier filter options. Teams come from the team list (the filter
 * sends team names, matching official `owners.name.keyword`); tiers come
 * from the Tier classification tags (the filter sends tag FQNs, matching
 * official `tier.keyword`). A failure leaves that select empty and never
 * breaks the page.
 */
async function loadFilterOptions(): Promise<void> {
  try {
    const teams = await listTeams({ limit: 100 });
    teamOptions.value = teams.data.flatMap((team) =>
      team.name
        ? [{ value: team.name, label: team.displayName || team.name }]
        : [],
    );
  } catch (error) {
    console.warn('[data-insights] team filter options failed to load', error);
    teamOptions.value = [];
  }
  try {
    const tags = await listTags({ parent: 'Tier', limit: 100 });
    tierOptions.value = tags.data.flatMap((tag) => {
      const value = tag.fullyQualifiedName || tag.name;
      return value ? [{ value, label: tag.displayName || tag.name }] : [];
    });
  } catch (error) {
    console.warn('[data-insights] tier filter options failed to load', error);
    tierOptions.value = [];
  }
}

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
  // Official getQueryFilterForDataInsightChart(chartFilter.team, chartFilter.tier):
  // the same filter rides every system-chart request on this page.
  const filter = getQueryFilterForDataInsightChart(
    selectedTeams.value.length ? selectedTeams.value : undefined,
    selectedTiers.value.length ? selectedTiers.value : undefined,
  );
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
      const data = await listSystemChartData(PIPELINE_CHART_NAMES, window.startTs, window.endTs, { filter });
      systemData.value = data;
      pipeline.value = PIPELINE_CHART_NAMES.flatMap((name) => {
        const series = insightResultsToSeries(name, data[name] ?? []);
        return [{ name, title: t(`insights.pipeline.${name}`), series }];
      });
    } catch (error) {
      systemData.value = {};
      pipeline.value = [];
      pipelineError.value = error instanceof Error ? error.message : t('insights.pipelineFailed');
    }
    // Service cards + summary cards + absolute values: fetched strictly.
    // A failure here is surfaced (warning + error state in the cards),
    // never silently rendered as "no data" (review condition 3).
    serviceTried.value = true;
    serviceError.value = '';
    try {
      serviceData.value = await listSystemChartData(
        [...SERVICE_CHART_NAMES, ...SUMMARY_CARD_CHART_NAMES, ...ABSOLUTE_VALUE_CHART_NAMES],
        window.startTs,
        window.endTs,
        { filter, strict: true },
      );
    } catch (error) {
      serviceData.value = {};
      serviceError.value = error instanceof Error ? error.message : t('insights.serviceLoadFailed');
      console.warn('[data-insights] service chart data failed to load', error);
    }
    // KPI targets are optional display: a failure leaves the target blank.
    try {
      kpiList.value = (await listKpis({ limit: 100 })).data;
    } catch (error) {
      console.warn('[data-insights] KPI targets failed to load', error);
      kpiList.value = [];
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
        .sort((a, b) => (b.sessions ?? b.pageViews ?? 0) - (a.sessions ?? a.pageViews ?? 0))
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
        [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value })),
      );
      pageViewEntities.value = [...rowsOf(pageViews)]
        .sort((a, b) => (b.pageViews ?? 0) - (a.pageViews ?? 0))
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

function onTeamFilterChange(value: string[]): void {
  selectedTeams.value = value;
  void load();
}

function onTierFilterChange(value: string[]): void {
  selectedTiers.value = value;
  void load();
}

onMounted(async () => {
  const allowed = await loadPermissions();
  if (!allowed) {
    return;
  }
  await loadFilterOptions();
  await load();
  await loadOrganization();
});
</script>

<template>
  <PageLayout test-id="data-assets-layout">
    <PageHeader :header="t('insights.tabs.dataAssets')" :sub-header="t('insights.lead')" />
    <Spin :spinning="!permissionChecked || loading">
      <SmState
        v-if="permissionChecked && !canViewInsights"
        state="error"
        test-id="insights-no-permission"
        :error-text="t('insights.noPermission')"
      />
      <template v-else-if="permissionChecked && canViewInsights">
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
          <div v-if="entityProgress.length" data-testid="insights-entity-progress" class="insights-progress">
            <Typography.Title :level="5" class="insights__sub">{{ t('insights.summary.byEntityType') }}</Typography.Title>
            <!--
              Official EntitySummaryProgressBar.component.tsx: name + count on one
              flex row, ProgressBar below with no trailing % info (count is the
              label). Ant Progress showInfo must stay false — the default % text
              after the bar overflows and creates a horizontal scrollbar.
            -->
            <div
              v-for="(row, index) in entityProgress"
              :key="row.group"
              class="insights-progress__row"
              data-testid="insights-entity-progress-row"
            >
              <div class="insights-progress__meta">
                <span class="insights-progress__name" data-testid="insights-progress-name">{{ entityLabel(row.group) }}</span>
                <span class="insights-progress__value" data-testid="insights-progress-value">{{ row.count }}</span>
              </div>
              <Progress
                :percent="row.percent"
                :show-info="false"
                :stroke-color="progressColor(index)"
                size="small"
              />
            </div>
          </div>
          <div v-if="tierProgress.length" data-testid="insights-tier-progress" class="insights-progress">
            <Typography.Title :level="5" class="insights__sub">{{ t('insights.summary.byTier') }}</Typography.Title>
            <div
              v-for="(row, index) in tierProgress"
              :key="row.group"
              class="insights-progress__row"
              data-testid="insights-tier-progress-row"
            >
              <div class="insights-progress__meta">
                <span class="insights-progress__name" data-testid="insights-progress-name">{{ row.group }}</span>
                <span class="insights-progress__value" data-testid="insights-progress-value">{{ row.count }}</span>
              </div>
              <Progress
                :percent="row.percent"
                :show-info="false"
                :stroke-color="progressColor(index)"
                size="small"
              />
            </div>
          </div>
        </div>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="insights__alert" />
        <Typography.Paragraph>
          {{ t('insights.catalogTotal', { total: catalogTotal }) }}
        </Typography.Paragraph>
        <Alert
          v-if="serviceError"
          type="warning"
          show-icon
          data-testid="insights-service-load-warning"
          :message="t('insights.serviceLoadFailed')"
          :description="serviceError"
          class="insights__alert"
        />
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
            <ServiceInsightCard
              :title="serviceDescriptionCard.title"
              :headline="serviceDescriptionCard.headline"
              :change="serviceDescriptionCard.change"
              :days="serviceDescriptionCard.days"
              :target="serviceDescriptionCard.target"
              :series="serviceDescriptionCard.series"
              :latest-by-service="serviceDescriptionCard.latestByService"
              :loading="loading"
              :failed="serviceTried && Boolean(serviceError)"
              test-id="insights-service-description"
              :empty-text="t('insights.serviceChartsEmpty')"
              :error-text="serviceError || t('insights.serviceLoadFailed')"
            />
          </Col>
          <Col :xs="24" :lg="12">
            <ServiceInsightCard
              :title="serviceOwnerCard.title"
              :headline="serviceOwnerCard.headline"
              :change="serviceOwnerCard.change"
              :days="serviceOwnerCard.days"
              :target="serviceOwnerCard.target"
              :series="serviceOwnerCard.series"
              :latest-by-service="serviceOwnerCard.latestByService"
              :loading="loading"
              :failed="serviceTried && Boolean(serviceError)"
              test-id="insights-service-owner"
              :empty-text="t('insights.serviceChartsEmpty')"
              :error-text="serviceError || t('insights.serviceLoadFailed')"
            />
          </Col>
        </Row>
        <Typography.Title :level="5" class="insights__sub">{{ t('insights.pipelineTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('insights.pipelineLead') }}</Typography.Paragraph>
        <div class="insights__filters">
          <span class="insights__filter-label">{{ t('insights.filters.team') }}</span>
          <Select
            v-model:value="selectedTeams"
            mode="multiple"
            data-testid="insights-team-filter"
            style="width: 220px"
            :options="teamOptions"
            :placeholder="t('insights.filters.teamPlaceholder')"
            @change="(value) => onTeamFilterChange(value as string[])"
          />
          <span class="insights__filter-label">{{ t('insights.filters.tier') }}</span>
          <Select
            v-model:value="selectedTiers"
            mode="multiple"
            data-testid="insights-tier-filter"
            style="width: 220px"
            :options="tierOptions"
            :placeholder="t('insights.filters.tierPlaceholder')"
            @change="(value) => onTierFilterChange(value as string[])"
          />
          <Select
            :value="datePreset"
            data-testid="insights-date-preset"
            style="width: 180px"
            :options="INSIGHT_DATE_PRESETS.map((preset) => ({ value: preset.key, label: t(preset.labelKey) }))"
            @change="(value) => onDatePresetChange(value as string)"
          />
        </div>
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
      </template>
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
.insights__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-block: 12px;
}
.insights__filter-label {
  font-size: 12px;
  line-height: 18px;
}
.insights-progress {
  min-width: 0;
  overflow-x: hidden;
}
.insights-progress__row {
  min-width: 0;
  margin-block-end: 8px;
}
.insights-progress__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 18px;
}
.insights-progress__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.insights-progress__value {
  flex-shrink: 0;
}
/* Ant Progress defaults leave room for showInfo % text; keep bar full-width. */
.insights-progress__row :deep(.ant-progress) {
  display: block;
  width: 100%;
  margin-inline-end: 0;
  line-height: 1;
}
.insights-progress__row :deep(.ant-progress-outer) {
  margin-inline-end: 0 !important;
  padding-inline-end: 0 !important;
}
.insights-progress__row :deep(.ant-progress-text) {
  display: none;
}
</style>
