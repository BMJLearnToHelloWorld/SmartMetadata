/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** Matches Apache list defaults (`limit` 25) and official NextPrevious page size. */
export const DEFAULT_PAGE_SIZE = 25;

export interface CursorPager {
  /** Cursor sent as `after` on the next list request. Undefined = first page. */
  after?: string;
  /** Previous `after` values so Previous can walk back without inventing page numbers. */
  history: string[];
}

export function createCursorPager(): CursorPager {
  return { after: undefined, history: [] };
}

export function goNext(pager: CursorPager, responseAfter: string): CursorPager {
  if (!responseAfter) {
    return pager;
  }
  return {
    after: responseAfter,
    history: [...pager.history, pager.after ?? ''],
  };
}

export function goPrev(pager: CursorPager): CursorPager {
  if (pager.history.length === 0) {
    return pager;
  }
  const history = pager.history.slice();
  const after = history.pop();
  return {
    after: after || undefined,
    history,
  };
}

export function resetCursor(): CursorPager {
  return createCursorPager();
}

export function canGoPrev(pager: CursorPager): boolean {
  return pager.history.length > 0;
}

export function canGoNext(responseAfter?: string): boolean {
  return Boolean(responseAfter);
}

export interface OffsetPager {
  from: number;
  size: number;
}

export function createOffsetPager(size = DEFAULT_PAGE_SIZE): OffsetPager {
  return { from: 0, size };
}

export function goNextOffset(pager: OffsetPager): OffsetPager {
  return { ...pager, from: pager.from + pager.size };
}

export function goPrevOffset(pager: OffsetPager): OffsetPager {
  return { ...pager, from: Math.max(0, pager.from - pager.size) };
}

export function resetOffset(size = DEFAULT_PAGE_SIZE): OffsetPager {
  return createOffsetPager(size);
}

export function canGoPrevOffset(pager: OffsetPager): boolean {
  return pager.from > 0;
}

export function canGoNextOffset(pager: OffsetPager, loaded: number, total?: number): boolean {
  if (total !== undefined) {
    return pager.from + loaded < total;
  }
  return loaded >= pager.size;
}

export function entityLabel(entity?: { displayName?: string; name?: string } | null): string {
  if (!entity) {
    return '';
  }
  return entity.displayName || entity.name || '';
}

export function joinRefNames(refs: { displayName?: string; name?: string }[] | undefined): string {
  if (!refs || refs.length === 0) {
    return '';
  }
  return refs
    .map((ref) => ref.displayName || ref.name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
}
