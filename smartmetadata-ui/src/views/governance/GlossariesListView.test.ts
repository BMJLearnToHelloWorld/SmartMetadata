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
    global: { plugins: [pinia, router, Antd] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('GlossariesListView', () => {
  beforeEach(() => {
    localStorage.clear();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders glossaries from GET /v1/glossaries', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Business Glossary');
    expect(wrapper.find('[data-testid="glossaries-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-glossary"]').exists()).toBe(true);
  });

  it('opens glossary detail on name click', async () => {
    const { wrapper, router } = await mountView();
    const link = wrapper.find('[data-testid="glossary-row-g1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-glossary');
    expect(router.currentRoute.value.params.id).toBe('g1');
  });
});
