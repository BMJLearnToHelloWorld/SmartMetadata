<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckCircleOutlined } from '@ant-design/icons-vue';
import { Table, Tooltip } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getLiveIndexingQueue, type SearchIndexRetryRecord } from '@/api/apps';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { useAuthStore } from '@/stores/auth';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';
import type { AdminApp } from '@/types/admin';
import StatusBadge from './StatusBadge.vue';
import { NO_DATA_PLACEHOLDER, type StatusTypeValue } from './appUtils';

const props = defineProps<{ appData?: AdminApp }>();

const { t } = useI18n();
const authStore = useAuthStore();

/**
 * Official AppLiveIndexing (components/Settings/Applications/
 * AppLiveIndexing.tsx, pin a3012259ca): the search-index retry
 * queue for SearchIndexingApplication, offset-paged with antd
 * pagination (page-size options 10/15/25/50, size changer shown).
 * The initial size comes from the globalPageSize preference
 * (default 15); a size change persists only 15/25/50 and resets to
 * page 1. Status labels are the raw status strings; unknown
 * statuses fall back to Warning.
 */
const STATUS_TYPE_MAP: Record<string, StatusTypeValue> = {
  PENDING: 'warning',
  PENDING_RETRY_1: 'warning',
  PENDING_RETRY_2: 'warning',
  IN_PROGRESS: 'success',
  COMPLETED: 'success',
  FAILED: 'failure',
};

const isLoading = ref(true);
const records = ref<SearchIndexRetryRecord[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(readGlobalPageSize(window.localStorage, authStore.user?.name));

const fqn = computed(() => props.appData?.fullyQualifiedName ?? '');

function retryCellValue(row: Record<string, unknown>, dataIndex: unknown): unknown {
  if (typeof dataIndex !== 'string') {
    return undefined;
  }
  return row[dataIndex];
}

async function fetchRetryQueue(offset = 0): Promise<void> {
  isLoading.value = true;
  try {
    const response = await getLiveIndexingQueue(fqn.value, { limit: pageSize.value, offset });
    records.value = response.data;
    total.value = response.total ?? 0;
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
    records.value = [];
  } finally {
    isLoading.value = false;
  }
}

function handlePageChange(page: number): void {
  currentPage.value = page;
  void fetchRetryQueue((page - 1) * pageSize.value);
}

function handlePageSizeChange(_page: number, size: number): void {
  writeGlobalPageSize(window.localStorage, authStore.user?.name, size);
  pageSize.value = size;
  currentPage.value = 1;
}

watch(pageSize, () => {
  void fetchRetryQueue();
});

onMounted(() => {
  if (fqn.value) {
    void fetchRetryQueue();
  }
});

const columns = computed(() => [
  { title: t('label.entity-type'), dataIndex: 'entityType', key: 'entityType', width: 140 },
  { title: t('label.entity-fqn'), dataIndex: 'entityFqn', key: 'entityFqn', ellipsis: true },
  { title: t('label.status'), dataIndex: 'status', key: 'status', width: 150 },
  { title: t('label.retry-count'), dataIndex: 'retryCount', key: 'retryCount', width: 120 },
  { title: t('label.failure-reason'), dataIndex: 'failureReason', key: 'failureReason', ellipsis: true },
]);
</script>

<template>
  <Table
    :columns="columns"
    :data-source="records"
    :loading="isLoading"
    :pagination="{
      total,
      pageSize,
      current: currentPage,
      showSizeChanger: true,
      pageSizeOptions: ['10', '15', '25', '50'],
      onChange: handlePageChange,
      onShowSizeChange: handlePageSizeChange,
    }"
    :row-key="(record: SearchIndexRetryRecord) => `${record.entityId}-${record.entityFqn}`"
    size="small"
  >
    <template #emptyText>
      <div style="position: relative; min-height: 240px">
        <NoDataPlaceholder :description="t('message.no-retry-queue-records')" :icon="CheckCircleOutlined" />
      </div>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'entityType'">
        {{ record.entityType || NO_DATA_PLACEHOLDER }}
      </template>
      <template v-else-if="column.key === 'entityFqn'">
        <Tooltip :title="record.entityFqn">
          <span
            style="
              display: inline-block;
              max-width: 300px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              vertical-align: bottom;
            "
          >
            {{ record.entityFqn || NO_DATA_PLACEHOLDER }}
          </span>
        </Tooltip>
      </template>
      <template v-else-if="column.key === 'status'">
        <StatusBadge
          data-test-id="retry-status"
          :label="record.status"
          :status="STATUS_TYPE_MAP[record.status] ?? 'warning'"
        />
      </template>
      <template v-else-if="column.key === 'failureReason'">
        <Tooltip :title="record.failureReason">
          <span
            style="
              display: inline-block;
              max-width: 300px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              vertical-align: bottom;
            "
          >
            {{ record.failureReason || NO_DATA_PLACEHOLDER }}
          </span>
        </Tooltip>
      </template>
      <template v-else>
        {{ retryCellValue(record, column.dataIndex) }}
      </template>
    </template>
  </Table>
</template>
