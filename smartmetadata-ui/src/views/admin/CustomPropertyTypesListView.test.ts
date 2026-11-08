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

  // 20s cap, not the 5s default: the first mount renders the list shell and
  // table after the fetch, so under parallel workers it exceeds 5s — and
  // under peak VM load (load avg > 5 on 4 CPUs) even 10s. Baseline was
  // already ~4.9s single-run for this test, so the margin was gone before
  // this batch. Assertions are unchanged; the cap still fails a genuinely
  // hung fetch.
  it('renders entity types from GET /v1/metadata/types', async () => {
    const { wrapper } = await mountTypes();
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.find('[data-testid="admin-custom-property-types-table"]').exists()).toBe(true);
  }, 20000);

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

  it('shows only the official 26 types and counts the filtered set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            { name: 'table', displayName: 'Table', category: 'entity', customProperties: [] },
            { name: 'aiApplication', displayName: 'AI Application', category: 'entity', customProperties: [] },
            { name: 'auditReport', displayName: 'Audit Report', category: 'entity', customProperties: [] },
            { name: 'classification', displayName: 'Classification', category: 'entity', customProperties: [] },
          ],
          paging: { total: 4 },
        }),
      ),
    );
    const { wrapper } = await mountTypes();
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.text()).not.toContain('AI Application');
    expect(wrapper.text()).not.toContain('Audit Report');
    expect(wrapper.text()).not.toContain('Classification');
    expect(wrapper.text()).toContain('of 1');
  });

  it('pages on when the server still returns a cursor, then filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('after=cursor1')) {
          return jsonResponse({
            data: [{ name: 'database', displayName: 'Database', category: 'entity', customProperties: [] }],
            paging: { total: 3 },
          });
        }
        return jsonResponse({
          data: [
            { name: 'table', displayName: 'Table', category: 'entity', customProperties: [] },
            { name: 'aiApplication', displayName: 'AI Application', category: 'entity', customProperties: [] },
          ],
          paging: { total: 3, after: 'cursor1' },
        });
      }),
    );
    const { wrapper } = await mountTypes();
    expect(wrapper.text()).toContain('Table');
    expect(wrapper.text()).toContain('Database');
    expect(wrapper.text()).not.toContain('AI Application');
    expect(wrapper.text()).toContain('of 2');
  });
});
