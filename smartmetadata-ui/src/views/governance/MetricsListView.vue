<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import { composeSearchQuery } from '@/catalog/searchQuery';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import {
  canGoNextOffset,
  canGoPrevOffset,
  createOffsetPager,
  entityLabel,
  goNextOffset,
  goPrevOffset,
  resetOffset,
  type OffsetPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { SearchHit } from '@/types/api';
import { useBulkEditScopeStore } from '@/stores/bulkEditScope';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const hits = ref<SearchHit[]>([]);
const total = ref<number | undefined>();
const pager = ref<OffsetPager>(createOffsetPager());
const selectedKeys = ref<string[]>([]);
const scopeStore = useBulkEditScopeStore();

const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  onChange: (keys: unknown) => {
    selectedKeys.value = (keys as string[]).filter((key) => typeof key === 'string');
  },
}));

/**
 * Official MetricListPage handleBulkEdit: navigate to the bulk-edit
 * route with fqn '*' and a scope — the selected metrics, or the listing
 * filters when nothing is selected. The product listing has no search /
 * status filter UI, so the filtered scope carries empty filters, i.e.
 * everything in the listing (official's default for an empty filter set).
 */
function onBulkEdit(): void {
  const selected = hits.value.filter((hit) => selectedKeys.value.includes(hit.fullyQualifiedName));
  if (selected.length > 0) {
    scopeStore.setScope({
      mode: 'selected',
      metricIds: selected.map((hit) => hit.id ?? '').filter(Boolean),
      metricNames: selected.map((hit) => hit.name),
      filters: {},
    });
  } else {
    scopeStore.setScope({ mode: 'filtered', filters: {} });
  }
  void router.push({ name: 'bulk-edit', params: { entityType: 'metric', fqn: '*' } });
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
]);

const hasNext = computed(() => canGoNextOffset(pager.value, hits.value.length, total.value));
const hasPrev = computed(() => canGoPrevOffset(pager.value));

function openMetric(record: SearchHit): void {
  if (!record.entityType || !record.fullyQualifiedName) {
    return;
  }
  // Stage 4: metrics now have a dedicated detail page; other types keep
  // the generic asset route.
  if (record.entityType === 'metric') {
    void router.push({ name: 'governance-metric', params: { fqn: record.fullyQualifiedName } });
    return;
  }
  void router.push(assetLocation(record.entityType, record.fullyQualifiedName));
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await searchAssets(
      composeSearchQuery('', { entityType: ['metric'] }),
      pager.value.from,
      pager.value.size,
    );
    hits.value = result.hits;
    total.value = result.total;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    hits.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

function onRefresh(): void {
  pager.value = resetOffset();
  void load();
}

function onNext(): void {
  pager.value = goNextOffset(pager.value);
  void load();
}

function onPrev(): void {
  pager.value = goPrevOffset(pager.value);
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('metrics.title')"
    :lead="t('metrics.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="hits"
    row-key="fullyQualifiedName"
    table-test-id="metrics-table"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    :empty-text="t('metrics.empty')"
    :row-selection="rowSelection"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => openMetric(record as SearchHit)"
  >
    <template #actions>
      <Button data-testid="metrics-bulk-edit-button" @click="onBulkEdit">
        {{ t('metricBulkEdit.bulkEdit') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`metric-row-${(record as SearchHit).fullyQualifiedName}`"
          @click.prevent="openMetric(record as SearchHit)"
        >
          {{ entityLabel(record as SearchHit) }}
        </a>
      </template>
      <template v-else-if="column.key === 'description'">
        {{ (record as SearchHit).description || '—' }}
      </template>
    </template>
  </EntityListShell>
</template>
