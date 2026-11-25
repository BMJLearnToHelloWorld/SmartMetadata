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
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import SmChart from '@/features/charts/SmChart.vue';
import { createTestI18n } from '@/test/i18n';
import { SM_DATA_INSIGHT_COLORS } from '@/theme/tokens';
import type { Kpi } from '@/types/kpi';
import KpiChartCard from './KpiChartCard.vue';

const listKpiResults = vi.fn();
const getLatestKpiResult = vi.fn();

vi.mock('@/api/kpi', () => ({
  listKpiResults: (...args: unknown[]) => listKpiResults(...args),
  getLatestKpiResult: (...args: unknown[]) => getLatestKpiResult(...args),
}));

const DAY_1 = Date.UTC(2026, 0, 1);
const DAY_7 = Date.UTC(2026, 0, 7);

function kpiFixture(overrides: Partial<Kpi> & { name: string }): Kpi {
  return {
    displayName: overrides.name,
    fullyQualifiedName: overrides.name,
    metricType: 'PERCENTAGE',
    targetValue: 80,
    startDate: DAY_1,
    endDate: Date.now() + 5 * 86_400_000 + 43_200_000,
    dataInsightChart: { name: 'percentage_of_data_asset_with_description_kpi', type: 'dataInsightChart' },
    owners: [],
    ...overrides,
  };
}

const descriptionKpi = kpiFixture({ name: 'Description_Coverage', displayName: 'Description Coverage' });
const ownerKpi = kpiFixture({
  name: 'Owner_Coverage',
  displayName: 'Owner Coverage',
  targetValue: 70,
  dataInsightChart: { name: 'percentage_of_data_asset_with_owner_kpi', type: 'dataInsightChart' },
});

async function mountCard(kpis: Kpi[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/insights/kpis/add', name: 'insights-kpis-add', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'home' });
  await router.isReady();
  const wrapper = mount(KpiChartCard, {
    props: { kpis, startTs: DAY_1, endTs: DAY_7, loading: false },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('KpiChartCard', () => {
  beforeEach(() => {
    listKpiResults.mockReset();
    getLatestKpiResult.mockReset();
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
    getLatestKpiResult.mockImplementation(async (name: string) => {
      if (name === 'Description_Coverage') {
        return {
          kpiFqn: 'Description_Coverage',
          timestamp: DAY_7,
          targetResult: [{ name: 'result', value: '60', targetMet: false }],
        };
      }
      return {
        kpiFqn: 'Owner_Coverage',
        timestamp: DAY_7,
        targetResult: [{ name: 'result', value: '70', targetMet: true }],
      };
    });
  });

  it('plots one line per KPI in list order with palette-index colours (pin KPIChart series)', async () => {
    const { wrapper } = await mountCard([descriptionKpi, ownerKpi]);
    expect(wrapper.find('#kpi-charts').exists()).toBe(true);
    expect(wrapper.text()).toContain('Key Performance Indicators');
    expect(wrapper.text()).toContain(
      'Identify the Key Performance Indicators (KPI) that best reflect the health of your data assets.',
    );
    expect(listKpiResults).toHaveBeenCalledWith('Description_Coverage', { startTs: DAY_1, endTs: DAY_7 });
    expect(listKpiResults).toHaveBeenCalledWith('Owner_Coverage', { startTs: DAY_1, endTs: DAY_7 });
    expect(getLatestKpiResult).toHaveBeenCalledWith('Description_Coverage');
    expect(getLatestKpiResult).toHaveBeenCalledWith('Owner_Coverage');
    const chart = wrapper.findComponent({ name: 'VChart' });
    expect(chart.exists()).toBe(true);
    expect(chart.attributes('style')).toContain('height: 500px');
    const option = chart.props('option') as Record<string, unknown>;
    expect(option.legend).toEqual({ show: false });
    const series = option.series as Array<{ name: string; lineStyle: { color: string } }>;
    expect(series.map((item) => item.name)).toEqual(['Description_Coverage', 'Owner_Coverage']);
    expect(series.map((item) => item.lineStyle.color)).toEqual([
      SM_DATA_INSIGHT_COLORS[0],
      SM_DATA_INSIGHT_COLORS[1],
    ]);
    // Both KPIs are PERCENTAGE, so the shared tooltip formats with `%`.
    expect(wrapper.findComponent(SmChart).props('tooltipPercentage')).toBe(true);
  });

  it('renders the latest result per KPI with target, progress and days remaining (pin KPILatestResultsV1)', async () => {
    const { wrapper } = await mountCard([descriptionKpi, ownerKpi]);
    const description = wrapper.get('[data-testid="insights-kpi-latest-Description_Coverage"]');
    expect(description.text()).toContain('Description Coverage');
    expect(description.text()).toContain('60.00%');
    expect(description.text()).toContain('80.00%');
    // 60/80 = 75% progress.
    expect(description.find('.ant-progress-bg').attributes('style')).toContain('width: 75%');
    // Not met, five days left: the days badge, not the success mark.
    expect(description.text()).toContain('5');
    expect(description.text()).toContain('days left');
    expect(description.find('[data-testid="insights-kpi-success"]').exists()).toBe(false);
    const owner = wrapper.get('[data-testid="insights-kpi-latest-Owner_Coverage"]');
    expect(owner.text()).toContain('Owner Coverage');
    expect(owner.text()).toContain('70.00%');
    expect(owner.find('.ant-progress-bg').attributes('style')).toContain('width: 100%');
    expect(owner.find('[data-testid="insights-kpi-success"]').exists()).toBe(true);
  });

  it('shows the no-KPI empty state with an Add KPI button that opens the existing add page', async () => {
    const { wrapper, router } = await mountCard([]);
    expect(wrapper.find('[data-testid="insights-kpi-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No KPIs are available. Click on the Add KPI button to add one.');
    expect(wrapper.findComponent({ name: 'VChart' }).exists()).toBe(false);
    await wrapper.get('[data-testid="insights-kpi-add"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('insights-kpis-add');
  });

  it('shows the no-results empty state when KPIs exist but no points fall in the window', async () => {
    listKpiResults.mockResolvedValue([]);
    getLatestKpiResult.mockResolvedValue(undefined);
    const { wrapper } = await mountCard([descriptionKpi]);
    expect(wrapper.find('[data-testid="insights-kpi-no-results"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No KPI results in the selected range.');
    expect(wrapper.findComponent({ name: 'VChart' }).exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-kpi-latest"]').exists()).toBe(false);
  });

  it('drops a failed KPI silently and still plots the rest (pin Promise.allSettled)', async () => {
    listKpiResults.mockImplementation(async (name: string) => {
      if (name === 'Owner_Coverage') {
        throw new Error('kpi result missing');
      }
      return [{ count: 60, day: DAY_7 }];
    });
    getLatestKpiResult.mockImplementation(async (name: string) => {
      if (name === 'Owner_Coverage') {
        throw new Error('latest missing');
      }
      return {
        kpiFqn: 'Description_Coverage',
        timestamp: DAY_7,
        targetResult: [{ name: 'result', value: '60', targetMet: false }],
      };
    });
    const { wrapper } = await mountCard([descriptionKpi, ownerKpi]);
    const chart = wrapper.findComponent({ name: 'VChart' });
    const option = chart.props('option') as Record<string, unknown>;
    const series = option.series as Array<{ name: string }>;
    expect(series.map((item) => item.name)).toEqual(['Description_Coverage']);
    expect(wrapper.find('[data-testid="insights-kpi-latest-Owner_Coverage"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-kpi-latest-Description_Coverage"]').exists()).toBe(true);
  });

  it('does not suffix the tooltip with % when a plotted KPI is not a percentage', async () => {
    const numberKpi = kpiFixture({
      name: 'Description_Count',
      displayName: 'Description Count',
      metricType: 'NUMBER',
      targetValue: 100,
      dataInsightChart: { name: 'number_of_data_asset_with_description_kpi', type: 'dataInsightChart' },
    });
    listKpiResults.mockResolvedValue([{ count: 42, day: DAY_7 }]);
    getLatestKpiResult.mockResolvedValue({
      kpiFqn: 'Description_Count',
      timestamp: DAY_7,
      targetResult: [{ name: 'result', value: '42', targetMet: false }],
    });
    const { wrapper } = await mountCard([descriptionKpi, numberKpi]);
    // Mixed metric types: pin formats per series, the product chart has
    // one whole-chart switch, so it stays off rather than mislabelling.
    expect(wrapper.findComponent(SmChart).props('tooltipPercentage')).toBe(false);
    const item = wrapper.get('[data-testid="insights-kpi-latest-Description_Count"]');
    expect(item.text()).toContain('42');
    expect(item.text()).not.toContain('%');
  });

  it('shows the loading state while the KPI list loads', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    });
    await router.push({ name: 'home' });
    await router.isReady();
    const wrapper = mount(KpiChartCard, {
      props: { kpis: [], startTs: DAY_1, endTs: DAY_7, loading: true },
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="insights-kpi-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-kpi-empty"]').exists()).toBe(false);
  });
});
