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
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import SmCodeEditor from './SmCodeEditor.vue';

function mountEditor(props: Record<string, unknown> = {}) {
  return mount(SmCodeEditor, {
    props: { value: '', ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
}

describe('SmCodeEditor shells', () => {
  it('schema variant renders the container with a fixed testid and a copy button', () => {
    const wrapper = mountEditor({ value: '{"a":1}' });
    const container = wrapper.find('[data-testid="code-mirror-container"]');
    expect(container.exists()).toBe(true);
    expect(container.classes()).toContain('schema-editor-container');
    expect(wrapper.find('[data-testid="query-copy-button"]').exists()).toBe(true);
    expect(wrapper.find('.cm-editor').exists()).toBe(true);
    // autoFormat pretty-prints the initial value into the view
    expect(wrapper.find('.cm-content').text()).toContain('"a": 1');
    wrapper.unmount();
  });

  it('schema variant shows line numbers, code variant does not', () => {
    const schema = mountEditor({ value: 'x' });
    expect(schema.find('.cm-lineNumbers').exists()).toBe(true);
    schema.unmount();

    const code = mountEditor({ variant: 'code', value: 'x', title: 'T' });
    expect(code.find('.cm-lineNumbers').exists()).toBe(false);
    code.unmount();
  });

  it('code variant renders the title row only when title or copy button is present', () => {
    const withTitle = mountEditor({ variant: 'code', value: 'x', title: 'My title' });
    expect(withTitle.find('.sm-code-editor-title').text()).toBe('My title');
    expect(withTitle.find('[data-testid="copy-button-container"]').exists()).toBe(true);
    withTitle.unmount();

    const bare = mountEditor({ variant: 'code', value: 'x', showCopyButton: false });
    expect(bare.find('.sm-code-editor-title-row').exists()).toBe(false);
    bare.unmount();
  });

  it('schema variant declares title but never renders it', () => {
    const wrapper = mountEditor({ value: 'x', title: 'Hidden' });
    expect(wrapper.find('.sm-code-editor-title-row').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Hidden');
    wrapper.unmount();
  });

  it('code variant ignores a passed autoFormat=false', () => {
    const wrapper = mountEditor({ variant: 'code', value: '{"a":1}', autoFormat: false });
    expect(wrapper.find('.cm-content').text()).toContain('"a": 1');
    wrapper.unmount();
  });

  it('schema variant honors autoFormat=false', () => {
    const wrapper = mountEditor({ value: '{"a":1}', autoFormat: false });
    expect(wrapper.find('.cm-content').text()).toBe('{"a":1}');
    wrapper.unmount();
  });

  it('hides the copy button when showCopyButton is false', () => {
    const wrapper = mountEditor({ value: 'x', showCopyButton: false });
    expect(wrapper.find('[data-testid="query-copy-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('applies className and editorClass to separate slots', () => {
    const wrapper = mountEditor({ value: 'x', className: 'outer-x', editorClass: 'inner-y' });
    expect(wrapper.find('[data-testid="code-mirror-container"]').classes()).toContain('outer-x');
    expect(wrapper.find('.inner-y').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('SmCodeEditor editing', () => {
  it('emits the same formatted value on update:modelValue and change', async () => {
    // Drive the real view through its own dispatch path (the same
    // transaction pipeline typing goes through) and assert both events
    // carry the identical formatted value.
    const wrapper = mountEditor({ value: '' });
    const view = (
      wrapper.vm as unknown as { getEditorView: () => { dispatch: (tr: unknown) => void } | null }
    ).getEditorView();
    expect(view).not.toBeNull();
    view!.dispatch({ changes: { from: 0, insert: '{"a":1}' } });
    await nextTick();
    const modelEvents = wrapper.emitted('update:modelValue');
    const changeEvents = wrapper.emitted('change');
    expect(modelEvents).toHaveLength(1);
    expect(modelEvents![0]).toEqual(['{\n  "a": 1\n}']);
    expect(changeEvents).toEqual(modelEvents);
    // The buffer stays verbatim while the parent receives formatted.
    expect(wrapper.find('.cm-content').text()).toBe('{"a":1}');
    wrapper.unmount();
  });

  it('copies the buffer verbatim on copy-button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const wrapper = mountEditor({ value: '{"a":1}', autoFormat: false });
    await wrapper.find('[data-testid="query-copy-button"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith('{"a":1}');
    wrapper.unmount();
  });

  it('applies an external value while unfocused', async () => {
    const wrapper = mountEditor({ value: 'A' });
    await wrapper.setProps({ value: 'B' });
    await nextTick();
    expect(wrapper.find('.cm-content').text()).toBe('B');
    wrapper.unmount();
  });
});
