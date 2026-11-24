/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { DatePicker } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { fieldsForSearchIndex } from '@/catalog/advancedSearchFields';
import { emptyQueryGroup, type QueryBuilderFieldDef, type QueryGroup } from '@/catalog/queryBuilder';
import { createTestI18n } from '@/test/i18n';
import AdvancedSearchBuilder from './AdvancedSearchBuilder.vue';

const FIELDS = fieldsForSearchIndex('table');

function mountBuilder(modelValue: QueryGroup) {
  return mount(AdvancedSearchBuilder, {
    props: {
      modelValue,
      fields: FIELDS,
      fetchOptions: vi.fn(async () => []),
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

// `findComponent` with a selector string is untyped in this test-utils
// version (`WrapperLike` has no `.vm`), so emit through a cast helper.
function emitChange(
  wrapper: ReturnType<typeof mountBuilder>,
  testId: string,
  event: string,
  ...args: unknown[]
): void {
  const component = wrapper.findComponent(`[data-testid="${testId}"]`);
  (component as unknown as { vm: { $emit: (event: string, ...args: unknown[]) => void } }).vm.$emit(
    event,
    ...args,
  );
}

function emitPickerChange(picker: unknown, dateString: string): void {
  (picker as unknown as { vm: { $emit: (event: string, ...args: unknown[]) => void } }).vm.$emit(
    'change',
    null,
    dateString,
  );
}

async function applyEmitted(wrapper: ReturnType<typeof mountBuilder>, times = 1) {
  for (let i = 0; i < times; i++) {
    await flushPromises();
    const emitted = wrapper.emitted('update:modelValue');
    const last = emitted?.[emitted.length - 1]?.[0] as QueryGroup | undefined;
    if (!last) {
      return;
    }
    await wrapper.setProps({ modelValue: last });
  }
}

describe('AdvancedSearchBuilder', () => {
  it('renders a rule row with field, operator and value controls', async () => {
    const wrapper = mountBuilder({
      kind: 'group',
      conjunction: 'AND',
      children: [{ kind: 'rule', field: 'ownerDisplayName', operator: 'select_equals', value: '' }],
    });
    expect(wrapper.find('[data-testid="advanced-search-rule-0-field"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="advanced-search-rule-0-operator"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="advanced-search-rule-0-value"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="advanced-search-group-root-add-rule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="advanced-search-group-root-add-group"]').exists()).toBe(true);
  });

  it('changes the field and resets the operator and value', async () => {
    const wrapper = mountBuilder({
      kind: 'group',
      conjunction: 'AND',
      children: [{ kind: 'rule', field: 'ownerDisplayName', operator: 'select_equals', value: 'a' }],
    });
    const field = wrapper.findComponent('[data-testid="advanced-search-rule-0-field"]');
    expect(field.exists()).toBe(true);
    emitChange(wrapper, 'advanced-search-rule-0-field', 'change', 'description');
    await applyEmitted(wrapper);
    const emitted = wrapper.emitted('update:modelValue')?.[0]?.[0] as QueryGroup;
    expect(emitted.children[0]).toMatchObject({
      kind: 'rule',
      field: 'description',
      operator: 'match_phrase',
      value: '',
    });
  });

  it('edits a text value through the rule input', async () => {
    const wrapper = mountBuilder({
      kind: 'group',
      conjunction: 'AND',
      children: [{ kind: 'rule', field: 'description', operator: 'match_phrase', value: '' }],
    });
    const input = wrapper.findComponent('[data-testid="advanced-search-rule-0-value"]');
    expect(input.exists()).toBe(true);
    emitChange(wrapper, 'advanced-search-rule-0-value', 'update:value', 'orders');
    await applyEmitted(wrapper);
    const emitted = wrapper.emitted('update:modelValue')?.[0]?.[0] as QueryGroup;
    expect(emitted.children[0]).toMatchObject({ field: 'description', value: 'orders' });
  });

  it('adds a nested group with an editable conjunction and removes a rule', async () => {
    const wrapper = mountBuilder({
      kind: 'group',
      conjunction: 'AND',
      children: [{ kind: 'rule', field: 'ownerDisplayName', operator: 'select_equals', value: 'a' }],
    });
    await wrapper.get('[data-testid="advanced-search-group-root-add-group"]').trigger('click');
    await applyEmitted(wrapper);
    let emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as QueryGroup;
    expect(emitted.children).toHaveLength(2);
    expect(emitted.children[1]).toEqual({ kind: 'group', conjunction: 'AND', children: [] });

    const nested = wrapper.findComponent('[data-testid="advanced-search-group-1-conjunction"]');
    expect(nested.exists()).toBe(true);
    emitChange(wrapper, 'advanced-search-group-1-conjunction', 'change', 'OR');
    await applyEmitted(wrapper);
    emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as QueryGroup;
    expect((emitted.children[1] as QueryGroup).conjunction).toBe('OR');

    await wrapper.get('[data-testid="advanced-search-rule-0-remove"]').trigger('click');
    await applyEmitted(wrapper);
    emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as QueryGroup;
    expect(emitted.children).toHaveLength(1);
    expect(emitted.children[0]).toEqual({ kind: 'group', conjunction: 'OR', children: [] });
  });

  it('renders two date pickers for a between range on a date field', async () => {
    const dateField: QueryBuilderFieldDef = {
      key: 'extension.table.reviewDate',
      label: 'Review date',
      type: 'date',
      operators: ['equal', 'not_equal', 'between', 'not_between', 'is_null', 'is_not_null'],
      entityType: 'table',
      esField: 'reviewDate',
    };
    const wrapper = mount(AdvancedSearchBuilder, {
      props: {
        modelValue: {
          kind: 'group',
          conjunction: 'AND',
          children: [{ kind: 'rule', field: dateField.key, operator: 'between', value: null }],
        },
        fields: [...FIELDS, dateField],
        fetchOptions: vi.fn(async () => []),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    // Antd DatePicker does not forward `data-testid` to its root element,
    // so locate the pickers by component instead of by test id.
    const pickers = wrapper.findAllComponents(DatePicker);
    expect(pickers).toHaveLength(2);
    expect(wrapper.findAll('.ant-picker')).toHaveLength(2);
    emitPickerChange(pickers[0], '2026-01-01');
    await applyEmitted(wrapper);
    emitPickerChange(wrapper.findAllComponents(DatePicker)[1], '2026-12-31');
    await applyEmitted(wrapper);
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as QueryGroup;
    expect(emitted.children[0]).toMatchObject({
      field: dateField.key,
      operator: 'between',
      value: ['2026-01-01', '2026-12-31'],
    });
  });

  it('shows the empty-group hint for a fresh tree', async () => {
    const wrapper = mountBuilder(emptyQueryGroup());
    expect(wrapper.text()).toContain('Add a condition or a nested group.');
  });
});
