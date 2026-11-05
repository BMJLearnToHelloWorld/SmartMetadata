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

// The relations tab renders the real G6 canvas; stub the graph engine the
// same way OntologyGraphCanvas.test.ts does so the test asserts on the data
// handed to G6, not on the library's DOM output.
const g6State = vi.hoisted(() => ({
  instances: [] as Array<{ data: unknown }>,
}));

vi.mock('@antv/g6', () => ({
  Graph: class {
    data: unknown;
    constructor(options: Record<string, unknown>) {
      this.data = options.data;
      g6State.instances.push(this);
    }
    on(): void {
      return undefined;
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
  },
}));

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
          if (url.includes('directChildrenOf=')) {
            if (url.includes('after=c2')) {
              return jsonResponse({
                data: [
                  {
                    id: 'c3',
                    name: 'Online',
                    displayName: 'Online',
                    description: 'Web channel',
                    fullyQualifiedName: 'Business.Customer.Online',
                    entityStatus: 'Approved',
                    owners: [],
                    childrenCount: 0,
                  },
                ],
                paging: { total: 3 },
              });
            }
            return jsonResponse({
              data: [
                {
                  id: 'c1',
                  name: 'Retail',
                  displayName: 'Retail',
                  description: 'Shop channel',
                  fullyQualifiedName: 'Business.Customer.Retail',
                  entityStatus: 'Approved',
                  owners: [{ id: 'u1', name: 'amy', type: 'user' }],
                  childrenCount: 0,
                },
                {
                  id: 'c2',
                  name: 'Wholesale',
                  displayName: 'Wholesale',
                  description: 'Bulk channel',
                  fullyQualifiedName: 'Business.Customer.Wholesale',
                  entityStatus: 'Draft',
                  owners: [],
                  childrenCount: 3,
                },
              ],
              paging: { total: 3, after: 'c2' },
            });
          }
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
                childrenCount: 2,
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

  it('renders the title through PageHeader, not a hand-written title block', async () => {
    // A19 convergence: breadcrumb + PageHeader carry the title info;
    // the old level-3 title element is gone.
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="glossary-page-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-page-header-heading"]').text()).toContain('Business Glossary');
    expect(wrapper.find('[data-testid="glossary-fqn"]').text()).toContain('Business');
    expect(wrapper.find('.glossary__title').exists()).toBe(false);
  });

  async function clickTab(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'], label: string) {
    const tab = wrapper
      .findAll('.ant-tabs-tab')
      .find((node) => node.text().includes(label));
    expect(tab).toBeDefined();
    await tab!.trigger('click');
    await flushPromises();
  }

  it('loads the real activity feed and tasks on the activity tab', async () => {
    const { wrapper } = await mountView();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/activity/entity/glossary/name/')) {
          return jsonResponse({
            data: [
              {
                id: 'e1',
                eventType: 'create',
                summary: 'Glossary created',
                timestamp: 1762051200000,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({
            data: [
              {
                id: 'c1',
                about: '<#E::glossary::Business>',
                message: 'Hello glossary',
                replyCount: 0,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/tasks')) {
          return jsonResponse({
            data: [
              {
                id: 'task1',
                name: 'Review glossary',
                displayName: 'Review glossary',
                type: 'RequestDescription',
                status: 'Open',
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    await clickTab(wrapper, 'Activity');
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Glossary created');
    expect(wrapper.text()).toContain('Hello glossary');
    expect(wrapper.find('[data-testid="glossary-tasks-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Review glossary');
    expect(wrapper.find('[data-testid="glossary-activity-residual"]').exists()).toBe(false);
  });

  it('renders the real relations graph from the glossary terms, not a residual (M-Next A3)', async () => {
    g6State.instances.length = 0;
    const { wrapper } = await mountView();
    await clickTab(wrapper, 'Relations Graph');
    // loadRelations is a multi-await chain (list terms -> resolve related ->
    // build graph -> mount canvas -> dynamic G6 import), so wait for the
    // graph engine instance instead of assuming one flush covers it.
    for (let i = 0; i < 20 && g6State.instances.length === 0; i++) {
      await flushPromises();
    }
    expect(wrapper.find('[data-testid="glossary-relations-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(true);
    // The stubbed term list carries one term (t1, no relations): the graph
    // handed to G6 is built from that real data, not a fixture.
    const data = g6State.instances[0]?.data as
      | { nodes?: Array<{ id: string }> }
      | undefined;
    expect(data?.nodes?.map((node) => node.id)).toEqual(['t1']);
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

  function childrenFetchCount(): number {
    return vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes('directChildrenOf='))
      .length;
  }

  async function expandFirstTerm(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    const icon = wrapper.find('.ant-table-row-expand-icon');
    expect(icon.exists()).toBe(true);
    await icon.trigger('click');
    await flushPromises();
  }

  it('lazy-loads full children on expand and does not refetch on re-expand', async () => {
    const { wrapper } = await mountView();
    expect(childrenFetchCount()).toBe(0);
    await expandFirstTerm(wrapper);
    expect(childrenFetchCount()).toBe(1);
    const lastUrl = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain(`directChildrenOf=${encodeURIComponent('Business.Customer')}`);
    // Full terms, not bare refs: child status and owners render.
    expect(wrapper.text()).toContain('Retail');
    expect(wrapper.text()).toContain('Wholesale');
    expect(wrapper.text()).toContain('amy');
    // Collapse and re-expand: cached, no second fetch.
    await expandFirstTerm(wrapper);
    await expandFirstTerm(wrapper);
    expect(childrenFetchCount()).toBe(1);
    expect(wrapper.text()).toContain('Retail');
  });

  it('appends the next children page via load-more and drops the button at the end', async () => {
    const { wrapper } = await mountView();
    await expandFirstTerm(wrapper);
    const more = wrapper.find('[data-testid="term-children-more-t1"]');
    expect(more.exists()).toBe(true);
    await more.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Online');
    expect(wrapper.find('[data-testid="term-children-more-t1"]').exists()).toBe(false);
  });

  it('shows a retry row when children fail to load and recovers on retry', async () => {
    let childrenCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('directChildrenOf=')) {
          childrenCalls += 1;
          if (childrenCalls === 1) {
            return new Response('boom', { status: 500 });
          }
          return jsonResponse({
            data: [
              {
                id: 'c1',
                name: 'Retail',
                displayName: 'Retail',
                description: 'Shop channel',
                fullyQualifiedName: 'Business.Customer.Retail',
                entityStatus: 'Approved',
                owners: [],
                childrenCount: 0,
              },
            ],
            paging: { total: 1 },
          });
        }
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
            data: [{ id: 'g1', name: 'Business', displayName: 'Business Glossary', termCount: 1 }],
            paging: { total: 1 },
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
                childrenCount: 2,
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView();
    await expandFirstTerm(wrapper);
    const errorRow = wrapper.find('[data-testid="term-children-error-t1"]');
    expect(errorRow.exists()).toBe(true);
    const retry = errorRow.find('button');
    expect(retry.exists()).toBe(true);
    await retry.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Retail');
    expect(wrapper.find('[data-testid="term-children-error-t1"]').exists()).toBe(false);
  });
});
