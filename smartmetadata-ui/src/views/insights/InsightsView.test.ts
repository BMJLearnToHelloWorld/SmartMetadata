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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import InsightsView from './InsightsView.vue';

const searchAssets = vi.fn();
const listTestCases = vi.fn();
const listTestIncidents = vi.fn();
const listSystemChartData = vi.fn();

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
  };
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/insights', name: 'insights', component: InsightsView }],
  });
  await router.push({ name: 'insights' });
  await router.isReady();
  const wrapper = mount(InsightsView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('InsightsView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    listTestCases.mockReset();
    listTestIncidents.mockReset();
    listSystemChartData.mockReset();
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

  it('leaves pipeline, app analytics, and KPI tabs residual when series are empty', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-pipeline-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights pipeline');
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.map((tab) => tab.text())).toEqual(['Data assets', 'App analytics', 'KPIs']);
    await tabs[1]?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="insights-app-analytics-empty"]').exists()).toBe(true);
    await tabs[2]?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="insights-kpis-empty"]').exists()).toBe(true);
  });

  it('plots pipeline series only when listChartData returns points', async () => {
    listSystemChartData.mockResolvedValue({
      total_data_assets: [{ count: 4, day: Date.UTC(2026, 0, 1), group: 'table' }],
    });
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-pipeline-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="insights-pipeline-total_data_assets"]').attributes('data-points')).toBe('1');
  });
});
