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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { ChartRow } from '@/api/charts';
import DashboardChartsWidget from './DashboardChartsWidget.vue';

const { fetchChartsMock, updateChartMock, getEntityPermissionByIdMock } = vi.hoisted(() => ({
  fetchChartsMock: vi.fn(),
  updateChartMock: vi.fn(),
  getEntityPermissionByIdMock: vi.fn(),
}));

vi.mock('@/api/charts', () => ({
  fetchCharts: fetchChartsMock,
  updateChart: updateChartMock,
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: false,
    getResourcePermission: vi.fn(),
    getEntityPermissionById: getEntityPermissionByIdMock,
    getEntityPermissionByFqn: vi.fn(),
  }),
}));

const ROWS: ChartRow[] = [
  {
    id: 'ch1',
    name: 'sales',
    displayName: 'Sales',
    fullyQualifiedName: 'svc.dashboard.sales',
    chartType: 'Line',
    description: 'Sales over time',
    tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
  },
  {
    id: 'ch2',
    name: 'inventory',
    fullyQualifiedName: 'svc.dashboard.inventory',
    chartType: 'Bar',
    tags: [],
  },
];

const TAG_OPTIONS = [
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' as const },
  { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification' as const },
];

async function mountWidget(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } }],
  });
  await router.push('/asset/dashboard/svc.dashboard');
  await router.isReady();
  const wrapper = mount(DashboardChartsWidget, {
    props: {
      chartRefs: [{ id: 'ch1', name: 'sales' }, { id: 'ch2', name: 'inventory' }],
      dashboardFqn: 'svc.dashboard',
      tagOptions: TAG_OPTIONS,
      ...props,
    },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DashboardChartsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchChartsMock.mockResolvedValue(ROWS);
    updateChartMock.mockImplementation(async (id: string, patch: unknown[]) => {
      const row = ROWS.find((item) => item.id === id);
      return { ...row, _patch: patch } as unknown as ChartRow;
    });
    getEntityPermissionByIdMock.mockResolvedValue({ ViewBasic: true, EditDescription: true, EditAll: true });
  });

  it('fetches charts and evaluates permissions per chart', async () => {
    const { wrapper } = await mountWidget();
    expect(fetchChartsMock).toHaveBeenCalledWith(
      [{ id: 'ch1', name: 'sales' }, { id: 'ch2', name: 'inventory' }],
      false,
    );
    expect(getEntityPermissionByIdMock).toHaveBeenCalledWith('chart', 'ch1');
    expect(getEntityPermissionByIdMock).toHaveBeenCalledWith('chart', 'ch2');
    expect(wrapper.text()).toContain('Sales');
    expect(wrapper.text()).toContain('Line');
    expect(wrapper.text()).toContain('Sales over time');
    wrapper.unmount();
  });

  it('hides the description edit when the chart permission fetch fails (all-false fallback)', async () => {
    getEntityPermissionByIdMock.mockRejectedValue(new Error('denied'));
    const { wrapper } = await mountWidget();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Sales');
    wrapper.unmount();
  });

  it('hides the description edit on a deleted dashboard', async () => {
    const { wrapper } = await mountWidget({ deleted: true });
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the description modal with the chart name in the title', async () => {
    const { wrapper } = await mountWidget();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Edit Description for Sales');
    wrapper.unmount();
  });

  it('merges a tag change and patches only that chart', async () => {
    const { wrapper } = await mountWidget();
    const selects = wrapper.findAllComponents(Select);
    // First Select is the Classification tag editor of the first row.
    await selects[0]?.vm.$emit('change', ['PII.Email', 'PII.Phone']);
    await flushPromises();
    expect(updateChartMock).toHaveBeenCalledWith('ch1', [
      {
        op: 'replace',
        path: '/tags',
        value: [
          { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'PII.Phone', name: 'Phone', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ]);
    wrapper.unmount();
  });

  it('refetches with deleted included when the Deleted toggle flips', async () => {
    const { wrapper } = await mountWidget();
    const toggle = wrapper.find('[data-testid="show-deleted"]');
    await toggle.trigger('click');
    await flushPromises();
    expect(fetchChartsMock).toHaveBeenLastCalledWith(expect.anything(), true);
    wrapper.unmount();
  });
});
