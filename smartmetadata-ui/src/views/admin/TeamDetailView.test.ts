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
import TeamDetailView from './TeamDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ORG = {
  id: 'org1',
  name: 'Organization',
  displayName: 'Organization',
  fullyQualifiedName: 'Organization',
  teamType: 'Organization',
  parents: [],
  childrenCount: 0,
  userCount: 0,
  defaultRoles: [],
  policies: [],
  users: [],
};

const GROUP = {
  id: 'g1',
  name: 'DataEngineering',
  displayName: 'Data Engineering',
  fullyQualifiedName: 'Organization.DataEngineering',
  teamType: 'Group',
  parents: [{ id: 'org1', name: 'Organization', type: 'team' }],
  childrenCount: 0,
  userCount: 2,
  defaultRoles: [],
  policies: [],
  users: [],
  isJoinable: true,
};

describe('TeamDetailView (pin TeamsPage)', () => {
  const requestedUrls: string[] = [];
  let teamFixture: Record<string, unknown> | null = ORG;
  let permissionOps: Array<{ operation: string; access: string }> = [
    { operation: 'ViewAll', access: 'allow' },
    { operation: 'EditAll', access: 'allow' },
    { operation: 'Create', access: 'allow' },
    { operation: 'EditUsers', access: 'allow' },
  ];

  beforeEach(() => {
    localStorage.clear();
    requestedUrls.length = 0;
    teamFixture = ORG;
    permissionOps = [
      { operation: 'ViewAll', access: 'allow' },
      { operation: 'EditAll', access: 'allow' },
      { operation: 'Create', access: 'allow' },
      { operation: 'EditUsers', access: 'allow' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/api/v1/permissions/')) {
          return jsonResponse({ resource: 'team', permissions: permissionOps });
        }
        if (url.includes('/api/v1/teams/assets/counts')) {
          return jsonResponse({});
        }
        if (url.includes('/api/v1/teams/name/')) {
          if (url.includes('/name/Organization')) {
            return jsonResponse(ORG);
          }
          if (!teamFixture) {
            return new Response('not found', { status: 404 });
          }
          return jsonResponse(teamFixture);
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
        }
        if (url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/users/name/')) {
          return jsonResponse({ id: 'u1', name: 'admin', teams: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function mountTeam(fqn: string) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'u1', name: 'admin', isAdmin: true };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings/members/teams/:fqn', name: 'settings-team', component: TeamDetailView },
        { path: '/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
        { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      ],
    });
    await router.push(`/settings/members/teams/${fqn}`);
    await router.isReady();
    const wrapper = mount(TeamDetailView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    return wrapper;
  }

  it('fetches by name with the pin basic and advanced field sets and include=all', async () => {
    await mountTeam('Organization');
    const byNameCalls = requestedUrls.filter((url) => url.includes('/api/v1/teams/name/Organization'));
    expect(byNameCalls.length).toBeGreaterThanOrEqual(2);
    expect(byNameCalls.some((url) => url.includes('fields=userCount%2Cparents%2Cprofile%2Cowners%2Cextension'))).toBe(true);
    expect(
      byNameCalls.some((url) =>
        url.includes('fields=users%2CuserCount%2CdefaultRoles%2CdefaultPersona%2Cpolicies%2CchildrenCount%2CdescendantTeams%2Cdomains%2Cextension'),
      ),
    ).toBe(true);
    expect(byNameCalls.every((url) => url.includes('include=all'))).toBe(true);
  });

  it('renders the 3-level constructor breadcrumb for Organization', async () => {
    const wrapper = await mountTeam('Organization');
    const crumbs = wrapper.find('[data-testid="entity-detail-breadcrumb"]');
    expect(crumbs.exists()).toBe(true);
    expect(crumbs.text()).toContain('Settings');
    expect(crumbs.text()).toContain('Members');
    expect(crumbs.text()).toContain('Teams');
  });

  it('splits tabs by team type: Organization has teams/roles/policies/custom_properties', async () => {
    const wrapper = await mountTeam('Organization');
    // Scope to the tab nav: pane content (e.g. the hierarchy Users column)
    // also lives inside the Tabs DOM.
    const tabs = wrapper.find('[data-testid="team-detail-tabs"] .ant-tabs-nav');
    expect(tabs.text()).toContain('Teams');
    expect(tabs.text()).toContain('Roles');
    expect(tabs.text()).toContain('Policies');
    expect(tabs.text()).toContain('Custom Properties');
    expect(tabs.text()).not.toContain('Users');
    expect(tabs.text()).not.toContain('Assets');
  });

  it('splits tabs by team type: Group has users/assets/roles/policies/custom_properties', async () => {
    teamFixture = GROUP;
    const wrapper = await mountTeam('DataEngineering');
    const tabs = wrapper.find('[data-testid="team-detail-tabs"] .ant-tabs-nav');
    expect(tabs.text()).toContain('Users');
    expect(tabs.text()).toContain('Assets');
    expect(tabs.text()).toContain('Roles');
    expect(tabs.text()).not.toContain('Teams');
    expect(wrapper.find('[data-testid="join-team-button"]').exists()).toBe(true);
  });

  it('shows the permission placeholder when the view gate denies', async () => {
    permissionOps = [{ operation: 'ViewAll', access: 'deny' }];
    const wrapper = await mountTeam('Organization');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="team-detail-tabs"]').exists()).toBe(false);
  });

  it('shows the no-data placeholder when the team does not exist', async () => {
    teamFixture = null;
    const wrapper = await mountTeam('Missing');
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
  });
});
