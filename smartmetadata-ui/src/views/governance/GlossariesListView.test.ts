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
import GlossariesListView from './GlossariesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/glossaries', name: 'governance-glossaries', component: GlossariesListView },
      { path: '/governance/glossaries/:id', name: 'governance-glossary', component: { template: '<div>g</div>' } },
    ],
  });
  await router.push('/governance/glossaries');
  await router.isReady();
  const wrapper = mount(GlossariesListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('GlossariesListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists glossaries instead of redirecting to the first one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({
            data: [{ id: 'g1', name: 'Business', displayName: 'Business Glossary', description: 'Terms', termCount: 2 }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper, router } = await mountView();
    expect(router.currentRoute.value.name).toBe('governance-glossaries');
    expect(wrapper.find('[data-testid="glossary-row-g1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossaries-table"]').exists()).toBe(true);
  });

  it('shows empty create CTA when no glossaries exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-glossary"]').exists()).toBe(true);
  });
});
