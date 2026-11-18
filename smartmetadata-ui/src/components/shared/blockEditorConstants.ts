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
 * Block-editor constants (ported from official
 * `constants/BlockEditor.constants.ts` and
 * `components/BlockEditor/BlockEditor.interface.ts` at pin a3012259ca).
 */
import type { EditorOptions } from '@tiptap/core';

export const EDITOR_OPTIONS: Partial<EditorOptions> = {
  enableInputRules: [
    'blockquote',
    'bold',
    'bulletList',
    'code',
    'codeBlock',
    'horizontalRule',
    'italic',
    'listItem',
    'orderedList',
    'strike',
    'image',
    'taskItem',
    'callout',
    'link',
    'MathEquation',
  ],
  parseOptions: {
    preserveWhitespace: 'full',
  },
};

export const LINK_INPUT_REGEX =
  /(?:^|\s)\[([^\]]*)?\]\((\S+)(?: ["“](.+)["”])?\)$/i;

export const LINK_PASTE_REGEX =
  /(?:^|\s)\[([^\]]*)?\]\((\S+)(?: ["“](.+)["”])?\)/gi;

export const UPLOADED_ASSETS_URL = '/api/v1/attachments/';

export const TEXT_TYPES = ['text/plain', 'text/rtf'];

export const DROP_CURSOR_COLOR = '#ebf6fe';

export enum FileType {
  TEXT_HTML = 'text/html',
  FILE = 'file',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
}

/**
 * Configuration options for enabling/disabling specific extensions.
 * Defaults mirror `BlockEditorExtensionsClassBase.getExtensions`
 * (:225-235): core/utility/table/advanced on; handlebars/section/
 * admonition/codeBlockCopy off. Groups whose extensions are held this
 * batch (Q7) resolve to empty with a residual comment at the assembly
 * site — the flags themselves are never silently reinterpreted.
 */
export interface ExtensionOptions {
  /**
   * Enable handlebars extension for template variables and helpers
   * @default false
   */
  enableHandlebars?: boolean;
  coreExtensions?: boolean;
  utilityExtensions?: boolean;
  tableExtensions?: boolean;
  advancedContextExtensions?: boolean;
  /**
   * Enable section node extension to preserve <section data-id data-highlighted> elements.
   * Required when rendering connector documentation with scroll-to-field support.
   * @default false
   */
  enableSectionNode?: boolean;
  /**
   * Enable admonition node extension to render <div data-admonition="type"> blocks.
   * Required when rendering connector documentation with $$note/$$warning/etc. blocks.
   * @default false
   */
  enableAdmonitionNode?: boolean;
  /**
   * Replace the default code block with one that includes a copy-to-clipboard button.
   * @default false
   */
  enableCodeBlockCopy?: boolean;
}
