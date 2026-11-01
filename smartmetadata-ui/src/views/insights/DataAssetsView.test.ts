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
import DataAssetsView from './DataAssetsView.vue';

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

  it('keeps the official service percentage cards as honest residuals, not invented values', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="insights-service-description-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="insights-service-owner-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('fabricated');
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

  it('defaults the pipeline window to the 30-day preset', async () => {
    await mountView();
    expect(listSystemChartData).toHaveBeenCalledTimes(1);
    const [, startTs, endTs] = listSystemChartData.mock.calls[0];
    expect(endTs - startTs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
