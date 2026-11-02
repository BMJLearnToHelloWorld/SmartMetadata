/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import KpiDetailView from './KpiDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('KpiDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/kpi/MyKpi/kpiResult')) {
          return jsonResponse({ results: [{ day: 1700000000, count: 42, group: 'g1' }] });
        }
        if (url.includes('/api/v1/kpi/MyKpi/latestKpiResult')) {
          return jsonResponse({
            targetResult: [{ value: 40, targetMet: false }],
          });
        }
        if (url.includes('/api/v1/kpi/name/MyKpi')) {
          return jsonResponse({
            id: 'k1',
            name: 'MyKpi',
            fullyQualifiedName: 'MyKpi',
            displayName: 'My KPI',
            description: 'Track this',
            metricType: 'NUMBER',
            targetValue: 100,
            startDate: 1699000000,
            endDate: 1702000000,
            dataInsightChart: { name: 'chart1', displayName: 'Chart One' },
            owners: [{ name: 'alice', type: 'user' }],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the KPI definition and a history chart with points', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/insights/kpis', name: 'insights-kpis', component: { template: '<div>list</div>' } },
        { path: '/insights/kpis/:fqn', name: 'insights-kpi-detail', component: KpiDetailView, props: true },
        {
          path: '/insights/kpis/:fqn/edit',
          name: 'insights-kpis-edit',
          component: { template: '<div>edit</div>' },
        },
      ],
    });
    await router.push('/insights/kpis/MyKpi');
    await router.isReady();
    const wrapper = mount(KpiDetailView, {
      props: { fqn: 'MyKpi' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="kpi-detail-header"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('My KPI');
    expect(wrapper.text()).toContain('Chart One');
    const chart = wrapper.find('[data-testid="kpi-history-chart"]');
    expect(chart.exists()).toBe(true);
    expect(chart.attributes('data-points')).toBe('1');
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('/api/v1/kpi/MyKpi/kpiResult'))).toBe(true);
  });
});
