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
import { persistSession } from '@/auth/token';
import { createTestI18n } from '@/test/i18n';
import CustomMetricGraphs from './CustomMetricGraphs.vue';

vi.mock('@/features/charts/SmChart.vue', () => ({
  default: {
    props: ['kind', 'series', 'empty', 'height', 'testId'],
    template: '<div :data-testid="testId || \'sm-chart-stub\'"></div>',
  },
}));

describe('CustomMetricGraphs official overflow', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const series = [{ name: 'row_ratio', points: [{ label: '1', value: 1 }] }];
  const customMetrics = [{ name: 'row_ratio', expression: 'SELECT 1' }];

  it('hides the overflow when permissions are undefined (official read-only preview)', async () => {
    const wrapper = mount(CustomMetricGraphs, {
      props: { series, customMetrics, emptyText: 'empty' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="row_ratio-custom-metrics-menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows official edit/delete overflow when EditDataProfile or Delete is granted', async () => {
    const wrapper = mount(CustomMetricGraphs, {
      props: {
        series,
        customMetrics,
        emptyText: 'empty',
        tableId: 'tbl-1',
        permissions: { EditDataProfile: true, Delete: true },
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="row_ratio-custom-metrics-menu"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
