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
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import DataAssetsView from './DataAssetsView.vue';

const listSystemChartData = vi.fn();
const getTeamByName = vi.fn();
const listTeams = vi.fn();
const listTags = vi.fn();
const listKpis = vi.fn();
const listKpiResults = vi.fn();
const getLatestKpiResult = vi.fn();
const getResourcePermission = vi.fn();
const fetchLoggedInUser = vi.fn();

vi.mock('@/api/dataInsights', async () => {
  const actual = await vi.importActual<typeof import('@/api/dataInsights')>('@/api/dataInsights');
  return {
    ...actual,
    listSystemChartData: (...args: unknown[]) => listSystemChartData(...args),
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
  listKpiResults: (...args: unknown[]) => listKpiResults(...args),
  getLatestKpiResult: (...args: unknown[]) => getLatestKpiResult(...args),
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

async function mountView(options: { attach?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/data-assets', name: 'insights-data-assets', component: DataAssetsView },
      { path: '/insights/kpis/add', name: 'insights-kpis-add', component: { template: '<div />' } },
      { path: '/explore', name: 'search', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'insights-data-assets' });
  await router.isReady();
  const wrapper = mount(DataAssetsView, {
    // The summary click-scrolls via document.getElementById, so only the
    // scroll test mounts attached to the document.
    attachTo: options.attach ? document.body : undefined,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('DataAssetsView', () => {
  beforeEach(() => {
    listSystemChartData.mockReset();
    getTeamByName.mockReset();
    getTeamByName.mockResolvedValue({ id: 'org', name: 'Organization', displayName: 'Acme Org' });
    listTeams.mockReset();
    listTeams.mockResolvedValue({ data: [] });
    listTags.mockReset();
    listTags.mockResolvedValue({ data: [] });
    listKpis.mockReset();
    listKpis.mockResolvedValue({ data: [] });
    listKpiResults.mockReset();
    listKpiResults.mockResolvedValue([]);
    getLatestKpiResult.mockReset();
    getLatestKpiResult.mockResolvedValue(undefined);
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

  it('renders six full-width cards in pin order, each with a hidden legend and a 500px line', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const cards = wrapper.findAll('[data-testid$="-card"]').map((el) => el.attributes('data-testid'));
    // The KPI section (pin id="kpi-charts") sits between the summary and
    // the six system cards; with no KPIs it renders no chart.
    expect(cards).toEqual([
      'insights-kpi-card',
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
    expect(wrapper.text()).toContain('No service coverage data in the selected window.');
  });

  it('shows the total card empty until a job writes report data', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-total-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No Data Insights series yet');
  });

  it('plots the total card line only when listChartData returns points', async () => {
    listSystemChartData.mockResolvedValue({
      total_data_assets: [{ count: 4, day: Date.UTC(2026, 0, 1), group: 'table' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-total-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-total"]').attributes('data-points')).toBe('1');
  });

  it('defaults the chart window to the 7-day preset', async () => {
    routeChartCalls();
    await mountView();
    expect(listSystemChartData).toHaveBeenCalledTimes(2);
    const [, startTs, endTs] = listSystemChartData.mock.calls[0] as [unknown, number, number];
    expect(endTs - startTs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('offers the pin date presets only (yesterday + 3/7/14/30/60 days + custom) and shows the selected range as text', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const selects = wrapper.findAllComponents(Select);
    const dateSelect = selects[2];
    expect(dateSelect?.exists()).toBe(true);
    const options = dateSelect?.props('options') as Array<{ value: string; label: string }>;
    expect(options.map((option) => option.value)).toEqual([
      'yesterday',
      'last3days',
      'last7days',
      'last14days',
      'last30days',
      'last60days',
      'customRange',
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'Yesterday',
      'Last 3 days',
      'Last 7 days',
      'Last 14 days',
      'Last 30 days',
      'Last 60 days',
      'Custom range',
    ]);
    // Pin DataInsightHeader.component.tsx:125-142: the selected range as
    // DATE_MED text beside the picker.
    expect(wrapper.get('[data-testid="insights-date-range"]').text()).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4} - [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
    expect(wrapper.find('[data-testid="insights-date-range-picker"]').exists()).toBe(false);
  });

  it('fetches a 1-day window for the Yesterday preset', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const dateSelect = wrapper.findAllComponents(Select)[2];
    listSystemChartData.mockClear();
    await dateSelect?.vm.$emit('change', 'yesterday');
    await flushPromises();
    expect(listSystemChartData).toHaveBeenCalled();
    const [, startTs, endTs] = listSystemChartData.mock.calls[0] as [unknown, number, number];
    expect(endTs - startTs).toBe(24 * 60 * 60 * 1000);
  });

  it('fetches the picked days for a custom range (pin DatePickerMenu custom range)', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    const dateSelect = wrapper.findAllComponents(Select)[2];
    await dateSelect?.vm.$emit('change', 'customRange');
    await flushPromises();
    // Picking the custom entry only opens the picker; nothing refetches
    // until a range is picked.
    expect(wrapper.find('[data-testid="insights-date-range-picker"]').exists()).toBe(true);
    const callsBefore = listSystemChartData.mock.calls.length;
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs(DAY_1), dayjs(DAY_7)]);
    await flushPromises();
    expect(listSystemChartData.mock.calls.length).toBeGreaterThan(callsBefore);
    const [, startTs, endTs] = listSystemChartData.mock.calls.at(-1) as [unknown, number, number];
    expect(startTs).toBe(dayjs(DAY_1).startOf('day').valueOf());
    expect(endTs).toBe(dayjs(DAY_7).endOf('day').valueOf());
    // The picked span is 7 days, so the change line still reports 7 days.
    expect(wrapper.get('[data-testid="insights-total-headline"]').text()).toContain('over the last 7 days');
  });

  it('colours the total-card lines by latest-value rank, not by first appearance (pin dataInsightColor)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      return {
        ...systemPayload,
        total_data_assets: [
          { count: 100, day: DAY_1, group: 'table' },
          { count: 50, day: DAY_1, group: 'topic' },
          { count: 60, day: DAY_7, group: 'table' },
          { count: 90, day: DAY_7, group: 'topic' },
        ],
      };
    });
    const wrapper = await mountView();
    // First appearance is [table, topic]; the latest values rank topic
    // (90) above table (60) — the lines must follow the rank.
    const chart = wrapper.findAllComponents({ name: 'VChart' })[0];
    const option = chart?.props('option') as Record<string, unknown>;
    const series = option.series as Array<{ name: string; lineStyle: { color: string } }>;
    expect(series.map((item) => item.name)).toEqual(['topic', 'table']);
    expect(series.map((item) => item.lineStyle.color)).toEqual([
      SM_DATA_INSIGHT_COLORS[0],
      SM_DATA_INSIGHT_COLORS[1],
    ]);
    const rows = wrapper.findAll('[data-testid="insights-total-row"]');
    expect(rows[0]?.get('[data-testid="insights-total-row-name"]').text()).toContain('Topic');
    expect(rows[0]?.get('[data-testid="insights-total-row-value"]').text()).toBe('90');
    expect(rows[1]?.get('[data-testid="insights-total-row-name"]').text()).toContain('Table');
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
    // Fourth summary card (pin ENTITIES_SUMMARY_LIST): the tier summary
    // card's latest value with a % suffix.
    expect(wrapper.get('[data-testid="insights-summary-tier"]').text()).toContain('20%');
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
  // TierStep.java:48) and as lowercase `notier`; load() normalises the
  // lowercase spelling to pin's `NoTier` at the boundary, so both spellings
  // map to the "No Tier" display name.
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
    // Tiered share: 7/200 = 3.50% -> 7/300 = 2.33%, change -1.17%.
    // Pin CustomStatistic always writes "%", even for pp changes.
    expect(wrapper.get('[data-testid="insights-tier-headline"]').text()).toContain(
      '-1.17% over the last 7 days',
    );
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
      card!.scrollIntoView = scrollIntoView as Element['scrollIntoView'];
      await wrapper.get('[data-testid="insights-summary-total"]').trigger('click');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // Pin DataInsightPage.component.tsx:90: centred, smooth — the card
      // clears the 64px sticky header instead of parking under it.
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
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
    expect(wrapper.text()).toContain('+15.00% over the last 7 days');
    expect(wrapper.text()).toContain('+30.00% over the last 7 days');
    // The KPI target renders as a marker on the headline bar, not as text.
    expect(wrapper.get('[data-testid="insights-service-description-target"]').text()).toBe('80%');
    expect(wrapper.get('[data-testid="insights-service-description-target"]').attributes('style')).toContain(
      'left: 80%',
    );
    const rows = wrapper.findAll('[data-testid="insights-service-description-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Postgres');
    expect(rows[0]?.text()).toContain('80%');
    expect(rows[1]?.text()).toContain('MySQL');
    expect(rows[1]?.text()).toContain('60%');
  });

  it('toasts and falls back to empty states, with no warning or card error state, when the service fetch fails (pin DataInsightChartCard fetchData)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        throw new Error('chart missing');
      }
      return systemPayload;
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-load-warning"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-system-load-warning"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-service-description-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-service-owner-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(true);
  });

  it('toasts and falls back to empty states, with no warning, when the system fetch fails (pin DataInsightChartCard fetchData)', async () => {
    listSystemChartData.mockImplementation(async (names: readonly string[]) => {
      if (names.includes('percentage_of_service_with_description')) {
        return servicePayload;
      }
      throw new Error('system charts missing');
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-system-load-warning"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-total-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-total-empty"]').exists()).toBe(true);
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

  it('renders the KPI section between the summary and the six cards and plots two lines (pin KPIChart)', async () => {
    routeChartCalls();
    listKpis.mockResolvedValue({
      data: [
        {
          name: 'Description_Coverage',
          displayName: 'Description Coverage',
          fullyQualifiedName: 'Description_Coverage',
          metricType: 'PERCENTAGE',
          targetValue: 80,
          startDate: DAY_1,
          endDate: Date.now() + 5 * 86_400_000,
          dataInsightChart: { name: 'percentage_of_data_asset_with_description_kpi', type: 'dataInsightChart' },
          owners: [],
        },
        {
          name: 'Owner_Coverage',
          displayName: 'Owner Coverage',
          fullyQualifiedName: 'Owner_Coverage',
          metricType: 'PERCENTAGE',
          targetValue: 70,
          startDate: DAY_1,
          endDate: Date.now() + 5 * 86_400_000,
          dataInsightChart: { name: 'percentage_of_data_asset_with_owner_kpi', type: 'dataInsightChart' },
          owners: [],
        },
      ],
    });
    listKpiResults.mockImplementation(async (name: string) => {
      if (name === 'Description_Coverage') {
        return [
          { count: 50, day: DAY_1 },
          { count: 60, day: DAY_7 },
        ];
      }
      return [
        { count: 40, day: DAY_1 },
        { count: 70, day: DAY_7 },
      ];
    });
    getLatestKpiResult.mockImplementation(async (name: string) => ({
      kpiFqn: name,
      timestamp: DAY_7,
      targetResult: [{ name: 'result', value: name === 'Description_Coverage' ? '60' : '70', targetMet: false }],
    }));
    const wrapper = await mountView();
    const kpiCard = wrapper.get('#kpi-charts');
    expect(kpiCard.text()).toContain('Key Performance Indicators');
    // Section order: summary, KPI chart, then the six system cards.
    const cards = wrapper.findAll('[data-testid$="-card"]').map((el) => el.attributes('data-testid'));
    expect(cards.indexOf('insights-kpi-card')).toBeLessThan(cards.indexOf('insights-total-card'));
    const charts = wrapper.findAllComponents({ name: 'VChart' });
    expect(charts).toHaveLength(7);
    const kpiChart = charts.find((chart) => {
      const option = chart.props('option') as Record<string, unknown>;
      const series = option.series as Array<{ name: string }>;
      return series.some((item) => item.name === 'Description_Coverage');
    });
    expect(kpiChart?.exists()).toBe(true);
    const kpiOption = kpiChart?.props('option') as Record<string, unknown>;
    const kpiSeries = kpiOption.series as Array<{ name: string }>;
    expect(kpiSeries.map((item) => item.name)).toEqual(['Description_Coverage', 'Owner_Coverage']);
    expect(wrapper.find('[data-testid="insights-kpi-latest-Description_Coverage"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-kpi-latest-Owner_Coverage"]').exists()).toBe(true);
  });

  it('shows the KPI no-data state with an Add KPI button when the catalog has no KPIs', async () => {
    routeChartCalls();
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-kpi-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No KPIs are available. Click on the Add KPI button to add one.');
    expect(wrapper.find('[data-testid="insights-kpi-add"]').exists()).toBe(true);
  });
});
