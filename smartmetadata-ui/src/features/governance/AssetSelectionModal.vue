<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Input, Tag, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { searchAssets } from '@/api/search';
import { addAssetsToTags, getTagByFqn } from '@/api/tags';
import {
  buildTagAssetsQuickFilterQuery,
  combineQueryFilters,
  type TagAssetsQueryFilter,
  type TagAssetsQuickFilterSelections,
} from '@/catalog/tagAssets';
import { entityTypeColor } from '@/catalog/searchHits';
import { entityLabel } from '@/features/crud/paging';
import TagAssetFilters from '@/features/governance/TagAssetFilters.vue';
import type { SearchFacet } from '@/catalog/searchFacets';
import type { EntityRef, SearchHit } from '@/types/api';

/**
 * Pin AssetSelectionModal (components/DataAssets/AssetsSelectionModal/
 * AssetSelectionModal.tsx + useAssetSelectionState.ts), TAG subset —
 * the TagPage add-assets modal (pages/TagPage/TagPage.tsx:982-991).
 *
 * - Search (index ALL, page size 25 = PAGE_SIZE_MEDIUM) with the
 *   parent queryFilter merged with the quick-filter query; the
 *   queryFilter excludes already-tagged assets and the entity types
 *   the viewer cannot EditTags on.
 * - Checkbox multi-select; save calls addAssetsToTags with the
 *   tag id resolved by getTagByFqn, waits for the ES index to catch
 *   up (pin ES_UPDATE_DELAY, constants.ts:129, 500ms — same wait as
 *   the remove path in AssetsTabs.vue), then emits `save` so the
 *   parent refreshes the count and the list.
 * - Quick filters: the same seven TAG fields as the tab.
 *
 * Product adaptations, stated not silent:
 * - The parent passes the queryFilter as the serialized JSON string
 *   the product search surface requires (apiRequest only carries
 *   string query values); it is parsed back before merging.
 * - Paging is NextPrevious instead of pin's infinite scroll: same
 *   page size, same candidate set, explicit page control.
 */
const props = defineProps<{
  entityFqn: string;
  open: boolean;
  /** Serialized query_filter JSON (see getQueryFilterToExcludeTermsAndEntities). */
  queryFilter?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [];
}>();

/** Pin PAGE_SIZE_MEDIUM (constants.ts:61). */
const PAGE_SIZE = 25;

const { t, te } = useI18n();
const search = ref('');
const page = ref(1);
const items = ref<SearchHit[]>([]);
const totalCount = ref(0);
const facets = ref<SearchFacet[]>([]);
const loading = ref(false);
const searchError = ref('');
const tagId = ref<string | undefined>();
const saving = ref(false);
const selected = ref<Set<string>>(new Set());
const quickFilterSelections = ref<TagAssetsQuickFilterSelections>({});

let fetchSeq = 0;

const columns = computed(() => [
  { title: '', key: 'pick', width: 40 },
  { title: t('crud.name'), key: 'name' },
  { title: t('crud.type'), key: 'type', width: 140 },
  { title: t('crud.fqn'), key: 'fqn' },
]);

function entityTypeLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function hitKey(hit: SearchHit): string {
  return hit.fullyQualifiedName || hit.id || hit.name;
}

function parseQueryFilter(raw: string | undefined): TagAssetsQueryFilter | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as TagAssetsQueryFilter;
  } catch {
    return undefined;
  }
}

async function fetchEntities(): Promise<void> {
  // Same fetchSeq guard as AssetsTabs.vue: a slow earlier response
  // must not overwrite a newer one (fast consecutive filters / pages).
  const id = ++fetchSeq;
  loading.value = true;
  searchError.value = '';
  try {
    const queryFilter = combineQueryFilters(
      parseQueryFilter(props.queryFilter),
      buildTagAssetsQuickFilterQuery(quickFilterSelections.value),
    );
    const result = await searchAssets(search.value, (page.value - 1) * PAGE_SIZE, PAGE_SIZE, {
      index: 'all',
      query_filter: queryFilter ? JSON.stringify(queryFilter) : undefined,
    });
    if (id !== fetchSeq) {
      return;
    }
    items.value = result.hits;
    totalCount.value = result.total ?? 0;
    facets.value = result.facets;
  } catch (error) {
    if (id !== fetchSeq) {
      return;
    }
    items.value = [];
    searchError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    if (id === fetchSeq) {
      loading.value = false;
    }
  }
}

async function fetchCurrentEntity(): Promise<void> {
  try {
    tagId.value = (await getTagByFqn(props.entityFqn)).id;
  } catch (error) {
    tagId.value = undefined;
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function toggle(hit: SearchHit, checked: boolean): void {
  const next = new Set(selected.value);
  if (checked) {
    next.add(hitKey(hit));
  } else {
    next.delete(hitKey(hit));
  }
  selected.value = next;
}

async function onSave(): Promise<void> {
  const chosen = items.value.filter((hit) => selected.value.has(hitKey(hit)));
  if (!chosen.length) {
    message.warning(t('governance.assets.pickAtLeastOne'));
    return;
  }
  if (!tagId.value) {
    message.error(t('crud.loadFailed'));
    return;
  }
  saving.value = true;
  try {
    const refs: EntityRef[] = chosen
      .filter((hit) => hit.id)
      .map((hit) => ({
        id: hit.id as string,
        type: hit.entityType,
        name: hit.name,
        fullyQualifiedName: hit.fullyQualifiedName,
        displayName: hit.displayName,
      }));
    await addAssetsToTags(tagId.value, refs);
    // Pin ES_UPDATE_DELAY (constants.ts:129, 500ms): ES is eventually
    // consistent, so the parent refresh happens after the index catches
    // up — emitting immediately would re-fetch the old count/list.
    await new Promise((resolve) => setTimeout(resolve, 500));
    emit('save');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  search.value = '';
  items.value = [];
  selected.value = new Set();
  emit('cancel');
}

watch([page, quickFilterSelections], () => {
  void fetchEntities();
});

watch(search, () => {
  // Pin useAssetSelectionState: the fetch effect depends on `search`,
  // so every keystroke refetches (input-immediate, same as the tab
  // side) — no Enter / search-button submit needed.
  page.value = 1;
  void fetchEntities();
});

onMounted(() => {
  void fetchCurrentEntity();
  void fetchEntities();
});
</script>

<template>
  <FormModal
    :open="open"
    :title="t('label.add-entity', { entity: t('label.asset-plural') })"
    :ok-text="t('crud.add')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    :ok-disabled="selected.size === 0 || !tagId"
    test-id="asset-selection-modal"
    @ok="onSave"
    @cancel="onCancel"
  >
    <Input.Search
      v-model:value="search"
      data-testid="asset-selection-search"
      :placeholder="t('governance.assets.searchPlaceholder')"
      :loading="loading"
    />
    <TagAssetFilters v-model="quickFilterSelections" :facets="facets" />
    <Typography.Text v-if="searchError" type="danger" data-testid="asset-selection-error">
      {{ searchError }}
    </Typography.Text>
    <SmTable
      row-key="fullyQualifiedName"
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pick'">
          <Checkbox
            :checked="selected.has(hitKey(record as SearchHit))"
            :disabled="!(record as SearchHit).id"
            @change="(e: { target: { checked: boolean } }) => toggle(record as SearchHit, e.target.checked)"
          />
        </template>
        <template v-else-if="column.key === 'name'">
          {{ entityLabel(record as SearchHit) }}
        </template>
        <template v-else-if="column.key === 'type'">
          <Tag :color="entityTypeColor((record as SearchHit).entityType)">
            {{ entityTypeLabel((record as SearchHit).entityType) }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'fqn'">
          {{ (record as SearchHit).fullyQualifiedName }}
        </template>
      </template>
    </SmTable>
    <NextPrevious
      v-if="totalCount > PAGE_SIZE"
      :paging="{ total: totalCount }"
      :paging-handler="({ currentPage }) => { page = currentPage; }"
      :page-size="PAGE_SIZE"
      :current-page="page"
      :is-number-based="true"
      :is-loading="loading"
    />
    <Typography.Paragraph v-if="!items.length && !loading" type="secondary">
      {{ t('governance.assets.searchHint') }}
    </Typography.Paragraph>
  </FormModal>
</template>
