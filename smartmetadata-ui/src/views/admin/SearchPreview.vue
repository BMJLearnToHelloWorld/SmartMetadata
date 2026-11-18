<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official SearchPreview: a debounced search over the current
  edit-state configuration, number-based paging, a ranking-details
  toggle that gates score/explanation/matched-queries, and the
  Restore/Save actions owned by the parent page. Stale responses are
  ignored via a request id, including their error toasts.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { SearchOutlined } from '@ant-design/icons-vue';
import { Button, Input, Spin, Switch, Typography, message } from 'ant-design-vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { useAuthStore } from '@/stores/auth';
import type { SearchSettings } from '@/types/admin';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';
import { ENTITY_PATH_TO_SEARCH_INDEX, PREVIEW_DEBOUNCE_MS } from './searchSettingsConstants';
import { searchPreview, type PreviewSearchHit } from '@/api/search';
import SearchPreviewCard from './SearchPreviewCard.vue';

const props = defineProps<{
  searchConfig: SearchSettings;
  entityType: string;
  disabledSave: boolean;
  isSaving: boolean;
}>();
const emit = defineEmits<{
  restore: [];
  save: [];
}>();
const { t } = useI18n();
const authStore = useAuthStore();

const isLoading = ref(true);
const data = ref<PreviewSearchHit[]>([]);
const searchValue = ref('');
const showRankingDetails = ref(false);
const currentPage = ref(1);
const pageSize = ref(readGlobalPageSize(localStorage, authStore.user?.name));
const total = ref(0);
const latestRequestId = ref(0);

const index = computed(() => ENTITY_PATH_TO_SEARCH_INDEX[props.entityType] ?? props.entityType);
const paging = computed(() => ({ total: total.value }));

async function fetchAssets(options: { page?: number; searchTerm?: string } = {}): Promise<void> {
  const page = options.page ?? currentPage.value;
  const searchTerm = options.searchTerm ?? searchValue.value;
  if (!props.searchConfig || Object.keys(props.searchConfig).length === 0) {
    return;
  }
  const requestId = latestRequestId.value + 1;
  latestRequestId.value = requestId;
  try {
    isLoading.value = true;
    const result = await searchPreview({
      from: (page - 1) * pageSize.value,
      size: pageSize.value,
      index: index.value,
      query: searchTerm,
      queryFilter: '',
      explain: showRankingDetails.value,
      searchSettings: props.searchConfig,
    });
    // Ignore responses from superseded requests so a slow, stale
    // response can never overwrite the latest preview.
    if (requestId !== latestRequestId.value) {
      return;
    }
    total.value = result.total;
    data.value = result.hits;
  } catch (error) {
    if (requestId === latestRequestId.value) {
      message.error(error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed'));
    }
  } finally {
    if (requestId === latestRequestId.value) {
      isLoading.value = false;
    }
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function handleSearch(value: string): void {
  searchValue.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    if (props.searchConfig && Object.keys(props.searchConfig).length > 0) {
      void fetchAssets({ searchTerm: value });
    }
  }, PREVIEW_DEBOUNCE_MS);
}
onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

watch(
  [() => props.searchConfig, currentPage, showRankingDetails],
  () => {
    void fetchAssets({ searchTerm: searchValue.value, page: currentPage.value });
  },
  { immediate: true },
);

function handlePageChange(page: number): void {
  currentPage.value = page;
}

function handlePageSizeChange(size: number): void {
  pageSize.value = size;
  writeGlobalPageSize(localStorage, authStore.user?.name, size);
  currentPage.value = 1;
}
</script>

<template>
  <div class="search-preview">
    <div class="search-preview__header">
      <Typography.Text strong data-testid="search-preview">
        {{ t('settings.searchPrefs.preview') }}
      </Typography.Text>
      <div class="search-preview__actions">
        <span class="search-preview__ranking-control">
          <Typography.Text>{{ t('settings.searchPrefs.rankingDetails') }}</Typography.Text>
          <Switch
            :checked="showRankingDetails"
            :aria-label="t('settings.searchPrefs.rankingDetails')"
            data-testid="ranking-details-switch"
            @update:checked="showRankingDetails = Boolean($event)"
          />
        </span>
        <Button data-testid="restore-defaults-btn" @click="emit('restore')">
          {{ t('settings.searchPrefs.restoreDefaults') }}
        </Button>
        <Button
          data-testid="save-btn"
          :disabled="disabledSave"
          :loading="isSaving"
          @click="emit('save')"
        >
          {{ t('settings.searchPrefs.save') }}
        </Button>
      </div>
    </div>
    <Input
      :value="searchValue"
      :aria-label="t('settings.searchPrefs.searchPlaceholder')"
      :placeholder="t('settings.searchPrefs.searchPlaceholder')"
      data-testid="searchbar"
      @update:value="handleSearch"
    >
      <template #prefix>
        <SearchOutlined />
      </template>
    </Input>
    <div class="search-preview__results">
      <div v-if="isLoading" class="search-preview__loading">
        <Spin />
      </div>
      <div v-else-if="data.length === 0" class="search-preview__empty">
        <NoDataPlaceholder test-id="no-data-placeholder" />
      </div>
      <template v-else>
        <SearchPreviewCard
          v-for="hit in data"
          :key="hit.id"
          :hit="hit"
          :show-ranking-details="showRankingDetails"
        />
        <NextPrevious
          :paging="paging"
          :paging-handler="({ currentPage: page }) => handlePageChange(page)"
          :page-size="pageSize"
          :current-page="currentPage"
          :is-number-based="true"
          :is-loading="isLoading"
          :page-size-options="[15, 25, 50]"
          :on-show-size-change="handlePageSizeChange"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.search-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-preview__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.search-preview__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.search-preview__ranking-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-preview__results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-preview__loading,
.search-preview__empty {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}
</style>
