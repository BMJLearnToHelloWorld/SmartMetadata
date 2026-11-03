<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import type { EntityListColumn } from '@/features/crud/types';
import { listKnowledgePages } from '@/api/contextCenter';
import type { KnowledgePage } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * Official KnowledgeCenterFilterPage reads the filter identity from the
 * query string (entityId + entityType) and lists the matching knowledge
 * pages; without both params there is nothing to filter on.
 */
const entityType = computed(() => {
  const value = route.query.entityType;
  return Array.isArray(value) ? value[0] : value;
});
const entityId = computed(() => {
  const value = route.query.entityId;
  return Array.isArray(value) ? value[0] : value;
});

const loading = ref(false);
const errorMessage = ref('');
const pages = ref<KnowledgePage[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.name'), dataIndex: 'name', key: 'name' },
  { title: t('contextCenter.pageType'), dataIndex: 'pageType', key: 'pageType' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  if (!entityType.value || !entityId.value) {
    pages.value = [];
    total.value = undefined;
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listKnowledgePages({
      limit: 25,
      entityType: entityType.value,
      entityId: entityId.value,
      after: cursor?.after,
      before: cursor?.before,
    });
    pages.value = result.data;
    total.value = result.total;
    after.value = result.after;
    before.value = result.before;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    pages.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

function openPage(page: KnowledgePage): void {
  void router.push({ name: 'context-center-article', params: { fqn: page.fullyQualifiedName } });
}

watch(
  () => route.query,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="context-center-filter">
    <ContextCenterNav />
    <EntityListShell
      :title="t('contextCenter.filter')"
      :lead="t('contextCenter.filterLead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="
        pages.map((page) => ({
          ...page,
          updatedAt: formatEpoch(page.updatedAt),
        }))
      "
      row-key="id"
      table-test-id="filter-table"
      :total="total"
      :has-next="!!after"
      :has-prev="!!before"
      :empty-text="
        !entityType || !entityId ? t('contextCenter.filterHint') : t('contextCenter.emptyArticles')
      "
      @refresh="load()"
      @next="load({ after: after })"
      @prev="load({ before: before })"
      @view="openPage($event as KnowledgePage)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <Button type="link" @click="openPage(record as KnowledgePage)">
            {{ (record as KnowledgePage).displayName || (record as KnowledgePage).name }}
          </Button>
        </template>
        <template v-else>
          {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
        </template>
      </template>
    </EntityListShell>
  </div>
</template>
