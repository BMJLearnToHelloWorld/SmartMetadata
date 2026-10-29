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
});
