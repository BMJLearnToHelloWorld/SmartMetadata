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
  canGoNext,
  canGoNextOffset,
  canGoPrev,
  canGoPrevOffset,
  createCursorPager,
  createOffsetPager,
  entityLabel,
  goNext,
  goNextOffset,
  goPrev,
  goPrevOffset,
  joinRefNames,
} from './paging';

describe('cursor pager', () => {
  it('starts on the first page with no Previous', () => {
    const pager = createCursorPager();
    expect(pager.after).toBeUndefined();
    expect(canGoPrev(pager)).toBe(false);
    expect(canGoNext(undefined)).toBe(false);
    expect(canGoNext('c1')).toBe(true);
  });

  it('advances after from the list response and walks back', () => {
    const first = createCursorPager();
    const second = goNext(first, 'c1');
    expect(second.after).toBe('c1');
    expect(canGoPrev(second)).toBe(true);

    const third = goNext(second, 'c2');
    expect(third.after).toBe('c2');

    const backToSecond = goPrev(third);
    expect(backToSecond.after).toBe('c1');

    const backToFirst = goPrev(backToSecond);
    expect(backToFirst.after).toBeUndefined();
    expect(canGoPrev(backToFirst)).toBe(false);
  });

  it('ignores next when the response has no after', () => {
    const pager = createCursorPager();
    expect(goNext(pager, '')).toEqual(pager);
  });
});

describe('offset pager', () => {
  it('steps by page size and clamps Previous at 0', () => {
    const first = createOffsetPager(25);
    expect(first.from).toBe(0);
    expect(canGoPrevOffset(first)).toBe(false);

    const second = goNextOffset(first);
    expect(second.from).toBe(25);
    expect(canGoPrevOffset(second)).toBe(true);
    expect(goPrevOffset(second).from).toBe(0);
    expect(goPrevOffset(first).from).toBe(0);
  });

  it('uses total when present, otherwise a full page means more results', () => {
    const pager = createOffsetPager(25);
    expect(canGoNextOffset(pager, 25, 40)).toBe(true);
    expect(canGoNextOffset({ from: 25, size: 25 }, 15, 40)).toBe(false);
    expect(canGoNextOffset(pager, 25)).toBe(true);
    expect(canGoNextOffset(pager, 3)).toBe(false);
  });
});

describe('entity chrome helpers', () => {
  it('prefers displayName over name', () => {
    expect(entityLabel({ displayName: 'Alice', name: 'alice' })).toBe('Alice');
    expect(entityLabel({ name: 'alice' })).toBe('alice');
    expect(entityLabel(null)).toBe('');
  });

  it('joins entity refs for table cells', () => {
    expect(joinRefNames([{ displayName: 'Eng' }, { name: 'ops' }])).toBe('Eng, ops');
    expect(joinRefNames([])).toBe('');
  });
});
