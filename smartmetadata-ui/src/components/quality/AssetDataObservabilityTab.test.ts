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
import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getResourcePermission: vi.fn(async () => ({ Create: true })),
    isAdminUser: false,
  }),
}));

vi.mock('@/api/customMetrics', () => ({
  listTableCustomMetrics: vi.fn(async () => []),
}));

vi.mock('@/api/dataQualityReports', () => ({
  getDataQualityReport: vi.fn(async ({ q }: { q: string }) => {
    const parsed = JSON.parse(q) as {
      query: { bool: { must: Array<{ term?: { testCaseResolutionStatusType?: string } }> } };
    };
    const status = parsed.query.bool.must[0]?.term?.testCaseResolutionStatusType;
    return { data: [{ stateId: status === 'New' ? '5' : '2' }] };
  }),
}));

vi.mock('@/components/quality/TableProfilerChartPreview.vue', () => ({
  default: defineComponent({
    name: 'TableProfilerChartPreview',
    template: '<div data-testid="table-profiler-chart-container" />',
  }),
}));
vi.mock('@/components/quality/AssetDataQualityTab.vue', () => ({
  default: defineComponent({
    name: 'AssetDataQualityTab',
    template: '<div data-testid="asset-data-quality-tab" />',
  }),
}));
vi.mock('@/views/observability/IncidentsListView.vue', () => ({
  default: defineComponent({ name: 'IncidentsListView', template: '<div data-testid="asset-dq-incidents" />' }),
}));
vi.mock('@/components/quality/ColumnProfileTable.vue', () => ({
  default: defineComponent({
    name: 'ColumnProfileTable',
    template: '<div data-testid="column-profile-table-container" />',
  }),
}));
vi.mock('@/components/quality/CustomMetricFormDrawer.vue', () => ({
  default: defineComponent({ name: 'CustomMetricFormDrawer', template: '<div />' }),
}));
vi.mock('@/components/quality/TestCaseFormDrawer.vue', () => ({
  default: defineComponent({ name: 'TestCaseFormDrawer', template: '<div />' }),
}));
vi.mock('@/features/crud/ProfilerSettingsModal.vue', () => ({
  default: defineComponent({ name: 'ProfilerSettingsModal', template: '<div />' }),
}));

import AssetDataObservabilityTab from './AssetDataObservabilityTab.vue';

const baseProps = {
  entityFqn: 'svc.db.schema.orders',
  tests: [],
  testsError: '',
  testStatusSeries: [],
  tableProfile: { columns: [] },
  rowCountSeries: [],
  usageSeries: [],
  columnNullSeries: [],
  entityType: 'table',
  tableId: 'tbl-1',
};

async function mountTab(locale: 'en-US' | 'zh-CN' = 'en-US', query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:entityType/:fqn/:tab/:subTab?', component: { template: '<div />' } },
    ],
  });
  const subTab = query.subTab;
  const restQuery = { ...query };
  delete restQuery.subTab;
  delete restQuery.tab;
  const path = subTab
    ? '/table/svc.db.schema.orders/profiler/' + subTab
    : '/table/svc.db.schema.orders/profiler';
  await router.push({ path, query: restQuery });
  await router.isReady();
  const wrapper = mount(AssetDataObservabilityTab, {
    props: baseProps,
    global: { plugins: [Antd, router, createTestI18n(locale)] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('AssetDataObservabilityTab official profiler children', () => {
  it('renders official Table Profile, Column Profile, Data Quality, and Incidents sub-tabs', async () => {
    const { wrapper } = await mountTab();
    const tabs = wrapper.get('[data-testid="asset-data-observability-tabs"]');
    expect(tabs.text()).toContain('Table Profile');
    expect(tabs.text()).toContain('Column Profile');
    expect(tabs.text()).toContain('Data Quality');
    expect(tabs.text()).toContain('Incidents');
    expect(wrapper.find('[data-testid="table-profiler-chart-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-profile-table"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="profiler-tab-filters"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses official label.data-entity + label.quality for the Data Quality sub-tab (数据质控)', async () => {
    const { wrapper } = await mountTab('zh-CN');
    expect(wrapper.get('[data-testid="asset-data-observability-tabs"]').text()).toContain('数据质控');
    expect(wrapper.get('[data-testid="asset-data-observability-tabs"]').text()).not.toContain('数据质量');
    wrapper.unmount();
  });

  it('replaces sub-tabs with the official Column Profile back link when activeColumnFqn is set', async () => {
    const { wrapper } = await mountTab('en-US', { activeColumnFqn: 'svc.db.schema.orders.id' });
    expect(wrapper.find('[data-testid="asset-data-observability-tabs"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="profiler-back-to-column-profile"]').text()).toContain('Column Profile');
    expect(wrapper.get('[data-testid="column-picker-menu-button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the official Incidents sub-tab count badge as new minus resolved stateId cardinality', async () => {
    const { wrapper } = await mountTab();
    const badge = wrapper.get('[data-testid="count"]');
    expect(badge.text()).toBe('3');
    wrapper.unmount();
  });

  it('initializes the Data Quality sub-tab from the official path segment', async () => {
    const { wrapper, router } = await mountTab('en-US', { subTab: 'data-quality' });
    expect(router.currentRoute.value.params.subTab).toBe('data-quality');
    expect(wrapper.get('[data-testid="asset-data-quality-tab"]').isVisible()).toBe(true);
    wrapper.unmount();
  });

});
