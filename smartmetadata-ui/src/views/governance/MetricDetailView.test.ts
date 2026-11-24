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
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import AssetSelectionModal from '@/features/governance/AssetSelectionModal.vue';
import MetricDetailView from './MetricDetailView.vue';

const confirmDelete = vi.fn();

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: (...args: unknown[]) => confirmDelete(...args),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(extraPermissions: Array<{ operation: string; access: string }> = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/metrics/name/')) {
        return jsonResponse({
          id: 'm1',
          name: 'mau',
          displayName: 'Monthly Active Users',
          fullyQualifiedName: 'kpi.mau',
          description: 'Active users per month',
          metricType: 'NUMBER',
          unitOfMeasurement: 'users',
          granularity: 'MONTHLY',
          metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
          owners: [],
          tags: [],
          domains: [],
        });
      }
      if (url.includes('/api/v1/metrics/async/')) {
        return jsonResponse({ jobId: 'job-1' });
      }
      if (url.includes('/api/v1/metrics/m1/assets')) {
        return jsonResponse({
          data: [
            {
              asset: {
                id: 'a1',
                name: 'orders',
                fullyQualifiedName: 'svc.db.schema.orders',
                type: 'table',
              },
              direction: 'upstream',
              affectsHealth: true,
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 'a1',
                _source: {
                  id: 'a1',
                  name: 'orders',
                  displayName: 'Orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  entityType: 'table',
                },
              },
            ],
          },
          aggregations: {},
        });
      }
      if (url.includes('/v1/permissions/metric/name/')) {
        // D-4 header gate: the delete flow under test needs Delete.
        return jsonResponse({
          resource: 'metric',
          permissions: [{ operation: 'Delete', access: 'allow' }, ...extraPermissions],
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
      { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
      { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: { template: '<div>versions</div>' } },
    ],
  });
  await router.push('/governance/metrics/kpi.mau');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(MetricDetailView, {
    props: { fqn: 'kpi.mau' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MetricDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    confirmDelete.mockReset();
  });

  it('renders metric definition fields from the entity endpoint', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Monthly Active Users');
    expect(wrapper.text()).toContain('count(distinct user_id)');
    // The definition widget renders the pin enum labels (mono uppercase).
    expect(wrapper.text()).toContain('Number');
    expect(wrapper.text()).toContain('Monthly');
  });

  it('navigates to the Stage 2 version skeleton', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metric-versions"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset-version');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'metric', fqn: 'kpi.mau' });
  });

  it('deletes recursively and warns that variants go with the metric (A-D5)', async () => {
    confirmDelete.mockResolvedValue(true);
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metric-delete"]').trigger('click');
    await flushPromises();
    expect(confirmDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('variants will be deleted as well'),
      }),
    );
    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]).includes('/api/v1/metrics/async/'));
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('recursive=true');
    expect(router.currentRoute.value.name).toBe('governance-metrics');
  });

  it('does not delete when the confirmation is dismissed', async () => {
    confirmDelete.mockResolvedValue(false);
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-delete"]').trigger('click');
    await flushPromises();
    expect(
      vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/api/v1/metrics/async/')),
    ).toBe(false);
  });

  it('retries the failed load from the error-action slot (M-3)', async () => {
    // The shell migration dropped the SmState retry; the retry button in
    // the shell's error-action slot must re-run load() and recover.
    let metricCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metrics/name/')) {
          // L3: the embedded LineageCanvas fetches the same detail
          // endpoint once per entity for its Layers-panel context
          // (fields=domains,dataProducts,service). That call is not one
          // of the page's loads, so it is answered separately and never
          // counted; the count below still pins load() to exactly two
          // runs (mount + retry).
          if (url.includes('fields=domains%2CdataProducts%2Cservice')) {
            return jsonResponse({ id: 'm1', fullyQualifiedName: 'kpi.mau', domains: [] });
          }
          metricCalls += 1;
          if (metricCalls === 1) {
            return new Response('boom', { status: 500 });
          }
          return jsonResponse({
            id: 'm1',
            name: 'mau',
            displayName: 'Monthly Active Users',
            fullyQualifiedName: 'kpi.mau',
            description: 'Active users per month',
            metricType: 'NUMBER',
            unitOfMeasurement: 'users',
            granularity: 'MONTHLY',
            metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
            owners: [],
            tags: [],
            domains: [],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
        { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
      ],
    });
    await router.push('/governance/metrics/kpi.mau');
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(MetricDetailView, {
      props: { fqn: 'kpi.mau' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="entity-detail-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(false);
    await wrapper.get('[data-testid="metric-retry"]').trigger('click');
    await flushPromises();
    expect(metricCalls).toBe(2);
    expect(wrapper.find('[data-testid="entity-detail-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Monthly Active Users');
  });
});

describe('MetricDetailView tab surface + widget grid (B-11)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function metricDoc(tabs: unknown[]) {
    return {
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: { pages: [{ pageType: 'Metric', tabs }] },
    };
  }

  function stubWithDoc(doc: Record<string, unknown> | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metrics/name/')) {
          return jsonResponse({
            id: 'm1',
            name: 'mau',
            displayName: 'Monthly Active Users',
            fullyQualifiedName: 'kpi.mau',
            description: 'Active users per month',
            metricType: 'NUMBER',
            unitOfMeasurement: 'users',
            granularity: 'MONTHLY',
            metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
            owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
            tags: [
              { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
              { tagFQN: 'Business.term', name: 'term', source: 'Glossary' },
            ],
            domains: [{ id: 'dom1', name: 'growth', displayName: 'Growth' }],
            extension: {},
          });
        }
        if (url.includes('/api/v1/activity/entity/metric/')) {
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
        if (url.includes('/api/v1/metadata/types/name/metric/customProperties')) {
          return jsonResponse([{ name: 'sensitivity', propertyType: 'string' }]);
        }
        if (url.includes('/api/v1/metrics/m1/assets')) {
          return jsonResponse({
            data: [
              {
                asset: {
                  id: 'a1',
                  name: 'orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  type: 'table',
                },
                direction: 'upstream',
                affectsHealth: true,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [
                {
                  _id: 'a1',
                  _source: {
                    id: 'a1',
                    name: 'orders',
                    displayName: 'Orders',
                    fullyQualifiedName: 'svc.db.schema.orders',
                    entityType: 'table',
                  },
                },
              ],
            },
            aggregations: {},
          });
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

  async function mountMetric() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
        { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
        { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: { template: '<div>versions</div>' } },
      ],
    });
    await router.push('/governance/metrics/kpi.mau');
    await router.isReady();
    const wrapper = mount(MetricDetailView, {
      props: { fqn: 'kpi.mau' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  function tabLabels(wrapper: Awaited<ReturnType<typeof mountMetric>>): string[] {
    return wrapper.find('.ant-tabs-nav').findAll('.ant-tabs-tab').map((tab) => tab.text().trim());
  }

  function widgetTestIds(wrapper: Awaited<ReturnType<typeof mountMetric>>): string[] {
    return wrapper
      .findAll('[data-testid^="widget-"]')
      .map((node) => node.attributes('data-testid') as string);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the five official tabs with the overview content by default', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    expect(tabLabels(wrapper)).toEqual([
      'Overview',
      'Lineage',
      'Assets1',
      'Activity feed',
      'Custom Properties',
    ]);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(true);
    // B2-G1: the assets tab is served now — one linked asset, count pill 1.
    expect(wrapper.find('[data-testid="metric-tab-assets-count"]').text()).toBe('1');
    expect(wrapper.find('[data-testid="metric-assets-tab"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Orders');
    // The lineage pane embeds the shared canvas (toolbar proves the mount;
    // the graph itself is the canvas component's own concern).
    expect(wrapper.find('[data-testid="upstream-depth"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('passes the fetched EditLineage flag into the lineage tab canvas (L6)', async () => {
    const { wrapper } = await mountView();
    await flushPromises();
    const canvas = wrapper.findComponent(LineageCanvas);
    expect(canvas.exists()).toBe(true);
    // The default stub grants Delete only, so the tab canvas is read-only.
    expect(canvas.props('hasEditAccess')).toBe(false);
    wrapper.unmount();
  });

  it('passes hasEditAccess=true to the lineage tab canvas when EditLineage is allowed (L6)', async () => {
    const { wrapper } = await mountView([{ operation: 'EditLineage', access: 'allow' }]);
    await flushPromises();
    const canvas = wrapper.findComponent(LineageCanvas);
    expect(canvas.exists()).toBe(true);
    expect(canvas.props('hasEditAccess')).toBe(true);
    wrapper.unmount();
  });

  it('renders the widget grid on overview from a customized Metric page', async () => {
    stubWithDoc(
      metricDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [
            { i: 'KnowledgePanel.MetricDefinition', x: 0, y: 0, w: 6, h: 2 },
            { i: 'KnowledgePanel.Description', x: 6, y: 0, w: 2, h: 1 },
          ],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    const definition = wrapper.find('[data-testid="widget-metric-definition"]');
    // The definition widget renders the pin enum labels (mono uppercase).
    expect(definition.text()).toContain('Number');
    expect(definition.text()).toContain('Monthly');
    expect(definition.find('[data-testid="metric-expression-code"]').text()).toContain(
      'count(distinct user_id)',
    );
    expect(wrapper.find('[data-testid="widget-description"]').text()).toContain('Active users per month');
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('reorders and renames tabs from the persona Metric page, dropping unlisted tabs', async () => {
    stubWithDoc(
      metricDoc([
        { id: 'activity_feed', name: 'activity_feed', displayName: 'Feed' },
        { id: 'overview', name: 'overview' },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    // F-2: replacement semantics — only the customized tabs render.
    expect(tabLabels(wrapper)).toEqual(['Feed', 'Overview']);
    wrapper.unmount();
  });

  it('renders no tab bar for an explicitly empty Metric tab list without throwing (m-2)', async () => {
    stubWithDoc(metricDoc([]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    expect(wrapper.find('.ant-tabs-nav').exists()).toBe(false);
    expect(wrapper.text()).toContain('Monthly Active Users');
    wrapper.unmount();
  });

  it('renders an empty grid when the entry carries no layout', async () => {
    stubWithDoc(metricDoc([{ id: 'overview', name: 'overview' }]));
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    expect(widgetTestIds(wrapper)).toEqual([]);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads activity through the generic activity APIs', async () => {
    stubWithDoc(null);
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/api/v1/activity/entity/metric/name/'))).toBe(true);
    expect(calls.some((url) => url.includes('/api/v1/conversations'))).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').text()).toContain('description changed');
    wrapper.unmount();
  });

  it('keeps existing panels on non-mount tabs when their entries resolve', async () => {
    stubWithDoc(
      metricDoc([
        { id: 'assets', name: 'assets', layout: [] },
        {
          id: 'lineage',
          name: 'lineage',
          layout: [{ i: 'KnowledgePanel.Description', x: 0, y: 0, w: 6, h: 1 }],
        },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    // Neither assets nor lineage is the widget-layout tab: no grid mounts.
    // The unlisted overview tab is removed (F-2), so its details pane
    // is gone while the listed non-mount panes stay.
    expect(wrapper.find('[data-testid="metric-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="upstream-depth"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(false);
    expect(widgetTestIds(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('keeps every non-mount tab intact for an editor-saved page (all tabs, layout on overview only)', async () => {
    stubWithDoc(
      metricDoc([
        {
          id: 'overview',
          name: 'overview',
          layout: [{ i: 'KnowledgePanel.MetricDefinition', x: 0, y: 0, w: 6, h: 2 }],
        },
        { id: 'lineage', name: 'lineage', layout: [] },
        { id: 'assets', name: 'assets', layout: [] },
        { id: 'activity_feed', name: 'activity_feed', layout: [] },
        { id: 'custom_properties', name: 'custom_properties', layout: [] },
      ]),
    );
    localStorage.setItem('sm.persona.v1', 'p1');
    const wrapper = await mountMetric();
    // Mount tab: the grid replaces the overview pane.
    expect(wrapper.find('[data-testid="widget-metric-definition"]').text()).toContain('Number');
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(false);
    expect(widgetTestIds(wrapper)).toEqual(['widget-metric-definition']);
    // Every other tab keeps its existing panel.
    expect(wrapper.find('[data-testid="upstream-depth"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-activity-table"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('MetricDetailView description gate + PATCH save (D-3/D-4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    confirmDelete.mockReset();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function mountWithOps(operations: Array<{ operation: string; access: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metrics/name/')) {
          return jsonResponse({
            id: 'm1',
            name: 'mau',
            displayName: 'Monthly Active Users',
            fullyQualifiedName: 'kpi.mau',
            description: 'Active users per month',
            metricType: 'NUMBER',
            unitOfMeasurement: 'users',
            granularity: 'MONTHLY',
            metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
            owners: [],
            tags: [],
            domains: [],
          });
        }
        if (url.includes('/v1/permissions/metric/name/')) {
          return jsonResponse({ resource: 'metric', permissions: operations });
        }
        if (url.includes('/api/v1/activity/entity/metric/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/metadata/types/name/metric/customProperties')) {
          return jsonResponse([]);
        }
        if (url.includes('/api/v1/metrics/m1/assets')) {
          return jsonResponse({
            data: [
              {
                asset: {
                  id: 'a1',
                  name: 'orders',
                  fullyQualifiedName: 'svc.db.schema.orders',
                  type: 'table',
                },
                direction: 'upstream',
                affectsHealth: true,
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/search/query')) {
          return jsonResponse({
            hits: {
              total: { value: 1 },
              hits: [
                {
                  _id: 'a1',
                  _source: {
                    id: 'a1',
                    name: 'orders',
                    displayName: 'Orders',
                    fullyQualifiedName: 'svc.db.schema.orders',
                    entityType: 'table',
                  },
                },
              ],
            },
            aggregations: {},
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
        { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
        { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: { template: '<div>versions</div>' } },
      ],
    });
    await router.push('/governance/metrics/kpi.mau');
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(MetricDetailView, {
      props: { fqn: 'kpi.mau' },
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

  it('saves the description with PATCH /v1/metrics/{id} (official patchMetric)', async () => {
    const wrapper = await mountWithOps([{ operation: 'EditDescription', access: 'allow' }]);
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    // The modal editor applies its content on a 0ms timer before save reads it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await wrapper.vm.$nextTick();
    const save = document.body.querySelector('[data-testid="save"]') as HTMLElement | null;
    expect(save).not.toBeNull();
    save?.click();
    await flushPromises();
    await flushPromises();
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => String(url).includes('/api/v1/metrics/m1') && init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    const body = JSON.parse(String((patchCall?.[1] as RequestInit)?.body ?? '[]')) as Array<Record<string, unknown>>;
    expect(body.some((op) => op.path === '/description')).toBe(true);
    expect(String(body.find((op) => op.path === '/description')?.value)).toContain('Active users per month');
    wrapper.unmount();
  });
});

describe('MetricDetailView assets tab (B2-G1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function linkedAssetsResponse(): Response {
    return jsonResponse({
      data: [
        {
          asset: {
            id: 'a1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            type: 'table',
          },
          direction: 'upstream',
          affectsHealth: true,
        },
      ],
      paging: { total: 1 },
    });
  }

  function searchResponse(): Response {
    return jsonResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'a1',
            _source: {
              id: 'a1',
              name: 'orders',
              displayName: 'Orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
            },
          },
        ],
      },
      aggregations: {},
    });
  }

  async function mountAssetsView(
    operations: Array<{ operation: string; access: string }> = [],
    assetsResponder?: (callCount: number) => Response,
  ) {
    let assetsCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/metrics/name/')) {
          return jsonResponse({
            id: 'm1',
            name: 'mau',
            displayName: 'Monthly Active Users',
            fullyQualifiedName: 'kpi.mau',
            description: 'Active users per month',
            metricType: 'NUMBER',
            unitOfMeasurement: 'users',
            granularity: 'MONTHLY',
            metricExpression: { language: 'SQL', code: 'count(distinct user_id)' },
            owners: [],
            tags: [],
            domains: [],
          });
        }
        if (url.includes('/v1/permissions/metric/name/')) {
          return jsonResponse({ resource: 'metric', permissions: operations });
        }
        if (url.includes('/api/v1/activity/entity/metric/')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/conversations')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/metadata/types/name/metric/customProperties')) {
          return jsonResponse([]);
        }
        if (url.includes('/api/v1/metrics/m1/assets')) {
          assetsCalls += 1;
          return assetsResponder ? assetsResponder(assetsCalls) : linkedAssetsResponse();
        }
        if (url.includes('/api/v1/search/query')) {
          return searchResponse();
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/metrics', name: 'governance-metrics', component: { template: '<div>list</div>' } },
        { path: '/governance/metrics/:fqn', name: 'governance-metric', component: MetricDetailView, props: true },
        { path: '/assets/:entityType/:fqn/versions', name: 'asset-version', component: { template: '<div>versions</div>' } },
      ],
    });
    await router.push('/governance/metrics/kpi.mau');
    await router.isReady();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(MetricDetailView, {
      props: { fqn: 'kpi.mau' },
      attachTo: document.body,
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  it('lists the linked assets from getMetricAssets with the tab count and the ids filter', async () => {
    const wrapper = await mountAssetsView();
    expect(wrapper.find('[data-testid="metric-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-tab-assets-count"]').text()).toBe('1');
    expect(wrapper.text()).toContain('Orders');
    const assetsCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]).includes('/api/v1/metrics/m1/assets'));
    expect(assetsCall).toBeDefined();
    expect(String(assetsCall?.[0])).toContain('limit=1000');
    const searchCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]).includes('/api/v1/search/query'));
    expect(searchCall).toBeDefined();
    const filter = JSON.parse(
      new URL(String(searchCall?.[0])).searchParams.get('query_filter') ?? '{}',
    ) as unknown;
    expect(filter).toEqual({
      query: { bool: { must: [{ ids: { values: ['a1'] } }] } },
    });
    wrapper.unmount();
  });

  it('shows the Add Assets button with EditAll and hides it without', async () => {
    const withEdit = await mountAssetsView([{ operation: 'EditAll', access: 'allow' }]);
    expect(withEdit.find('[data-testid="metric-add-assets"]').exists()).toBe(true);
    withEdit.unmount();
    const withoutEdit = await mountAssetsView([{ operation: 'ViewBasic', access: 'allow' }]);
    expect(withoutEdit.find('[data-testid="metric-add-assets"]').exists()).toBe(false);
    withoutEdit.unmount();
  });

  it('opens the asset picker from the header button', async () => {
    const wrapper = await mountAssetsView([{ operation: 'EditAll', access: 'allow' }]);
    await wrapper.get('[data-testid="metric-add-assets"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(wrapper.findComponent(AssetSelectionModal).exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows a retry state when the linked-assets fetch fails and recovers on retry', async () => {
    const wrapper = await mountAssetsView([], (callCount) =>
      callCount === 1 ? new Response('boom', { status: 500 }) : linkedAssetsResponse(),
    );
    expect(wrapper.find('[data-testid="metric-assets-error"]').exists()).toBe(true);
    // A failed fetch never masquerades as "no assets": no count pill.
    expect(wrapper.find('[data-testid="metric-tab-assets-count"]').exists()).toBe(false);
    await wrapper.get('[data-testid="metric-assets-retry"]').trigger('click');
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="metric-assets-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="metric-assets-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-tab-assets-count"]').text()).toBe('1');
    wrapper.unmount();
  });
});
