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
import Antd, { Tabs } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { createTestI18n } from '@/test/i18n';
import TestCaseDetailView from './TestCaseDetailView.vue';

vi.mock('@/composables/useEntityPermissions', () => ({
  useEntityPermissions: () => ({
    permissions: computed(() => ({
      Trigger: true,
      Delete: true,
      EditDisplayName: true,
      EditAll: true,
      EditDescription: true,
      EditTags: true,
      EditGlossaryTerms: true,
      EditOwners: true,
      EditDomains: true,
      EditStatus: true,
    })),
    isLoading: computed(() => false),
    canDelete: computed(() => true),
    canEditDisplayName: computed(() => true),
    canEditAll: computed(() => true),
    canEditStatus: computed(() => true),
    canEditDescription: computed(() => true),
    can: (operation: string) =>
      operation === 'EditTags' ||
      operation === 'EditGlossaryTerms' ||
      operation === 'EditOwners' ||
      operation === 'EditDomains' ||
      operation === 'EditStatus',
  }),
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: true,
    getResourcePermission: vi.fn(async () => ({ Trigger: true, Delete: true, EditDisplayName: true, EditAll: true })),
  }),
}));

vi.mock('@/governance/catalogOptions', () => ({
  loadGovernanceCatalog: vi.fn(async () => ({
    owners: [],
    tags: [{ tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification', label: 'Tier1' }],
    domains: [],
  })),
}));

const getTestCase = vi.fn();
const getTestCaseByName = vi.fn();
const updateTestCase = vi.fn();
const patchTestCase = vi.fn();
const listTestCaseResults = vi.fn();
const getTestCaseIncidentByStateId = vi.fn();
const getTestDefinition = vi.fn();
const getTestCaseVersion = vi.fn();
const listGovernanceVersions = vi.fn();
const restoreTestCase = vi.fn();

vi.mock('@/api/testCases', () => ({
  getTestCase: (...args: unknown[]) => getTestCase(...args),
  getTestCaseByName: (...args: unknown[]) => getTestCaseByName(...args),
  getTestCaseVersion: (...args: unknown[]) => getTestCaseVersion(...args),
  restoreTestCase: (...args: unknown[]) => restoreTestCase(...args),
  updateTestCase: (...args: unknown[]) => updateTestCase(...args),
  patchTestCase: (...args: unknown[]) => patchTestCase(...args),
  listTestCaseDimensionResults: vi.fn(async () => ({ data: [], paging: { total: 0 } })),
}));
vi.mock('@/api/governanceVersions', () => ({
  listGovernanceVersions: (...args: unknown[]) => listGovernanceVersions(...args),
  latestGovernanceVersionPath: vi.fn(() => '/entity/latest'),
}));
vi.mock('@/api/testDefinitions', () => ({
  getTestDefinition: (...args: unknown[]) => getTestDefinition(...args),
}));
vi.mock('@/api/testCaseResults', () => ({
  listTestCaseResults: (...args: unknown[]) => listTestCaseResults(...args),
}));
vi.mock('@/api/testIncidents', () => ({
  getTestCaseIncidentByStateId: (...args: unknown[]) => getTestCaseIncidentByStateId(...args),
}));
vi.mock('@/api/system', () => ({
  getEntityRules: vi.fn(async () => []),
}));

const getTaskCounts = vi.fn();
const listTasks = vi.fn();

vi.mock('@/api/tasks', () => ({
  getTask: vi.fn(async () => ({ id: 'task-1', name: 'TASK-00009', assignees: [], comments: [] })),
  getTaskCounts: (...args: unknown[]) => getTaskCounts(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
}));

vi.mock('@/quality/testCaseNextRun', () => ({
  fetchNextTestCaseRunTimestamp: vi.fn(async () => null),
  getTestSuiteFqns: vi.fn(() => ['suite.one']),
  shouldFetchNextRun: vi.fn(() => true),
}));

beforeEach(() => {
  getTaskCounts.mockReset();
  listTasks.mockReset();
  getTaskCounts.mockResolvedValue({ open: 0, completed: 0 });
  listTasks.mockResolvedValue({ data: [], paging: { total: 0 } });
});

async function mountView(props: { id: string; tab?: string; version?: string } = { id: 'tc1' }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: TestCaseDetailView, props: true },
      {
        path: '/quality/test-cases/:id/versions/:version',
        name: 'quality-test-case-version',
        component: TestCaseDetailView,
        props: true,
      },
      {
        path: '/quality/test-cases/:id/versions/:version/:tab',
        name: 'quality-test-case-version-tab',
        component: TestCaseDetailView,
        props: true,
      },
      { path: '/test-case/:fqn/:tab?', name: 'test-case-alias', component: { template: '<div />' } },
      { path: '/:entityType/:fqn/:tab?/:subTab?', name: 'asset', component: { template: '<div />' } },
    ],
  });
  if (props.version) {
    await router.push({
      name: props.tab ? 'quality-test-case-version-tab' : 'quality-test-case-version',
      params: { id: props.id, version: props.version, ...(props.tab ? { tab: props.tab } : {}) },
    });
  } else {
    await router.push({ name: 'quality-test-case', params: { id: props.id } });
  }
  await router.isReady();
  const wrapper = mount(TestCaseDetailView, {
    props,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestCaseDetailView results rail (official TestCaseResultTab)', () => {
  beforeEach(() => {
    getTestCaseByName.mockReset();
    getTestDefinition.mockReset();
    listTestCaseResults.mockReset();
    getTestCaseIncidentByStateId.mockReset();
    listTestCaseResults.mockResolvedValue({ data: [] });
    getTestDefinition.mockResolvedValue({
      id: 'def-between',
      name: 'columnValuesToBeBetween',
      testPlatforms: ['OpenMetadata'],
      parameterDefinition: [
        { name: 'minValue', displayName: 'Minimum', dataType: 'INT' },
        { name: 'maxValue', displayName: 'Maximum', dataType: 'INT' },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders official test-case-rail widgets on the results tab', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'amount_between',
      displayName: 'Amount between',
      fullyQualifiedName: 'svc.db.schema.orders.amount_between',
      entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
      description: 'Keeps amount in range',
      parameterValues: [
        { name: 'minValue', value: '1' },
        { name: 'maxValue', value: '100' },
      ],
      testDefinition: { id: 'def-between', name: 'columnValuesToBeBetween' },
      testSuites: [{ id: 'suite1', name: 'Suite One', fullyQualifiedName: 'suite.one' }],
      tags: [{ tagFQN: 'Tier.Tier1', source: 'Classification', name: 'Tier1' }],
      dataProducts: [],
      domains: [],
    });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-case-rail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-configuration-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="configuration-parameter-minValue"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-suites-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-tags-classification"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-tags-glossary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="widget-data-products-cell"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('TestCaseDetailView official header (IncidentManagerDetailPage / TestCaseHeaderTitle)', () => {
  beforeEach(() => {
    getTestCase.mockReset();
    getTestCaseByName.mockReset();
    listTestCaseResults.mockReset();
    getTestCaseIncidentByStateId.mockReset();
    listTestCaseResults.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes official page chrome test ids and tab nav labels', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'customer_count_check',
      displayName: 'Customer count check',
      version: 3,
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      dimensionColumns: ['region'],
      parameterValues: [],
      testSuites: [],
    });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-case-detail-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-header-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-page-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-result"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimensionality"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="incident"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-expand-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-last-run-banner-tab-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-rail"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('exposes IncidentManagerPageHeader meta fields and test ids on the detail header', async () => {
    getTestCaseIncidentByStateId.mockResolvedValue({
      id: 'inc1',
      testCaseResolutionStatusType: 'New',
      severity: 'Severity1',
      stateId: 'task-1',
      timestamp: 1700000000000,
    });
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'amount_null',
      incidentId: 'inc-state-1',
      fullyQualifiedName: 'svc.db.schema.orders.amount_null',
      entityFQN: 'svc.db.schema.orders',
      entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
      owners: [{ id: 'u1', name: 'admin', displayName: 'Admin', type: 'user' }],
      domains: [{ id: 'd1', name: 'Engineering', displayName: 'Engineering' }],
      testDefinition: { id: 'td-null', name: 'columnValuesToBeNotNull', displayName: 'Column values not null' },
      parameterValues: [],
      testSuites: [],
    });
    const { wrapper, router } = await mountView();
    expect(wrapper.find('[data-testid="test-case-header-meta"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="incident-task-link"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="table-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="table-name"]').text()).toContain('orders');
    expect(wrapper.find('[data-testid="test-column-name"]').text()).toContain('amount');
    expect(wrapper.find('[data-testid="test-definition-name"]').text()).toContain('Column values not null');
    expect(wrapper.find('[data-testid="assignee"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-header-incident-status"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-header-incident-severity"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-header-domain"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-header-owners"]').exists()).toBe(true);
    await wrapper.get('[data-testid="table-name"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/table/svc.db.schema.orders/profiler/data-quality');
    wrapper.unmount();
  });

  it('renders EntityHeaderTitle test ids and StatItem version-button with count', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'customer_count_check',
      displayName: 'Customer count check',
      version: 3,
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
    });
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="entity-header-display-name"]').text()).toContain('Customer count check');
    expect(wrapper.find('[data-testid="entity-header-name"]').text()).toContain('customer_count_check');
    expect(wrapper.find('[data-testid="entity-header-copy-button"]').exists()).toBe(true);
    const versionButton = wrapper.find('[data-testid="version-button"]');
    expect(versionButton.exists()).toBe(true);
    expect(versionButton.text()).toContain('3');
    expect(wrapper.find('[data-testid="test-case-versions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows deleted-badge and hides version-button on the dimensionality tab', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'customer_count_check',
      displayName: 'Customer count check',
      deleted: true,
      version: 1,
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
      parameterValues: [],
      testSuites: [],
    });
    const { wrapper } = await mountView({ id: 'tc1', tab: 'dimensionality' });
    expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="version-button"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('TestCaseDetailView results tab TestSummary', () => {
  beforeEach(() => {
    getTestCase.mockReset();
    getTestCaseByName.mockReset();
    listTestCaseResults.mockReset();
    getTestCaseIncidentByStateId.mockReset();
    const testCase = {
      id: 'tc1',
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
    };
    // The default id 'tc1' is not a UUID, so load() dispatches to
    // getTestCaseByName; the UUID test below resets this to getTestCase.
    getTestCase.mockResolvedValue(testCase);
    getTestCaseByName.mockResolvedValue(testCase);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders official TestSummary testids when results exist in range', async () => {
    listTestCaseResults.mockResolvedValue({
      data: [
        { testCaseStatus: 'Success', timestamp: Date.UTC(2026, 0, 1), testResultValue: [{ name: 'value', value: '10' }] },
        { testCaseStatus: 'Failed', timestamp: Date.UTC(2026, 0, 2), testResultValue: [{ name: 'value', value: '20' }] },
      ],
    });
    const { wrapper } = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="test-case-result-tab-graph"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-summary-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-summary-date-range"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="graph-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-summary-tiles"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows never-run placeholder when API returns no results and no latest result', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    const { wrapper } = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="test-summary-never-run"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('loads incident header by incidentId and open task counts for the issues tab badge', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    getTestCaseIncidentByStateId.mockResolvedValue({
      id: 'inc1',
      testCaseResolutionStatusType: 'New',
      severity: 'Critical',
      stateId: 'task-2',
      timestamp: 1700000000000,
    });
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'row_count',
      incidentId: 'inc-state-1',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
    });
    getTaskCounts.mockResolvedValue({ open: 2, completed: 1 });
    const { wrapper } = await mountView();
    expect(getTestCaseIncidentByStateId).toHaveBeenCalledWith('inc-state-1');
    expect(getTaskCounts).toHaveBeenCalledWith({
      aboutEntity: 'svc.db.schema.orders.row_count',
    });
    // Official SQL tab is shown only when inspectionQuery is present.
    expect(wrapper.find('[data-testid="dimensionality"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-case-sql-query-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-case-sql-query"]').exists()).toBe(false);
  });

  it('renders official SqlQueryTab viewer when inspectionQuery is present', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
      inspectionQuery: 'SELECT 1',
    });
    const { wrapper } = await mountView({ id: 'tc1', tab: 'sql-query' });
    await flushPromises();
    expect(wrapper.find('[data-testid="test-case-sql-query"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="query-line"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('loads by FQN name when the id is not a UUID (F-D-4 alias)', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    await mountView();
    expect(getTestCaseByName).toHaveBeenCalledWith('tc1');
    expect(getTestCase).not.toHaveBeenCalled();
  });

  it('loads by id when the id is a UUID', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    const uuid = '11111111-2222-3333-4444-555555555555';
    await mountView({ id: uuid });
    expect(getTestCase).toHaveBeenCalledWith(uuid);
    expect(getTestCaseByName).not.toHaveBeenCalled();
  });

  it('opens the tab carried by the tab prop', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    const { wrapper } = await mountView({ id: 'tc1', tab: 'issues' });
    expect(wrapper.findComponent(Tabs).props('activeKey')).toBe('issues');
  });

  it('shows official TestCaseIncidentTab on the issues tab (tasks, not incident history table)', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    listTasks.mockResolvedValue({
      data: [{ id: 'task-9', name: 'TASK-9', status: 'Open', createdAt: 1 }],
      paging: { total: 1 },
    });
    const { wrapper } = await mountView({ id: 'tc1', tab: 'issues' });
    expect(wrapper.find('[data-testid="issue-tab-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-issues-table"]').exists()).toBe(false);
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        aboutEntity: 'svc.db.schema.orders.row_count',
        statusGroup: 'open',
      }),
    );
    wrapper.unmount();
  });
});

describe('TestCaseDetailView diff values (P2-6)', () => {
  const tableDiffDefinition = {
    id: 'td-diff',
    name: 'tableDiff',
    fullyQualifiedName: 'tableDiff',
    parameterDefinition: [
      { name: 'keyColumns', displayName: "Table 1's key columns", dataType: 'ARRAY' },
      { name: 'table2', displayName: 'Table 2', dataType: 'STRING', required: true },
      { name: 'table2.keyColumns', displayName: "Table 2's key columns", dataType: 'ARRAY' },
      { name: 'threshold', displayName: 'Threshold', dataType: 'NUMBER' },
      { name: 'useColumns', displayName: 'Use Columns', dataType: 'ARRAY' },
      { name: 'where', displayName: 'SQL Where Clause', dataType: 'STRING' },
      { name: 'caseSensitiveColumns', displayName: 'Case sensitive columns', dataType: 'BOOLEAN' },
      { name: 'parallelQueries', displayName: 'Parallel queries per database', dataType: 'NUMBER' },
    ],
  };

  beforeEach(() => {
    getTestCase.mockReset();
    updateTestCase.mockReset();
    patchTestCase.mockReset();
    listTestCaseResults.mockReset();
    getTestCaseIncidentByStateId.mockReset();
    getTestDefinition.mockReset();
    getTestDefinition.mockResolvedValue(tableDiffDefinition);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/search/query')) {
          return new Response(
            JSON.stringify({
              hits: {
                total: { value: 1 },
                hits: [
                  {
                    _index: 'table_search_index',
                    _source: {
                      fullyQualifiedName: 'svc.db.schema.orders_copy',
                      displayName: 'orders_copy',
                      name: 'orders_copy',
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/v1/tables/name/')) {
          return new Response(
            JSON.stringify({
              fullyQualifiedName: 'svc.db.schema.orders',
              name: 'orders',
              columns: [
                { name: 'id', dataType: 'INT' },
                { name: 'code', dataType: 'STRING' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows measured values on the selected run details card without inventing fields', async () => {
    const firstTs = Date.UTC(2026, 0, 1);
    const thirdTs = Date.UTC(2026, 0, 3);
    const loadedCase = {
      id: 'tc1',
      name: 'orders_diff',
      fullyQualifiedName: 'svc.db.schema.orders.table_diff',
      parameterValues: [],
      testSuites: [],
      testCaseResult: { timestamp: firstTs, testCaseStatus: 'Failed' },
    };
    getTestCase.mockResolvedValue(loadedCase);
    getTestCaseByName.mockResolvedValue(loadedCase);
    listTestCaseResults.mockResolvedValue({
      data: [
        {
          testCaseStatus: 'Failed',
          timestamp: firstTs,
          testResultValue: [
            { name: 'removedRows', value: '1' },
            { name: 'addedRows', value: '2' },
            { name: 'diffCount', value: '3' },
          ],
        },
        {
          testCaseStatus: 'Failed',
          timestamp: thirdTs,
          testResultValue: [
            { name: 'removedRows', value: '0' },
            { name: 'addedRows', value: '0' },
            { name: 'changedRows', value: '1' },
            { name: 'diffCount', value: '1' },
            { name: 'columnDiffCounts', value: '{"email": 1}' },
          ],
        },
      ],
    });
    const { wrapper } = await mountView();
    await flushPromises();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="run-details-card"]').exists()).toBe(true));
    const found = wrapper.find('[data-testid="run-details-found"]');
    expect(found.exists()).toBe(true);
    expect(found.text()).toContain('removedRows 1');
    expect(found.text()).toContain('addedRows 2');
    expect(found.text()).toContain('diffCount 3');
    expect(found.text()).not.toContain('changedRows');
    expect(found.text()).not.toContain('columnDiffCounts');
    wrapper.unmount();
  });

  it('renames a test case with a display-name-only modal and does not open parameter edit', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'orders_diff',
      displayName: 'Orders Diff',
      fullyQualifiedName: 'svc.db.schema.orders.table_diff',
      entityFQN: 'svc.db.schema.orders',
      entityLink: '<#E::table::svc.db.schema.orders>',
      testDefinition: { id: 'td-diff', name: 'tableDiff', fullyQualifiedName: 'tableDiff' },
      parameterValues: [
        { name: 'table2', value: 'svc.db.schema.orders_copy' },
      ],
      testSuites: [],
    });
    listTestCaseResults.mockResolvedValue({ data: [] });
    patchTestCase.mockResolvedValue({});
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="manage-button"]').trigger('click');
    await flushPromises();
    const rename = wrapper.find('[data-testid="edit-test-case"]');
    if (rename.exists()) {
      await rename.trigger('click');
    } else {
      const bodyRename = document.body.querySelector('[data-testid="edit-test-case"]') as HTMLElement | null;
      bodyRename?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    await flushPromises();
    expect(document.body.querySelector('[data-testid="table-diff-param-table2"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="edit-dimensions"]')).toBeNull();
    const input = document.body.querySelector('[data-testid="display-name-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'Orders Compared';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(updateTestCase).not.toHaveBeenCalled();
    expect(patchTestCase).toHaveBeenCalledTimes(1);
    expect(patchTestCase.mock.calls[0][0]).toBe('tc1');
    const operations = patchTestCase.mock.calls[0][1] as Array<{ path: string; value?: unknown }>;
    expect(operations.some((op) => op.path === '/displayName' && op.value === 'Orders Compared')).toBe(true);
    wrapper.unmount();
  });

  it('offers edit-dimensions only for column tests and opens the official form drawer', async () => {
    getTestCaseByName.mockResolvedValue({
      id: 'tc-col',
      name: 'col_null',
      fullyQualifiedName: 'svc.db.schema.orders.col_null',
      entityFQN: 'svc.db.schema.orders',
      entityLink: '<#E::table::svc.db.schema.orders::columns::amount>',
      testDefinition: { id: 'td-null', name: 'columnValuesToBeNotNull', fullyQualifiedName: 'columnValuesToBeNotNull' },
      parameterValues: [],
      testSuites: [],
    });
    listTestCaseResults.mockResolvedValue({ data: [] });
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="manage-button"]').trigger('click');
    await flushPromises();
    const item = document.body.querySelector('[data-testid="edit-dimensions"]') as HTMLElement | null;
    expect(item).not.toBeNull();
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="test-case-form-drawer"], .ant-drawer')).not.toBeNull();
    wrapper.unmount();
  });
});

describe('TestCaseDetailView version page (official IncidentManagerDetailPage / useTestCaseDetailPage)', () => {
  const testCaseId = '6f3a2f1a-2b4c-4d5e-8f9a-0b1c2d3e4f5a';

  beforeEach(() => {
    getTestCase.mockReset();
    getTestCaseVersion.mockReset();
    listGovernanceVersions.mockReset();
    listTestCaseResults.mockReset();
    getTestCaseIncidentByStateId.mockReset();
    getTestDefinition.mockReset();
    listTestCaseResults.mockResolvedValue({ data: [] });
    listGovernanceVersions.mockResolvedValue([{ version: '0.2', updatedAt: 1 }]);
    getTestCase.mockResolvedValue({
      id: testCaseId,
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      version: 2,
      parameterValues: [],
      testSuites: [],
    });
    getTestCaseVersion.mockResolvedValue({
      id: testCaseId,
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      version: 2,
      inspectionQuery: 'SELECT 1',
      changeDescription: { fieldsAdded: [{ name: 'description', newValue: 'x' }] },
      parameterValues: [],
      testSuites: [],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads a version snapshot, hides issues tab and manage actions, and shows SQL tab', async () => {
    const { wrapper } = await mountView({ id: testCaseId, version: '0.2', tab: 'sql-query' });
    expect(getTestCase).toHaveBeenCalledWith(testCaseId);
    expect(listGovernanceVersions).toHaveBeenCalledWith('testCase', testCaseId);
    expect(getTestCaseVersion).toHaveBeenCalledWith(testCaseId, '0.2');
    expect(getTestCaseIncidentByStateId).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="incident"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="run-test-case-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="versions-list-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-sql-query-version-diff"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('calls restoreTestCase when the restore modal confirms', async () => {
    getTestCase.mockResolvedValue({
      id: testCaseId,
      name: 'row_count',
      deleted: true,
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
    });
    restoreTestCase.mockResolvedValue({
      id: testCaseId,
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      version: 3,
      parameterValues: [],
      testSuites: [],
    });
    const { wrapper } = await mountView({ id: testCaseId, version: undefined });
    await wrapper.find('[data-testid="restore-test-case-button"]').trigger('click');
    await flushPromises();
    const ok = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    ok?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(restoreTestCase).toHaveBeenCalledWith(testCaseId);
    wrapper.unmount();
  });
});
