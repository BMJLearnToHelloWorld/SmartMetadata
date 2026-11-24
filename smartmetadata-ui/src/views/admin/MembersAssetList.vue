<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Input, Skeleton, Space, Tag, Typography } from 'ant-design-vue';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { assetLocation, isDetailWired, parentTableLocation } from '@/catalog/entityRoutes';
import { entityTypeColor, hitLocation } from '@/catalog/searchHits';
import { getUsagePercentile } from '@/catalog/usagePercentile';
import { searchAssets } from '@/api/search';
import { useAuthStore } from '@/stores/auth';
import type { SearchHit } from '@/types/api';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';

/**
 * Single asset-list equivalent for the three Members surfaces that
 * render pin AssetsTabs (team Assets tab, user My Data, user
 * Following). One implementation, never two (02 draft §7).
 *
 * Pin contract (AssetsTabs.component.tsx, 1298 lines; only the
 * TEAM / MY_DATA / FOLLOWING subset applies here):
 * - search index ALL, query `*${value}*`, immediate search (SearchBar
 *   default typingInterval 0), queryFilter merged in (:543-560);
 * - numeric NextPrevious paging with the global page size (:1013-1023);
 * - first hit auto-selected on every fetch, selection reported via
 *   onAssetClick; a closed summary panel clears the selection
 *   (:566-572, :1167-1177);
 * - fetch errors are swallowed: previous data stays, loading stops
 *   (:573-576) — no toast, no error surface;
 * - empty states: searching -> NoDataPlaceholder titled
 *   label.no-matching-data-asset, EXCEPT my-data which keeps the
 *   object message server.no-records-found; not searching -> team
 *   renders CreatePlaceholder (title label.no-assets-linked-yet,
 *   description message.link-assets-description with the team noun,
 *   Add Asset action only when Create is granted), user tabs render
 *   NoDataPlaceholder titled server.no-records-found (:896-945).
 * - no remove UI: TEAM / MY_DATA / FOLLOWING are not in the removable
 *   set (:440-449); no select-all header: no activeEntity fetch for
 *   these types.
 *
 * DRAFT-VS-SOURCE DISCREPANCY (flagged in the batch report): the 02
 * draft (§2.5/§4.2) claims the team empty text is
 * message.adding-new-asset-to-team. That string is only the VALUE of
 * the noDataPlaceholder prop at the call site (TeamDetailsV1:832);
 * AssetsTabs renders the string form through the CreatePlaceholder
 * branch above and never renders the string itself. This component
 * follows the source.
 *
 * Residual: the aggregation-driven quick-filter bar (AssetsFilterBar
 * + ExploreQuickFilters + getQuickFilterQuery) is not ported; search,
 * paging, preview selection and empty states land.
 */

const props = defineProps<{
  /** Serialized query_filter JSON (the membersSearchFilters builders return strings). */
  queryFilter: string;
  assetKind: 'team' | 'my-data' | 'following';
  canCreate: boolean;
  summaryPanelOpen: boolean;
}>();

const emit = defineEmits<{
  'asset-click': [hit: SearchHit | undefined];
  'add-asset': [];
}>();

const { t, te } = useI18n();
const router = useRouter();

const searchValue = ref('');
const page = ref(1);
const pageSize = ref(readGlobalPageSize(localStorage, useAuthStore().user?.name));
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const loading = ref(false);
const selectedHit = ref<SearchHit | undefined>();

let fetchSeq = 0;

function entityLabel(entityType: string): string {
  const key = `explore.entity.${entityType}`;
  return te(key) ? t(key) : entityType;
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
    const result = await searchAssets(`*${searchValue.value}*`, (page.value - 1) * pageSize.value, pageSize.value, {
      index: 'all',
      query_filter: props.queryFilter,
    });
    if (id !== fetchSeq) {
      return;
    }
    hits.value = result.hits;
    total.value = result.total ?? 0;
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

watch(
  [searchValue, page, pageSize, () => props.queryFilter],
  () => {
    void fetchAssets();
  },
);

watch(
  () => props.summaryPanelOpen,
  (open) => {
    if (!open) {
      selectHit(undefined);
    }
  },
);

onMounted(() => {
  void fetchAssets();
});

function onPageSizeChange(size: number): void {
  pageSize.value = size;
  page.value = 1;
  writeGlobalPageSize(localStorage, useAuthStore().user?.name, size);
}

function hitKey(hit: SearchHit, index: number): string {
  return hit.fullyQualifiedName || hit.id || `${hit.entityType}-${index}`;
}

function isSelected(hit: SearchHit): boolean {
  const key = hit.fullyQualifiedName || hit.name;
  return selectedHit.value ? (selectedHit.value.fullyQualifiedName || selectedHit.value.name) === key : false;
}

function openHit(hit: SearchHit): void {
  const parent = parentTableLocation(hit.entityType, hit.tableFqn);
  if (parent) {
    void router.push(parent);
    return;
  }
  if (!hit.fullyQualifiedName || !hit.entityType || !isDetailWired(hit.entityType)) {
    selectHit(hit);
    return;
  }
  void router.push(assetLocation(hit.entityType, hit.fullyQualifiedName));
}

function usagePercentileText(hit: SearchHit): string {
  return getUsagePercentile(hit.usageSummary?.weeklyStats?.percentileRank ?? 0, true, (key) => t(key));
}

const showEmpty = computed(() => !loading.value && hits.value.length === 0);
const searchEmptyTitle = computed(() =>
  props.assetKind === 'my-data' ? t('server.no-records-found') : t('label.no-matching-data-asset'),
);
</script>

<template>
  <div data-testid="table-container" class="members-asset-list">
    <div class="members-asset-list__search">
      <Input
        v-model:value="searchValue"
        allow-clear
        :placeholder="t('label.search-entity', { entity: t('label.asset-plural') })"
        data-testid="asset-search"
        @change="page = 1"
      />
    </div>
    <div v-if="loading" data-testid="loader" class="members-asset-list__loader">
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
      <Skeleton :active="true" :paragraph="{ rows: 2 }" />
    </div>
    <template v-else-if="showEmpty">
      <!-- Pin AssetsTabs.component.tsx (~:1068): the empty state renders
           inside a relative host with a 360px floor (h-full tw:relative
           tw:min-h-90). EmptyPlaceholder is absolutely positioned and
           must not anchor to the antd tab content, which is only the
           search box tall when the list is empty (~52px) — its 104px
           icon+title overflowed upward and covered the tab strip. -->
      <div class="members-asset-list__empty">
        <NoDataPlaceholder
          v-if="searchValue || assetKind !== 'team'"
          test-id="no-data-placeholder"
          :title="searchValue ? searchEmptyTitle : t('server.no-records-found')"
        />
        <CreatePlaceholder
          v-else
          :title="t('label.no-assets-linked-yet')"
          :description="
            t('message.link-assets-description', { entity: t('label.team-lowercase') })
          "
          :actions="
            canCreate
              ? [
                  {
                    key: 'add-asset',
                    id: 'data-assets-add-button',
                    label: t('label.add-entity', { entity: t('label.asset') }),
                    color: 'primary',
                    onPress: () => emit('add-asset'),
                  },
                ]
              : undefined
          "
        />
      </div>
    </template>
    <template v-else>
      <div class="members-asset-list__cards">
        <article
          v-for="(hit, index) in hits"
          :key="hitKey(hit, index)"
          class="members-asset-list__card"
          :class="{ 'members-asset-list__card--selected': isSelected(hit) }"
          :data-testid="`search-card-${hit.fullyQualifiedName || hit.name}`"
          @click="selectHit(hit)"
        >
          <div class="members-asset-list__card-head">
            <Tag :color="entityTypeColor(hit.entityType)">{{ entityLabel(hit.entityType) }}</Tag>
            <span v-if="hit.entityType === 'tableColumn'" class="members-asset-list__card-name">
              {{ hit.displayName || hit.name }}
            </span>
            <a v-else href="#" class="members-asset-list__card-name" @click.prevent.stop="openHit(hit)">
              {{ hit.displayName || hit.name }}
            </a>
            <Typography.Text
              v-if="!isDetailWired(hit.entityType) && !parentTableLocation(hit.entityType, hit.tableFqn)"
              type="secondary"
            >
              {{ t('explore.unwired') }}
            </Typography.Text>
          </div>
          <Typography.Paragraph
            v-if="hit.fullyQualifiedName"
            class="members-asset-list__fqn"
            type="secondary"
          >
            {{ hit.fullyQualifiedName }}
          </Typography.Paragraph>
          <Typography.Paragraph
            class="members-asset-list__desc"
            :ellipsis="{ rows: 2 }"
            :content="hit.description || t('explore.noDescription')"
          />
          <div class="members-asset-list__meta">
            <Typography.Text type="secondary">
              {{ hitLocation(hit) || t('explore.locationMissing') }}
            </Typography.Text>
            <Typography.Text v-if="hit.serviceType" type="secondary">{{ hit.serviceType }}</Typography.Text>
            <Typography.Text v-if="hit.tier" type="secondary">{{ hit.tier }}</Typography.Text>
            <Typography.Text v-if="hit.usageSummary" type="secondary">
              {{ usagePercentileText(hit) }}
            </Typography.Text>
            <RouterLink
              v-if="parentTableLocation(hit.entityType, hit.tableFqn)"
              :to="parentTableLocation(hit.entityType, hit.tableFqn)!"
              @click.stop
            >
              {{ hit.tableName || hit.tableFqn }}
            </RouterLink>
          </div>
          <Space wrap>
            <Typography.Text v-if="!hit.owners.length" type="secondary">{{
              t('explore.noOwners')
            }}</Typography.Text>
            <span v-for="owner in hit.owners" :key="owner.name">{{
              owner.displayName || owner.name
            }}</span>
            <Tag v-for="tag in hit.tags" :key="tag.tagFQN">{{ tag.name }}</Tag>
          </Space>
        </article>
      </div>
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
.members-asset-list__search {
  margin-bottom: 12px;
}
.members-asset-list__empty {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
}
.members-asset-list__loader {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.members-asset-list__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.members-asset-list__card {
  cursor: pointer;
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  padding: 12px;
}
.members-asset-list__card--selected {
  border-color: var(--sm-color-primary);
}
.members-asset-list__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.members-asset-list__card-name {
  font-weight: 600;
}
.members-asset-list__fqn {
  margin-bottom: 4px;
}
.members-asset-list__desc {
  margin-bottom: 8px;
}
.members-asset-list__meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
</style>
