/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { isCsvJobOwned } from '@/api/csvJobs';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { dataQualityContextKey, type DataQualityCreateActions } from '@/quality/dataQualityContext';
import TestCasesListView from './TestCasesListView.vue';


function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView(options: { props?: Record<string, unknown> } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
    ],
  });
  await router.push('/quality/test-cases');
  await router.isReady();
  const createActions = computed<DataQualityCreateActions>(() => ({
    canCreateTestCase: true,
    canCreateBundleSuite: true,
    onAddTestCase: () => {},
    onAddBundleSuite: () => {},
  }));
  const wrapper = mount(TestCasesListView, {
    props: { embedded: true, preferSearch: true, ...options.props },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      provide: {
        [dataQualityContextKey as symbol]: computed(() => ({
          isActive: true,
          createActions: createActions.value,
        })),
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestCasesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                entityFQN: 'svc.db.schema.orders',
                testCaseResult: { testCaseStatus: 'Success' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({ data: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders test cases and latest status from GET /v1/dataQuality/testCases', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('row_count');
    expect(wrapper.text()).toContain('Success');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-manage"]').exists()).toBe(true);
  });

  it('opens test case detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="test-case-row-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('exposes status and search filters', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-cases-status-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-list-search"]').exists()).toBe(true);
  });
});

vi.mock('@/components/quality/TestCaseFormDrawer.vue', () => ({
  default: {
    name: 'TestCaseFormDrawer',
    props: ['open', 'testCase'],
    emits: ['cancel', 'submitted'],
    template: '<div v-if="open" data-testid="test-case-form-drawer" />',
  },
}));

vi.mock('@/components/quality/TestCaseDeleteModal.vue', () => ({
  default: {
    name: 'TestCaseDeleteModal',
    props: ['open', 'name'],
    emits: ['cancel', 'confirm'],
    template: '<div v-if="open" data-testid="test-case-delete-modal" />',
  },
}));

describe('TestCasesListView official list chrome', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                fullyQualifiedName: 'svc.db.schema.orders.row_count',
                entityFQN: 'svc.db.schema.orders',
                entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
                testCaseResult: { testCaseStatus: 'Failed', result: 'expected 10 got 12', timestamp: 1 },
                incidentStatus: {
                  id: 'inc1',
                  testCaseResolutionStatusType: 'New',
                  stateId: 'state-1',
                },
              },
            ],
            paging: { total: 1 },
            entityPermissions: {
              tc1: {
                resource: 'testCase',
                permissions: [{ operation: 'EditStatus', access: 'allow' }],
              },
            },
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

  it('shows official filters, deleted toggle, manage actions, and result columns', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-cases-advanced"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-table-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-type-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-tag-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-show-deleted"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-manage"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('expected 10 got 12');
    expect(wrapper.find('[data-testid="test-case-list-incident-tc1"]').exists()).toBe(true);
  });

  it('routes empty-state create through landing createActions (DataQualityTab)', async () => {
    const add = vi.fn();
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView }],
    });
    await router.push('/quality/test-cases');
    await router.isReady();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    const wrapper = mount(TestCasesListView, {
      props: { embedded: true, preferSearch: true },
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
        provide: {
          [dataQualityContextKey as symbol]: computed(() => ({
            isActive: true,
            createActions: {
              canCreateTestCase: true,
              canCreateBundleSuite: false,
              onAddTestCase: add,
              onAddBundleSuite: () => {},
            },
          })),
        },
      },
    });
    await flushPromises();
    await wrapper.get('[data-testid="test-cases-empty-cta"]').trigger('click');
    expect(add).toHaveBeenCalled();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('navigates to the existing CSV import wizard from the manage menu', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView },
        { path: '/bulk/import/:entityType/:fqn', name: 'bulk-import', component: { template: '<div>import</div>' } },
      ],
    });
    await router.push('/quality/test-cases');
    await router.isReady();
    const wrapper = mount(TestCasesListView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.get('[data-testid="test-cases-manage"]').trigger('click');
    await flushPromises();
    const importItem = document.body.querySelector('[data-testid="test-cases-import"]');
    expect(importItem).not.toBeNull();
    (importItem as HTMLElement).click();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/bulk/import/testCase/*');
    wrapper.unmount();
  });
  it('exports through the official CSV tray with no started toast and official manage labels', async () => {
    const success = vi.spyOn(message, 'success');
    const exportUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/exportAsync')) {
          exportUrls.push(url);
          return jsonResponse({ jobId: 'csv-job-test-cases' });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView }],
    });
    await router.push('/quality/test-cases');
    await router.isReady();
    const wrapper = mount(TestCasesListView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.get('[data-testid="test-cases-manage"]').trigger('click');
    await flushPromises();
    const exportItem = document.body.querySelector('[data-testid="test-cases-export"]');
    expect(exportItem?.textContent).toMatch(/Export/);
    expect(document.body.querySelector('[data-testid="test-cases-import"]')?.textContent).toMatch(/Import/);
    expect(document.body.querySelector('[data-testid="test-cases-bulk-edit"]')?.textContent).toMatch(/Bulk Edit/);
    (exportItem as HTMLElement | null)?.click();
    await flushPromises();
    expect(isCsvJobOwned('csv-job-test-cases')).toBe(true);
    expect(success).not.toHaveBeenCalled();
    expect(exportUrls.some((url) => url.includes('recursive=true'))).toBe(true);
    wrapper.unmount();
    success.mockRestore();
  });

  it('passes active list filters to exportAsync like official withTestCaseExportFilters', async () => {
    const exportUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/exportAsync')) {
          exportUrls.push(url);
          return jsonResponse({ jobId: 'csv-job-filtered' });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountView({ props: { status: 'Failed', preferSearch: true } });
    await flushPromises();
    await wrapper.get('[data-testid="test-cases-manage"]').trigger('click');
    await flushPromises();
    const exportItem = document.body.querySelector('[data-testid="test-cases-export"]');
    (exportItem as HTMLElement | null)?.click();
    await flushPromises();
    expect(exportUrls.some((url) => url.includes('testCaseStatus=Failed'))).toBe(true);
    wrapper.unmount();
  });

});


describe('TestCasesListView dashboard drill-down', () => {
  const requestedUrls: string[] = [];

  beforeEach(() => {
    localStorage.clear();
    requestedUrls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes('/api/v1/dataQuality/testCases/search/list')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({ data: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('applies the drilled status and dimension to the search request', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView },
        { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      ],
    });
    await router.push('/quality/test-cases');
    await router.isReady();
    const wrapper = mount(TestCasesListView, {
      props: { preferSearch: true, status: 'Failed', dataQualityDimension: 'Completeness' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const searchUrl = requestedUrls.find((url) => url.includes('/testCases/search/list'));
    expect(searchUrl).toBeDefined();
    expect(searchUrl).toContain('testCaseStatus=Failed');
    expect(searchUrl).toContain('dataQualityDimension=Completeness');
    // The status filter visibly carries the drilled status.
    expect(wrapper.find('[data-testid="test-cases-status-filter"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Failed');
    wrapper.unmount();
  });

  it('applies a two-status health drill as repeated params (pin BINARY_STATUS_PIE_SEGMENT_ORDER)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView },
        { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      ],
    });
    await router.push('/quality/test-cases');
    await router.isReady();
    const wrapper = mount(TestCasesListView, {
      props: { preferSearch: true, status: ['Success', 'Queued'] },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    const searchUrl = requestedUrls.find((url) => url.includes('/testCases/search/list'));
    expect(searchUrl).toBeDefined();
    const params = new URL(String(searchUrl)).searchParams;
    expect(params.getAll('testCaseStatus')).toEqual(['Success', 'Queued']);
    // The single-select cannot display two active statuses: it shows
    // the placeholder until the viewer picks one, while the list stays
    // filtered by both.
    const select = wrapper.findAllComponents({ name: 'ASelect' })[0];
    expect(select.props('value')).toBeUndefined();
    wrapper.unmount();
  });
});


describe('TestCasesListView official insight donuts and advanced filters', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders official pie insight cards instead of count-only tiles', async () => {
    const { wrapper } = await mountView({
      props: {
        embedded: true,
        results: { success: 20, aborted: 3, failed: 7, queued: 0, total: 30 },
        health: { healthy: 5, unhealthy: 7, total: 12 },
        coverage: { covered: 12, notCovered: 14988, total: 15000 },
      },
    });
    expect(wrapper.find('[data-testid="test-cases-insights"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-insight-all-chart"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-insight-all"]').text()).toContain('66.67%');
    expect(wrapper.find('[data-testid="test-cases-insight-health"]').text()).toContain('41.67%');
    expect(wrapper.find('[data-testid="test-cases-insight-coverage"]').text()).toContain('0.08%');
    wrapper.unmount();
  });

  it('embedded tab writes searchValue and lastRunRange to the route (useTestCaseFilters)', async () => {
    const { wrapper, router } = await mountView({
      props: { embedded: true, preferSearch: true },
    });
    const shell = wrapper.findComponent({ name: 'EntityListShell' });
    await shell.vm.$emit('update:searchValue', 'orders');
    await shell.vm.$emit('search');
    await flushPromises();
    expect(router.currentRoute.value.query.searchValue).toBe('orders');

    await wrapper.get('[data-testid="test-cases-advanced"]').trigger('click');
    await flushPromises();
    const lastRunItem = document.body.querySelector(
      '[data-testid="test-cases-advanced-lastRunRange"]',
    ) as HTMLElement | null;
    expect(lastRunItem).not.toBeNull();
    lastRunItem?.click();
    await flushPromises();
    const dateFilter = wrapper.findComponent(IncidentDateRangeFilter);
    dateFilter.vm.$emit('apply', {
      startTs: 100,
      endTs: 200,
      key: 'last7days',
      title: 'Last 7 days',
    });
    await flushPromises();

    const query = router.currentRoute.value.query;
    expect(query['lastRunRange[key]']).toBe('last7days');
    expect(query['lastRunRange[startTs]']).toBe('100');
    expect(query.startTs).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps lastRun off by default and reveals official 高级 filters from the menu', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-cases-last-run-filter"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-cases-platform-filter"]').exists()).toBe(false);
    await wrapper.get('[data-testid="test-cases-advanced"]').trigger('click');
    await flushPromises();
    const platformItem = document.body.querySelector('[data-testid="test-cases-advanced-testPlatforms"]') as HTMLElement | null;
    expect(platformItem).not.toBeNull();
    platformItem?.click();
    await flushPromises();
    expect(wrapper.find('[data-testid="test-cases-platform-filter"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getResourcePermission: vi.fn(async () => ({ Create: true })),
  }),
}));

vi.mock('@/components/quality/AddToBundleSuiteModal.vue', () => ({
  default: {
    name: 'AddToBundleSuiteModal',
    props: ['open', 'selectedTestCases'],
    template: '<div v-if="open" data-testid="add-to-bundle-suite-modal" />',
  },
}));

vi.mock('@/components/quality/LogicalTestSuiteDrawer.vue', () => ({
  default: {
    name: 'LogicalTestSuiteDrawer',
    props: ['open', 'presetTestCaseIds'],
    template: '<div v-if="open" data-testid="logical-test-suite-drawer" />',
  },
}));

async function mountEmbeddedBulkList() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-quality', name: 'quality-data-quality-tab', component: TestCasesListView },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
    ],
  });
  await router.push('/data-quality');
  await router.isReady();
  const createActions = computed<DataQualityCreateActions>(() => ({
    canCreateTestCase: true,
    canCreateBundleSuite: true,
    onAddTestCase: () => {},
    onAddBundleSuite: () => {},
  }));
  // Official enableBulkActions gates on testSuite Create, not testCase Create.
  const dataQualityContext = computed(() => ({
    isActive: true,
    createActions: createActions.value,
  }));
  const wrapper = mount(TestCasesListView, {
    props: { embedded: true, preferSearch: true },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      provide: { [dataQualityContextKey as symbol]: dataQualityContext },
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TestCasesListView embedded bundle-suite bulk selection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                entityFQN: 'svc.db.schema.orders',
                testCaseResult: { testCaseStatus: 'Success' },
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
  });

  it('shows Test Case Insights header on the embedded landing tab', async () => {
    const wrapper = await mountEmbeddedBulkList();
    expect(wrapper.text()).toContain('Test Case Insights');
    expect(wrapper.text()).toContain("dataset's health");
    wrapper.unmount();
  });

  it('does not enable bulk selection without testSuite Create (pin getTestCaseListDisplayState)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/data-quality', name: 'quality-data-quality-tab', component: TestCasesListView }],
    });
    await router.push('/data-quality');
    await router.isReady();
    const createActions = computed<DataQualityCreateActions>(() => ({
      canCreateTestCase: true,
      canCreateBundleSuite: false,
      onAddTestCase: () => {},
      onAddBundleSuite: () => {},
    }));
    const wrapper = mount(TestCasesListView, {
      props: { embedded: true, preferSearch: true },
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
        provide: { [dataQualityContextKey as symbol]: computed(() => ({ isActive: true, createActions: createActions.value })) },
      },
    });
    await flushPromises();
    expect(wrapper.find('.ant-table-selection-column input[type="checkbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows bulk toolbar and opens add-to-existing modal (pin DataQualityTab)', async () => {
    const wrapper = await mountEmbeddedBulkList();
    const rowCheckbox = wrapper.find('.ant-table-selection-column input[type="checkbox"]');
    expect(rowCheckbox.exists()).toBe(true);
    await rowCheckbox.setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="bulk-selection-toolbar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-selected-to-bundle-suite"]').exists()).toBe(true);
    await wrapper.get('[data-testid="add-selected-to-bundle-suite"]').trigger('click');
    await flushPromises();
    const existingItem = document.body.querySelector(
      '[data-testid="add-to-existing-bundle-suite"]',
    ) as HTMLElement | null;
    expect(existingItem).not.toBeNull();
    existingItem?.click();
    await flushPromises();
    expect(wrapper.find('[data-testid="add-to-bundle-suite-modal"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('TestCasesListView test-case origin navigation', () => {
  it('writes landing data-quality breadcrumbData when opening a case', async () => {
    const { wrapper, router } = await mountView();
    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.findComponent(EntityListShell).vm.$emit('view', { id: 'tc1', name: 'row_count' });
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'quality-test-case',
      params: { id: 'tc1' },
      state: {
        breadcrumbData: [{ name: 'Data Quality', url: '/data-quality/test-cases' }],
      },
    });
  });

  it('writes suite-detail breadcrumbData from prop when opening a case', async () => {
    const trail = [
      { name: 'Test Suites', url: '/data-quality/test-suites/bundle-suites' },
      { name: 'Suite A', url: '/test-suites/suite.fqn' },
    ];
    const { wrapper, router } = await mountView({
      props: { suiteDetailMode: true, testSuiteId: 's1', breadcrumbData: trail },
    });
    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.findComponent(EntityListShell).vm.$emit('view', { id: 'tc1', name: 'row_count' });
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'quality-test-case',
      params: { id: 'tc1' },
      state: { breadcrumbData: trail },
    });
  });
});
