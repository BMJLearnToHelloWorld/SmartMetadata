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
import MetricsListView from './MetricsListView.vue';

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/metrics', name: 'governance-metrics', component: MetricsListView },
      { path: '/governance/metrics/:fqn', name: 'governance-metric', component: { template: '<div>metric</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'governance-metrics' });
  await router.isReady();
  const wrapper = mount(MetricsListView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MetricsListView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
  });

  afterEach(() => {
    searchAssets.mockReset();
  });

  it('lists metrics from catalog search and opens the metric detail page', async () => {
    searchAssets.mockResolvedValue({
      total: 1,
      hits: [
        {
          id: 'm1',
          name: 'mau',
          displayName: 'Monthly Active Users',
          fullyQualifiedName: 'kpi.mau',
          entityType: 'metric',
          owners: [],
          tags: [],
        },
      ],
      facets: [],
    });
    const { wrapper, router } = await mountView();
    expect(searchAssets).toHaveBeenCalled();
    const query = String(searchAssets.mock.calls[0]?.[0] ?? '');
    expect(query).toContain('entityType');
    expect(query).toContain('metric');
    expect(wrapper.text()).toContain('Monthly Active Users');
    await wrapper.get('[data-testid="metric-row-kpi.mau"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-metric');
    expect(router.currentRoute.value.params).toMatchObject({ fqn: 'kpi.mau' });
  });

  it('shows an honest empty when search returns no metrics', async () => {
    searchAssets.mockResolvedValue({ total: 0, hits: [], facets: [] });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/no metrics/i);
  });
});
