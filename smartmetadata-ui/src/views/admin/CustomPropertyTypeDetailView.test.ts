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
        if (url.includes('/api/v1/metadata/types?') && url.includes('category=field')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'integer', category: 'field', displayName: 'Integer' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/metadata/types/name/table')) {
          return jsonResponse({
            id: 'tid',
            name: 'table',
            customProperties: [
              {
                name: 'retentionDays',
                displayName: 'Retention days',
                description: 'How long to keep rows',
                propertyType: { name: 'integer' },
              },
            ],
          });
        }
        if (url.includes('/api/v1/metadata/types/name/')) {
          return jsonResponse({ id: 'tid2', name: entityTypeFrom(url), customProperties: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders definitions and exposes add definition action', async () => {
    const { wrapper } = await mountDefs();
    expect(wrapper.find('[data-testid="entity-detail-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('retentionDays');
    expect(wrapper.text()).toContain('integer');
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-custom-property"]').exists()).toBe(true);
  });

  it('shows Empty when the type has no definitions but still allows add', async () => {
    const { wrapper } = await mountDefs('topic');
    expect(wrapper.find('[data-testid="entity-detail-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-custom-property-defs-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-custom-property"]').exists()).toBe(true);
  });

  it('PUTs a custom property definition to /v1/metadata/types/{id}', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/metadata/types/tid') && String(init?.method || '').toUpperCase() === 'PUT') {
        return jsonResponse({
          id: 'tid',
          name: 'table',
          customProperties: [
            { name: 'ownerTeam', description: 'Owning team', propertyType: { name: 'string' } },
          ],
        });
      }
      if (url.includes('category=field')) {
        return jsonResponse({
          data: [
            { id: 'f1', name: 'integer', category: 'field' },
            { id: 'f2', name: 'string', category: 'field' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/api/v1/metadata/types/name/table')) {
        return jsonResponse({ id: 'tid', name: 'table', customProperties: [] });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountDefs();
    await wrapper.get('[data-testid="add-custom-property"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="custom-property-name"]').setValue('ownerTeam');
    await wrapper.get('[data-testid="custom-property-description"]').setValue('Owning team');
    const modalOk = wrapper.findAll('.ant-modal-footer button').find((b) => b.classes().includes('ant-btn-primary'));
    expect(modalOk).toBeTruthy();
    await modalOk!.trigger('click');
    await flushPromises();
    const putCalls = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]).includes('/api/v1/metadata/types/tid') &&
        String((call[1] as RequestInit | undefined)?.method || '').toUpperCase() === 'PUT',
    );
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
  });
});

function entityTypeFrom(url: string): string {
  const marker = '/metadata/types/name/';
  const start = url.indexOf(marker);
  if (start < 0) {
    return 'unknown';
  }
  const rest = url.slice(start + marker.length);
  return decodeURIComponent(rest.split(/[/?]/)[0] || 'unknown');
}
