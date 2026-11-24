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
import UserDetailView from './UserDetailView.vue';

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
  fullyQualifiedName: 'alice',
  email: 'alice@example.com',
  isAdmin: true,
  isBot: false,
  teams: [{ id: 't1', name: 'Engineering', type: 'team' }],
  roles: [{ id: 'r1', name: 'DataSteward', type: 'role' }],
  personas: [],
  domains: [],
};

describe('UserDetailView (pin UserPage)', () => {
  const requestedUrls: string[] = [];
  let userFixture: Record<string, unknown> | null = ALICE;
  let disabledFields: string[] = [];

  beforeEach(() => {
    localStorage.clear();
    requestedUrls.length = 0;
    userFixture = ALICE;
    disabledFields = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/api/v1/users/name/')) {
          if (!userFixture) {
            return new Response('not found', { status: 404 });
          }
          return jsonResponse(userFixture);
        }
        if (url.includes('/api/v1/system/config/auth')) {
          return jsonResponse({ provider: 'basic' });
        }
        if (url.includes('/api/v1/limits/features/user')) {
          return jsonResponse({
            featureLimitStatuses: [
              {
                name: 'user',
                limitReached: false,
                currentCount: 1,
                configuredLimit: { disabledFields },
              },
            ],
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
        }
        if (url.includes('/api/v1/permissions/debug/')) {
          return jsonResponse({ permissions: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountUser(path: string, currentUserName = 'alice', isAdmin = true) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'u1', name: currentUserName, isAdmin };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/users/:fqn/:tab?/:subTab?', name: 'user-detail', component: UserDetailView },
        { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
        { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      ],
    });
    await router.push(path);
    await router.isReady();
    const wrapper = mount(UserDetailView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    return { wrapper, router };
  }

  it('fetches by name with the pin field set and include=all, renders the left column, no breadcrumb (P7)', async () => {
    const { wrapper } = await mountUser('/users/alice');
    const detailCall = requestedUrls.find(
      (url) =>
        url.includes('/api/v1/users/name/alice') &&
        url.includes('fields=profile%2Croles%2Cteams%2Cpersonas%2ClastActivityTime%2ClastLoginTime%2CdefaultPersona%2Cdomains%2Cextension'),
    );
    expect(detailCall).toBeDefined();
    expect(detailCall).toContain('include=all');
    expect(wrapper.find('[data-testid="user-display-name"]').text()).toContain('Alice Admin');
    expect(wrapper.find('[data-testid="user-email-value"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-profile-roles"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-profile-teams"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-details-card"]').exists()).toBe(true);
    expect(wrapper.find('.ant-breadcrumb').exists()).toBe(false);
    // P5: no standalone Roles tab; roles live in the left column.
    const nav = wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav');
    expect(nav.text()).not.toContain('Roles');
    expect(nav.text()).toContain('Activity');
  });

  it('shows the access-token tab only for the logged-in user', async () => {
    const self = await mountUser('/users/alice', 'alice');
    expect(
      self.wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav').text(),
    ).toContain('Access Token');

    const other = await mountUser('/users/alice', 'bob');
    expect(
      other.wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav').text(),
    ).not.toContain('Access Token');
  });

  it('redirects a non-self access-token visit to Activity', async () => {
    const { router } = await mountUser('/users/alice/access-token', 'bob');
    await flushPromises();
    expect(router.currentRoute.value.params.tab).toBe('activity_feed');
  });

  it('falls back to the first tab for an invalid tab segment, leaving the URL unchanged', async () => {
    const { wrapper, router } = await mountUser('/users/alice/bogus-tab');
    expect(wrapper.find('[data-testid="activity-tab-held"]').exists()).toBe(true);
    expect(router.currentRoute.value.params.tab).toBe('bogus-tab');
  });

  it('disables the access-token tab when personalAccessToken is a disabled field', async () => {
    disabledFields = ['personalAccessToken'];
    const { wrapper } = await mountUser('/users/alice');
    const nav = wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav');
    const disabledTab = nav.find('.ant-tabs-tab-disabled');
    expect(disabledTab.exists()).toBe(true);
    expect(disabledTab.text()).toContain('Access Token');
  });

  it('shows the no-username placeholder when the user does not exist', async () => {
    userFixture = null;
    const { wrapper } = await mountUser('/users/ghost');
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
  });

  // D-CFG-3 (host lane): pin profileNavConfig.tsx:219-227 — the
  // platform-settings tab is admin-only on the own profile.
  it('shows the platform-settings tab only for the logged-in admin, and mounts the panel', async () => {
    const selfAdmin = await mountUser('/users/alice/platform-settings', 'alice', true);
    expect(
      selfAdmin.wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav').text(),
    ).toContain('Platform settings');
    expect(selfAdmin.wrapper.find('[data-testid="platform-settings-tab"]').exists()).toBe(true);
    expect(selfAdmin.wrapper.find('[data-testid="platform-settings-panel"]').exists()).toBe(true);

    const selfNonAdmin = await mountUser('/users/alice', 'alice', false);
    expect(
      selfNonAdmin.wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav').text(),
    ).not.toContain('Platform settings');

    const otherAdmin = await mountUser('/users/alice', 'bob', true);
    expect(
      otherAdmin.wrapper.find('[data-testid="user-detail-tabs"] .ant-tabs-nav').text(),
    ).not.toContain('Platform settings');
  });
});
