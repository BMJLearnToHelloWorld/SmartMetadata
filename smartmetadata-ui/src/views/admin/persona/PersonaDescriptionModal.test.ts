/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent, nextTick } from 'vue';
import PersonaDescriptionModal from './PersonaDescriptionModal.vue';

const RichTextStub = defineComponent({
  props: {
    autofocus: Boolean,
    initialValue: { type: String, default: '' },
    placeHolder: { type: String, default: '' },
  },
  emits: ['text-change'],
  template:
    '<button data-testid="editor-stub" type="button" @click="$emit(\'text-change\', \'  padded content  \')">editor</button>',
});

const MESSAGES = { en: { label: { cancel: 'Cancel', save: 'Save' } } };

function mountModal(props: Record<string, unknown> = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  return mount(PersonaDescriptionModal, {
    attachTo: document.body,
    global: {
      plugins: [Antd, i18n],
      stubs: { SmRichTextEditor: RichTextStub },
    },
    props: {
      open: true,
      header: 'Edit description for Analyst',
      placeholder: 'Enter description',
      value: 'old text',
      onCancel: vi.fn(),
      onSave: vi.fn(async () => {}),
      ...props,
    },
  });
}

function bodyQuery(selector: string): HTMLElement | null {
  return document.body.querySelector(selector) as HTMLElement | null;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PersonaDescriptionModal', () => {
  it('passes the initial value, placeholder, and autofocus to the editor', async () => {
    const wrapper = mountModal();
    const editor = wrapper.findComponent(RichTextStub);
    expect(editor.props('initialValue')).toBe('old text');
    expect(editor.props('placeHolder')).toBe('Enter description');
    expect(editor.props('autofocus')).toBe(true);
    expect(bodyQuery('[data-testid="header"]')?.textContent).toBe('Edit description for Analyst');
    wrapper.unmount();
  });

  it('trims the editor content before saving', async () => {
    const onSave = vi.fn(async () => {});
    const wrapper = mountModal({ onSave });
    (bodyQuery('[data-testid="editor-stub"]') as HTMLElement).click();
    await nextTick();
    (bodyQuery('[data-testid="save"]') as HTMLElement).click();
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith('padded content');
    wrapper.unmount();
  });

  it('disables cancel and shows loading while saving', async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const wrapper = mountModal({ onSave });
    (bodyQuery('[data-testid="save"]') as HTMLElement).click();
    await nextTick();
    expect((bodyQuery('[data-testid="cancel"]') as HTMLButtonElement).disabled).toBe(true);
    expect(bodyQuery('[data-testid="save"]')?.className).toContain('ant-btn-loading');
    resolveSave();
    await flushPromises();
    await nextTick();
    expect((bodyQuery('[data-testid="cancel"]') as HTMLButtonElement).disabled).toBe(false);
    wrapper.unmount();
  });

  it('toasts on a thrown save error and leaves the modal open', async () => {
    const errorSpy = vi.spyOn(message, 'error');
    const onCancel = vi.fn();
    const wrapper = mountModal({
      onCancel,
      onSave: vi.fn(async () => {
        throw new Error('save boom');
      }),
    });
    (bodyQuery('[data-testid="save"]') as HTMLElement).click();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('save boom');
    expect(onCancel).not.toHaveBeenCalled();
    expect(bodyQuery('[data-testid="markdown-editor"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('calls onCancel from the cancel button', async () => {
    const onCancel = vi.fn();
    const wrapper = mountModal({ onCancel });
    (bodyQuery('[data-testid="cancel"]') as HTMLElement).click();
    await nextTick();
    expect(onCancel).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
