<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select } from 'ant-design-vue';
import { LIST_PAGE_SIZE_OPTIONS, type CursorPagingState } from '@/catalog/servicePaging';

/**
 * Cursor/number pagination footer, ported from official
 * components/common/NextPrevious/NextPrevious.tsx (pin a3012259ca).
 * Previous/Next step exactly one page (cursor mode passes the
 * cursor; number mode passes only the page number) plus a
 * "Page X of Y" indicator and a page-size selector. Page-number
 * jumps never occur: pin offers none in either mode. The caller
 * decides visibility via `showPagination` (from useCursorPaging)
 * and renders this footer only when it holds.
 */
const props = withDefaults(
  defineProps<{
    paging: CursorPagingState;
    currentPage: number;
    pageSize: number;
    isNumberBased?: boolean;
    isLoading?: boolean;
    pageSizeOptions?: number[];
  }>(),
  { isNumberBased: false, isLoading: false, pageSizeOptions: () => [...LIST_PAGE_SIZE_OPTIONS] },
);

const emit = defineEmits<{
  'page-change': [params: { currentPage: number; cursorType?: 'after' | 'before' }];
  'page-size-change': [pageSize: number];
}>();

const { t } = useI18n();

/** Pin `computeTotalPages` (utils/PaginationUtils.ts). */
const totalPages = computed(() => Math.ceil(props.paging.total / props.pageSize));
const displayTotalPages = computed(() =>
  props.isNumberBased
    ? totalPages.value
    : Math.max(totalPages.value, props.currentPage + (props.paging.after ? 1 : 0), props.currentPage),
);

const prevDisabled = computed(
  () => props.isLoading || (props.isNumberBased ? props.currentPage === 1 : !props.paging.before),
);
const nextDisabled = computed(
  () =>
    props.isLoading ||
    (props.isNumberBased ? props.currentPage >= totalPages.value : !props.paging.after),
);

function onPrevious(): void {
  if (props.isNumberBased) {
    emit('page-change', { currentPage: props.currentPage - 1 });
  } else {
    emit('page-change', { cursorType: 'before', currentPage: props.currentPage - 1 });
  }
}

function onNext(): void {
  if (props.isNumberBased) {
    emit('page-change', { currentPage: props.currentPage + 1 });
  } else {
    emit('page-change', { cursorType: 'after', currentPage: props.currentPage + 1 });
  }
}
</script>

<template>
  <div
    class="service-children-pagination"
    role="navigation"
    :aria-label="t('serviceDetail.pagination.pages')"
    data-testid="pagination"
  >
    <Button type="text" :disabled="prevDisabled" data-testid="previous" @click="onPrevious">
      <LeftOutlined />
      {{ t('crud.previous') }}
    </Button>
    <span class="service-children-pagination__indicator" data-testid="page-indicator">
      {{ t('serviceDetail.pagination.pageOf', { page: currentPage, pages: displayTotalPages }) }}
    </span>
    <Button type="text" :disabled="nextDisabled" data-testid="next" @click="onNext">
      {{ t('crud.next') }}
      <RightOutlined />
    </Button>
    <Select
      :value="pageSize"
      :options="pageSizeOptions.map((size) => ({ value: size, label: String(size) }))"
      data-testid="page-size-selection-dropdown"
      @change="(value) => emit('page-size-change', Number(value))"
    />
  </div>
</template>

<style scoped>
.service-children-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.service-children-pagination__indicator {
  font-size: 14px;
  color: var(--sm-text-secondary);
}
</style>
