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
import { attachPaging, encodeOffsetCursor, resolveOffset } from '../src/paging.js';

describe('offset cursor codec', () => {
  it('round-trips an offset through a cursor', () => {
    const cursor = encodeOffsetCursor(40);
    expect(resolveOffset(cursor, 0)).toBe(40);
    expect(resolveOffset(undefined, 7)).toBe(7);
    expect(resolveOffset('', 3)).toBe(3);
  });

  it('encodes 0 as a cursor that resolves to the first page', () => {
    expect(resolveOffset(encodeOffsetCursor(0), 99)).toBe(0);
  });

  it('rejects a malformed cursor instead of silently returning the first page', () => {
    expect(() => resolveOffset('not-a-cursor!!!', 0)).toThrow(/Invalid page cursor/);
    expect(() => resolveOffset(Buffer.from('{"t":"x","v":5}').toString('base64url'), 0)).toThrow(
      /Invalid page cursor/,
    );
    expect(() => resolveOffset(Buffer.from('{"t":"o"}').toString('base64url'), 0)).toThrow(
      /Invalid page cursor/,
    );
  });

  it('a cursor wins over from when both are given', () => {
    expect(resolveOffset(encodeOffsetCursor(20), 0)).toBe(20);
  });
});

describe('attachPaging', () => {
  it('mints a next cursor when a full page came back and the index has more', () => {
    const result: Record<string, unknown> = { returnedCount: 10 };
    attachPaging(
      result,
      { from: 0, rawCount: 10, consumed: 10, requestedSize: 10 },
      { totalHits: 25, hasMore: null },
      'Showing %d results. Pass nextCursor.',
    );
    expect(result.hasMore).toBe(true);
    expect(typeof result.nextCursor).toBe('string');
    expect(resolveOffset(String(result.nextCursor), 0)).toBe(10);
    expect(result.message).toBe('Showing 10 results. Pass nextCursor.');
  });

  it('mints a next cursor when the budget trim cut rows', () => {
    const result: Record<string, unknown> = { returnedCount: 6 };
    attachPaging(
      result,
      { from: 10, rawCount: 10, consumed: 6, requestedSize: 10 },
      { totalHits: 25, hasMore: null },
      'Showing %d results.',
    );
    expect(result.hasMore).toBe(true);
    expect(resolveOffset(String(result.nextCursor), 0)).toBe(16);
  });

  it('adds nothing when the page is partial and the index is exhausted', () => {
    const result: Record<string, unknown> = { returnedCount: 3 };
    attachPaging(
      result,
      { from: 20, rawCount: 3, consumed: 3, requestedSize: 10 },
      { totalHits: 23, hasMore: false },
      'Showing %d results.',
    );
    expect(result.hasMore).toBeUndefined();
    expect(result.nextCursor).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it('prefers hasMore over totalHits', () => {
    const result: Record<string, unknown> = { returnedCount: 10 };
    attachPaging(
      result,
      { from: 0, rawCount: 10, consumed: 10, requestedSize: 10 },
      { totalHits: 10, hasMore: true },
      'Showing %d results.',
    );
    expect(result.hasMore).toBe(true);
  });
});
