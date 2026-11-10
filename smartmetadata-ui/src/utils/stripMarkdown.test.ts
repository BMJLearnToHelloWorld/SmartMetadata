/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './stripMarkdown';

describe('stripMarkdown', () => {
  it('flattens markdown structure to plain text', () => {
    expect(stripMarkdown('# Title\n\n**bold** and *italic* with [a link](https://example.com)')).toBe(
      'Title bold and italic with a link',
    );
    expect(stripMarkdown('![alt text](https://example.com/img.png) and `code`')).toBe(
      'alt text and code',
    );
    expect(stripMarkdown('- one\n- two\n\n> quoted')).toBe('one two quoted');
  });

  it('spaces HTML block boundaries instead of joining them', () => {
    expect(stripMarkdown('<p>first</p><p>second</p>')).toBe('first second');
    expect(stripMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('a b');
    expect(stripMarkdown('a<br>b')).toBe('a b');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(stripMarkdown('fish &amp; chips &#8212; done')).toBe('fish & chips — done');
    expect(stripMarkdown('  spaced   out  ')).toBe('spaced out');
  });

  it('leaves plain text alone', () => {
    expect(stripMarkdown('Maintenance on Sunday')).toBe('Maintenance on Sunday');
    expect(stripMarkdown('')).toBe('');
  });
});
