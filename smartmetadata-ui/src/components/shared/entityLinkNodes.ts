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
 * Mention / Hashtag nodes (ported from official
 * `components/BlockEditor/Extensions/mention/Mention.ts` and
 * `.../hashtag/Hashtag.ts` at pin a3012259ca).
 *
 * The two official files are structurally identical apart from the node
 * name, the suggestion character and the plugin key, so one factory
 * builds both — each produced node is the official definition verbatim,
 * including the parseHTML quirk (any safe-href anchor matches) and the
 * Backspace-to-char shortcut.
 *
 * Suggestion UI is HELD this batch (Q7): the suggestion options keep
 * the official `char`/`pluginKey`/`command`/`allow` and return no items
 * with no render, so typing `@`/`#` shows nothing yet. The parse/render/
 * backspace behavior and the entity-link serialization contract are
 * fully implemented; the suggestion list UI belongs to a later line.
 */
import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { SAFE_HREF_REGEX } from '@/utils/richTextUtils';

export type EntityLinkNodeOptions = {
  HTMLAttributes: Record<string, unknown>;
  renderLabel: (props: {
    options: EntityLinkNodeOptions;
    node: ProseMirrorNode;
  }) => string;
  suggestion: Omit<SuggestionOptions, 'editor'>;
};

export const MentionPluginKey = new PluginKey('mention');
export const HashtagPluginKey = new PluginKey('hashtag');

function createEntityLinkNode(
  name: 'mention' | 'hashtag',
  char: '@' | '#',
  pluginKey: PluginKey,
) {
  return Node.create<EntityLinkNodeOptions>({
    name,

    addOptions() {
      return {
        HTMLAttributes: {},
        renderLabel({ options, node }) {
          return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: {
          char,
          pluginKey,
          command: ({ editor, range, props }) => {
            // increase range.to by one when the next node is of type "text"
            // and starts with a space character
            const nodeAfter = editor.view.state.selection.$to.nodeAfter;
            const overrideSpace = nodeAfter?.text?.startsWith(' ');

            if (overrideSpace) {
              range.to += 1;
            }

            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: name,
                  attrs: props,
                },
                {
                  type: 'text',
                  text: ' ',
                },
              ])
              .run();

            window.getSelection()?.collapseToEnd();
          },
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            const type = state.schema.nodes[name];
            const allow = !!$from.parent.type.contentMatch.matchType(type);

            return allow;
          },
          // RESIDUAL (Q7): no suggestion items and no suggestion UI this
          // batch. The command above stays faithful for the future UI line.
          items: () => [],
        },
      };
    },

    group: 'inline',

    inline: true,

    selectable: false,

    atom: true,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-id'),
          renderHTML: (attributes) => {
            if (!attributes.id) {
              return {};
            }

            return {
              'data-id': attributes.id,
            };
          },
        },

        label: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-label'),
          renderHTML: (attributes) => {
            if (!attributes.label) {
              return {};
            }

            return {
              'data-label': attributes.label,
            };
          },
        },
        href: {
          default: null,
          parseHTML: (element) => element.getAttribute('href'),
          renderHTML: (attributes) => {
            if (!SAFE_HREF_REGEX.test(attributes.href ?? '')) {
              return {};
            }

            return {
              href: attributes.href,
            };
          },
        },
        type: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-entityType'),
          renderHTML: (attributes) => {
            if (!attributes.type) {
              return {};
            }

            return {
              'data-entityType': attributes.type,
            };
          },
        },
        fqn: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-fqn'),
          renderHTML: (attributes) => {
            if (!attributes.fqn) {
              return {};
            }

            return {
              'data-fqn': attributes.fqn,
            };
          },
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'a[href]',
          getAttrs: (element) =>
            SAFE_HREF_REGEX.test(element.getAttribute('href') ?? '') && null,
        },
      ];
    },

    renderHTML({ HTMLAttributes, node }) {
      return [
        'a',
        mergeAttributes(
          { 'data-type': this.name, target: '_blank' },
          this.options.HTMLAttributes,
          HTMLAttributes,
        ),
        this.options.renderLabel({
          options: this.options,
          node,
        }),
      ];
    },

    renderText({ node }) {
      return this.options.renderLabel({
        options: this.options,
        node,
      });
    },

    addKeyboardShortcuts() {
      return {
        Backspace: () =>
          this.editor.commands.command(({ tr, state }) => {
            let isMention = false;
            const { selection } = state;
            const { empty, anchor } = selection;

            if (!empty) {
              return false;
            }

            state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
              if (node.type.name !== this.name) {
                return;
              }

              isMention = true;
              tr.insertText(this.options.suggestion.char || '', pos, pos + node.nodeSize);

              return false;
            });

            return isMention;
          }),
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

export const Mention = createEntityLinkNode('mention', '@', MentionPluginKey);
export const Hashtag = createEntityLinkNode('hashtag', '#', HashtagPluginKey);
