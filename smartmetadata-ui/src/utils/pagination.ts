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
 * Cursor-paging primitives (PAT-PAGING, 00-systemic D7).
 *
 * Ported from official `utils/PaginationUtils.ts` (`computeTotalPages`),
 * `components/common/NextPrevious/NextPrevious.tsx` (cursor total-pages
 * formula and disable rules), `enums/pagination.enum.ts` (`CursorType`)
 * and `constants/constants.ts` (page-size constants, `pagingObject`) at
 * pin a3012259ca.
 *
 * This module holds only the pure functions and constants. The cursor
 * state machine (`useCursorPagedList` equivalent: per-page paging cache,
 * walk-to-page, latest-request guard) belongs to the paging composable
 * the partition lines build on top of these primitives; the NextPrevious
 * component equivalent is likewise a partition-line piece. Keeping the
 * pure layer separate lets the D7.5 matrix tests pin the formulas
 * without mounting anything.
 */

export enum CursorType {
  BEFORE = 'before',
  AFTER = 'after',
}

export const PAGE_SIZE = 10;
export const PAGE_SIZE_BASE = 15;
export const PAGE_SIZE_MEDIUM = 25;
export const PAGE_SIZE_LARGE = 50;
export const PAGE_SIZE_EXTRA_LARGE = 100;

/** Default size-change options (`NextPrevious.tsx:56`). */
export const DEFAULT_PAGE_SIZE_OPTIONS: readonly number[] = [
  PAGE_SIZE_BASE,
  PAGE_SIZE_MEDIUM,
  PAGE_SIZE_LARGE,
];

export interface Paging {
  after?: string;
  before?: string;
  total: number;
}

/** Official `pagingObject` (`constants.ts:127`): the initial paging value. */
export const INITIAL_PAGING: Paging = { after: '', before: '', total: 0 };

/** Official `computeTotalPages` (`PaginationUtils.ts:14-16`). */
export function computeTotalPages(pageSize: number, total: number): number {
  return Math.ceil(total / pageSize);
}

/**
 * Cursor-mode display total (`NextPrevious.tsx:60-64`): the ceil total,
 * floored by the current page and by one more page while an `after`
 * cursor exists (there is at least one page beyond the current one).
 */
export function computeCursorTotalPages(
  pageSize: number,
  paging: Paging,
  currentPage: number,
): number {
  return Math.max(
    computeTotalPages(pageSize, paging.total),
    currentPage + (paging.after ? 1 : 0),
    currentPage,
  );
}

export function displayTotalPages(
  pageSize: number,
  paging: Paging,
  currentPage: number,
  isNumberBased: boolean,
): number {
  return isNumberBased
    ? computeTotalPages(pageSize, paging.total)
    : computeCursorTotalPages(pageSize, paging, currentPage);
}

/**
 * Disable rules (`NextPrevious.tsx:89-103`). Cursor mode disables from
 * the server-returned cursors — never from a local history stack
 * (PAG-1). Number mode disables from the page number and total pages.
 */
export function isPreviousDisabled(
  paging: Paging,
  currentPage: number,
  isNumberBased: boolean,
): boolean {
  return isNumberBased ? currentPage === 1 : !paging.before;
}

export function isNextDisabled(
  paging: Paging,
  currentPage: number,
  pageSize: number,
  isNumberBased: boolean,
): boolean {
  return isNumberBased
    ? currentPage >= computeTotalPages(pageSize, paging.total)
    : !paging.after;
}

export interface PagingHandlerParams {
  currentPage: number;
  cursorType?: CursorType;
}

/** Next/previous handler payloads (`NextPrevious.tsx:67-87`). */
export function nextPagingParams(currentPage: number, isNumberBased: boolean): PagingHandlerParams {
  return isNumberBased
    ? { currentPage: currentPage + 1 }
    : { cursorType: CursorType.AFTER, currentPage: currentPage + 1 };
}

export function previousPagingParams(
  currentPage: number,
  isNumberBased: boolean,
): PagingHandlerParams {
  return isNumberBased
    ? { currentPage: currentPage - 1 }
    : { cursorType: CursorType.BEFORE, currentPage: currentPage - 1 };
}
