/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { readGlobalPageSize } from '@/utils/userPageSizePreference';
import {
  useCursorPagedList,
  type CursorPageResult,
  type FetchCursorPage,
  type UseCursorPagedListOptions,
  type UseCursorPagedListResult,
} from './useCursorPagedList';

function mountList(
  fetchPage: FetchCursorPage<string>,
  options: UseCursorPagedListOptions = {},
) {
  let result!: UseCursorPagedListResult<string>;
  const probe = defineComponent({
    setup() {
      result = useCursorPagedList(fetchPage, options);
      return () => h('div');
    },
  });
  const wrapper = mount(probe);
  return { wrapper, result: () => result };
}

async function waitForIdle(result: UseCursorPagedListResult<string>): Promise<void> {
  await vi.waitFor(() => expect(result.isLoading.value).toBe(false));
  await flushPromises();
}

function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('useCursorPagedList (official useCursorPagedList.ts)', () => {
  const fetchPage = vi.fn<FetchCursorPage<string>>();

  beforeEach(() => {
    fetchPage.mockReset();
    fetchPage.mockResolvedValue({
      data: ['a'],
      paging: { total: 40, after: 'next', before: 'prev' },
    });
  });

  it('loads the first page with the default page size', async () => {
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());

    expect(fetchPage).toHaveBeenCalledWith({ limit: 15 });
    expect(result().items.value).toEqual(['a']);
    expect(result().pageSize.value).toBe(15);
    expect(result().totalPages.value).toBe(3);
    expect(result().showPagination.value).toBe(true);
  });

  it('follows the after cursor forward and reloads the first page going back to 1', async () => {
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());

    await result().onPageChange(2);
    expect(fetchPage).toHaveBeenLastCalledWith({ after: 'next', limit: 15 });

    await result().onPageChange(1);
    // Page 1 needs no cursor: it is simply the first page again.
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 15 });
    expect(result().page.value).toBe(1);
  });

  it('restarts from page 1 when the page size changes', async () => {
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());

    await result().onPageChange(2);
    result().onPageSizeChange(25);
    await waitForIdle(result());

    expect(result().page.value).toBe(1);
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 25 });
  });

  it('ignores a slower earlier response once a newer request was made', async () => {
    let resolveFirst!: (value: CursorPageResult<string>) => void;
    const slowFirst = vi
      .fn<FetchCursorPage<string>>()
      .mockImplementationOnce(
        () =>
          new Promise<CursorPageResult<string>>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ data: ['new'], paging: { total: 1 } });
    const filter = ref('a');
    const { result } = mountList(slowFirst, {
      onError: vi.fn(),
      resetKey: () => filter.value,
    });
    filter.value = 'b';
    await nextTick();
    await waitForIdle(result());
    expect(result().items.value).toEqual(['new']);

    resolveFirst({ data: ['stale'], paging: { total: 1 } });
    await flushPromises();
    expect(result().items.value).toEqual(['new']);
  });

  it('restarts from page 1 with a cleared cursor cache when the reset key changes', async () => {
    const filter = ref('a');
    const { result } = mountList(fetchPage, {
      onError: vi.fn(),
      resetKey: () => filter.value,
    });
    await waitForIdle(result());
    await result().onPageChange(2);
    expect(result().page.value).toBe(2);

    filter.value = 'b';
    await nextTick();
    await waitForIdle(result());
    expect(result().page.value).toBe(1);
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 15 });
  });

  it('jumps to a page it has not loaded by walking the cursors in between', async () => {
    fetchPage.mockImplementation(({ after, before }: { after?: string; before?: string }) => {
      // The `before` cursor of page N opens page N-1; `after` cursor pN opens page N.
      const pageNumber = after
        ? Number(after.replace('p', ''))
        : before
          ? Number(before.replace('b', '')) - 1
          : 1;
      return Promise.resolve({
        data: [`item-${pageNumber}`],
        paging: { total: 60, after: `p${pageNumber + 1}`, before: `b${pageNumber}` },
      });
    });
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());

    await result().onPageChange(3);
    expect(result().page.value).toBe(3);
    expect(result().items.value).toEqual(['item-3']);

    // Back to page 2 uses page 3's `before` cursor, no walking needed.
    fetchPage.mockClear();
    await result().onPageChange(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({ before: 'b3', limit: 15 });
    expect(result().items.value).toEqual(['item-2']);
  });

  it('stays put when the walk runs out of pages', async () => {
    fetchPage
      .mockResolvedValueOnce({
        data: ['a'],
        paging: { total: 30, after: 'p2', before: '' },
      })
      .mockResolvedValue({ data: ['b'], paging: { total: 30 } });
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());

    await result().onPageChange(3);
    expect(result().page.value).toBe(1);
    expect(result().items.value).toEqual(['a']);
    expect(result().isLoading.value).toBe(false);
  });

  it('reports errors through onError, keeps previous items, and clears loading', async () => {
    const onError = vi.fn();
    fetchPage.mockRejectedValueOnce(new Error('load failed'));
    const { result } = mountList(fetchPage, { onError });
    await waitForIdle(result());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result().items.value).toEqual([]);
    expect(result().isLoading.value).toBe(false);
  });

  it('hides pagination for a single short page without cursors', async () => {
    fetchPage.mockResolvedValue({ data: ['a'], paging: { total: 10 } });
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());
    expect(result().showPagination.value).toBe(false);

    fetchPage.mockResolvedValue({ data: ['a'], paging: { total: 16 } });
    const { result: second } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(second());
    // The threshold is PAGE_SIZE_BASE (15), not the current page size.
    expect(second().showPagination.value).toBe(true);
  });

  it('reads the persisted size initially and writes size changes through the T-5 helper', async () => {
    const storage = createFakeStorage();
    storage.setItem(
      'sm.userPreferences.v1',
      JSON.stringify({ version: 1, preferences: { alice: { globalPageSize: 25 } } }),
    );
    const { result } = mountList(fetchPage, {
      onError: vi.fn(),
      persistence: { storage, userName: 'alice' },
    });
    await waitForIdle(result());
    expect(result().pageSize.value).toBe(25);
    expect(fetchPage).toHaveBeenCalledWith({ limit: 25 });

    result().onPageSizeChange(50);
    expect(readGlobalPageSize(storage, 'alice')).toBe(50);

    // Sizes outside {15, 25, 50} still take effect locally but are never persisted.
    result().onPageSizeChange(12);
    expect(result().pageSize.value).toBe(12);
    expect(readGlobalPageSize(storage, 'alice')).toBe(50);
  });

  it('touches no storage without the persistence option', async () => {
    const storage = createFakeStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const { result } = mountList(fetchPage, { onError: vi.fn() });
    await waitForIdle(result());
    result().onPageSizeChange(25);
    await waitForIdle(result());
    expect(setItem).not.toHaveBeenCalled();
    expect(result().pageSize.value).toBe(25);
  });
});
