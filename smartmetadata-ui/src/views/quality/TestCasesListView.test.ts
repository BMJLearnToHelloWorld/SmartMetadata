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
import Antd, { message } from 'ant-design-vue';
import { isCsvJobOwned } from '@/api/csvJobs';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
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
  const wrapper = mount(TestCasesListView, {
    props: options.props,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
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
    expect(wrapper.find('[data-testid="create-test-case"]').exists()).toBe(true);
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
                entityFQN: 'svc.db.schema.orders',
                entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
                testCaseResult: { testCaseStatus: 'Failed', result: 'expected 10 got 12', timestamp: 1 },
                incidentStatus: 'New',
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

  it('shows official filters, deleted toggle, manage actions, and result columns', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-cases-advanced"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-table-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-type-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-tag-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-show-deleted"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-manage"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('expected 10 got 12');
    expect(wrapper.find('[data-testid="test-case-incident-tc1"]').text()).toContain('New');
  });

  it('opens the official add-test drawer instead of the thin create modal', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="create-test-case"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="test-case-form-drawer"]').exists()).toBe(true);
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/exportAsync')) {
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
    wrapper.unmount();
    success.mockRestore();
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
