/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { createEmptyTestDefinitionForm } from '@/quality/testDefinitionForm';
import TestDefinitionFormFields from './TestDefinitionFormFields.vue';

vi.mock('@/api/dataQualityDimensions', () => ({
  listDataQualityDimensions: vi.fn().mockResolvedValue({
    data: [{ id: 'dim-1', name: 'Accuracy', displayName: 'Accuracy' }],
    paging: { total: 1 },
  }),
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: {
    name: 'SmCodeEditor',
    props: ['modelValue', 'mode', 'variant', 'showCopyButton'],
    emits: ['update:modelValue'],
    template:
      '<textarea data-testid="code-editor" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));

describe('TestDefinitionFormFields', () => {
  it('shows the enabled toggle only in edit mode (official TestDefinitionFormBody)', () => {
    const form = createEmptyTestDefinitionForm();
    const createWrapper = mount(TestDefinitionFormFields, {
      props: { form },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(createWrapper.find('[data-testid="enabled-toggle"]').exists()).toBe(false);

    const editWrapper = mount(TestDefinitionFormFields, {
      props: { form, isEdit: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(editWrapper.find('[data-testid="enabled-toggle"]').exists()).toBe(true);
  });

  it('keeps display name and description editable when provider fields are read-only', () => {
    const form = createEmptyTestDefinitionForm();
    const wrapper = mount(TestDefinitionFormFields, {
      props: { form, isEdit: true, readOnlyExceptDimension: true },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="display-name"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[data-testid="description"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[data-testid="test-definition-name"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="add-parameter-button"]').exists()).toBe(false);
  });

  it('renders an inline error alert when errorMessage is set', () => {
    const form = createEmptyTestDefinitionForm();
    const wrapper = mount(TestDefinitionFormFields, {
      props: { form, errorMessage: 'Save failed' },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.text()).toContain('Save failed');
  });

  it('loads dimension options with limit 1000', async () => {
    const { listDataQualityDimensions } = await import('@/api/dataQualityDimensions');
    const form = createEmptyTestDefinitionForm();
    mount(TestDefinitionFormFields, {
      props: { form },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(listDataQualityDimensions).toHaveBeenCalledWith({ limit: 1000 });
  });

  it('renders SmCodeEditor for SQL when fields are editable (official CodeEditor)', () => {
    const form = reactive(createEmptyTestDefinitionForm());
    const wrapper = mount(TestDefinitionFormFields, {
      props: { form },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="code-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sql-expression"]').exists()).toBe(true);
  });

  it('adds a parameter row when Add Parameter is clicked', async () => {
    const form = reactive(createEmptyTestDefinitionForm());
    const wrapper = mount(TestDefinitionFormFields, {
      props: { form },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="parameter-name-0"]').exists()).toBe(false);
    await wrapper.get('[data-testid="add-parameter-button"]').trigger('click');
    await flushPromises();
    expect(form.parameterDefinition).toHaveLength(1);
    expect(wrapper.find('[data-testid="parameter-name-0"]').exists()).toBe(true);
  });
});