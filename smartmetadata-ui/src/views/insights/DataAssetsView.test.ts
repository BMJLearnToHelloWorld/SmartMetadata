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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataAssetsView from './DataAssetsView.vue';

const searchAssets = vi.fn();
const listTestCases = vi.fn();
const listTestIncidents = vi.fn();
const listSystemChartData = vi.fn();
const getAggregateChartData = vi.fn();
const getTeamByName = vi.fn();
const listTeams = vi.fn();
const listTags = vi.fn();
const listKpis = vi.fn();
const getResourcePermission = vi.fn();
const fetchLoggedInUser = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));
vi.mock('@/api/testCases', () => ({
  listTestCases: (...args: unknown[]) => listTestCases(...args),
}));
vi.mock('@/api/testIncidents', () => ({
  listTestIncidents: (...args: unknown[]) => listTestIncidents(...args),
}));
vi.mock('@/api/dataInsights', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataInsights')>('@/api/dataInsights');
  return {
    ...actual,
    listSystemChartData: (...args: unknown[]) => listSystemChartData(...args),
    getAggregateChartData: (...args: unknown[]) => getAggregateChartData(...args),
  };
});

vi.mock('@/api/teams', () => ({
  getTeamByName: (...args: unknown[]) => getTeamByName(...args),
  listTeams: (...args: unknown[]) => listTeams(...args),
}));
vi.mock('@/api/tags', () => ({
  listTags: (...args: unknown[]) => listTags(...args),
}));
vi.mock('@/api/kpi', () => ({
  listKpis: (...args: unknown[]) => listKpis(...args),
}));
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

const DAY_1 = Date.UTC(2026, 0, 1);
const DAY_7 = Date.UTC(2026, 0, 7);

/** Legacy pipeline payload: totals 200 → 300, percentage latest 42.5% / 80%. */
const legacyPayload = {
  total_data_assets: [
    { count: 100, day: DAY_1, group: 'table' },
    { count: 100, day: DAY_1, group: 'topic' },
    { count: 150, day: DAY_7, group: 'table' },
    { count: 150, day: DAY_7, group: 'topic' },
  ],
  percentage_of_data_asset_with_description: [{ count: 42.5, day: DAY_7 }],
  percentage_of_data_asset_with_owner: [{ count: 80, day: DAY_7 }],
  total_data_assets_by_tier: [
    { count: 7, day: DAY_7, group: 'Tier.Gold' },
    { count: 3, day: DAY_7, group: 'Tier.Silver' },
  ],
};

/** Service batch payload: headline from the day-max summary row (62.5% / 75%),
 * change from the absolute charts (description +15pp, owner +30pp). */
const servicePayload = {
  percentage_of_service_with_description: [
    { count: 50, day: DAY_1, group: 'Postgres' },
    { count: 80, day: DAY_7, group: 'Postgres' },
    { count: 40, day: DAY_1, group: 'MySQL' },
    { count: 60, day: DAY_7, group: 'MySQL' },
  ],
  percentage_of_service_with_owner: [
    { count: 30, day: DAY_1, group: 'Postgres' },
    { count: 70, day: DAY_7, group: 'Postgres' },
  ],
  // Deliberately out of order: the headline must come from the greatest day.
  data_assets_with_description_summary_card: [
    { count: 62.5, day: DAY_7 },
    { count: 55, day: DAY_1 },
  ],
  data_assets_with_owner_summary_card: [
    { count: 40, day: DAY_1 },
    { count: 75, day: DAY_7 },
  ],
  total_data_assets_summary_card: [{ count: 300, day: DAY_7 }],
  total_data_assets_with_tier_summary_card: [{ count: 20, day: DAY_7 }],
  number_of_data_asset_with_description_kpi: [
    { count: 50, day: DAY_1 },
    { count: 120, day: DAY_7 },
  ],
  number_of_data_asset_with_owner_kpi: [
    { count: 40, day: DAY_1 },
    { count: 150, day: DAY_7 },
  ],
};

function routeChartCalls() {
  listSystemChartData.mockImplementation(async (names: readonly string[]) => {
    if (names.includes('percentage_of_service_with_description')) {
      return servicePayload;
    }
    return legacyPayload;
  });
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/insights/data-assets', name: 'insights-data-assets', component: DataAssetsView }],
  });
  await router.push({ name: 'insights-data-assets' });
  await router.isReady();
  const wrapper = mount(DataAssetsView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('DataAssetsView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    listTestCases.mockReset();
    listTestIncidents.mockReset();
    listSystemChartData.mockReset();
    getAggregateChartData.mockReset();
    getAggregateChartData.mockResolvedValue([]);
    getTeamByName.mockReset();
    getTeamByName.mockResolvedValue({ id: 'org', name: 'Organization', displayName: 'Acme Org' });
    listTeams.mockReset();
    listTeams.mockResolvedValue({ data: [] });
    listTags.mockReset();
    listTags.mockResolvedValue({ data: [] });
    listKpis.mockReset();
    listKpis.mockResolvedValue({ data: [] });
    getResourcePermission.mockReset();
    getResourcePermission.mockResolvedValue({
      resource: 'dataInsightChart',
      permissions: [{ operation: 'ViewAll', access: 'allow' }],
    });
    fetchLoggedInUser.mockReset();
    fetchLoggedInUser.mockResolvedValue({ id: 'u1', name: 'alice', isAdmin: false });
    searchAssets.mockResolvedValue({
      total: 7,
      hits: [],
      facets: [
        { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 5 }] },
        { id: 'serviceType', field: 'serviceType', buckets: [{ key: 'Postgres', count: 5 }] },
        { id: 'tier', field: 'tier.tagFQN', buckets: [{ key: 'Tier.Gold', count: 2 }] },
      ],
    });
    listTestCases.mockResolvedValue({
      data: [{ testCaseStatus: 'Success' }, { testCaseResult: { testCaseStatus: 'Failed' }, testCaseStatus: 'Failed' }],
    });
    listTestIncidents.mockResolvedValue({ data: [{ testCaseResolutionStatusType: 'Ack' }] });
    listSystemChartData.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('plots live catalog and quality snapshots from existing GET payloads', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('7');
    expect(wrapper.find('[data-testid="insights-entity-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-service-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-tier-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-test-chart"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-incident-chart"]').attributes('data-points')).toBe('1');
    expect(searchAssets).toHaveBeenCalledWith('*', 0, 1);
  });

  it('shows the service cards empty when the service charts return no points', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('No service coverage data in the selected window.');
  });

  it('leaves the pipeline empty until a job writes report data', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-pipeline-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights pipeline');
  });

  it('plots test-status donut when latest status lives only under testCaseResult', async () => {
    listTestCases.mockResolvedValue({
      data: [{ testCaseResult: { testCaseStatus: 'Failed' } }, { testCaseResult: { testCaseStatus: 'Success' } }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-test-chart"]').attributes('data-points')).toBe('1');
  });

  it('plots pipeline series only when listChartData returns points', async () => {
    listSystemChartData.mockResolvedValue({
      total_data_assets: [{ count: 4, day: Date.UTC(2026, 0, 1), group: 'table' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-pipeline-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-pipeline-total_data_assets"]').attributes('data-points')).toBe('1');
  });

  it('renders web activity aggregates for users, daily actives and page views', async () => {
    getAggregateChartData.mockImplementation(async (options: { dataInsightChartName: string }) => {
      if (options.dataInsightChartName === 'MostActiveUsers') {
        return [{ chartType: 'MostActiveUsers', data: [{ userName: 'alice', sessions: 5 }] }];
      }
      if (options.dataInsightChartName === 'DailyActiveUsers') {
        return [{ chartType: 'DailyActiveUsers', data: [{ timestamp: Date.UTC(2026, 0, 2), activeUsers: 3 }] }];
      }
      return [{ chartType: 'PageViewsByEntities', data: [{ entityFqn: 'svc.db.schema.orders', pageViews: 9 }] }];
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-web-users"]').text()).toContain('alice');
    expect(wrapper.find('[data-testid="insights-web-daily-active"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-web-entities"]').text()).toContain('svc.db.schema.orders');
  });

  it('defaults the pipeline window to the 7-day preset', async () => {
    routeChartCalls();
    await mountView();
    expect(listSystemChartData).toHaveBeenCalledTimes(2);
    const [, startTs, endTs] = listSystemChartData.mock.calls[0] as [unknown, number, number];
    expect(endTs - startTs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('renders the org-named summary cards from the global summary values', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    expect(getTeamByName).toHaveBeenCalledWith('Organization');
    expect(wrapper.get('[data-testid="insights-summary-title"]').text()).toContain('Acme Org');
    // Total sums the latest per-group counts (150 + 150), not the stale day-1 point.
    expect(wrapper.get('[data-testid="insights-summary-total"]').text()).toContain('300');
    // Description/owner come from the summary cards (62.5% / 75%), NOT the
    // percentage series' latest point (42.5% / 80%) — the D-D-1 correction.
    expect(wrapper.get('[data-testid="insights-summary-description"]').text()).toContain('62.5%');
    expect(wrapper.get('[data-testid="insights-summary-owner"]').text()).toContain('75%');
    const entityRows = wrapper.findAll('[data-testid="insights-entity-progress-row"]');
    expect(entityRows).toHaveLength(2);
    // Official EntitySummaryProgressBar: name + count meta, ProgressBar with no trailing % info.
    expect(entityRows[0].get('[data-testid="insights-progress-name"]').text()).toContain('Table');
    expect(entityRows[0].get('[data-testid="insights-progress-value"]').text()).toBe('150');
    expect(entityRows[0].find('.ant-progress-bg').attributes('style')).toContain('width: 50%');
    expect(entityRows[0].find('.ant-progress-text').exists()).toBe(false);
    const tierRows = wrapper.findAll('[data-testid="insights-tier-progress-row"]');
    expect(tierRows).toHaveLength(2);
    expect(tierRows[0].get('[data-testid="insights-progress-name"]').text()).toContain('Tier.Gold');
    expect(tierRows[0].get('[data-testid="insights-progress-value"]').text()).toBe('7');
    // Tier shares are of the global total (7 of 300), not of tiered assets.
    expect(tierRows[0].find('.ant-progress-bg').attributes('style')).toContain('width: 2.33');
    expect(tierRows[0].find('.ant-progress-text').exists()).toBe(false);
  });

  it('omits the summary description/owner cards when their summary cards have no value', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return {};
      }
      return legacyPayload;
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="insights-summary-total"]').text()).toContain('300');
    expect(wrapper.find('[data-testid="insights-summary-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-summary-owner"]').exists()).toBe(false);
  });

  it('falls back to the generic summary title when the Organization team is missing', async () => {
    getTeamByName.mockRejectedValue(new Error('not found'));
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="insights-summary-title"]').text()).toContain('Data Insight summary');
    expect(wrapper.get('[data-testid="insights-summary-title"]').text()).not.toContain('Acme Org');
    expect(wrapper.find('.ant-alert-error').exists()).toBe(false);
  });

  it('renders the service cards with headline, change, KPI target and per-service list', async () => {
    routeChartCalls();
    listKpis.mockResolvedValue({
      data: [
        {
          name: 'description-coverage',
          targetValue: 80,
          dataInsightChart: { name: 'percentage_of_data_asset_with_description_kpi', type: 'dataInsightChart' },
          owners: [],
        },
      ],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-description"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-service-owner"]').attributes('data-points')).toBe('1');
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(false);
    // Headline = summary card latest day (62.5% / 75%), change = official
    // formula: description (120/300 − 50/200) × 100 = +15pp, owner +30pp.
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain('62.5%');
    expect(wrapper.get('[data-testid="insights-service-owner-headline"]').text()).toContain('75%');
    expect(wrapper.text()).toContain('+15.00 pp over the last 7 days');
    expect(wrapper.text()).toContain('+30.00 pp over the last 7 days');
    expect(wrapper.text()).toContain('Target: 80%');
    const rows = wrapper.findAll('[data-testid="insights-service-description-service"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Postgres');
    expect(rows[0]?.text()).toContain('80%');
    expect(rows[1]?.text()).toContain('MySQL');
    expect(rows[1]?.text()).toContain('60%');
  });

  it('shows a warning and error states, not empty states, when the service fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      listSystemChartData.mockImplementation(async (names: readonly string[]) => {
        if (names.includes('percentage_of_service_with_description')) {
          throw new Error('chart missing');
        }
        return legacyPayload;
      });
      const wrapper = await mountView();
      expect(wrapper.find('[data-testid="insights-service-load-warning"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="insights-service-description-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="insights-service-owner-error"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('shows the no-permission placeholder and issues no chart requests without ViewAll', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'dataInsightChart',
      permissions: [{ operation: 'ViewAll', access: 'deny' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-no-permission"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
    expect(listSystemChartData).not.toHaveBeenCalled();
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it('lets an admin through on the isAdminUser line even when ViewAll is denied', async () => {
    getResourcePermission.mockResolvedValue({
      resource: 'dataInsightChart',
      permissions: [{ operation: 'ViewAll', access: 'deny' }],
    });
    fetchLoggedInUser.mockResolvedValue({ id: 'u1', name: 'admin', isAdmin: true });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-no-permission"]').exists()).toBe(false);
    expect(listSystemChartData).toHaveBeenCalled();
  });

  it('sends the team/tier filter with every chart request after a filter change', async () => {
    routeChartCalls();
    listTeams.mockResolvedValue({
      data: [{ id: 't1', name: 'Data Team', displayName: 'Data Team', teamType: 'Group', users: [], defaultRoles: [], parents: [], policies: [] }],
    });
    listTags.mockResolvedValue({
      data: [{ id: 'tag1', name: 'Gold', displayName: 'Gold', fullyQualifiedName: 'Tier.Gold', owners: [] }],
    });
    const wrapper = await mountView();
    expect(listTeams).toHaveBeenCalled();
    expect(listTags).toHaveBeenCalledWith({ parent: 'Tier', limit: 100 });
    const selects = wrapper.findAllComponents(Select);
    const teamSelect = selects[0];
    const tierSelect = selects[1];
    expect(teamSelect?.exists()).toBe(true);
    expect(tierSelect?.exists()).toBe(true);
    listSystemChartData.mockClear();
    await teamSelect?.vm.$emit('change', ['Data Team']);
    await tierSelect?.vm.$emit('change', ['Tier.Gold']);
    await flushPromises();
    expect(listSystemChartData).toHaveBeenCalled();
    const filters = listSystemChartData.mock.calls.map((call) => {
      const options = call[3] as { filter?: string } | undefined;
      return options?.filter ? (JSON.parse(options.filter) as unknown) : undefined;
    });
    expect(filters).toContainEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { 'tier.keyword': 'Tier.Gold' } }] } },
            {
              nested: {
                path: 'owners',
                query: { bool: { should: [{ term: { 'owners.name.keyword': 'Data Team' } }] } },
              },
            },
          ],
        },
      },
    });
  });
});
