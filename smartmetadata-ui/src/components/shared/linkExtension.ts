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
 * Link mark extension (ported from official
 * `components/BlockEditor/Extensions/link.ts` at pin a3012259ca).
 * Extends `@tiptap/extension-link` with the entity-link data attributes
 * and the markdown-link input/paste rules.
 */
import {
  InputRule,
  markInputRule,
  markPasteRule,
  PasteRule,
} from '@tiptap/core';
import TipTapLinkExtension from '@tiptap/extension-link';
import { LINK_INPUT_REGEX, LINK_PASTE_REGEX } from './blockEditorConstants';

const linkInputRule = (config: Parameters<typeof markInputRule>[0]) => {
  const defaultMarkInputRule = markInputRule(config);

  return new InputRule({
    find: config.find,
    handler(props) {
      const { tr } = props.state;

      defaultMarkInputRule.handler(props);
      tr.setMeta('preventAutolink', true);
    },
  });
};

const linkPasteRule = (config: Parameters<typeof markPasteRule>[0]) => {
  const defaultMarkPasteRule = markPasteRule(config);

  return new PasteRule({
    find: config.find,
    handler(props) {
      const { tr } = props.state;

      defaultMarkPasteRule.handler(props);
      tr.setMeta('preventAutolink', true);
    },
  });
};

type DataAttributeName =
  | 'data-id'
  | 'data-label'
  | 'data-entityType'
  | 'data-fqn'
  | 'data-type'
  | 'data-textcontent';

function dataAttribute(name: DataAttributeName) {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(name),
    renderHTML: (attributes: Record<string, unknown>) => {
      if (!attributes[name]) {
        return {};
      }

      return {
        [name]: attributes[name],
      };
    },
  };
}

export const LinkExtension = TipTapLinkExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-id': dataAttribute('data-id'),
      'data-label': dataAttribute('data-label'),
      'data-entityType': dataAttribute('data-entityType'),
      'data-fqn': dataAttribute('data-fqn'),
      'data-type': dataAttribute('data-type'),
      'data-textcontent': dataAttribute('data-textcontent'),
    };
  },
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      linkInputRule({
        find: LINK_INPUT_REGEX,
        type: this.type,
        getAttributes(match) {
          return {
            title: match.pop()?.trim(),
            href: match.pop()?.trim(),
          };
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      ...(this.parent?.() ?? []),
      linkPasteRule({
        find: LINK_PASTE_REGEX,
        type: this.type,
        getAttributes(match) {
          return {
            title: match.pop()?.trim(),
            href: match.pop()?.trim(),
          };
        },
      }),
    ];
  },
});
