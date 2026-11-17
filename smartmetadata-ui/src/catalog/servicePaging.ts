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
 * Cursor-paging constants and pure URL helpers, ported from pin
 * constants/constants.ts, hooks/paging/usePaging.ts, and
 * hooks/useTableFilters.ts at a3012259ca. The saved-page-size
 * preference (useSavedPageSize) is deliberately not ported: the
 * product has no such infrastructure, and the design fixes the
 * default at PAGE_SIZE_BASE. Without a preference, the
 * paged-at-another-size staleness branch can never fire, so
 * readUrlPaging only reconciles the off-scale URL size.
 */
export const INITIAL_PAGING_VALUE = 1;
export const PAGE_SIZE_BASE = 15;
export const PAGE_SIZE_MEDIUM = 25;
export const PAGE_SIZE_LARGE = 50;
export const LIST_PAGE_SIZE_OPTIONS: number[] = [PAGE_SIZE_BASE, PAGE_SIZE_MEDIUM, PAGE_SIZE_LARGE];

/** Pin `pagingObject`: the empty cursor page. Always build a fresh copy. */
export interface CursorPagingState {
  after: string;
  before: string;
  total: number;
}

export function createEmptyPaging(): CursorPagingState {
  return { after: '', before: '', total: 0 };
}

/** Pin CursorType enum values (enums/pagination.enum.ts). */
export type CursorType = 'after' | 'before';

/**
 * The table-filters query key for the show-deleted toggle (pin
 * DatabaseSchemaTable / ConnectionServiceDetailsPage). It is a
 * filter key, not a paging key: the composable never writes it, and
 * showDeleted itself stays page-level state.
 */
export const SHOW_DELETED_TABLES_PARAM = 'showDeletedTables';

/** Pin useTableFilters boolean parsing: only the literal 'true' counts. */
export function parseShowDeletedTables(query: Record<string, unknown>): boolean {
  return query[SHOW_DELETED_TABLES_PARAM] === 'true';
}

export interface PagingUrlParams {
  cursorType?: CursorType;
  cursorValue?: string;
  currentPage?: string;
  pageSize?: number;
}

export interface ResolvedUrlPaging {
  isOffScaleUrlSize: boolean;
  isUrlPagingStale: boolean;
  resolvedPageSize: number;
  urlCurrentPage: number;
  hasUrlPaging: boolean;
}

/**
 * Pin readUrlPaging (usePaging.ts), minus the preference-driven
 * paged-at-size branch: a URL size off the picker's scale resolves
 * to the processed size and marks the whole URL paging stale, which
 * resets the page to 1 and drops the cursor.
 */
export function readUrlPaging(
  urlParams: Record<string, unknown>,
  pageSizeOptions: number[],
  processedPageSize: number,
): ResolvedUrlPaging {
  const urlPageSize = Number(urlParams.pageSize) || processedPageSize;
  const isOffScaleUrlSize = !pageSizeOptions.includes(urlPageSize);
  const isUrlPagingStale = isOffScaleUrlSize;
  return {
    isOffScaleUrlSize,
    isUrlPagingStale,
    resolvedPageSize: isOffScaleUrlSize ? processedPageSize : urlPageSize,
    urlCurrentPage: isUrlPagingStale
      ? INITIAL_PAGING_VALUE
      : Number(urlParams.currentPage) || INITIAL_PAGING_VALUE,
    hasUrlPaging: Boolean(
      Number(urlParams.currentPage) > INITIAL_PAGING_VALUE || urlParams.cursorValue,
    ),
  };
}

export type QueryPatchValue = string | number | boolean | string[] | null | undefined;

/**
 * Pin updateUrlWithFilters merge semantics (useTableFilters.ts):
 * merge the patch over the current query, then delete keys whose
 * value is nil or an empty array. Values are stringified, as URL
 * params carry strings only. Keys outside the patch survive
 * untouched; the router call keeps the current path and hash.
 */
export function mergeQueryParams(
  current: Record<string, unknown>,
  patch: Record<string, QueryPatchValue>,
): Record<string, string | string[]> {
  const merged: Record<string, unknown> = { ...current, ...patch };
  for (const key of Object.keys(merged)) {
    const value = merged[key];
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete merged[key];
    }
  }
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(merged)) {
    out[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return out;
}
