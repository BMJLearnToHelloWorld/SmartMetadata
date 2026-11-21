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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import ColumnDescriptionCell from './ColumnDescriptionCell.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

// SmMarkdown renders synchronously; the modal editor applies its
// content on a 0ms timer, so save assertions wait for a real tick.
async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function mountCell(propsOverrides: Record<string, unknown> = {}) {
  return mount(ColumnDescriptionCell, {
    attachTo: document.body,
    props: {
      description: 'The email column',
      entityName: 'email',
      hasEditAccess: true,
      onSave: () => undefined,
      ...propsOverrides,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ColumnDescriptionCell', () => {
  it('renders the description and shows the edit button when editable', async () => {
    const wrapper = mountCell();
    await tick();
    expect(wrapper.text()).toContain('The email column');
    expect(wrapper.find('[data-testid="edit-column-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the no-description text when empty', () => {
    const wrapper = mountCell({ description: '' });
    expect(wrapper.text()).toContain('No Description');
    wrapper.unmount();
  });

  it('hides the edit button without edit access or when read-only', () => {
    const noAccess = mountCell({ hasEditAccess: false });
    expect(noAccess.find('[data-testid="edit-column-description"]').exists()).toBe(false);
    noAccess.unmount();
    const readOnly = mountCell({ readOnly: true });
    expect(readOnly.find('[data-testid="edit-column-description"]').exists()).toBe(false);
    readOnly.unmount();
  });

  it('saves the trimmed editor content through the modal', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-column-description"]').trigger('click');
    await tick();
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    // The editor stores HTML (same as EntityDescriptionCell); the
    // caller persists it as the column description.
    expect(onSave).toHaveBeenCalledWith('<p>The email column</p>');
    wrapper.unmount();
  });

  it('keeps the editor open when the save throws', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('save failed')));
    const wrapper = mountCell({ onSave });
    await wrapper.find('[data-testid="edit-column-description"]').trigger('click');
    await tick();
    (document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    wrapper.unmount();
  });
});
