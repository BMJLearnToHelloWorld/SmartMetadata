/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { createTestI18n } from '@/test/i18n';
import TestSuiteDetailView from './TestSuiteDetailView.vue';
import TestCasesListView from './TestCasesListView.vue';

vi.mock('@/composables/useEntityPermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useEntityPermissions')>();
  return {
    ...actual,
    useEntityPermissions: () => ({
      permissions: computed(() => ({
        Delete: true,
        EditDisplayName: true,
        EditAll: true,
        EditTests: true,
        EditOwners: true,
        EditDomains: true,
        EditDescription: true,
      })),
      isLoading: computed(() => false),
      canDelete: computed(() => true),
      canEditDisplayName: computed(() => true),
      canEditAll: computed(() => true),
      canEditDescription: computed(() => true),
      can: (operation: string) =>
        operation === 'EditTests' || operation === 'EditOwners' || operation === 'EditDomains',
    }),
  };
});

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ isAdminUser: true }),
}));

vi.mock('@/governance/catalogOptions', () => ({
  loadGovernanceCatalog: vi.fn(async () => ({ owners: [], tags: [], domains: [] })),
}));

const getTestSuite = vi.fn();
const listTestCases = vi.fn();

vi.mock('@/api/testSuites', () => ({
  getTestSuite: (...args: unknown[]) => getTestSuite(...args),
  updateTestSuite: vi.fn(),
  patchTestSuite: vi.fn(),
  deleteTestSuite: vi.fn(),
}));

vi.mock('@/api/testCases', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/testCases')>();
  return {
    ...mod,
    listTestCases: (...args: unknown[]) => listTestCases(...args),
    listTestCasesBySearch: (...args: unknown[]) => listTestCases(...args),
    addTestCasesToLogicalTestSuiteBulk: vi.fn(),
    removeTestCaseFromTestSuite: vi.fn(),
  };
});

vi.mock('@/api/ingestionPipelines', () => ({
  INGESTION_PIPELINE_FIELDS: 'pipelineStatuses',
  getOrchestratorStatus: vi.fn(async () => ({ platform: 'airflow', code: 200 })),
  listIngestionPipelines: vi.fn(async () => ({ data: [], total: 0 })),
}));

async function mountView(bundleSuite = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  getTestSuite.mockResolvedValue({
    id: 'ts1',
    name: 'orders_suite',
    displayName: 'Orders suite',
    fullyQualifiedName: 'svc.db.schema.orders.orders_suite',
    basic: !bundleSuite,
    tests: [],
    owners: [],
    domains: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: TestSuiteDetailView, props: true },
      { path: '/data-quality/:tab?', name: 'quality-data-quality-tab', component: { template: '<div />' } },
      { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-suite', params: { id: 'ts1' } });
  await router.isReady();
  const wrapper = mount(TestSuiteDetailView, {
    props: { id: 'ts1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('TestSuiteDetailView official parity', () => {
  beforeEach(() => {
    getTestSuite.mockReset();
    listTestCases.mockReset();
    listTestCases.mockResolvedValue({
      data: [
        {
          id: 'tc1',
          name: 'row_count',
          testCaseResult: { testCaseStatus: 'Success', timestamp: 1 },
        },
      ],
      total: 1,
      entityPermissions: {},
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders observability breadcrumbs and embeds TestCasesListView scoped by suite', async () => {
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('Orders suite');
    const crumb = wrapper.find('[data-testid="entity-detail-crumb-1"]');
    expect(crumb.exists()).toBe(true);
    expect(crumb.text()).toContain('Data Quality');
    const list = wrapper.findComponent(TestCasesListView);
    expect(list.exists()).toBe(true);
    expect(list.props('testSuiteId')).toBe('ts1');
    expect(list.props('suiteDetailMode')).toBe(true);
    const calls = listTestCases.mock.calls;
    expect(calls.some((call) => call[0]?.testSuiteId === 'ts1')).toBe(true);
    wrapper.unmount();
  });

  it('shows Add test cases when EditTests is allowed for a bundle suite', async () => {
    const wrapper = await mountView(true);
    expect(wrapper.find('[data-testid="add-tests-to-suite"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders pipeline tab with drawer add entry (not legacy residual)', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="test-suite-pipeline-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-test-suite-ingestion"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-suite-pipeline-tab"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('exposes entity-header-copy-button via EntityHeaderTitle', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="entity-header-copy-button"]').exists()).toBe(true);
    wrapper.unmount();
  });
});