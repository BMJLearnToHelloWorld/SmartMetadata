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
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type Ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { ServicePageData } from '@/api/servicePageData';
import { useDriveAssets, type UseDriveAssetsReturn } from './useDriveAssets';

const listDriveAssetsMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/driveAssets', () => ({
  listDriveAssets: (...args: unknown[]) => listDriveAssetsMock(...args),
}));

function pageData(overrides: Partial<ServicePageData> = {}): ServicePageData {
  return {
    id: 'f-1',
    name: 'budget.xlsx',
    fullyQualifiedName: 'drive.budget',
    owners: [],
    domains: [],
    dataProducts: [],
    tags: [],
    ...overrides,
  };
}

async function mountHook(options: {
  query?: Record<string, string>;
  showDeleted?: boolean;
  entityType?: 'file' | 'spreadsheet';
}): Promise<{
  router: Router;
  hook: UseDriveAssetsReturn;
  showDeleted: Ref<boolean>;
  unmount: () => void;
}> {
  const showDeleted = ref(options.showDeleted ?? false);
  const holder = {} as UseDriveAssetsReturn;
  const Page = defineComponent({
    setup() {
      Object.assign(
        holder,
        useDriveAssets(options.entityType ?? 'file', 'drive-svc', showDeleted),
      );
      return () => h('div', 'page');
    },
  });
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }],
  });
  await router.push({ path: '/', query: options.query ?? {} });
  await router.isReady();
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [createTestI18n(), router] },
  });
  await flushPromises();
  return { router, hook: holder, showDeleted, unmount: () => wrapper.unmount() };
}

beforeEach(() => {
  vi.clearAllMocks();
  listDriveAssetsMock.mockResolvedValue({
    data: [pageData()],
    total: 1,
    after: 'next-cursor',
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useDriveAssets (pin useServiceDriveAssets)', () => {
  it('lists root assets with the common fields and non-deleted include', async () => {
    const { hook, unmount } = await mountHook({});
    expect(listDriveAssetsMock).toHaveBeenCalledWith('file', {
      service: 'drive-svc',
      fields: 'tags,owners,domains,dataProducts,certification',
      root: true,
      paging: { limit: 15 },
      include: 'non-deleted',
    });
    await vi.waitFor(() => {
      expect(hook.isLoading.value).toBe(false);
    });
    expect(hook.items.value).toHaveLength(1);
    expect(hook.items.value[0]?.name).toBe('budget.xlsx');
    expect(hook.pagingInfo.paging.value.total).toBe(1);
    expect(hook.pagingInfo.paging.value.after).toBe('next-cursor');
    unmount();
  });

  it('asks for deleted assets when showDeleted is set', async () => {
    const { unmount } = await mountHook({ showDeleted: true });
    expect(listDriveAssetsMock).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({ include: 'deleted' }),
    );
    unmount();
  });

  it('does not list while a search term is present, and lists once it clears', async () => {
    const { router, unmount } = await mountHook({ query: { file: 'budget' } });
    await flushPromises();
    expect(listDriveAssetsMock).not.toHaveBeenCalled();
    await router.replace({ query: {} });
    await flushPromises();
    expect(listDriveAssetsMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('toasts, clears rows, and resets paging when the list fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    listDriveAssetsMock.mockRejectedValueOnce(new Error('drive down'));
    const { hook, unmount } = await mountHook({});
    await vi.waitFor(() => {
      expect(hook.isLoading.value).toBe(false);
    });
    expect(errorSpy).toHaveBeenCalledWith('drive down');
    expect(hook.items.value).toEqual([]);
    expect(hook.pagingInfo.paging.value).toEqual({ after: '', before: '', total: 0 });
    unmount();
  });

  it('ignores a stale list response when a newer request is in flight', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    listDriveAssetsMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ data: [pageData({ id: 'f-2', name: 'second.xlsx' })], total: 1 });
    const { hook, showDeleted, unmount } = await mountHook({});
    showDeleted.value = true;
    await flushPromises();
    resolveFirst({ data: [pageData({ id: 'f-1', name: 'first.xlsx' })], total: 1 });
    await flushPromises();
    expect(hook.items.value.map((item) => item.id)).toEqual(['f-2']);
    unmount();
  });

  it('advances the cursor page from the stored paging cursor', async () => {
    const { hook, router, unmount } = await mountHook({});
    await vi.waitFor(() => {
      expect(hook.isLoading.value).toBe(false);
    });
    hook.onPageChange({ cursorType: 'after', currentPage: 2 });
    await flushPromises();
    expect(router.currentRoute.value.query.currentPage).toBe('2');
    expect(router.currentRoute.value.query.cursorType).toBe('after');
    expect(router.currentRoute.value.query.cursorValue).toBe('next-cursor');
    expect(listDriveAssetsMock).toHaveBeenLastCalledWith(
      'file',
      expect.objectContaining({ paging: { after: 'next-cursor', limit: 15 } }),
    );
    unmount();
  });

  it('lets setItems/setIsLoading hand the rows to the table search', async () => {
    const { hook, unmount } = await mountHook({ query: { file: 'budget' } });
    hook.setIsLoading(true);
    hook.setItems([pageData({ id: 'f-9' })]);
    expect(hook.isLoading.value).toBe(true);
    expect(hook.items.value.map((item) => item.id)).toEqual(['f-9']);
    hook.setIsLoading(false);
    expect(hook.isLoading.value).toBe(false);
    unmount();
  });
});
