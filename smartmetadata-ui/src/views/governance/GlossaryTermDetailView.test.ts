/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import GlossaryTermDetailView from './GlossaryTermDetailView.vue';

// B-15: the relations-graph slot mounts the real term-scope graph, whose
// canvas dynamically imports @antv/g6; the mock only keeps Vite from
// resolving the uninstalled package (canvas behaviour is covered by
// OntologyGraphCanvas.test.ts, term-scope behaviour by
// OntologyTermRelationsGraph.test.ts).
vi.mock('@antv/g6', () => ({
  Graph: class {},
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GlossaryTermDetailView tabs + widget grid (B-7)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function termDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'GlossaryTerm', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/glossaryTerms/term1/assets')) {
          return jsonResponse({
            data: [{ id: 'a1', name: 'orders', type: 'table', fullyQualifiedName: 'svc.db.orders' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/glossaryTerms/term1')) {
          return jsonResponse({
            id: 'term1',
            name: 'revenue',
            displayName: 'Revenue',
            description: 'Money in',
            fullyQualifiedName: 'Business.revenue',
            glossary: { id: 'g1', name: 'Business', displayName: 'Business' },
            relatedTerms: [
              { id: 'r1', name: 'profit', displayName: 'Profit', fullyQualifiedName: 'Business.profit', type: 'glossaryTerm' },
            ],
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            reviewers: [{ id: 'u2', name: 'carol', displayName: 'Carol' }],
            domains: [{ id: 'd1', name: 'marketing', displayName: 'Marketing' }],
            synonyms: ['income', 'sales'],
            references: [
              { name: 'HealthCare.gov', endpoint: 'https://example.com/glossary' },
              { name: 'Unsafe', endpoint: 'javascript:alert(1)' },
            ],
            tags: [
              { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
              { tagFQN: 'Business.term', name: 'term', source: 'Glossary' },
              { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            ],
            children: [
              { id: 'c1', name: 'arr', displayName: 'ARR', type: 'glossaryTerm', fullyQualifiedName: 'Business.revenue.arr' },
            ],
            entityStatus: 'Approved',
            usageCount: 3,
          });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/entity/glossaryTerm/')) {
          return jsonResponse({
            data: [
              {
                id: 'e1',
                eventType: 'EntityUpdated',
                summary: 'description changed',
                timestamp: 1700000000000,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return doc ? jsonResponse(doc) : new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function mountTerm() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/glossaries', name: 'governance-glossaries', component: { template: '<div>list</div>' } },
        { path: '/governance/glossaries/:id', name: 'governance-glossary', component: { template: '<div>glossary</div>' } },
        { path: '/governance/terms/:id', name: 'governance-term', component: { template: '<div>term</div>' } },
      ],
    });
    await router.push('/governance/terms/term1');
    await router.isReady();
    const wrapper = mount(GlossaryTermDetailView, {
      props: { id: 'term1' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return { wrapper, router };
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountTerm>>['wrapper']): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  function widgetTestIds(wrapper: Awaited<ReturnType<typeof mountTerm>>['wrapper']): string[] {
    return wrapper
      .findAll('[data-testid^="widget-"]')
      .map((node) => node.attributes('data-testid') as string);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the seven official tabs with the existing content by default', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Glossary Terms',
      'Assets',
      'Activity feed',
      'Relations Graph',
      'Custom Properties',
      'Data Observability',
    ]);
    expect(wrapper.find('[data-testid="term-status"]').text()).toContain('Approved');
    expect(wrapper.find('[data-testid="term-children-table"]').text()).toContain('ARR');
    expect(wrapper.find('[data-testid="term-assets-table"]').text()).toContain('orders');
    expect(wrapper.find('[data-testid="term-versions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-term"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="delete-term"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
    // Relations graph is fixed content now (B-15); custom properties
    // and data observability have no product backing: two honest
    // residual states, distinctly stated.
    const residuals = wrapper.findAll('[data-testid="asset-tab-residual"]');
    expect(residuals).toHaveLength(2);
    expect(new Set(residuals.map((node) => node.text()))).toHaveLength(2);
    wrapper.unmount();
  });

  it('navigates to a child term from the children table', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper, router } = await mountTerm();
    const links = wrapper.find('[data-testid="term-children-table"]').findAll('a');
    const childLink = links.find((link) => link.text().includes('ARR'));
    expect(childLink).toBeDefined();
    await childLink!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-term');
    expect(router.currentRoute.value.params).toMatchObject({ id: 'c1' });
    wrapper.unmount();
  });

  it('reorders and renames tabs from the persona GlossaryTerm page, dropping unlisted tabs', async () => {
    stubWithDoc(
      termDoc([
        { id: 'assets', name: 'assets', displayName: 'Linked' },
        { id: 'overview', name: 'overview' },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    // F-2: replacement semantics — only the customized tabs render.
    expect(tabLabels(wrapper)).toEqual(['Linked', 'Overview']);
    wrapper.unmount();
  });

  it('renders no tab bar for an explicitly empty GlossaryTerm tab list without throwing (m-2)', async () => {
    stubWithDoc(termDoc([]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.text()).toContain('Revenue');
    wrapper.unmount();
  });

  it('renders widget branches from a customized GlossaryTerm page', async () => {
    stubWithDoc(
      termDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [
            { i: 'KnowledgePanel.RelatedTerms', x: 0, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Owner', x: 2, y: 0, w: 2, h: 1 },
            // Dispatch quirk (detailWidgetDispatch.ts): on GlossaryTerm
            // pages KnowledgePanel.Owners resolves to OWNER, because the
            // per-type OWNER startsWith check runs before the common
            // OWNERS registry entry.
            { i: 'KnowledgePanel.Owners', x: 4, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Description', x: 6, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Tags', x: 0, y: 1, w: 2, h: 1 },
            { i: 'KnowledgePanel.Tier', x: 2, y: 1, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(wrapper.find('[data-testid="widget-related-terms"]').text()).toContain('Profit');
    expect(wrapper.findAll('[data-testid="widget-owner"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Money in');
    const tags = wrapper.find('[data-testid="widget-tags"]');
    expect(tags.text()).toContain('PII.Sensitive');
    expect(tags.text()).not.toContain('Business.term');
    expect(wrapper.find('[data-testid="widget-tier"]').text()).toContain('Tier.Tier1');
    wrapper.unmount();
  });

  it('renders the reviewer, domain, synonyms, and references widgets from the mapped term fields', async () => {
    // B-2: reviewers/domains were requested (GLOSSARY_TERM_FIELDS) but
    // dropped by mapTerm, and synonyms/references were dropped too; the
    // four widget branches render the mapped fields. References render
    // as links only for safe http(s) endpoints (official ReferenceBadge
    // form); an unsafe endpoint renders as plain text, never a link.
    stubWithDoc(
      termDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [
            { i: 'KnowledgePanel.Reviewer', x: 0, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Domain', x: 2, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.Synonyms', x: 4, y: 0, w: 2, h: 1 },
            { i: 'KnowledgePanel.References', x: 6, y: 0, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(wrapper.find('[data-testid="widget-reviewer"]').text()).toContain('Carol');
    expect(wrapper.find('[data-testid="widget-domain"]').text()).toContain('Marketing');
    const synonyms = wrapper.find('[data-testid="widget-synonyms"]');
    expect(synonyms.text()).toContain('income');
    expect(synonyms.text()).toContain('sales');
    const references = wrapper.find('[data-testid="widget-references"]');
    const links = references.findAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].text()).toBe('HealthCare.gov');
    expect(links[0].attributes('href')).toBe('https://example.com/glossary');
    expect(references.text()).toContain('Unsafe');
    wrapper.unmount();
  });

  it('replaces the overview pane with the grid when an entry resolves', async () => {
    stubWithDoc(
      termDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [{ i: 'KnowledgePanel.Tags', x: 0, y: 0, w: 2, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(wrapper.find('[data-testid="widget-tags"]').exists()).toBe(true);
    // Description and related terms live only in the default overview
    // pane (this layout carries neither widget).
    expect(wrapper.text()).not.toContain('Money in');
    expect(wrapper.text()).not.toContain('Profit');
    wrapper.unmount();
  });

  it('renders an empty grid when the entry carries no layout', async () => {
    stubWithDoc(termDoc([{ id: 'overview', name: 'overview' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.text()).not.toContain('Money in');
    wrapper.unmount();
  });

  it('loads activity through the generic activity APIs', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/api/v1/activity/entity/glossaryTerm/name/'))).toBe(true);
    expect(calls.some((url) => url.includes('/api/v1/conversations'))).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').text()).toContain('description changed');
    wrapper.unmount();
  });

  it('keeps existing panels on non-mount tabs when their entries resolve', async () => {
    stubWithDoc(
      termDoc([
        {
          id: 'assets',
          name: 'assets',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'custom_properties', name: 'custom_properties', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    // Only overview mounts a grid: assets keeps its table and the
    // listed custom-properties tab keeps its residual state. The
    // unlisted tabs — overview included — are removed (F-2), so only
    // one residual renders and the overview description is gone.
    expect(wrapper.find('[data-testid="term-assets-table"]').text()).toContain('orders');
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Money in');
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on overview only)', async () => {
    stubWithDoc(
      termDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
        { id: 'glossary_terms', name: 'glossary_terms', layout: [] },
        { id: 'assets', name: 'assets', layout: [] },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
        { id: 'relations_graph', name: 'relations_graph', layout: [] },
        { id: 'custom_properties', name: 'custom_properties', layout: [] },
        { id: 'data_observability', name: 'data_observability', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountTerm();
    // Mount tab: the grid replaces the overview pane.
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Money in');
    expect(widgetTestIds(wrapper)).toEqual(['widget-description']);
    // Every other tab keeps its existing panel; relations graph is
    // fixed content now (B-15), so only custom properties and data
    // observability still render residuals.
    expect(wrapper.find('[data-testid="term-children-table"]').text()).toContain('ARR');
    expect(wrapper.find('[data-testid="term-assets-table"]').text()).toContain('orders');
    expect(wrapper.findAll('[data-testid="asset-tab-residual"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('GlossaryTermDetailView description gate (D-4)', () => {
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
        if (url.includes('/api/v1/glossaryTerms/term1/assets')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/glossaryTerms/term1')) {
          return jsonResponse({
            id: 'term1',
            name: 'revenue',
            displayName: 'Revenue',
            description: 'Money in',
            fullyQualifiedName: 'Business.revenue',
            glossary: { id: 'g1', name: 'Business', displayName: 'Business' },
            relatedTerms: [],
            owners: [],
            reviewers: [],
            domains: [],
            synonyms: [],
            references: [],
            tags: [],
            children: [],
            entityStatus: 'Approved',
          });
        }
        if (url.includes('/api/v1/glossaryTerms')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/activity/entity/glossaryTerm/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/permissions/glossaryTerm/name/')) {
          return jsonResponse({ resource: 'glossaryTerm', permissions: operations });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/terms', name: 'governance-terms', component: { template: '<div>list</div>' } },
        { path: '/governance/terms/:id', name: 'governance-term', component: GlossaryTermDetailView, props: true },
      ],
    });
    await router.push('/governance/terms/term1');
    await router.isReady();
    const wrapper = mount(GlossaryTermDetailView, {
      props: { id: 'term1' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  it('shows the description edit button with EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'EditDescription', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the description edit button without EditDescription', async () => {
    const wrapper = await mountWithOps([{ operation: 'ViewBasic', access: 'allow' }]);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
