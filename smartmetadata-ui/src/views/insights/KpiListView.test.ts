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
import KpiListView from './KpiListView.vue';

const listKpis = vi.fn();
const deleteKpi = vi.fn();
const confirmDelete = vi.fn();

vi.mock('@/api/kpi', () => ({
  listKpis: (...args: unknown[]) => listKpis(...args),
  deleteKpi: (...args: unknown[]) => deleteKpi(...args),
}));
vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: (...args: unknown[]) => confirmDelete(...args),
}));

const stub = { template: '<div />' };

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/kpis', name: 'insights-kpis', component: KpiListView },
      { path: '/insights/kpis/add', name: 'insights-kpis-add', component: stub },
      { path: '/insights/kpis/:fqn/edit', name: 'insights-kpis-edit', component: stub },
    ],
  });
  await router.push({ name: 'insights-kpis' });
  await router.isReady();
  const wrapper = mount(KpiListView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

const kpiRows = [
  {
    id: 'k1',
    name: 'description-coverage',
    displayName: 'Description coverage',
    description: 'Share of assets with a description',
    metricType: 'PERCENTAGE',
    targetValue: 80,
    startDate: 1704067200000,
    endDate: 1735689600000,
    dataInsightChart: { name: 'percentage_of_data_asset_with_description' },
    owners: [{ name: 'admin' }],
    kpiResult: {
      timestamp: 1704153600000,
      targetResult: [{ name: 'completedDescriptionFraction', value: '42', targetMet: false }],
    },
  },
  {
    id: 'k2',
    name: 'owner-coverage',
    displayName: 'Owner coverage',
    metricType: 'PERCENTAGE',
    targetValue: 60,
    owners: [],
    kpiResult: { targetResult: [{ name: 'b', value: '55', targetMet: true }] },
  },
];

describe('KpiListView', () => {
  beforeEach(() => {
    listKpis.mockReset();
    deleteKpi.mockReset();
    confirmDelete.mockReset();
    listKpis.mockResolvedValue({ data: [] });
    deleteKpi.mockResolvedValue({});
    confirmDelete.mockResolvedValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lists KPI rows from GET /v1/kpi and shows selected detail from that payload', async () => {
    listKpis.mockResolvedValue({ data: kpiRows });
    const { wrapper } = await mountView();
    expect(listKpis).toHaveBeenCalledWith({ limit: 50 });
    expect(wrapper.find('[data-testid="kpi-list-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kpi-detail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Description coverage');
    expect(wrapper.text()).toContain('80');
    expect(wrapper.text()).toContain('42');
    expect(wrapper.text()).toContain('percentage_of_data_asset_with_description');
    expect(wrapper.find('[data-testid="kpi-detail"]').text()).toContain('no');
  });

  it('selects another KPI row from the same GET payload', async () => {
    listKpis.mockResolvedValue({ data: kpiRows });
    const { wrapper } = await mountView();
    const selects = wrapper.findAll('[data-testid="kpi-select"]');
    expect(selects).toHaveLength(2);
    await selects[1]?.trigger('click');
    await flushPromises();
    const detail = wrapper.find('[data-testid="kpi-detail"]');
    expect(detail.text()).toContain('owner-coverage');
    expect(detail.text()).toContain('55');
    expect(detail.text()).toContain('yes');
  });

  it('shows an honest error when GET /v1/kpi fails and does not invent rows', async () => {
    listKpis.mockRejectedValue(new Error('kpi down'));
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('kpi down');
    expect(wrapper.find('[data-testid="kpi-list-table"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="kpi-select"]')).toHaveLength(0);
  });

  it('navigates to add and edit routes from the list', async () => {
    listKpis.mockResolvedValue({ data: kpiRows });
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="kpi-add"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('insights-kpis-add');
    await router.push({ name: 'insights-kpis' });
    await flushPromises();
    await wrapper.findAll('[data-testid="kpi-edit"]')[0]?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('insights-kpis-edit');
  });

  it('deletes through confirmDelete and reloads the list', async () => {
    listKpis.mockResolvedValue({ data: kpiRows });
    const { wrapper } = await mountView();
    await wrapper.findAll('[data-testid="kpi-delete"]')[0]?.trigger('click');
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    expect(deleteKpi).toHaveBeenCalledWith('k1', { hardDelete: true });
    expect(listKpis).toHaveBeenCalledTimes(2);
  });

  it('does not delete when the confirmation is declined', async () => {
    confirmDelete.mockResolvedValue(false);
    listKpis.mockResolvedValue({ data: kpiRows });
    const { wrapper } = await mountView();
    await wrapper.findAll('[data-testid="kpi-delete"]')[0]?.trigger('click');
    await flushPromises();
    expect(deleteKpi).not.toHaveBeenCalled();
  });
});
