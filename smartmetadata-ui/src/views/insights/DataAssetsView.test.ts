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

const listSystemChartData = vi.fn();
const getAggregateChartData = vi.fn();
const getTeamByName = vi.fn();
const listTeams = vi.fn();
const listTags = vi.fn();
const listKpis = vi.fn();
const getResourcePermission = vi.fn();
const fetchLoggedInUser = vi.fn();

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

/** System payload: totals 200 → 300, percentage latest 42.5% / 80%.
 * The percentage points carry their entity-type group, as the server
 * returns them — the card rows and the line series share the group key,
 * so a group-less point would match no row and its chart would be empty. */
const systemPayload = {
  total_data_assets: [
    { count: 100, day: DAY_1, group: 'table' },
    { count: 100, day: DAY_1, group: 'topic' },
    { count: 150, day: DAY_7, group: 'table' },
    { count: 150, day: DAY_7, group: 'topic' },
  ],
  percentage_of_data_asset_with_description: [{ count: 42.5, day: DAY_7, group: 'table' }],
  percentage_of_data_asset_with_owner: [{ count: 80, day: DAY_7, group: 'table' }],
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
    return systemPayload;
  });
}

async function mountView(options: { attach?: boolean; locale?: 'en-US' | 'zh-CN' } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/data-assets', name: 'insights-data-assets', component: DataAssetsView },
      { path: '/explore', name: 'search', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'insights-data-assets' });
  await router.isReady();
  const wrapper = mount(DataAssetsView, {
    // The summary click-scrolls via document.getElementById, so only the
    // scroll test mounts attached to the document.
    attachTo: options.attach ? document.body : undefined,
    global: { plugins: [router, Antd, createTestI18n(options.locale ?? 'en-US')] },
  });
  await flushPromises();
  return wrapper;
}

describe('DataAssetsView', () => {
  beforeEach(() => {
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
    listSystemChartData.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('plots the six pin cards from the system and service chart payloads', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    for (const testId of [
      'insights-total',
      'insights-asset-description',
      'insights-asset-owner',
      'insights-service-description',
      'insights-service-owner',
      'insights-tier',
    ]) {
      expect(wrapper.find(`[data-testid="${testId}"]`).attributes('data-points')).toBe('1');
    }
  });

  it('formats summary totals with a thousands separator and % suffixes untouched (pin SummaryCard)', async () => {
    // Pin SummaryCard.component.tsx:99 + NumberUtils.ts:17-19:
    // formatNumberWithComma — 1187 renders "1,187", 62.5% keeps "62.5%".
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets: [
          { count: 1000, day: DAY_7, group: 'table' },
          { count: 187, day: DAY_7, group: 'topic' },
        ],
      };
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="insights-summary-total"]').text()).toContain('1,187');
    expect(wrapper.get('[data-testid="insights-summary-description"]').text()).toContain('62.5%');
    expect(wrapper.get('[data-testid="insights-summary-owner"]').text()).toContain('75%');
  });

  it('formats chart dates as pin MMM dd / DATE_MED and suffixes only the percentage y-axes', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const charts = wrapper.findAllComponents({ name: 'VChart' });
    expect(charts).toHaveLength(6);
    // Pin order: total, description, owner, service description,
    // service owner, tier. Only the four percentage cards (middle four)
    // carry the '%' y-axis formatter (pin isPercentageSystemGraph).
    for (const [index, chart] of charts.entries()) {
      const option = chart.props('option') as Record<string, unknown>;
      const yAxis = option.yAxis as { axisLabel?: { formatter: (value: number) => string } };
      if (index === 0 || index === 5) {
        expect(yAxis).not.toHaveProperty('axisLabel');
      } else {
        expect(yAxis.axisLabel?.formatter(100)).toBe('100%');
        expect(yAxis.axisLabel?.formatter(80)).toBe('80%');
      }
      // Pin DataInsightChartCard.tsx:593-598: x-axis "Nov 19";
      // DataInsightChartUtils.tsx:104: tooltip header "Nov 22, 2026".
      const xAxis = option.xAxis as { axisLabel: { formatter: (value: string) => string } };
      expect(xAxis.axisLabel.formatter('2026-01-07')).toBe('Jan 7');
      const tooltip = option.tooltip as {
        formatter: (params: Array<Record<string, unknown>>) => string;
      };
      const html = tooltip.formatter([
        { axisValue: '2026-01-07', marker: '', seriesName: 'table', value: 150 },
      ]);
      expect(html).toContain('Jan 7, 2026');
      expect(html).not.toContain('2026-01-07');
      expect(html).toContain('150');
    }
  });

  it('renders six full-width cards in pin order, each with a hidden legend and a 500px line', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const cards = wrapper.findAll('[data-testid$="-card"]').map((el) => el.attributes('data-testid'));
    expect(cards).toEqual([
      'insights-total-card',
      'insights-asset-description-card',
      'insights-asset-owner-card',
      'insights-service-description-card',
      'insights-service-owner-card',
      'insights-tier-card',
    ]);
    const charts = wrapper.findAllComponents({ name: 'VChart' });
    expect(charts).toHaveLength(6);
    for (const chart of charts) {
      expect((chart.props('option') as Record<string, unknown>).legend).toEqual({ show: false });
      expect(chart.attributes('style')).toContain('height: 500px');
    }
  });

  it('drops the five pin-absent charts and the search-snapshot total (Bai 2026-11-25 ruling)', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain('Catalog assets in this search snapshot');
    for (const testId of [
      'insights-entity-chart',
      'insights-service-chart',
      'insights-tier-chart',
      'insights-test-chart',
      'insights-incident-chart',
    ]) {
      expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(false);
    }
    expect(wrapper.find('[data-testid="insights-pipeline-empty"]').exists()).toBe(false);
  });

  it('shows the service cards empty when the service charts return no points', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-description"]').exists()).toBe(false);
    // Pin R-P2-11: the empty state is pin's EmptyGraphPlaceholder wording,
    // not the old per-card copy.
    expect(wrapper.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(wrapper.text()).not.toContain('No service coverage data in the selected window.');
  });

  it('shows the total card empty until a job writes report data', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-total-empty"]').exists()).toBe(true);
    // Pin R-P2-11: the empty state is pin's EmptyGraphPlaceholder wording.
    expect(wrapper.text()).toContain('Adding a new Data Insight is easy, just give it a spin!');
    expect(wrapper.text()).not.toContain('No Data Insights series yet');
  });

  it('plots the total card line only when listChartData returns points', async () => {
    listSystemChartData.mockResolvedValue({
      total_data_assets: [{ count: 4, day: Date.UTC(2026, 0, 1), group: 'table' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-total-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-total"]').attributes('data-points')).toBe('1');
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

  it('defaults the chart window to the 7-day preset', async () => {
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
    // Pin R-P2-3 (DataInsightSummary.tsx:185-190): "{{organization}} Health at a Glance".
    expect(wrapper.get('[data-testid="insights-summary-title"]').text()).toContain(
      'Acme Org Health at a Glance',
    );
    // Total sums the latest per-group counts (150 + 150), not the stale day-1 point.
    expect(wrapper.get('[data-testid="insights-summary-total"]').text()).toContain('300');
    // Description/owner come from the summary cards (62.5% / 75%), NOT the
    // percentage series' latest point (42.5% / 80%) — the D-D-1 correction.
    expect(wrapper.get('[data-testid="insights-summary-description"]').text()).toContain('62.5%');
    expect(wrapper.get('[data-testid="insights-summary-owner"]').text()).toContain('75%');
    // Pin R-P2-2 (RIGHT_SIDE_PANEL_LABEL_CONFIG): headline labels are not
    // the card titles — "Completed Description %" / "Assigned Owner %".
    expect(wrapper.get('[data-testid="insights-asset-description-headline"]').text()).toContain(
      'Completed Description %',
    );
    expect(wrapper.get('[data-testid="insights-asset-owner-headline"]').text()).toContain(
      'Assigned Owner %',
    );
    const entityRows = wrapper.findAll('[data-testid="insights-total-row"]');
    expect(entityRows).toHaveLength(2);
    // Pin progress semantics: the bar is the raw latest value clamped
    // 0–100, not a share of the total — 150 clamps to a full bar.
    expect(entityRows[0].get('[data-testid="insights-total-row-name"]').text()).toContain('Table');
    expect(entityRows[0].get('[data-testid="insights-total-row-value"]').text()).toBe('150');
    expect(entityRows[0].find('.ant-progress-bg').attributes('style')).toContain('width: 100%');
    expect(entityRows[0].find('.ant-progress-text').exists()).toBe(false);
    const tierRows = wrapper.findAll('[data-testid="insights-tier-row"]');
    expect(tierRows).toHaveLength(2);
    // Pin DataInsightChartCard.tsx:717 renders the tier groups with
    // lodash startCase: `Tier.Gold` -> `Tier Gold`.
    expect(tierRows[0].get('[data-testid="insights-tier-row-name"]').text()).toContain('Tier Gold');
    expect(tierRows[1].get('[data-testid="insights-tier-row-name"]').text()).toContain('Tier Silver');
    expect(tierRows[0].get('[data-testid="insights-tier-row-value"]').text()).toBe('7');
    // Same pin bar semantics: 7 renders as a 7% bar, not 7/300.
    expect(tierRows[0].find('.ant-progress-bg').attributes('style')).toContain('width: 7%');
    expect(tierRows[0].find('.ant-progress-text').exists()).toBe(false);
  });

  // Pin DataInsightChartCard.tsx:717 renders tier group names through
  // startCase, so the untiered group displays as "No Tier". The stored
  // chart data has been seen both as the canonical `NoTier` (server
  // TierStep.java:48) and as lowercase `notier`; both spellings map to
  // the "No Tier" display name.
  it.each(['notier', 'NoTier'])('labels the untiered tier group %s as "No Tier"', async (group) => {
    const tierPayload = {
      ...systemPayload,
      total_data_assets_by_tier: [
        { count: 112, day: DAY_7, group },
        { count: 7, day: DAY_7, group: 'Tier.Gold' },
      ],
    };
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return tierPayload;
    });
    const wrapper = await mountView();
    const tierRows = wrapper.findAll('[data-testid="insights-tier-row"]');
    expect(tierRows).toHaveLength(2);
    expect(tierRows[0].get('[data-testid="insights-tier-row-name"]').text()).toBe('No Tier');
    expect(tierRows[0].get('[data-testid="insights-tier-row-value"]').text()).toBe('112');
    expect(tierRows[1].get('[data-testid="insights-tier-row-name"]').text()).toContain('Tier Gold');
    expect(wrapper.find('[data-testid="insights-tier"]').attributes('data-points')).toBe('1');
  });

  it('renders the untiered bucket as pin-verbatim "No Tier"', async () => {
    // Pin shows the NoTier group in the tier card rows as
    // startCase('NoTier') = `No Tier` (DataInsightChartCard.tsx:717;
    // the :147 exclusion covers only the change computation). The live
    // catalog reports the bucket lowercase (`notier`).
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets_by_tier: [
          ...systemPayload.total_data_assets_by_tier,
          { count: 5, day: DAY_7, group: 'notier' },
        ],
      };
    });
    const wrapper = await mountView();
    const tierRows = wrapper.findAll('[data-testid="insights-tier-row"]');
    expect(tierRows).toHaveLength(3);
    expect(tierRows[0].get('[data-testid="insights-tier-row-name"]').text()).toContain('Tier Gold');
    expect(tierRows[1].get('[data-testid="insights-tier-row-name"]').text()).toContain('No Tier');
    expect(tierRows[1].get('[data-testid="insights-tier-row-value"]').text()).toBe('5');
  });

  it('renders the total card change as a percent of the daily total (pin computeTotalDataAssetsChange)', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    // Daily totals 200 -> 300: +50.00%.
    expect(wrapper.get('[data-testid="insights-total-headline"]').text()).toContain('300');
    // Pin R-P2-2: headline label "Total Assets", not the card title.
    expect(wrapper.get('[data-testid="insights-total-headline"]').text()).toContain('Total Assets');
    expect(wrapper.get('[data-testid="insights-total-headline"]').text()).toContain(
      '+50.00% over the last 7 days',
    );
  });

  it('renders the tier card change on the tiered share only, excluding the untiered bucket (pin computeTotalDataAssetsByTierChange)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets_by_tier: [
          { count: 7, day: DAY_1, group: 'Tier.Gold' },
          { count: 193, day: DAY_1, group: 'notier' },
          { count: 7, day: DAY_7, group: 'Tier.Gold' },
          { count: 293, day: DAY_7, group: 'notier' },
        ],
      };
    });
    const wrapper = await mountView();
    // Tiered share: 7/200 = 3.50% -> 7/300 = 2.33%, change -1.17pp.
    expect(wrapper.get('[data-testid="insights-tier-headline"]').text()).toContain(
      '-1.17 pp over the last 7 days',
    );
    // Pin R-P2-2: tier headline label "Assigned Tier" (no % suffix — the
    // tier card is not a percentage graph in pin).
    expect(wrapper.get('[data-testid="insights-tier-headline"]').text()).toContain('Assigned Tier');
    const tierRows = wrapper.findAll('[data-testid="insights-tier-row"]');
    expect(tierRows).toHaveLength(2);
    expect(tierRows[0].get('[data-testid="insights-tier-row-name"]').text()).toBe('No Tier');
    expect(tierRows[0].get('[data-testid="insights-tier-row-value"]').text()).toBe('293');
  });

  it('scrolls to the chart when a summary card is clicked (pin DataInsightSummary onScrollToChart)', async () => {
    routeChartCalls();
    const wrapper = await mountView({ attach: true });
    try {
      const card = document.getElementById('total_data_assets');
      expect(card).not.toBeNull();
      const scrollIntoView = vi.fn();
      card!.scrollIntoView = (() => {
        scrollIntoView();
      }) as Element['scrollIntoView'];
      await wrapper.get('[data-testid="insights-summary-total"]').trigger('click');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
    }
  });

  it('links the description/owner cards out to Explore with pin filters', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const descriptionHref =
      wrapper.find('[data-testid="insights-asset-description-explore-link"]').attributes('href') ?? '';
    const descriptionFilter = decodeURIComponent(descriptionHref);
    expect(descriptionFilter).toContain('descriptionStatus');
    expect(descriptionFilter).toContain('INCOMPLETE');
    const ownerHref =
      wrapper.find('[data-testid="insights-asset-owner-explore-link"]').attributes('href') ?? '';
    const ownerFilter = decodeURIComponent(ownerHref);
    expect(ownerFilter).toContain('ownerDisplayName');
    expect(ownerFilter).toContain('is_null');
  });

  it('omits the summary description/owner cards when their summary cards have no value', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return {};
      }
      return systemPayload;
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="insights-summary-total"]').text()).toContain('300');
    expect(wrapper.find('[data-testid="insights-summary-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-summary-owner"]').exists()).toBe(false);
  });

  it('falls back to the brand name in the summary title when the Organization team is missing', async () => {
    getTeamByName.mockRejectedValue(new Error('not found'));
    const wrapper = await mountView();
    // Pin R-P2-3: "{{organization}} Health at a Glance", brand fallback
    // (product.name = "iSmart") when the Organization team is missing.
    expect(wrapper.get('[data-testid="insights-summary-title"]').text()).toContain(
      'iSmart Health at a Glance',
    );
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
    // Pin R-P2-2: service headline labels "Completed Description %" /
    // "Assigned Owner %", not the card titles.
    expect(wrapper.get('[data-testid="insights-service-description-headline"]').text()).toContain(
      'Completed Description %',
    );
    expect(wrapper.get('[data-testid="insights-service-owner-headline"]').text()).toContain(
      'Assigned Owner %',
    );
    expect(wrapper.text()).toContain('+15.00 pp over the last 7 days');
    expect(wrapper.text()).toContain('+30.00 pp over the last 7 days');
    // The KPI target renders as a marker on the headline bar, not as text.
    expect(wrapper.get('[data-testid="insights-service-description-target"]').text()).toBe('80%');
    expect(wrapper.get('[data-testid="insights-service-description-target"]').attributes('style')).toContain(
      'left: 80%',
    );
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Postgres');
    expect(rows[0]?.text()).toContain('80%');
    // Pin R-P2-7: service names go through lodash startCase, which splits
    // on the case transition — startCase('MySQL') = "My SQL" (cf.
    // text.test.ts: 'FOOBar' -> 'FOO Bar'), exactly as pin renders it.
    expect(rows[1]?.text()).toContain('My SQL');
    expect(rows[1]?.text()).toContain('60%');
  });

  // Pin R-P2-13 (DataInsightChartCard.tsx:457-476): the KPI target only
  // matches a KPI whose dataInsightChart name is the `_kpi` chart name.
  // A KPI stored under the bare percentage-chart name must not produce a
  // target — pin never matches the bare name.
  it('ignores a KPI stored under the bare percentage chart name (pin R-P2-13)', async () => {
    routeChartCalls();
    listKpis.mockResolvedValue({
      data: [
        {
          name: 'description-coverage',
          targetValue: 80,
          dataInsightChart: { name: 'percentage_of_data_asset_with_description', type: 'dataInsightChart' },
          owners: [],
        },
      ],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-description-target"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-asset-description-target"]').exists()).toBe(false);
  });

  // Pin R-P2-7 (DataInsightChartCard.tsx:717): entity row names are
  // startCase of the entity key. The product keeps its i18n display name
  // and only normalises the casing — "Stored procedure" -> "Stored
  // Procedure". Note `databaseSchema` stays "Schema": that is the i18n
  // label's wording (pin shows "Database Schema"), a content gap outside
  // this casing item, not something startCase can fix.
  it('renders entity row names through startCase (pin R-P2-7)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets: [
          { count: 150, day: DAY_7, group: 'table' },
          { count: 48, day: DAY_7, group: 'storedProcedure' },
          { count: 30, day: DAY_7, group: 'databaseSchema' },
        ],
        percentage_of_data_asset_with_description: [
          { count: 42.5, day: DAY_7, group: 'storedProcedure' },
        ],
      };
    });
    const wrapper = await mountView();
    const totalRows = wrapper.findAll('[data-testid="insights-total-row"]');
    expect(totalRows).toHaveLength(3);
    expect(totalRows[0]?.get('[data-testid="insights-total-row-name"]').text()).toBe('Table');
    expect(totalRows[1]?.get('[data-testid="insights-total-row-name"]').text()).toBe('Stored Procedure');
    expect(totalRows[2]?.get('[data-testid="insights-total-row-name"]').text()).toBe('Schema');
    const descriptionRows = wrapper.findAll('[data-testid="insights-asset-description-row"]');
    expect(descriptionRows).toHaveLength(1);
    expect(
      descriptionRows[0]?.get('[data-testid="insights-asset-description-row-name"]').text(),
    ).toBe('Stored Procedure');
  });

  // Pin R-P2-7: service rows are startCase of the raw service name.
  it('renders kebab-case service names through startCase (pin R-P2-7)', async () => {
    const kebabServicePayload = {
      ...servicePayload,
      percentage_of_service_with_description: [
        { count: 50, day: DAY_1, group: 'icrm-monorepo' },
        { count: 80, day: DAY_7, group: 'icrm-monorepo' },
        { count: 40, day: DAY_1, group: 'lineage-demo-airflow' },
        { count: 60, day: DAY_7, group: 'lineage-demo-airflow' },
      ],
    };
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return kebabServicePayload;
      }
      return systemPayload;
    });
    const wrapper = await mountView();
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.get('[data-testid="insights-service-description-row-name"]').text()).toBe(
      'Icrm Monorepo',
    );
    expect(rows[1]?.get('[data-testid="insights-service-description-row-name"]').text()).toBe(
      'Lineage Demo Airflow',
    );
  });

  // Pin R-P2-7, multilingual exception: startCase leaves CJK whole
  // (text.test.ts: '王小明' -> '王小明'), so Chinese row names stay
  // Chinese — the casing pass must never turn them into English.
  it('keeps Chinese entity row names Chinese under startCase (pin R-P2-7)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets: [
          { count: 150, day: DAY_7, group: 'table' },
          { count: 48, day: DAY_7, group: 'storedProcedure' },
        ],
      };
    });
    const wrapper = await mountView({ locale: 'zh-CN' });
    const totalRows = wrapper.findAll('[data-testid="insights-total-row"]');
    expect(totalRows).toHaveLength(2);
    expect(totalRows[1]?.get('[data-testid="insights-total-row-name"]').text()).toBe('存储过程');
  });

  it('shows a warning and error states, not empty states, when the service fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      listSystemChartData.mockImplementation(async (names: readonly string[]) => {
        if (names.includes('percentage_of_service_with_description')) {
          throw new Error('chart missing');
        }
        return systemPayload;
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
