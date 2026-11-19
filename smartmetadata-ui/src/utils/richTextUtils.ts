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
 * Rich-text HTML/Markdown conversion pipeline (01 §3.3/§4, M-0).
 *
 * Ported from official `utils/BlockEditorPureUtils.ts`,
 * `utils/BlockEditorUtils.ts` (string parts only — the Editor-touching
 * tail of `setEditorContent` lives in `SmRichTextEditor.vue`),
 * `utils/FeedUtilsPure.ts` (mention/hashtag extraction),
 * `constants/Feeds.constants.ts` (regexes + `ENTITY_URL_MAP`) and
 * `utils/StringUtils.ts` (`removeAttachmentsWithoutUrl`) at pin
 * a3012259ca. Line anchors are recorded in the batch benchmark log.
 *
 * M-0 (Q4/Q12): the Markdown→HTML direction exists only to render
 * legacy Markdown content into the editor; no serialization back to
 * Markdown is implemented (M-1/M-2 unselected). Persona descriptions
 * follow the HTML path. There is no `serialization` prop anywhere.
 *
 * Two attachment-stripping helpers exist on purpose and must not be
 * merged: `stripPendingUploadNodes` removes only uploading nodes
 * without a URL; `removeAttachmentsWithoutUrl` removes every attachment
 * node without a URL.
 */
import Showdown from 'showdown';
import { getSanitizeContent } from './sanitizeContent';

export const SAFE_HREF_REGEX = /^(https?:\/\/|\/|#)/i;
export const ENTITY_LINK_SEPARATOR = '::';

export const ENTITY_URL_MAP = {
  team: 'settings/members/teams',
  user: 'users',
} as const;

const mentionRegEx = /\[@(.+?)?\]\((.+?)?\)/g;
const hashtagRegEx = /\[#(.+?)?\]\((.+?)?\)/g;
const linkRegEx = /\((.+?\/\/.+?)\/(.+?)\/(.+?)\)/;
const teamsLinkRegEx = /\((.+?\/\/.+?)\/(.+?\/.+?\/.+?)\/(.+?)\)/;

function getMentionList(message: string): string[] | null {
  return message.match(mentionRegEx);
}

function getHashTagList(message: string): string[] | null {
  return message.match(hashtagRegEx);
}

function getEntityDetail(item: string): RegExpMatchArray | null {
  if (item.includes('teams')) {
    return item.match(teamsLinkRegEx);
  }
  return item.match(linkRegEx);
}

export function convertMarkdownFormatToHtmlString(markdown: string): string {
  let updatedMessage = markdown;
  const urlEntries = Object.entries(ENTITY_URL_MAP);

  const mentionList = getMentionList(markdown) ?? [];
  const hashTagList = getHashTagList(markdown) ?? [];

  const mentionMap = new Map<string, RegExpMatchArray | null>(
    mentionList.map((mention) => [mention, getEntityDetail(mention)]),
  );

  const hashTagMap = new Map<string, RegExpMatchArray | null>(
    hashTagList.map((hashTag) => [hashTag, getEntityDetail(hashTag)]),
  );

  [...mentionMap.entries()]
    .sort(([leftKey], [rightKey]) => rightKey.length - leftKey.length)
    .forEach(([key, value]) => {
      if (value) {
        const [, href, rawEntityType, fqn] = value;
        const entityType = urlEntries.find((e) => e[1] === rawEntityType)?.[0];

        if (entityType) {
          const entityLink = `<a href="${href}/${rawEntityType}/${fqn}" data-type="mention" data-entityType="${entityType}" data-fqn="${fqn}" data-label="${fqn}">@${fqn}</a>`;
          updatedMessage = updatedMessage.replaceAll(key, () => entityLink);
        }
      }
    });

  [...hashTagMap.entries()]
    .sort(([leftKey], [rightKey]) => rightKey.length - leftKey.length)
    .forEach(([key, value]) => {
      if (value) {
        const [, href, rawEntityType, fqn] = value;

        const entityLink = `<a href="${href}/${rawEntityType}/${fqn}" data-type="hashtag" data-entityType="${rawEntityType}" data-fqn="${fqn}" data-label="${fqn}">#${fqn}</a>`;
        updatedMessage = updatedMessage.replaceAll(key, () => entityLink);
      }
    });

  return updatedMessage;
}

// Lists and tables are structural markup the markdown converter cannot round
// trip: Showdown hashes such markup as inline spans and its unhash pass gives
// up after 10 levels of nesting, leaking placeholders into the rendered
// output. Content carrying one is always treated as HTML.
const STRUCTURAL_HTML_SELECTOR = 'ul, ol, table';

// A fenced block or a code span holds a literal example. `DOMParser` has no
// notion of either, so `<table>…` written inside one parses into a real
// element — dropping these regions first keeps a code sample from being read
// as rendered content.
const MARKDOWN_CODE_REGION = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g;

// Markdown's third code form: a line indented by four spaces or a tab, opening
// after a blank line or at the start of the document.
const INDENTED_CODE_LINE = /^(?: {4}|\t)/;

// Blockquote markers sit outside the indentation they quote, so they come off
// before a line is measured — `>     <table>` is an indented code block too.
const BLOCKQUOTE_MARKER = /^ {0,3}(?:> ?)+/;

/**
 * Blanks out every markdown code region — fenced blocks, code spans, and
 * four-space-indented blocks — leaving the surrounding text in place.
 *
 * An indented block runs from its opening line until a line that is neither
 * indented nor blank, which is why this is a line walk rather than one regex.
 */
function stripMarkdownCodeRegions(content: string): string {
  let isInIndentedBlock = false;
  let previousLineWasBlank = true;

  return content
    .replace(MARKDOWN_CODE_REGION, '')
    .split('\n')
    .map((line) => {
      const quotedLine = line.replace(BLOCKQUOTE_MARKER, '');
      const isBlank = quotedLine.trim() === '';
      const isIndented = INDENTED_CODE_LINE.test(quotedLine);

      isInIndentedBlock = isInIndentedBlock
        ? isIndented || isBlank
        : previousLineWasBlank && isIndented;
      previousLineWasBlank = isBlank;

      return isInIndentedBlock ? '' : line;
    })
    .join('\n');
}

export function isHTMLString(content: string): boolean {
  const commonHtmlTags =
    /<(p|div|span|a|ul|ol|li|table|h[1-6]|br|strong|em|code|pre)[>\s]/i;

  if (!commonHtmlTags.test(content)) {
    return false;
  }

  try {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(content, 'text/html');

    // Bare text between the markup is what makes a document markdown prose.
    // Serialized editor output has none, and its indentation is pretty
    // printing rather than a code block — so only prose is read with code
    // regions removed. Reading serialized HTML that way would discard its own
    // markup and hand it back to the converter, which is the corruption this
    // whole guard exists to prevent.
    const hasProseAroundMarkup = Array.from(parsedDocument.body.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
    );

    // Everything below reads this one view of the document. Deciding what
    // counts as an element from one view and what counts as a list from
    // another lets pretty-printed markup lose its own lists.
    const renderedMarkup = hasProseAroundMarkup
      ? parser.parseFromString(stripMarkdownCodeRegions(content), 'text/html')
      : parsedDocument;

    const hasHtmlElements = Array.from(renderedMarkup.body.childNodes).some(
      (node) => node.nodeType === Node.ELEMENT_NODE,
    );

    if (hasHtmlElements && renderedMarkup.body.querySelector(STRUCTURAL_HTML_SELECTOR)) {
      return true;
    }

    const markdownPatterns = [
      /^#{1,6}\s/,
      /^\s*[-*+]\s/,
      /^\s*\d+\.\s/,
      /^\s*>{1,}\s/,
      /^---|\*\*\*|___/,
      /`{1,3}[^`]+`{1,3}/,
      /(\*\*)[^*]+(\*\*)|(__)[^_]+(__)/,
    ];

    // Match against the rendered text, not the markup: tag names and
    // attribute values (`__`, `*`, backticks in a URL) are not markdown and
    // must not push already-rendered HTML down the converter path.
    const textContent = parsedDocument.body.textContent ?? '';

    const hasMarkdownSyntax = markdownPatterns.some((pattern) => pattern.test(textContent));

    return hasHtmlElements && !hasMarkdownSyntax;
  } catch {
    return false;
  }
}

const markdownToHtmlConverter = new Showdown.Converter({
  ghCodeBlocks: true,
  encodeEmails: false,
  ellipsis: false,
  simplifiedAutoLink: true,
  tables: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true,
  underline: true,
});

/**
 * Converts a markdown string to an HTML string. Content that is already HTML
 * is returned untouched.
 */
export function getHtmlStringFromMarkdownString(content: string): string {
  return isHTMLString(content) ? content : markdownToHtmlConverter.makeHtml(content);
}

export function formatClientContent(content: string): string {
  const parser = new DOMParser();

  // Markdown must be rendered to HTML *before* it is parsed and sanitised.
  // Parsing markdown as HTML serialises bare `<` and `>` into entities, which
  // the downstream markdown renderer then escapes a second time, surfacing
  // `&gt;` to the user as literal text.
  const processedContent = isHTMLString(content)
    ? content
    : getHtmlStringFromMarkdownString(convertMarkdownFormatToHtmlString(content));

  const doc = parser.parseFromString(processedContent, 'text/html');

  const anchorTags = doc.querySelectorAll('a[data-type="mention"], a[data-type="hashtag"]');

  anchorTags.forEach((tag) => {
    const label = tag.getAttribute('data-label');
    const type = tag.getAttribute('data-type');
    const prefix = type === 'mention' ? '@' : '#';

    if (label) {
      tag.textContent = `${prefix}${label}`;
    }
  });

  return getSanitizeContent(doc.body.innerHTML);
}

/**
 * Checks whether a block-editor HTML string represents empty content.
 * Treats null/undefined/empty strings, whitespace-only strings, and
 * single empty `<p>` tags as empty.
 */
export function isDescriptionContentEmpty(content: string | null | undefined): boolean {
  if (!content) {
    return true;
  }

  const trimmedContent = content.trim();

  if (trimmedContent === '') {
    return true;
  }

  const emptyPRegex =
    /^[ \t\r\n]*<p(?:\s[^>]*)?>[ \t\r\n\u00A0]*<\/p>[ \t\r\n]*$/i;
  return emptyPRegex.test(trimmedContent);
}

/** Strips all HTML tags from a string and returns plain text. */
export function getTextFromHtmlString(description?: string): string {
  if (!description) {
    return '';
  }

  return description.replace(/<[^>]{1,1000}>/g, '').trim();
}

/**
 * Official `DESCRIPTION_MAX_PREVIEW_CHARACTERS`
 * (`constants/constants.ts:75`): a description longer than this gets the
 * read-more fold in the previewer.
 */
export const DESCRIPTION_PREVIEW_MAX_LENGTH = 350;

/**
 * Port of official `getTrimmedContent` (`utils/StringUtils.ts:43-64`):
 * keep the first three lines, cut to `limit` characters, then drop the
 * trailing word so a cut never ends mid-word (or mid-URL). The caller
 * appends the ellipsis, as official `RichTextEditorPreviewerV1` does.
 */
export function getTrimmedContent(content: string, limit: number): string {
  const lines = content.split('\n');
  // Selecting the content in three lines
  const contentInThreeLines = lines.slice(0, 3).join('\n');

  const slicedContent = contentInThreeLines.slice(0, limit);

  // Logic for eliminating any broken words at the end
  // To avoid any URL being cut
  const words = slicedContent.split(' ');
  const wordsCount = words.length;

  if (wordsCount === 1) {
    return slicedContent;
  }

  // Eliminate word at the end to avoid using broken words
  const refinedContent = words.slice(0, wordsCount - 1);

  return refinedContent.join(' ');
}

export function stripPendingUploadNodes(html: string): string {
  if (!html.includes('data-uploading="true"')) {
    return html;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc
    .querySelectorAll<HTMLDivElement>('div[data-type="file-attachment"][data-uploading="true"]')
    .forEach((node) => {
      if (!node.dataset.url) {
        node.remove();
      }
    });

  return doc.body.innerHTML;
}

export function removeAttachmentsWithoutUrl(htmlString: string): string {
  if (!htmlString.includes('data-type="file-attachment"')) {
    return htmlString;
  }

  const parser = new DOMParser();
  const doc: Document = parser.parseFromString(htmlString, 'text/html');

  const attachments: NodeListOf<HTMLDivElement> =
    doc.querySelectorAll<HTMLDivElement>('div[data-type="file-attachment"]');

  attachments.forEach((div: HTMLDivElement) => {
    const url = div.dataset.url;
    if (!url) {
      div.remove();
    }
  });

  return doc.body.innerHTML;
}

// Unique marker prefix used to temporarily replace entity links during HTML serialization
// This avoids HTML encoding of < and > characters in entity links
const ENTITY_LINK_MARKER_PREFIX = '__ENTITY_LINK_MARKER_';

const escapeMarkdownLinkText = (text: string): string =>
  text.replace(/[[\]()\\]/g, '\\$&');

const sanitizeEntityLinkField = (value: string): string => value.replace(/[<>|]/g, '');

/**
 * Identity hooks mirroring `BlockEditorExtensionsClassBase`
 * `serializeContentForBackend` / `parseContentFromBackend` (:256-268),
 * which are identity in the base class. Kept as named functions so the
 * pipeline shape stays visible and a future extension class can hook
 * in at the same points without restructuring the call sites.
 */
export function serializeContentForBackend(html: string): string {
  return html;
}

export function parseContentFromBackend(html: string): string {
  return html;
}

export function formatServerContent(htmlString: string): string {
  // Create a new DOMParser
  const parser = new DOMParser();

  // Only convert markdown to HTML if the content is not already HTML
  const processedContent = isHTMLString(htmlString)
    ? htmlString
    : convertMarkdownFormatToHtmlString(htmlString);

  const doc = parser.parseFromString(processedContent, 'text/html');

  // Use querySelectorAll to find all anchor tags with text content starting with "@" or "#"
  const anchorTags = doc.querySelectorAll('a[data-type="mention"], a[data-type="hashtag"]');

  // Store entity links with markers to avoid HTML encoding during serialization
  const entityLinkMap = new Map<string, string>();

  anchorTags.forEach((tag, index) => {
    const rawHref = tag.getAttribute('href');
    const text = tag.textContent;
    const fqn = tag.getAttribute('data-fqn');
    const entityType = tag.getAttribute('data-entityType');

    // Validate href to only allow safe protocols before embedding into entity link string.
    // This prevents unsafe URLs from bypassing DOMPurify via the post-sanitization replacement.
    const href = rawHref && SAFE_HREF_REGEX.test(rawHref) ? rawHref : '';

    const safeEntityType = sanitizeEntityLinkField(entityType ?? '');
    const safeFqn = sanitizeEntityLinkField(fqn ?? '');
    const safeText = escapeMarkdownLinkText(text ?? '');
    const entityLink = `<#E${ENTITY_LINK_SEPARATOR}${safeEntityType}${ENTITY_LINK_SEPARATOR}${safeFqn}|[${safeText}](${href})>`;
    const marker = `${ENTITY_LINK_MARKER_PREFIX}${index}__`;

    entityLinkMap.set(marker, entityLink);
    tag.textContent = marker;
  });

  let modifiedHtmlString = doc.body.innerHTML;

  modifiedHtmlString = getSanitizeContent(serializeContentForBackend(modifiedHtmlString));

  // Replace markers with actual entity links
  entityLinkMap.forEach((entityLink, marker) => {
    modifiedHtmlString = modifiedHtmlString.replace(marker, entityLink);
  });

  return modifiedHtmlString;
}

export const formatValueBasedOnContent = (value: string): string =>
  value === '<p></p>' ? '' : value;

export function transformImgTagsToFileAttachment(htmlString: string): string {
  // Input validation - ensure we have a valid string
  if (!htmlString || typeof htmlString !== 'string') {
    return String(htmlString || '');
  }

  if (!htmlString.includes('<img')) {
    return htmlString;
  }

  const tempDiv = new DOMParser().parseFromString(htmlString, 'text/html').body;

  const imgTags = tempDiv.querySelectorAll('img[src]');

  imgTags.forEach((img) => {
    const src = img.getAttribute('src');
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title') || '';

    if (src) {
      const fileDiv = document.createElement('div');
      fileDiv.setAttribute('data-type', 'file-attachment');
      fileDiv.setAttribute('data-url', src);
      fileDiv.setAttribute('data-filename', title || alt || 'image');
      fileDiv.setAttribute('data-mimetype', 'image');
      fileDiv.setAttribute('data-uploading', 'false');
      fileDiv.setAttribute('data-upload-progress', '0');
      fileDiv.setAttribute('data-is-image', 'true');
      if (alt) {
        fileDiv.setAttribute('data-alt', alt);
      }

      img.parentNode?.replaceChild(fileDiv, img);
    }
  });

  return tempDiv.innerHTML;
}

/**
 * The string half of official `setEditorContent` (`BlockEditorUtils.ts:156-180`):
 * Markdown→HTML, sanitize, img→file-attachment, backend parse hook. The
 * editor half (`setContent` + `EditorState` rebuild) lives in
 * `SmRichTextEditor.vue`, which owns the Tiptap instance.
 */
export function prepareEditorContent(newContent: string): string {
  let htmlString = getSanitizeContent(getHtmlStringFromMarkdownString(newContent));

  // Transform img tags to file-attachment divs before Tiptap processes them
  htmlString = transformImgTagsToFileAttachment(htmlString);

  // Apply additional transformations from backend format
  htmlString = parseContentFromBackend(htmlString);

  return htmlString;
}
