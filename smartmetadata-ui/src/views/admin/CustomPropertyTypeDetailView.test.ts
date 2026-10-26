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
import CustomPropertyTypeDetailView from './CustomPropertyTypeDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountDefs(entityType = 'table') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/custom-properties',
        name: 'admin-settings-custom-properties',
        component: { template: '<div>types</div>' },
      },
      {
        path: '/admin/settings/custom-properties/:entityType',
        name: 'admin-settings-custom-property-type',
        component: CustomPropertyTypeDetailView,
        props: true,
      },
    ],
  });
  await router.push(`/admin/settings/custom-properties/${entityType}`);
  await router.isReady();
  const wrapper = mount(CustomPropertyTypeDetailView, {
    props: { entityType },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper };
}

describe('CustomPropertyTypeDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metadata/types/name/table/customProperties')) {
          return jsonResponse([
            {
              name: 'retentionDays',
              displayName: 'Retention days',
              description: 'How long to keep rows',
              propertyType: { name: 'integer' },
            },
          ]);
        }
        if (url.includes('/customProperties')) {
          return jsonResponse([]);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders definitions from GET /v1/metadata/types/name/{type}/customProperties', async () => {
    const { wrapper } = await mountDefs();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('retentionDays');
    expect(wrapper.text()).toContain('integer');
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Add property');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('shows Empty when the type has no definitions', async () => {
    const { wrapper } = await mountDefs('topic');
    expect(wrapper.find('[data-testid="entity-detail-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(false);
  });
});
