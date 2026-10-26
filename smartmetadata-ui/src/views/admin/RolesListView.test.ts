/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { createTestI18n } from '@/test/i18n';
import RolesListView from './RolesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountRoles() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', name: 'admin-roles', component: RolesListView },
      { path: '/admin/roles/:id', name: 'admin-role', component: { template: '<div>role</div>' } },
    ],
  });
  await router.push('/admin/roles');
  await router.isReady();
  const wrapper = mount(RolesListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('RolesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/roles/search')) {
          return jsonResponse({
            data: [{ id: 'r9', name: 'search-hit', displayName: 'Search Hit', policies: [], users: [], teams: [] }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/roles')) {
          return jsonResponse({
            data: [
              {
                id: 'r1',
                name: 'DataSteward',
                displayName: 'Data Steward',
                policies: [{ id: 'p1', name: 'DataConsumerPolicy' }],
                users: [{ id: 'u1', name: 'alice' }],
                teams: [],
              },
            ],
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

  it('renders roles from GET /v1/roles', async () => {
    const { wrapper } = await mountRoles();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Steward');
    expect(wrapper.find('[data-testid="admin-roles-table"]').exists()).toBe(true);
  });

  it('opens role detail on name click', async () => {
    const { wrapper, router } = await mountRoles();
    const link = wrapper.find('[data-testid="role-row-r1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-role');
    expect(router.currentRoute.value.params.id).toBe('r1');
  });

  it('searches GET /v1/roles/search when a query is set', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/roles/search')) {
        return jsonResponse({
          data: [{ id: 'r9', name: 'search-hit', displayName: 'Search Hit', policies: [], users: [], teams: [] }],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/roles')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountRoles();
    const shell = wrapper.getComponent(EntityListShell);
    await shell.vm.$emit('update:searchValue', 'steward');
    await shell.vm.$emit('search');
    await flushPromises();
    const searchCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/roles/search'));
    expect(searchCalls.some((url) => url.includes('q=steward'))).toBe(true);
    expect(wrapper.text()).toContain('Search Hit');
  });

  it('requests the next cursor page from GET /v1/roles', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/roles/search')) {
        return jsonResponse({ data: [], paging: {} });
      }
      if (url.includes('/api/v1/roles')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            {
              id: after === 'c1' ? 'r2' : 'r1',
              name: after === 'c1' ? 'Analyst' : 'DataSteward',
              displayName: after === 'c1' ? 'Analyst' : 'Data Steward',
              policies: [],
              users: [],
              teams: [],
            },
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountRoles();
    expect(wrapper.text()).toContain('Data Steward');
    expect(wrapper.find('[data-testid="entity-list-next"]').exists()).toBe(true);
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const roleCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/roles') && !url.includes('/search'));
    expect(roleCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Analyst');
  });
});
