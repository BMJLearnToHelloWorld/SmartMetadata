/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import NextPrevious from './NextPrevious.vue';

// Local messages: the component references official keys the integration
// line has not written yet. Asserting rendered copy pins the exact key
// names.
function createPaginationI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        label: {
          'page-plural': 'Pages',
          previous: 'Previous',
          next: 'Next',
          page: 'Page',
          of: 'of',
        },
      },
    },
  });
}

function mountFooter(props: Record<string, unknown> = {}) {
  return mount(NextPrevious, {
    props: {
      paging: { total: 30, after: '', before: '' },
      pagingHandler: vi.fn(),
      pageSize: 15,
      currentPage: 1,
      ...props,
    },
    global: { plugins: [Antd, createPaginationI18n()] },
  });
}

describe('NextPrevious (official NextPrevious.tsx)', () => {
  it('renders the page indicator with cursor total pages', () => {
    const wrapper = mountFooter({ paging: { total: 30, after: 'c1', before: '' } });
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe('Page 1 of 2');
    expect(wrapper.find('[data-testid="pagination"]').attributes('aria-label')).toBe('Pages');
  });

  it('counts one page beyond the current page when an after cursor exists past the total', () => {
    const wrapper = mountFooter({ paging: { total: 15, after: 'c1', before: '' } });
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

  it('passes cursor steps in cursor mode and bare page numbers in number-based mode', async () => {
    const pagingHandler = vi.fn();
    const wrapper = mountFooter({
      paging: { total: 30, after: 'c1', before: 'c0' },
      currentPage: 2,
      pagingHandler,
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    await wrapper.find('[data-testid="previous"]').trigger('click');
    expect(pagingHandler).toHaveBeenCalledWith({ cursorType: 'after', currentPage: 3 });
    expect(pagingHandler).toHaveBeenCalledWith({ cursorType: 'before', currentPage: 1 });

    const numberHandler = vi.fn();
    const numbered = mountFooter({
      paging: { total: 45, after: '', before: '' },
      currentPage: 2,
      isNumberBased: true,
      pagingHandler: numberHandler,
    });
    await numbered.find('[data-testid="next"]').trigger('click');
    expect(numberHandler).toHaveBeenCalledWith({ currentPage: 3 });
    expect(numberHandler.mock.calls[0][0]).not.toHaveProperty('cursorType');
  });

  it('disables from server cursors in cursor mode and from page bounds in number-based mode', () => {
    const cursor = mountFooter({ paging: { total: 30, after: '', before: '' } });
    expect(
      (cursor.find('[data-testid="previous"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((cursor.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );

    const first = mountFooter({
      paging: { total: 30, after: '', before: '' },
      currentPage: 1,
      isNumberBased: true,
    });
    expect((first.find('[data-testid="previous"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((first.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(false);
    const last = mountFooter({
      paging: { total: 30, after: '', before: '' },
      currentPage: 2,
      isNumberBased: true,
    });
    expect((last.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables both buttons and the size dropdown while loading', () => {
    const wrapper = mountFooter({
      paging: { total: 30, after: 'c1', before: 'c0' },
      currentPage: 2,
      isLoading: true,
      onShowSizeChange: vi.fn(),
    });
    expect(
      (wrapper.find('[data-testid="previous"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((wrapper.find('[data-testid="next"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(
      (wrapper.find('[data-testid="page-size-selection-dropdown"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('renders the size dropdown only when onShowSizeChange is passed (opt-in)', () => {
    const without = mountFooter();
    expect(without.find('[data-testid="page-size-selection-dropdown"]').exists()).toBe(false);
    const withHandler = mountFooter({ onShowSizeChange: vi.fn() });
    expect(withHandler.find('[data-testid="page-size-selection-dropdown"]').exists()).toBe(true);
    expect(withHandler.find('[data-testid="page-size-selection-dropdown"]').text()).toContain(
      '15 / Page',
    );
  });

  it('defaults size options to 15/25/50 and honours caller-provided options', () => {
    const wrapper = mountFooter({ onShowSizeChange: vi.fn() });
    const menu = wrapper.findComponent({ name: 'ADropdown' }).props('menu') as {
      items: { key: string; label: string }[];
    };
    expect(menu.items.map((item) => item.key)).toEqual(['15', '25', '50']);
    expect(menu.items[0].label).toBe('15 / Page');

    const custom = mountFooter({ onShowSizeChange: vi.fn(), pageSizeOptions: [12, 24, 48] });
    const customMenu = custom.findComponent({ name: 'ADropdown' }).props('menu') as {
      items: { key: string }[];
    };
    expect(customMenu.items.map((item) => item.key)).toEqual(['12', '24', '48']);
  });

  it('calls onShowSizeChange with the chosen size as a number', async () => {
    const onShowSizeChange = vi.fn();
    const wrapper = mountFooter({ onShowSizeChange });
    const menu = wrapper.findComponent({ name: 'ADropdown' }).props('menu') as {
      onClick: (info: { key: string }) => void;
    };
    menu.onClick({ key: '25' });
    await wrapper.vm.$nextTick();
    expect(onShowSizeChange).toHaveBeenCalledWith(25);
  });
});
