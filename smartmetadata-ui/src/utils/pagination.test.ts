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
  CursorType,
  computeCursorTotalPages,
  computeTotalPages,
  displayTotalPages,
  isNextDisabled,
  isPreviousDisabled,
  nextPagingParams,
  previousPagingParams,
} from './pagination';

describe('computeTotalPages', () => {
  it('ceils the total over the page size', () => {
    expect(computeTotalPages(15, 0)).toBe(0);
    expect(computeTotalPages(15, 15)).toBe(1);
    expect(computeTotalPages(15, 16)).toBe(2);
    expect(computeTotalPages(25, 100)).toBe(4);
  });
});

describe('cursor total pages', () => {
  it('adds one page while an after cursor exists', () => {
    expect(computeCursorTotalPages(15, { total: 15, after: 'x' }, 1)).toBe(2);
    expect(computeCursorTotalPages(15, { total: 15 }, 1)).toBe(1);
  });

  it('never drops below the current page', () => {
    expect(computeCursorTotalPages(15, { total: 0 }, 3)).toBe(3);
  });

  it('number mode uses the plain ceil total', () => {
    expect(displayTotalPages(15, { total: 15, after: 'x' }, 1, true)).toBe(1);
    expect(displayTotalPages(15, { total: 15, after: 'x' }, 1, false)).toBe(2);
  });
});

describe('disable rules', () => {
  it('cursor mode disables from server cursors', () => {
    expect(isPreviousDisabled({ total: 0 }, 1, false)).toBe(true);
    expect(isPreviousDisabled({ total: 0, before: 'b' }, 2, false)).toBe(false);
    expect(isNextDisabled({ total: 0 }, 1, 15, false)).toBe(true);
    expect(isNextDisabled({ total: 0, after: 'a' }, 1, 15, false)).toBe(false);
  });

  it('number mode disables from page number and total pages', () => {
    expect(isPreviousDisabled({ total: 30 }, 1, true)).toBe(true);
    expect(isPreviousDisabled({ total: 30 }, 2, true)).toBe(false);
    expect(isNextDisabled({ total: 30 }, 2, 15, true)).toBe(true);
    expect(isNextDisabled({ total: 31 }, 2, 15, true)).toBe(false);
  });
});

describe('paging handler payloads', () => {
  it('cursor mode carries the cursor type', () => {
    expect(nextPagingParams(1, false)).toEqual({ cursorType: CursorType.AFTER, currentPage: 2 });
    expect(previousPagingParams(2, false)).toEqual({
      cursorType: CursorType.BEFORE,
      currentPage: 1,
    });
  });

  it('number mode carries only the page number', () => {
    expect(nextPagingParams(1, true)).toEqual({ currentPage: 2 });
    expect(previousPagingParams(2, true)).toEqual({ currentPage: 1 });
  });
});
