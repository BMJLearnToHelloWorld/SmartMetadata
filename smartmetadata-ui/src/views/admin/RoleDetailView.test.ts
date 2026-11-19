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
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { createTestI18n } from '@/test/i18n';
import RoleDetailView from './RoleDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountRole(id = 'r1') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', name: 'admin-roles', component: { template: '<div>list</div>' } },
      { path: '/admin/roles/:id', name: 'admin-role', component: RoleDetailView, props: true },
      { path: '/admin/users/:id', name: 'admin-user', component: { template: '<div>user</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
    ],
  });
  await router.push(`/admin/roles/${id}`);
  await router.isReady();
  const wrapper = mount(RoleDetailView, {
    props: { id },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('RoleDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/roles/r1')) {
          return jsonResponse({
            id: 'r1',
            name: 'DataConsumer',
            displayName: 'Data Consumer',
            description: 'Read catalog assets',
            policies: [{ id: 'p1', name: 'DataConsumerPolicy', type: 'policy' }],
            users: [{ id: 'u1', name: 'alice', type: 'user' }],
            teams: [],
          });
        }
        if (url.includes('/api/v1/roles/r2')) {
          return jsonResponse({
            id: 'r2',
            name: 'DataSteward',
            description: 'Steward catalog assets',
            policies: [],
            users: [],
            teams: [],
          });
        }
        if (url.includes('/api/v1/users') || url.includes('/api/v1/teams')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // CONFLICT-3 (a): pin RolesDetailPage.tsx:105-117 builds the trail by hand
  // as [list label -> list path, entity name -> ''], with no Settings root
  // and no Access Control level. The list page keeps the §9 constructor.
  it('builds the pin two-item breadcrumb: list link, then the unlinked entity name', async () => {
    const { wrapper, router } = await mountRole();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Consumer');

    const shell = wrapper.findComponent(EntityDetailShell);
    expect(shell.exists()).toBe(true);
    const breadcrumbs = shell.props('breadcrumbs') as Array<{
      label: string;
      to?: Record<string, unknown>;
    }>;
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toEqual({ label: 'Roles', to: { name: 'admin-roles' } });
    expect(breadcrumbs[1].label).toBe('Data Consumer');
    expect(breadcrumbs[1].to).toBeUndefined();

    const trail = wrapper.find('[data-testid="entity-detail-breadcrumb"]');
    expect(trail.exists()).toBe(true);
    expect(trail.text()).toContain('Roles');
    expect(trail.text()).toContain('Data Consumer');
    expect(trail.text()).not.toContain('Settings');
    expect(trail.text()).not.toContain('Access Control');
    expect(wrapper.find('[data-testid="entity-detail-crumb-1"]').exists()).toBe(false);

    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-roles');
  });

  it('uses the role name as the second crumb when no displayName is present', async () => {
    const { wrapper } = await mountRole('r2');
    const shell = wrapper.findComponent(EntityDetailShell);
    const breadcrumbs = shell.props('breadcrumbs') as Array<{
      label: string;
      to?: Record<string, unknown>;
    }>;
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toEqual({ label: 'Roles', to: { name: 'admin-roles' } });
    expect(breadcrumbs[1].label).toBe('DataSteward');
    expect(breadcrumbs[1].to).toBeUndefined();
  });
});
