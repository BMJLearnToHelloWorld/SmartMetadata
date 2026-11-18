/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch } from 'vue';
import { diffJsonPatch } from '@/admin/jsonPatch';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  patchAnnouncement,
} from '@/api/announcements';
import type { Announcement, AnnouncementType, CreateAnnouncementRequest } from '@/types/collaboration';
import {
  pickPatchedAnnouncement,
  searchSystemAnnouncements,
  SYSTEM_ANNOUNCEMENT_FETCH_LIMIT,
  SYSTEM_ANNOUNCEMENT_PAGE_SIZES,
  type AnnouncementStatusValue,
} from '@/utils/notifications/announcementUtils';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import { reportErrorToast } from '@/utils/notifications/alertSourceSearch';
import type { TranslateFn } from '@/utils/notifications/alertUtils';

export interface SystemAnnouncementFilters {
  search: string;
  status?: AnnouncementStatusValue;
  type?: AnnouncementType;
}

const EMPTY_FILTERS: SystemAnnouncementFilters = { search: '' };

/**
 * Pin `useSystemAnnouncementsList` (useSystemAnnouncements.ts): status
 * and type filter on the server; the title search, the newest-first
 * order and the paging run here, over every matching announcement
 * fetched in one request. Rows stay on screen while a filter change
 * loads (pin's `keepPreviousData`): the loading flag only covers the
 * first load. A delete or a narrower search can leave the page past
 * the end, so the current page clamps to the page count. Any change
 * to what is listed starts again from the first page.
 */
export function useSystemAnnouncementsList() {
  const filters = ref<SystemAnnouncementFilters>({ ...EMPTY_FILTERS });
  const pageSize = ref(SYSTEM_ANNOUNCEMENT_PAGE_SIZES[0]);
  const page = ref(1);
  const items = ref<Announcement[]>([]);
  const isFetching = ref(false);
  const hasLoadedOnce = ref(false);
  const isError = ref(false);
  let fetchId = 0;

  async function fetchList(): Promise<void> {
    const id = ++fetchId;
    isFetching.value = true;
    isError.value = false;
    try {
      const result = await listAnnouncements({
        system: true,
        status: filters.value.status,
        type: filters.value.type,
        limit: SYSTEM_ANNOUNCEMENT_FETCH_LIMIT,
      });
      if (id !== fetchId) {
        return;
      }
      items.value = result.data;
      hasLoadedOnce.value = true;
    } catch {
      if (id !== fetchId) {
        return;
      }
      isError.value = true;
    } finally {
      if (id === fetchId) {
        isFetching.value = false;
      }
    }
  }

  watch(
    [() => filters.value.status, () => filters.value.type],
    () => {
      void fetchList();
    },
    { immediate: true },
  );

  const matching = computed(() => searchSystemAnnouncements(items.value, filters.value.search));
  const pageCount = computed(() => Math.max(1, Math.ceil(matching.value.length / pageSize.value)));
  const currentPage = computed(() => Math.min(page.value, pageCount.value));
  const announcements = computed(() =>
    matching.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
  );

  function updateFilters(patch: Partial<SystemAnnouncementFilters>): void {
    filters.value = { ...filters.value, ...patch };
    page.value = 1;
  }

  function clearFilters(): void {
    filters.value = { ...EMPTY_FILTERS };
    page.value = 1;
  }

  function goToPage(next: number): void {
    page.value = Math.min(Math.max(next, 1), pageCount.value);
  }

  function setPageSize(size: number): void {
    pageSize.value = size;
    page.value = 1;
  }

  return {
    announcements,
    filters,
    hasFilters: computed(() =>
      Boolean(filters.value.search.trim() || filters.value.status || filters.value.type),
    ),
    isError,
    isLoading: computed(() => isFetching.value && !hasLoadedOnce.value),
    page: currentPage,
    pageCount,
    pageSize,
    total: computed(() => matching.value.length),
    clearFilters,
    goToPage,
    refetch: fetchList,
    setPageSize,
    updateFilters,
  };
}

export type SystemAnnouncementsListState = ReturnType<typeof useSystemAnnouncementsList>;

/** One announcement, for the edit and duplicate forms. */
export function useSystemAnnouncement(options: {
  id: () => string | undefined;
  needsSource: () => boolean;
}) {
  const data = ref<Announcement | undefined>(undefined);
  const isError = ref(false);
  const isLoading = ref(false);
  let fetchId = 0;

  watch(
    [() => options.id(), () => options.needsSource()],
    async ([id, needsSource]) => {
      const runId = ++fetchId;
      if (!needsSource || !id) {
        data.value = undefined;
        isError.value = false;
        isLoading.value = false;
        return;
      }
      isLoading.value = true;
      isError.value = false;
      try {
        const fetched = await getAnnouncementById(id);
        if (runId === fetchId) {
          data.value = fetched;
        }
      } catch {
        if (runId === fetchId) {
          isError.value = true;
        }
      } finally {
        if (runId === fetchId) {
          isLoading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return { data, isError, isLoading };
}

/**
 * Pin `useSaveSystemAnnouncement`: edit PATCHes the diff of exactly the
 * seven patched keys — an empty diff still sends a PATCH with empty
 * ops and still toasts success — while create and duplicate POST.
 * No `entityLink`: that is what makes the announcement system-wide.
 */
export async function saveSystemAnnouncement(args: {
  original?: Announcement;
  request: Omit<CreateAnnouncementRequest, 'entityLink'>;
  hooks: AlertSearchHooks;
  t: TranslateFn;
  notifySuccess: (message: string) => void;
  onSaved: (announcement: Announcement) => void;
}): Promise<void> {
  const { original, request, hooks, t, notifySuccess, onSaved } = args;
  try {
    const saved = original
      ? await patchAnnouncement(
          original.id,
          diffJsonPatch(
            pickPatchedAnnouncement(original as unknown as Record<string, unknown>),
            pickPatchedAnnouncement(request as unknown as Record<string, unknown>),
          ),
        )
      : await createAnnouncement(request);
    notifySuccess(
      t(original ? 'server.update-entity-success' : 'server.create-entity-success', {
        entity: t('label.announcement'),
      }),
    );
    onSaved(saved);
  } catch (error) {
    reportErrorToast(error, hooks, { method: original ? 'PATCH' : 'POST' });
  }
}

/** Pin `useDeleteSystemAnnouncement`: hard delete, then refresh the list. */
export async function deleteSystemAnnouncement(args: {
  id: string;
  hooks: AlertSearchHooks;
  t: TranslateFn;
  notifySuccess: (message: string) => void;
  onDeleted: () => void;
}): Promise<void> {
  const { id, hooks, t, notifySuccess, onDeleted } = args;
  try {
    await deleteAnnouncement(id, true);
    notifySuccess(t('server.entity-deleted-success', { entity: t('label.announcement') }));
    onDeleted();
  } catch (error) {
    reportErrorToast(error, hooks, { method: 'DELETE' });
  }
}
