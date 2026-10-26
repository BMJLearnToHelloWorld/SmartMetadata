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
import EntityListShell from '@/features/crud/EntityListShell.vue';
import UsersListView from './UsersListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountUsers() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', name: 'admin-users', component: UsersListView },
      { path: '/admin/users/:id', name: 'admin-user', component: { template: '<div>user</div>' } },
    ],
  });
  await router.push('/admin/users');
  await router.isReady();
  const wrapper = mount(UsersListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('UsersListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/users?') || url.endsWith('/api/v1/users')) {
          return jsonResponse({
            data: [
              {
                id: 'u1',
                name: 'alice',
                displayName: 'Alice Admin',
                email: 'alice@example.com',
                isAdmin: true,
                teams: [{ id: 't1', name: 'Engineering', type: 'team' }],
                roles: [{ id: 'r1', name: 'Admin', type: 'role' }],
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [{ id: 't1', name: 'Engineering', teamType: 'Group' }], paging: {} });
        }
        if (url.includes('/api/v1/roles')) {
          return jsonResponse({ data: [{ id: 'r1', name: 'Admin' }], paging: {} });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.querySelectorAll('.ant-dropdown').forEach((node) => node.remove());
  });

  it('renders users from GET /v1/users', async () => {
    const { wrapper } = await mountUsers();
    expect(wrapper.text()).toContain('Alice Admin');
    expect(wrapper.text()).toContain('alice@example.com');
    expect(wrapper.find('[data-testid="admin-users-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-user"]').exists()).toBe(true);
  });

  it('opens user detail from the overflow menu', async () => {
    const { wrapper, router } = await mountUsers();
    await wrapper.get('[data-testid="row-overflow-u1"]').trigger('click');
    await flushPromises();
    const view = document.querySelector('[data-testid="row-overflow-view"]');
    expect(view?.textContent).toContain('View');
    expect(document.querySelector('[data-testid="row-overflow-edit"]')?.textContent).toContain('Edit');
    (view as HTMLElement | null)?.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-user');
    expect(router.currentRoute.value.params.id).toBe('u1');
  });

  it('opens user detail from the overflow Edit action', async () => {
    const { wrapper, router } = await mountUsers();
    await wrapper.get('[data-testid="row-overflow-u1"]').trigger('click');
    await flushPromises();
    const edits = document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-edit"]');
    edits[edits.length - 1]?.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-user');
    expect(router.currentRoute.value.params.id).toBe('u1');
  });

  it('opens user detail on name click', async () => {
    const { wrapper, router } = await mountUsers();
    const link = wrapper.find('[data-testid="user-row-u1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-user');
    expect(router.currentRoute.value.params.id).toBe('u1');
  });

  it('searches the user index instead of listing when a query is set', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 'u9',
                _source: {
                  id: 'u9',
                  name: 'search-hit',
                  displayName: 'Search Hit',
                  email: 'hit@example.com',
                  teams: [],
                  roles: [],
                },
              },
            ],
          },
        });
      }
      if (url.includes('/api/v1/users')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/api/v1/teams') || url.includes('/api/v1/roles')) {
        return jsonResponse({ data: [], paging: {} });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountUsers();
    const shell = wrapper.getComponent(EntityListShell);
    await shell.vm.$emit('update:searchValue', 'alice');
    await shell.vm.$emit('search');
    await flushPromises();
    const searchCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/search/query'));
    expect(searchCalls.some((url) => url.includes('index=user') && url.includes('q=alice'))).toBe(true);
  });

  it('requests the next cursor page from GET /v1/users', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/users')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            {
              id: after === 'c1' ? 'u2' : 'u1',
              name: after === 'c1' ? 'bob' : 'alice',
              displayName: after === 'c1' ? 'Bob' : 'Alice Admin',
              email: after === 'c1' ? 'bob@example.com' : 'alice@example.com',
              teams: [],
              roles: [],
            },
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      if (url.includes('/api/v1/teams')) {
        return jsonResponse({ data: [], paging: {} });
      }
      if (url.includes('/api/v1/roles')) {
        return jsonResponse({ data: [], paging: {} });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountUsers();
    expect(wrapper.text()).toContain('Alice Admin');
    expect(wrapper.find('[data-testid="entity-list-next"]').exists()).toBe(true);
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const userCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/users'));
    expect(userCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Bob');
  });
});
