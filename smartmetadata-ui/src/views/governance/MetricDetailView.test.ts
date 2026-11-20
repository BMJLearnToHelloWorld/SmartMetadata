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

async function mountView() {
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
      'Assets',
      'Activity feed',
      'Custom Properties',
    ]);
    expect(wrapper.find('[data-testid="metric-details"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-tab-residual"]').text()).toContain(
      'Metric assets are not served by this console yet.',
    );
    // The lineage pane embeds the shared canvas (toolbar proves the mount;
    // the graph itself is the canvas component's own concern).
    expect(wrapper.find('[data-testid="upstream-depth"]').exists()).toBe(true);
    expect(widgetTestIds(wrapper)).toEqual([]);
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
    expect(wrapper.find('[data-testid="asset-tab-residual"]').text()).toContain(
      'Metric assets are not served by this console yet.',
    );
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
    expect(wrapper.find('[data-testid="asset-tab-residual"]').exists()).toBe(true);
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
