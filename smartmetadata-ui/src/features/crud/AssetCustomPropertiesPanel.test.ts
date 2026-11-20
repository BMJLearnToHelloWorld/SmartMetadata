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
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { CustomPropertyDef } from '@/types/collaboration';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';

const DEFS: CustomPropertyDef[] = [
  { name: 'region', displayName: 'Region', propertyType: 'string' },
  { name: 'score', displayName: 'Score', propertyType: 'integer' },
  { name: 'approved', displayName: 'Approved', propertyType: 'boolean' },
];

function mountPanel(propsOverrides: Record<string, unknown> = {}) {
  return mount(AssetCustomPropertiesPanel, {
    attachTo: document.body,
    props: {
      defs: DEFS,
      values: { region: 'us-east', score: 3, approved: true },
      error: '',
      entityType: 'table',
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('AssetCustomPropertiesPanel inline edit', () => {
  it('renders values read-only without canEdit', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('us-east');
    expect(wrapper.find('[data-testid="edit-custom-property-region"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('edits a string property inline and saves the new value', async () => {
    const onPropertySave = vi.fn(() => Promise.resolve());
    const wrapper = mountPanel({ canEdit: true, onPropertySave });
    await wrapper.find('[data-testid="edit-custom-property-region"]').trigger('click');
    // Drive the real input element: setValue on the antd Input
    // component does not reach its v-model (update:value), while the
    // DOM input event does.
    const input = wrapper.find('input[data-testid="custom-property-text-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('eu-west');
    await wrapper.find('[data-testid="save-custom-property"]').trigger('click');
    await vi.waitFor(() => expect(onPropertySave).toHaveBeenCalled());
    expect(onPropertySave).toHaveBeenCalledWith('region', 'eu-west');
    wrapper.unmount();
  });

  it('sends undefined when the editor is emptied so the caller deletes the key', async () => {
    const onPropertySave = vi.fn(() => Promise.resolve());
    const wrapper = mountPanel({ canEdit: true, onPropertySave });
    await wrapper.find('[data-testid="edit-custom-property-region"]').trigger('click');
    const input = wrapper.find('input[data-testid="custom-property-text-input"]');
    await input.setValue('');
    await wrapper.find('[data-testid="save-custom-property"]').trigger('click');
    await vi.waitFor(() => expect(onPropertySave).toHaveBeenCalled());
    expect(onPropertySave).toHaveBeenCalledWith('region', undefined);
    wrapper.unmount();
  });

  it('keeps the row in edit mode when the save throws', async () => {
    const onPropertySave = vi.fn(() => Promise.reject(new Error('save failed')));
    const wrapper = mountPanel({ canEdit: true, onPropertySave });
    await wrapper.find('[data-testid="edit-custom-property-region"]').trigger('click');
    await wrapper.find('[data-testid="save-custom-property"]').trigger('click');
    await vi.waitFor(() => expect(onPropertySave).toHaveBeenCalled());
    expect(wrapper.find('[data-testid="custom-property-text-input"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
