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
import Antd, { Switch } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import ToggleField from './ToggleField.vue';

function mountField(props: Record<string, unknown> = {}) {
  return mount(ToggleField, {
    props: { label: 'Use Slow Logs', ...props },
    global: { plugins: [Antd] },
  });
}

describe('ToggleField (official BooleanFieldTemplate)', () => {
  it('renders the toggle off when the value is absent, with title and description', () => {
    const wrapper = mountField({ description: 'Read slow logs.' });
    expect(wrapper.findComponent(Switch).props('checked')).toBe(false);
    expect(wrapper.find('[data-testid="toggle-field-label"]').text()).toBe('Use Slow Logs');
    expect(wrapper.find('.toggle-field-description').text()).toBe('Read slow logs.');
  });

  it('emits the new value and focus on toggle change', async () => {
    const wrapper = mountField({ modelValue: false, fieldId: 'root/useSlowLogs' });
    await wrapper.findComponent(Switch).vm.$emit('change', true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    expect(wrapper.emitted('focus')).toEqual([['root/useSlowLogs']]);
  });

  it('toggles when the label is clicked, unless disabled', async () => {
    const wrapper = mountField({ modelValue: true });
    await wrapper.find('[data-testid="toggle-field-label"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    const disabled = mountField({ modelValue: true, disabled: true });
    await disabled.find('[data-testid="toggle-field-label"]').trigger('click');
    expect(disabled.emitted('update:modelValue')).toBeUndefined();
  });
});
