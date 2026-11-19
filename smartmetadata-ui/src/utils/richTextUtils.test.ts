/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  convertMarkdownFormatToHtmlString,
  formatClientContent,
  formatServerContent,
  formatValueBasedOnContent,
  getHtmlStringFromMarkdownString,
  getTextFromHtmlString,
  isDescriptionContentEmpty,
  isHTMLString,
  prepareEditorContent,
  removeAttachmentsWithoutUrl,
  stripPendingUploadNodes,
  transformImgTagsToFileAttachment,
} from './richTextUtils';

describe('isHTMLString', () => {
  it('returns false for plain text and markdown', () => {
    expect(isHTMLString('hello world')).toBe(false);
    expect(isHTMLString('# Heading\n\nSome **bold** text')).toBe(false);
    expect(isHTMLString('a < b and c > d')).toBe(false);
  });

  it('returns true for serialized editor HTML', () => {
    expect(isHTMLString('<p>Hello</p>')).toBe(true);
    expect(isHTMLString('<p>Hello</p><p>Second</p>')).toBe(true);
    expect(isHTMLString('<ul><li>one</li></ul>')).toBe(true);
  });

  it('treats a code sample holding <table> as markdown, not HTML', () => {
    expect(isHTMLString('Example:\n\n```\n<table><tr><td>x</td></tr></table>\n```')).toBe(false);
    expect(isHTMLString('See `<table>` for details')).toBe(false);
  });

  it('treats prose with markdown syntax around markup as markdown', () => {
    expect(isHTMLString('Some **bold** prose <p>with markup</p>')).toBe(false);
  });
});

describe('getHtmlStringFromMarkdownString', () => {
  it('returns HTML untouched', () => {
    const html = '<p>already</p>';
    expect(getHtmlStringFromMarkdownString(html)).toBe(html);
  });

  it('converts markdown with the official Showdown options', () => {
    expect(getHtmlStringFromMarkdownString('# Title')).toContain('<h1');
    expect(getHtmlStringFromMarkdownString('line1\nline2')).toContain('<br');
    expect(getHtmlStringFromMarkdownString('~~struck~~')).toContain('<del>');
  });
});

describe('convertMarkdownFormatToHtmlString', () => {
  it('converts user mentions via the ENTITY_URL_MAP', () => {
    const out = convertMarkdownFormatToHtmlString(
      'hi [@john](https://host.com/users/john)',
    );
    expect(out).toContain('data-type="mention"');
    expect(out).toContain('data-entityType="user"');
    expect(out).toContain('data-fqn="john"');
    expect(out).toContain('>@john</a>');
  });

  it('converts team mentions through the teams link shape', () => {
    const out = convertMarkdownFormatToHtmlString(
      'hi [@eng](https://host.com/settings/members/teams/eng)',
    );
    expect(out).toContain('data-type="mention"');
    expect(out).toContain('data-entityType="team"');
    expect(out).toContain('data-fqn="eng"');
  });

  it('converts hashtags with the raw type preserved', () => {
    const out = convertMarkdownFormatToHtmlString(
      'see [#PII](https://host.com/tags/PII)',
    );
    expect(out).toContain('data-type="hashtag"');
    expect(out).toContain('data-entityType="tags"');
    expect(out).toContain('>#PII</a>');
  });

  it('leaves unknown mention targets untouched', () => {
    const input = 'hi [@x](https://host.com/unknown/x)';
    expect(convertMarkdownFormatToHtmlString(input)).toBe(input);
  });

  it('replaces longest matches first', () => {
    const out = convertMarkdownFormatToHtmlString(
      '[@john](https://host.com/users/john) [@johnny](https://host.com/users/johnny)',
    );
    expect(out).toContain('data-fqn="john"');
    expect(out).toContain('data-fqn="johnny"');
  });
});

describe('formatClientContent', () => {
  it('rewrites mention/hashtag anchor text to @label/#label', () => {
    const out = formatClientContent(
      '<p><a href="/users/john" data-type="mention" data-label="John Doe" data-fqn="john">old</a></p>',
    );
    expect(out).toContain('>@John Doe</a>');
  });

  it('renders markdown before sanitizing', () => {
    const out = formatClientContent('hello **world**');
    expect(out).toContain('<strong>world</strong>');
    expect(out).not.toContain('&gt;');
  });
});

describe('formatServerContent', () => {
  it('serializes mention anchors to the <#E::…> protocol', () => {
    // Official semantics (BlockEditorUtils.ts:69-100): the marker replaces
    // the anchor's *text*, the anchor element survives serialization, and
    // the raw <#E::…> string is spliced in post-sanitize — still wrapped
    // by the anchor, with literal < >. The backend parses the protocol
    // string out of the stored content downstream.
    const out = formatServerContent(
      '<p><a href="/users/john" data-type="mention" data-entityType="user" data-fqn="john">@john</a></p>',
    );
    expect(out).toBe(
      '<p><a href="/users/john" data-type="mention" data-entitytype="user" data-fqn="john"><#E::user::john|[@john](/users/john)></a></p>',
    );
  });

  it('empties unsafe hrefs before embedding', () => {
    const out = formatServerContent(
      '<p><a href="javascript:alert(1)" data-type="mention" data-entityType="user" data-fqn="john">@john</a></p>',
    );
    expect(out).toContain('[@john]()');
    expect(out).not.toContain('javascript:');
  });

  it('strips <>| from entity fields and escapes markdown link text', () => {
    const out = formatServerContent(
      '<p><a href="/users/j" data-type="mention" data-entityType="us|er" data-fqn="j<o>">[x](y)</a></p>',
    );
    // Sanitized values appear inside the entity link; the surviving anchor
    // keeps its raw parsed attributes.
    expect(out).toContain('<#E::user::jo|');
    expect(out).toContain('[\\[x\\]\\(y\\)](/users/j)');
    expect(out).not.toContain('us|er::');
  });

  it('leaves plain HTML without entity anchors sanitized but intact', () => {
    expect(formatServerContent('<p onclick="e()">x</p>')).toBe('<p>x</p>');
  });
});

describe('formatValueBasedOnContent', () => {
  it('maps a single empty paragraph to empty', () => {
    expect(formatValueBasedOnContent('<p></p>')).toBe('');
    expect(formatValueBasedOnContent('<p>x</p>')).toBe('<p>x</p>');
  });
});

describe('isDescriptionContentEmpty', () => {
  it('treats empty, whitespace and single empty <p> as empty', () => {
    expect(isDescriptionContentEmpty('')).toBe(true);
    expect(isDescriptionContentEmpty(null)).toBe(true);
    expect(isDescriptionContentEmpty(undefined)).toBe(true);
    expect(isDescriptionContentEmpty('   ')).toBe(true);
    expect(isDescriptionContentEmpty('<p></p>')).toBe(true);
    // The official regex matches a literal U+00A0 character only; the
    // entity *text* "&nbsp;" is not empty per official semantics.
    expect(isDescriptionContentEmpty('<p>\u00A0</p>')).toBe(true);
    expect(isDescriptionContentEmpty('<p>&nbsp;</p>')).toBe(false);
    expect(isDescriptionContentEmpty('<p> </p>')).toBe(true);
  });

  it('treats content-bearing HTML as non-empty', () => {
    expect(isDescriptionContentEmpty('<p>x</p>')).toBe(false);
    expect(isDescriptionContentEmpty('<p></p><p></p>')).toBe(false);
  });
});

describe('getTextFromHtmlString', () => {
  it('strips tags and trims', () => {
    expect(getTextFromHtmlString('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(getTextFromHtmlString(undefined)).toBe('');
  });
});

describe('attachment stripping', () => {
  const uploading =
    '<div data-type="file-attachment" data-uploading="true"></div><p>keep</p>';
  const uploaded =
    '<div data-type="file-attachment" data-uploading="true" data-url="/f.png"></div><p>keep</p>';
  const idleNoUrl = '<div data-type="file-attachment" data-uploading="false"></div><p>keep</p>';

  it('stripPendingUploadNodes removes only uploading nodes without a URL', () => {
    expect(stripPendingUploadNodes(uploading)).toBe('<p>keep</p>');
    expect(stripPendingUploadNodes(uploaded)).toContain('file-attachment');
    expect(stripPendingUploadNodes(idleNoUrl)).toContain('file-attachment');
    expect(stripPendingUploadNodes('<p>no attachments</p>')).toBe('<p>no attachments</p>');
  });

  it('removeAttachmentsWithoutUrl removes every attachment without a URL', () => {
    expect(removeAttachmentsWithoutUrl(uploading)).toBe('<p>keep</p>');
    expect(removeAttachmentsWithoutUrl(idleNoUrl)).toBe('<p>keep</p>');
    expect(removeAttachmentsWithoutUrl(uploaded)).toContain('file-attachment');
  });
});

describe('transformImgTagsToFileAttachment', () => {
  it('converts img tags to file-attachment divs with the official attributes', () => {
    const out = transformImgTagsToFileAttachment(
      '<p><img src="/a.png" alt="pic" title="T"></p>',
    );
    expect(out).toContain('data-type="file-attachment"');
    expect(out).toContain('data-url="/a.png"');
    expect(out).toContain('data-filename="T"');
    expect(out).toContain('data-mimetype="image"');
    expect(out).toContain('data-is-image="true"');
    expect(out).toContain('data-alt="pic"');
    expect(out).not.toContain('<img');
  });

  it('falls back filename title → alt → image', () => {
    expect(transformImgTagsToFileAttachment('<img src="/a.png" alt="pic">')).toContain(
      'data-filename="pic"',
    );
    expect(transformImgTagsToFileAttachment('<img src="/a.png">')).toContain(
      'data-filename="image"',
    );
  });

  it('returns input untouched without img tags', () => {
    expect(transformImgTagsToFileAttachment('<p>x</p>')).toBe('<p>x</p>');
    expect(transformImgTagsToFileAttachment('')).toBe('');
  });
});

describe('prepareEditorContent', () => {
  it('runs the setContent string pipeline', () => {
    const out = prepareEditorContent('hello **world** <img src="/a.png">');
    expect(out).toContain('<strong>world</strong>');
    expect(out).toContain('data-type="file-attachment"');
  });
});
