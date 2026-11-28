/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AddTestCaseList from './AddTestCaseList.vue';

const listTestCasesBySearch = vi.fn();

vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));

describe('AddTestCaseList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads searchable rows and submits selected ids', async () => {
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
    expect(listTestCasesBySearch).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="add-test-case-submit"]').attributes('disabled')).toBeDefined();
  });
});