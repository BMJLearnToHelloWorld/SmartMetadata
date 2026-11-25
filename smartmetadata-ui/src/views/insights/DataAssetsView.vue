<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Card, Col, Empty, Row, Select, Spin, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { fetchLoggedInUser } from '@/api/auth';
import {
  ABSOLUTE_VALUE_CHART_NAMES,
  computeChangeInPercentagePoints,
  DATA_REPORT_INDEXES,
  DATA_ASSET_CHART_NAMES,
  getAggregateChartData,
  getQueryFilterForDataInsightChart,
  latestSummaryCount,
  listSystemChartData,
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
import { INSIGHT_DATE_PRESETS, insightsDatePresetFromKey } from '@/catalog/insightsTabs';
import SmChart from '@/features/charts/SmChart.vue';
import { formatChartTs, insightResultsToSeries } from '@/features/charts/series';
import type { ChartSeries } from '@/features/charts/types';
import { seriesWindow } from '@/features/charts/types';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import type { Kpi } from '@/types/kpi';
import { startCase } from '@/utils/text';
import DataInsightChartCard, {
  type DataInsightChartHeadline,
  type DataInsightChartRow,
} from './DataInsightChartCard.vue';

const { t, te } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const systemData = ref<SystemChartData>({});
const systemError = ref('');
const systemTried = ref(false);
const webError = ref('');
const webTried = ref(false);
const mostActiveUsers = ref<DataInsightAggregateRow[]>([]);
const dailyActiveSeries = ref<ChartSeries[]>([]);
const pageViewEntities = ref<DataInsightAggregateRow[]>([]);
const datePreset = ref(insightsDatePresetFromKey('last7').key);
const orgName = ref('');
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

/**
 * Pin DataInsightChartCard.tsx:717 renders the tier groups in the
 * right-side summary rows with lodash `startCase` — `Tier.Gold` ->
 * `Tier Gold`. The untiered group IS in the displayed keys: the :147
 * `NoTier` exclusion covers only the tier-change computation, not the
 * rows (the main useMemo :396-413 builds the keys unfiltered), so
 * pin shows it as startCase('NoTier') = `No Tier`. The live catalog
 * reports the untiered bucket lowercase (`notier`), so the check is
 * case-insensitive and the label comes from i18n (zh `无层级`).
 */
function tierLabel(group: string): string {
  if (group.toLowerCase() === 'notier') {
    return t('insights.summary.noTier');
  }
  return startCase(group);
}

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

function formatChange(value: number): string {
  // +0 normalises -0 so a zero change never renders as "-0.00".
  const rounded = Math.round(value * 100) / 100 + 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
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
  const cards: Array<{ id: string; label: string; value: number; suffix: string; target: string }> = [
    {
      id: 'total',
      label: t('insights.summary.totalAssets'),
      value: round2(totalAssets.value),
      suffix: '',
      target: 'total_data_assets',
    },
  ];
  const description = latestSummaryCount(service.data_assets_with_description_summary_card ?? []);
  if (description !== undefined) {
    cards.push({
      id: 'description',
      label: t('insights.summary.withDescription'),
      value: round2(description),
      suffix: '%',
      target: 'percentage_of_data_asset_with_description',
    });
  }
  const owner = latestSummaryCount(service.data_assets_with_owner_summary_card ?? []);
  if (owner !== undefined) {
    cards.push({
      id: 'owner',
      label: t('insights.summary.withOwner'),
      value: round2(owner),
      suffix: '%',
      target: 'percentage_of_data_asset_with_owner',
    });
  }
  return cards;
});

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
 * Pin DataInsightSummary.tsx: the summary cards are clickable and scroll
 * to their chart (onScrollToChart). The chart cards carry the system
 * chart name as their DOM id, like pin's id={type}.
 */
function scrollToCard(id: string): void {
  document.getElementById(id)?.scrollIntoView?.();
}

/**
 * Official DataInsightChartCard.tsx targetValue: the KPI whose
 * dataInsightChart is the description/owner KPI chart
 * (CreateKpiRequest.dataInsightChart enum, `*_kpi` names). The stored
 * EntityReference has also been seen with the bare percentage-chart name,
 * which names the same coverage, so both forms match. No KPI means no
 * target is shown (D-D-5: no "Add KPI" entry point in this batch).
 */
function kpiTargetFor(kpiChartName: string): number | undefined {
  const percentageChart = kpiChartName.replace(/_kpi$/, '');
  const found = kpiList.value.find((kpi) => {
    const ref = kpi.dataInsightChart?.name ?? kpi.dataInsightChart?.fullyQualifiedName;
    return ref === kpiChartName || ref === percentageChart;
  });
  return found?.targetValue;
}

function sumByDay(points: readonly { count?: number; day?: number }[]): Map<number, number> {
  const byDay = new Map<number, number>();
  for (const point of points) {
    if (point.day === undefined || point.count === undefined) {
      continue;
    }
    byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.count);
  }
  return byDay;
}

/**
 * Pin DataInsightChartCard.tsx computeTotalDataAssetsChange: the change
 * in the daily total between the first and last day of the window, in %.
 */
function totalChange(): number | undefined {
  const byDay = sumByDay(systemData.value.total_data_assets ?? []);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (!days.length) {
    return undefined;
  }
  const first = byDay.get(days[0] as number) ?? 0;
  const last = byDay.get(days[days.length - 1] as number) ?? 0;
  return first ? ((last - first) / first) * 100 : 0;
}

/**
 * Pin DataInsightChartCard.tsx computeTotalDataAssetsByTierChange: the
 * change in the tiered share of assets between the first and last day,
 * in percentage points. The untiered bucket is excluded from the tiered
 * share (pin excludes the exact `NoTier` group; the live catalog also
 * reports it lowercase as `notier`, so the check is case-insensitive).
 */
function tierChange(): number | undefined {
  const tierPoints = systemData.value.total_data_assets_by_tier ?? [];
  const totalPoints = systemData.value.total_data_assets ?? [];
  if (!tierPoints.length || !totalPoints.length) {
    return undefined;
  }
  const totalByDay = sumByDay(totalPoints);
  const tieredByDay = sumByDay(
    tierPoints.filter((point) => (point.group ?? '').toLowerCase() !== 'notier'),
  );
  const days = [...totalByDay.keys()].sort((a, b) => a - b);
  if (!days.length) {
    return undefined;
  }
  const firstDay = days[0] as number;
  const lastDay = days[days.length - 1] as number;
  const firstTotal = totalByDay.get(firstDay) ?? 0;
  const lastTotal = totalByDay.get(lastDay) ?? 0;
  const firstTiered = tieredByDay.get(firstDay) ?? 0;
  const lastTiered = tieredByDay.get(lastDay) ?? 0;
  const firstPercent = firstTotal ? (firstTiered / firstTotal) * 100 : 0;
  const lastPercent = lastTotal ? (lastTiered / lastTotal) * 100 : 0;
  return lastPercent - firstPercent;
}

function changeText(value: number | undefined, unit: '%' | 'pp', days: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return unit === 'pp'
    ? t('insights.service.change', { value: formatChange(value), days })
    : t('insights.cards.changePercent', { value: formatChange(value), days });
}

interface ChartCardConfig {
  id: string;
  title: string;
  subTitle: string;
  series: ChartSeries[];
  rows: DataInsightChartRow[];
  headline?: DataInsightChartHeadline;
  failed: boolean;
  testId: string;
  /** Empty-state text: the system cards share the pipeline wording, the
   * service cards keep their own ("No service coverage data…"). */
  emptyText: string;
  listAssets?: 'description' | 'owner';
}

function entityRows(points: readonly { count?: number; day?: number; group?: string }[]): DataInsightChartRow[] {
  return latestByGroup(points)
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({
      key: item.group,
      name: entityLabel(item.group),
      label: String(item.count),
      // Pin passes the raw latest value (clamped 0–100 in the row), not a share of the total.
      percent: item.count,
      color: progressColor(index),
    }));
}

function percentageRows(points: readonly { count?: number; day?: number; group?: string }[]): DataInsightChartRow[] {
  return latestByGroup(points)
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({
      key: item.group,
      name: entityLabel(item.group),
      label: `${round2(item.count)}%`,
      percent: item.count,
      color: progressColor(index),
    }));
}

function tierRows(points: readonly { count?: number; day?: number; group?: string }[]): DataInsightChartRow[] {
  return latestByGroup(points)
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({
      key: item.group,
      name: tierLabel(item.group),
      label: String(item.count),
      percent: item.count,
      color: progressColor(index),
    }));
}

function percentageCard(
  chartName: 'percentage_of_data_asset_with_description' | 'percentage_of_data_asset_with_owner',
  absoluteChartName: (typeof ABSOLUTE_VALUE_CHART_NAMES)[number],
  summaryCardName: 'data_assets_with_description_summary_card' | 'data_assets_with_owner_summary_card',
  kpiChartName: string,
  title: string,
  subTitle: string,
  testId: string,
  listAssets: 'description' | 'owner',
): ChartCardConfig {
  const points = systemData.value[chartName] ?? [];
  const absolutePoints = serviceData.value[absoluteChartName] ?? [];
  const totalPoints = systemData.value.total_data_assets ?? [];
  const hasChangeInputs = totalPoints.length > 0 && absolutePoints.length > 0;
  const summaryValue = latestSummaryCount(serviceData.value[summaryCardName] ?? []);
  const days = insightsDatePresetFromKey(datePreset.value).days;
  return {
    id: chartName,
    title,
    subTitle,
    series: insightResultsToSeries(chartName, points),
    rows: percentageRows(points),
    headline:
      summaryValue === undefined
        ? undefined
        : {
            label: title,
            value: `${round2(summaryValue)}%`,
            progress: summaryValue,
            changeText: changeText(
              hasChangeInputs ? computeChangeInPercentagePoints(totalPoints, absolutePoints) : undefined,
              'pp',
              days,
            ),
            showProgress: true,
            target: kpiTargetFor(kpiChartName),
            targetSuffix: '%',
          },
    failed: serviceTried.value && Boolean(serviceError.value),
    testId,
    emptyText: t('insights.pipelineEmpty'),
    listAssets,
  };
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
    target: kpiTargetFor(
      chartName === 'percentage_of_service_with_description'
        ? 'percentage_of_data_asset_with_description_kpi'
        : 'percentage_of_data_asset_with_owner_kpi',
    ),
    series: insightResultsToSeries(chartName, points),
    latestByService: latestByGroup(points)
      .map((item) => ({ service: item.group, value: item.count }))
      .sort((a, b) => b.value - a.value),
  };
}

const serviceDescriptionCard = computed(() => serviceCard('percentage_of_service_with_description'));
const serviceOwnerCard = computed(() => serviceCard('percentage_of_service_with_owner'));

/**
 * Official DataAssetsTab.component.tsx: six full-width chart cards, in
 * pin order. The five donut/bar charts the old page rendered here have
 * no pin counterpart (0 hits for PieChart/BarChart/CustomPieChart in
 * pin's DataInsight components) and are deleted by Bai's 2026-11-25
 * ruling; the pipeline line charts move back into the cards as pin's
 * left-column charts, and the search-snapshot total line is deleted —
 * pin has a single total source (the system chart).
 */
const cards = computed<ChartCardConfig[]>(() => {
  const totalPoints = systemData.value.total_data_assets ?? [];
  const tierPoints = systemData.value.total_data_assets_by_tier ?? [];
  const days = insightsDatePresetFromKey(datePreset.value).days;
  const systemFailed = systemTried.value && Boolean(systemError.value);
  const serviceFailed = serviceTried.value && Boolean(serviceError.value);
  const total = {
    id: 'total_data_assets',
    title: t('insights.summary.totalAssets'),
    subTitle: t('insights.cards.totalLead'),
    series: insightResultsToSeries('total_data_assets', totalPoints),
    rows: entityRows(totalPoints),
    headline: {
      label: t('insights.summary.totalAssets'),
      value: String(round2(totalAssets.value)),
      progress: 0,
      changeText: changeText(totalChange(), '%', days),
      showProgress: false,
    },
    failed: systemFailed,
    testId: 'insights-total',
    emptyText: t('insights.pipelineEmpty'),
  };
  const description = percentageCard(
    'percentage_of_data_asset_with_description',
    'number_of_data_asset_with_description_kpi',
    'data_assets_with_description_summary_card',
    'percentage_of_data_asset_with_description_kpi',
    t('insights.summary.withDescription'),
    t('insights.cards.assetDescriptionLead'),
    'insights-asset-description',
    'description',
  );
  const owner = percentageCard(
    'percentage_of_data_asset_with_owner',
    'number_of_data_asset_with_owner_kpi',
    'data_assets_with_owner_summary_card',
    'percentage_of_data_asset_with_owner_kpi',
    t('insights.summary.withOwner'),
    t('insights.cards.assetOwnerLead'),
    'insights-asset-owner',
    'owner',
  );
  const serviceDescription = serviceDescriptionCard.value;
  const serviceOwner = serviceOwnerCard.value;
  const serviceDescriptionConfig: ChartCardConfig = {
    id: 'percentage_of_service_with_description',
    title: serviceDescription.title,
    subTitle: t('insights.cards.serviceDescriptionLead'),
    series: serviceDescription.series,
    rows: serviceDescription.latestByService.map((item, index) => ({
      key: item.service,
      name: item.service,
      label: `${round2(item.value)}%`,
      percent: item.value,
      color: progressColor(index),
    })),
    headline:
      serviceDescription.headline === undefined
        ? undefined
        : {
            label: serviceDescription.title,
            value: `${round2(serviceDescription.headline)}%`,
            progress: serviceDescription.headline,
            changeText: changeText(serviceDescription.change, 'pp', serviceDescription.days),
            showProgress: true,
            target: serviceDescription.target,
            targetSuffix: '%',
          },
    failed: serviceFailed,
    testId: 'insights-service-description',
    emptyText: t('insights.serviceChartsEmpty'),
  };
  const serviceOwnerConfig: ChartCardConfig = {
    id: 'percentage_of_service_with_owner',
    title: serviceOwner.title,
    subTitle: t('insights.cards.serviceOwnerLead'),
    series: serviceOwner.series,
    rows: serviceOwner.latestByService.map((item, index) => ({
      key: item.service,
      name: item.service,
      label: `${round2(item.value)}%`,
      percent: item.value,
      color: progressColor(index),
    })),
    headline:
      serviceOwner.headline === undefined
        ? undefined
        : {
            label: serviceOwner.title,
            value: `${round2(serviceOwner.headline)}%`,
            progress: serviceOwner.headline,
            changeText: changeText(serviceOwner.change, 'pp', serviceOwner.days),
            showProgress: true,
            target: serviceOwner.target,
            targetSuffix: '%',
          },
    failed: serviceFailed,
    testId: 'insights-service-owner',
    emptyText: t('insights.serviceChartsEmpty'),
  };
  const tierSummary = latestSummaryCount(serviceData.value.total_data_assets_with_tier_summary_card ?? []);
  const tier: ChartCardConfig = {
    id: 'total_data_assets_by_tier',
    title: t('insights.summary.byTier'),
    subTitle: t('insights.cards.tierLead'),
    series: insightResultsToSeries('total_data_assets_by_tier', tierPoints),
    rows: tierRows(tierPoints),
    headline:
      tierSummary === undefined
        ? undefined
        : {
            label: t('insights.summary.byTier'),
            value: `${round2(tierSummary)}%`,
            progress: tierSummary,
            changeText: changeText(tierChange(), 'pp', days),
            showProgress: false,
          },
    failed: systemFailed,
    testId: 'insights-tier',
    emptyText: t('insights.pipelineEmpty'),
  };
  return [total, description, owner, serviceDescriptionConfig, serviceOwnerConfig, tier];
});

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
  systemError.value = '';
  systemTried.value = false;
  const window = seriesWindow(insightsDatePresetFromKey(datePreset.value).days);
  // Official getQueryFilterForDataInsightChart(chartFilter.team, chartFilter.tier):
  // the same filter rides every system-chart request on this page.
  const filter = getQueryFilterForDataInsightChart(
    selectedTeams.value.length ? selectedTeams.value : undefined,
    selectedTiers.value.length ? selectedTiers.value : undefined,
  );
  try {
    systemTried.value = true;
    try {
      systemData.value = await listSystemChartData(DATA_ASSET_CHART_NAMES, window.startTs, window.endTs, { filter });
    } catch (error) {
      systemData.value = {};
      systemError.value = error instanceof Error ? error.message : t('insights.pipelineFailed');
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
      dailyActiveSeries.value = [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ name: t('insights.web.dailyActive'), points: [{ label, value }] }));
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
        <Typography.Title :level="5" data-testid="insights-summary-title" class="insights__sub">
          {{ summaryTitle }}
        </Typography.Title>
        <div v-if="summaryCards.length" data-testid="insights-summary" class="insights-summary">
          <Row :gutter="[16, 16]">
            <Col
              v-for="card in summaryCards"
              :key="card.id"
              :xs="24"
              :md="8"
              class="insights-summary__card"
              role="button"
              tabindex="0"
              @click="scrollToCard(card.target)"
              @keydown.enter="scrollToCard(card.target)"
              @keydown.space.prevent="scrollToCard(card.target)"
            >
              <Card size="small" :title="card.label" :data-testid="`insights-summary-${card.id}`">
                <Typography.Title :level="4">{{ card.value }}{{ card.suffix }}</Typography.Title>
              </Card>
            </Col>
          </Row>
        </div>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="insights__alert" />
        <Alert
          v-if="systemError"
          type="warning"
          show-icon
          data-testid="insights-system-load-warning"
          :message="t('insights.pipelineFailed')"
          :description="systemError"
          class="insights__alert"
        />
        <Alert
          v-if="serviceError"
          type="warning"
          show-icon
          data-testid="insights-service-load-warning"
          :message="t('insights.serviceLoadFailed')"
          :description="serviceError"
          class="insights__alert"
        />
        <div class="insights-cards">
          <DataInsightChartCard
            v-for="card in cards"
            :key="card.id"
            :id="card.id"
            :title="card.title"
            :sub-title="card.subTitle"
            :series="card.series"
            :rows="card.rows"
            :headline="card.headline"
            :loading="loading"
            :failed="card.failed"
            :test-id="card.testId"
            :list-assets="card.listAssets"
            :empty-text="card.emptyText"
            :error-text="card.failed && card.testId.startsWith('insights-service') ? serviceError || t('insights.serviceLoadFailed') : systemError || t('insights.pipelineFailed')"
          />
        </div>
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
/* The summary Row's -8px gutter margins are absorbed by PageLayout's
 * 16px horizontal padding (pin relies on structure, not clipping), so
 * there is deliberately no overflow-x clamp here: one would cut the
 * summary cards' keyboard focus rings at the outer edges. */
.insights-summary__card {
  cursor: pointer;
}
.insights-summary__card :deep(.ant-card):hover {
  background-color: var(--sm-color-bg-hover);
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
.insights-cards {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
</style>
