/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createEmptyPaging,
  INITIAL_PAGING_VALUE,
  LIST_PAGE_SIZE_OPTIONS,
  mergeQueryParams,
  PAGE_SIZE_BASE,
  readUrlPaging,
  type CursorPagingState,
  type CursorType,
  type PagingUrlParams,
  type QueryPatchValue,
} from '@/catalog/servicePaging';

export interface CursorState {
  cursorType: CursorType | null;
  cursorValue?: string;
}

export interface UseCursorPagingReturn {
  paging: Ref<CursorPagingState>;
  handlePagingChange: (next: Partial<CursorPagingState>) => void;
  currentPage: Ref<number>;
  handlePageChange: (
    page: number | ((page: number) => number),
    cursorData?: CursorState,
    pageSize?: number,
  ) => void;
  pageSize: ComputedRef<number>;
  handlePageSizeChange: (page: number) => void;
  showPagination: ComputedRef<boolean>;
  pagingCursor: ComputedRef<PagingUrlParams>;
  resetPaging: () => void;
}

function asCursorType(value: unknown): CursorType | undefined {
  return value === 'after' || value === 'before' ? value : undefined;
}

function asCursorValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Pin usePaging (hooks/paging/usePaging.ts) as a Vue composable,
 * without the saved-page-size preference. Page, cursor, and size
 * live in the URL query (currentPage/cursorType/cursorValue/
 * pageSize) and sync both ways: handlers replace the URL, and a
 * watcher adopts URL changes with equality guards so the replace
 * never loops. An off-scale URL size clears all four paging params
 * from the URL, exactly as the pin effect does.
 *
 * resetPaging is a design-required convenience composed from pin
 * primitives (page 1, no cursor, paging cleared); the pin has no
 * single reset call.
 */
export function useCursorPaging(
  defaultPageSize?: number,
  pageSizeOptions: number[] = LIST_PAGE_SIZE_OPTIONS,
): UseCursorPagingReturn {
  const route = useRoute();
  const router = useRouter();

  const fallbackPageSize = defaultPageSize ?? PAGE_SIZE_BASE;
  const processedPageSize = pageSizeOptions.includes(fallbackPageSize)
    ? fallbackPageSize
    : (pageSizeOptions[0] ?? PAGE_SIZE_BASE);

  const paging = ref<CursorPagingState>(createEmptyPaging());
  const currentPage = ref<number>(INITIAL_PAGING_VALUE);
  const storedPageSize = ref<number>(processedPageSize);
  const syncedUrlPaging = ref({ page: INITIAL_PAGING_VALUE, size: processedPageSize });

  const resolved = computed(() =>
    readUrlPaging(route.query as Record<string, unknown>, pageSizeOptions, processedPageSize),
  );

  const writeQuery = (patch: Record<string, QueryPatchValue>): void => {
    void router.replace({
      query: mergeQueryParams(route.query as Record<string, unknown>, patch),
    });
  };

  const syncFromRoute = (): void => {
    if (resolved.value.isOffScaleUrlSize) {
      writeQuery({ currentPage: null, cursorType: null, cursorValue: null, pageSize: null });
    }
    if (
      syncedUrlPaging.value.page !== resolved.value.urlCurrentPage ||
      syncedUrlPaging.value.size !== resolved.value.resolvedPageSize
    ) {
      syncedUrlPaging.value = {
        page: resolved.value.urlCurrentPage,
        size: resolved.value.resolvedPageSize,
      };
      currentPage.value = resolved.value.urlCurrentPage;
      storedPageSize.value = resolved.value.resolvedPageSize;
    }
  };

  watch(() => route.query, syncFromRoute, { immediate: true });

  const pageSize = computed(() =>
    pageSizeOptions.includes(storedPageSize.value)
      ? storedPageSize.value
      : resolved.value.resolvedPageSize,
  );

  const pagingCursor = computed<PagingUrlParams>(() => {
    const stale = resolved.value.isUrlPagingStale;
    return {
      cursorType: stale ? undefined : asCursorType(route.query.cursorType),
      cursorValue: stale ? undefined : asCursorValue(route.query.cursorValue),
      currentPage: String(resolved.value.urlCurrentPage),
      pageSize: resolved.value.resolvedPageSize,
    };
  });

  const showPagination = computed(
    () => paging.value.total > 0 || Boolean(paging.value.before || paging.value.after),
  );

  const handlePagingChange = (next: Partial<CursorPagingState>): void => {
    paging.value = {
      after: next.after ?? '',
      before: next.before ?? '',
      total: next.total ?? 0,
    };
  };

  const handlePageChange = (
    page: number | ((current: number) => number),
    cursorData?: CursorState,
    size?: number,
  ): void => {
    const nextPage = typeof page === 'function' ? page(currentPage.value) : page;
    currentPage.value = nextPage;
    const patch: Record<string, QueryPatchValue> = { currentPage: String(nextPage) };
    if (cursorData) {
      patch.cursorType = cursorData.cursorType ?? undefined;
      patch.cursorValue = cursorData.cursorValue;
    }
    if (size) {
      patch.pageSize = size;
    }
    writeQuery(patch);
  };

  const handlePageSizeChange = (size: number): void => {
    storedPageSize.value = size;
    currentPage.value = INITIAL_PAGING_VALUE;
    writeQuery({
      pageSize: String(size),
      currentPage: String(INITIAL_PAGING_VALUE),
      cursorType: null,
      cursorValue: null,
    });
  };

  const resetPaging = (): void => {
    currentPage.value = INITIAL_PAGING_VALUE;
    paging.value = createEmptyPaging();
    writeQuery({ currentPage: null, cursorType: null, cursorValue: null });
  };

  return {
    paging,
    handlePagingChange,
    currentPage,
    handlePageChange,
    pageSize,
    handlePageSizeChange,
    showPagination,
    pagingCursor,
    resetPaging,
  };
}
