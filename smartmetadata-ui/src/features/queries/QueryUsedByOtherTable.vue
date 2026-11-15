<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <div class="query-used-by" data-testid="query-used-by">
    <!-- Pin: the "Used by" label renders in every state (view, edit,
         empty) — it sits outside the state branches. -->
    <span class="query-used-by__label">{{ t('query.usedByOtherTables') }}:</span>
    <template v-if="isEditMode">
      <Select
        :value="selectedFqns"
        mode="multiple"
        show-search
        :filter-option="false"
        :loading="searching"
        :placeholder="t('query.pleaseSelectUsedIn')"
        :options="tableOptions"
        data-testid="edit-query-used-in"
        @search="onSearchTables"
        @change="onTablesChange"
      />
    </template>
    <template v-else-if="queryUsedIn.length === 0">--</template>
    <template v-else>
      <RouterLink
        v-for="table in visibleTables"
        :key="table.id ?? table.fullyQualifiedName"
        :to="assetLocation('table', table.fullyQualifiedName ?? table.name ?? '')"
      >
        {{ table.displayName || table.name || table.fullyQualifiedName }}
      </RouterLink>
      <Popover v-if="remainingTables.length > 0">
        <template #content>
          <ul class="query-used-by__popover">
            <li v-for="table in remainingTables" :key="table.id ?? table.fullyQualifiedName">
              <RouterLink :to="assetLocation('table', table.fullyQualifiedName ?? table.name ?? '')">
                {{ table.displayName || table.name || table.fullyQualifiedName }}
              </RouterLink>
            </li>
          </ul>
        </template>
        <!-- Pin: "<and> <N> <more>" — the `and`/`more` pieces are separate
             locale keys in the pin, composed here from the fork's keys. -->
        <Button type="link" size="small">
          {{ t('query.and') }} {{ remainingTables.length }} {{ t('query.more') }}
        </Button>
      </Popover>
    </template>
  </div>
</template>

<script setup lang="ts">
import { searchAssets } from '@/api/search';
import { assetLocation } from '@/catalog/entityRoutes';
import { QUERY_FILTER_PAGE_SIZE, QUERY_USED_BY_TABLE_VIEW_CAP } from '@/catalog/queryFilter';
import type { EntityRef } from '@/types/api';
import { Button, Popover, Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  queryUsedIn: EntityRef[];
  isEditMode: boolean;
  /** Edit-mode selection, owned by the parent card. */
  selectedTables: EntityRef[];
}>();

const emit = defineEmits<{
  'update:selectedTables': [tables: EntityRef[]];
}>();

const { t } = useI18n();

const visibleTables = computed(() => props.queryUsedIn.slice(0, QUERY_USED_BY_TABLE_VIEW_CAP));
const remainingTables = computed(() => props.queryUsedIn.slice(QUERY_USED_BY_TABLE_VIEW_CAP));

const selectedFqns = computed(() =>
  props.selectedTables.map((table) => table.fullyQualifiedName ?? table.name ?? ''),
);

// Every ref ever offered as an option, so a selected FQN maps back to
// the full EntityRef (with id) the patch payload needs.
const knownRefs = ref(new Map<string, EntityRef>());
const tableOptions = ref<Array<{ value: string; label: string }>>([]);
const searching = ref(false);

function registerRefs(refs: EntityRef[]): void {
  for (const ref of refs) {
    const fqn = ref.fullyQualifiedName ?? ref.name;
    if (fqn) {
      knownRefs.value.set(fqn, ref);
    }
  }
}

function rebuildOptions(): void {
  const seen = new Set<string>();
  tableOptions.value = [...props.selectedTables, ...knownRefs.value.values()]
    .filter((ref) => {
      const fqn = ref.fullyQualifiedName ?? ref.name ?? '';
      if (!fqn || seen.has(fqn)) {
        return false;
      }
      seen.add(fqn);
      return true;
    })
    .map((ref) => ({
      value: ref.fullyQualifiedName ?? ref.name ?? '',
      label: ref.displayName || ref.name || ref.fullyQualifiedName || '',
    }));
}

async function onSearchTables(searchText: string): Promise<void> {
  searching.value = true;
  try {
    // Pin DataAssetAsyncSelectList loads candidates with an empty search
    // on open, which the pin search hook sends as the bare wildcard `*`;
    // wrapping the empty text (`**`) would be sent verbatim and fail
    // server-side. Non-empty text keeps the `*text*` wildcard wrap.
    const query = searchText ? `*${searchText}*` : '*';
    const page = await searchAssets(query, 0, QUERY_FILTER_PAGE_SIZE, { index: 'table' });
    registerRefs(
      page.hits.map((hit) => ({
        id: hit.id,
        type: 'table',
        name: hit.name,
        displayName: hit.displayName,
        fullyQualifiedName: hit.fullyQualifiedName,
      })),
    );
    rebuildOptions();
  } catch {
    // A failed option search leaves the current options in place.
  } finally {
    searching.value = false;
  }
}

function onTablesChange(value: SelectValue): void {
  const values = (Array.isArray(value) ? value : [value]).flatMap((entry) => {
    const raw =
      typeof entry === 'object' && entry !== null ? (entry as { value?: unknown }).value : entry;
    return typeof raw === 'string' || typeof raw === 'number' ? [String(raw)] : [];
  });
  emit(
    'update:selectedTables',
    values
      .map((fqn) => knownRefs.value.get(fqn))
      .filter((ref): ref is EntityRef => Boolean(ref)),
  );
}

watch(
  () => props.selectedTables,
  () => {
    registerRefs(props.selectedTables);
    rebuildOptions();
  },
  { immediate: true },
);

onMounted(() => {
  if (props.isEditMode) {
    void onSearchTables('');
  }
});
</script>

<style scoped>
.query-used-by {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.query-used-by__label {
  color: var(--sm-color-text-secondary);
}

.query-used-by__popover {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
