<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { listMetadataTypes } from '@/api/customProperties';
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
import type { MetadataType } from '@/types/collaboration';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const types = ref<MetadataType[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.customProperties.definitions'), key: 'definitions', width: 140 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listMetadataTypes({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    types.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    types.value = [];
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

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('settings.customProperties.title')"
    :lead="t('settings.customProperties.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="types"
    row-key="name"
    table-test-id="admin-custom-property-types-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`custom-property-type-row-${(record as MetadataType).name}`"
          @click.prevent="
            router.push({
              name: 'admin-settings-custom-property-type',
              params: { entityType: (record as MetadataType).name },
            })
          "
        >
          {{ entityLabel(record as MetadataType) }}
        </a>
      </template>
      <template v-else-if="column.key === 'definitions'">
        {{ (record as MetadataType).customProperties.length }}
      </template>
    </template>
  </EntityListShell>
</template>
