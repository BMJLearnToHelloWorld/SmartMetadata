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
import GlossaryDetailView from './GlossaryDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(id = 'g1') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/glossaries', name: 'governance-glossaries', component: { template: '<div />' } },
      {
        path: '/governance/glossaries/:id',
        name: 'governance-glossary',
        component: GlossaryDetailView,
        props: true,
      },
      { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>t</div>' } },
    ],
  });
  await router.push(`/governance/glossaries/${id}`);
  await router.isReady();
  const wrapper = mount(GlossaryDetailView, {
    props: { id },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('GlossaryDetailView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaries/') && !url.includes('glossaryTerms')) {
          return jsonResponse({
            id: 'g1',
            name: 'Business',
            displayName: 'Business Glossary',
            description: 'Core terms',
            fullyQualifiedName: 'Business',
            owners: [],
            reviewers: [],
            tags: [],
            domains: [],
            termCount: 1,
          });
        }
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({
            data: [
              {
                id: 'g1',
                name: 'Business',
                displayName: 'Business Glossary',
                description: 'Core terms',
                termCount: 1,
              },
              { id: 'g2', name: 'Finance', displayName: 'Finance', description: 'Money', termCount: 0 },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({
            data: [
              {
                id: 't1',
                name: 'Customer',
                displayName: 'Customer',
                description: 'A buyer',
                fullyQualifiedName: 'Business.Customer',
                entityStatus: 'Approved',
                owners: [],
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

  it('renders left list, terms table, and right rail', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="glossary-workspace"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-row-g1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Business Glossary');
    expect(wrapper.find('[data-testid="glossary-terms-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Customer');
    expect(wrapper.text()).toContain('Approved');
    expect(wrapper.find('[data-testid="glossary-rail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rail-domain-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rail-owners-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rail-reviewers-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rail-tags-add"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Relations Graph');
    expect(wrapper.find('[data-testid="create-term"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-breadcrumb"]').exists()).toBe(true);
  });

  it('navigates to term detail from the terms table', async () => {
    const { wrapper, router } = await mountView();
    const link = wrapper.find('[data-testid="term-row-t1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-term');
    expect(router.currentRoute.value.params.id).toBe('t1');
  });
});
