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
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import FieldValueBoostList from './FieldValueBoostList.vue';

const BOOSTS = [
  {
    field: 'totalVotes',
    factor: 2,
    modifier: 'ln',
    missing: 0,
    condition: { range: { gte: 5 } },
  },
  { field: 'upVotes', factor: 1, modifier: 'none', missing: 3 },
];

function mountList(entitySearchSettingsPage = false) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            field: 'Field',
            factor: 'Factor',
            modifier: 'Modifier',
            missingValue: 'Missing value',
            greaterThan: 'Greater than',
            greaterThanOrEqualTo: 'Greater than or equal to',
            lessThan: 'Less than',
            lessThanOrEqualTo: 'Less than or equal to',
            actions: 'Actions',
            editFieldValueBoost: 'Edit field value boost',
            deleteFieldValueBoost: 'Delete field value boost',
          },
        },
      },
    },
  });
  return mount(FieldValueBoostList, {
    props: {
      entitySearchSettingsPage,
      fieldValueBoosts: BOOSTS,
      isLoading: false,
      dataTestId: 'field-value-boost-table',
    },
    global: { plugins: [i18n] },
  });
}

describe('FieldValueBoostList', () => {
  it('renders the full column set on the global page', () => {
    const wrapper = mountList(false);
    const headers = wrapper.findAll('thead th').map((th) => th.text());
    expect(headers).toEqual([
      'Field',
      'Factor',
      'Modifier',
      'Missing value',
      'Greater than',
      'Greater than or equal to',
      'Less than',
      'Less than or equal to',
      'Actions',
    ]);
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('totalVotes');
    expect(rows[0].text()).toContain('5');
    expect(rows[0].text()).toContain('-');
    expect(rows[1].text()).toContain('upVotes');
  });

  it('renders only base and actions columns on the entity page', () => {
    const wrapper = mountList(true);
    const headers = wrapper.findAll('thead th').map((th) => th.text());
    expect(headers).toEqual(['Field', 'Factor', 'Actions']);
  });

  it('emits edit with the record and delete with the field name', async () => {
    const wrapper = mountList(false);
    await wrapper.findAll('[data-testid="edit-field-value-boost-btn"]')[1].trigger('click');
    expect(wrapper.emitted('edit')).toEqual([[BOOSTS[1]]]);
    await wrapper.findAll('[data-testid="delete-field-value-boost-btn"]')[0].trigger('click');
    expect(wrapper.emitted('delete')).toEqual([['totalVotes']]);
  });
});
