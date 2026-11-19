/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { Editor } from '@tiptap/vue-3';
import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getBlockEditorExtensions } from './blockEditorExtensions';

let editor: Editor | null = null;

function createEditor(options?: Parameters<typeof getBlockEditorExtensions>[0]) {
  editor = new Editor({
    extensions: getBlockEditorExtensions(options),
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function schemaNames(ed: Editor) {
  return {
    nodes: Object.keys(ed.schema.nodes),
    marks: Object.keys(ed.schema.marks),
  };
}

describe('block editor extension assembly', () => {
  it('includes the confirmed-needed nodes and marks by default', () => {
    const ed = createEditor();
    const { nodes, marks } = schemaNames(ed);
    expect(nodes).toContain('mention');
    expect(nodes).toContain('hashtag');
    expect(nodes).toContain('fileAttachment');
    expect(nodes).toContain('table');
    expect(nodes).toContain('tableRow');
    expect(nodes).toContain('tableHeader');
    expect(nodes).toContain('tableCell');
    expect(nodes).toContain('taskList');
    expect(nodes).toContain('taskItem');
    expect(nodes).toContain('heading');
    expect(nodes).toContain('codeBlock');
    expect(nodes).toContain('blockquote');
    expect(nodes).toContain('horizontalRule');
    expect(marks).toContain('link');
    expect(marks).toContain('bold');
    expect(marks).toContain('code');
  });

  it('respects the group flags', () => {
    const noCore = createEditor({ coreExtensions: false });
    expect(schemaNames(noCore).nodes).not.toContain('mention');
    noCore.destroy();
    editor = null;

    const noTable = createEditor({ tableExtensions: false });
    expect(schemaNames(noTable).nodes).not.toContain('table');
  });

  it('configures the placeholder extension with the official function', () => {
    const ed = createEditor();
    const placeholder = ed.extensionManager.extensions.find(
      (ext) => ext.name === 'placeholder',
    );
    expect(placeholder).toBeDefined();
    const fn = (placeholder?.options as { placeholder: unknown }).placeholder as (
      props: unknown,
    ) => string;
    const headingNode = { type: { name: 'heading' }, attrs: { level: 2 } };
    expect(fn({ editor: ed, node: headingNode })).toBe('Heading 2');
    const paragraphNode = { type: { name: 'paragraph' }, attrs: {} };
    expect(fn({ editor: ed, node: paragraphNode })).toBe('Type "/" for commands...');
    const destroyed = { ...ed, isDestroyed: true };
    expect(fn({ editor: destroyed, node: paragraphNode })).toBe('');
  });

  it('validates link hrefs against http(s) only', () => {
    const ed = createEditor();
    const link = ed.extensionManager.extensions.find((ext) => ext.name === 'link');
    const validate = (link?.options as { validate: (href: string) => boolean }).validate;
    expect(validate('https://example.com')).toBe(true);
    expect(validate('http://example.com/x')).toBe(true);
    expect(validate('javascript:alert(1)')).toBe(false);
    expect(validate('/relative/path')).toBe(false);
    expect(validate('')).toBe(false);
  });

  it('defines the mention/hashtag parse rules exactly as official (shadowed by the link mark)', () => {
    // ProseMirror orders mark rules before node rules at equal priority
    // (schemaRules inserts marks first), and the link mark rule matches
    // every a[href] — so in official too, a loaded <a href> parses as
    // link-marked text, never as a mention node. The parse rules below
    // are ported verbatim; this test pins the schema definitions, not
    // parser behavior the rules cannot produce.
    const ed = createEditor();
    const mentionRules = ed.schema.nodes.mention.spec.parseDOM ?? [];
    expect(mentionRules[0].tag).toBe('a[href]');
    const anchor = document.createElement('a');
    anchor.setAttribute('href', 'https://example.com/users/alice');
    // Tiptap merges the attribute parseHTML fns into the compiled rule,
    // so a match yields the parsed attrs object (the raw rule returns
    // null); an unsafe href still yields false.
    expect(mentionRules[0].getAttrs?.(anchor)).toMatchObject({
      href: 'https://example.com/users/alice',
    });
    anchor.setAttribute('href', 'javascript:alert(1)');
    expect(mentionRules[0].getAttrs?.(anchor)).toBe(false);

    const hashtagRules = ed.schema.nodes.hashtag.spec.parseDOM ?? [];
    expect(hashtagRules[0].tag).toBe('a[href]');
  });

  it('parses loaded anchors as link-marked text, like official (link rule shadows mention)', () => {
    const ed = createEditor();
    const dom = document.createElement('div');
    dom.innerHTML =
      '<p><a data-type="mention" data-id="1" data-label="Alice" href="https://example.com/users/alice" data-entityType="user" data-fqn="alice">@Alice</a></p>';
    const doc = DOMParser.fromSchema(ed.schema).parse(dom);
    const text = doc.firstChild?.firstChild;
    expect(text?.type.name).toBe('text');
    expect(text?.marks.map((mark) => mark.type.name)).toContain('link');
  });

  it('renders inserted mention nodes with the entity-link contract', () => {
    const ed = createEditor();
    ed.commands.setContent('<p></p>');
    ed.commands.insertContent({
      type: 'mention',
      attrs: {
        id: '1',
        label: 'Alice',
        href: 'https://example.com/users/alice',
        type: 'user',
        fqn: 'alice',
      },
    });
    const html = ed.getHTML();
    expect(html).toContain('data-type="mention"');
    expect(html).toContain('data-id="1"');
    expect(html).toContain('data-label="Alice"');
    expect(html).toContain('data-entitytype="user"');
    expect(html).toContain('data-fqn="alice"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://example.com/users/alice"');
    // renderLabel: @ + label
    expect(html).toContain('>@Alice</a>');
  });

  it('renders inserted hashtag nodes with the # label', () => {
    const ed = createEditor();
    ed.commands.setContent('<p></p>');
    ed.commands.insertContent({
      type: 'hashtag',
      attrs: {
        id: '7',
        label: 'PII',
        href: 'https://example.com/tags/PII',
        type: 'tag',
        fqn: 'PII',
      },
    });
    const html = ed.getHTML();
    expect(html).toContain('data-type="hashtag"');
    expect(html).toContain('>#PII</a>');
  });

  it('drops unsafe hrefs on mention render', () => {
    const ed = createEditor();
    const dom = document.createElement('div');
    dom.innerHTML =
      '<p><a data-type="mention" data-id="1" href="javascript:alert(1)">x</a></p>';
    const doc = DOMParser.fromSchema(ed.schema).parse(dom);
    // Both the link rule and the mention rule reject unsafe hrefs, so the
    // anchor degrades to plain unmarked text.
    const text = doc.firstChild?.firstChild;
    expect(text?.type.name).toBe('text');
    expect(text?.marks).toHaveLength(0);
  });

  it('parses and serializes fileAttachment nodes', () => {
    const ed = createEditor();
    const dom = document.createElement('div');
    dom.innerHTML =
      '<div data-type="file-attachment" data-url="/api/v1/attachments/x.png" data-filename="x.png" data-filesize="42" data-mimetype="image/png" data-is-image="true"></div>';
    const doc = DOMParser.fromSchema(ed.schema).parse(dom);
    const node = doc.firstChild;
    expect(node?.type.name).toBe('fileAttachment');
    expect(node?.attrs).toMatchObject({
      url: '/api/v1/attachments/x.png',
      fileName: 'x.png',
      fileSize: 42,
      mimeType: 'image/png',
      isImage: true,
    });
    const fragment = DOMSerializer.fromSchema(ed.schema).serializeFragment(doc.content);
    const out = document.createElement('div');
    out.appendChild(fragment);
    expect(out.innerHTML).toContain('data-type="file-attachment"');
    expect(out.innerHTML).toContain('data-filename="x.png"');
  });

  it('appends a trailing paragraph after a non-paragraph last node', () => {
    const ed = createEditor();
    ed.commands.setContent('<h1>Title</h1>');
    const last = ed.state.doc.lastChild;
    expect(last?.type.name).toBe('paragraph');
  });

  it('exposes the setFile command and drops the undeclared type attr', () => {
    const ed = createEditor();
    ed.commands.setContent('<p>before</p>');
    ed.commands.setFile({
      url: '',
      fileName: '',
      fileSize: null,
      mimeType: 'image',
      type: 'image',
      isImage: true,
    } as never);
    const html = ed.getHTML();
    expect(html).toContain('data-type="file-attachment"');
    // FileNodeAttrs declares `type` but the schema does not: parity drop.
    expect(ed.state.doc.firstChild?.attrs.type).toBeUndefined();
  });
});
