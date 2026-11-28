/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AddTestCaseList from './AddTestCaseList.vue';

const listTestCasesBySearch = vi.fn();
const fetchTableOptions = vi.fn();
const fetchColumnOptions = vi.fn();

vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));

vi.mock('@/quality/addTestCaseListFilterOptions', () => ({
  fetchAddTestCaseTableOptions: (...args: unknown[]) => fetchTableOptions(...args),
  fetchAddTestCaseColumnOptions: (...args: unknown[]) => fetchColumnOptions(...args),
}));

describe('AddTestCaseList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads rows, emits change preview, and submits includeIds', async () => {
    fetchTableOptions.mockResolvedValue([]);
    fetchColumnOptions.mockResolvedValue([]);
    listTestCasesBySearch.mockResolvedValue({
      data: [
        { id: 'tc1', name: 'col_a', entityLink: '<#E::table::db.schema.t::columns::col_a>' },
        { id: 'tc2', name: 'col_b', entityLink: '<#E::table::db.schema.t::columns::col_b>' },
      ],
      paging: { total: 2 },
    });
    const wrapper = mount(AddTestCaseList, {
      global: { plugins: [Antd, createTestI18n()] },
      props: { existingTest: [] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="add-test-case-rows"]').text()).toContain('col_a');
    expect(listTestCasesBySearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 }),
    );
    const row = wrapper.find('[data-testid="add-test-case-row-tc1"]');
    await row.setValue(true);
    await flushPromises();
    const changes = wrapper.emitted('change') ?? [];
    expect(changes.length).toBeGreaterThan(0);
    const lastChange = changes[changes.length - 1]?.[0] as { includeIds: string[]; testCases: unknown[] };
    expect(lastChange.includeIds).toContain('tc1');
    expect(lastChange.testCases.length).toBeGreaterThan(0);
    await wrapper.find('[data-testid="add-test-case-submit"]').trigger('click');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      selectAll: false,
      includeIds: ['tc1'],
    });
  });

  it('offers select-all-total when loaded page is fully selected and total is higher', async () => {
    fetchTableOptions.mockResolvedValue([]);
    fetchColumnOptions.mockResolvedValue([]);
    listTestCasesBySearch.mockResolvedValue({
      data: [{ id: 'tc1', name: 'only' }],
      paging: { total: 40 },
    });
    const wrapper = mount(AddTestCaseList, {
      global: { plugins: [Antd, createTestI18n()] },
      props: { existingTest: [] },
    });
    await flushPromises();
    await wrapper.find('[data-testid="add-test-case-select-all"]').setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="select-all-total-test-cases"]').exists()).toBe(true);
    await wrapper.find('[data-testid="select-all-total-test-cases"]').trigger('click');
    await flushPromises();
    const payload = wrapper.emitted('change')?.slice(-1)[0]?.[0] as { selectAll: boolean; filter?: unknown };
    expect(payload.selectAll).toBe(true);
    expect(payload.filter).toBeDefined();
  });
});