/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import LineageHomeView from './LineageHomeView.vue';

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

const HIT: SearchHit = {
  name: 'orders',
  displayName: 'Orders',
  fullyQualifiedName: 'svc.db.schema.orders',
  entityType: 'table',
  owners: [],
  tags: [],
};

async function mountHome() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lineage', name: 'lineage-home', component: LineageHomeView },
      { path: '/lineage/:entityType/:fqn', name: 'lineage', component: { template: '<div>graph</div>' } },
    ],
  });
  await router.push({ name: 'lineage-home' });
  await router.isReady();
  const wrapper = mount(LineageHomeView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  return { wrapper, router };
}

describe('LineageHomeView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    searchAssets.mockResolvedValue({ total: 1, hits: [HIT], facets: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the lineage route for the typed table FQN', async () => {
    const { wrapper, router } = await mountHome();
    const fqn = wrapper.get('[data-testid="lineage-home-fqn"]');
    await fqn.setValue('svc.db.schema.orders');
    const input = fqn.find('input');
    if (input.exists()) {
      await input.setValue('svc.db.schema.orders');
    }
    await wrapper.get('[data-testid="lineage-home-open"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('lineage');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('opens the graph from a catalog search hit instead of only the FQN form', async () => {
    vi.useFakeTimers();
    const { wrapper, router } = await mountHome();
    expect(wrapper.find('[data-testid="lineage-home-canvas"]').exists()).toBe(true);
    const input = wrapper.get('[data-testid="lineage-entity-search-input"]');
    await input.setValue('orders');
    const native = input.find('input');
    if (native.exists()) {
      await native.setValue('orders');
      await native.trigger('input');
    }
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('lineage');
    expect(router.currentRoute.value.params).toEqual({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });
});
