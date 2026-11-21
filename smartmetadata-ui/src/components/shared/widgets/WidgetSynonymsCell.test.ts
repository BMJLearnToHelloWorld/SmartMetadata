/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import WidgetSynonymsCell from './WidgetSynonymsCell.vue';

function mountCell(props: Record<string, unknown> = {}) {
  return mount(WidgetSynonymsCell, {
    props: { synonyms: ['alpha', 'beta'], hasEditAccess: true, onSave: vi.fn(), ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('WidgetSynonymsCell', () => {
  it('renders saved synonyms as badges and hides the edit button without access', () => {
    const wrapper = mountCell({ hasEditAccess: false });
    expect(wrapper.text()).toContain('alpha');
    expect(wrapper.text()).toContain('beta');
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a placeholder without access when there are no synonyms', () => {
    const wrapper = mountCell({ synonyms: [], hasEditAccess: false });
    expect(wrapper.text()).toContain('—');
    expect(wrapper.find('[data-testid="synonym-add-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the add button with access when there are no synonyms', () => {
    const wrapper = mountCell({ synonyms: [] });
    expect(wrapper.find('[data-testid="synonym-add-button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('collapses past six synonyms with a show-more toggle', async () => {
    const wrapper = mountCell({
      synonyms: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(wrapper.text()).toContain('+1 more');
    expect(wrapper.text()).not.toContain('g');
    await wrapper.find('[data-testid="synonyms-show-more-btn"]').trigger('click');
    expect(wrapper.text()).toContain('g');
    expect(wrapper.text()).toContain('Show less');
    wrapper.unmount();
  });

  it('rejects a case-insensitive duplicate in the editor', async () => {
    const onSave = vi.fn();
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    const input = wrapper.find('input[data-testid="synonyms-select"]');
    await input.setValue('ALPHA');
    await wrapper.find('[data-testid="synonym-add-btn"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="synonym-duplicate-hint"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('ALPHA');
    await wrapper.find('[data-testid="save-synonym-btn"]').trigger('click');
    await nextTick();
    // Unchanged: no save is issued and the editor closes.
    expect(onSave).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="synonyms-select"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds a synonym and saves the new list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.find('input[data-testid="synonyms-select"]').setValue('gamma');
    await wrapper.find('[data-testid="synonym-add-btn"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="save-synonym-btn"]').trigger('click');
    await nextTick();
    expect(onSave).toHaveBeenCalledWith(['alpha', 'beta', 'gamma']);
    wrapper.unmount();
  });

  it('keeps the editor open when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.find('input[data-testid="synonyms-select"]').setValue('gamma');
    await wrapper.find('[data-testid="synonym-add-btn"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="save-synonym-btn"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="synonyms-select"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
