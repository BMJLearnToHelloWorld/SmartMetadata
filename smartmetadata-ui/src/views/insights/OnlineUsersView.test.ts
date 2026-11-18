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
import OnlineUsersView from './OnlineUsersView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OnlineUsersView (pin OnlineUsersPage)', () => {
  const requestedUrls: string[] = [];
  const now = Date.now();

  const ONLINE_USER = {
    id: 'u1',
    name: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    isBot: false,
    lastLoginTime: now - 2 * 60 * 1000,
    lastActivityTime: now - 2 * 60 * 1000,
    teams: [],
    roles: [],
  };
  const IDLE_USER = {
    id: 'u2',
    name: 'bob',
    displayName: 'Bob',
    email: 'bob@example.com',
    isBot: false,
    lastLoginTime: now - 3 * 24 * 60 * 60 * 1000,
    lastActivityTime: now - 3 * 24 * 60 * 60 * 1000,
    teams: [],
    roles: [],
  };
  const NEVER_USER = {
    id: 'u3',
    name: 'carol',
    displayName: 'Carol',
    email: 'carol@example.com',
    isBot: false,
    teams: [],
    roles: [],
  };

  beforeEach(() => {
    localStorage.clear();
    requestedUrls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/api/v1/users/online')) {
          return jsonResponse({ data: [ONLINE_USER, IDLE_USER, NEVER_USER], paging: {} });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
        }
        if (url.includes('/api/v1/users/name/')) {
          return jsonResponse(ONLINE_USER);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountOnline(asAdmin = true) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = asAdmin
      ? { id: 'admin', name: 'admin', isAdmin: true }
      : { id: 'u9', name: 'mallory' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/insights/online-users', component: OnlineUsersView }],
    });
    await router.push('/insights/online-users');
    await router.isReady();
    const wrapper = mount(OnlineUsersView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    return wrapper;
  }

  it('shows a bare permission placeholder for non-admins (R-M3: no permissionValue)', async () => {
    const wrapper = await mountOnline(false);
    expect(wrapper.find('[data-testid="permission-placeholder"]').exists()).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/api/v1/users/online'))).toBe(false);
  });

  it('fetches with the pin field set and limit 15, no pager', async () => {
    const wrapper = await mountOnline(true);
    const call = requestedUrls.find((url) => url.includes('/api/v1/users/online'));
    expect(call).toBeDefined();
    expect(call).toContain('fields=profile%2Cteams%2Croles%2ClastLoginTime%2ClastActivityTime');
    expect(call).toContain('limit=15');
    expect(call).toContain('timeWindow=1440');
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(false);
  });

  it('renders the activity bands: online now, days ago, never', async () => {
    const wrapper = await mountOnline(true);
    const text = wrapper.text();
    expect(text).toContain('Online now');
    expect(text).toContain('3 days ago');
    expect(text).toContain('Never');
  });

  it('renders no row actions', async () => {
    const wrapper = await mountOnline(true);
    expect(wrapper.find('thead').text()).not.toContain('label.action-plural');
    expect(wrapper.findAll('button').some((b) => b.text().includes('label.delete'))).toBe(false);
  });

  it('offers the six pin time windows with 24h default', async () => {
    const wrapper = await mountOnline(true);
    const select = wrapper.find('[data-testid="online-users-window"]');
    expect(select.exists()).toBe(true);
    expect(select.text()).toContain('Last 24 hours');
  });
});
