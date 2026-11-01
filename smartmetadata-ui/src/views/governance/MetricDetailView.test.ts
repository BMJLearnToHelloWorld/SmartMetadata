/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import MetricDetailView from './MetricDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/metrics/name/')) {
        return jsonResponse({
          id: 'm1',
          name: 'mau',
          displayName: 'Monthly Active Users',
          fullyQualifiedName: 'kpi.mau',
          description: 'Active users per month',
          metricType: 'NUMBER',
          unitOfMeasurement: 'users',
          granularity: 'MONTHLY',
          metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
          owners: [],
          tags: [],
          domains: [],
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
      { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
      { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: { template: '<div>versions</div>' } },
    ],
  });
  await router.push('/governance/metrics/kpi.mau');
  await router.isReady();
  const wrapper = mount(MetricDetailView, {
    props: { fqn: 'kpi.mau' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MetricDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders metric definition fields from the entity endpoint', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Monthly Active Users');
    expect(wrapper.text()).toContain('count(distinct user_id)');
    expect(wrapper.text()).toContain('NUMBER');
    expect(wrapper.text()).toContain('MONTHLY');
  });

  it('navigates to the Stage 2 version skeleton', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metric-versions"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset-version');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'metric', fqn: 'kpi.mau' });
  });
});
