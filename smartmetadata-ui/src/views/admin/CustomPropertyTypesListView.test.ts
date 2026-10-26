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
import CustomPropertyTypesListView from './CustomPropertyTypesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountTypes() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/custom-properties',
        name: 'admin-settings-custom-properties',
        component: CustomPropertyTypesListView,
      },
      {
        path: '/admin/settings/custom-properties/:entityType',
        name: 'admin-settings-custom-property-type',
        component: { template: '<div>defs</div>' },
      },
    ],
  });
  await router.push('/admin/settings/custom-properties');
  await router.isReady();
  const wrapper = mount(CustomPropertyTypesListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('CustomPropertyTypesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metadata/types')) {
          return jsonResponse({
            data: [
              {
                name: 'table',
                displayName: 'Table',
                category: 'entity',
                customProperties: [{ name: 'retentionDays', propertyType: { name: 'integer' } }],
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

  it('renders entity types from GET /v1/metadata/types', async () => {
    const { wrapper } = await mountTypes();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.find('[data-testid="admin-custom-property-types-table"]').exists()).toBe(true);
  });

  it('shows Empty when GET /v1/metadata/types returns no types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { wrapper } = await mountTypes();
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('retentionDays');
  });

  it('opens the type definitions page on name click', async () => {
    const { wrapper, router } = await mountTypes();
    await wrapper.find('[data-testid="custom-property-type-row-table"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-custom-property-type');
    expect(router.currentRoute.value.params.entityType).toBe('table');
  });
});
