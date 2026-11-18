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
import Antd, { message } from 'ant-design-vue';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import AccessDescription from './AccessDescription.vue';

const editorContent = ref('  edited description  ');

const EditorStub = defineComponent({
  props: { initialValue: { type: String, default: '' } },
  setup(props, { expose }) {
    expose({ getEditorContent: () => editorContent.value });
    return () => h('div', { 'data-testid': 'editor-stub' }, props.initialValue);
  },
});

const ModalStub = defineComponent({
  props: {
    open: Boolean,
    title: String,
    closable: Boolean,
    maskClosable: Boolean,
    keyboard: Boolean,
  },
  emits: ['cancel'],
  setup(props, { slots }) {
    return () =>
      props.open
        ? h('div', { 'data-testid': 'modal-stub' }, [
            h('div', { 'data-testid': 'modal-title' }, props.title),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null;
  },
});

function mountDescription(props: {
  description?: string;
  hasEditAccess: boolean;
  onDescriptionUpdate: (description: string) => Promise<unknown> | unknown;
}) {
  return mount(AccessDescription, {
    props: { entityName: 'DataSteward', ...props },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { AModal: ModalStub, SmRichTextEditor: EditorStub },
    },
  });
}

describe('AccessDescription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    editorContent.value = '  edited description  ';
  });

  it('renders the description preview and the edit button only with access', () => {
    const wrapper = mountDescription({
      description: 'Role description',
      hasEditAccess: true,
      onDescriptionUpdate: vi.fn(),
    });
    expect(wrapper.text()).toContain('Role description');
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    const denied = mountDescription({
      description: 'Role description',
      hasEditAccess: false,
      onDescriptionUpdate: vi.fn(),
    });
    expect(denied.find('[data-testid="edit-description"]').exists()).toBe(false);
  });

  it('opens a non-dismissable editor modal seeded with the current description', async () => {
    const wrapper = mountDescription({
      description: 'Role description',
      hasEditAccess: true,
      onDescriptionUpdate: vi.fn(),
    });
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    const modal = wrapper.getComponent(ModalStub);
    expect(modal.props('closable')).toBe(false);
    expect(modal.props('maskClosable')).toBe(false);
    expect(modal.props('keyboard')).toBe(false);
    expect(wrapper.find('[data-testid="editor-stub"]').text()).toBe('Role description');
  });

  it('saves the trimmed editor content and closes on success', async () => {
    const onDescriptionUpdate = vi.fn(async () => undefined);
    const wrapper = mountDescription({
      description: 'old',
      hasEditAccess: true,
      onDescriptionUpdate,
    });
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    await wrapper.get('[data-testid="save"]').trigger('click');
    await flushPromises();
    expect(onDescriptionUpdate).toHaveBeenCalledWith('edited description');
    expect(wrapper.find('[data-testid="modal-stub"]').exists()).toBe(false);
  });

  it('toasts and keeps the modal open when the handler throws', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const wrapper = mountDescription({
      description: 'old',
      hasEditAccess: true,
      onDescriptionUpdate: async () => {
        throw new Error('save failed');
      },
    });
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    await wrapper.get('[data-testid="save"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('save failed');
    expect(wrapper.find('[data-testid="modal-stub"]').exists()).toBe(true);
  });

  it('remounts the editor with the latest description on reopen', async () => {
    const wrapper = mountDescription({
      description: 'first',
      hasEditAccess: true,
      onDescriptionUpdate: vi.fn(),
    });
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    expect(wrapper.find('[data-testid="editor-stub"]').text()).toBe('first');
    await wrapper.get('[data-testid="cancel"]').trigger('click');
    await wrapper.setProps({ description: 'second' });
    await wrapper.get('[data-testid="edit-description"]').trigger('click');
    expect(wrapper.find('[data-testid="editor-stub"]').text()).toBe('second');
  });
});
