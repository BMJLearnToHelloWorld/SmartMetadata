/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official ContractQualityFormTab: search-by-name, official empty
 * states, Filters dropdown, and fetch error toast.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ContractQualityFormTab from './ContractQualityFormTab.vue';

const listTestCasesBySearch = vi.fn();

vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));

vi.mock('@/components/quality/TestCaseFormDrawer.vue', () => ({
  default: {
    name: 'TestCaseFormDrawer',
    props: ['open', 'initialTableFqn'],
    template:
      '<div v-if="open" data-testid="test-case-form"><button data-testid="cancel-test-form" @click="$emit(\'cancel\')">cancel</button></div>',
  },
}));

const TEST_CASES = [
  { id: 'test-1', name: 'row_count', testCaseResult: { testCaseStatus: 'Success' } },
  { id: 'test-2', name: 'null_check', testCaseResult: { testCaseStatus: 'Failed' } },
];

function mountTab(
  props: Record<string, unknown> = {},
  response: { data: unknown[]; total?: number } = { data: TEST_CASES, total: TEST_CASES.length },
) {
  listTestCasesBySearch.mockResolvedValue(response);
  return mount(ContractQualityFormTab, {
    props: {
      entityType: 'table',
      entityFqn: 'service.database.schema.table',
      selectedQuality: [],
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('ContractQualityFormTab official search and empty states', () => {
  beforeEach(() => {
    listTestCasesBySearch.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fetches test cases on mount with official search-list params', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(listTestCasesBySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        testCaseType: 'all',
        entityLink: expect.stringContaining('service.database.schema.table'),
        includeAllTests: true,
        limit: 15,
        fields: 'testCaseResult',
        include: 'non-deleted',
      }),
    );
    wrapper.unmount();
  });

  it('does not fetch when the table FQN is missing', async () => {
    const wrapper = mountTab({ entityFqn: undefined });
    await flushPromises();
    expect(listTestCasesBySearch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the official error toast when the search list fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    listTestCasesBySearch.mockRejectedValue(new Error('API Error'));
    const wrapper = mount(ContractQualityFormTab, {
      props: { entityType: 'table', entityFqn: 'service.database.schema.table' },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/API Error|unexpected error/i);
    errorSpy.mockRestore();
    wrapper.unmount();
  });

  it('shows the official no-data placeholder and disables filters when the table has no tests', async () => {
    const wrapper = mountTab({}, { data: [], total: 0 });
    await flushPromises();
    expect(wrapper.text()).toContain('No Test Cases are available');
    expect(wrapper.get('[data-testid="quality-filter-button"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps filters enabled once the table has tests', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('row_count');
    expect(wrapper.get('[data-testid="quality-filter-button"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders official search-by-name and fetches with q after the official debounce', async () => {
    vi.useFakeTimers();
    const wrapper = mountTab();
    await flushPromises();
    const search = wrapper.get('[data-testid="searchbar"]');
    expect(search.attributes('placeholder')).toBe('Search by Name');
    await search.setValue('row_count');
    expect(listTestCasesBySearch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(listTestCasesBySearch).toHaveBeenCalledTimes(2);
    expect(listTestCasesBySearch).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'row_count', offset: 0 }));
    vi.useRealTimers();
    wrapper.unmount();
  });

  it('shows official no-search-results copy when a name search matches nothing', async () => {
    vi.useFakeTimers();
    const wrapper = mountTab();
    await flushPromises();
    listTestCasesBySearch.mockResolvedValue({ data: [], total: 0 });
    await wrapper.get('[data-testid="searchbar"]').setValue('missing');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(wrapper.text()).toContain('No matching results');
    expect(wrapper.text()).toContain('Check the spelling, or try a shorter or more general term.');
    expect(wrapper.text()).not.toContain('No Test Cases are available');
    expect(wrapper.get('[data-testid="quality-filter-button"]').attributes('disabled')).toBeUndefined();
    vi.useRealTimers();
    wrapper.unmount();
  });

  it('filters by official test type and uses official filtered empty copy when nothing matches', async () => {
    const wrapper = mountTab();
    await flushPromises();
    listTestCasesBySearch.mockResolvedValue({ data: [], total: 0 });
    await wrapper.get('[data-testid="quality-filter-button"]').trigger('click');
    await flushPromises();
    const tableItem = Array.from(document.body.querySelectorAll('.ant-dropdown-menu-item')).find((node) =>
      (node.textContent ?? '').includes('Table'),
    ) as HTMLElement | undefined;
    expect(tableItem).toBeTruthy();
    tableItem!.click();
    await flushPromises();
    expect(listTestCasesBySearch).toHaveBeenLastCalledWith(expect.objectContaining({ testCaseType: 'table' }));
    expect(wrapper.text()).toContain('No matching results');
    expect(wrapper.text()).toContain('Check the spelling, or try a shorter or more general term.');
    expect(wrapper.text()).not.toContain('No results for these filters');
    expect(wrapper.get('[data-testid="quality-filter-button"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders official StatusBadge labels for test-case status, or -- when missing', async () => {
    listTestCasesBySearch.mockResolvedValue({
      data: [
        { id: 'test-1', name: 'row_count', testCaseResult: { testCaseStatus: 'Success' } },
        { id: 'test-2', name: 'null_check', testCaseResult: { testCaseStatus: 'Failed' } },
        { id: 'test-3', name: 'queued_check', testCaseResult: { testCaseStatus: 'Queued' } },
        { id: 'test-4', name: 'no_result' },
      ],
      total: 4,
    });
    const wrapper = mount(ContractQualityFormTab, {
      props: { entityType: 'table', entityFqn: 'service.database.schema.table', selectedQuality: [] },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    const success = wrapper.get('[data-testid="status-badge-row_count"]');
    expect(success.text()).toContain('Success');
    expect(success.classes()).toContain('ant-tag-success');
    const failed = wrapper.get('[data-testid="status-badge-null_check"]');
    expect(failed.text()).toContain('Failed');
    expect(failed.classes()).toContain('ant-tag-error');
    const queued = wrapper.get('[data-testid="status-badge-queued_check"]');
    expect(queued.text()).toContain('Queued');
    expect(wrapper.find('[data-testid="status-badge-no_result"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });
});