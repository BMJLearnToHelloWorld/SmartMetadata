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
import { createTestI18n } from '@/test/i18n';
import TestCaseDetailView from './TestCaseDetailView.vue';

const getTestCase = vi.fn();
const getTestCaseByName = vi.fn();
const updateTestCase = vi.fn();
const listTestCaseResults = vi.fn();
const listTestIncidents = vi.fn();
const getTestDefinition = vi.fn();

vi.mock('@/api/testCases', () => ({
  getTestCase: (...args: unknown[]) => getTestCase(...args),
  getTestCaseByName: (...args: unknown[]) => getTestCaseByName(...args),
  updateTestCase: (...args: unknown[]) => updateTestCase(...args),
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

async function mountView(props: { id: string; tab?: string } = { id: 'tc1' }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: TestCaseDetailView, props: true },
      { path: '/test-case/:fqn/:tab?', name: 'test-case-alias', component: { template: '<div />' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-case', params: { id: props.id } });
  await router.isReady();
  const wrapper = mount(TestCaseDetailView, {
    props,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

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
    // A15: the dimensionality tab is wired now — the panel renders instead
    // of the residual, while the sql-query tab stays residual.
    expect(wrapper.find('[data-testid="test-case-dimensionality"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-sql-query-residual"]').exists()).toBe(true);
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
      ],
    });
    const wrapper = await mountView();
    const valuesCell = wrapper.find(`[data-testid="test-case-result-values-${firstTs}"]`);
    expect(valuesCell.exists()).toBe(true);
    expect(valuesCell.text()).toContain('removedRows: 1');
    expect(valuesCell.text()).toContain('addedRows: 2');
    expect(valuesCell.text()).toContain('diffCount: 3');
    // The run without testResultValue shows a dash, and nothing invents the
    // fields the engine did not compute (no changedRows / columnDiffCounts).
    expect(wrapper.find(`[data-testid="test-case-result-values-${secondTs}"]`).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('changedRows');
    expect(wrapper.text()).not.toContain('columnDiffCounts');
    wrapper.unmount();
  });

  it('opens the tableDiff fields in the edit modal and saves the merged parameter values', async () => {
    getTestCase.mockResolvedValue({
      id: 'tc1',
      name: 'orders_diff',
      fullyQualifiedName: 'svc.db.schema.orders.table_diff',
      entityFQN: 'svc.db.schema.orders',
      entityLink: '<#E::table::svc.db.schema.orders>',
      testDefinition: { id: 'td-diff', name: 'tableDiff', fullyQualifiedName: 'tableDiff' },
      parameterValues: [
        { name: 'table2', value: 'svc.db.schema.orders_copy' },
        { name: 'keyColumns', value: '["id"]' },
      ],
      testSuites: [],
    });
    listTestCaseResults.mockResolvedValue({ data: [] });
    updateTestCase.mockResolvedValue({});
    const wrapper = await mountView();
    await wrapper.get('[data-testid="edit-test-case"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="table-diff-param-table2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="table-diff-param-keyColumns"]')).not.toBeNull();
    const whereInput = document.body.querySelector(
      '[data-testid="table-diff-param-where"]',
    ) as HTMLInputElement | null;
    expect(whereInput).not.toBeNull();
    whereInput?.focus();
    if (whereInput) {
      whereInput.value = 'id > 0';
      whereInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();
    const okButton = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(updateTestCase).toHaveBeenCalledWith(
      expect.objectContaining({
        parameterValues: [
          { name: 'table2', value: 'svc.db.schema.orders_copy' },
          { name: 'keyColumns', value: '["id"]' },
          { name: 'where', value: 'id > 0' },
        ],
      }),
    );
    wrapper.unmount();
  });
});
