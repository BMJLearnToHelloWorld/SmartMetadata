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
import MapEditor from './MapEditor.vue';

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(MapEditor, {
    props: { title: 'Connection Options', ...props },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('MapEditor (official additionalProperties editing)', () => {
  it('renders one key/value row per entry with the schema title', () => {
    const wrapper = mountEditor({ modelValue: { ssl: 'true', timeout: '30' } });
    expect(wrapper.find('.map-editor-title').text()).toBe('Connection Options');
    expect(wrapper.findAll('.map-editor-row')).toHaveLength(2);
    expect(wrapper.find('[data-testid="map-editor-value-ssl"]').attributes('value')).toBe('true');
  });

  it('shows the empty state and the fallback title without a schema title', () => {
    const wrapper = mountEditor({ title: undefined, modelValue: {} });
    expect(wrapper.find('.map-editor-title').text()).toBe('Additional Properties');
    expect(wrapper.find('.map-editor-empty').text()).toBe('No properties added.');
  });

  it('adds a seeded row and removes rows', async () => {
    const wrapper = mountEditor({ modelValue: { a: '1' } });
    await wrapper.find('[data-testid="map-editor-add"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { a: '1', newKey1: 'New Value' },
    ]);
    await wrapper.find('[data-testid="map-editor-remove-a"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}]);
  });

  it('updates values and renames keys on blur', async () => {
    const wrapper = mountEditor({ modelValue: { ssl: 'true' } });
    await wrapper.find('[data-testid="map-editor-value-ssl"]').setValue('false');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ ssl: 'false' }]);
    const keyInput = wrapper.find('[data-testid="map-editor-key-ssl"]');
    await keyInput.setValue('useSsl');
    await keyInput.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ useSsl: 'true' }]);
  });

  it('ignores blank and duplicate key commits', async () => {
    const wrapper = mountEditor({ modelValue: { a: '1', b: '2' } });
    const keyInput = wrapper.find('[data-testid="map-editor-key-a"]');
    await keyInput.setValue('b');
    await keyInput.trigger('blur');
    await keyInput.setValue('   ');
    await keyInput.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
