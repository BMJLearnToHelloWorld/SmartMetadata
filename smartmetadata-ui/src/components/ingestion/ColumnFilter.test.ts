/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ColumnFilter from './ColumnFilter.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      settings: { services: { noDataFound: 'No data found' } },
    },
  },
});

const OPTIONS = [
  { text: 'Mysql', value: 'Mysql' },
  { text: 'Postgres', value: 'Postgres' },
];

describe('ColumnFilter', () => {
  it('renders the no-data-found text when there are no options', () => {
    const wrapper = mount(ColumnFilter, {
      props: { options: [], selectedValues: [] },
      global: { plugins: [i18n] },
    });
    const empty = wrapper.find('[data-testid="no-filter-options"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toBe('No data found');
  });

  it('renders one checkbox row per option with startCase labels', () => {
    const wrapper = mount(ColumnFilter, {
      props: { options: OPTIONS, selectedValues: ['Mysql'] },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Mysql');
    expect(wrapper.text()).toContain('Postgres');
    const checkboxes = wrapper.findAll('.ant-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].classes()).toContain('ant-checkbox-checked');
    expect(checkboxes[1].classes()).not.toContain('ant-checkbox-checked');
  });

  it('adds an unselected option, emits the new selection, and confirms immediately', async () => {
    const confirm = vi.fn();
    const wrapper = mount(ColumnFilter, {
      props: { options: OPTIONS, selectedValues: ['Mysql'], confirm },
      global: { plugins: [i18n] },
    });
    await wrapper.findAll('.column-filter__row')[1].find('input').trigger('change');
    expect(wrapper.emitted('change')).toEqual([[['Mysql', 'Postgres']]]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('removes a selected option and confirms immediately', async () => {
    const confirm = vi.fn();
    const wrapper = mount(ColumnFilter, {
      props: { options: OPTIONS, selectedValues: ['Mysql', 'Postgres'], confirm },
      global: { plugins: [i18n] },
    });
    await wrapper.findAll('.column-filter__row')[0].find('input').trigger('change');
    expect(wrapper.emitted('change')).toEqual([[['Postgres']]]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
