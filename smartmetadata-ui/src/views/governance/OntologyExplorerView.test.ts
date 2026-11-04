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

  it('opens concept detail with hierarchy and bindings, and shows axioms, releases and packs', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          return jsonResponse({});
        }
        if (url.includes('/v1/ontologyConcepts/c1/bindings')) {
          return jsonResponse({
            assets: [
              {
                assetType: 'table',
                assetId: 't1',
                asset: { id: 't1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' },
                columns: [{ propertyId: 'p1', columnPath: 'orders.id', state: 'resolved' }],
              },
            ],
          });
        }
        if (url.includes('/v1/ontologyConcepts/c1')) {
          return jsonResponse({
            id: 'c1',
            name: 'Customer',
            displayName: 'Customer',
            description: 'A buyer',
            synonyms: ['Buyer'],
            superClasses: [{ id: 'c0', name: 'Party', type: 'ontologyConcept' }],
            subClasses: [{ id: 'c2', name: 'VIPCustomer', type: 'ontologyConcept' }],
            owners: [],
          });
        }
        if (url.includes('/v1/ontologyConcepts/c0')) {
          return jsonResponse({ id: 'c0', name: 'Party', displayName: 'Party', owners: [] });
        }
        if (url.includes('/v1/ontologyConcepts')) {
          return jsonResponse({
            data: [
              { id: 'c1', name: 'Customer', displayName: 'Customer', conceptType: 'Class' },
              { id: 'c2', name: 'Order', displayName: 'Order', conceptType: 'Class' },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/v1/ontologyProperties')) {
          return jsonResponse({
            data: [{ id: 'p1', name: 'hasOrder', kind: 'ObjectProperty', domain: 'Customer', range: 'Order' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/v1/ontologyAxioms')) {
          return jsonResponse({
            data: [{ id: 'ax1', name: 'CustomerSubClassOfParty', axiomType: 'SubClassOf' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/v1/ontologyReleases')) {
          return jsonResponse({
            data: [{ id: 'r1', name: 'sales-1.0', semanticVersion: '1.0.0', memberCount: 12 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/v1/ontologyPacks')) {
          return jsonResponse({
            packs: [{ name: 'fibo', standard: 'FIBO', modules: [{ name: 'core', conceptCount: 10 }] }],
            installations: [],
          });
        }
        if (url.includes('/v1/ontologies/')) {
          return jsonResponse({
            id: 'o1',
            name: 'sales-ontology',
            displayName: 'Sales Ontology',
            fullyQualifiedName: 'sales-ontology',
            iri: 'https://example.com/sales',
            namespace: 'https://example.com/sales#',
            owners: [],
            reviewers: [],
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
    const { pinia, router } = mountPage();
    await router.push('/govern/ontology');
    await router.isReady();
    const wrapper = mount(OntologyExplorerView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-axioms"]').text()).toContain('CustomerSubClassOfParty');
    expect(wrapper.find('[data-testid="ontology-releases"]').text()).toContain('1.0.0');
    expect(wrapper.find('[data-testid="ontology-packs"]').text()).toContain('fibo');
    // Concept search filters the loaded rows client-side.
    await wrapper.find('[data-testid="ontology-concepts-search"]').setValue('cust');
    await flushPromises();
    const conceptsCard = wrapper.find('[data-testid="ontology-concepts"]');
    expect(conceptsCard.text()).toContain('Customer');
    expect(conceptsCard.text()).not.toContain('Order');
    await wrapper.find('[data-testid="ontology-concepts-search"]').setValue('');
    await flushPromises();
    // Clicking a concept name opens the detail card with hierarchy + bindings.
    const conceptLinks = wrapper.findAll('[data-testid="ontology-concepts"] a');
    const customerLink = conceptLinks.find((link) => link.text() === 'Customer');
    expect(customerLink).toBeDefined();
    await customerLink?.trigger('click');
    await flushPromises();
    const detail = wrapper.find('[data-testid="ontology-concept-detail"]');
    expect(detail.exists()).toBe(true);
    expect(detail.text()).toContain('Buyer');
    expect(detail.text()).toContain('Party');
    expect(detail.text()).toContain('VIPCustomer');
    expect(detail.text()).toContain('orders');
    // Hierarchy navigation follows the super-class link to its own detail.
    const partyLink = detail.findAll('a').find((link) => link.text() === 'Party');
    expect(partyLink).toBeDefined();
    await partyLink?.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-concept-detail"]').text()).toContain('Party');
    wrapper.unmount();
  });
});
