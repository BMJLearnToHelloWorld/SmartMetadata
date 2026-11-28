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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ColumnProfileTable from './ColumnProfileTable.vue';

vi.mock('@/api/columns', () => ({
  getTableColumnsByFQN: vi.fn(),
  searchTableColumnsByFQN: vi.fn(),
}));

vi.mock('@/api/dataQualityReports', () => ({
  fetchTestCaseResultByTestSuiteId: vi.fn(),
}));

vi.mock('@/api/profiler', () => ({
  listColumnProfiles: vi.fn(),
}));

import { getTableColumnsByFQN, searchTableColumnsByFQN } from '@/api/columns';
import { fetchTestCaseResultByTestSuiteId } from '@/api/dataQualityReports';
import { listColumnProfiles } from '@/api/profiler';

const getColumns = vi.mocked(getTableColumnsByFQN);
const searchColumns = vi.mocked(searchTableColumnsByFQN);
const fetchSummary = vi.mocked(fetchTestCaseResultByTestSuiteId);
const listProfiles = vi.mocked(listColumnProfiles);

async function mountTable(props: Record<string, unknown> = {}, query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  });
  await router.push({ path: '/', query });
  await router.isReady();
  const wrapper = mount(ColumnProfileTable, {
    props: {
      entityFqn: 'svc.db.schema.orders',
      testSuiteId: 'suite-1',
      tableProfile: { rowCount: 10, columnCount: 2, columns: [] },
      ...props,
    },
    global: { plugins: [Antd, router, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('ColumnProfileTable (official Column Profile sub-tab)', () => {
  beforeEach(() => {
    getColumns.mockReset();
    searchColumns.mockReset();
    fetchSummary.mockReset();
    listProfiles.mockReset();
    getColumns.mockResolvedValue({
      data: [
        {
          name: 'id',
          fullyQualifiedName: 'svc.db.schema.orders.id',
          dataType: 'INT',
          dataTypeDisplay: 'int',
          profile: { nullProportion: 0.1, uniqueProportion: 0.9, distinctProportion: 0.9, valuesCount: 10 },
        },
        {
          name: 'address',
          fullyQualifiedName: 'svc.db.schema.orders.address',
          dataType: 'STRUCT',
          dataTypeDisplay: 'struct',
          children: [{ name: 'city', fullyQualifiedName: 'svc.db.schema.orders.address.city', dataType: 'STRING' }],
        },
      ],
      paging: { total: 2 },
    });
    fetchSummary.mockResolvedValue({
      data: [
        {
          document_count: '3',
          entityFQN: 'svc.db.schema.orders.id',
          'testCaseResult.testCaseStatus': 'success',
        },
      ],
    });
    listProfiles.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads columns with official fields=profile, limit 50, and include=all', async () => {
    const { wrapper } = await mountTable();
    expect(getColumns).toHaveBeenCalledWith('svc.db.schema.orders', {
      limit: 50,
      offset: 0,
      fields: 'profile',
    });
    const table = wrapper.get('[data-testid="column-profile-table"]');
    expect(table.text()).toContain('id');
    expect(table.text()).toContain('10%');
    expect(table.text()).toContain('int');
    expect(wrapper.get('[data-testid="overall-summary-row-count"]').text()).toContain('10');
    wrapper.unmount();
  });

  it('shows the official no-profiler banner when the table has no profile', async () => {
    const { wrapper } = await mountTable({ tableProfile: null });
    expect(wrapper.get('[data-testid="no-profiler-placeholder"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="documentation-link"]').attributes('href')).toContain(
      'how-to-guides/data-quality-observability/profiler/workflow',
    );
    wrapper.unmount();
  });

  it('shows the permission placeholder only when permissions are loaded and ViewDataProfile is false', async () => {
    const denied = await mountTable({ permissionsLoaded: true, viewDataProfile: false });
    expect(denied.wrapper.get('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(denied.wrapper.find('[data-testid="column-profile-table"]').exists()).toBe(false);
    denied.wrapper.unmount();

    const unknown = await mountTable();
    expect(unknown.wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(unknown.wrapper.get('[data-testid="column-profile-table"]').exists()).toBe(true);
    unknown.wrapper.unmount();
  });

  it('links a non-zero test count to the Data Quality sub-tab', async () => {
    const { wrapper } = await mountTable();
    await flushPromises();
    const link = wrapper.get('[data-testid="id-test-success-count"]');
    expect(link.text()).toBe('3');
    await link.trigger('click');
    expect(wrapper.emitted('open-data-quality')?.length).toBe(1);
    wrapper.unmount();
  });

  it('expands nested columns and opens SingleColumnProfile from the column name', async () => {
    const { wrapper, router } = await mountTable();
    expect(wrapper.text()).not.toContain('city');
    await wrapper.get('[data-testid="expand-icon"]').trigger('click');
    expect(wrapper.text()).toContain('city');
    await wrapper.get('a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.activeColumnFqn).toBe('svc.db.schema.orders.id');
    expect(wrapper.get('[data-testid="profiler-tab-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="column-profile-table"]').exists()).toBe(false);
    expect(listProfiles).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the official empty-search placeholder when the page has no rows', async () => {
    getColumns.mockResolvedValueOnce({ data: [], paging: { total: 0 } });
    const { wrapper } = await mountTable();
    expect(wrapper.get('[data-testid="search-error-placeholder"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
