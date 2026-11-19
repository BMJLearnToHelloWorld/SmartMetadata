/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { escapeBackwardSlashChar } from './formDataFormat';

describe('escapeBackwardSlashChar', () => {
  it('replaces literal backslash-n sequences with newlines, recursively', () => {
    const input = {
      includes: ['foo\\nbar'],
      nested: { excludes: ['a\\nb', 'plain'] },
      count: 3,
      flag: true,
      missing: null,
    };
    expect(escapeBackwardSlashChar(input)).toEqual({
      includes: ['foo\nbar'],
      nested: { excludes: ['a\nb', 'plain'] },
      count: 3,
      flag: true,
      missing: null,
    });
  });

  it('leaves other backslash sequences untouched', () => {
    expect(escapeBackwardSlashChar({ pattern: '^snowflake\\\\d+$' })).toEqual({
      pattern: '^snowflake\\\\d+$',
    });
  });

  it('passes non-object values through', () => {
    expect(escapeBackwardSlashChar('a\\nb')).toBe('a\\nb');
    expect(escapeBackwardSlashChar(undefined)).toBeUndefined();
  });
});
