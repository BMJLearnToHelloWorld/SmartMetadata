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
import TotalDataAssetsWidget, { type TotalAssetsCount } from './TotalDataAssetsWidget.vue';

function mountWidget(props: Record<string, unknown> = {}) {
  return mount(TotalDataAssetsWidget, {
    props: { totalAssetsCount: [], isLoading: false, ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('TotalDataAssetsWidget (official TotalDataAssetsWidget)', () => {
  it('renders the title, description and one row per entity with compact counts', () => {
    const rows: TotalAssetsCount[] = [
      { key: 'database', name: 'Database', value: 2 },
      { key: 'table', name: 'Table', value: 1500 },
    ];
    const wrapper = mountWidget({ totalAssetsCount: rows });
    expect(wrapper.find('[data-testid="total-data-assets-widget"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Total Data Assets');
    expect(wrapper.text()).toContain('Total assets present in the service connection.');
    expect(wrapper.find('[data-testid="Database-count"]').text()).toBe('2');
    expect(wrapper.find('[data-testid="Table-count"]').text()).toBe('1.5K');
    expect(wrapper.findAll('.total-data-assets-widget__row')).toHaveLength(2);
  });

  it('shows the placeholder when the list is empty', () => {
    const wrapper = mountWidget();
    expect(wrapper.find('[data-testid="total-data-assets-empty"]').exists()).toBe(true);
    expect(wrapper.findAll('.total-data-assets-widget__row')).toHaveLength(0);
  });

  it('shows the placeholder when every value is zero', () => {
    const wrapper = mountWidget({
      totalAssetsCount: [{ key: 'table', name: 'Table', value: 0 }],
    });
    expect(wrapper.find('[data-testid="total-data-assets-empty"]').exists()).toBe(true);
  });

  it('shows the skeleton while loading and no rows', () => {
    const wrapper = mountWidget({
      isLoading: true,
      totalAssetsCount: [{ key: 'table', name: 'Table', value: 3 }],
    });
    expect(wrapper.find('.ant-skeleton').exists()).toBe(true);
    expect(wrapper.findAll('.total-data-assets-widget__row')).toHaveLength(0);
  });
});
