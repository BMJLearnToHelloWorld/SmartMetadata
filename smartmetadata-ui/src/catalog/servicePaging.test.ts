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
  createEmptyPaging,
  LIST_PAGE_SIZE_OPTIONS,
  mergeQueryParams,
  PAGE_SIZE_BASE,
  parseShowDeletedTables,
  readUrlPaging,
  SHOW_DELETED_TABLES_PARAM,
} from './servicePaging';

describe('service paging constants (pin constants.ts)', () => {
  it('uses the 15/25/50 list scale', () => {
    expect(LIST_PAGE_SIZE_OPTIONS).toEqual([15, 25, 50]);
    expect(PAGE_SIZE_BASE).toBe(15);
  });

  it('builds a fresh empty paging object', () => {
    expect(createEmptyPaging()).toEqual({ after: '', before: '', total: 0 });
    expect(createEmptyPaging()).not.toBe(createEmptyPaging());
  });
});

describe('readUrlPaging (pin usePaging, without the saved preference)', () => {
  it('defaults to page 1 and the processed size with no params', () => {
    expect(readUrlPaging({}, LIST_PAGE_SIZE_OPTIONS, PAGE_SIZE_BASE)).toEqual({
      isOffScaleUrlSize: false,
      isUrlPagingStale: false,
      resolvedPageSize: 15,
      urlCurrentPage: 1,
      hasUrlPaging: false,
    });
  });

  it('adopts an on-scale size and page', () => {
    const resolved = readUrlPaging(
      { currentPage: '3', pageSize: '25', cursorType: 'after', cursorValue: 'abc' },
      LIST_PAGE_SIZE_OPTIONS,
      PAGE_SIZE_BASE,
    );
    expect(resolved.resolvedPageSize).toBe(25);
    expect(resolved.urlCurrentPage).toBe(3);
    expect(resolved.isUrlPagingStale).toBe(false);
    expect(resolved.hasUrlPaging).toBe(true);
  });

  it('marks an off-scale size stale, resetting the page and resolving the size', () => {
    const resolved = readUrlPaging(
      { currentPage: '4', pageSize: '48', cursorValue: 'abc' },
      LIST_PAGE_SIZE_OPTIONS,
      PAGE_SIZE_BASE,
    );
    expect(resolved.isOffScaleUrlSize).toBe(true);
    expect(resolved.isUrlPagingStale).toBe(true);
    expect(resolved.resolvedPageSize).toBe(15);
    expect(resolved.urlCurrentPage).toBe(1);
    expect(resolved.hasUrlPaging).toBe(true);
  });

  it('treats a missing, zero, or non-numeric size as the processed size', () => {
    for (const pageSize of [undefined, '0', 'abc', null]) {
      const resolved = readUrlPaging(
        { pageSize },
        LIST_PAGE_SIZE_OPTIONS,
        PAGE_SIZE_BASE,
      );
      expect(resolved.resolvedPageSize).toBe(15);
      expect(resolved.isOffScaleUrlSize).toBe(false);
    }
  });

  it('treats a missing or non-numeric page as page 1', () => {
    expect(readUrlPaging({ currentPage: 'abc' }, LIST_PAGE_SIZE_OPTIONS, 15).urlCurrentPage).toBe(1);
    expect(readUrlPaging({ currentPage: '0' }, LIST_PAGE_SIZE_OPTIONS, 15).urlCurrentPage).toBe(1);
  });

  it('reports hasUrlPaging from a cursor alone', () => {
    expect(
      readUrlPaging({ cursorValue: 'abc' }, LIST_PAGE_SIZE_OPTIONS, 15).hasUrlPaging,
    ).toBe(true);
    expect(readUrlPaging({ currentPage: '1' }, LIST_PAGE_SIZE_OPTIONS, 15).hasUrlPaging).toBe(false);
  });
});

describe('mergeQueryParams (pin useTableFilters merge semantics)', () => {
  it('merges the patch over the current query and keeps untouched keys', () => {
    expect(mergeQueryParams({ a: '1', b: '2' }, { b: '3', c: '4' })).toEqual({
      a: '1',
      b: '3',
      c: '4',
    });
  });

  it('deletes nil and empty-array values', () => {
    expect(
      mergeQueryParams(
        { currentPage: '3', cursorType: 'after', keep: 'yes', arr: ['x'] },
        { currentPage: null, cursorType: undefined, arr: [] },
      ),
    ).toEqual({ keep: 'yes' });
  });

  it('stringifies numbers and booleans', () => {
    expect(mergeQueryParams({}, { pageSize: 25, flag: true })).toEqual({
      pageSize: '25',
      flag: 'true',
    });
  });
});

describe('showDeletedTables key', () => {
  it('is the pin table-filters key and parses only the literal true', () => {
    expect(SHOW_DELETED_TABLES_PARAM).toBe('showDeletedTables');
    expect(parseShowDeletedTables({ showDeletedTables: 'true' })).toBe(true);
    expect(parseShowDeletedTables({ showDeletedTables: 'false' })).toBe(false);
    expect(parseShowDeletedTables({})).toBe(false);
  });
});
