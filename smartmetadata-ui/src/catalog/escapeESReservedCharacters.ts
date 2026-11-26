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
 * Official escapeESReservedCharacters (pin utils/StringUtils.ts),
 * verbatim: backslash-escapes every Elasticsearch reserved character so
 * a field value can be wrapped in a `.*...*` include pattern — or a
 * free-text query can travel as `q` without misparsing.
 *
 * Leaf module on purpose: the escaper is a pure function, and both the
 * API client (`api/search.ts`, aggregate `fieldValue`) and the query
 * composer (`catalog/searchQuery.ts`, free-text `q`) need it. Had it
 * stayed defined in `api/search.ts`, the composer would have imported
 * the whole API-client module — and every partial `vi.mock('@/api/search')`
 * (e.g. metricOptionLoaders.test.ts, which mocks only `searchAssets`)
 * would have left the escaper undefined and broken the composer.
 * `api/search.ts` re-exports both names, so its import surface is
 * unchanged. (`api/bots.ts` carries its own copy of the same escaper —
 * a pre-existing duplication, out of scope here.)
 */
export const ES_RESERVED_CHARACTERS: Record<string, string> = {
  '+': String.raw`\+`,
  '-': String.raw`\-`,
  '=': String.raw`\=`,
  '&': String.raw`\&`,
  '|': String.raw`\|`,
  '>': String.raw`\>`,
  '<': String.raw`\<`,
  '!': String.raw`\!`,
  '(': String.raw`\(`,
  ')': String.raw`\)`,
  '{': String.raw`\{`,
  '}': String.raw`\}`,
  '[': String.raw`\[`,
  ']': String.raw`\]`,
  '^': String.raw`\^`,
  '"': String.raw`\"`,
  '~': String.raw`\~`,
  '*': String.raw`\*`,
  '?': String.raw`\?`,
  ':': String.raw`\:`,
  '\\': String.raw`\\`,
  '/': String.raw`\/`,
};

export const escapeESReservedCharacters = (text?: string): string => {
  const reUnescapedHtml = /[\\[\]#+=&|><!(){}^"~*?:/-]/g;
  const reHasUnescapedHtml = new RegExp(reUnescapedHtml.source);
  const getReplacedChar = (char: string): string => ES_RESERVED_CHARACTERS[char] ?? char;
  return text && reHasUnescapedHtml.test(text)
    ? text.replaceAll(reUnescapedHtml, getReplacedChar)
    : (text ?? '');
};
