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
 * DOMPurify string-mode sanitizer for edit surfaces only (01 §3.1/§3.3,
 * Q8). Ported from official `utils/sanitize.utils.ts:15-50` at pin
 * a3012259ca.
 *
 * Physically separate from the preview component: `SmMarkdown` must
 * never import this module (it renders a bounded, dependency-free
 * subset and escapes raw HTML). Only the rich-text editor pipeline
 * (`richTextUtils.ts`) and editor call points use it.
 *
 * String mode only: the return value is always a string; DOMPurify's
 * DOM-returning mode is never used here.
 */
import DOMPurify from 'dompurify';

export function getSanitizeContent(html: string): string {
  // Nonce makes placeholders unique per call, preventing collisions if the
  // user's text itself contains a placeholder-shaped string.
  const nonce = Math.random().toString(36).slice(2, 10);

  // Protect entity links from DOMPurify encoding
  const entityLinkRegex = /<#E::[^>]+>/g;
  const entityLinks: string[] = [];
  let entityLinkIndex = 0;

  const protectedHtml = html.replaceAll(entityLinkRegex, (match) => {
    entityLinks.push(match);

    return `__OM_ENTITY_LINK_${nonce}_${entityLinkIndex++}__`;
  });

  // Allowlist the math-equation custom tag and its attributes instead of
  // exempting the whole match from sanitization — a raw-substring exemption
  // would let attacker-controlled attributes/children (e.g. <img onerror>)
  // nested inside the tag bypass DOMPurify entirely.
  const sanitizedContent = DOMPurify.sanitize(protectedHtml, {
    ADD_TAGS: ['block-math-equation'],
    ADD_ATTR: ['math_equation', 'isediting'],
  });

  // Restore entity links — use replacer fn so '$' in values is inserted verbatim
  let restoredContent = sanitizedContent;
  entityLinks.forEach((link, index) => {
    restoredContent = restoredContent.replace(
      `__OM_ENTITY_LINK_${nonce}_${index}__`,
      () => link,
    );
  });

  return restoredContent;
}
