/**
 * Copyright 2026 SmartMetadata authors.
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
import EntityDescriptionCell from './EntityDescriptionCell.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

// The read-only preview editor applies its content on a 0ms timer
// (SmRichTextEditor content effect), so assertions on rendered text
// wait for a real tick, as SmRichTextEditor.test.ts does.
async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function mountCell(props: Record<string, unknown> = {}) {
  return mount(EntityDescriptionCell, {
    props: { entityName: 'Finance', hasEditAccess: true, ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('EntityDescriptionCell preview (D-3)', () => {
  it('renders a plain description through the read-only editor', async () => {
    const wrapper = mountCell({ description: 'Finance assets' });
    await tick();
    const preview = wrapper.find('.ProseMirror');
    expect(preview.exists()).toBe(true);
    expect(preview.attributes('contenteditable')).toBe('false');
    expect(preview.text()).toContain('Finance assets');
    expect(wrapper.find('.bar-menu-wrapper').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders editor HTML as formatted text, never as literal tags', async () => {
    const wrapper = mountCell({ description: '<p><strong>Bold</strong> text</p>' });
    await tick();
    const preview = wrapper.find('.ProseMirror');
    expect(preview.text()).toContain('Bold text');
    expect(wrapper.text()).not.toContain('<p>');
    expect(wrapper.text()).not.toContain('<strong>');
    wrapper.unmount();
  });

  it('renders markdown descriptions as formatted text', async () => {
    const wrapper = mountCell({ description: 'Hello **world**' });
    await tick();
    expect(wrapper.find('.ProseMirror').text()).toContain('Hello world');
    wrapper.unmount();
  });

  it('shows the empty text and no editor for an empty description', async () => {
    const wrapper = mountCell({ description: '' });
    await tick();
    expect(wrapper.find('.ProseMirror').exists()).toBe(false);
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('keeps the caller empty text (Glossary noDescription)', async () => {
    const wrapper = mountCell({ description: '', emptyText: 'No description added' });
    await tick();
    expect(wrapper.text()).toContain('No description added');
    wrapper.unmount();
  });

  it('folds long descriptions behind read-more and unfolds on click', async () => {
    const long = `word ${'lorem ipsum dolor sit amet '.repeat(20)}`;
    expect(long.length).toBeGreaterThan(350);
    const wrapper = mountCell({ description: long });
    await tick();
    expect(wrapper.find('[data-testid="read-more-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="read-more-button"]').trigger('click');
    await tick();
    expect(wrapper.find('[data-testid="read-less-button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('never folds when removeBlur is set (Domain) and starts unfolded when expanded', async () => {
    const long = `word ${'lorem ipsum dolor sit amet '.repeat(20)}`;
    const noFold = mountCell({ description: long, removeBlur: true });
    await tick();
    expect(noFold.find('[data-testid="read-more-button"]').exists()).toBe(false);
    expect(noFold.find('[data-testid="read-less-button"]').exists()).toBe(false);
    noFold.unmount();

    const expanded = mountCell({ description: long, expanded: true });
    await tick();
    expect(expanded.find('[data-testid="read-less-button"]').exists()).toBe(true);
    expanded.unmount();
  });
});

describe('EntityDescriptionCell edit gate (D-4)', () => {
  it('hides the edit button without edit access', async () => {
    const wrapper = mountCell({ description: 'text', hasEditAccess: false });
    await tick();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the edit button in version view and when read-only', async () => {
    const version = mountCell({ description: 'text', isVersionView: true });
    await tick();
    expect(version.find('[data-testid="edit-description"]').exists()).toBe(false);
    version.unmount();

    const readOnly = mountCell({ description: 'text', isReadOnly: true });
    await tick();
    expect(readOnly.find('[data-testid="edit-description"]').exists()).toBe(false);
    readOnly.unmount();
  });

  it('renders no edit button without a save handler (preview-only)', async () => {
    const wrapper = mountCell({ description: 'text', onDescriptionUpdate: undefined });
    await tick();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the edit button with access and a save handler', async () => {
    const wrapper = mountCell({ description: 'text', onDescriptionUpdate: vi.fn() });
    await tick();
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('EntityDescriptionCell edit save', () => {
  // The antd Modal teleports to document.body, so its footer buttons
  // are queried on the document, as the delete-confirm tests do.
  function saveButton(): HTMLElement | null {
    return document.body.querySelector('[data-testid="save"]') as HTMLElement | null;
  }

  it('saves the editor content and closes on success', async () => {
    const onDescriptionUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCell({ description: 'Finance assets', onDescriptionUpdate });
    await tick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await tick();
    const save = saveButton();
    expect(save).not.toBeNull();
    save?.click();
    await tick();
    expect(onDescriptionUpdate).toHaveBeenCalledTimes(1);
    expect(String(onDescriptionUpdate.mock.calls[0][0])).toContain('Finance assets');
    // Success closes the modal: antd keeps the node but hides it.
    const modal = document.body.querySelector('.ant-modal') as HTMLElement | null;
    expect(modal?.style.display).toBe('none');
    wrapper.unmount();
  });

  it('keeps the modal open and toasts when the save throws', async () => {
    const onDescriptionUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountCell({ description: 'Finance assets', onDescriptionUpdate });
    await tick();
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await tick();
    saveButton()?.click();
    await tick();
    expect(onDescriptionUpdate).toHaveBeenCalledTimes(1);
    expect(saveButton()).not.toBeNull();
    wrapper.unmount();
  });
});
