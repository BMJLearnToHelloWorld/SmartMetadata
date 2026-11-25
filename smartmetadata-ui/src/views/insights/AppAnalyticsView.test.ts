/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { DataInsightAggregateResult } from '@/api/dataInsights';
import AppAnalyticsView from './AppAnalyticsView.vue';

const getAggregateChartData = vi.fn();
const getResourcePermission = vi.fn();
const fetchLoggedInUser = vi.fn();
const getTeamByName = vi.fn();

vi.mock('@/api/dataInsights', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataInsights')>('@/api/dataInsights');
  return {
    ...actual,
    getAggregateChartData: (...args: unknown[]) => getAggregateChartData(...args),
  };
});

vi.mock('@/api/permissions', () => ({
  getResourcePermission: (...args: unknown[]) => getResourcePermission(...args),
  toOperationPermissions: (permission: { permissions?: Array<{ operation: string; access: string }> }) => {
    const result: Record<string, boolean> = {};
    for (const entry of permission?.permissions ?? []) {
      result[entry.operation] = entry.access === 'allow';
    }
    return result;
  },
}));

vi.mock('@/api/auth', () => ({
  fetchLoggedInUser: (...args: unknown[]) => fetchLoggedInUser(...args),
}));

vi.mock('@/api/teams', () => ({
  getTeamByName: (...args: unknown[]) => getTeamByName(...args),
}));

/** Pin UserPopOverCard renders a user popover backed by a data fetch;
 * the view tests only need the displayed user name. */
vi.mock('@/components/shared/UserPopOverCard.vue', () => ({
  default: {
    name: 'UserPopOverCard',
    props: ['userName'],
    template: '<span class="user-popover-stub">{{ userName }}</span>',
  },
}));

const DAY_1 = Date.UTC(2026, 0, 1);
const DAY_2 = Date.UTC(2026, 0, 2);

function aggregateResult(
  chartType: string,
  data: DataInsightAggregateResult['data'],
): DataInsightAggregateResult[] {
  return [{ chartType, data }];
}

const viewedRows = [
  {
    entityFqn: 'svc.db.orders',
    entityHref: 'https://example.com/table/svc.db.orders',
    entityType: 'table',
    owner: 'alice',
    pageViews: 120,
  },
  { entityFqn: 'svc.db.customers', entityType: 'dashboard', pageViews: 40 },
];

const pageViewsRows = [
  { timestamp: DAY_1, entityType: 'table', pageViews: 100 },
  { timestamp: DAY_1, entityType: 'dashboard', pageViews: 50 },
  { timestamp: DAY_2, entityType: 'table', pageViews: 200 },
  { timestamp: DAY_2, entityType: 'dashboard', pageViews: 60 },
];

const dailyRows = [
  { timestamp: DAY_1, activeUsers: 10 },
  { timestamp: DAY_2, activeUsers: 20 },
];

const activeRows = [
  {
    userName: 'alice',
    team: 'Data',
    lastSession: Date.UTC(2026, 0, 2, 12, 30),
    sessions: 5,
    avgSessionDuration: 90,
    pageViews: 120,
  },
  { userName: 'bob', sessions: 3, avgSessionDuration: 3661 },
];

function routeAggregateCalls() {
  getAggregateChartData.mockImplementation(
    async (options: { dataInsightChartName: string }) => {
      switch (options.dataInsightChartName) {
        case 'MostViewedEntities':
          return aggregateResult('MostViewedEntities', viewedRows);
        case 'PageViewsByEntities':
          return aggregateResult('PageViewsByEntities', pageViewsRows);
        case 'DailyActiveUsers':
          return aggregateResult('DailyActiveUsers', dailyRows);
        case 'MostActiveUsers':
          return aggregateResult('MostActiveUsers', activeRows);
        default:
          return [];
      }
    },
  );
}

async function mountView(options: { attach?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/app-analytics', name: 'insights-app-analytics', component: AppAnalyticsView },
      { path: '/table/:fqn', name: 'table-detail', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'insights-app-analytics' });
  await router.isReady();
  const wrapper = mount(AppAnalyticsView, {
    attachTo: options.attach ? document.body : undefined,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AppAnalyticsView', () => {
  beforeEach(() => {
    getAggregateChartData.mockReset();
    getTeamByName.mockReset();
    getTeamByName.mockResolvedValue({ id: 'org', name: 'Organization', displayName: 'Acme Org' });
    getResourcePermission.mockReset();
    getResourcePermission.mockResolvedValue({
      resource: 'dataInsightChart',
      permissions: [{ operation: 'ViewAll', access: 'allow' }],
    });
    fetchLoggedInUser.mockReset();
    fetchLoggedInUser.mockResolvedValue({ id: 'u1', name: 'alice', isAdmin: false });
    getAggregateChartData.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches all four pin aggregates on the web report indexes', async () => {
    routeAggregateCalls();
    await mountView();
    expect(getAggregateChartData).toHaveBeenCalledTimes(4);
    const calls = getAggregateChartData.mock.calls.map(
      (call) => call[0] as { dataInsightChartName: string; dataReportIndex: string },
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        { dataInsightChartName: 'MostViewedEntities', dataReportIndex: 'web_analytic_entity_view_report_data_index', startTs: expect.any(Number), endTs: expect.any(Number) },
        { dataInsightChartName: 'PageViewsByEntities', dataReportIndex: 'web_analytic_entity_view_report_data_index', startTs: expect.any(Number), endTs: expect.any(Number) },
        { dataInsightChartName: 'DailyActiveUsers', dataReportIndex: 'web_analytic_user_activity_report_data_index', startTs: expect.any(Number), endTs: expect.any(Number) },
        { dataInsightChartName: 'MostActiveUsers', dataReportIndex: 'web_analytic_user_activity_report_data_index', startTs: expect.any(Number), endTs: expect.any(Number) },
      ]),
    );
  });

  it('renders the pin summary row: two web cards plus the most active user, never "residual"', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain('residual');
    expect(wrapper.get('[data-testid="app-analytics-summary-title"]').text()).toContain('Acme Org');
    const cards = wrapper.findAll('[data-testid="app-analytics-summary"]');
    expect(cards).toHaveLength(2);
    // Pin getWebChartSummary: page views sum to 410, daily active users
    // average to the rounded mean of 10 and 20.
    expect(cards[0]?.text()).toContain('Page Views by Data Assets');
    expect(cards[0]?.text()).toContain('410');
    expect(cards[1]?.text()).toContain('Average Daily Active Users on the Platform');
    expect(cards[1]?.text()).toContain('15');
    const mostActive = wrapper.get('[data-testid="summary-item-MostActiveUsers"]');
    expect(mostActive.text()).toContain('Most Active User');
    expect(mostActive.text()).toContain('alice');
  });

  it('renders the four pin cards full-width in pin order, with 500px lines and hidden legends', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    const cards = wrapper.findAll(
      '[data-testid="app-analytics-top-view-entities-card"], [data-testid="insights-page-views-card"], [data-testid="insights-daily-active-card"], [data-testid="app-analytics-top-active-users-card"]',
    ).map((el) => el.attributes('data-testid'));
    expect(cards).toEqual([
      'app-analytics-top-view-entities-card',
      'insights-page-views-card',
      'insights-daily-active-card',
      'app-analytics-top-active-users-card',
    ]);
    for (const testId of ['insights-page-views', 'insights-daily-active']) {
      expect(wrapper.find(`[data-testid="${testId}"]`).attributes('data-points')).toBe('1');
    }
    const charts = wrapper.findAllComponents({ name: 'VChart' });
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      expect((chart.props('option') as Record<string, unknown>).legend).toEqual({ show: false });
      expect(chart.attributes('style')).toContain('height: 500px');
    }
  });

  it('plots the page-views rows and headline from the aggregate payload', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    const rows = wrapper.findAll('[data-testid="insights-page-views-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Table');
    expect(rows[0]?.text()).toContain('200');
    expect(rows[1]?.text()).toContain('Dashboard');
    expect(rows[1]?.text()).toContain('60');
    const headline = wrapper.get('[data-testid="insights-page-views-headline"]');
    expect(headline.text()).toContain('Total Assets');
    expect(headline.text()).toContain('260');
    // Day totals 150 -> 260, a +73.33% change over the 7-day window.
    expect(headline.text()).toContain('+73.33% over the last 7 days');
  });

  it('plots the daily active users headline from the aggregate payload', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    const headline = wrapper.get('[data-testid="insights-daily-active-headline"]');
    expect(headline.text()).toContain('Total Active User');
    // Pin getFormattedActiveUsersData: total is the latest day's value.
    expect(headline.text()).toContain('20');
    expect(headline.text()).toContain('+100.00% over the last 7 days');
  });

  it('renders the two tables with pin columns', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    const viewed = wrapper.get('[data-testid="app-analytics-top-view-entities-table"]');
    expect(viewed.text()).toContain('svc.db.orders');
    const link = viewed.find('a[href="/table/svc.db.orders"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('svc.db.orders');
    expect(viewed.text()).toContain('dashboard');
    expect(viewed.text()).toContain('alice');
    expect(viewed.text()).toContain('120');
    expect(viewed.text()).toContain('svc.db.customers');
    expect(viewed.text()).toContain('--');
    const active = wrapper.get('[data-testid="app-analytics-top-active-users-table"]');
    expect(active.text()).toContain('alice');
    expect(active.text()).toContain('bob');
    expect(active.text()).toContain('Data');
    expect(active.text()).toContain('5');
    expect(active.text()).toContain('3');
    // Pin formatTimeDurationFromSeconds: hh:mm:ss, verbatim.
    expect(active.text()).toContain('00:01:30');
    expect(active.text()).toContain('01:01:01');
    // Most recent session renders as a locale date + time.
    expect(active.text()).toMatch(/Jan [23], 2026/);
  });

  it('shows the pin empty placeholder with a docs link when no aggregate returns', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(wrapper.text()).not.toContain('residual');
    const link = wrapper.find('a[href="https://docs.open-metadata.org/latest/how-to-guides/data-insights"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('docs');
    // One placeholder per card: two tables + two line charts.
    // Rebase note: the merged EmptyGraphPlaceholder renders its default
    // testid 'empty-graph-placeholder' (the #343 NoDataPlaceholder
    // 'no-data-placeholder' id is gone with the merge); same count, same
    // strength.
    expect(wrapper.findAll('[data-testid="empty-graph-placeholder"]')).toHaveLength(4);
    // The web summary cards still render, at their pin defaults of 0.
    const cards = wrapper.findAll('[data-testid="app-analytics-summary"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.text()).toContain('0');
    expect(cards[1]?.text()).toContain('0');
    expect(wrapper.find('[data-testid="summary-item-MostActiveUsers"]').exists()).toBe(false);
  });

  it('defaults the chart window to the 7-day preset and refetches on preset change', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    expect(getAggregateChartData).toHaveBeenCalledTimes(4);
    const [first] = getAggregateChartData.mock.calls[0] as [
      { startTs: number; endTs: number },
    ];
    expect(first.endTs - first.startTs).toBe(7 * 24 * 60 * 60 * 1000);
    const dateSelect = wrapper.findComponent(Select);
    expect(dateSelect.exists()).toBe(true);
    const options = dateSelect.props('options') as Array<{ value: string; label: string }>;
    expect(options.map((option) => option.value)).toEqual([
      'yesterday',
      'last3days',
      'last7days',
      'last14days',
      'last30days',
      'last60days',
      'customRange',
    ]);
    expect(wrapper.get('[data-testid="app-analytics-date-range"]').text()).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4} - [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
    getAggregateChartData.mockClear();
    await dateSelect.vm.$emit('change', 'last30days');
    await flushPromises();
    expect(getAggregateChartData).toHaveBeenCalledTimes(4);
    const [refetched] = getAggregateChartData.mock.calls[0] as [
      { startTs: number; endTs: number },
    ];
    expect(refetched.endTs - refetched.startTs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('fetches the picked days for a custom range (pin DatePickerMenu custom range)', async () => {
    routeAggregateCalls();
    const wrapper = await mountView();
    const dateSelect = wrapper.findComponent(Select);
    await dateSelect.vm.$emit('change', 'customRange');
    await flushPromises();
    // Picking the custom entry only opens the picker; nothing refetches
    // until a range is picked.
    expect(wrapper.find('[data-testid="app-analytics-date-range-picker"]').exists()).toBe(true);
    const callsBefore = getAggregateChartData.mock.calls.length;
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs(DAY_1), dayjs(DAY_2)]);
    await flushPromises();
    expect(getAggregateChartData.mock.calls.length).toBeGreaterThan(callsBefore);
    const [last] = getAggregateChartData.mock.calls.at(-1) as [
      { startTs: number; endTs: number },
    ];
    expect(last.startTs).toBe(dayjs(DAY_1).startOf('day').valueOf());
    expect(last.endTs).toBe(dayjs(DAY_2).endOf('day').valueOf());
  });

  it('scrolls to the chart when a web summary card is clicked (pin DataInsightSummary onScrollToChart)', async () => {
    routeAggregateCalls();
    const wrapper = await mountView({ attach: true });
    try {
      const card = document.getElementById('PageViewsByEntities');
      expect(card).not.toBeNull();
      const scrollIntoView = vi.fn();
      card!.scrollIntoView = scrollIntoView as Element['scrollIntoView'];
      await wrapper.findAll('[data-testid="app-analytics-summary"]')[0]?.trigger('click');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Pin DataInsightPage.component.tsx:90: centred, smooth — the card
      // clears the 64px sticky header instead of parking under it.
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      wrapper.unmount();
    }
  });

  it('hides the page and makes no aggregate calls without the ViewAll permission', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'dataInsightChart',
      permissions: [],
    });
    fetchLoggedInUser.mockResolvedValue({ id: 'u1', name: 'alice', isAdmin: false });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="app-analytics-no-permission"]').exists()).toBe(true);
    expect(getAggregateChartData).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('residual');
  });
});
