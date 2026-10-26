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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import MyDataView from './MyDataView.vue';

const searchAssets = vi.fn();
const listActivityEvents = vi.fn();
const listKpis = vi.fn();
const listDomains = vi.fn();
const listSystemChartData = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));
vi.mock('@/api/activity', () => ({
  listActivityEvents: (...args: unknown[]) => listActivityEvents(...args),
}));
vi.mock('@/api/kpi', () => ({
  listKpis: (...args: unknown[]) => listKpis(...args),
}));
vi.mock('@/api/domains', () => ({
  listDomains: (...args: unknown[]) => listDomains(...args),
}));
vi.mock('@/api/dataInsights', () => ({
  listSystemChartData: (...args: unknown[]) => listSystemChartData(...args),
}));

const emptySearch = { total: 0, hits: [], facets: [] };

function hit(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    fullyQualifiedName: `svc.db.schema.${name}`,
    entityType: 'table',
    owners: [],
    tags: [],
    ...extra,
  };
}

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'u-1', name: 'admin', displayName: 'admin' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: MyDataView },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/insights', name: 'insights', component: { template: '<div>insights</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'home' });
  await router.isReady();
  const wrapper = mount(MyDataView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

function setSelect(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], testId: string, value: unknown) {
  const select = wrapper.findComponent(`[data-testid="${testId}"]`);
  select.vm.$emit('change', value);
  select.vm.$emit('update:value', value);
}

describe('MyDataView', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    listActivityEvents.mockReset();
    listKpis.mockReset();
    listDomains.mockReset();
    listSystemChartData.mockReset();
    listActivityEvents.mockResolvedValue({ data: [] });
    listKpis.mockResolvedValue({ data: [] });
    listDomains.mockResolvedValue({ data: [{ name: 'finance', displayName: 'Finance' }] });
    listSystemChartData.mockResolvedValue({});
    searchAssets.mockImplementation((query: string) => {
      if (String(query).includes('owners.id')) {
        return Promise.resolve({
          total: 2,
          hits: [hit('zeta', { updatedAt: 9 }), hit('alpha', { updatedAt: 1 })],
          facets: [],
        });
      }
      if (String(query).includes('followers:')) {
        return Promise.resolve({
          total: 1,
          hits: [hit('watched')],
          facets: [],
        });
      }
      return Promise.resolve({
        total: 22686,
        hits: [],
        facets: [
          {
            id: 'serviceType',
            field: 'serviceType',
            buckets: [
              { key: 'Mysql', count: 10 },
              { key: 'Postgres', count: 100 },
            ],
          },
          { id: 'service', field: 'service.displayName.keyword', buckets: [{ key: 'try_min2', count: 3 }] },
          { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 22686 }] },
        ],
      });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the OM landing hero and widget grid without topics chrome', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.get('[data-testid="home-hero-welcome"]').text()).toBe('Welcome, admin!');
    expect(wrapper.get('[data-testid="home-widget-activity"]').text()).toContain('Activity Feed');
    expect(wrapper.get('[data-testid="home-widget-data-assets"]').text()).toContain('Data Assets');
    expect(wrapper.get('[data-testid="home-widget-context"]').text()).toContain('Context Center');
    expect(wrapper.get('[data-testid="home-widget-my-data"]').text()).toContain('My Data');
    expect(wrapper.get('[data-testid="home-widget-kpi"]').text()).toContain('KPI');
    expect(wrapper.get('[data-testid="home-widget-total"]').text()).toContain('Total Data Assets');
    expect(wrapper.get('[data-testid="home-widget-following"]').text()).toContain('Following Assets');
    expect(wrapper.text()).not.toContain('Topics to catch up');
    expect(wrapper.find('[data-testid="home-context-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="home-total-count"]').text()).toContain('22,686');
  });

  it('shows empty-state CTAs when activity, KPI, and following have no rows', async () => {
    searchAssets.mockImplementation((query: string) => {
      if (String(query).includes('followers:')) {
        return Promise.resolve(emptySearch);
      }
      if (String(query).includes('owners.id')) {
        return Promise.resolve(emptySearch);
      }
      return Promise.resolve({
        total: 0,
        hits: [],
        facets: [{ id: 'serviceType', field: 'serviceType', buckets: [] }],
      });
    });
    const { wrapper } = await mountPage();
    expect(wrapper.get('[data-testid="home-activity-empty"]').text()).toContain('No Recent Activity');
    expect(wrapper.get('[data-testid="home-kpi-empty"]').text()).toContain('Start Tracking What Matters');
    expect(wrapper.get('[data-testid="home-following-empty"]').text()).toContain('Find Assets to Follow');
  });

  it('submits hero search and domain scope to Explore', async () => {
    const { wrapper, router } = await mountPage();
    setSelect(wrapper, 'home-hero-domain', 'Finance');
    await flushPromises();
    const input = wrapper.get('[data-testid="home-hero-search"]');
    await input.setValue('orders');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
    expect(router.currentRoute.value.query).toMatchObject({ q: 'orders', domain: 'Finance' });
  });

  it('navigates Explore Assets, service tiles, owned rows, and KPI setup', async () => {
    const { wrapper, router } = await mountPage();
    await wrapper.get('[data-testid="home-explore-assets"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');

    await router.push({ name: 'home' });
    await flushPromises();
    await wrapper.get('[data-testid="home-service-Postgres"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ serviceType: 'Postgres' });

    await router.push({ name: 'home' });
    await flushPromises();
    await wrapper.get('[data-testid="home-hero-chip-try_min2"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ service: 'try_min2' });

    await router.push({ name: 'home' });
    await flushPromises();
    await wrapper.get('[data-testid="home-owned-alpha"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'table', fqn: 'svc.db.schema.alpha' });

    await router.push({ name: 'home' });
    await flushPromises();
    searchAssets.mockImplementation(() => Promise.resolve(emptySearch));
    listKpis.mockResolvedValue({ data: [] });
    await wrapper.unmount();
    const again = await mountPage();
    await again.wrapper.get('[data-testid="home-setup-kpi"]').trigger('click');
    await flushPromises();
    expect(again.router.currentRoute.value).toMatchObject({ name: 'insights', query: { tab: 'kpis' } });
  });

  it('opens View more into owned/followed search queries and sorts lists client-side', async () => {
    const { wrapper, router } = await mountPage();
    const ownedNames = () =>
      wrapper.findAll('[data-testid="home-owned-list"] [data-testid^="home-owned-"]').map((node) => node.text());
    expect(ownedNames()[0]).toContain('zeta');
    setSelect(wrapper, 'home-owned-sort', 'name');
    await flushPromises();
    expect(ownedNames()[0]).toContain('alpha');
    setSelect(wrapper, 'home-owned-sort', 'latest');
    await flushPromises();
    expect(ownedNames()[0]).toContain('zeta');

    const serviceOrder = () => wrapper.findAll('[data-testid^="home-service-"]').map((node) => node.attributes('data-testid'));
    expect(serviceOrder()[0]).toBe('home-service-Postgres');
    setSelect(wrapper, 'home-data-assets-sort', 'low');
    await flushPromises();
    expect(serviceOrder()[0]).toBe('home-service-Mysql');

    await wrapper.get('[data-testid="home-owned-more"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe('owners.id:"u-1"');

    await router.push({ name: 'home' });
    await flushPromises();
    await wrapper.get('[data-testid="home-followed-more"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe('followers:"u-1"');
  });

  it('reloads the total-assets chart when the range control changes', async () => {
    const { wrapper } = await mountPage();
    expect(listSystemChartData).toHaveBeenCalledWith(['total_data_assets'], expect.any(Number), expect.any(Number));
    const firstEnd = listSystemChartData.mock.calls[0]?.[2] as number;
    const firstStart = listSystemChartData.mock.calls[0]?.[1] as number;
    expect(firstEnd - firstStart).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    setSelect(wrapper, 'home-total-range', 30);
    await flushPromises();
    const secondStart = listSystemChartData.mock.calls.at(-1)?.[1] as number;
    const secondEnd = listSystemChartData.mock.calls.at(-1)?.[2] as number;
    expect(secondEnd - secondStart).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
  });
});
