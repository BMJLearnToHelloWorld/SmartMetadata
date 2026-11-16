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
import Antd, { Input, Select } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FilterConditionComposer from './FilterConditionComposer.vue';

function mountComposer(props: Record<string, unknown> = {}) {
  return mount(FilterConditionComposer, {
    props: {
      defaultOperator: 'contains',
      fieldName: 'tableFilterPattern',
      placeholder: 'e.g. a table name',
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('FilterConditionComposer (official FilterConditionComposer)', () => {
  it('offers all five operators with locale labels', () => {
    const wrapper = mountComposer();
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { value: 'contains', label: 'contains' },
      { value: 'endsWith', label: 'ends with' },
      { value: 'is', label: 'is exactly' },
      { value: 'regex', label: 'matches regex' },
      { value: 'startsWith', label: 'starts with' },
    ]);
  });

  it('adds a trimmed condition on button click and clears the input', async () => {
    const wrapper = mountComposer();
    await wrapper.find('[data-testid="include-filter-input"]').setValue('  orders  ');
    await wrapper.find('[data-testid="include-add-button"]').trigger('click');
    expect(wrapper.emitted('add')).toEqual([[{ op: 'contains', value: 'orders' }]]);
    expect(wrapper.findComponent(Input).props('value')).toBe('');
  });

  it('adds on Enter and disables Add for a blank value', async () => {
    const wrapper = mountComposer();
    expect(
      wrapper.find('[data-testid="include-add-button"]').attributes('disabled'),
    ).toBeDefined();
    await wrapper.find('[data-testid="include-filter-input"]').setValue('tmp_');
    await wrapper.find('[data-testid="include-filter-input"]').trigger('keydown.enter');
    expect(wrapper.emitted('add')).toEqual([[{ op: 'contains', value: 'tmp_' }]]);
  });

  it('shows the regex placeholder in monospace for the regex operator', async () => {
    const wrapper = mountComposer();
    await wrapper.findComponent(Select).vm.$emit('update:value', 'regex');
    const input = wrapper.find('[data-testid="include-filter-input"]');
    expect(input.attributes('placeholder')).toBe('^prefix.*$');
    expect(input.classes()).toContain('filter-condition-regex');
  });

  it('reports focus on focus and an empty field on blur', async () => {
    const wrapper = mountComposer();
    await wrapper.find('[data-testid="include-filter-input"]').trigger('focus');
    await wrapper.find('[data-testid="include-filter-input"]').trigger('blur');
    expect(wrapper.emitted('focus')).toEqual([['tableFilterPattern'], ['']]);
  });
});
