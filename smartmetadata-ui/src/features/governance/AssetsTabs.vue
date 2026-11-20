<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Input, Skeleton, Tag, Typography, message } from 'ant-design-vue';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { searchAssets } from '@/api/search';
import { removeAssetsFromTags } from '@/api/tags';
import { entityTypeColor, hitLocation } from '@/catalog/searchHits';
import {
  buildTagAssetsQuickFilterQuery,
  combineQueryFilters,
  getTagAssetsQueryFilter,
  type TagAssetsQuickFilterSelections,
} from '@/catalog/tagAssets';
import { openSearchHit } from '@/catalog/entityRoutes';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel } from '@/features/crud/paging';
import TagAssetFilters from '@/features/governance/TagAssetFilters.vue';
import { useAuthStore } from '@/stores/auth';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';
import type { SearchFacet } from '@/catalog/searchFacets';
import type { EntityRef, SearchHit } from '@/types/api';

/**
 * Pin AssetsTabs (components/Glossary/GlossaryTerms/tabs/
 * AssetsTabs.component.tsx), TAG subset — the TagPage ASSETS tab
 * (pages/TagPage/TagPage.tsx:632-674).
 *
 * - ES search (`*${value}*`, index ALL) with the tag query filter
 *   (getTagAssetsQueryFilter) merged with the quick-filter query,
 *   numeric NextPrevious paging with the global page size.
 * - First hit auto-selected on every fetch; selection reported via
 *   `asset-click` for the preview panel; a closed summary panel
 *   clears the selection; unmount clears it too (:566-572,
 *   :1167-1186).
 * - Fetch errors are swallowed: previous data stays, loading stops
 *   (:573-576) — no toast, no error surface.
 * - Remove: per-row and bulk (checkboxes + select-all), confirm,
 *   removeAssetsFromTags by the tag id, ES_UPDATE_DELAY wait, then
 *   `remove-asset` so the parent refreshes the count and the list
 *   (:177, :759-842).
 * - Empty states: searching, or a non-zero tab total with zero hits
 *   in the current view, -> NoDataPlaceholder titled
 *   label.no-matching-data-asset; otherwise -> CreatePlaceholder
 *   (title label.no-assets-linked-yet, description
 *   message.link-assets-description with the tag noun, Add Asset
 *   action only when Create is granted) (:896-945).
 *   Intentional deviation from pin, recorded not silent: pin shows
 *   CreatePlaceholder whenever searchValue is empty — so a
 *   quick-filter that matches zero of a non-zero tab total still
 *   shows "no assets linked yet" with an Add button. The lane shows
 *   NoDataPlaceholder there instead: the tab does have linked assets,
 *   the filter just matched none, so "no matching asset" is the
 *   honest state and the Add action would mislead.
 * - The filter bar hides while the tab total is zero (:280-286).
 *
 * Product adaptations, stated not silent:
 * - Rows render in SmTable (benchmark §1: "SmTable 结果行") instead
 *   of pin's ExploreSearchCard list; the card's click-to-preview,
 *   checkbox, and remove menu survive as row click, pick column,
 *   and remove action.
 * - The tag id arrives as a prop: the parent view already loaded
 *   the tag, so pin's by-FQN fetch inside the tab would be a
 *   duplicate GET.
 * - ResizablePanels is not built here: the parent lays this tab out
 *   beside the preview panel in a fixed split (see TagDetailView).
 */
const props = defineProps<{
  entityFqn: string;
  /** Tag id, already loaded by the parent view. */
  tagId?: string;
  permissions: { Create: boolean; EditAll: boolean };
  /** Tab count from the parent's ES count fetch; the list's own total otherwise. */
  assetCount?: number;
  isSummaryPanelOpen: boolean;
}>();

const emit = defineEmits<{
  'add-asset': [];
  'asset-click': [hit: SearchHit | undefined];
  'remove-asset': [];
}>();

const { t, te } = useI18n();
const router = useRouter();

const searchValue = ref('');
const page = ref(1);
const pageSize = ref(readGlobalPageSize(localStorage, useAuthStore().user?.name));
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const facets = ref<SearchFacet[]>([]);
const loading = ref(false);
const removing = ref(false);
const selectedHit = ref<SearchHit | undefined>();
const selectedKeys = ref<Set<string>>(new Set());
const quickFilterSelections = ref<TagAssetsQuickFilterSelections>({});

let fetchSeq = 0;

/** Pin totalAssetCount: the prop seeds it, ES updates it only when the prop is absent. */
const tabTotal = computed(() => props.assetCount ?? total.value);
const showFilterBar = computed(() => tabTotal.value > 0);
/** Pin showCheckboxes: an active entity and the Create grant. */
const showCheckboxes = computed(() => Boolean(props.tagId) && props.permissions.Create);
const canRemove = computed(() => props.permissions.EditAll);

const columns = computed(() => [
  ...(showCheckboxes.value ? [{ title: '', key: 'pick', width: 40 }] : []),
  { title: t('crud.name'), key: 'name' },
  { title: t('crud.type'), key: 'type', width: 140 },
  { title: t('crud.fqn'), key: 'fqn' },
  ...(canRemove.value ? [{ title: '', key: 'actions', width: 90 }] : []),
]);

function entityTypeLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
}

function hitKey(hit: SearchHit): string {
  return hit.fullyQualifiedName || hit.id || hit.name;
}

function selectHit(hit: SearchHit | undefined): void {
  if (selectedHit.value === hit) {
    return;
  }
  selectedHit.value = hit;
  emit('asset-click', hit);
}

async function fetchAssets(): Promise<void> {
  const id = ++fetchSeq;
  loading.value = true;
  try {
    const queryFilter = combineQueryFilters(
      getTagAssetsQueryFilter(props.entityFqn),
      buildTagAssetsQuickFilterQuery(quickFilterSelections.value),
    );
    const result = await searchAssets(
      `*${searchValue.value}*`,
      (page.value - 1) * pageSize.value,
      pageSize.value,
      {
        index: 'all',
        query_filter: queryFilter ? JSON.stringify(queryFilter) : undefined,
      },
    );
    if (id !== fetchSeq) {
      return;
    }
    hits.value = result.hits;
    total.value = result.total ?? 0;
    facets.value = result.facets;
    // Pin auto-selects the first hit on every fetch.
    selectHit(result.hits[0]);
  } catch {
    // Pin swallows fetch errors: previous data stays, loading stops.
  } finally {
    if (id === fetchSeq) {
      loading.value = false;
    }
  }
}

function toggle(hit: SearchHit, checked: boolean): void {
  const next = new Set(selectedKeys.value);
  if (checked) {
    next.add(hitKey(hit));
  } else {
    next.delete(hitKey(hit));
  }
  selectedKeys.value = next;
}

const selectedHits = computed(() => hits.value.filter((hit) => selectedKeys.value.has(hitKey(hit))));

const allSelected = computed(
  () => hits.value.length > 0 && hits.value.every((hit) => selectedKeys.value.has(hitKey(hit))),
);

function toggleAll(checked: boolean): void {
  selectedKeys.value = checked ? new Set(hits.value.map((hit) => hitKey(hit))) : new Set();
}

function toEntityRefs(targets: SearchHit[]): EntityRef[] {
  return targets
    .filter((hit) => hit.id)
    .map((hit) => ({
      id: hit.id as string,
      type: hit.entityType,
      name: hit.name,
      fullyQualifiedName: hit.fullyQualifiedName,
      displayName: hit.displayName,
    }));
}

async function removeHits(targets: SearchHit[]): Promise<void> {
  if (!props.tagId || targets.length === 0 || removing.value) {
    return;
  }
  const name =
    targets.length === 1
      ? entityLabel(targets[0])
      : t('governance.tagAssets.selectedCount', { count: targets.length });
  const confirmed = await confirmDelete({
    title: t('label.remove-entity', { entity: name }),
    content: t('governance.tagAssets.removeConfirm', { name }),
    okText: t('crud.remove'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  removing.value = true;
  try {
    await removeAssetsFromTags(props.tagId, toEntityRefs(targets));
    // Pin ES_UPDATE_DELAY (constants.ts:129, 500ms): ES is eventually
    // consistent, so the list is refreshed after the index catches up.
    await new Promise((resolve) => setTimeout(resolve, 500));
    message.success(t('governance.tagAssets.removeSuccess'));
    selectedKeys.value = new Set();
    emit('remove-asset');
  } catch (error) {
    // Pin calls onRemoveAsset in `finally` even on failure
    // (AssetsTabs.component.tsx:759-842), because its removal can
    // partially apply per entity (socket refusals) and the list must
    // refresh to show the partial state. The product removes with a
    // single PUT: a failure means nothing was applied, so the list
    // already shows the current state and no refresh is emitted.
    message.error(error instanceof Error ? error.message : t('governance.tagAssets.removeFailed'));
  } finally {
    removing.value = false;
  }
}

function openHit(hit: SearchHit): void {
  if (!openSearchHit((to) => router.push(to), hit)) {
    selectHit(hit);
  }
}

function onPageSizeChange(size: number): void {
  pageSize.value = size;
  page.value = 1;
  writeGlobalPageSize(localStorage, useAuthStore().user?.name, size);
}

/** Pin refreshAssets (useImperativeHandle): reset to page one and refetch. */
function refreshAssets(): void {
  page.value = 1;
  void fetchAssets();
}

defineExpose({ refreshAssets });

watch([searchValue, () => props.entityFqn], () => {
  page.value = 1;
  void fetchAssets();
});

watch(
  [page, pageSize, quickFilterSelections],
  () => {
    void fetchAssets();
  },
);

watch(
  () => props.isSummaryPanelOpen,
  (open) => {
    if (!open) {
      selectHit(undefined);
    }
  },
);

onMounted(() => {
  void fetchAssets();
});

onUnmounted(() => {
  emit('asset-click', undefined);
});
</script>

<template>
  <div data-testid="table-container" class="tag-assets-tab">
    <div v-if="showFilterBar" class="tag-assets-tab__filters">
      <Input
        v-model:value="searchValue"
        allow-clear
        :placeholder="t('label.search-entity', { entity: t('label.asset-plural') })"
        data-testid="asset-search"
      />
      <TagAssetFilters v-model="quickFilterSelections" :facets="facets" />
    </div>
    <div v-if="loading" data-testid="loader" class="tag-assets-tab__loader">
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
    </div>
    <template v-else-if="hits.length === 0">
      <NoDataPlaceholder
        v-if="searchValue || tabTotal > 0"
        test-id="no-data-placeholder"
        :title="t('label.no-matching-data-asset')"
      />
      <CreatePlaceholder
        v-else
        :title="t('label.no-assets-linked-yet')"
        :description="t('message.link-assets-description', { entity: t('governance.tagAssets.tagNoun') })"
        :actions="
          permissions.Create
            ? [
                {
                  key: 'add-asset',
                  id: 'data-assets-add-button',
                  testId: 'data-assets-add-button',
                  label: t('label.add-entity', { entity: t('label.asset') }),
                  color: 'primary',
                  onPress: () => emit('add-asset'),
                },
              ]
            : undefined
        "
      />
    </template>
    <template v-else>
      <div v-if="showCheckboxes" class="tag-assets-tab__bulk">
        <Checkbox
          :checked="allSelected"
          data-testid="select-all-assets"
          @change="(e: { target: { checked: boolean } }) => toggleAll(e.target.checked)"
        >
          {{ t('label.select-field', { field: t('label.all-lowercase') }) }}
        </Checkbox>
        <span v-if="selectedKeys.size > 0" class="tag-assets-tab__selected">
          {{ t('governance.tagAssets.selectedCount', { count: selectedKeys.size }) }}
        </span>
        <Button
          v-if="selectedKeys.size > 0 && canRemove"
          danger
          type="primary"
          data-testid="delete-all-button"
          :loading="removing"
          @click="removeHits(selectedHits)"
        >
          {{ t('crud.delete') }}
        </Button>
      </div>
      <SmTable
        row-key="fullyQualifiedName"
        :columns="columns"
        :data-source="hits"
        :loading="loading"
        :pagination="false"
        :custom-row="
          (record) => ({ onClick: () => selectHit(record as SearchHit) })
        "
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'pick'">
            <Checkbox
              :checked="selectedKeys.has(hitKey(record as SearchHit))"
              :disabled="!(record as SearchHit).id"
              @change="(e: { target: { checked: boolean } }) => toggle(record as SearchHit, e.target.checked)"
              @click.stop
            />
          </template>
          <template v-else-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`asset-link-${(record as SearchHit).fullyQualifiedName}`"
              @click.prevent.stop="openHit(record as SearchHit)"
            >
              {{ entityLabel(record as SearchHit) }}
            </a>
          </template>
          <template v-else-if="column.key === 'type'">
            <Tag :color="entityTypeColor((record as SearchHit).entityType)">
              {{ entityTypeLabel((record as SearchHit).entityType) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'fqn'">
            <Typography.Text type="secondary">
              {{ (record as SearchHit).fullyQualifiedName }}
            </Typography.Text>
            <Typography.Text v-if="hitLocation(record as SearchHit)" type="secondary">
              {{ hitLocation(record as SearchHit) }}
            </Typography.Text>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              type="link"
              danger
              :data-testid="`remove-asset-${(record as SearchHit).fullyQualifiedName}`"
              :loading="removing"
              @click.stop="removeHits([record as SearchHit])"
            >
              {{ t('crud.remove') }}
            </Button>
          </template>
        </template>
      </SmTable>
      <NextPrevious
        :paging="{ total }"
        :paging-handler="({ currentPage }) => { page = currentPage; }"
        :page-size="pageSize"
        :current-page="page"
        :is-number-based="true"
        :is-loading="loading"
        :on-show-size-change="onPageSizeChange"
      />
    </template>
  </div>
</template>

<style scoped>
.tag-assets-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.tag-assets-tab__filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-assets-tab__loader {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tag-assets-tab__bulk {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tag-assets-tab__selected {
  color: var(--sm-text-secondary);
}
</style>
