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
import OntologyExplorerView from './OntologyExplorerView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(onPost?: (url: string, init?: RequestInit) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return onPost ? onPost(url, init) : jsonResponse({});
      }
      if (url.includes('/v1/ontologyConcepts')) {
        return jsonResponse({
          data: [
            {
              id: 'c1',
              name: 'Customer',
              displayName: 'Customer',
              conceptType: 'Class',
              iri: 'https://example.com/sales#Customer',
              lifecycleStatus: 'Active',
              description: 'A buyer',
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/ontologyProperties')) {
        return jsonResponse({
          data: [
            { id: 'p1', name: 'hasOrder', kind: 'ObjectProperty', domain: 'Customer', range: 'Order' },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/v1/ontologies/')) {
        return jsonResponse({
          id: 'o1',
          name: 'sales-ontology',
          displayName: 'Sales Ontology',
          fullyQualifiedName: 'sales-ontology',
          description: 'Sales concepts',
          iri: 'https://example.com/sales',
          namespace: 'https://example.com/sales#',
          publicationStatus: 'Published',
          owners: [{ name: 'alice' }],
          reviewers: [{ name: 'bob' }],
        });
      }
      if (url.includes('/v1/ontologies')) {
        return jsonResponse({
          data: [{ id: 'o1', name: 'sales-ontology', displayName: 'Sales Ontology' }],
          paging: { total: 1 },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/govern/ontology', name: 'ontology-explorer', component: OntologyExplorerView }],
  });
  return { pinia, router };
}

describe('OntologyExplorerView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the selected ontology with concepts and properties', { timeout: 15000 }, async () => {
    stubFetch();
    const { pinia, router } = mountPage();
    await router.push('/govern/ontology');
    await router.isReady();
    const wrapper = mount(OntologyExplorerView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-explorer"]').exists()).toBe(true);
    const detail = wrapper.find('[data-testid="ontology-detail"]');
    expect(detail.text()).toContain('Sales Ontology');
    expect(detail.text()).toContain('https://example.com/sales');
    expect(detail.text()).toContain('alice');
    expect(wrapper.find('[data-testid="ontology-concepts"]').text()).toContain('Customer');
    expect(wrapper.find('[data-testid="ontology-properties"]').text()).toContain('hasOrder');
  });

  it('shows the empty state when the catalog is empty', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/ontology');
    await router.isReady();
    const wrapper = mount(OntologyExplorerView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-empty"]').exists()).toBe(true);
  });

  it('creates an ontology with the required name + iri + namespace', { timeout: 15000 }, async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    stubFetch((url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      posts.push({ url, body });
      return jsonResponse({ id: 'o9', name: body.name });
    });
    const { pinia, router } = mountPage();
    await router.push('/govern/ontology');
    await router.isReady();
    const wrapper = mount(OntologyExplorerView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="ontology-create"]').trigger('click');
    await wrapper.find('[data-testid="ontology-create-name"]').setValue('sales-ontology');
    await wrapper.find('[data-testid="ontology-create-iri"]').setValue('https://example.com/sales');
    await wrapper.find('[data-testid="ontology-create-namespace"]').setValue('https://example.com/sales#');
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    expect(posts.length).toBe(1);
    expect(posts[0].url).toContain('/api/v1/ontologies');
    expect(posts[0].body).toMatchObject({
      name: 'sales-ontology',
      iri: 'https://example.com/sales',
      namespace: 'https://example.com/sales#',
    });
  });
});
