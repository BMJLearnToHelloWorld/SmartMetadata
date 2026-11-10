/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official `utils/RichTextStringUtils.ts` `stripMarkdown`:
 * flatten a description to plain text for a clamped preview, where
 * markdown structure reads as noise anyway.
 *
 * The product has no `remove-markdown` dependency, so the markdown
 * pass is a small regex stripper covering the constructs
 * announcements actually carry (headings, emphasis, links, images,
 * code, lists, quotes, rules); HTML block boundaries are spaced
 * first so `<p>a</p><p>b</p>` reads as "a b" rather than "ab", and
 * entities are decoded from the same named + numeric set the
 * browser would resolve.
 *
 * ADR:2026-11-08-my-data-announcements-rail
 */

// Block editor descriptions are stored as HTML, and a markdown strip
// drops tags with nothing in their place — without this, `<p>a</p><p>b</p>`
// reads as "ab".
const HTML_BLOCK_BOUNDARY =
  /<\/?(?:p|div|li|ul|ol|h[1-6]|br|tr|td|th|blockquote|pre)\b[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body.startsWith('#x') || body.startsWith('#X')
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

export function stripMarkdown(text: string): string {
  const withoutHtml = text.replace(HTML_BLOCK_BOUNDARY, ' ').replace(/<[^>]*>/g, '');
  const stripped = withoutHtml
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/(`{3,})[^`]*\1/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)([*+-]|\d+[.)])\s+/gm, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^-{3,}$/gm, '');
  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}
