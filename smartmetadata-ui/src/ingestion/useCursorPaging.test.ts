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
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { useCursorPaging, type UseCursorPagingReturn } from './useCursorPaging';

async function mountPaging(initialPath: string): Promise<{
  router: Router;
  paging: UseCursorPagingReturn;
  unmount: () => void;
}> {
  const holder = {} as UseCursorPagingReturn;
  const Page = defineComponent({
    setup() {
      Object.assign(holder, useCursorPaging());
      return () => h('div', 'page');
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  });
  await router.push(initialPath);
  await router.isReady();
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router] },
  });
  await flushPromises();
  return {
    router,
    paging: holder,
    unmount: () => wrapper.unmount(),
  };
}

describe('useCursorPaging (pin usePaging, without the saved preference)', () => {
  it('starts at page 1 with the base size and no cursor', async () => {
    const { paging, unmount } = await mountPaging('/');
    expect(paging.currentPage.value).toBe(1);
    expect(paging.pageSize.value).toBe(15);
    expect(paging.paging.value).toEqual({ after: '', before: '', total: 0 });
    expect(paging.showPagination.value).toBe(false);
    expect(paging.pagingCursor.value).toEqual({ currentPage: '1', pageSize: 15 });
    unmount();
  });

  it('adopts page, size, and cursor from the URL', async () => {
    const { paging, unmount } = await mountPaging(
      '/?currentPage=3&pageSize=25&cursorType=after&cursorValue=abc&other=keep',
    );
    expect(paging.currentPage.value).toBe(3);
    expect(paging.pageSize.value).toBe(25);
    expect(paging.pagingCursor.value).toEqual({
      cursorType: 'after',
      cursorValue: 'abc',
      currentPage: '3',
      pageSize: 25,
    });
    unmount();
  });

  it('normalizes an off-scale URL size by clearing all paging params', async () => {
    const { router, paging, unmount } = await mountPaging(
      '/?currentPage=4&pageSize=48&cursorValue=abc&other=keep',
    );
    await flushPromises();
    expect(paging.currentPage.value).toBe(1);
    expect(paging.pageSize.value).toBe(15);
    expect(paging.pagingCursor.value.cursorValue).toBeUndefined();
    expect(router.currentRoute.value.query).toEqual({ other: 'keep' });
    unmount();
  });

  it('writes page and cursor changes to the URL, merging other params', async () => {
    const { router, paging, unmount } = await mountPaging('/?tab=main');
    paging.handlePageChange(2, { cursorType: 'after', cursorValue: 'next' });
    await flushPromises();
    expect(paging.currentPage.value).toBe(2);
    expect(router.currentRoute.value.query).toEqual({
      tab: 'main',
      currentPage: '2',
      cursorType: 'after',
      cursorValue: 'next',
    });
    paging.handlePageChange((page) => page + 1, { cursorType: 'after', cursorValue: 'next2' });
    await flushPromises();
    expect(paging.currentPage.value).toBe(3);
    expect(router.currentRoute.value.query.currentPage).toBe('3');
    unmount();
  });

  it('clears the cursor from the URL when the cursor type is null', async () => {
    const { router, paging, unmount } = await mountPaging(
      '/?currentPage=2&cursorType=after&cursorValue=next',
    );
    paging.handlePageChange(1, { cursorType: null });
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ currentPage: '1' });
    unmount();
  });

  it('resets to page 1 and clears the cursor on a page-size change', async () => {
    const { router, paging, unmount } = await mountPaging(
      '/?currentPage=3&cursorType=after&cursorValue=abc',
    );
    paging.handlePageSizeChange(25);
    await flushPromises();
    expect(paging.currentPage.value).toBe(1);
    expect(paging.pageSize.value).toBe(25);
    expect(router.currentRoute.value.query).toEqual({ currentPage: '1', pageSize: '25' });
    unmount();
  });

  it('adopts external URL changes without looping', async () => {
    const { router, paging, unmount } = await mountPaging('/');
    await router.replace('/?currentPage=2&pageSize=50');
    await flushPromises();
    expect(paging.currentPage.value).toBe(2);
    expect(paging.pageSize.value).toBe(50);
    expect(router.currentRoute.value.query).toEqual({ currentPage: '2', pageSize: '50' });
    unmount();
  });

  it('shows pagination on total or cursors, and replaces paging wholesale', async () => {
    const { paging, unmount } = await mountPaging('/');
    paging.handlePagingChange({ total: 4 });
    expect(paging.paging.value).toEqual({ after: '', before: '', total: 4 });
    expect(paging.showPagination.value).toBe(true);
    paging.handlePagingChange({ after: 'next', total: 0 });
    expect(paging.paging.value).toEqual({ after: 'next', before: '', total: 0 });
    expect(paging.showPagination.value).toBe(true);
    paging.handlePagingChange({ total: 0 });
    expect(paging.showPagination.value).toBe(false);
    unmount();
  });

  it('resetPaging returns to page 1 with no cursor, keeping the size', async () => {
    const { router, paging, unmount } = await mountPaging(
      '/?currentPage=3&pageSize=25&cursorType=after&cursorValue=abc',
    );
    paging.handlePagingChange({ total: 9, after: 'next' });
    paging.resetPaging();
    await flushPromises();
    expect(paging.currentPage.value).toBe(1);
    expect(paging.pageSize.value).toBe(25);
    expect(paging.paging.value).toEqual({ after: '', before: '', total: 0 });
    expect(router.currentRoute.value.query).toEqual({ pageSize: '25' });
    unmount();
  });
});

function createMemoryStorage(initial?: Record<string, string>): Storage {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
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
      store.set(key, String(value));
    },
  };
}

async function mountPagingWithPersistence(
  initialPath: string,
  storage: Storage,
  userName: string | undefined,
  defaultPageSize?: number,
): Promise<{ router: Router; paging: UseCursorPagingReturn; unmount: () => void }> {
  const holder = {} as UseCursorPagingReturn;
  const Page = defineComponent({
    setup() {
      Object.assign(
        holder,
        useCursorPaging(defaultPageSize, undefined, { storage, userName: () => userName }),
      );
      return () => h('div', 'page');
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  });
  await router.push(initialPath);
  await router.isReady();
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router] },
  });
  await flushPromises();
  return { router, paging: holder, unmount: () => wrapper.unmount() };
}

describe('useCursorPaging with T-5 persistence', () => {
  const seed = (size: number) =>
    JSON.stringify({ version: 1, preferences: { alice: { globalPageSize: size } } });

  it('falls back to the persisted size when neither URL nor default provides one', async () => {
    const storage = createMemoryStorage({ 'sm.userPreferences.v1': seed(25) });
    const { paging, unmount } = await mountPagingWithPersistence('/', storage, 'alice');
    expect(paging.pageSize.value).toBe(25);
    unmount();
  });

  it('prefers the URL size, then the default, over the persisted size', async () => {
    const storage = createMemoryStorage({ 'sm.userPreferences.v1': seed(50) });
    const urlWins = await mountPagingWithPersistence('/?pageSize=25', storage, 'alice');
    expect(urlWins.paging.pageSize.value).toBe(25);
    urlWins.unmount();
    const defaultWins = await mountPagingWithPersistence('/', storage, 'alice', 15);
    expect(defaultWins.paging.pageSize.value).toBe(15);
    defaultWins.unmount();
  });

  it('persists gated sizes on change and resets to page 1', async () => {
    const storage = createMemoryStorage();
    const { router, paging, unmount } = await mountPagingWithPersistence(
      '/?currentPage=3&cursorType=after&cursorValue=abc',
      storage,
      'alice',
    );
    paging.handlePageSizeChange(50);
    await flushPromises();
    expect(paging.currentPage.value).toBe(1);
    expect(paging.pageSize.value).toBe(50);
    expect(router.currentRoute.value.query).toEqual({ currentPage: '1', pageSize: '50' });
    expect(JSON.parse(storage.getItem('sm.userPreferences.v1') ?? '{}')).toEqual({
      version: 1,
      preferences: { alice: { globalPageSize: 50 } },
    });
    unmount();
  });

  it('never persists ungated sizes; off-scale sizes normalize back to the fallback', async () => {
    const storage = createMemoryStorage();
    const { paging, unmount } = await mountPagingWithPersistence('/', storage, 'alice');
    paging.handlePageSizeChange(10);
    await flushPromises();
    expect(storage.getItem('sm.userPreferences.v1')).toBeNull();
    expect(paging.pageSize.value).toBe(15);
    unmount();
  });

  it('reads the default and writes nothing without a user name', async () => {
    const storage = createMemoryStorage({ 'sm.userPreferences.v1': seed(25) });
    const { paging, unmount } = await mountPagingWithPersistence('/', storage, undefined);
    expect(paging.pageSize.value).toBe(15);
    paging.handlePageSizeChange(50);
    await flushPromises();
    expect(storage.getItem('sm.userPreferences.v1')).toBe(seed(25));
    unmount();
  });

  it('persists the size branch of handlePageChange', async () => {
    const storage = createMemoryStorage();
    const { paging, unmount } = await mountPagingWithPersistence('/', storage, 'alice');
    paging.handlePageChange(2, undefined, 25);
    await flushPromises();
    expect(JSON.parse(storage.getItem('sm.userPreferences.v1') ?? '{}')).toEqual({
      version: 1,
      preferences: { alice: { globalPageSize: 25 } },
    });
    unmount();
  });
});
