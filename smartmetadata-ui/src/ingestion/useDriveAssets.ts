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
import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { listDriveAssets, type DriveAssetEntityType } from '@/api/driveAssets';
import { SERVICE_CHILDREN_FIELDS } from '@/api/serviceChildren';
import type { ServicePageData } from '@/api/servicePageData';
import { createEmptyPaging } from '@/catalog/servicePaging';
import { useCursorPaging, type UseCursorPagingReturn } from './useCursorPaging';

export interface UseDriveAssetsReturn {
  items: Ref<ServicePageData[]>;
  setItems: (items: ServicePageData[]) => void;
  isLoading: Ref<boolean>;
  setIsLoading: (loading: boolean) => void;
  pagingInfo: UseCursorPagingReturn;
  onPageChange: (params: { cursorType?: 'after' | 'before'; currentPage: number }) => void;
}

/**
 * Pin `useServiceDriveAssets`
 * (components/integration/ConnectionServiceDetailsPage/
 * useServiceDriveAssets.ts) at a3012259ca: the top-level files or
 * spreadsheets of a drive service. The table runs its own search
 * (writing back through `setItems`) and leaves the plain list and
 * its paging to this hook.
 *
 * Only the latest request may write the rows: a slower earlier one
 * (the previous page, the other side of the Deleted switch, a list
 * a search has since replaced) must not overwrite them. A failed
 * list fetch toasts, clears the rows, and resets the paging to the
 * empty page (the hook failure shape, not the classic page's
 * keep-old-rows shape). `showDeleted` arrives as a ref so the
 * page-level toggle re-fetches through the same effect.
 */
export function useDriveAssets(
  entityType: Extract<DriveAssetEntityType, 'file' | 'spreadsheet'>,
  serviceFqn: string,
  showDeleted: Ref<boolean>,
): UseDriveAssetsReturn {
  const { t } = useI18n();
  const route = useRoute();
  const pagingInfo = useCursorPaging();
  const { paging, pageSize, handlePagingChange, handlePageChange, pagingCursor } = pagingInfo;

  const items = ref<ServicePageData[]>([]);
  const isLoading = ref(true);
  const latestRequestRef = ref(0);

  // Each table keeps its search text in a URL param named after its
  // entity type (`?file=` / `?spreadsheet=`), and runs that search
  // itself.
  const searchValue = computed(() => {
    const value = route.query[entityType];
    return typeof value === 'string' && value !== '' ? value : undefined;
  });

  function setItems(next: ServicePageData[]): void {
    items.value = next;
  }

  function setIsLoading(next: boolean): void {
    isLoading.value = next;
  }

  async function fetchItems(cursor?: { after?: string; before?: string }): Promise<void> {
    const requestId = ++latestRequestRef.value;
    const isLatest = (): boolean => requestId === latestRequestRef.value;
    try {
      setIsLoading(true);
      const response = await listDriveAssets(entityType, {
        service: serviceFqn,
        fields: SERVICE_CHILDREN_FIELDS,
        root: true,
        paging: { ...cursor, limit: pageSize.value },
        include: showDeleted.value ? 'deleted' : 'non-deleted',
      });
      if (isLatest()) {
        setItems(response.data);
        handlePagingChange({
          total: response.total ?? 0,
          after: response.after,
          before: response.before,
        });
      }
    } catch (error) {
      if (isLatest()) {
        message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
        setItems([]);
        handlePagingChange(createEmptyPaging());
      }
    } finally {
      if (isLatest()) {
        setIsLoading(false);
      }
    }
  }

  watch(
    [
      searchValue,
      () => pagingCursor.value.cursorType,
      () => pagingCursor.value.cursorValue,
      () => pageSize.value,
      showDeleted,
    ],
    () => {
      if (searchValue.value) {
        // The table's search owns the rows now; a list request still
        // in flight must not land on it.
        latestRequestRef.value += 1;
      } else {
        const { cursorType, cursorValue } = pagingCursor.value;
        void fetchItems(cursorType && cursorValue ? { [cursorType]: cursorValue } : undefined);
      }
    },
    { immediate: true },
  );

  function onPageChange(params: { cursorType?: 'after' | 'before'; currentPage: number }): void {
    if (searchValue.value) {
      handlePageChange(params.currentPage);
    } else if (params.cursorType) {
      handlePageChange(
        params.currentPage,
        { cursorType: params.cursorType, cursorValue: paging.value[params.cursorType] },
        pageSize.value,
      );
    }
  }

  return { items, setItems, isLoading, setIsLoading, pagingInfo, onPageChange };
}
