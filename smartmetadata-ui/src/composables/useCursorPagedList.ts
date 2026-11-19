/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import {
  computed,
  readonly,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { PAGE_SIZE_BASE, type Paging } from '@/utils/pagination';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';

export interface CursorPageParams {
  after?: string;
  before?: string;
  limit: number;
}

export interface CursorPageResult<T> {
  data: T[];
  paging: Paging;
}

export type FetchCursorPage<T> = (
  params: CursorPageParams,
) => Promise<CursorPageResult<T>>;

export interface CursorPagedListPersistenceOptions {
  storage: Storage;
  userName: MaybeRefOrGetter<string | undefined>;
}

export interface UseCursorPagedListOptions {
  /**
   * Error sink. Official `useCursorPagedList` shows an error toast; the
   * default here surfaces the error through ant-design-vue `message`.
   * Pages that need pin `ToastUtils` semantics pass their own handler.
   */
  onError?: (error: unknown) => void;
  /**
   * Opt-in T-5 persistence. Official `useCursorPagedList` itself never
   * persists; persistence lives with the paging state owner (official
   * `usePaging.handlePageSize` / `persistGlobalPageSize`, gated to
   * {15, 25, 50}). When given, the initial size is read through the
   * T-5 helper and every size change is written through it. Without
   * this option the hook touches no storage and starts at 15, exactly
   * like the official hook.
   */
  persistence?: CursorPagedListPersistenceOptions;
  /**
   * Restart trigger. Officially a new `fetchPage` identity (e.g. a
   * changed filter) clears the cache and restarts from page 1. In Vue
   * the fetch function is created once in setup, so callers pass the
   * values it closes over as this getter; when its value changes the
   * list restarts the same way.
   */
  resetKey?: MaybeRefOrGetter<unknown>;
}

export interface UseCursorPagedListResult<T> {
  items: Readonly<Ref<T[]>>;
  /** Exposed for `NextPrevious` wiring; official keeps it internal. */
  paging: Readonly<Ref<Paging>>;
  isLoading: Readonly<Ref<boolean>>;
  page: Readonly<Ref<number>>;
  pageSize: Readonly<Ref<number>>;
  totalPages: Ref<number>;
  showPagination: Ref<boolean>;
  onPageChange: (nextPage: number) => Promise<void>;
  onPageSizeChange: (size: number) => void;
}

interface WalkToAfterCursorOptions {
  /** The page to open. */
  target: number;
  /** Paging a loaded page returned, if it is still known. */
  pagingFor: (page: number) => Paging | undefined;
  /** Keep the paging of a page fetched while walking. */
  remember: (page: number, paging: Paging) => void;
  /** Fetch the page that starts at `after` and return its paging. */
  fetchPaging: (after: string) => Promise<Paging>;
  /** True once a newer navigation or a list restart made this walk moot. */
  isStale: () => boolean;
}

/**
 * The `after` cursor that opens page `target` of a cursor-paged list,
 * fetching any pages between the last known one and `target` so a jump
 * (e.g. 1 -> 4) lands on the right page. Undefined when the list runs
 * out of pages or the walk went stale. Ported from official
 * `utils/CursorPaging.utils.ts`.
 */
export const walkToAfterCursor = async ({
  target,
  pagingFor,
  remember,
  fetchPaging,
  isStale,
}: WalkToAfterCursorOptions): Promise<string | undefined> => {
  let known = target - 1;
  while (known > 1 && !pagingFor(known)) {
    known--;
  }
  let knownPaging = pagingFor(known);
  while (known < target - 1 && knownPaging?.after) {
    const nextPaging = await fetchPaging(knownPaging.after);
    if (isStale()) {
      return undefined;
    }
    known++;
    remember(known, nextPaging);
    knownPaging = nextPaging;
  }

  return known === target - 1 ? knownPaging?.after : undefined;
};

// Cursors are kept for this many pages at most; past it a jump walks again
// (ADR:2026-10-16-cursor-paged-lists-jump-by-walking).
const MAX_CACHED_PAGES = 100;

const rememberPaging = (
  cache: Map<number, Paging>,
  pageNumber: number,
  pagePaging: Paging,
): void => {
  if (cache.size < MAX_CACHED_PAGES) {
    cache.set(pageNumber, pagePaging);
  }
};

function defaultOnError(error: unknown): void {
  message.error(error instanceof Error ? error.message : String(error));
}

/**
 * Page-number pagination over a cursor-paged list endpoint, ported from
 * official `hooks/useCursorPagedList.ts` at pin a3012259ca. Each loaded
 * page's paging is cached, so any page is reachable: forward uses page
 * N-1's `after` (fetching unvisited pages in between first), back uses
 * page N+1's `before`, and page 1 needs no cursor. A changed `resetKey`
 * clears the cache and restarts from page 1. Only the latest request
 * may write state.
 *
 * Cooperation with `NextPrevious`: wire `pagingHandler` to
 * `({ currentPage }) => onPageChange(currentPage)` — the composable
 * derives cursors from its cache, so the `cursorType` payload is not
 * consumed — and `onShowSizeChange` to `onPageSizeChange`. Note the
 * official hook's own callers use a bespoke pager, not `NextPrevious`;
 * this wiring is the product-side adapter, not an official pairing.
 */
export function useCursorPagedList<T>(
  fetchPage: FetchCursorPage<T>,
  options: UseCursorPagedListOptions = {},
): UseCursorPagedListResult<T> {
  // shallowRef, not ref: the only write is a wholesale replacement
  // (items.value = response.data), so deep reactivity buys nothing, and
  // ref<T[]> unwraps the element type (UnwrapRefSimple<T>), which no
  // longer matches the Readonly<Ref<T[]>> contract. shallowRef keeps
  // the value type exactly T[]. The exposed view was already readonly,
  // so no consumer can rely on mutating elements through it.
  const items = shallowRef<T[]>([]);
  const paging = ref<Paging>({ total: 0 });
  const page = ref(1);
  const pageSize = ref(
    options.persistence
      ? readGlobalPageSize(
          options.persistence.storage,
          toValue(options.persistence.userName),
        )
      : PAGE_SIZE_BASE,
  );
  const isLoading = ref(true);
  // Only the latest request may write state: a slow earlier response
  // (e.g. the list before a filter flipped) must not overwrite the
  // newer one.
  let latestRequest = 0;
  // The paging each loaded page returned, so any page can be reached
  // later: page k's `after` opens page k+1 and its `before` opens k-1.
  const pagingByPage = new Map<number, Paging>();
  // Bumped when the list restarts, so a walk or response that began
  // against the previous list never writes its cursors into the new
  // cache.
  let listVersion = 0;
  // Bumped on every page change, so a slow jump never overrides a later
  // one.
  let latestNavigation = 0;

  const onError = options.onError ?? defaultOnError;

  async function load(
    cursor?: Pick<CursorPageParams, 'after' | 'before'>,
    targetPage = 1,
  ): Promise<void> {
    const requestId = ++latestRequest;
    isLoading.value = true;
    try {
      const response = await fetchPage({ ...cursor, limit: pageSize.value });
      if (requestId === latestRequest) {
        rememberPaging(pagingByPage, targetPage, response.paging);
        items.value = response.data;
        paging.value = response.paging;
      }
    } catch (error) {
      if (requestId === latestRequest) {
        onError(error);
      }
    } finally {
      if (requestId === latestRequest) {
        isLoading.value = false;
      }
    }
  }

  function restart(): void {
    listVersion++;
    pagingByPage.clear();
    page.value = 1;
    void load();
  }

  // One watcher covers both official restart triggers (new fetchPage
  // identity via resetKey, and page-size change): a single restart per
  // change, never two competing loads.
  watch(
    [() => toValue(options.resetKey), pageSize],
    () => {
      restart();
    },
    { immediate: true },
  );

  async function onPageChange(nextPage: number): Promise<void> {
    // Each page change supersedes any earlier one still walking.
    const navigation = ++latestNavigation;
    if (nextPage === 1) {
      page.value = 1;

      await load(undefined, 1);

      return;
    }
    const before =
      nextPage < page.value ? pagingByPage.get(nextPage + 1)?.before : undefined;
    if (before) {
      page.value = nextPage;

      await load({ before }, nextPage);

      return;
    }
    const version = listVersion;
    const isStale = () =>
      navigation !== latestNavigation || version !== listVersion;
    isLoading.value = true;
    try {
      const after = await walkToAfterCursor({
        target: nextPage,
        pagingFor: (pageNumber) => pagingByPage.get(pageNumber),
        remember: (pageNumber, pagePaging) =>
          rememberPaging(pagingByPage, pageNumber, pagePaging),
        fetchPaging: async (cursor) =>
          (await fetchPage({ after: cursor, limit: pageSize.value })).paging,
        isStale,
      });
      if (isStale()) {
        return;
      }
      // No cursor: stay put rather than show the wrong rows under
      // another page number.
      if (!after) {
        isLoading.value = false;

        return;
      }
      page.value = nextPage;

      await load({ after }, nextPage);
    } catch (error) {
      if (!isStale()) {
        isLoading.value = false;
        onError(error);
      }

      return;
    }
  }

  function onPageSizeChange(size: number): void {
    pageSize.value = size;
    if (options.persistence) {
      writeGlobalPageSize(
        options.persistence.storage,
        toValue(options.persistence.userName),
        size,
      );
    }
  }

  return {
    // readonly() deep-freezes the element type (DeepReadonly<T> is not
    // assignable to T), so the items view is a computed over the
    // shallowRef: same array identity, same Readonly<Ref<T[]>> contract
    // as the other fields.
    items: computed(() => items.value),
    paging: readonly(paging),
    isLoading: readonly(isLoading),
    page: readonly(page),
    pageSize: readonly(pageSize),
    totalPages: computed(() => Math.ceil(paging.value.total / pageSize.value)),
    showPagination: computed(
      () =>
        Boolean(paging.value.after || paging.value.before) ||
        paging.value.total > PAGE_SIZE_BASE,
    ),
    onPageChange,
    onPageSizeChange,
  };
}
