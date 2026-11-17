/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ServiceChildrenPagination from './ServiceChildrenPagination.vue';

function mountFooter(props: Record<string, unknown> = {}) {
  return mount(ServiceChildrenPagination, {
    props: {
      paging: { total: 30, after: '', before: '' },
      currentPage: 1,
      pageSize: 15,
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ServiceChildrenPagination (official NextPrevious)', () => {
  it('renders the page indicator with cursor total pages', () => {
    const wrapper = mountFooter({ paging: { total: 30, after: 'c1', before: '' }, currentPage: 1 });
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe('Page 1 of 2');
    expect(wrapper.find('[data-testid="pagination"]').exists()).toBe(true);
  });

  it('counts one page beyond the current page when a cursor exists past the total', () => {
    const wrapper = mountFooter({ paging: { total: 15, after: 'c1', before: '' }, currentPage: 1 });
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe('Page 1 of 2');
  });

  it('uses the plain total in number-based mode', () => {
    const wrapper = mountFooter({
      paging: { total: 30, after: 'c1', before: '' },
      currentPage: 2,
      isNumberBased: true,
    });
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe('Page 2 of 2');
  });

  it('emits cursor steps in cursor mode', async () => {
    const wrapper = mountFooter({ paging: { total: 30, after: 'c1', before: 'c0' }, currentPage: 2 });
    await wrapper.find('[data-testid="next"]').trigger('click');
    await wrapper.find('[data-testid="previous"]').trigger('click');
    expect(wrapper.emitted('page-change')).toEqual([
      [{ cursorType: 'after', currentPage: 3 }],
      [{ cursorType: 'before', currentPage: 1 }],
    ]);
  });

  it('emits bare page numbers in number-based mode', async () => {
    const wrapper = mountFooter({ paging: { total: 45, after: '', before: '' }, currentPage: 2, isNumberBased: true });
    await wrapper.find('[data-testid="next"]').trigger('click');
    expect(wrapper.emitted('page-change')).toEqual([[{ currentPage: 3 }]]);
  });

  it('disables Previous/Next on cursor absence in cursor mode', () => {
    const wrapper = mountFooter({ paging: { total: 30, after: '', before: '' } });
    expect(
      (wrapper.find('[data-testid="previous"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((wrapper.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Previous on page 1 and Next on the last page in number-based mode', () => {
    const first = mountFooter({ paging: { total: 30, after: '', before: '' }, currentPage: 1, isNumberBased: true });
    expect((first.find('[data-testid="previous"]').element as HTMLButtonElement).disabled).toBe(true);
    expect((first.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(false);
    const last = mountFooter({ paging: { total: 30, after: '', before: '' }, currentPage: 2, isNumberBased: true });
    expect((last.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables both buttons while loading', () => {
    const wrapper = mountFooter({
      paging: { total: 30, after: 'c1', before: 'c0' },
      currentPage: 2,
      isLoading: true,
    });
    expect((wrapper.find('[data-testid="previous"]').element as HTMLButtonElement).disabled).toBe(true);
    expect((wrapper.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits page-size changes from the selector', async () => {
    const wrapper = mountFooter();
    const select = wrapper.findComponent({ name: 'ASelect' });
    select.vm.$emit('change', 25);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('page-size-change')).toEqual([[25]]);
  });
});
