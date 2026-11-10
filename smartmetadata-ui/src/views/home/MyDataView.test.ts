/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { ApiError } from '@/api/client';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import { useAuthStore } from '@/stores/auth';
import { PERSONA_STORAGE_KEY } from '@/stores/persona';
import MyDataView from './MyDataView.vue';

const searchAssets = vi.fn();
const postAggregateFieldOptions = vi.fn();
const getMyActivityFeed = vi.fn();
const listKpis = vi.fn();
const listDomains = vi.fn();
const getAllDomainsWithAssetsCount = vi.fn();
const getAllDataProductsWithAssetsCount = vi.fn();
const listSystemChartData = vi.fn();
const listPersonas = vi.fn();
const getDocumentByFqn = vi.fn();
const getServicesOverview = vi.fn();
const listIngestionPipelines = vi.fn();
const listMyAssignedTasks = vi.fn();
const listPipelineSummaries = vi.fn();
const listKnowledgePages = vi.fn();
const getDataQualityReport = vi.fn();
const listTestCasesBySearch = vi.fn();
const listAnnouncements = vi.fn();
const getResourcePermission = vi.fn();

vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return {
    ...actual,
    searchAssets: (...args: unknown[]) => searchAssets(...args),
    postAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args),
    postExactAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args),
  };
});
vi.mock('@/api/activity', () => ({
  getMyActivityFeed: (...args: unknown[]) => getMyActivityFeed(...args),
}));
const fetchAllKpis = vi.fn();
const listKpiResults = vi.fn();

vi.mock('@/api/kpi', () => ({
  listKpis: (...args: unknown[]) => listKpis(...args),
  fetchAllKpis: (...args: unknown[]) => fetchAllKpis(...args),
  listKpiResults: (...args: unknown[]) => listKpiResults(...args),
}));
vi.mock('@/api/domains', () => ({
  listDomains: (...args: unknown[]) => listDomains(...args),
  getAllDomainsWithAssetsCount: (...args: unknown[]) => getAllDomainsWithAssetsCount(...args),
}));
vi.mock('@/api/dataProducts', () => ({
  getAllDataProductsWithAssetsCount: (...args: unknown[]) =>
    getAllDataProductsWithAssetsCount(...args),
}));
vi.mock('@/api/dataInsights', () => ({
  listSystemChartData: (...args: unknown[]) => listSystemChartData(...args),
}));
vi.mock('@/api/services', () => ({
  getServicesOverview: (...args: unknown[]) => getServicesOverview(...args),
}));
vi.mock('@/api/ingestionPipelines', () => ({
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
}));
const resolveTask = vi.fn();

vi.mock('@/api/tasks', () => ({
  listMyAssignedTasks: (...args: unknown[]) => listMyAssignedTasks(...args),
  resolveTask: (...args: unknown[]) => resolveTask(...args),
}));
vi.mock('@/api/pipelines', () => ({
  listPipelineSummaries: (...args: unknown[]) => listPipelineSummaries(...args),
}));
vi.mock('@/api/contextCenter', () => ({
  listKnowledgePages: (...args: unknown[]) => listKnowledgePages(...args),
}));
vi.mock('@/api/dataQualityReports', () => ({
  getDataQualityReport: (...args: unknown[]) => getDataQualityReport(...args),
}));
vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));
vi.mock('@/api/announcements', () => ({
  listAnnouncements: (...args: unknown[]) => listAnnouncements(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));
vi.mock('@/stores/shellConfig', () => ({
  useShellConfigStore: () => ({ limit: { enable: false }, loadLimitConfig: vi.fn() }),
}));
vi.mock('@/api/persona', () => ({
  listPersonas: (...args: unknown[]) => listPersonas(...args),
}));
vi.mock('@/api/docStore', () => ({
  getDocumentByFqn: (...args: unknown[]) => getDocumentByFqn(...args),
  personaDocFqn: (fqn?: string | null) => (fqn ? `persona.${fqn}` : null),
}));

const emptySearch = { total: 0, hits: [], facets: [] };

function hit(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    fullyQualifiedName: `svc.db.schema.${name}`,
    entityType: 'table',
    owners: [],
    tags: [],
    ...extra,
  };
}

async function mountPage(options: { flush?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'u-1', name: 'admin', displayName: 'admin' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: MyDataView },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      { path: '/insights', name: 'insights', component: { template: '<div>insights</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push({ name: 'home' });
  await router.isReady();
  const wrapper = mount(MyDataView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  if (options.flush !== false) {
    // Settle the persona read and the data queries, then wait for the
    // registry's lazy widget components to land in every cell — a
    // fixed number of flushes is timing-dependent (cold dynamic
    // imports on the first run, an extra async hop for saved layouts).
    await flushPromises();
    await flushPromises();
    await vi.waitFor(
      () => {
        const cells = wrapper.findAll('[data-testid="home-widget-cell"]');
        expect(cells.length).toBeGreaterThan(0);
        for (const cell of cells) {
          expect(cell.find('[data-testid^="home-widget-"]').exists()).toBe(true);
        }
      },
      { timeout: 10000, interval: 50 },
    );
  }
  return { wrapper, router };
}

function setSelect(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], testId: string, value: unknown) {
  const select = wrapper.findComponent(`[data-testid="${testId}"]`);
  const vm = (select as unknown as { vm?: { $emit: (event: string, ...args: unknown[]) => void } }).vm;
  if (!vm) {
    throw new Error(`No component found for ${testId}`);
  }
  vm.$emit('change', value);
  vm.$emit('update:value', value);
}

/** The 13 default-layout cells, in layout order, with their titles.
 * Self-fetching widgets carry their layout key in the card test-id
 * (`home-widget-KnowledgePanel.<Key>`); PlatformHealth and
 * YoursAndFollowed keep their hardcoded ids. */
const DEFAULT_CELLS: Array<[string, string]> = [
  ['home-widget-platform-health', 'Platform Health'],
  ['home-widget-KnowledgePanel.DataEstate', 'Your data estate'],
  ['home-widget-KnowledgePanel.TotalAssets', 'Total data assets'],
  ['home-widget-KnowledgePanel.MyTask', 'My tasks'],
  ['home-widget-KnowledgePanel.PipelineStatus', 'Pipeline status'],
  ['home-widget-KnowledgePanel.ActivityFeed', 'Activity Feed'],
  ['home-widget-yours-and-followed', 'Yours and Followed'],
  ['home-widget-KnowledgePanel.KnowledgeCenter', 'Context Center'],
  ['home-widget-KnowledgePanel.CuratedAssets', 'Curated Assets'],
  ['home-widget-KnowledgePanel.DataQuality', 'Data Quality'],
  ['home-widget-KnowledgePanel.Domains', 'Domains'],
  ['home-widget-KnowledgePanel.DataProducts', 'Data Products'],
  ['home-widget-KnowledgePanel.KPI', 'KPI'],
];


function personaRow() {
  return { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' };
}

function personaDocumentWithLayout(layout: unknown[]) {
  return {
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: { pages: [{ pageType: 'LandingPage', layout }] },
  };
}

describe('MyDataView', () => {
  beforeEach(() => {
    localStorage.clear();
    // The widget-load cache is module-level: a chart fetched by an
    // earlier test would otherwise serve this test's widgets without
    // any call, and the range test's first-call window math would read
    // the wrong window.
    resetWidgetLoadCache();
    searchAssets.mockReset();
    postAggregateFieldOptions.mockReset();
    getMyActivityFeed.mockReset();
    listKpis.mockReset();
    fetchAllKpis.mockReset();
    listKpiResults.mockReset();
    resolveTask.mockReset();
    listDomains.mockReset();
    getAllDomainsWithAssetsCount.mockReset();
    getAllDataProductsWithAssetsCount.mockReset();
    listSystemChartData.mockReset();
    listPersonas.mockReset();
    getDocumentByFqn.mockReset();
    getServicesOverview.mockReset();
    listIngestionPipelines.mockReset();
    listMyAssignedTasks.mockReset();
    listPipelineSummaries.mockReset();
    listKnowledgePages.mockReset();
    getDataQualityReport.mockReset();
    listTestCasesBySearch.mockReset();
    listAnnouncements.mockReset();
    getResourcePermission.mockReset();
    // Every self-fetching widget lands on its empty state: the page
    // test asserts the 13 real cells render, not their data.
    postAggregateFieldOptions.mockResolvedValue({ buckets: [] });
    getMyActivityFeed.mockResolvedValue({ data: [], paging: { total: 0 } });
    listKpis.mockResolvedValue({ data: [] });
    fetchAllKpis.mockResolvedValue([]);
    listKpiResults.mockResolvedValue([]);
    resolveTask.mockResolvedValue({});
    listDomains.mockResolvedValue({ data: [{ name: 'finance', displayName: 'Finance' }] });
    getAllDomainsWithAssetsCount.mockResolvedValue({});
    getAllDataProductsWithAssetsCount.mockResolvedValue({});
    listSystemChartData.mockResolvedValue({});
    getServicesOverview.mockResolvedValue({ total: 0, data: [], healthCounts: {} });
    listIngestionPipelines.mockResolvedValue({ data: [], paging: { total: 0 } });
    listMyAssignedTasks.mockResolvedValue({ data: [], paging: { total: 0 } });
    listPipelineSummaries.mockResolvedValue({ data: [], paging: { total: 0 } });
    listKnowledgePages.mockResolvedValue({ data: [], paging: { total: 0 } });
    getDataQualityReport.mockResolvedValue({ aggregations: {} });
    listTestCasesBySearch.mockResolvedValue({ data: [], paging: { total: 0 } });
    listAnnouncements.mockResolvedValue({ data: [], paging: { total: 0 } });
    getResourcePermission.mockResolvedValue({});
    listPersonas.mockResolvedValue({ data: [], paging: { total: 0 } });
    getDocumentByFqn.mockRejectedValue(new ApiError(404, '', 'Not Found'));
    searchAssets.mockImplementation((query: string) => {
      if (String(query).includes('owners.id')) {
        return Promise.resolve({
          total: 2,
          hits: [hit('zeta', { updatedAt: 9 }), hit('alpha', { updatedAt: 1 })],
          facets: [],
        });
      }
      if (String(query).includes('followers:')) {
        return Promise.resolve({
          total: 1,
          hits: [hit('watched')],
          facets: [],
        });
      }
      return Promise.resolve({
        total: 22686,
        hits: [],
        facets: [
          {
            id: 'serviceType',
            field: 'serviceType',
            buckets: [
              { key: 'Mysql', count: 10 },
              { key: 'Postgres', count: 100 },
            ],
          },
          { id: 'service', field: 'service.displayName.keyword', buckets: [{ key: 'try_min2', count: 3 }] },
          { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 22686 }] },
        ],
      });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // The first mount in this file pays the one-time cost of
  // transforming the registry's six lazily imported widget chunks in
  // a fresh worker (single-run 1634ms; 5832ms under parallel load,
  // over the 5000ms default). Same precedent as AssetDetailView's
  // per-test 20000ms timeouts for heavy mounts.
  it('renders the 13-cell default grid: 13 real widgets, no placeholders', async () => {
    const { wrapper } = await mountPage();
    // D-2: the single welcome copy is the page-top greeting header;
    // the hero keeps only search, domain filter and service chips.
    expect(wrapper.get('[data-testid="home-landing-page-header"]').text()).toContain('Hi Admin');
    expect(wrapper.find('[data-testid="home-hero-welcome"]').exists()).toBe(false);
    for (const [testId, title] of DEFAULT_CELLS) {
      expect(wrapper.get(`[data-testid="${testId}"]`).text()).toContain(title);
    }
    const cells = wrapper.findAll('[data-testid="home-widget-cell"]');
    expect(cells).toHaveLength(13);
    expect(
      cells.map((cell) =>
        cell.find('[data-testid^="home-widget-"]').attributes('data-testid'),
      ),
    ).toEqual(DEFAULT_CELLS.map(([testId]) => testId));
    // The retired two-card shape is gone: no My Data / Following cards,
    // no old Data Assets / Activity / Total / Context card ids.
    for (const retired of [
      'home-widget-my-data',
      'home-widget-following',
      'home-widget-data-assets',
      'home-widget-activity',
      'home-widget-total',
      'home-widget-context',
      'home-context-empty',
    ]) {
      expect(wrapper.find(`[data-testid="${retired}"]`).exists()).toBe(false);
    }
    expect(wrapper.text()).not.toContain('Topics to catch up');
    // No live announcements: the rail stands down, the greeting header
    // is the only thing above the grid.
    expect(wrapper.find('[data-testid="announcements-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="critical-announcements"]').exists()).toBe(false);
  }, 20000);

  it('renders the default layout when there is no persona and never reads a document', async () => {
    const { wrapper } = await mountPage();
    expect(getDocumentByFqn).not.toHaveBeenCalled();
    expect(wrapper.findAll('[data-testid="home-widget-cell"]')).toHaveLength(13);
  });

  it('renders the default layout when the persona document 404s, without logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      localStorage.setItem(PERSONA_STORAGE_KEY, 'p1');
      listPersonas.mockResolvedValue({ data: [personaRow()], paging: { total: 1 } });
      const { wrapper } = await mountPage();
      expect(getDocumentByFqn).toHaveBeenCalledWith('persona.Analyst');
      expect(wrapper.findAll('[data-testid="home-widget-cell"]')).toHaveLength(13);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('renders a saved layout normalized: retired filtered, w/h forced, overflow reflowed', async () => {
    localStorage.setItem(PERSONA_STORAGE_KEY, 'p1');
    listPersonas.mockResolvedValue({ data: [personaRow()], paging: { total: 1 } });
    getDocumentByFqn.mockResolvedValue(
      personaDocumentWithLayout([
        { i: 'KnowledgePanel.KPI', x: 1, y: 0, w: 2, h: 6, static: false },
        { i: 'KnowledgePanel.MyData', x: 0, y: 0, w: 1, h: 3, static: false },
        { i: 'KnowledgePanel.ActivityFeed', x: 2, y: 0, w: 1, h: 3, static: false },
      ]),
    );
    const { wrapper } = await mountPage();
    expect(getDocumentByFqn).toHaveBeenCalledWith('persona.Analyst');
    const cells = wrapper.findAll('[data-testid="home-widget-cell"]');
    // Retired MyData is filtered; the overflowing ActivityFeed is
    // reflowed next to KPI, both forced to w:1 h:3.
    expect(cells).toHaveLength(2);
    expect(cells[0]?.attributes('style')).toContain('grid-column: 1');
    expect(cells[0]?.attributes('style')).toContain('grid-row: 1');
    expect(cells[0]?.find('[data-testid^="home-widget-"]').attributes('data-testid')).toBe(
      'home-widget-KnowledgePanel.KPI',
    );
    expect(cells[1]?.attributes('style')).toContain('grid-column: 2');
    expect(cells[1]?.attributes('style')).toContain('grid-row: 1');
    expect(cells[1]?.find('[data-testid^="home-widget-"]').attributes('data-testid')).toBe(
      'home-widget-KnowledgePanel.ActivityFeed',
    );
  });

  it('renders only the skeleton while the persona document is unresolved and issues no widget queries', async () => {
    let releasePersonas!: (value: unknown) => void;
    listPersonas.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePersonas = resolve;
        }),
    );
    const { wrapper } = await mountPage({ flush: false });
    expect(wrapper.find('[data-testid="home-landing-skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="home-landing-grid"]').exists()).toBe(false);
    expect(searchAssets).not.toHaveBeenCalled();
    expect(getMyActivityFeed).not.toHaveBeenCalled();
    expect(getServicesOverview).not.toHaveBeenCalled();
    expect(listKpis).not.toHaveBeenCalled();
    expect(listDomains).not.toHaveBeenCalled();
    expect(listSystemChartData).not.toHaveBeenCalled();
    releasePersonas({ data: [], paging: { total: 0 } });
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="home-landing-skeleton"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="home-landing-grid"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="home-widget-cell"]')).toHaveLength(13);
  });

  it('falls back to the default layout and logs a non-404 document read failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      localStorage.setItem(PERSONA_STORAGE_KEY, 'p1');
      listPersonas.mockResolvedValue({ data: [personaRow()], paging: { total: 1 } });
      getDocumentByFqn.mockRejectedValue(new Error('DocStore is down'));
      const { wrapper } = await mountPage();
      expect(errorSpy).toHaveBeenCalled();
      expect(wrapper.findAll('[data-testid="home-widget-cell"]')).toHaveLength(13);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shows empty-state CTAs when activity, KPI, and tracked lists have no rows', async () => {
    searchAssets.mockImplementation((query: string) => {
      if (String(query).includes('followers:')) {
        return Promise.resolve(emptySearch);
      }
      if (String(query).includes('owners.id')) {
        return Promise.resolve(emptySearch);
      }
      return Promise.resolve({
        total: 0,
        hits: [],
        facets: [{ id: 'serviceType', field: 'serviceType', buckets: [] }],
      });
    });
    const { wrapper } = await mountPage();
    // The cards render their shell while loading; the empty states
    // appear once each widget's own fetch resolves.
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.ActivityFeed-empty"]').text()).toContain(
        'All quiet in your domains',
      );
      expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.KPI-empty"]').text()).toContain('No KPIs yet');
    });
    // Both lists empty: the merged card opens on Owned.
    expect(wrapper.get('[data-testid="home-owned-empty"]').text()).toContain(
      'No owned assets returned for this user.',
    );
    setSelect(wrapper, 'home-tracked-filter', 'followed');
    await flushPromises();
    expect(wrapper.get('[data-testid="home-followed-empty"]').text()).toContain('Find Assets to Follow');
    expect(wrapper.find('[data-testid="home-owned-empty"]').exists()).toBe(false);
  });

  it('opens the merged card on Followed when only followed assets exist', async () => {
    searchAssets.mockImplementation((query: string) => {
      if (String(query).includes('owners.id')) {
        return Promise.resolve(emptySearch);
      }
      if (String(query).includes('followers:')) {
        return Promise.resolve({
          total: 1,
          hits: [hit('watched')],
          facets: [],
        });
      }
      return Promise.resolve(emptySearch);
    });
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="home-followed-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="home-owned-list"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="home-followed-watched"]').text()).toContain('watched');
  });

  it('submits hero search and domain scope to Explore, scoping both tracked queries', async () => {
    const { wrapper, router } = await mountPage();
    setSelect(wrapper, 'home-hero-domain', 'Finance');
    await flushPromises();
    const input = wrapper.get('[data-testid="home-hero-search"]');
    await input.setValue('orders');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
    expect(router.currentRoute.value.query).toMatchObject({ q: 'orders', domain: 'Finance' });
    // The domain scope combines with the in-card filter: both the owned
    // and the followed query carry it.
    const ownedScoped = searchAssets.mock.calls.filter(
      ([query]) =>
        String(query).includes('owners.id') &&
        String(query).includes('domains.displayName.keyword'),
    );
    const followedScoped = searchAssets.mock.calls.filter(
      ([query]) =>
        String(query).includes('followers:') &&
        String(query).includes('domains.displayName.keyword'),
    );
    expect(ownedScoped).toHaveLength(1);
    expect(followedScoped).toHaveLength(1);
  });

  it('navigates hero service chips and owned rows', async () => {
    const { wrapper, router } = await mountPage();
    await wrapper.get('[data-testid="home-hero-chip-try_min2"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ service: 'try_min2' });

    await router.push({ name: 'home' });
    await flushPromises();
    await wrapper.get('[data-testid="home-owned-alpha"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'table', fqn: 'svc.db.schema.alpha' });
  });

  it('opens View more into owned/followed search queries and sorts lists client-side', async () => {
    const { wrapper, router } = await mountPage();
    const ownedNames = () =>
      wrapper.findAll('[data-testid="home-owned-list"] [data-testid^="home-owned-"]').map((node) => node.text());
    expect(ownedNames()[0]).toContain('zeta');
    setSelect(wrapper, 'home-tracked-sort', 'name');
    await flushPromises();
    expect(ownedNames()[0]).toContain('alpha');
    setSelect(wrapper, 'home-tracked-sort', 'latest');
    await flushPromises();
    expect(ownedNames()[0]).toContain('zeta');

    await wrapper.get('[data-testid="home-owned-more"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe('owners.id:"u-1"');

    await router.push({ name: 'home' });
    await flushPromises();
    setSelect(wrapper, 'home-tracked-filter', 'followed');
    await flushPromises();
    await wrapper.get('[data-testid="home-followed-more"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.q).toBe('followers:"u-1"');
  });

  it('reloads the total-assets chart when the widget range control changes', async () => {
    // The window select only renders with data: give the live
    // fallback one entity-type bucket so the card leaves its empty state.
    postAggregateFieldOptions.mockImplementation((body: unknown) => {
      const fieldName = (body as { fieldName?: string } | null)?.fieldName;
      if (fieldName === 'entityType') {
        return Promise.resolve({
          aggregations: {
            'sterms#entityType': { buckets: [{ key: 'table', doc_count: 100 }] },
          },
        });
      }
      return Promise.resolve({ buckets: [] });
    });
    const { wrapper } = await mountPage();
    await vi.waitFor(() => {
      expect(
        wrapper.get('[data-testid="total-data-assets-window-filter"]').exists(),
      ).toBe(true);
    });
    expect(listSystemChartData).toHaveBeenCalledWith(
      ['total_data_assets', 'percentage_of_data_asset_with_description'],
      expect.any(Number),
      expect.any(Number),
      { strict: true },
    );
    const firstEnd = listSystemChartData.mock.calls[0]?.[2] as number;
    const firstStart = listSystemChartData.mock.calls[0]?.[1] as number;
    expect(firstEnd - firstStart).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    setSelect(wrapper, 'total-data-assets-window-filter', 30);
    await flushPromises();
    const secondStart = listSystemChartData.mock.calls.at(-1)?.[1] as number;
    const secondEnd = listSystemChartData.mock.calls.at(-1)?.[2] as number;
    expect(secondEnd - secondStart).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
  });
});
