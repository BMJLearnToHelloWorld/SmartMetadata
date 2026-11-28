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
import dayjs from 'dayjs';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SmChart from '@/features/charts/SmChart.vue';
import DqDashboardExportModal from '@/components/quality/DqDashboardExportModal.vue';
import DqDashboardOwnerFilter from '@/features/quality/DqDashboardOwnerFilter.vue';
import DataQualityLandingView from './DataQualityLandingView.vue';
import TestCasesListView from './TestCasesListView.vue';
import TestSuitesListView from './TestSuitesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const batchRequests: unknown[] = [];

const permState = vi.hoisted(() => ({
  testSuiteCreate: true,
  testCaseCreate: true,
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: true,
    getResourcePermission: vi.fn(async (resource: string) => {
      if (resource === 'testSuite') {
        return { Create: permState.testSuiteCreate };
      }
      if (resource === 'testCase') {
        return { Create: permState.testCaseCreate, ViewBasic: true };
      }
      return {};
    }),
  }),
}));

function stubFetch(mode: 'ok' | 'quality-404' = 'ok'): void {
  batchRequests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/dataQualityReport/batch') && typeof init?.body === 'string') {
        try {
          batchRequests.push(JSON.parse(init.body));
        } catch {
          batchRequests.push(init.body);
        }
      }
      if (url.includes('/testCases/search/list') || url.includes('/testSuites/search/list')) {
        return new Response('not found', { status: 404 });
      }
      if (mode === 'quality-404') {
        return new Response('not found', { status: 404 });
      }
      if (url.includes('/api/v1/dataQuality/testCases')) {
        return jsonResponse({
          data: [
            {
              id: 'tc1',
              name: 'row_count',
              entityFQN: 'svc.db.schema.orders',
              testDefinition: { name: 'completenessCheck' },
              testCaseResult: { testCaseStatus: 'Success', timestamp: 1 },
            },
            {
              id: 'tc2',
              name: 'null_count',
              entityFQN: 'svc.db.schema.users',
              testDefinition: { name: 'completenessCheck' },
              testCaseResult: { testCaseStatus: 'Failed', timestamp: 2 },
            },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/api/v1/dataQuality/testSuites/dataQualityReport/batch')) {
        return jsonResponse({
          results: [
            {
              key: 'status',
              report: {
                metadata: { keys: ['sterms#status'], dimensions: ['testCaseResult.testCaseStatus'], metrics: ['document_count'] },
                data: [
                  { 'testCaseResult.testCaseStatus': 'Success', document_count: '1' },
                  { 'testCaseResult.testCaseStatus': 'Failed', document_count: '1' },
                ],
              },
            },
            {
              key: 'dimensionStatus',
              report: {
                metadata: { keys: ['sterms#dimension', 'sterms#status'], dimensions: ['dataQualityDimensionName', 'testCaseResult.testCaseStatus'], metrics: ['document_count'] },
                data: [
                  { dataQualityDimensionName: 'Completeness', 'testCaseResult.testCaseStatus': 'Success', document_count: '1' },
                  { dataQualityDimensionName: 'Completeness', 'testCaseResult.testCaseStatus': 'Failed', document_count: '1' },
                ],
              },
            },
            {
              key: 'noDimensionStatus',
              report: {
                metadata: { keys: ['sterms#status'], dimensions: ['testCaseResult.testCaseStatus'], metrics: ['document_count'] },
                data: [],
              },
            },
            {
              key: 'covered',
              report: {
                metadata: { keys: ['cardinality#entityWithTests'], dimensions: [], metrics: ['originEntityFQN'] },
                data: [{ originEntityFQN: '2' }],
              },
            },
            {
              key: 'unhealthyCovered',
              report: {
                metadata: { keys: ['cardinality#entityWithTests'], dimensions: [], metrics: ['originEntityFQN'] },
                data: [{ originEntityFQN: '1' }],
              },
            },
            {
              key: 'totalTables',
              report: {
                metadata: { keys: ['cardinality#count'], dimensions: [], metrics: ['fullyQualifiedName'] },
                data: [{ fullyQualifiedName: '20' }],
              },
            },
            {
              key: 'statusSuccess',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', 'testCase.fullyQualifiedName': '1' }],
              },
            },
            {
              key: 'statusAborted',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', 'testCase.fullyQualifiedName': '0' }],
              },
            },
            {
              key: 'statusFailed',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', 'testCase.fullyQualifiedName': '1' }],
              },
            },
            {
              key: 'incidentsOpen',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', stateId: '1' }],
              },
            },
            {
              key: 'incidentsResolved',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', stateId: '1' }],
              },
            },
            {
              key: 'timeResponse',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', 'metrics.value': '1000' }],
              },
            },
            {
              key: 'timeResolution',
              report: {
                metadata: { keys: [], dimensions: [], metrics: [] },
                data: [{ timestamp: '1700000000000', 'metrics.value': '2000' }],
              },
            },
          ],
        });
      }
      if (url.includes('/api/v1/dataQuality/testSuites')) {
        return jsonResponse({
          data: [
            {
              id: 'ts1',
              name: 'orders_suite',
              basic: true,
              tests: [{ name: 'row_count' }],
              owners: [{ name: 'alice' }],
              summary: { success: 0, failed: 1, total: 1 },
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/dataQuality/testDefinitions')) {
        return jsonResponse({
          data: [
            {
              id: 'd1',
              name: 'completenessCheck',
              dataQualityDimension: 'Completeness',
              testPlatforms: [],
            },
          ],
        });
      }
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({
          hits: { total: { value: 20 }, hits: [] },
          aggregations: {
            'sterms#entityType': { buckets: [{ key: 'table', doc_count: 20 }] },
            'sterms#ownerDisplayName': { buckets: [{ key: 'alice', doc_count: 3 }] },
            'sterms#tier.tagFQN': { buckets: [{ key: 'Tier.Gold', doc_count: 1 }] },
          },
        });
      }
      if (url.includes('/api/v1/glossaryTerms')) {
        return jsonResponse({ data: [] });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

async function mountLanding(path = '/quality/test-cases', locale?: 'zh-CN' | 'en-US') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases', name: 'quality-test-cases', component: DataQualityLandingView },
        { path: '/data-quality/:tab/:subTab?', name: 'quality-data-quality-tab', component: DataQualityLandingView },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      {
        path: '/quality/test-suites',
        name: 'quality-test-suites',
        redirect: (to) => ({ path: '/data-quality/test-suites', query: to.query }),
      },
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: { template: '<div>ts</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(DataQualityLandingView, {
    global: { plugins: [pinia, router, Antd, createTestI18n(locale)] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('DataQualityLandingView', () => {
  beforeEach(() => {
    localStorage.clear();
    permState.testSuiteCreate = true;
    permState.testCaseCreate = true;
    stubFetch('ok');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders Summary / Test Cases / Test Suites and health cards from the official report batch', async () => {
    const { wrapper } = await mountLanding();
    expect(wrapper.get('[data-testid="dq-landing-title"]').text()).toContain('Data Quality');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Summary');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Test Cases');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Test Suites');
    expect(wrapper.find('[data-testid="dq-dashboard-container"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dq-dashboard-health"]').text()).toContain('Data Health');
    expect(wrapper.get('[data-testid="dq-dashboard-coverage-card"]').text()).toContain('Covered');
    expect(wrapper.get('[data-testid="dq-dashboard-results-card"]').text()).toContain('Success');
    expect(wrapper.get('[data-testid="dq-dashboard-dimension-Completeness"]').text()).toMatch(/Completeness/);
    expect(wrapper.get('[data-testid="dq-dashboard-status-failed"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="dq-residual-residualHealthCap"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-residual-residualSearchList"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-landing-filters"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-filter-owner"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-owner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-range"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-incidents"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-incident-metrics"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="data-quality-add-button-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="export-pdf-button"]').exists()).toBe(true);
    expect(wrapper.findAll('.export-pdf-container').length).toBeGreaterThanOrEqual(4);
  });

  it('opens Test Cases from the tab bar and rows navigate to the existing detail route', async () => {
    const { wrapper, router } = await mountLanding();
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    await tabs[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(wrapper.findComponent(TestCasesListView).exists()).toBe(true);
    expect(wrapper.get('[data-testid="test-cases-table"]').text()).toContain('row_count');
    await wrapper.get('[data-testid="test-case-row-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('opens Test Suites, supports table/bundle sub-tabs, and follows suite rows', async () => {
    const { wrapper, router } = await mountLanding('/quality/test-cases?tab=test-suites');
    expect(wrapper.findComponent(TestSuitesListView).exists()).toBe(true);
    expect(wrapper.get('[data-testid="test-suites-subtabs"]').text()).toContain('Table Suites');
    expect(wrapper.get('[data-testid="test-suites-table"]').text()).toContain('orders_suite');
    await wrapper.get('[data-testid="test-suite-row-ts1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-suite');
  });

  it('redirects /quality/test-suites onto the landing Test Suites tab', async () => {
    const { wrapper, router } = await mountLanding('/quality/test-suites');
    expect(router.currentRoute.value.name).toBe('quality-data-quality-tab');
    expect(router.currentRoute.value.path).toBe('/data-quality/test-suites');
    expect(wrapper.findComponent(TestSuitesListView).exists()).toBe(true);
  });

  it('keeps health cards empty when quality APIs 404 instead of inventing charts', async () => {
    stubFetch('quality-404');
    const { wrapper } = await mountLanding();
    expect(wrapper.find('[data-testid="dq-dashboard-health-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dq-dashboard-health-empty"]').text()).toContain('No data');
    expect(wrapper.find('[data-testid^="dq-residual-"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('20897');
  });

  it('re-runs the aggregation batch with the filter-built query on filter change', async () => {
    const { wrapper } = await mountLanding();
    const initialBatchCount = batchRequests.length;
    expect(initialBatchCount).toBeGreaterThanOrEqual(1);
    const firstBatch = [...batchRequests]
      .reverse()
      .find((item) => Array.isArray((item as { requests?: unknown }).requests)
        && (item as { requests: Array<{ key: string }> }).requests.some((request) => request.key === 'status')) as
      | { requests: Array<{ key: string; q?: string }> }
      | undefined;
    expect(firstBatch?.requests.find((item) => item.key === 'status')?.q).toContain('deleted');
    batchRequests.length = 0;
    const ownerFilter = wrapper.findComponent(DqDashboardOwnerFilter);
    ownerFilter.vm.$emit('update:modelValue', ['alice']);
    await flushPromises();
    await flushPromises();
    expect(batchRequests.length).toBeGreaterThanOrEqual(1);
    const rerun = [...batchRequests]
      .reverse()
      .find((item) => Array.isArray((item as { requests?: unknown }).requests)
        && (item as { requests: Array<{ key: string }> }).requests.some((request) => request.key === 'status')) as
      | { requests: Array<{ key: string; index: string; q?: string }> }
      | undefined;
    const statusRequest = rerun?.requests.find((item) => item.key === 'status');
    expect(statusRequest?.q).toContain('owners.name');
    expect(statusRequest?.q).toContain('alice');
    const totalTables = rerun?.requests.find((item) => item.key === 'totalTables');
    expect(totalTables?.index).toBe('table');
    expect(totalTables?.q).toContain('alice');
    const noDimension = rerun?.requests.find((item) => item.key === 'noDimensionStatus');
    expect(noDimension?.q).toContain('dataQualityDimensionName');
  });

  it('re-runs the aggregation batch with the time-range clause on range change', async () => {
    const { wrapper } = await mountLanding();
    expect(batchRequests.length).toBeGreaterThanOrEqual(1);
    batchRequests.length = 0;
    const picker = wrapper.findComponent({ name: 'ARangePicker' });
    expect(picker.exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-dashboard-filter-range"]').exists()).toBe(true);
    await picker.vm.$emit('change', [dayjs('2026-02-10T10:30:00'), dayjs('2026-02-12T15:45:00')]);
    await flushPromises();
    await flushPromises();
    expect(batchRequests.length).toBeGreaterThanOrEqual(1);
    const rerun = [...batchRequests]
      .reverse()
      .find((item) => Array.isArray((item as { requests?: unknown }).requests)
        && (item as { requests: Array<{ key: string }> }).requests.some((request) => request.key === 'status')) as
      | { requests: Array<{ key: string; q?: string }> }
      | undefined;
    const statusRequest = rerun?.requests.find((item) => item.key === 'status');
    expect(statusRequest?.q).toContain('testCaseResult.timestamp');
    expect(statusRequest?.q).toContain(String(dayjs('2026-02-10').startOf('day').valueOf()));
    expect(statusRequest?.q).toContain(String(dayjs('2026-02-12').endOf('day').valueOf()));
    // The table-index item never carries the time clause (official table
    // builder has none), even when the range drives the dashboard items.
    const totalTables = rerun?.requests.find((item) => item.key === 'totalTables');
    expect(totalTables?.q).not.toContain('testCaseResult.timestamp');
  });

  it('does not invent a residual banner when a governance filter is applied', async () => {
    const { wrapper } = await mountLanding();
    const initialBatchCount = batchRequests.length;
    const ownerFilter = wrapper.findComponent(DqDashboardOwnerFilter);
    expect(ownerFilter.exists()).toBe(true);
    ownerFilter.vm.$emit('update:modelValue', ['alice']);
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="dq-landing-filter-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid^="dq-residual-"]').exists()).toBe(false);
    expect(batchRequests.length).toBeGreaterThan(initialBatchCount);
  });

  it('forwards a dashboard drill-down query to the test-case list', async () => {
    const { wrapper } = await mountLanding(
      '/quality/test-cases?tab=test-cases&testCaseStatus=Failed&dataQualityDimension=Completeness',
    );
    const list = wrapper.findComponent(TestCasesListView);
    expect(list.exists()).toBe(true);
    expect(list.props('status')).toBe('Failed');
    expect(list.props('dataQualityDimension')).toBe('Completeness');
  });

  it('forwards a two-status health drill-down query to the test-case list', async () => {
    const { wrapper } = await mountLanding(
      '/quality/test-cases?tab=test-cases&testCaseStatus=Success&testCaseStatus=Queued',
    );
    const list = wrapper.findComponent(TestCasesListView);
    expect(list.exists()).toBe(true);
    expect(list.props('status')).toEqual(['Success', 'Queued']);
  });

  it('drills the dashboard-tab donuts per segment (pin pie widgets)', async () => {
    const { wrapper, router } = await mountLanding();
    const donuts = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'donut');
    const areas = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'area');
    expect(donuts.length).toBe(3);
    expect(areas.length).toBe(7);
    await donuts[0].vm.$emit('segment-click', 0);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-suites');
  });

  it('drills the not-covered slice to explore (pin ROUTES.EXPLORE)', async () => {
    const { wrapper, router } = await mountLanding();
    const donuts = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'donut');
    await donuts[0].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('search');
  });

  it('drills the healthy slice to the Success+Queued list', async () => {
    const { wrapper, router } = await mountLanding();
    const donuts = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'donut');
    await donuts[1].vm.$emit('segment-click', 0);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.query.testCaseStatus).toEqual(['Success', 'Queued']);
    expect(wrapper.findComponent(TestCasesListView).props('status')).toEqual(['Success', 'Queued']);
  });

  it('drills the unhealthy slice to the Failed+Aborted list', async () => {
    const { wrapper, router } = await mountLanding();
    const donuts = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'donut');
    await donuts[1].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.query.testCaseStatus).toEqual(['Failed', 'Aborted']);
    expect(wrapper.findComponent(TestCasesListView).props('status')).toEqual(['Failed', 'Aborted']);
  });

  it('drills a results slice to the matching single-status list', async () => {
    const { wrapper, router } = await mountLanding();
    const donuts = wrapper.findAllComponents(SmChart).filter((chart) => chart.props('kind') === 'donut');
    await donuts[2].vm.$emit('segment-click', 1);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Failed');
    expect(wrapper.findComponent(TestCasesListView).props('status')).toBe('Failed');
  });

  it('writes official dataQualityDimension and the dashboard last-run range when a dimension card is clicked', async () => {
    const { wrapper, router } = await mountLanding();
    await wrapper.get('[data-testid="dq-dashboard-dimension-Completeness"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.query.dataQualityDimension).toBe('Completeness');
    expect(router.currentRoute.value.query.startTs).toBeDefined();
    expect(router.currentRoute.value.query.endTs).toBeDefined();
    const list = wrapper.findComponent(TestCasesListView);
    expect(list.props('dataQualityDimension')).toBe('Completeness');
    expect(list.props('startTs')).toEqual(expect.any(Number));
    expect(list.props('endTs')).toEqual(expect.any(Number));
  });

  it('writes official testCaseStatus when a status card is clicked', async () => {
    const { wrapper, router } = await mountLanding();
    await wrapper.get('[data-testid="dq-dashboard-status-failed"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Failed');
    expect(wrapper.findComponent(TestCasesListView).props('status')).toBe('Failed');
  });

  it('restores each tab query string when switching between tabs', async () => {
    const initialSearch =
      '?testCaseStatus=Failed&startTs=100&endTs=200';
    const { wrapper, router } = await mountLanding(`/data-quality/test-cases${initialSearch}`);
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[2].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-suites');
    expect(router.currentRoute.value.query.testCaseStatus).toBeUndefined();

    await tabs[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/data-quality/test-cases');
    expect(router.currentRoute.value.query.testCaseStatus).toBe('Failed');
    expect(router.currentRoute.value.query.startTs).toBe('100');
    expect(router.currentRoute.value.query.endTs).toBe('200');
  });

  it('hides bundle-suite chrome when testSuite Create is denied', async () => {
    permState.testSuiteCreate = false;
    const { wrapper } = await mountLanding();
    await wrapper.get('[data-testid="data-quality-add-button-menu"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="dq-landing-add-suite"]')).toBeNull();
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[2].trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="add-test-suite-btn"]').exists()).toBe(false);
  });

  it('opens the dashboard export modal from export-pdf-button', async () => {
    const { wrapper } = await mountLanding();
    await wrapper.get('[data-testid="export-pdf-button"]').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(DqDashboardExportModal).props('open')).toBe(true);
  });

  it('does not apply the dashboard date range as a last-run filter when the Test Cases tab is opened from the tab bar', async () => {
    const { wrapper } = await mountLanding();
    const tabs = wrapper.findAll('.ant-tabs-tab');
    await tabs[1].trigger('click');
    await flushPromises();
    const list = wrapper.findComponent(TestCasesListView);
    expect(list.exists()).toBe(true);
    expect(list.props('startTs')).toBeUndefined();
    expect(list.props('endTs')).toBeUndefined();
    const searchCalls = vi.mocked(fetch).mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/dataQuality/testCases/search'));
    expect(searchCalls.length).toBeGreaterThan(0);
    expect(searchCalls.every((url) => !url.includes('startTimestamp=') && !url.includes('endTimestamp='))).toBe(true);
  });

  it('keeps official English dimension names in zh-CN and labels the add menu 包套件', async () => {
    const { wrapper } = await mountLanding('/quality/test-cases', 'zh-CN');
    expect(wrapper.get('[data-testid="dq-dashboard-dimension-Completeness"]').text()).toContain('Completeness');
    expect(wrapper.get('[data-testid="dq-dashboard-dimension-Integrity"]').text()).toContain('Integrity');
    expect(wrapper.get('[data-testid="dq-dashboard-dimension-Completeness"]').text()).not.toContain('完整性');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('概要');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('质控测试集');
    await wrapper.get('[data-testid="data-quality-add-button-menu"]').trigger('click');
    await flushPromises();
    const suiteItem = document.body.querySelector('[data-testid="dq-landing-add-suite"]');
    expect(suiteItem?.textContent).toContain('包套件');
  });
});
