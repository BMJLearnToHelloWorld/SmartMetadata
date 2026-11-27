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
import { createTestI18n } from '@/test/i18n';

vi.mock('@/features/crud/AssetProfilerPanel.vue', () => ({
  default: defineComponent({ name: 'AssetProfilerPanel', template: '<div data-testid="table-profile-stub" />' }),
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

import AssetDataObservabilityTab from './AssetDataObservabilityTab.vue';

describe('AssetDataObservabilityTab official profiler children', () => {
  it('renders official Table Profile, Column Profile, Data Quality, and Incidents sub-tabs', async () => {
    const wrapper = mount(AssetDataObservabilityTab, {
      props: {
        entityFqn: 'svc.db.schema.orders',
        tests: [],
        testsError: '',
        testStatusSeries: [],
        tableProfile: { columns: [] },
        rowCountSeries: [],
        usageSeries: [],
        columnNullSeries: [],
        entityType: 'table',
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    const tabs = wrapper.get('[data-testid="asset-data-observability-tabs"]');
    expect(tabs.text()).toContain('Table Profile');
    expect(tabs.text()).toContain('Column Profile');
    expect(tabs.text()).toContain('Data Quality');
    expect(tabs.text()).toContain('Incidents');
    wrapper.unmount();
  });
});
