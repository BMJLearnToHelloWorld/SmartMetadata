/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  patchAnnouncement,
} from '@/api/announcements';
import type { Announcement } from '@/types/collaboration';
import { ApiError } from '@/api/client';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import {
  deleteSystemAnnouncement,
  saveSystemAnnouncement,
  useSystemAnnouncement,
  useSystemAnnouncementsList,
  type SystemAnnouncementsListState,
} from './useSystemAnnouncements';

vi.mock('@/api/announcements', () => ({
  createAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementById: vi.fn(),
  listAnnouncements: vi.fn(),
  patchAnnouncement: vi.fn(),
}));

const mockedList = vi.mocked(listAnnouncements);
const mockedGetById = vi.mocked(getAnnouncementById);
const mockedCreate = vi.mocked(createAnnouncement);
const mockedPatch = vi.mocked(patchAnnouncement);
const mockedDelete = vi.mocked(deleteAnnouncement);

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

type MockedHooks = AlertSearchHooks & {
  notifyError: Mock<(message: string) => void>;
  notifyWarning: Mock<(message: string) => void>;
};

function hooks(overrides: Partial<AlertSearchHooks> = {}): MockedHooks {
  return {
    t,
    notifyError: vi.fn<(message: string) => void>(),
    notifyWarning: vi.fn<(message: string) => void>(),
    ...overrides,
  } as MockedHooks;
}

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    name: 'announcement-a1',
    displayName: 'Downtime',
    description: 'Window',
    type: 'Notice',
    startTime: 100,
    endTime: 200,
    createdBy: 'amy',
    ...overrides,
  };
}

describe('useSystemAnnouncementsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountList(): SystemAnnouncementsListState {
    let state!: SystemAnnouncementsListState;
    const probe = defineComponent({
      setup() {
        state = useSystemAnnouncementsList();
        return () => h('div');
      },
    });
    mount(probe);
    return state;
  }

  it('fetches system announcements once, limit 1000, status/type server-side', async () => {
    mockedList.mockResolvedValue({ data: [announcement()], total: 1 });
    const state = mountList();
    await flushPromises();
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList).toHaveBeenCalledWith({
      system: true,
      status: undefined,
      type: undefined,
      limit: 1000,
    });
    expect(state.announcements.value).toHaveLength(1);
    expect(state.isLoading.value).toBe(false);
    expect(state.isError.value).toBe(false);
  });

  it('refetches when status or type changes, and restarts from page 1', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      announcement({ id: `a${i}`, name: `a${i}`, startTime: i }),
    );
    mockedList.mockResolvedValueOnce({ data: rows, total: 25 }).mockResolvedValueOnce({ data: [], total: 0 });
    const state = mountList();
    await flushPromises();
    state.goToPage(3);
    expect(state.page.value).toBe(3);
    state.updateFilters({ status: 'Active' });
    await flushPromises();
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(mockedList).toHaveBeenLastCalledWith({
      system: true,
      status: 'Active',
      type: undefined,
      limit: 1000,
    });
    expect(state.page.value).toBe(1);
  });

  it('searches titles client-side without refetching, newest start first', async () => {
    mockedList.mockResolvedValue({
      data: [
        announcement({ id: 'old', name: 'old', displayName: 'Old window', startTime: 10 }),
        announcement({ id: 'new', name: 'new', displayName: 'New window', startTime: 50 }),
        announcement({ id: 'other', name: 'other', displayName: 'Unrelated', startTime: 90 }),
      ],
      total: 3,
    });
    const state = mountList();
    await flushPromises();
    state.updateFilters({ search: 'WINDOW' });
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(state.announcements.value.map((a) => a.id)).toEqual(['new', 'old']);
    expect(state.total.value).toBe(2);
    expect(state.hasFilters.value).toBe(true);
  });

  it('pages client-side and restarts from page 1 on a narrower search', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      announcement({ id: `a${i}`, name: `a${i}`, displayName: `Window ${i}`, startTime: i }),
    );
    mockedList.mockResolvedValue({ data: rows, total: 25 });
    const state = mountList();
    await flushPromises();
    expect(state.pageCount.value).toBe(3);
    state.goToPage(3);
    expect(state.announcements.value).toHaveLength(5);
    state.updateFilters({ search: 'Window 1' });
    // 11 matches ("Window 1", "Window 10"–"Window 19") over 2 pages;
    // the search restarts from the first page.
    expect(state.page.value).toBe(1);
    expect(state.pageCount.value).toBe(2);
  });

  it('clamps the current page when a refetch shrinks the list past it', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      announcement({ id: `a${i}`, name: `a${i}`, startTime: i }),
    );
    mockedList.mockResolvedValueOnce({ data: rows, total: 25 }).mockResolvedValueOnce({
      data: [announcement({ id: 'left', name: 'left' })],
      total: 1,
    });
    const state = mountList();
    await flushPromises();
    state.goToPage(3);
    await state.refetch();
    expect(state.page.value).toBe(1);
    expect(state.announcements.value.map((a) => a.id)).toEqual(['left']);
  });

  it('keeps the previous rows while a filter change loads', async () => {
    let resolveSecond!: (value: { data: Announcement[]; total: number }) => void;
    mockedList
      .mockResolvedValueOnce({ data: [announcement()], total: 1 })
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const state = mountList();
    await flushPromises();
    expect(state.announcements.value).toHaveLength(1);
    state.updateFilters({ type: 'Critical' });
    await flushPromises();
    // Still loading the second page, but the old rows stay and the
    // loading flag does not cover a refetch.
    expect(state.announcements.value).toHaveLength(1);
    expect(state.isLoading.value).toBe(false);
    resolveSecond({ data: [], total: 0 });
    await flushPromises();
    expect(state.announcements.value).toHaveLength(0);
  });

  it('reports an error and retries through refetch', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, '', 'boom'));
    const state = mountList();
    await flushPromises();
    expect(state.isError.value).toBe(true);
    expect(state.announcements.value).toHaveLength(0);
    mockedList.mockResolvedValueOnce({ data: [announcement()], total: 1 });
    await state.refetch();
    expect(state.isError.value).toBe(false);
    expect(state.announcements.value).toHaveLength(1);
  });

  it('clearFilters resets search, status, and type', async () => {
    mockedList.mockResolvedValue({ data: [], total: 0 });
    const state = mountList();
    await flushPromises();
    state.updateFilters({ search: 'x', status: 'Active', type: 'Notice' });
    await flushPromises();
    state.clearFilters();
    expect(state.filters.value).toEqual({ search: '' });
    expect(state.hasFilters.value).toBe(false);
  });
});

describe('useSystemAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountLoader(id: string | undefined, needsSource: boolean) {
    let exposed!: ReturnType<typeof useSystemAnnouncement>;
    const probe = defineComponent({
      setup() {
        exposed = useSystemAnnouncement({ id: () => id, needsSource: () => needsSource });
        return () => h('div');
      },
    });
    mount(probe);
    return exposed;
  }

  it('stays idle when no source is needed', async () => {
    const loader = mountLoader(undefined, false);
    await flushPromises();
    expect(mockedGetById).not.toHaveBeenCalled();
    expect(loader.isLoading.value).toBe(false);
    expect(loader.data.value).toBeUndefined();
  });

  it('fetches by id and reports an error without throwing', async () => {
    mockedGetById.mockResolvedValueOnce(announcement({ id: 'a9' }));
    const loader = mountLoader('a9', true);
    await flushPromises();
    expect(mockedGetById).toHaveBeenCalledWith('a9');
    expect(loader.data.value?.id).toBe('a9');

    mockedGetById.mockRejectedValueOnce(new ApiError(404, '', 'gone'));
    const missing = mountLoader('gone', true);
    await flushPromises();
    expect(missing.isError.value).toBe(true);
    expect(missing.data.value).toBeUndefined();
  });
});

describe('saveSystemAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const request = {
    displayName: 'Downtime',
    description: 'Window',
    startTime: 100,
    endTime: 200,
    type: 'Notice' as const,
  };

  it('creates, toasts, and hands the saved announcement to onSaved', async () => {
    mockedCreate.mockResolvedValueOnce(announcement());
    const notifySuccess = vi.fn();
    const onSaved = vi.fn();
    await saveSystemAnnouncement({ request, hooks: hooks(), t, notifySuccess, onSaved });
    expect(mockedCreate).toHaveBeenCalledWith(request);
    expect(notifySuccess).toHaveBeenCalledWith(
      'server.create-entity-success:{"entity":"label.announcement"}',
    );
    expect(onSaved).toHaveBeenCalledWith(announcement());
  });

  it('edits with a PATCH of exactly the seven patched keys', async () => {
    const original = announcement();
    mockedPatch.mockResolvedValueOnce(announcement({ displayName: 'Moved' }));
    const onSaved = vi.fn();
    await saveSystemAnnouncement({
      original,
      request: { ...request, displayName: 'Moved', startTime: 150 },
      hooks: hooks(),
      t,
      notifySuccess: vi.fn(),
      onSaved,
    });
    expect(mockedPatch).toHaveBeenCalledWith('a1', [
      { op: 'replace', path: '/displayName', value: 'Moved' },
      { op: 'replace', path: '/startTime', value: 150 },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('sends an empty PATCH for an unchanged edit and still toasts success', async () => {
    const original = announcement();
    mockedPatch.mockResolvedValueOnce(original);
    const notifySuccess = vi.fn();
    const onSaved = vi.fn();
    await saveSystemAnnouncement({
      original,
      request: {
        displayName: 'Downtime',
        description: 'Window',
        startTime: 100,
        endTime: 200,
        type: 'Notice',
      },
      hooks: hooks(),
      t,
      notifySuccess,
      onSaved,
    });
    expect(mockedPatch).toHaveBeenCalledWith('a1', []);
    expect(notifySuccess).toHaveBeenCalledWith(
      'server.update-entity-success:{"entity":"label.announcement"}',
    );
    expect(onSaved).toHaveBeenCalledWith(original);
  });

  it('removes colour and name when an edit leaves Custom', async () => {
    const original = announcement({ type: 'Custom', color: 'pink', customTypeName: 'Outage' });
    mockedPatch.mockResolvedValueOnce(announcement());
    await saveSystemAnnouncement({
      original,
      request: { ...request, type: 'Notice' },
      hooks: hooks(),
      t,
      notifySuccess: vi.fn(),
      onSaved: vi.fn(),
    });
    const ops = mockedPatch.mock.calls[0]?.[1] ?? [];
    expect(ops).toContainEqual({ op: 'remove', path: '/color' });
    expect(ops).toContainEqual({ op: 'remove', path: '/customTypeName' });
    expect(ops).toContainEqual({ op: 'replace', path: '/type', value: 'Notice' });
  });

  it('toasts a PATCH failure (403 on a write is not suppressed)', async () => {
    mockedPatch.mockRejectedValueOnce(new ApiError(403, '', 'forbidden'));
    const searchHooks = hooks();
    const onSaved = vi.fn();
    await saveSystemAnnouncement({
      original: announcement(),
      request,
      hooks: searchHooks,
      t,
      notifySuccess: vi.fn(),
      onSaved,
    });
    expect(searchHooks.notifyError).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('deleteSystemAnnouncement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hard-deletes, toasts, and calls onDeleted', async () => {
    mockedDelete.mockResolvedValueOnce(undefined);
    const notifySuccess = vi.fn();
    const onDeleted = vi.fn();
    await deleteSystemAnnouncement({ id: 'a1', hooks: hooks(), t, notifySuccess, onDeleted });
    expect(mockedDelete).toHaveBeenCalledWith('a1', true);
    expect(notifySuccess).toHaveBeenCalledWith(
      'server.entity-deleted-success:{"entity":"label.announcement"}',
    );
    expect(onDeleted).toHaveBeenCalled();
  });

  it('toasts a delete failure and leaves onDeleted uncalled', async () => {
    mockedDelete.mockRejectedValueOnce(new ApiError(500, '', 'boom'));
    const searchHooks = hooks();
    const onDeleted = vi.fn();
    await deleteSystemAnnouncement({ id: 'a1', hooks: searchHooks, t, notifySuccess: vi.fn(), onDeleted });
    expect(searchHooks.notifyError).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
