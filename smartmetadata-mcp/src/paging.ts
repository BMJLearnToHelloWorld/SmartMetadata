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
 * Opaque page cursors for the vector tools.
 *
 * A cursor is the base64url encoding (no padding) of a tiny JSON tag,
 * `{"t":"o","v":<offset>}`, the same wire shape the server-side paging
 * contract uses — so a cursor minted by either side decodes on the other.
 * Callers only ever echo the token back; the offset stays hidden behind it.
 * Unlike the server side, which silently falls back to the first page on a
 * malformed token, this side rejects it: a cursor the caller cannot act on
 * is a bad argument, not a first page.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

const OFFSET_TAG = 'o';

export function encodeOffsetCursor(from: number): string {
  const json = JSON.stringify({ t: OFFSET_TAG, v: Math.max(0, Math.trunc(from)) });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid page cursor: pass back the nextCursor from the previous response verbatim');
    this.name = 'InvalidCursorError';
  }
}

function decodeOffsetCursor(token: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Record<string, unknown>).t !== OFFSET_TAG ||
    typeof (parsed as Record<string, unknown>).v !== 'number' ||
    !Number.isFinite((parsed as Record<string, unknown>).v as number)
  ) {
    throw new InvalidCursorError();
  }
  return Math.max(0, Math.trunc((parsed as Record<string, unknown>).v as number));
}

/**
 * Resolve the page offset: a cursor wins over `from` when present, matching
 * the server-side contract; a missing cursor falls back to `from`.
 */
export function resolveOffset(cursor: string | undefined, from: number): number {
  if (cursor === undefined || cursor.trim() === '') {
    return Math.max(0, Math.trunc(from));
  }
  return decodeOffsetCursor(cursor.trim());
}

export interface PageWindow {
  from: number;
  /**
   * Rows this page drew from the index: collapsed parents for
   * semantic_search, pills for company_context. The service pages by
   * parent, so this counts parents, not raw chunks.
   */
  rawCount: number;
  /** Rows behind this page (consumed), which the cursor advances by. */
  consumed: number;
  requestedSize: number;
}

export interface VectorPageInfo {
  /** Raw hits the index returned for this page, before grouping. */
  totalHits?: number | null;
  /** Whether the index has more parent groups after this page. */
  hasMore?: boolean | null;
}

/**
 * Attach `hasMore` / `nextCursor` / `message` to a page result, following
 * the server-side paging contract: a next page exists when the budget trim
 * cut rows, or when a full page came back and the index has more; the cursor
 * advances by `consumed`, which can exceed the returned count when rows were
 * dropped before returning.
 */
export function attachPaging(
  result: Record<string, unknown>,
  window: PageWindow,
  page: VectorPageInfo,
  pageMessage: string,
): void {
  const consumed = window.consumed;
  const budgetTrimmed = consumed < window.rawCount;
  const fullPage = window.rawCount >= window.requestedSize;
  const moreInIndex = hasMoreInIndex(page, window.from, window.rawCount);
  const canAdvance = consumed > 0;
  if (canAdvance && (budgetTrimmed || (fullPage && moreInIndex))) {
    result.hasMore = true;
    result.nextCursor = encodeOffsetCursor(window.from + consumed);
  } else if (!canAdvance) {
    delete result.hasMore;
    delete result.message;
  }
  if (fullPage && !budgetTrimmed && moreInIndex && pageMessage) {
    const returned =
      typeof result.returnedCount === 'number' ? result.returnedCount : consumed;
    result.message = pageMessage.replace('%d', String(returned));
  }
}

// `hasMore` is preferred over `totalHits`: the vector service groups chunks
// by parent entity, so totalHits counts raw chunks and overstates pageable
// results.
function hasMoreInIndex(page: VectorPageInfo, from: number, rawCount: number): boolean {
  if (page.hasMore !== undefined && page.hasMore !== null) {
    return page.hasMore;
  }
  if (page.totalHits !== undefined && page.totalHits !== null) {
    return from + rawCount < page.totalHits;
  }
  return false;
}
