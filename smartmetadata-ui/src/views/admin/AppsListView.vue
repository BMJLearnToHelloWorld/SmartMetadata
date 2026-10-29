<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listApps } from '@/api/apps';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { AdminApp } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const apps = ref<AdminApp[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('admin.apps.appType'), key: 'appType', width: 140 },
  { title: t('admin.apps.scheduleType'), key: 'scheduleType', width: 140 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listApps({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    apps.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    apps.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
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

function openDetail(app: AdminApp): void {
  void router.push({ name: 'admin-app', params: { id: app.id } });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.apps.title')"
    :lead="t('admin.apps.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="apps"
    table-test-id="admin-apps-table"
    show-row-actions
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => openDetail(record as AdminApp)"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`app-row-${(record as AdminApp).id}`"
          @click.prevent="openDetail(record as AdminApp)"
        >
          {{ entityLabel(record as AdminApp) }}
        </a>
      </template>
      <template v-else-if="column.key === 'appType'">
        {{ (record as AdminApp).appType || '—' }}
      </template>
      <template v-else-if="column.key === 'scheduleType'">
        {{ (record as AdminApp).scheduleType || '—' }}
      </template>
      <template v-else-if="column.key === 'description'">
        {{ (record as AdminApp).description || '—' }}
      </template>
    </template>
  </EntityListShell>
</template>
