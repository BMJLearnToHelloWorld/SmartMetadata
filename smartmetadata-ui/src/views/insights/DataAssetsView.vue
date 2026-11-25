<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Col, DatePicker, message, Row, Select, Spin, Typography } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import DataInsightLayout from './DataInsightLayout.vue';
import { fetchLoggedInUser } from '@/api/auth';
import {
  ABSOLUTE_VALUE_CHART_NAMES,
  computeChangeInPercentagePoints,
  DATA_ASSET_CHART_NAMES,
  getQueryFilterForDataInsightChart,
  latestSummaryCount,
  listSystemChartData,
  SERVICE_ABSOLUTE_VALUE_CHART,
  SERVICE_CHART_NAMES,
  SERVICE_SUMMARY_CARD_CHART,
  SUMMARY_CARD_CHART_NAMES,
  type SystemChartData,
} from '@/api/dataInsights';
import { listKpis } from '@/api/kpi';
import { getResourcePermission, toOperationPermissions } from '@/api/permissions';
import { listTags } from '@/api/tags';
import { getTeamByName, listTeams } from '@/api/teams';
import { CUSTOM_DATE_RANGE_KEY, INSIGHT_DATE_PRESETS, insightsDatePresetFromKey } from '@/catalog/insightsTabs';
import { insightResultsToSeries } from '@/features/charts/series';
import type { ChartSeries } from '@/features/charts/types';
import { seriesWindow } from '@/features/charts/types';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import type { Kpi } from '@/types/kpi';
import { formatMediumDate } from '@/utils/dates';
import { startCase } from '@/utils/text';
import DataInsightChartCard, {
  type DataInsightChartHeadline,
  type DataInsightChartRow,
} from './DataInsightChartCard.vue';
import KpiChartCard from './KpiChartCard.vue';

const { t, te, locale } = useI18n();

const loading = ref(false);
const systemData = ref<SystemChartData>({});
const datePreset = ref(insightsDatePresetFromKey('last7days').key);
const customRange = ref<{ startTs: number; endTs: number } | null>(null);
const orgName = ref('');
const permissionChecked = ref(false);
const canViewInsights = ref(false);
const selectedTeams = ref<string[]>([]);
const selectedTiers = ref<string[]>([]);
const teamOptions = ref<Array<{ value: string; label: string }>>([]);
const tierOptions = ref<Array<{ value: string; label: string }>>([]);
const serviceData = ref<SystemChartData>({});
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
 * reports the untiered bucket lowercase (`notier`); `load()` normalises
 * it to pin's `NoTier` at the boundary, so this check is the exact
 * pin spelling, not a case-insensitive fallback.
 */
function tierLabel(group: string): string {
  if (group === 'NoTier') {
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
 * rather than falling back to the old approximation. The tier card is
 * pin's ENTITIES_SUMMARY_LIST fourth item
 * (constants/DataInsight.constants.ts:113-121,
 * TotalDataAssetsWithTierSummaryCard, id TotalDataAssetsByTier): its
 * value is the dedicated tier summary preview chart's count — the tiered
 * share — and pin renders it with a `%` suffix like the other
 * non-total cards (DataInsightSummary.tsx:201 span={6}, :211).
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
    (service.data_assets_with_owner_summary_card?.length ?? 0) > 0 ||
    (service.total_data_assets_with_tier_summary_card?.length ?? 0) > 0;
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
  const tier = latestSummaryCount(service.total_data_assets_with_tier_summary_card ?? []);
  if (tier !== undefined) {
    cards.push({
      id: 'tier',
      label: t('insights.summary.byTier'),
      value: round2(tier),
      suffix: '%',
      target: 'total_data_assets_by_tier',
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
 * Pin DatePickerMenu (DatePickerMenu.component.tsx:229-256): a preset
 * window is rolling, `startTs = now - days`, `endTs = now`; a custom
 * range is the picked days, start of the first day through the last
 * millisecond of the last day. Until a custom range is picked, the
 * custom entry falls back to the 7-day default window.
 */
const currentWindow = computed(() => {
  if (datePreset.value === CUSTOM_DATE_RANGE_KEY && customRange.value) {
    return customRange.value;
  }
  return seriesWindow(insightsDatePresetFromKey(datePreset.value).days);
});

/** Days the change lines report (pin getDaysCount: end - start over a day). */
const currentDays = computed(() => {
  if (datePreset.value === CUSTOM_DATE_RANGE_KEY && customRange.value) {
    return Math.max(1, Math.round((customRange.value.endTs - customRange.value.startTs) / 86_400_000));
  }
  return insightsDatePresetFromKey(datePreset.value).days;
});

/** Pin DataInsightHeader.component.tsx:125-142: the selected range as
 * text beside the picker, DATE_MED on both ends. */
const rangeText = computed(
  () =>
    `${formatMediumDate(currentWindow.value.startTs, locale.value)} - ${formatMediumDate(currentWindow.value.endTs, locale.value)}`,
);

const customRangeValue = computed<[Dayjs, Dayjs] | undefined>(() =>
  customRange.value ? [dayjs(customRange.value.startTs), dayjs(customRange.value.endTs)] : undefined,
);

/**
 * Pin DataInsightSummary.tsx: the summary cards are clickable and scroll
 * to their chart (onScrollToChart). The chart cards carry the system
 * chart name as their DOM id, like pin's id={type}. Pin scrolls with
 * block 'center' (DataInsightPage.component.tsx:90), which keeps the
 * card clear of the sticky header — no offset is needed.
 */
function scrollToCard(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
 * share (pin excludes the exact `NoTier` group, :147); the live catalog
 * reports it lowercase as `notier`, which `load()` normalises to pin's
 * `NoTier` at the boundary, so the filter below is the pin literal.
 */
function tierChange(): number | undefined {
  const tierPoints = systemData.value.total_data_assets_by_tier ?? [];
  const totalPoints = systemData.value.total_data_assets ?? [];
  if (!tierPoints.length || !totalPoints.length) {
    return undefined;
  }
  const totalByDay = sumByDay(totalPoints);
  const tieredByDay = sumByDay(
    tierPoints.filter((point) => (point.group ?? '') !== 'NoTier'),
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

/**
 * Pin CustomStatistic.tsx:44-64 renders every change line with a `%`
 * suffix — even the percentage-point changes from computeDefaultChange /
 * computeTotalDataAssetsByTierChange (pin's own display quirk, kept
 * verbatim per Bai 2026-11-25 ruling).
 */
function changeText(value: number | undefined, days: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return t('insights.cards.changePercent', { value: formatChange(value), days });
}

interface ChartCardConfig {
  id: string;
  title: string;
  subTitle: string;
  series: ChartSeries[];
  rows: DataInsightChartRow[];
  headline?: DataInsightChartHeadline;
  testId: string;
  /** Empty-state text: the system cards share the pipeline wording, the
   * service cards keep their own ("No service coverage data…"). */
  emptyText: string;
  listAssets?: 'description' | 'owner';
  /** Pin `isPercentageGraph`: the tooltip formats values with `%` on the
   * percentage graphs only; the total and tier cards are absolute counts. */
  isPercentage: boolean;
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
  const days = currentDays.value;
  // Pin DataInsightChartCard.tsx:395-413 + DataInsightChartUtils.tsx:41-56:
  // the series follow the rows' rank (latest value, descending) and take
  // their colour from that rank, so the row bars and the lines share one
  // colour order. The rows are built first so both read the same rank.
  const rows = percentageRows(points);
  return {
    id: chartName,
    title,
    subTitle,
    series: insightResultsToSeries(chartName, points, {
      rankedKeys: rows.map((row) => row.key),
      colors: SM_DATA_INSIGHT_COLORS,
    }),
    rows,
    headline:
      summaryValue === undefined
        ? undefined
        : {
            label: title,
            value: `${round2(summaryValue)}%`,
            progress: summaryValue,
            changeText: changeText(
              hasChangeInputs ? computeChangeInPercentagePoints(totalPoints, absolutePoints) : undefined,
              days,
            ),
            showProgress: true,
            target: kpiTargetFor(kpiChartName),
            targetSuffix: '%',
          },
    testId,
    emptyText: t('insights.pipelineEmpty'),
    listAssets,
    isPercentage: true,
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
    days: currentDays.value,
    target: kpiTargetFor(
      chartName === 'percentage_of_service_with_description'
        ? 'percentage_of_data_asset_with_description_kpi'
        : 'percentage_of_data_asset_with_owner_kpi',
    ),
    points,
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
  const days = currentDays.value;
  const totalRows = entityRows(totalPoints);
  const total: ChartCardConfig = {
    id: 'total_data_assets',
    title: t('insights.summary.totalAssets'),
    subTitle: t('insights.cards.totalLead'),
    series: insightResultsToSeries('total_data_assets', totalPoints, {
      rankedKeys: totalRows.map((row) => row.key),
      colors: SM_DATA_INSIGHT_COLORS,
    }),
    rows: totalRows,
    headline: {
      label: t('insights.summary.totalAssets'),
      value: String(round2(totalAssets.value)),
      progress: 0,
      changeText: changeText(totalChange(), days),
      showProgress: false,
    },
    testId: 'insights-total',
    emptyText: t('insights.pipelineEmpty'),
    isPercentage: false,
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
  const serviceDescriptionRows = serviceDescription.latestByService.map((item, index) => ({
    key: item.service,
    name: item.service,
    label: `${round2(item.value)}%`,
    percent: item.value,
    color: progressColor(index),
  }));
  const serviceDescriptionConfig: ChartCardConfig = {
    id: 'percentage_of_service_with_description',
    title: serviceDescription.title,
    subTitle: t('insights.cards.serviceDescriptionLead'),
    series: insightResultsToSeries('percentage_of_service_with_description', serviceDescription.points, {
      rankedKeys: serviceDescriptionRows.map((row) => row.key),
      colors: SM_DATA_INSIGHT_COLORS,
    }),
    rows: serviceDescriptionRows,
    headline:
      serviceDescription.headline === undefined
        ? undefined
        : {
            label: serviceDescription.title,
            value: `${round2(serviceDescription.headline)}%`,
            progress: serviceDescription.headline,
            changeText: changeText(serviceDescription.change, serviceDescription.days),
            showProgress: true,
            target: serviceDescription.target,
            targetSuffix: '%',
          },
    testId: 'insights-service-description',
    emptyText: t('insights.serviceChartsEmpty'),
    isPercentage: true,
  };
  const serviceOwnerRows = serviceOwner.latestByService.map((item, index) => ({
    key: item.service,
    name: item.service,
    label: `${round2(item.value)}%`,
    percent: item.value,
    color: progressColor(index),
  }));
  const serviceOwnerConfig: ChartCardConfig = {
    id: 'percentage_of_service_with_owner',
    title: serviceOwner.title,
    subTitle: t('insights.cards.serviceOwnerLead'),
    series: insightResultsToSeries('percentage_of_service_with_owner', serviceOwner.points, {
      rankedKeys: serviceOwnerRows.map((row) => row.key),
      colors: SM_DATA_INSIGHT_COLORS,
    }),
    rows: serviceOwnerRows,
    headline:
      serviceOwner.headline === undefined
        ? undefined
        : {
            label: serviceOwner.title,
            value: `${round2(serviceOwner.headline)}%`,
            progress: serviceOwner.headline,
            changeText: changeText(serviceOwner.change, serviceOwner.days),
            showProgress: true,
            target: serviceOwner.target,
            targetSuffix: '%',
          },
    testId: 'insights-service-owner',
    emptyText: t('insights.serviceChartsEmpty'),
    isPercentage: true,
  };
  const tierSummary = latestSummaryCount(serviceData.value.total_data_assets_with_tier_summary_card ?? []);
  const tierRowsList = tierRows(tierPoints);
  const tier: ChartCardConfig = {
    id: 'total_data_assets_by_tier',
    title: t('insights.summary.byTier'),
    subTitle: t('insights.cards.tierLead'),
    series: insightResultsToSeries('total_data_assets_by_tier', tierPoints, {
      rankedKeys: tierRowsList.map((row) => row.key),
      colors: SM_DATA_INSIGHT_COLORS,
    }),
    rows: tierRowsList,
    headline:
      tierSummary === undefined
        ? undefined
        : {
            label: t('insights.summary.byTier'),
            value: `${round2(tierSummary)}%`,
            progress: tierSummary,
            changeText: changeText(tierChange(), days),
            showProgress: false,
          },
    testId: 'insights-tier',
    emptyText: t('insights.pipelineEmpty'),
    isPercentage: false,
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
  const window = currentWindow.value;
  // Official getQueryFilterForDataInsightChart(chartFilter.team, chartFilter.tier):
  // the same filter rides every system-chart request on this page.
  const filter = getQueryFilterForDataInsightChart(
    selectedTeams.value.length ? selectedTeams.value : undefined,
    selectedTiers.value.length ? selectedTiers.value : undefined,
  );
  try {
    try {
      const system = await listSystemChartData(DATA_ASSET_CHART_NAMES, window.startTs, window.endTs, { filter });
      // Boundary normalisation (pin DataInsightChartCard.tsx:147 excludes
      // the exact `NoTier` group): the live catalog reports the untiered
      // bucket lowercase (`notier`), which the pin-literal filter would
      // count as tiered. Normalise the key once, here, so the change
      // computation and the rows both see pin's spelling.
      systemData.value = {
        ...system,
        total_data_assets_by_tier: (system.total_data_assets_by_tier ?? []).map((point) => ({
          ...point,
          group: point.group?.toLowerCase() === 'notier' ? 'NoTier' : point.group,
        })),
      };
    } catch (error) {
      // Pin DataInsightChartCard.tsx:533: a failed fetch only toasts;
      // the cards fall back to the empty state, with no card error state
      // and no page warning.
      systemData.value = {};
      message.error(error instanceof Error ? error.message : t('insights.pipelineFailed'));
    }
    // Service cards + summary cards + absolute values: fetched strictly.
    // A failure only toasts (pin, see above); the cards render empty.
    try {
      serviceData.value = await listSystemChartData(
        [...SERVICE_CHART_NAMES, ...SUMMARY_CARD_CHART_NAMES, ...ABSOLUTE_VALUE_CHART_NAMES],
        window.startTs,
        window.endTs,
        { filter, strict: true },
      );
    } catch (error) {
      serviceData.value = {};
      message.error(error instanceof Error ? error.message : t('insights.serviceLoadFailed'));
    }
    // KPI targets are optional display: a failure leaves the target blank.
    try {
      kpiList.value = (await listKpis({ limit: 100 })).data;
    } catch (error) {
      console.warn('[data-insights] KPI targets failed to load', error);
      kpiList.value = [];
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('insights.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onDatePresetChange(value: string): void {
  datePreset.value = value;
  // Pin DatePickerMenu: picking the custom entry only opens the range
  // picker; the fetch waits until a range is picked — unless a custom
  // range was already picked, which is reused.
  if (value === CUSTOM_DATE_RANGE_KEY && !customRange.value) {
    return;
  }
  void load();
}

/**
 * Pin DatePickerMenu handleCustomDateChange: start of the first day
 * through the last millisecond of the last day (the pin form is
 * end + 1 day − 1ms). Follows the product's IncidentDateRangeFilter
 * precedent for the same conversion.
 */
function onCustomRangeChange(dates: unknown): void {
  const pair = Array.isArray(dates) ? (dates as Array<{ valueOf: () => number } | null>) : null;
  const start = pair?.[0];
  const end = pair?.[1];
  if (!start || !end) {
    return;
  }
  customRange.value = {
    startTs: dayjs(start.valueOf()).startOf('day').valueOf(),
    endTs: dayjs(end.valueOf()).endOf('day').valueOf(),
  };
  datePreset.value = CUSTOM_DATE_RANGE_KEY;
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
  <DataInsightLayout tab-key="data-assets">
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
            :options="[
              ...INSIGHT_DATE_PRESETS.map((preset) => ({ value: preset.key, label: t(preset.labelKey) })),
              { value: CUSTOM_DATE_RANGE_KEY, label: t('insights.datePresets.customRange') },
            ]"
            @change="(value) => onDatePresetChange(value as string)"
          />
          <!-- Pin DataInsightHeader.component.tsx:125-142: the selected
            range as text beside the picker. -->
          <span data-testid="insights-date-range" class="insights__date-range">{{ rangeText }}</span>
          <span v-if="datePreset === CUSTOM_DATE_RANGE_KEY" data-testid="insights-date-range-picker">
            <DatePicker.RangePicker :value="customRangeValue" @change="onCustomRangeChange" />
          </span>
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
              :md="6"
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
        <!-- Pin DataInsightHeader.component.tsx:184-194: the KPI chart
          renders between the summary and the six system cards, on the
          DATA_ASSETS tab (showKpiChart, DataInsightPureUtils.ts:187-203). -->
        <KpiChartCard
          :kpis="kpiList"
          :start-ts="currentWindow.startTs"
          :end-ts="currentWindow.endTs"
          :loading="loading"
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
            :test-id="card.testId"
            :list-assets="card.listAssets"
            :is-percentage="card.isPercentage"
            :empty-text="card.emptyText"
          />
        </div>
      </template>
    </Spin>
  </PageLayout>
  </DataInsightLayout>
</template>

<style scoped>
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
.insights__date-range {
  font-size: 12px;
  line-height: 18px;
}
.insights-cards {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
</style>
