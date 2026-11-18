<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { DownOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, type MenuProps } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DEFAULT_PAGE_SIZE_OPTIONS,
  displayTotalPages,
  isNextDisabled,
  isPreviousDisabled,
  nextPagingParams,
  previousPagingParams,
  type Paging,
  type PagingHandlerParams,
} from '@/utils/pagination';

/**
 * Cursor/number pagination footer (PAT-PAGING, 00-systemic D7), ported
 * from official `components/common/NextPrevious/NextPrevious.tsx` at pin
 * a3012259ca. Props mirror the official interface: the page-size
 * dropdown renders only when `onShowSizeChange` is passed (opt-in), and
 * the component itself never persists the size — persistence lives with
 * the paging state owner (official `usePaging.handlePageSize`, product
 * `useCursorPagedList` persistence option via the T-5 helper).
 */
const props = withDefaults(
  defineProps<{
    paging: Paging;
    pagingHandler: (data: PagingHandlerParams) => void;
    pageSize: number;
    currentPage?: number;
    isNumberBased?: boolean;
    isLoading?: boolean;
    className?: string;
    pageSizeOptions?: number[];
    onShowSizeChange?: (page: number) => void;
  }>(),
  {
    currentPage: 1,
    isNumberBased: false,
    isLoading: false,
    className: undefined,
    pageSizeOptions: () => [...DEFAULT_PAGE_SIZE_OPTIONS],
    onShowSizeChange: undefined,
  },
);

const { t } = useI18n();

const totalPages = computed(() =>
  displayTotalPages(props.pageSize, props.paging, props.currentPage, props.isNumberBased),
);
const prevDisabled = computed(
  () =>
    props.isLoading ||
    isPreviousDisabled(props.paging, props.currentPage, props.isNumberBased),
);
const nextDisabled = computed(
  () =>
    props.isLoading ||
    isNextDisabled(props.paging, props.currentPage, props.pageSize, props.isNumberBased),
);
const sizeMenuItems = computed<MenuProps['items']>(() =>
  props.pageSizeOptions.map((size) => ({
    key: String(size),
    label: `${size} / ${t('label.page')}`,
  })),
);

function onMenuClick(info: { key: string | number }): void {
  props.onShowSizeChange?.(Number(info.key));
}
</script>

<template>
  <div
    class="next-previous"
    :class="className"
    role="navigation"
    :aria-label="t('label.page-plural')"
    data-testid="pagination"
  >
    <Button
      type="text"
      :disabled="prevDisabled"
      data-testid="previous"
      @click="pagingHandler(previousPagingParams(currentPage, isNumberBased))"
    >
      <LeftOutlined />
      {{ t('label.previous') }}
    </Button>
    <span class="next-previous__indicator" data-testid="page-indicator">
      {{ `${t('label.page')} ${currentPage} ${t('label.of')} ${totalPages}` }}
    </span>
    <Button
      type="text"
      :disabled="nextDisabled"
      data-testid="next"
      @click="pagingHandler(nextPagingParams(currentPage, isNumberBased))"
    >
      {{ t('label.next') }}
      <RightOutlined />
    </Button>
    <Dropdown
      v-if="onShowSizeChange"
      :disabled="isLoading"
      :menu="{ items: sizeMenuItems, onClick: onMenuClick }"
    >
      <Button
        type="text"
        :disabled="isLoading"
        data-testid="page-size-selection-dropdown"
      >
        {{ `${pageSize} / ${t('label.page')}` }}
        <DownOutlined />
      </Button>
    </Dropdown>
  </div>
</template>

<style scoped>
.next-previous {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.next-previous__indicator {
  font-size: 14px;
  color: var(--sm-text-secondary);
}
</style>
