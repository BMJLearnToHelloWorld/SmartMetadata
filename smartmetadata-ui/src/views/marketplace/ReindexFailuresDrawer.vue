<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Drawer, Select, Table, Tooltip, Typography } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RDF_INDEX_APP_NAME } from '@/api/apps';
import { getReindexFailures, type SearchIndexFailureRecord } from '@/api/search';
import { getRdfReindexFailures, type RdfIndexFailureRecord } from '@/api/sparql';
import { formatDateTimeWithTimezone } from './appUtils';
import ReindexErrorMessage from './ReindexErrorMessage.vue';

const props = defineProps<{
  visible: boolean;
  appName?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/**
 * Official ReindexFailures (components/Settings/Applications/
 * ReindexFailures.component.tsx, pin a3012259ca): a 900px dismissable
 * drawer listing reindex failures, page size fixed at 20 with no
 * size changer, the entity-type filter options harvested from the
 * first unfiltered page, and a request sequence number invalidating
 * stale responses. The RDF app fetches from the RDF endpoint, every
 * other app from the search endpoint. The shared SmDrawer has no
 * 900px width key, so the drawer is an antd Drawer directly.
 */
const PAGE_SIZE = 20;
const ALL_ENTITY_TYPES_KEY = '__all__';

type FailureRecord = SearchIndexFailureRecord | RdfIndexFailureRecord;

function failureCellValue(row: Record<string, unknown>, dataIndex: unknown): unknown {
  if (typeof dataIndex !== 'string') {
    return undefined;
  }
  return row[dataIndex];
}

const loading = ref(false);
const data = ref<FailureRecord[]>([]);
const total = ref(0);
const currentPage = ref(1);
const entityTypeFilter = ref<string | undefined>(undefined);
const entityTypes = ref<string[]>([]);
const requestSequence = ref(0);

async function fetchFailures(page: number, entityType?: string): Promise<void> {
  const requestId = ++requestSequence.value;
  loading.value = true;
  try {
    const response =
      props.appName === RDF_INDEX_APP_NAME
        ? await getRdfReindexFailures({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, entityType })
        : await getReindexFailures({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, entityType });
    if (requestId !== requestSequence.value) {
      return;
    }
    data.value = response.data;
    total.value = response.total;
    if (page === 1 && !entityType && response.data.length > 0) {
      entityTypes.value = [...new Set(response.data.map((record) => record.entityType))];
    }
  } catch (error) {
    if (requestId === requestSequence.value) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  } finally {
    if (requestId === requestSequence.value) {
      loading.value = false;
    }
  }
}

watch(
  () => props.visible,
  (visible) => {
    requestSequence.value++;
    if (visible) {
      currentPage.value = 1;
      entityTypeFilter.value = undefined;
      entityTypes.value = [];
      data.value = [];
      total.value = 0;
      void fetchFailures(1);
    }
  },
  { immediate: true },
);

function handlePageChange(page: number): void {
  currentPage.value = page;
  void fetchFailures(page, entityTypeFilter.value);
}

function handleEntityTypeChange(value: string): void {
  const filter = value !== ALL_ENTITY_TYPES_KEY ? value : undefined;
  entityTypeFilter.value = filter;
  currentPage.value = 1;
  void fetchFailures(1, filter);
}

const entityTypeOptions = computed(() => [
  { value: ALL_ENTITY_TYPES_KEY, label: t('label.all') },
  ...entityTypes.value.map((type) => ({ value: type, label: type })),
]);

const columns = computed(() => [
  { title: t('label.entity-type'), dataIndex: 'entityType', key: 'entityType', width: 120 },
  {
    title: t('label.entity-id', { entity: t('label.entity') }),
    dataIndex: 'entityId',
    key: 'entityId',
    width: 150,
    ellipsis: true,
  },
  { title: t('label.stage'), dataIndex: 'failureStage', key: 'failureStage', width: 100 },
  { title: t('label.error'), dataIndex: 'errorMessage', key: 'errorMessage', width: 400 },
  { title: t('label.timestamp'), dataIndex: 'timestamp', key: 'timestamp', width: 180 },
]);

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Copy failure is silent in pin's CopyToClipboardButton path too.
  }
}
</script>

<template>
  <Drawer
    :open="visible"
    :title="t('label.reindex-failure-plural')"
    width="900"
    @close="emit('close')"
  >
    <div data-testid="reindex-failures-drawer">
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px">
        <div style="display: flex; align-items: center; gap: 8px">
          <span>{{ t('label.filter-by-entity-type') }}:</span>
          <Select
            :aria-label="t('label.filter-by-entity-type')"
            :options="entityTypeOptions"
            style="width: 200px"
            :value="entityTypeFilter ?? ALL_ENTITY_TYPES_KEY"
            @change="(value) => handleEntityTypeChange(String(value))"
          />
        </div>
        <Typography.Text v-if="total > 0" type="secondary">
          {{ t('label.showing-total-failure-plural', { total }) }}
        </Typography.Text>
      </div>

      <Table
        :columns="columns"
        :data-source="data"
        :loading="loading"
        :pagination="{
          current: currentPage,
          pageSize: PAGE_SIZE,
          showSizeChanger: false,
          total,
        }"
        row-key="id"
        :scroll="{ x: 950 }"
        size="small"
        @change="(pagination) => handlePageChange(pagination.current ?? 1)"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'entityId'">
            <span style="display: inline-flex; align-items: center; gap: 4px">
              {{ record.entityId || '-' }}
              <Button v-if="record.entityId" size="small" type="text" @click="copyText(record.entityId)">
                {{ t('label.copy') }}
              </Button>
            </span>
          </template>
          <template v-else-if="column.key === 'failureStage'">
            {{ record.failureStage || '-' }}
          </template>
          <template v-else-if="column.key === 'errorMessage'">
            <Tooltip v-if="record.errorMessage" placement="topLeft">
              <template #title>
                <pre style="margin: 0; white-space: pre-wrap">{{ record.errorMessage }}</pre>
              </template>
              <span style="display: inline-flex; align-items: flex-start; gap: 4px">
                <ReindexErrorMessage :text="record.errorMessage" />
                <Button size="small" type="text" @click="copyText(record.errorMessage)">
                  {{ t('label.copy') }}
                </Button>
              </span>
            </Tooltip>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'timestamp'">
            {{ formatDateTimeWithTimezone(record.timestamp) }}
          </template>
          <template v-else>
            {{ failureCellValue(record, column.dataIndex) }}
          </template>
        </template>
      </Table>
    </div>
  </Drawer>
</template>
