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
import UsersListView from './UsersListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ALICE = {
  id: 'u1',
  name: 'alice',
  displayName: 'Alice Admin',
  email: 'alice@example.com',
  isAdmin: true,
  isBot: false,
  teams: [{ id: 't1', name: 'Engineering', type: 'team' }],
  roles: [{ id: 'r1', name: 'Admin', type: 'role' }],
};

const BOT = {
  id: 'u2',
  name: 'ingestion-bot',
  displayName: 'Ingestion Bot',
  email: 'bot@example.com',
  isAdmin: false,
  isBot: true,
  teams: [],
  roles: [],
};

describe('UsersListView (pin UserListPageV1)', () => {
  const requestedUrls: string[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;
  let listData: unknown[];
  // Item 11: the list stub's paging cursor; unset by default so the Next
  // button stays disabled exactly as with a single-page list.
  let pagingAfter: string | undefined;


  beforeEach(() => {
    localStorage.clear();
    requestedUrls.length = 0;
    listData = [ALICE];
    pagingAfter = undefined;
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/api/v1/users/name/')) {
        return jsonResponse(ALICE);
      }
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
      }
      if (url.includes('/api/v1/users/restore')) {
        return jsonResponse({});
      }
      if (url.includes('/api/v1/users')) {
        if ((init?.method ?? 'GET') === 'DELETE') {
          return jsonResponse({});
        }
        return jsonResponse({
          data: listData,
          paging: { total: listData.length, ...(pagingAfter ? { after: pagingAfter } : {}) },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mountUsers(asAdmin = true, initialPath = '/admin/users') {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = asAdmin
      ? { id: 'admin', name: 'admin', isAdmin: true }
      : { id: 'u9', name: 'bob' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/users', name: 'admin-users', component: UsersListView },
        { path: '/admin/users/admins', name: 'admin-admins', component: UsersListView },
        { path: '/create-user', name: 'create-user', component: { template: '<div>create</div>' } },
        { path: '/users/:username', name: 'user-detail', component: { template: '<div>user</div>' } },
        // Breadcrumb targets (RolesListView.test.ts precedent): the view
        // renders a real SmBreadcrumb whose RouterLinks resolve these names.
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
      ],
    });
    await router.push(initialPath);
    await router.isReady();
    const wrapper = mount(UsersListView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('lists with explicit isBot:false and the pin field set', async () => {
    const { wrapper } = await mountUsers();
    expect(wrapper.text()).toContain('Alice Admin');
    const listCall = requestedUrls.find((url) => url.startsWith('GET ') && url.includes('/api/v1/users?'));
    expect(listCall).toBeDefined();
    expect(listCall).toContain('isBot=false');
    expect(listCall).toContain('fields=profile%2Cteams%2Croles');
  });

  it('renders the pin column set without email/isAdmin/isBot columns (P4)', async () => {
    const { wrapper } = await mountUsers();
    const header = wrapper.find('thead').text();
    expect(header).toContain('Username');
    expect(header).toContain('Name');
    expect(header).not.toContain('Email');
    expect(header).not.toContain('Admin');
    expect(header).not.toContain('Bot');
    // No Bots checkbox and no three-state filter: no checkbox inputs.
    expect(wrapper.findAll('input[type="checkbox"]').length).toBe(0);
    expect(wrapper.find('[data-testid="show-deleted-toggle"]').exists()).toBe(true);
  });

  it('adds isAdmin=true on the Admins tab and drops the roles column', async () => {
    const { wrapper } = await mountUsers(true, '/admin/users/admins');
    const listCall = requestedUrls.find((url) => url.startsWith('GET ') && url.includes('/api/v1/users?'));
    expect(listCall).toContain('isAdmin=true');
    expect(wrapper.find('thead').text()).not.toContain('label.role-plural');
  });

  it('shows the Add button only for admins and navigates with route state', async () => {
    const { wrapper, router } = await mountUsers(true);
    const add = wrapper.find('[data-testid="add-user"]');
    expect(add.exists()).toBe(true);
    await add.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/create-user');
    expect(
      (router.options.history.state as { isAdminPage?: boolean } | null)?.isAdminPage,
    ).toBe(false);

    const nonAdmin = await mountUsers(false);
    expect(nonAdmin.wrapper.find('[data-testid="add-user"]').exists()).toBe(false);
  });

  it('debounces search and sends the isBot term in the query filter', async () => {
    const { wrapper } = await mountUsers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const input = wrapper.find('[data-testid="users-search"]');
    expect(input.exists()).toBe(true);
    await input.setValue('alice');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    const searchCall = requestedUrls.find((url) => url.includes('/api/v1/search/query'));
    expect(searchCall).toBeDefined();
    expect(searchCall).toContain('*alice*');
    expect(decodeURIComponent(searchCall ?? '')).toContain('"isBot":"false"');
  });

  it('shows the delete action and opens the delete modal', async () => {
    const { wrapper } = await mountUsers();
    const deleteButton = wrapper.find('[data-testid="delete-user-btn-alice"]');
    expect(deleteButton.exists()).toBe(true);
    await deleteButton.trigger('click');
    await flushPromises();
    // DeleteEntityModal teleports to the document body.
    expect(document.body.querySelector('.ant-modal')).not.toBeNull();
    document.body.querySelectorAll('.ant-modal-root').forEach((node) => node.remove());
  });

  it('renders the create placeholder for an empty list', async () => {
    listData = [];
    const { wrapper } = await mountUsers();
    const placeholder = wrapper.find('[data-testid="create-error-placeholder-User"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('User');
  });

  it('renders the bot indicator for bot rows', async () => {
    listData = [BOT];
    const { wrapper } = await mountUsers();
    expect(wrapper.find('[data-testid="bot-icon"]').exists()).toBe(true);
  });

  it('navigates to the user detail when the username is clicked', async () => {
    const { wrapper, router } = await mountUsers();
    const nameLink = wrapper.find('[data-testid="alice"]');
    expect(nameLink.exists()).toBe(true);
    await nameLink.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/users/alice');
  });

  it('requests the next cursor page when Next is clicked', async () => {
    pagingAfter = 'cursor-1';
    const { wrapper } = await mountUsers();
    const next = wrapper.find('[data-testid="next"]');
    expect(next.exists()).toBe(true);
    expect(next.attributes('disabled')).toBeUndefined();
    await next.trigger('click');
    await flushPromises();
    const pageCall = requestedUrls.find(
      (url) => url.startsWith('GET ') && url.includes('/api/v1/users?') && url.includes('after=cursor-1'),
    );
    expect(pageCall).toBeDefined();
  });

  it('sends the isAdmin term in the Admins-tab search filter (R-16)', async () => {
    const { wrapper } = await mountUsers(true, '/admin/users/admins');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const input = wrapper.find('[data-testid="users-search"]');
    expect(input.exists()).toBe(true);
    await input.setValue('alice');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    const searchCall = requestedUrls.find((url) => url.includes('/api/v1/search/query'));
    expect(searchCall).toBeDefined();
    expect(searchCall).toContain('*alice*');
    expect(decodeURIComponent(searchCall ?? '')).toContain('"isAdmin":"true"');
    expect(decodeURIComponent(searchCall ?? '')).toContain('"isBot":"false"');
  });
});
