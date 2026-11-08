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
import { entityLabel } from '@/features/crud/paging';
import { CUSTOM_PROPERTY_ENTITY_TYPE_SET } from '@/settings/customProperties';
import type { EntityListColumn } from '@/features/crud/types';
import type { MetadataType } from '@/types/collaboration';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const types = ref<MetadataType[]>([]);
const total = ref<number | undefined>();

/**
 * G-D1 (a) pagination semantics (ADR:2026-11-07-custom-properties-s12-hub-allowlist-delete-patch):
 * the server enumerates every entity type, but this page only ever shows
 * the official 26. One fetch with a limit that covers the whole allowlist,
 * paging on only if the server still returns a cursor, then filter
 * client-side; the shown total is the filtered count, never the server
 * total. Cursor paging per page would under-fill the page and misstate
 * the total.
 */
const LIST_FETCH_LIMIT = 100;

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('settings.customProperties.definitions'), key: 'definitions', width: 140 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const all: MetadataType[] = [];
    let after: string | undefined;
    do {
      const page = await listMetadataTypes({ limit: LIST_FETCH_LIMIT, after });
      all.push(...page.data);
      after = page.after;
    } while (after);
    types.value = all.filter((row) => CUSTOM_PROPERTY_ENTITY_TYPE_SET.has(row.name));
    total.value = types.value.length;
  } catch (error) {
    types.value = [];
    total.value = undefined;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onRefresh(): void {
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
    show-row-actions
    :total="total"
    @refresh="onRefresh"
    @view="(record) => router.push({ name: 'admin-settings-custom-property-type', params: { entityType: (record as MetadataType).name } })"
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
