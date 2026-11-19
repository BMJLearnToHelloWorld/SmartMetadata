/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import type { Editor } from '@tiptap/vue-3';
import Antd, { Tooltip } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import SmRichTextEditor from './SmRichTextEditor.vue';

type Exposed = {
  getEditorContent: () => string;
  clearEditorContent: () => void;
  setEditorContent: (content: string) => void;
  editor: Editor | null;
};

function mountEditor(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  const wrapper = mount(SmRichTextEditor, {
    props,
    attrs,
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  return wrapper;
}

async function tick(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await nextTick();
}

function getEditor(wrapper: VueWrapper): Editor {
  const exposed = wrapper.vm as unknown as Exposed;
  expect(exposed.editor).not.toBeNull();
  return exposed.editor as Editor;
}

describe('SmRichTextEditor shell', () => {
  it('renders the fixed editor testid with className and style, dropping undeclared attrs', async () => {
    const wrapper = mountEditor(
      { className: 'my-editor', style: 'color: rgb(1, 2, 3);' },
      { 'data-testid': 'caller-testid', id: 'caller-id' },
    );
    await tick();
    const outer = wrapper.find('[data-testid="editor"]');
    expect(outer.exists()).toBe(true);
    expect(outer.classes()).toContain('my-editor');
    expect((outer.element as HTMLElement).style.color).toBe('rgb(1, 2, 3)');
    // inheritAttrs: false — the caller's data-testid/id never land.
    expect(wrapper.find('[data-testid="caller-testid"]').exists()).toBe(false);
    expect(wrapper.find('#caller-id').exists()).toBe(false);
    expect(wrapper.find('.om-block-editor').exists()).toBe(true);
    wrapper.unmount();
  });

  it('carries placeHolder as a dead attribute while the placeholder text stays hardcoded', async () => {
    const wrapper = mountEditor({ placeHolder: 'Caller placeholder' });
    await tick();
    const outer = wrapper.find('[data-testid="editor"]');
    expect(outer.attributes('placeholder')).toBe('Caller placeholder');
    // The visible placeholder comes only from the Placeholder extension.
    const emptyParagraph = wrapper.find('.ProseMirror p');
    expect(emptyParagraph.attributes('data-placeholder')).toBe('Type "/" for commands...');
    wrapper.unmount();
  });

  it('hides the bar menu when showMenu is false', async () => {
    const wrapper = mountEditor({ showMenu: false });
    await tick();
    expect(wrapper.find('.bar-menu-wrapper').exists()).toBe(false);
    wrapper.unmount();
  });

  it('starts read-only when readonly and applies later editable changes', async () => {
    const wrapper = mountEditor({ readonly: true });
    await tick();
    const editor = getEditor(wrapper);
    expect(editor.isEditable).toBe(false);
    expect(wrapper.find('.ProseMirror').attributes('contenteditable')).toBe('false');
    await wrapper.setProps({ readonly: false });
    await tick();
    expect(editor.isEditable).toBe(true);
    wrapper.unmount();
  });
});

describe('SmRichTextEditor focus contract (Q6a)', () => {
  it('passthrough reachable: editor focus emits exactly one zero-arg focus event', async () => {
    const onFocus = vi.fn();
    const wrapper = mount(SmRichTextEditor, {
      props: { onFocus },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await tick();
    const editor = getEditor(wrapper);
    editor.commands.focus();
    await tick();
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith();
    wrapper.unmount();
  });

  it('real focus triggers: a DOM focus on the editable element emits focus once', async () => {
    const onFocus = vi.fn();
    const wrapper = mount(SmRichTextEditor, {
      props: { onFocus },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await tick();
    const editable = wrapper.find('.ProseMirror').element as HTMLElement;
    editable.focus();
    await tick();
    expect(onFocus).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not stack DOM listeners: focusing the outer wrapper emits nothing', async () => {
    const onFocus = vi.fn();
    const wrapper = mount(SmRichTextEditor, {
      props: { onFocus },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await tick();
    const outer = wrapper.find('[data-testid="editor"]').element as HTMLElement;
    outer.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await tick();
    expect(onFocus).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not autofocus by default', async () => {
    const onFocus = vi.fn();
    const wrapper = mount(SmRichTextEditor, {
      props: { onFocus },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await tick();
    expect(onFocus).not.toHaveBeenCalled();
    expect(getEditor(wrapper).isFocused).toBe(false);
    wrapper.unmount();
  });
});

describe('SmRichTextEditor content pipeline', () => {
  it('emits text-change with the folded backend format on user edits', async () => {
    const wrapper = mountEditor({ initialValue: '<p>hello</p>' });
    await tick();
    const editor = getEditor(wrapper);
    editor.commands.focus();
    editor.commands.insertContent('!');
    await tick();
    const emitted = wrapper.emitted('text-change') ?? [];
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted[emitted.length - 1]).toEqual(['<p>hello!</p>']);
    wrapper.unmount();
  });

  it('does not emit for programmatic setEditorContent (setContent emitUpdate default)', async () => {
    // Official setEditorContent calls commands.setContent with Tiptap's
    // default emitUpdate=false, so no 'update' event fires. The
    // imperative API changes the document silently, in both trees.
    const wrapper = mountEditor({ initialValue: '<p>hello</p>' });
    await tick();
    const exposed = wrapper.vm as unknown as Exposed;
    exposed.setEditorContent('<p>updated</p>');
    await tick();
    expect(wrapper.emitted('text-change')).toBeUndefined();
    expect(exposed.getEditorContent()).toBe('<p>updated</p>');
    wrapper.unmount();
  });

  it('folds an empty document to an empty string on user deletion', async () => {
    const wrapper = mountEditor({ initialValue: '<p>hello</p>' });
    await tick();
    const editor = getEditor(wrapper);
    editor.chain().focus().selectAll().deleteSelection().run();
    await tick();
    const emitted = wrapper.emitted('text-change') ?? [];
    expect(emitted[emitted.length - 1]).toEqual(['']);
    const exposed = wrapper.vm as unknown as Exposed;
    expect(exposed.getEditorContent()).toBe('');
    wrapper.unmount();
  });

  it('clearEditorContent empties silently and get returns empty', async () => {
    const wrapper = mountEditor({ initialValue: '<p>hello</p>' });
    await tick();
    const exposed = wrapper.vm as unknown as Exposed;
    exposed.clearEditorContent();
    await tick();
    expect(wrapper.emitted('text-change')).toBeUndefined();
    expect(exposed.getEditorContent()).toBe('');
    wrapper.unmount();
  });

  it('applies external initialValue changes and skips echo re-application', async () => {
    const wrapper = mountEditor({ initialValue: '<p>one</p>' });
    await tick();
    const editor = getEditor(wrapper);
    expect(editor.getHTML()).toBe('<p>one</p>');
    await wrapper.setProps({ initialValue: '<p>two</p>' });
    await tick();
    expect(editor.getHTML()).toBe('<p>two</p>');

    // Echo: setting the same content the editor already holds must not
    // force a document replace — the doc object itself is untouched.
    const docBefore = editor.state.doc;
    await wrapper.setProps({ initialValue: '<p>two</p>' });
    await tick();
    expect(editor.state.doc).toBe(docBefore);
    wrapper.unmount();
  });

  it('imperative get returns the folded backend format', async () => {
    const wrapper = mountEditor({ initialValue: '<p>hello</p>' });
    await tick();
    const exposed = wrapper.vm as unknown as Exposed;
    expect(exposed.getEditorContent()).toBe('<p>hello</p>');
    wrapper.unmount();
  });
});

describe('SmRichTextEditor bar menu and link modal', () => {
  it('renders 11 bar menu items whose tooltips are the raw command names', async () => {
    const wrapper = mountEditor({ initialValue: '<p>text</p>' });
    await tick();
    const tooltips = wrapper.findAllComponents(Tooltip);
    expect(tooltips.map((tooltip) => tooltip.props('title'))).toEqual([
      'bold',
      'italic',
      'strike',
      'inline-code',
      'unordered-list',
      'ordered-list',
      'link',
      'image',
      'code-block',
      'block-quote',
      'horizontal-line',
    ]);
    wrapper.unmount();
  });

  it('runs bar menu commands: bold toggles and image inserts a file node', async () => {    const wrapper = mountEditor({ initialValue: '<p>text</p>' });
    await tick();
    const editor = getEditor(wrapper);
    editor.commands.focus();
    await tick();

    const bold = wrapper.find('[data-format="bold"]');
    await bold.trigger('mousedown');
    await tick();
    expect(editor.isActive('bold')).toBe(true);

    const image = wrapper.find('[data-format="image"]');
    await image.trigger('mousedown');
    await tick();
    expect(editor.getHTML()).toContain('data-type="file-attachment"');
    wrapper.unmount();
  });

  it('adds a link through the modal on an empty selection', async () => {
    const wrapper = mountEditor({ initialValue: '<p>text</p>' });
    await tick();
    const editor = getEditor(wrapper);
    editor.commands.focus();
    await tick();

    await wrapper.find('[data-format="link"]').trigger('mousedown');
    await tick();
    const form = document.body.querySelector('[data-testid="link-form"]');
    expect(form).not.toBeNull();
    const input = form?.querySelector('input[name="href"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('');
    input.value = 'https://example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    expect(editor.getHTML()).toContain('href="https://example.com"');
    expect(editor.getHTML()).toContain('>https://example.com</a>');
    wrapper.unmount();
  });

  it('opens the modal empty in add mode even inside an existing link (official bar-menu quirk)', async () => {
    // BarMenu's link command runs setLink({href: ''}) before toggling,
    // which blanks the stored link mark — so getAttributes('link').href
    // is '' and the modal opens in 'add' mode with an empty input, in
    // official too (BarMenu.tsx + EditorSlots.tsx:188-200). The 'edit'
    // op is reachable only via LinkPopup, held this batch. Saving in
    // add mode with an empty selection inserts the href as link text.
    const wrapper = mountEditor({
      initialValue: '<p><a href="https://old.example.com">old</a></p>',
    });
    await tick();
    const editor = getEditor(wrapper);
    editor.commands.setTextSelection(2);
    await tick();

    await wrapper.find('[data-format="link"]').trigger('mousedown');
    await tick();
    const form = document.body.querySelector('[data-testid="link-form"]');
    expect(form).not.toBeNull();
    const input = form?.querySelector('input[name="href"]') as HTMLInputElement;
    expect(input.value).toBe('');
    input.value = 'https://new.example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    const html = editor.getHTML();
    expect(html).toContain('href="https://old.example.com"');
    expect(html).toContain('href="https://new.example.com"');
    expect(html).toContain('>https://new.example.com</a>');
    wrapper.unmount();
  });
});
