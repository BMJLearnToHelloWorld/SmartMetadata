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
          if (url.includes('directChildrenOf=Business.Customer')) {
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
                // Self-consistent with the children endpoint below, which
                // pages 3 children (Retail, Wholesale, Online); pin's
                // remaining count is childrenCount minus loaded.
                childrenCount: 3,
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
    // The terms table is the GlossaryTermsWidget now: the term name is
    // a link that routes to the term detail page.
    const link = wrapper
      .findAll('[data-testid="glossary-terms-table"] a')
      .find((node) => node.text().includes('Customer'));
    expect(link?.exists()).toBe(true);
    await link!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-term');
    expect(router.currentRoute.value.params.id).toBe('t1');
  });

  function childrenFetchCount(): number {
    // Only the lazy child load for the parent term counts here — the
    // widget also fetches the first level (directChildrenOf=Business)
    // on mount.
    return vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes(`directChildrenOf=${encodeURIComponent('Business.Customer')}`))
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
    const more = wrapper.find('[data-testid="load-more-children"]');
    expect(more.exists()).toBe(true);
    await more.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Online');
    expect(wrapper.find('[data-testid="load-more-children"]').exists()).toBe(false);
  });

  it('shows an error and recovers on re-expand when children fail to load', async () => {
    // The widget has no retry row (pin parity: a failed lazy load
    // surfaces as an error toast and leaves the row expandable, so a
    // collapse + re-expand retries the load instead of caching the
    // failure).
    let childrenCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('directChildrenOf=Business.Customer')) {
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
    expect(wrapper.text()).not.toContain('Retail');
    // Collapse and re-expand: the failed load is retried, not cached.
    await expandFirstTerm(wrapper);
    await expandFirstTerm(wrapper);
    expect(wrapper.text()).toContain('Retail');
    expect(childrenCalls).toBe(2);
  });
});

describe('GlossaryDetailView persona tab customization (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function stubWithDoc(doc: Record<string, unknown> | null) {
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
            termCount: 0,
          });
        }
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/activity/') ||
          url.includes('/api/v1/conversations') ||
          url.includes('/api/v1/tasks')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper
      .find('[data-testid="glossary-tabs"]')
      .findAll('.ant-tabs-tab')
      .map((tab) => tab.text().trim());
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reorders and renames tabs from the persona Glossary page, dropping unlisted tabs', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Glossary',
            tabs: [
              { id: 'relations_graph', name: 'relations_graph', displayName: 'Graph' },
              { id: 'terms', name: 'terms' },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const labels = tabLabels(wrapper);
    // F-2: replacement semantics — only the customized tabs render;
    // the unlisted activity tab stays removed.
    expect(labels).toHaveLength(2);
    expect(labels[0]).toBe('Graph');
    expect(labels[1]).toMatch(/^Terms/);
    wrapper.unmount();
  });

  it('renders the default tab order without a persona document', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toEqual([
      'Terms (0)',
      'Relations Graph',
      'Activity Feeds & Tasks (0)',
    ]);
    wrapper.unmount();
  });

  it('clamps to the first remaining tab and lazy-loads it when the customization removes terms (B-1)', async () => {
    // The native Tabs is v-model-bound to `activeTab` ('terms'), so
    // the view itself must clamp to the first rendered tab when
    // terms is removed. The clamped-to activity tab renders (no
    // force-render here) and its lazy load runs exactly once: the
    // clamp assignment fires the existing lazy-load watcher, and the
    // loaded-for/loading guards dedupe it against `loadDetail`'s
    // own post-load check.
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [
          {
            pageType: 'Glossary',
            tabs: [{ id: 'activity_feed', name: 'activity_feed' }],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(tabLabels(wrapper)).toHaveLength(1);
    const tabs = wrapper.find('[data-testid="glossary-tabs"]');
    expect(tabs.findAll('.ant-tabs-tab-active')).toHaveLength(1);
    expect(wrapper.findAll('.ant-tabs-tabpane-active')).toHaveLength(1);
    expect(wrapper.find('[data-testid="glossary-tasks-empty"]').exists()).toBe(true);
    const activityCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) => String(call[0]).includes('/api/v1/activity/'));
    expect(activityCalls).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders no tab bar for an explicitly empty Glossary tab list without throwing (m-2)', async () => {
    // The native Tabs carries the shell's empty-list guard: with no
    // tabs it stays unmounted (no nav element at all) while the
    // header and rail still render.
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        pages: [{ pageType: 'Glossary', tabs: [] }],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountView();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="glossary-tabs"]').exists()).toBe(false);
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.find('[data-testid="glossary-page-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-rail"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('GlossaryDetailView widget grid (B-8)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function glossaryDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Glossary', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
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
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            reviewers: [{ id: 'u3', name: 'carol', displayName: 'Carol' }],
            tags: [
              { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
              { tagFQN: 'Business.term', name: 'term', source: 'Glossary' },
              { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            ],
            domains: [{ id: 'dom1', name: 'finance', displayName: 'Finance' }],
            termCount: 2,
          });
        }
        if (url.includes('/api/v1/glossaries')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({
            data: [
              {
                id: 't1',
                name: 'revenue',
                displayName: 'Revenue',
                description: 'Money in',
                status: 'Approved',
                owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
                fullyQualifiedName: 'Business.revenue',
              },
              {
                id: 't2',
                name: 'cost',
                displayName: 'Cost',
                description: 'Money out',
                owners: [],
                fullyQualifiedName: 'Business.cost',
              },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        if (
          url.includes('/api/v1/activity/') ||
          url.includes('/api/v1/conversations') ||
          url.includes('/api/v1/tasks')
        ) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountGlossary() {
    const mounted = await mountView();
    await flushPromises();
    await flushPromises();
    await mounted.wrapper.vm.$nextTick();
    return mounted;
  }

  function widgetTestIds(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']): string[] {
    return wrapper
      .findAll('[data-testid^="widget-"]')
      .map((node) => node.attributes('data-testid') as string);
  }

  // loadRelations is a multi-await chain (list terms -> build graph ->
  // mount canvas -> dynamic G6 import), so one flush does not cover
  // the relations pane mount; poll for the settled default pane (the
  // graph canvas) the same way the M-Next A3 relations test waits
  // for the graph instance. The Spin wrapper's testid is transient —
  // antd renders it only while spinning — so waiting on it races
  // the load: a clamp that starts the load early (B-1) settles
  // before the wait runs and the testid is already gone.
  async function waitForRelationsPane(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    for (
      let i = 0;
      i < 20 && !wrapper.find('[data-testid="ontology-graph-canvas"]').exists();
      i++
    ) {
      await flushPromises();
    }
    await wrapper.vm.$nextTick();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the widget grid on terms, replacing the description and table panes', async () => {
    stubWithDoc(
      glossaryDoc([
        {
          id: 'terms',
          name: 'terms',
          layout: [
            { i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 },
            { i: 'KnowledgePanel.TermsTable', x: 0, y: 1, w: 6, h: 2 },
            { i: 'KnowledgePanel.Reviewer', x: 6, y: 0, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountGlossary();
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Core terms');
    // The widget cell renders the GlossaryTermsWidget now (its table
    // carries the glossary-terms-table testid); the old view-owned
    // widget-cell table and its widget-term-row-* testids are gone.
    expect(wrapper.find('[data-testid="glossary-terms-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Revenue');
    expect(wrapper.text()).toContain('Cost');
    expect(wrapper.find('[data-testid="widget-reviewer"]').text()).toContain('Carol');
    expect(wrapper.find('[data-testid="glossary-description"]').exists()).toBe(false);
    // The rail aside is page chrome, not tab content: it stays visible.
    expect(wrapper.find('[data-testid="rail-domain"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the existing relations pane when a relations_graph entry resolves (non-mount tab)', async () => {
    stubWithDoc(
      glossaryDoc([
        {
          id: 'relations_graph',
          name: 'relations_graph',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountGlossary();
    const tabs = wrapper.find('[data-testid="glossary-tabs"]').findAll('.ant-tabs-tab');
    const relationsTab = tabs.find((tab) => tab.text().includes('Relations Graph'));
    expect(relationsTab).toBeDefined();
    await relationsTab!.trigger('click');
    await waitForRelationsPane(wrapper);
    // Relations is not the widget-layout tab: the entry never mounts a
    // grid, even with a layout. The default pane (relations graph)
    // stays.
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on terms only)', async () => {
    stubWithDoc(
      glossaryDoc([
        {
          id: 'terms',
          name: 'terms',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'review', name: 'review', layout: [] },
        { id: 'relations_graph', name: 'relations_graph', layout: [] },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountGlossary();
    // Mount tab: the grid replaces the terms pane.
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Core terms');
    expect(wrapper.find('[data-testid="glossary-description"]').exists()).toBe(false);
    // Relations tab keeps its existing pane once activated.
    const tabs = wrapper.find('[data-testid="glossary-tabs"]').findAll('.ant-tabs-tab');
    const relationsTab = tabs.find((tab) => tab.text().includes('Relations Graph'));
    await relationsTab!.trigger('click');
    await waitForRelationsPane(wrapper);
    expect(wrapper.find('[data-testid="ontology-graph-canvas"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual(['widget-description']);
    wrapper.unmount();
  });

  it('renders an empty grid when the entry carries no layout', async () => {
    stubWithDoc(glossaryDoc([{ id: 'terms', name: 'terms' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountGlossary();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.find('[data-testid="glossary-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('mounts the default widget grid without a customized entry (batch 6 unconditional mount)', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountGlossary();
    // Batch 6: terms is an unconditional-mount tab — with no customized
    // page the grid mounts with the default layout and the legacy
    // description + table panes are gone (the terms table now renders
    // inside the widget grid). Branch slots only: the shared cells
    // carry their own `widget-*-cell` root testids, which are not
    // branches.
    expect(
      widgetTestIds(wrapper).filter((id) => !id.endsWith('-cell')),
    ).toEqual([
      'widget-description',
      'widget-terms-table',
      'widget-domain',
      'widget-owners',
      'widget-reviewer',
      'widget-tags',
    ]);
    expect(wrapper.find('[data-testid="glossary-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="glossary-terms-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Core terms');
    wrapper.unmount();
  });
});

describe('GlossaryDetailView description gate (D-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountWithOps(operations: Array<{ operation: string; access: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaries/g1')) {
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
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/permissions/glossary/name/')) {
          return jsonResponse({ resource: 'glossary', permissions: operations });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView('g1');
    await flushPromises();
    await flushPromises();
    return wrapper;
  }

  it('shows the description edit button with EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'EditDescription', access: 'allow' }]);
    // Batch 6: the description renders in the widget grid now
    // (widget-description), not the retired glossary-description pane.
    expect(wrapper.find('[data-testid="widget-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the description edit button without EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'ViewBasic', access: 'allow' }]);
    expect(wrapper.find('[data-testid="widget-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
