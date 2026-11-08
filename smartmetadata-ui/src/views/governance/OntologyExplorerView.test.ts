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

// The canvas's own G6 behaviour is covered by OntologyGraphCanvas.test.ts;
// here G6 is a minimal mock so the page's Vue-level behaviour (selection
// sharing, surface switching) is deterministic in jsdom.
vi.mock('@antv/g6', () => ({
  Graph: class {
    options: Record<string, unknown>;
    handlers: Record<string, (event: { target?: { id?: string } }) => void> = {};
    data: unknown;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      this.data = options.data;
    }
    on(event: string, handler: (event: { target?: { id?: string } }) => void): void {
      this.handlers[event] = handler;
    }
    setData(data: unknown): void {
      this.data = data;
    }
    async render(): Promise<void> {
      return undefined;
    }
    destroy(): void {
      return undefined;
    }
    async fitView(): Promise<void> {
      return undefined;
    }
    async zoomBy(): Promise<void> {
      return undefined;
    }
    async zoomTo(): Promise<void> {
      return undefined;
    }
    getZoom(): number {
      return 1;
    }
    getCanvasCenter(): { x: number; y: number } {
      return { x: 450, y: 260 };
    }
    async layout(): Promise<void> {
      return undefined;
    }
    async focusElement(): Promise<void> {
      return undefined;
    }
    getNodeData(): Array<{ id: string; style?: { x?: number; y?: number } }> {
      return [];
    }
    updateNodeData(): void {
      return undefined;
    }
    updateEdgeData(): void {
      return undefined;
    }
    setSize(): void {
      return undefined;
    }
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type PermissionEntries = Array<{ operation: string; access: string }>;

function stubFetch(
  onPost?: (url: string, init?: RequestInit) => Response,
  permissions?: { glossary?: PermissionEntries; glossaryTerm?: PermissionEntries },
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return onPost ? onPost(url, init) : jsonResponse({});
      }
      if (url.includes('/v1/permissions/glossaryTerm')) {
        return jsonResponse({ resource: 'glossaryTerm', permissions: permissions?.glossaryTerm ?? [] });
      }
      if (url.includes('/v1/permissions/glossary')) {
        return jsonResponse({ resource: 'glossary', permissions: permissions?.glossary ?? [] });
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
      if (url.includes('/v1/glossaryTerms')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
      }
      if (url.includes('/v1/glossaries')) {
        return jsonResponse({ data: [], paging: { total: 0 } });
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

function mountPage(path = '/govern/ontology') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/govern/ontology', name: 'ontology-explorer', component: OntologyExplorerView }],
  });
  return { pinia, router, path };
}

async function mountAt(path: string, stub: () => void) {
  stub();
  const { pinia, router } = mountPage();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(OntologyExplorerView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
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
    const wrapper = await mountAt('/govern/ontology?ontology=o1', () => stubFetch());
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
    const wrapper = await mountAt('/govern/ontology', () =>
      stubFetch((url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        posts.push({ url, body });
        return jsonResponse({ id: 'o9', name: body.name });
      }),
    );
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
    await router.push('/govern/ontology?ontology=o1');
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

  it('defaults to the all-ontologies aggregate graph with a stats label', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology', () => stubFetch());
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-stats"]').text()).toContain('1 concepts · 0 relations');
    expect(wrapper.find('[data-testid="ontology-scope-select"]').text()).toContain('All ontologies');
    expect(wrapper.find('[data-testid="ontology-detail"]').exists()).toBe(false);
  });

  it('follows the glossary deep link to the glossary scope', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology?scope=glossary:all', () => stubFetch());
    expect(wrapper.find('[data-testid="ontology-stats"]').text()).toContain('0 terms · 0 relations');
    expect(wrapper.find('[data-testid="ontology-detail"]').exists()).toBe(false);
  });

  it('shares selection between the graph and tree surfaces', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology', () => stubFetch());
    const radios = wrapper.findAll('[data-testid="ontology-surface"] input[type="radio"]');
    expect(radios).toHaveLength(2);
    await radios[1]!.setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-tree-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(false);
    await wrapper.find('[data-testid="ontology-tree-term-c1"]').trigger('click');
    await flushPromises();
    await radios[0]!.setValue(true);
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-graph-selected"]').text()).toContain('Customer');
  });

  it('shows the search empty state on a graph no-hit', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology', () => stubFetch());
    await wrapper.find('[data-testid="ontology-graph-search"]').setValue('zzz');
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-search-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(false);
  });

  it('shows the studio entry when any one E-D6 grant holds (ADR:2026-11-08-ontology-browser-studio-gate)', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology', () =>
      stubFetch(undefined, { glossary: [{ operation: 'EditAll', access: 'allow' }] }),
    );
    expect(wrapper.find('[data-testid="ontology-open-studio"]').exists()).toBe(true);
  });

  it('shows the studio entry for the EditEntityRelationship item alone', { timeout: 15000 }, async () => {
    const wrapper = await mountAt('/govern/ontology', () =>
      stubFetch(undefined, { glossaryTerm: [{ operation: 'EditEntityRelationship', access: 'allow' }] }),
    );
    expect(wrapper.find('[data-testid="ontology-open-studio"]').exists()).toBe(true);
  });

  it('hides the studio entry when no E-D6 grant holds, and when the permission call fails', { timeout: 15000 }, async () => {
    const denied = await mountAt('/govern/ontology', () => stubFetch());
    expect(denied.find('[data-testid="ontology-open-studio"]').exists()).toBe(false);
    denied.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return new Response('error', { status: 500 });
        }
        if (url.includes('/v1/ontologies')) {
          return jsonResponse({ data: [{ id: 'o1', name: 'sales-ontology', displayName: 'Sales Ontology' }], paging: { total: 1 } });
        }
        if (url.includes('/v1/ontologyConcepts') || url.includes('/v1/ontologyProperties') || url.includes('/v1/ontologyAxioms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { pinia, router } = mountPage();
    await router.push('/govern/ontology');
    await router.isReady();
    const errored = mount(OntologyExplorerView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    expect(errored.find('[data-testid="ontology-open-studio"]').exists()).toBe(false);
  });

  it('shows the capacity placeholder past 2000 definitions and opens one ontology from it', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/ontologyConcepts') && url.includes('limit=1')) {
          return jsonResponse({ data: [], paging: { total: 2001 } });
        }
        if (url.includes('/v1/ontologyConcepts')) {
          return jsonResponse({
            data: [
              { id: 'c1', name: 'Customer', displayName: 'Customer', conceptType: 'Class', iri: 'https://example.com/sales#Customer' },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/v1/ontologyProperties') || url.includes('/v1/ontologyAxioms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
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
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-capacity"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-capacity-open-o1"]').exists()).toBe(true);
    await wrapper.find('[data-testid="ontology-capacity-open-o1"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="ontology-capacity"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ontology-concepts"]').text()).toContain('Customer');
  });
});
