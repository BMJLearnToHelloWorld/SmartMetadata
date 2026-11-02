<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Select } from 'ant-design-vue';
import { listAuditLogs, type AuditLogEntry } from '@/api/auditLogs';
import {
  AUDIT_LOG_ACTORS,
  AUDIT_LOG_TIME_PRESETS,
  EMPTY_AUDIT_LOG_FILTERS,
  auditLogQuery,
  type AuditLogFilters,
} from '@/catalog/auditLogFilters';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const logs = ref<AuditLogEntry[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const filters = reactive<AuditLogFilters>({ ...EMPTY_AUDIT_LOG_FILTERS });

const columns = computed<EntityListColumn[]>(() => [
  { title: t('admin.auditLogs.when'), key: 'when', width: 180 },
  { title: t('admin.auditLogs.eventType'), dataIndex: 'eventType', key: 'eventType', width: 120 },
  { title: t('admin.auditLogs.user'), dataIndex: 'userName', key: 'userName', width: 160 },
  { title: t('admin.auditLogs.actor'), dataIndex: 'actorType', key: 'actorType', width: 100 },
  { title: t('admin.auditLogs.entityType'), dataIndex: 'entityType', key: 'entityType', width: 140 },
  { title: t('admin.auditLogs.entity'), key: 'entity' },
  { title: t('admin.auditLogs.summary'), key: 'summary' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

function formatTime(value?: number): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listAuditLogs({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      ...auditLogQuery(filters),
    });
    logs.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    logs.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onApply(): void {
  cursor.value = resetCursor();
  void load();
}

function onClear(): void {
  Object.assign(filters, EMPTY_AUDIT_LOG_FILTERS);
  cursor.value = resetCursor();
  void load();
}

function onNext(): void {
  if (!pageAfter.value) {
    return;
  }
  cursor.value = goNext(cursor.value, pageAfter.value);
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function onRefresh(): void {
  cursor.value = resetCursor();
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.auditLogs.title')"
    :lead="t('admin.auditLogs.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="logs"
    table-test-id="audit-logs-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
  >
    <template #filters>
      <Select
        v-model:value="filters.timePreset"
        data-testid="audit-time"
        style="width: 160px"
        @change="onApply"
      >
        <Select.Option v-for="row in AUDIT_LOG_TIME_PRESETS" :key="row.key" :value="row.key">
          {{ t(row.labelKey) }}
        </Select.Option>
      </Select>
      <Input
        v-model:value="filters.userName"
        :placeholder="t('admin.auditLogs.user')"
        data-testid="audit-user"
        style="width: 160px"
        @press-enter="onApply"
      />
      <Select
        v-model:value="filters.actorType"
        allow-clear
        :placeholder="t('admin.auditLogs.actor')"
        data-testid="audit-actor"
        style="width: 120px"
        @change="onApply"
      >
        <Select.Option v-for="row in AUDIT_LOG_ACTORS" :key="row.key" :value="row.key">
          {{ t(row.labelKey) }}
        </Select.Option>
      </Select>
      <Input
        v-model:value="filters.entityType"
        :placeholder="t('admin.auditLogs.entityType')"
        data-testid="audit-entity-type"
        style="width: 160px"
        @press-enter="onApply"
      />
      <Input
        v-model:value="filters.eventType"
        :placeholder="t('admin.auditLogs.eventType')"
        data-testid="audit-event-type"
        style="width: 140px"
        @press-enter="onApply"
      />
      <Input
        v-model:value="filters.q"
        :placeholder="t('crud.searchPlaceholder')"
        data-testid="audit-search"
        style="width: 200px"
        @press-enter="onApply"
      />
      <Button data-testid="audit-apply" @click="onApply">{{ t('crud.apply') }}</Button>
      <Button data-testid="audit-clear" @click="onClear">{{ t('crud.clear') }}</Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'when'">
        {{ formatTime((record as AuditLogEntry).eventTs ?? (record as AuditLogEntry).createdAt) }}
      </template>
      <template v-else-if="column.key === 'entity'">
        {{ (record as AuditLogEntry).entityFQN || (record as AuditLogEntry).entityId || '—' }}
      </template>
      <template v-else-if="column.key === 'summary'">
        {{ (record as AuditLogEntry).summary || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Alert
    type="info"
    show-icon
    style="margin-top: 16px"
    :message="t('admin.auditLogs.exportResidual')"
    data-testid="audit-export-residual"
  />
</template>
