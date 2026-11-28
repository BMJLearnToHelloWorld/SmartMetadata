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
    permissions: computed(() => ({ Trigger: true, Delete: true, EditDisplayName: true, EditAll: true, EditDescription: true, EditTags: true, EditGlossaryTerms: true })),
    isLoading: computed(() => false),
    canDelete: computed(() => true),
    canEditDisplayName: computed(() => true),
    canEditAll: computed(() => true),
    canEditStatus: computed(() => true),
    canEditDescription: computed(() => true),
    can: (operation: string) => operation === 'EditTags' || operation === 'EditGlossaryTerms',
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
const listTestIncidents = vi.fn();
const getTestDefinition = vi.fn();

vi.mock('@/api/testCases', () => ({
  getTestCase: (...args: unknown[]) => getTestCase(...args),
  getTestCaseByName: (...args: unknown[]) => getTestCaseByName(...args),
  updateTestCase: (...args: unknown[]) => updateTestCase(...args),
  patchTestCase: (...args: unknown[]) => patchTestCase(...args),
  listTestCaseDimensionResults: vi.fn(async () => ({ data: [], paging: { total: 0 } })),
}));
vi.mock('@/api/testDefinitions', () => ({
  getTestDefinition: (...args: unknown[]) => getTestDefinition(...args),
}));
vi.mock('@/api/testCaseResults', () => ({
  listTestCaseResults: (...args: unknown[]) => listTestCaseResults(...args),
}));
vi.mock('@/api/testIncidents', () => ({
  listTestIncidents: (...args: unknown[]) => listTestIncidents(...args),
}));

vi.mock('@/api/tasks', () => ({
  getTask: vi.fn(async () => ({ id: 'task-1', name: 'TASK-00009', assignees: [], comments: [] })),
}));

vi.mock('@/quality/testCaseNextRun', () => ({
  fetchNextTestCaseRunTimestamp: vi.fn(async () => null),
  getTestSuiteFqns: vi.fn(() => ['suite.one']),
  shouldFetchNextRun: vi.fn(() => true),
}));

async function mountView(props: { id: string; tab?: string } = { id: 'tc1' }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: TestCaseDetailView, props: true },
      { path: '/test-case/:fqn/:tab?', name: 'test-case-alias', component: { template: '<div />' } },
      { path: '/:entityType/:fqn/:tab?/:subTab?', name: 'asset', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-case', params: { id: props.id } });
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
    listTestIncidents.mockReset();
    listTestIncidents.mockResolvedValue({ data: [] });
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
    listTestIncidents.mockReset();
    listTestIncidents.mockResolvedValue({ data: [] });
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
    listTestIncidents.mockResolvedValue({
      data: [
        {
          id: 'inc1',
          testCaseResolutionStatusType: 'New',
          severity: 'Severity1',
          stateId: 'task-1',
          timestamp: 1700000000000,
        },
      ],
    });
    getTestCaseByName.mockResolvedValue({
      id: 'tc1',
      name: 'amount_null',
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

describe('TestCaseDetailView results chart', () => {
  beforeEach(() => {
    getTestCase.mockReset();
    getTestCaseByName.mockReset();
    listTestCaseResults.mockReset();
    listTestIncidents.mockReset();
    listTestIncidents.mockResolvedValue({ data: [] });
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

  it('plots stored results and stays empty when the API has none', async () => {
    listTestCaseResults.mockResolvedValue({
      data: [
        { testCaseStatus: 'Success', timestamp: Date.UTC(2026, 0, 1) },
        { testCaseStatus: 'Failed', timestamp: Date.UTC(2026, 0, 2) },
      ],
    });
    const { wrapper: withPoints } = await mountView();
    expect(withPoints.find('[data-testid="test-case-results-chart"]').attributes('data-points')).toBe('1');
    withPoints.unmount();

    listTestCaseResults.mockResolvedValue({ data: [] });
    const { wrapper: empty } = await mountView();
    expect(empty.find('[data-testid="test-case-results-chart"]').attributes('data-points')).toBe('0');
    expect(empty.text()).toContain('No data');
  });

  it('lists incidents for the test case on the issues tab, by FQN not by id', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    listTestIncidents.mockResolvedValue({
      data: [
        { id: 'inc1', testCaseResolutionStatusType: 'New', severity: 'Critical', timestamp: 1700000000000 },
      ],
    });
    const { wrapper } = await mountView();
    expect(listTestIncidents).toHaveBeenCalledWith({
      testCaseFQN: 'svc.db.schema.orders.row_count',
    });
    expect(wrapper.find('[data-testid="test-case-issues-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-issue-inc1"]').exists()).toBe(true);
    // Official SQL tab is shown only when inspectionQuery is present.
    expect(wrapper.find('[data-testid="dimensionality"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-case-sql-query-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-case-sql-query"]').exists()).toBe(false);
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

  it('links an issue row to the test-case alias issues path (F-D-5(a))', async () => {
    listTestCaseResults.mockResolvedValue({ data: [] });
    listTestIncidents.mockResolvedValue({
      data: [
        { id: 'inc1', testCaseResolutionStatusType: 'New', severity: 'Critical', timestamp: 1700000000000 },
      ],
    });
    const { wrapper, router } = await mountView({ id: 'tc1', tab: 'issues' });
    const link = wrapper.find('[data-testid="test-case-issue-inc1"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/test-case/svc.db.schema.orders.row_count/issues');
    expect(router.currentRoute.value.name).toBe('test-case-alias');
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
    listTestIncidents.mockReset();
    getTestDefinition.mockReset();
    listTestIncidents.mockResolvedValue({ data: [] });
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

  it('renders only the measured values the API returned, with a dash when a run has none', async () => {
    const firstTs = Date.UTC(2026, 0, 1);
    const secondTs = Date.UTC(2026, 0, 2);
    const thirdTs = Date.UTC(2026, 0, 3);
    getTestCase.mockResolvedValue({
      id: 'tc1',
      name: 'orders_diff',
      fullyQualifiedName: 'svc.db.schema.orders.table_diff',
      parameterValues: [],
      testSuites: [],
    });
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
        { testCaseStatus: 'Success', timestamp: secondTs },
        {
          testCaseStatus: 'Failed',
          timestamp: thirdTs,
          testResultValue: [
            { name: 'removedRows', value: '0' },
            { name: 'addedRows', value: '0' },
            { name: 'changedRows', value: '1' },
            { name: 'diffCount', value: '1' },
            { name: 'columnDiffCounts', value: '{"email": 1}' },
            { name: 'removedColumns', value: '0' },
            { name: 'addedColumns', value: '1' },
            { name: 'changedColumns', value: '0' },
            {
              name: 'schemaTable1',
              value:
                "serviceType='Postgres' fullyQualifiedTableName='warehouse.analytics.public.orders'",
            },
            {
              name: 'schemaTable2',
              value:
                "serviceType='Postgres' fullyQualifiedTableName='warehouse.analytics.public.orders_v2'",
            },
          ],
        },
      ],
    });
    const { wrapper } = await mountView();
    const valuesCell = wrapper.find(`[data-testid="test-case-result-values-${firstTs}"]`);
    expect(valuesCell.exists()).toBe(true);
    expect(valuesCell.text()).toContain('removedRows: 1');
    expect(valuesCell.text()).toContain('addedRows: 2');
    expect(valuesCell.text()).toContain('diffCount: 3');
    // The run without testResultValue shows a dash, and the key-set run does
    // not invent the fields the engine did not compute (no changedRows /
    // columnDiffCounts on its own row).
    expect(wrapper.find(`[data-testid="test-case-result-values-${secondTs}"]`).exists()).toBe(false);
    expect(valuesCell.text()).not.toContain('changedRows');
    expect(valuesCell.text()).not.toContain('columnDiffCounts');
    // The row-mode run computed the P2-1 fields — the generic values column
    // presents them with no view change.
    const rowModeCell = wrapper.find(`[data-testid="test-case-result-values-${thirdTs}"]`);
    expect(rowModeCell.exists()).toBe(true);
    expect(rowModeCell.text()).toContain('changedRows: 1');
    expect(rowModeCell.text()).toContain('columnDiffCounts: {"email": 1}');
    expect(rowModeCell.text()).toContain('removedColumns: 0');
    expect(rowModeCell.text()).toContain('addedColumns: 1');
    expect(rowModeCell.text()).toContain('changedColumns: 0');
    expect(rowModeCell.text()).toContain('schemaTable1:');
    expect(rowModeCell.text()).toContain('warehouse.analytics.public.orders');
    expect(rowModeCell.text()).toContain('schemaTable2:');
    expect(rowModeCell.text()).toContain('warehouse.analytics.public.orders_v2');
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
