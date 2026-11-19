/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Block-editor extension assembly (ported from official
 * `utils/BlockEditorExtensionsClassBase.ts` at pin a3012259ca).
 *
 * Group order and defaults mirror `getExtensions` (:225-250):
 * Document + Paragraph + Text always first, then core, handlebars,
 * utility, table, advanced, section, admonition, code-block-copy.
 *
 * HELD THIS BATCH (Q7, recorded residuals — the default set below is
 * NOT claimed equivalent to official's default set):
 * - slashCommand (slash menu UI) — core group, excluded.
 * - Utility group entirely: DiffView, TextHighlightView,
 *   BlockAndDragDrop, Focus, Callout — no confirmed call-point need in
 *   this batch's description surfaces; the `utilityExtensions` flag
 *   still defaults true but resolves to an empty group until the
 *   utility line lands. Do not read the flag as "utilities present".
 * - MathEquation (KaTeX rendering) — advanced group, excluded.
 * - Section / Admonition / Handlebars / CodeBlockCopy — default off in
 *   official too; never enabled this batch.
 *
 * Mention/Hashtag nodes ARE included (entity-link serialization is in
 * the confirmed-needed set) with held suggestion UIs; FileNode is
 * render-only; TrailingNode is included.
 */
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Text from '@tiptap/extension-text';
import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/vue-3';
import {
  DROP_CURSOR_COLOR,
  FileType,
  type ExtensionOptions,
} from './blockEditorConstants';
import { Hashtag, Mention } from './entityLinkNodes';
import FileNode from './fileNode';
import { LinkExtension } from './linkExtension';
import { TrailingNode } from './trailingNode';

function getCoreExtensions(disableCodeBlock = false): Extensions {
  return [
    StarterKit.configure({
      codeBlock: disableCodeBlock ? false : undefined,
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      bulletList: {
        HTMLAttributes: {
          class: 'om-list-disc',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'om-list-decimal',
        },
      },
      listItem: {
        HTMLAttributes: {
          class: 'om-leading-normal',
        },
      },
      dropcursor: {
        width: 4,
        color: DROP_CURSOR_COLOR,
      },
    }),
    Placeholder.configure({
      showOnlyWhenEditable: true,
      includeChildren: true,
      showOnlyCurrent: false,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-node-empty',
      placeholder: ({ editor: coreEditor, node }) => {
        if (coreEditor.isDestroyed) {
          return '';
        }
        if (node.type.name === 'heading') {
          return `Heading ${node.attrs.level}`;
        }

        return 'Type "/" for commands...';
      },
    }),
    LinkExtension.configure({
      autolink: false,
      // Open links on click only in read-only previews. While editing, a
      // click should surface the link popup (edit/open/unlink) instead of
      // navigating away.
      openOnClick: 'whenNotEditable',
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
      validate: (href) => /^https?:\/\//.test(href),
    }),
    // RESIDUAL (Q7): slashCommand (slash menu UI) held.
    TaskList.configure({
      HTMLAttributes: {
        class: 'om-task-list',
      },
    }),
    TaskItem.configure({
      HTMLAttributes: {
        class: 'om-task-item',
      },
      nested: true,
    }),
    Mention,
    Hashtag,
  ];
}

function getHandlebarsExtensions(): Extensions {
  // Base class returns empty array - no handlebars support by default
  return [];
}

function getUtilityExtensions(): Extensions {
  // RESIDUAL (Q7): DiffView, TextHighlightView, BlockAndDragDrop, Focus,
  // Callout held — no confirmed call-point need this batch.
  return [];
}

function getTableExtensions(): Extensions {
  return [
    Table.configure({
      HTMLAttributes: {
        class: 'om-table',
        'data-om-table': 'om-table',
      },
      resizable: true,
    }),
    TableRow.configure({
      HTMLAttributes: {
        class: 'om-table-row',
        'data-om-table-row': 'om-table-row',
      },
    }),
    TableHeader.configure({
      HTMLAttributes: {
        class: 'om-table-header',
        'data-om-table-header': 'om-table-header',
      },
    }),
    TableCell.configure({
      HTMLAttributes: {
        class: 'om-table-cell',
        'data-om-table-cell': 'om-table-cell',
      },
    }),
  ];
}

function getAdvancedContentExtensions(): Extensions {
  return [
    // RESIDUAL (Q7): MathEquation (KaTeX) held.
    TrailingNode,
    FileNode.configure({
      allowedTypes: [FileType.FILE, FileType.IMAGE, FileType.VIDEO, FileType.AUDIO],
    }),
  ];
}

export function getBlockEditorExtensions(options?: ExtensionOptions): Extensions {
  const {
    enableHandlebars = false,
    coreExtensions = true,
    utilityExtensions = true,
    tableExtensions = true,
    advancedContextExtensions = true,
    enableSectionNode = false,
    enableAdmonitionNode = false,
    enableCodeBlockCopy = false,
  } = options ?? {};

  const extensions: Extensions = [
    Document,
    Paragraph,
    Text,
    ...(coreExtensions ? getCoreExtensions(enableCodeBlockCopy) : []),
    ...(enableHandlebars ? getHandlebarsExtensions() : []),
    ...(utilityExtensions ? getUtilityExtensions() : []),
    ...(tableExtensions ? getTableExtensions() : []),
    ...(advancedContextExtensions ? getAdvancedContentExtensions() : []),
  ];
  // SectionNode / AdmonitionNode / CodeBlockWithCopy are default-off in
  // official too and stay unimplemented this batch (RESIDUAL): their
  // flags are accepted above and ignored here — no extension exists to
  // add, and enabling one must not silently claim otherwise.
  void enableSectionNode;
  void enableAdmonitionNode;
  return extensions;
}
