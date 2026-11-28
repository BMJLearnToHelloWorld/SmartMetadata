/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Pin openmetadata-ui AddTestCaseList helpers (DataQualityPureUtils, ScrollUtils,
 * AddTestCaseListForm.utils, constants PAGE_SIZE_MEDIUM).
 */
import type { EntityRef } from '@/types/api';
import type { TestCase } from '@/types/quality';

/** Official PAGE_SIZE_MEDIUM (constants.ts). */
export const ADD_TEST_CASE_LIST_PAGE_SIZE = 25;

/** Official SCROLL_BOTTOM_THRESHOLD (ScrollUtils.ts). */
export const SCROLL_BOTTOM_THRESHOLD = 8;

export const COLUMN_AGGREGATE_FIELD = 'columns.name.keyword';

export function isNearScrollBottom(element: HTMLElement): boolean {
  const { scrollHeight, scrollTop, clientHeight } = element;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD;
}

export function getSelectionFlags(input: {
  loadedItemIds: string[];
  isLoadedRowSelected: (id: string) => boolean;
  selectAll: boolean;
  totalCount: number;
  itemsLength: number;
}): { allLoadedSelected: boolean; showSelectAllTotalLink: boolean } {
  const { loadedItemIds, isLoadedRowSelected, selectAll, totalCount, itemsLength } = input;
  const allLoadedSelected =
    loadedItemIds.length > 0 && loadedItemIds.every((id) => isLoadedRowSelected(id));
  return {
    allLoadedSelected,
    showSelectAllTotalLink:
      !selectAll && totalCount > itemsLength && allLoadedSelected && itemsLength > 0,
  };
}

export function getColumnNameFromColumnFilterKey(columnFilterKey: string): string | undefined {
  if (!columnFilterKey?.trim()) {
    return undefined;
  }
  return columnFilterKey.includes('::')
    ? columnFilterKey.slice(columnFilterKey.lastIndexOf('::') + 2)
    : columnFilterKey;
}

export function parseColumnAggregateBuckets(
  buckets: { key?: string }[],
  tableFqn?: string,
): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  return (buckets ?? []).reduce<Array<{ key: string; label: string }>>((acc, bucket) => {
    const colKey = bucket.key ?? '';
    const key = tableFqn ? `${tableFqn}::${colKey}` : colKey;
    if (!key || seen.has(key)) {
      return acc;
    }
    seen.add(key);
    acc.push({ key, label: colKey });
    return acc;
  }, []);
}

export function seedSelectedFromExistingTest(existingTest?: EntityRef[]): Map<string, TestCase> {
  const seed = new Map<string, TestCase>();
  (existingTest ?? []).forEach((ref) => {
    if (ref.id) {
      seed.set(ref.id, { id: ref.id, name: ref.name ?? '' } as TestCase);
    }
  });
  return seed;
}