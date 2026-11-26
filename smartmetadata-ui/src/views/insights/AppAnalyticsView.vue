<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Card, Col, DatePicker, message, Row, Select, Spin, Typography } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import { fetchLoggedInUser } from '@/api/auth';
import {
  DATA_REPORT_INDEXES,
  getAggregateChartData,
  type DataInsightAggregateResult,
  type DataInsightAggregateRow,
} from '@/api/dataInsights';
import { getResourcePermission, toOperationPermissions } from '@/api/permissions';
import { getTeamByName } from '@/api/teams';
import { CUSTOM_DATE_RANGE_KEY, INSIGHT_DATE_PRESETS, insightsDatePresetFromKey } from '@/catalog/insightsTabs';
import SmChart from '@/features/charts/SmChart.vue';
import { formatChartTs, insightResultsToSeries } from '@/features/charts/series';
import type { ChartSeries } from '@/features/charts/types';
import { seriesWindow } from '@/features/charts/types';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import { formatMediumDate } from '@/utils/dates';
import { getDecodedFqn } from '@/utils/fqnPaths';
import { startCase } from '@/utils/text';
import DataInsightChartCard, {
  type DataInsightChartHeadline,
  type DataInsightChartRow,
} from './DataInsightChartCard.vue';
import DataInsightLayout from './DataInsightLayout.vue';
import EmptyGraphPlaceholder from './EmptyGraphPlaceholder.vue';

const { t, locale } = useI18n();

const loading = ref(false);
const datePreset = ref(insightsDatePresetFromKey('last7days').key);
const customRange = ref<{ startTs: number; endTs: number } | null>(null);
const orgName = ref('');
const permissionChecked = ref(false);
const canViewInsights = ref(false);
const mostViewed = ref<DataInsightAggregateRow[]>([]);
const mostActive = ref<DataInsightAggregateRow[]>([]);
const dailyActive = ref<DataInsightAggregateRow[]>([]);
const pageViews = ref<DataInsightAggregateRow[]>([]);

/** Pin EmptyGraphPlaceholder copy, shared by the four cards' empty states. */
const emptyGraphText = computed(() =>
  t('query.addingNewEasy', { entity: t('insights.dataInsight') }),
);

/**
 * Pin DataInsightChartCard.tsx:717 renders the tier groups in the
 * right-side summary rows with lodash `startCase`; pin's
 * TotalEntityInsightSummary does the same for the page-view entities
 * (TotalEntityInsightSummary.component.tsx: `entity={startCase(entity)}`).
 */
function progressColor(index: number): string {
  return SM_DATA_INSIGHT_COLORS[index % SM_DATA_INSIGHT_COLORS.length] ?? SM_DATA_INSIGHT_COLORS[0];
}

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

const summaryTitle = computed(() =>
  orgName.value
    ? t('insights.summaryFor', { organization: orgName.value })
    : t('insights.summaryTitle'),
);

/**
 * Pin DataInsightSummary.tsx: the summary cards are clickable and scroll
 * to their chart (onScrollToChart). The chart cards carry the chart
 * type as their DOM id, like pin's id={type}. Pin scrolls with
 * block 'center' (DataInsightPage.component.tsx:90), which keeps the
 * card clear of the sticky header — no offset is needed.
 */
function scrollToCard(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * Pin getWebChartSummary (utils/DataInsightUtils.tsx): the Page Views
 * summary is the sum of pageViews over the window; the Daily Active
 * Users summary is the rounded mean of activeUsers. Both cards always
 * render — with no data the pin defaults (WEB_SUMMARY_LIST latest 0)
 * apply, so the values below are 0, never absent.
 */
const pageViewsTotal = computed(() =>
  pageViews.value.reduce((sum, row) => sum + (row.pageViews ?? 0), 0),
);

const dailyActiveAverage = computed(() => {
  const values = dailyActive.value.flatMap((row) =>
    row.activeUsers !== undefined ? [row.activeUsers] : [],
  );
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
});

const webSummaryCards = computed(() => [
  {
    id: 'PageViewsByEntities',
    label: t('insights.appAnalytics.pageViewsSummary'),
    value: pageViewsTotal.value,
    target: 'PageViewsByEntities',
  },
  {
    id: 'DailyActiveUsers',
    label: t('insights.appAnalytics.avgDailyActiveUsers'),
    value: dailyActiveAverage.value,
    target: 'DailyActiveUsers',
  },
]);

/**
 * Pin DataInsightSummary.tsx fetchMostActiveUser: the Most Active User
 * card shows response.data[0] — the server returns the users ranked.
 * The card only renders when a userName is present.
 */
const mostActiveUser = computed(() => {
  const first = mostActive.value[0];
  return first?.userName ? first : undefined;
});

/** Latest pageViews per entity type, latest value descending (pin
 * sortEntityByValue). Drives both the rows and the series rank, so the
 * row bars and the lines share one colour order (Lane E). */
const pageViewsLatest = computed(() => {
  const byEntity = new Map<string, { value: number; day: number }>();
  for (const row of pageViews.value) {
    if (!row.entityType || row.pageViews === undefined || row.timestamp === undefined) {
      continue;
    }
    const current = byEntity.get(row.entityType);
    if (!current || row.timestamp > current.day) {
      byEntity.set(row.entityType, { value: row.pageViews, day: row.timestamp });
    }
  }
  return [...byEntity.entries()]
    .map(([entity, item]) => ({ entity, value: item.value }))
    .sort((a, b) => b.value - a.value);
});

const pageViewsLatestTotal = computed(() =>
  pageViewsLatest.value.reduce((sum, item) => sum + item.value, 0),
);

/**
 * Pin getGraphDataByEntityType (utils/DataInsightPureUtils.ts): the
 * change is the summed-per-day total on the last day versus the first
 * day, in %. A first-day total of 0 has no meaningful % change, so it
 * counts as 0 — the same guard DataAssetsView's totalChange() uses.
 */
function pageViewsChange(): number | undefined {
  const byDay = new Map<string, number>();
  for (const row of pageViews.value) {
    if (row.timestamp === undefined || row.pageViews === undefined) {
      continue;
    }
    const label = formatChartTs(row.timestamp);
    if (!label) {
      continue;
    }
    byDay.set(label, (byDay.get(label) ?? 0) + row.pageViews);
  }
  const days = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  if (!days.length) {
    return undefined;
  }
  const first = byDay.get(days[0] as string) ?? 0;
  const last = byDay.get(days[days.length - 1] as string) ?? 0;
  return first ? ((last - first) / first) * 100 : 0;
}

const pageViewsSeries = computed<ChartSeries[]>(() =>
  insightResultsToSeries(
    'PageViewsByEntities',
    pageViews.value.flatMap((row) =>
      row.entityType && row.pageViews !== undefined && row.timestamp !== undefined
        ? [{ count: row.pageViews, day: row.timestamp, group: row.entityType }]
        : [],
    ),
    {
      rankedKeys: pageViewsLatest.value.map((item) => item.entity),
      colors: SM_DATA_INSIGHT_COLORS,
    },
  ),
);

const pageViewsRows = computed<DataInsightChartRow[]>(() =>
  pageViewsLatest.value.map((item, index) => ({
    key: item.entity,
    name: startCase(item.entity),
    // Pin TotalEntityInsightSummary: the row bar is latest/total*100 and
    // the label is the raw latest value.
    label: String(item.value),
    percent: pageViewsLatestTotal.value ? (item.value / pageViewsLatestTotal.value) * 100 : 0,
    color: progressColor(index),
  })),
);

const pageViewsHeadline = computed<DataInsightChartHeadline | undefined>(() =>
  pageViews.value.length
    ? {
        label: t('insights.appAnalytics.totalAssets'),
        value: String(pageViewsLatestTotal.value),
        progress: 0,
        changeValue: pageViewsChange(),
        changeDays: currentDays.value,
        showProgress: false,
      }
    : undefined,
);

/**
 * Pin getFormattedActiveUsersData (utils/DataInsightPureUtils.ts): one
 * point per day, total = the latest day's activeUsers, change = latest
 * versus oldest day in %. Days are ISO labels, so sorting them is
 * chronological.
 */
const dailyPoints = computed(() => {
  const byDay = new Map<string, number>();
  for (const row of dailyActive.value) {
    if (row.timestamp === undefined || row.activeUsers === undefined) {
      continue;
    }
    const label = formatChartTs(row.timestamp);
    if (!label) {
      continue;
    }
    byDay.set(label, (byDay.get(label) ?? 0) + row.activeUsers);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
});

const dailySeries = computed<ChartSeries[]>(() =>
  dailyPoints.value.length
    ? [{ name: t('insights.appAnalytics.activeUser'), points: dailyPoints.value }]
    : [],
);

const dailyTotal = computed(() => dailyPoints.value[dailyPoints.value.length - 1]?.value ?? 0);

const dailyChange = computed<number | undefined>(() => {
  const points = dailyPoints.value;
  if (!points.length) {
    return undefined;
  }
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  return first ? ((last - first) / first) * 100 : 0;
});

/**
 * Pin CustomStatistic.tsx:49-55: sign + round(changeInValue, 2) + '%'.
 * Mirrors DataInsightChartCard's formatChangeValue; the +0 normalises -0
 * so a zero change never renders as "-0.00%".
 */
function formatChangeValue(value: number): string {
  const rounded = Math.round(value * 100) / 100 + 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

/** Pin CustomStatistic.tsx:34-66: the daily-active headline below renders
 * the change as two lines (signed percent + "{days}-days change") from the
 * raw change number and the window days — no preformatted sentence. */

/**
 * Pin TopViewEntities.tsx:84-130 columns: Data Asset (decoded FQN,
 * linked to the entityHref pathname when present), Data Asset Type,
 * Owner (UserPopOverCard or '--'), Total Views.
 */
const topViewColumns = computed(() => [
  { title: t('insights.appAnalytics.columns.dataAsset'), dataIndex: 'entityFqn', key: 'dataAsset' },
  { title: t('insights.appAnalytics.columns.dataAssetType'), dataIndex: 'entityType', key: 'entityType' },
  { title: t('insights.appAnalytics.columns.owner'), dataIndex: 'owner', key: 'owner' },
  { title: t('insights.appAnalytics.columns.totalViews'), dataIndex: 'pageViews', key: 'totalViews' },
]);

type TopViewRow = DataInsightAggregateRow & { entityPath?: string };

function entityPathOf(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  try {
    return new URL(href).pathname || undefined;
  } catch {
    return undefined;
  }
}

const topViewRows = computed<TopViewRow[]>(() =>
  mostViewed.value.map((row) => ({ ...row, entityPath: entityPathOf(row.entityHref) })),
);

/**
 * Pin TopActiveUsers.tsx:96-158 columns: User (UserPopOverCard,
 * sortable by userName), Team (team ?? '--'), Most Recent Session
 * (formatDateTime), Total Sessions, Avg. Session Time
 * (formatTimeDurationFromSeconds).
 */
const topActiveColumns = computed(() => [
  {
    title: t('insights.appAnalytics.columns.user'),
    dataIndex: 'userName',
    key: 'userName',
    sorter: (a: DataInsightAggregateRow, b: DataInsightAggregateRow) =>
      (a.userName ?? '').localeCompare(b.userName ?? ''),
  },
  { title: t('insights.appAnalytics.columns.team'), dataIndex: 'team', key: 'team' },
  { title: t('insights.appAnalytics.columns.mostRecentSession'), dataIndex: 'lastSession', key: 'lastSession' },
  { title: t('insights.appAnalytics.columns.totalSessions'), dataIndex: 'sessions', key: 'sessions' },
  { title: t('insights.appAnalytics.columns.avgSession'), dataIndex: 'avgSessionDuration', key: 'avgSessionDuration' },
]);

/**
 * Pin formatDateTime (utils/date-time/DateTimeUtils.ts:116-126): Luxon
 * DATE_TIME_WITH_OFFSET_SHORT. The product has no Luxon formatter for
 * that shape, so the session time renders as a locale date + time
 * (short month, day, year, hour:minute).
 */
function formatSessionTime(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '';
  }
  return new Date(value).toLocaleString(locale.value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pin formatTimeDurationFromSeconds (utils/date-time/DateTimeUtils.ts:227-228):
 * Luxon Duration `hh:mm:ss`, verbatim.
 */
function formatSessionDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return '';
  }
  const total = Math.max(0, Math.floor(seconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Gate: official DataInsightPage.component.tsx requires Operation.ViewAll
 * + ResourceEntity.DATA_INSIGHT_CHART for the DATA_ASSETS and
 * APP_ANALYTICS tabs, with no content and no chart requests without it.
 * The isAdminUser line is the P1 dual-line lock, same as DataAssetsView:
 * an admin passes even if the permission call disagrees. A failed check
 * fails closed — placeholder, no requests.
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
    console.warn('[app-analytics] permission check failed; page hidden', error);
    canViewInsights.value = false;
  } finally {
    permissionChecked.value = true;
  }
  return canViewInsights.value;
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

/**
 * Pin AppAnalyticsTab.component.tsx:24-46 + DataInsightSummary.tsx
 * fetchMostActiveUser/fetchWebChartData: the four aggregates share the
 * date window (chartFilter) and settle independently; a failure only
 * toasts in pin — the product surfaces one message.error per load and
 * the affected card falls back to its empty state, never breaking the
 * page.
 */
async function load(): Promise<void> {
  loading.value = true;
  const window = currentWindow.value;
  try {
    const [viewed, pageViewsResult, dailyResult, active] = await Promise.allSettled([
      getAggregateChartData({
        dataInsightChartName: 'MostViewedEntities',
        dataReportIndex: DATA_REPORT_INDEXES.webAnalyticEntityView,
        startTs: window.startTs,
        endTs: window.endTs,
      }),
      getAggregateChartData({
        dataInsightChartName: 'PageViewsByEntities',
        dataReportIndex: DATA_REPORT_INDEXES.webAnalyticEntityView,
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
        dataInsightChartName: 'MostActiveUsers',
        dataReportIndex: DATA_REPORT_INDEXES.webAnalyticUserActivity,
        startTs: window.startTs,
        endTs: window.endTs,
      }),
    ]);
    const rowsOf = (
      settled: PromiseSettledResult<DataInsightAggregateResult[]>,
    ): DataInsightAggregateRow[] =>
      settled.status === 'fulfilled' ? settled.value.flatMap((item) => item.data ?? []) : [];
    mostViewed.value = rowsOf(viewed);
    pageViews.value = rowsOf(pageViewsResult);
    dailyActive.value = rowsOf(dailyResult);
    mostActive.value = rowsOf(active);
    if (
      [viewed, pageViewsResult, dailyResult, active].some(
        (result) => result.status === 'rejected',
      )
    ) {
      message.error(t('insights.loadFailed'));
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

onMounted(async () => {
  const allowed = await loadPermissions();
  if (!allowed) {
    return;
  }
  await load();
  await loadOrganization();
});
</script>

<template>
  <DataInsightLayout tab-key="app-analytics">
  <PageLayout test-id="app-analytics-layout">
    <PageHeader :header="t('insights.tabs.appAnalytics')" :sub-header="t('insights.appAnalyticsLead')" />
    <Spin :spinning="!permissionChecked || loading">
      <SmState
        v-if="permissionChecked && !canViewInsights"
        state="error"
        test-id="app-analytics-no-permission"
        :error-text="t('insights.noPermission')"
      />
      <template v-else-if="permissionChecked && canViewInsights">
        <div class="app-analytics__filters">
          <Select
            :value="datePreset"
            data-testid="app-analytics-date-preset"
            style="width: 180px"
            :options="[
              ...INSIGHT_DATE_PRESETS.map((preset) => ({ value: preset.key, label: t(preset.labelKey) })),
              { value: CUSTOM_DATE_RANGE_KEY, label: t('insights.datePresets.customRange') },
            ]"
            @change="(value) => onDatePresetChange(value as string)"
          />
          <!-- Pin DataInsightHeader.component.tsx:125-142: the selected
            range as text beside the picker. -->
          <span data-testid="app-analytics-date-range" class="app-analytics__date-range">{{ rangeText }}</span>
          <span v-if="datePreset === CUSTOM_DATE_RANGE_KEY" data-testid="app-analytics-date-range-picker">
            <DatePicker.RangePicker :value="customRangeValue" @change="onCustomRangeChange" />
          </span>
        </div>
        <Typography.Title :level="5" data-testid="app-analytics-summary-title" class="app-analytics__sub">
          {{ summaryTitle }}
        </Typography.Title>
        <!-- Pin DataInsightSummary.tsx:224-262 (APP_ANALYTICS): the two
          web summary cards (span 6, clickable to their chart) plus the
          Most Active User card (span 6, only when a userName exists). -->
        <div class="app-analytics-summary">
          <Row :gutter="[16, 16]">
            <Col
              v-for="card in webSummaryCards"
              :key="card.id"
              :xs="24"
              :md="6"
              data-testid="app-analytics-summary"
              class="app-analytics-summary__card"
              role="button"
              tabindex="0"
              @click="scrollToCard(card.target)"
              @keydown.enter="scrollToCard(card.target)"
              @keydown.space.prevent="scrollToCard(card.target)"
            >
              <!-- Pin SummaryCard.component.tsx: the title is a wrapping
                paragraph, not an antd Card title (which ellipsises) — at
                span 6 the label must wrap instead of truncating. -->
              <Card size="small">
                <Typography.Paragraph type="secondary" class="app-analytics-summary__label">
                  {{ card.label }}
                </Typography.Paragraph>
                <Typography.Title :level="4">{{ card.value }}</Typography.Title>
              </Card>
            </Col>
            <Col
              v-if="mostActiveUser"
              :xs="24"
              :md="6"
              data-testid="summary-item-MostActiveUsers"
            >
              <Card size="small">
                <Typography.Paragraph type="secondary" class="app-analytics-summary__label">
                  {{ t('insights.appAnalytics.mostActiveUser') }}
                </Typography.Paragraph>
                <UserPopOverCard
                  :user-name="mostActiveUser.userName ?? ''"
                  show-user-name
                  :profile-width="36"
                />
              </Card>
            </Col>
          </Row>
        </div>
        <!-- Pin AppAnalyticsTab.component.tsx:24-46: four full-width
          cards, stacked in pin order. -->
        <div class="app-analytics-cards">
          <Card size="small" data-testid="app-analytics-top-view-entities-card" class="app-analytics__card">
            <Typography.Title :level="5" class="app-analytics__card-title">
              {{ t('insights.appAnalytics.topViewEntities') }}
            </Typography.Title>
            <Typography.Paragraph type="secondary" class="app-analytics__card-sub">
              {{ t('insights.appAnalytics.topViewEntitiesLead') }}
            </Typography.Paragraph>
            <EmptyGraphPlaceholder v-if="!loading && !topViewRows.length" />
            <SmTable
              v-else
              :columns="topViewColumns"
              :data-source="topViewRows"
              row-key="entityFqn"
              size="small"
              :loading="loading"
              :pagination="false"
              test-id="app-analytics-top-view-entities-table"
            >
              <template #bodyCell="{ column, record, text }">
                <template v-if="column.key === 'dataAsset'">
                  <RouterLink
                    v-if="(record as TopViewRow).entityPath"
                    :to="(record as TopViewRow).entityPath ?? ''"
                  >
                    {{ getDecodedFqn((record as DataInsightAggregateRow).entityFqn ?? '') }}
                  </RouterLink>
                  <template v-else>
                    {{ getDecodedFqn((record as DataInsightAggregateRow).entityFqn ?? '') }}
                  </template>
                </template>
                <template v-else-if="column.key === 'owner'">
                  <UserPopOverCard
                    v-if="(record as DataInsightAggregateRow).owner"
                    :user-name="(record as DataInsightAggregateRow).owner ?? ''"
                    show-user-name
                    :profile-width="24"
                  />
                  <template v-else>--</template>
                </template>
                <template v-else>{{ text }}</template>
              </template>
            </SmTable>
          </Card>
          <DataInsightChartCard
            id="PageViewsByEntities"
            :title="t('insights.appAnalytics.pageViewsByEntities')"
            :sub-title="t('insights.appAnalytics.pageViewsLead')"
            :series="pageViewsSeries"
            :rows="pageViewsRows"
            :headline="pageViewsHeadline"
            :loading="loading"
            test-id="insights-page-views"
            :empty-text="emptyGraphText"
            :is-percentage="false"
          >
            <template #empty><EmptyGraphPlaceholder /></template>
          </DataInsightChartCard>
          <!-- Pin DailyActiveUsersChart.tsx:128-148: the right panel is
            only the CustomStatistic — no search, no rows — so this card
            is built inline instead of reusing DataInsightChartCard. -->
          <Card size="small" id="DailyActiveUsers" data-testid="insights-daily-active-card" class="app-analytics__card">
            <Typography.Title :level="5" class="app-analytics__card-title">
              {{ t('insights.appAnalytics.dailyActiveUsers') }}
            </Typography.Title>
            <Typography.Paragraph type="secondary" class="app-analytics__card-sub">
              {{ t('insights.appAnalytics.dailyActiveUsersLead') }}
            </Typography.Paragraph>
            <SmState
              v-if="loading"
              state="loading"
              test-id="insights-daily-active-loading"
            />
            <EmptyGraphPlaceholder v-else-if="!dailyPoints.length" />
            <Row v-else :gutter="32">
              <Col :xs="24" :lg="16">
                <SmChart
                  kind="line"
                  test-id="insights-daily-active"
                  :series="dailySeries"
                  :colors="SM_DATA_INSIGHT_COLORS"
                  :height="500"
                  hide-legend
                  :tooltip-percentage="false"
                  :tooltip-locale="locale"
                  :empty="emptyGraphText"
                />
              </Col>
              <Col :xs="24" :lg="8">
                <div data-testid="insights-daily-active-headline" class="app-analytics__headline">
                  <!-- Pin CustomStatistic.tsx:34-66: label + value left,
                    the change right-aligned as two lines (signed percent
                    over the "{days}-days change" wording) in a wrapping
                    row — never one long sentence beside the label. -->
                  <div class="app-analytics__headline-main">
                    <div class="app-analytics__headline-left">
                      <Typography.Paragraph type="secondary" class="app-analytics__headline-label">
                        {{ t('insights.appAnalytics.totalActiveUsers') }}
                      </Typography.Paragraph>
                      <Typography.Title :level="4" class="app-analytics__headline-value">
                        {{ dailyTotal }}
                      </Typography.Title>
                    </div>
                    <div v-if="dailyChange !== undefined" class="app-analytics__headline-change">
                      <Typography.Paragraph
                        class="app-analytics__headline-change-value"
                        :type="dailyChange >= 0 ? 'success' : 'danger'"
                      >
                        {{ formatChangeValue(dailyChange) }}
                      </Typography.Paragraph>
                      <Typography.Paragraph type="secondary" class="app-analytics__headline-change-days">
                        {{ t('insights.cards.changeDays', { days: currentDays }) }}
                      </Typography.Paragraph>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>
          <Card size="small" data-testid="app-analytics-top-active-users-card" class="app-analytics__card">
            <Typography.Title :level="5" class="app-analytics__card-title">
              {{ t('insights.appAnalytics.topActiveUsers') }}
            </Typography.Title>
            <Typography.Paragraph type="secondary" class="app-analytics__card-sub">
              {{ t('insights.appAnalytics.topActiveUsersLead') }}
            </Typography.Paragraph>
            <EmptyGraphPlaceholder v-if="!loading && !mostActive.length" />
            <SmTable
              v-else
              :columns="topActiveColumns"
              :data-source="mostActive"
              row-key="userName"
              size="small"
              :loading="loading"
              :pagination="false"
              test-id="app-analytics-top-active-users-table"
            >
              <template #bodyCell="{ column, record, text }">
                <template v-if="column.key === 'userName'">
                  <UserPopOverCard
                    :user-name="(record as DataInsightAggregateRow).userName ?? ''"
                    show-user-name
                    :profile-width="24"
                  />
                </template>
                <template v-else-if="column.key === 'team'">
                  {{ (record as DataInsightAggregateRow).team ?? '--' }}
                </template>
                <template v-else-if="column.key === 'lastSession'">
                  {{ formatSessionTime((record as DataInsightAggregateRow).lastSession) }}
                </template>
                <template v-else-if="column.key === 'avgSessionDuration'">
                  {{ formatSessionDuration((record as DataInsightAggregateRow).avgSessionDuration) }}
                </template>
                <template v-else>{{ text }}</template>
              </template>
            </SmTable>
          </Card>
        </div>
      </template>
    </Spin>
  </PageLayout>
  </DataInsightLayout>
</template>

<style scoped>
.app-analytics-summary__card {
  cursor: pointer;
}
.app-analytics-summary__label {
  margin-bottom: 0;
}
.app-analytics-summary__card :deep(.ant-card):hover {
  background-color: var(--sm-color-bg-hover);
}
.app-analytics__sub {
  margin-top: 20px;
}
.app-analytics__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-block: 12px;
}
.app-analytics__date-range {
  font-size: 12px;
  line-height: 18px;
}
.app-analytics-cards {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
.app-analytics__card-title {
  margin-bottom: 4px;
}
.app-analytics__card-sub {
  margin-bottom: 12px;
}
.app-analytics__headline-main {
  display: flex;
  /* Pin CustomStatistic.tsx:34: the headline row wraps (Box wrap="wrap") —
   * when the change cannot fit beside the label + value it drops to the
   * next line instead of crushing the left column to min-content. */
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.app-analytics__headline-left {
  min-width: 0;
}
.app-analytics__headline-change {
  flex-shrink: 0;
  margin-bottom: 0;
  text-align: right;
}
.app-analytics__headline-change-value {
  margin-bottom: 0;
}
.app-analytics__headline-change-days {
  margin-bottom: 0;
}
.app-analytics__headline-label {
  margin-bottom: 0;
}
.app-analytics__headline-value {
  margin-top: 0;
  margin-bottom: 4px;
}
</style>
