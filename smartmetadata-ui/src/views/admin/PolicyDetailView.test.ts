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
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import PolicyDetailView from './PolicyDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountPolicy(id = 'p1') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/policies', name: 'admin-policies', component: { template: '<div>list</div>' } },
      { path: '/admin/policies/:id', name: 'admin-policy', component: PolicyDetailView, props: true },
      { path: '/admin/roles/:id', name: 'admin-role', component: { template: '<div>role</div>' } },
    ],
  });
  await router.push(`/admin/policies/${id}`);
  await router.isReady();
  const wrapper = mount(PolicyDetailView, {
    props: { id },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PolicyDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/policies/p1')) {
          return jsonResponse({
            id: 'p1',
            name: 'DataConsumerPolicy',
            displayName: 'Data Consumer',
            description: 'Read catalog assets',
            enabled: true,
            owners: [{ name: 'admin', type: 'user' }],
            roles: [{ id: 'r1', name: 'DataConsumer' }],
            teams: [],
            rules: [
              {
                name: 'DataConsumerPolicy-Rule',
                effect: 'allow',
                operations: ['ViewAll'],
                resources: ['all'],
                condition: 'isOwner()',
              },
            ],
          });
        }
        if (url.includes('/api/v1/policies/p2')) {
          return jsonResponse({
            id: 'p2',
            name: 'DataStewardPolicy',
            description: 'Steward catalog assets',
            enabled: true,
            owners: [],
            roles: [],
            teams: [],
            rules: [],
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

  it('renders GET /v1/policies/{id} rules and exposes Apache-backed edit/delete', async () => {
    const { wrapper } = await mountPolicy();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.text()).toContain('DataConsumerPolicy-Rule');
    expect(wrapper.text()).toContain('ViewAll');
    expect(wrapper.text()).toContain('isOwner()');
    expect(wrapper.find('[data-testid="policy-rules-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-policy"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-policy"]').exists()).toBe(true);
  });

  it('shows Empty when the policy GET has no usable payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({})),
    );
    const { wrapper } = await mountPolicy();
    expect(wrapper.find('[data-testid="entity-detail-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="policy-rules-table"]').exists()).toBe(false);
  });

  // CONFLICT-3 (a): pin PoliciesDetailPage.tsx:114-126 builds the trail by
  // hand as [list label -> list path, entity name -> ''], with no Settings
  // root and no Access Control level. The list page keeps the §9 constructor.
  it('builds the pin two-item breadcrumb: list link, then the unlinked entity name', async () => {
    const { wrapper, router } = await mountPolicy();
    const shell = wrapper.findComponent(EntityDetailShell);
    expect(shell.exists()).toBe(true);
    const breadcrumbs = shell.props('breadcrumbs') as Array<{
      label: string;
      to?: Record<string, unknown>;
    }>;
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toEqual({ label: 'Policies', to: { name: 'admin-policies' } });
    expect(breadcrumbs[1].label).toBe('Data Consumer');
    expect(breadcrumbs[1].to).toBeUndefined();

    const trail = wrapper.find('[data-testid="entity-detail-breadcrumb"]');
    expect(trail.exists()).toBe(true);
    expect(trail.text()).toContain('Policies');
    expect(trail.text()).toContain('Data Consumer');
    expect(trail.text()).not.toContain('Settings');
    expect(trail.text()).not.toContain('Access Control');
    expect(wrapper.find('[data-testid="entity-detail-crumb-1"]').exists()).toBe(false);

    await wrapper.get('[data-testid="entity-detail-crumb-0"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policies');
  });

  it('uses the policy name as the second crumb when no displayName is present', async () => {
    const { wrapper } = await mountPolicy('p2');
    const shell = wrapper.findComponent(EntityDetailShell);
    const breadcrumbs = shell.props('breadcrumbs') as Array<{
      label: string;
      to?: Record<string, unknown>;
    }>;
    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toEqual({ label: 'Policies', to: { name: 'admin-policies' } });
    expect(breadcrumbs[1].label).toBe('DataStewardPolicy');
    expect(breadcrumbs[1].to).toBeUndefined();
  });
});
