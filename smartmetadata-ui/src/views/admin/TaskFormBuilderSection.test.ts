/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Tag } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TaskFormBuilderSection from './TaskFormBuilderSection.vue';
import type { TaskFormDesignerField } from './taskFormDesigner';

const SELECT_FIELD: TaskFormDesignerField = {
  key: 'field-1',
  name: 'priority',
  label: 'Priority',
  type: 'singleSelect',
  required: false,
  hidden: false,
  options: ['  spaced  ', 'dup', 'dup'],
  schemaType: 'string',
};

const TEXT_FIELD: TaskFormDesignerField = {
  key: 'field-2',
  name: 'comment',
  label: 'Comment',
  description: 'Why this is needed',
  type: 'shortText',
  required: false,
  hidden: false,
  options: [],
  schemaType: 'string',
};

function mountSection(fields: TaskFormDesignerField[] = [SELECT_FIELD, TEXT_FIELD]) {
  return mount(TaskFormBuilderSection, {
    props: {
      title: 'Fields',
      description: 'Design the fields',
      fields,
      testIdPrefix: 'builder',
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

function emittedFields(wrapper: ReturnType<typeof mountSection>): TaskFormDesignerField[] {
  const emissions = wrapper.emitted('change') as Array<[TaskFormDesignerField[]]> | undefined;
  expect(emissions).toBeDefined();
  return emissions![emissions!.length - 1][0];
}

describe('TaskFormBuilderSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('labels the field remove button Remove', async () => {
    const wrapper = mountSection();
    await flushPromises();
    expect(wrapper.find('[data-testid="builder-field-remove-0"]').text()).toBe(
      createTestI18n().global.t('crud.remove'),
    );
  });

  it('inserts options verbatim, keeping surrounding whitespace', async () => {
    const wrapper = mountSection();
    await flushPromises();
    const input = wrapper.find('[data-testid="builder-field-options-0"] input');
    await input.setValue('  padded  ');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(emittedFields(wrapper)[0].options).toEqual(['  spaced  ', 'dup', 'dup', '  padded  ']);
  });

  it('inserts a whitespace-only option and ignores an empty one', async () => {
    const wrapper = mountSection();
    await flushPromises();
    const input = wrapper.find('[data-testid="builder-field-options-0"] input');
    await input.setValue('   ');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(emittedFields(wrapper)[0].options).toEqual(['  spaced  ', 'dup', 'dup', '   ']);

    const wrapper2 = mountSection();
    await flushPromises();
    const input2 = wrapper2.find('[data-testid="builder-field-options-0"] input');
    await input2.trigger('keydown.enter');
    await flushPromises();
    expect(wrapper2.emitted('change')).toBeUndefined();
  });

  it('allows duplicate options and removes all exact matches at once', async () => {
    const wrapper = mountSection();
    await flushPromises();
    const input = wrapper.find('[data-testid="builder-field-options-0"] input');
    await input.setValue('dup');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(emittedFields(wrapper)[0].options).toEqual(['  spaced  ', 'dup', 'dup', 'dup']);

    const dupTag = wrapper
      .findAllComponents(Tag)
      .find((tag) => tag.text() === 'dup');
    expect(dupTag).toBeDefined();
    await dupTag!.find('.ant-tag-close-icon').trigger('click');
    await flushPromises();
    expect(emittedFields(wrapper)[0].options).toEqual(['  spaced  ']);
  });

  it('never opens a dropdown for the options editor', async () => {
    const wrapper = mountSection();
    await flushPromises();
    const optionsArea = wrapper.find('[data-testid="builder-field-options-0"]');
    expect(optionsArea.find('.ant-select').exists()).toBe(false);
    const input = optionsArea.find('input');
    await input.trigger('focus');
    await input.trigger('click');
    await input.setValue('d');
    await flushPromises();
    expect(document.body.querySelector('.ant-select-dropdown')).toBeNull();
    expect(document.body.querySelector('.ant-dropdown')).toBeNull();
  });

  it('keeps the adjacent description editor untouched', async () => {
    const wrapper = mountSection();
    await flushPromises();
    const description = wrapper.find('[data-testid="builder-field-description-1"]');
    expect(description.element.tagName).toBe('TEXTAREA');
    expect(description.attributes('rows')).toBe('2');
    await description.setValue('Updated help text');
    await flushPromises();
    const fields = emittedFields(wrapper);
    expect(fields[1].description).toBe('Updated help text');
    expect(fields[0].options).toEqual(['  spaced  ', 'dup', 'dup']);
  });
});
