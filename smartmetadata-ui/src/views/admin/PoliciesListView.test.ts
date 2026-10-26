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
import PoliciesListView from './PoliciesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function policyRow(id: string, name: string, displayName: string) {
  return {
    id,
    name,
    displayName,
    enabled: true,
    owners: [],
    roles: [{ id: 'r1', name: 'DataConsumer' }],
    teams: [],
    rules: [{ name: `${name}-Rule`, effect: 'allow', operations: ['ViewAll'], resources: ['all'] }],
  };
}

async function mountPolicies() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/policies', name: 'admin-policies', component: PoliciesListView },
      { path: '/admin/policies/:id', name: 'admin-policy', component: { template: '<div>policy</div>' } },
    ],
  });
  await router.push('/admin/policies');
  await router.isReady();
  const wrapper = mount(PoliciesListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PoliciesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/policies')) {
          return jsonResponse({
            data: [policyRow('p1', 'DataConsumerPolicy', 'Data Consumer')],
            paging: { total: 1 },
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

  it('renders policies from GET /v1/policies and stays empty without demo rows', async () => {
    const { wrapper } = await mountPolicies();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.find('[data-testid="admin-policies-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-list-search"]').exists()).toBe(false);
  });

  it('shows Empty when GET /v1/policies returns no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountPolicies();
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-policies-table"]').exists()).toBe(false);
  });

  it('opens policy detail on name click', async () => {
    const { wrapper, router } = await mountPolicies();
    const link = wrapper.find('[data-testid="policy-row-p1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy');
    expect(router.currentRoute.value.params.id).toBe('p1');
  });

  it('requests the next cursor page from GET /v1/policies', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/policies')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            after === 'c1'
              ? policyRow('p2', 'OrganizationPolicy', 'Organization')
              : policyRow('p1', 'DataConsumerPolicy', 'Data Consumer'),
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountPolicies();
    expect(wrapper.text()).toContain('Data Consumer');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const policyCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/policies'));
    expect(policyCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Organization');
  });
});
