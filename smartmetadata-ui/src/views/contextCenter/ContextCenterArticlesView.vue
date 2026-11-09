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
import { Button, Empty, Menu, Select, Space, Tabs, Tag, Typography, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import {
  createKnowledgePage,
  deleteKnowledgePage,
  followKnowledgePage,
  getKnowledgePageByFqn,
  listKnowledgePages,
  patchKnowledgePage,
  searchKnowledgePages,
  unFollowKnowledgePage,
  updateKnowledgePage,
} from '@/api/contextCenter';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { permissionFlags } from '@/api/permissions';
import {
  ARTICLE_PAGE_SIZE,
  ARTICLE_QUICK_FILTER_FACET_IDS,
  ARTICLE_SORT_OPTIONS,
  appendUniquePages,
  buildArticleQueryFilter,
  getArticleSortConfig,
  getKnowledgePageFields,
  useArticleSearchPath,
} from '@/catalog/contextCenterArticles';
import type { SearchFacet } from '@/catalog/searchFacets';
import type { SearchFilters } from '@/catalog/searchQuery';
import ExploreFilterChips from '@/features/explore/ExploreFilterChips.vue';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import { recordRecentlyViewed } from '@/stores/contextCenterRecent';
import AssetCustomPropertiesPanel from '@/features/crud/AssetCustomPropertiesPanel.vue';
import CustomPropertiesEditModal from '@/features/crud/CustomPropertiesEditModal.vue';
import { extensionPatch } from '@/governance/assetPatch';
import { toEntityLink } from '@/quality/entityLink';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { KnowledgePage, KnowledgePageType } from '@/types/contextCenter';
import ArticleFormModal from './ArticleFormModal.vue';
import ArticlesRightPanel from './ArticlesRightPanel.vue';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatDateString, formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const permissionStore = usePermissionStore();

/**
 * ADR:2026-11-07-context-center-permission-gates — create/edit/delete
 * entries are hidden without the matching page grant (Create / EditAll /
 * Delete); a failed permission request leaves all three false.
 */
const canCreate = ref(false);
const canEditAll = ref(false);
const canDelete = ref(false);

async function loadPermissions(): Promise<void> {
  try {
    const flags = permissionFlags(await permissionStore.getResourcePermission('page'));
    canCreate.value = flags.canCreate;
    canEditAll.value = flags.canEditAll;
    canDelete.value = flags.canDelete;
  } catch {
    canCreate.value = false;
    canEditAll.value = false;
    canDelete.value = false;
  }
}

const fqn = computed(() => {
  const param = route.params.fqn;
  return Array.isArray(param) ? param[0] : param;
});

const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');
const pages = ref<KnowledgePage[]>([]);
const total = ref<number | undefined>();
const facets = ref<SearchFacet[]>([]);
const filters = ref<SearchFilters>({});
const searchText = ref('');
const debouncedSearch = ref('');
const sortId = ref('updatedAt');
const pageType = ref<KnowledgePageType | 'All'>('All');
const showCreateModal = ref(false);
const createPageType = ref<KnowledgePageType>('Article');
const showEditModal = ref(false);
/** Bumped after create/delete/follow and on return to the list. */
const rightPanelSignal = ref(0);

let listGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const hasMore = computed(
  () => total.value !== undefined && pages.value.length < total.value,
);
const SORT_LABEL_KEYS: Record<string, string> = {
  updatedAt: 'contextCenter.sortRecentlyUpdated',
  name: 'contextCenter.sortAlphabetical',
  publicationDate: 'contextCenter.sortPublicationDate',
  popularity: 'contextCenter.sortPopularity',
};
const sortOptions = computed(() =>
  ARTICLE_SORT_OPTIONS.map((option) => ({
    value: option.id,
    label: t(SORT_LABEL_KEYS[option.id] ?? 'contextCenter.sortRecentlyUpdated'),
  })),
);

const detail = ref<KnowledgePage | null>(null);
const detailLoading = ref(false);
const detailError = ref('');

// Detail tabs (A17, official CONTEXT_CENTER_ARTICLE_DETAIL_WITH_TAB* +
// KnowledgePageDetailComponent): the route's :tab drives the active
// tab — overview (default), activity_feed, custom_properties — and
// :subTab is accepted and preserved across tab switches, exactly as
// official's detail component reads only `tab` from the route. Tab
// labels reuse the official EntityTabs values ('overview',
// 'activity_feed', 'custom_properties').
const DETAIL_TABS = ['overview', 'activity_feed', 'custom_properties'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
// Kept as a plain string ref so ant-design-vue's Tabs v-model
// (string | number) type-checks; tabFromRoute is the only writer of
// non-validated values, and it validates against DETAIL_TABS.
const detailTab = ref<string>('overview');
const detailSubTab = computed(() => {
  const param = route.params.subTab;
  return Array.isArray(param) ? param[0] : param;
});
function tabFromRoute(): DetailTab {
  const param = route.params.tab;
  const value = Array.isArray(param) ? param[0] : param;
  return (DETAIL_TABS as readonly string[]).includes(value ?? '') ? (value as DetailTab) : 'overview';
}
const detailActivity = ref<ActivityEvent[]>([]);
const detailConversations = ref<Conversation[]>([]);
const detailCollabError = ref('');
const detailCustomProps = ref<CustomPropertyDef[]>([]);
const detailCustomPropsError = ref('');
const detailExtrasFor = ref('');
const propsOpen = ref(false);
const propsSaving = ref(false);

async function loadDetailExtras(): Promise<void> {
  const current = detail.value;
  const pageFqn = current?.fullyQualifiedName;
  if (!pageFqn || detailExtrasFor.value === pageFqn) {
    return;
  }
  detailExtrasFor.value = pageFqn;
  try {
    const [activityPage, conversationPage] = await Promise.all([
      listEntityActivity('page', pageFqn).catch(() => ({ data: [] as ActivityEvent[] })),
      listConversations({ entityLink: toEntityLink('page', pageFqn), limit: 20 }).catch(
        () => ({ data: [] as Conversation[] }),
      ),
    ]);
    detailActivity.value = activityPage.data;
    detailConversations.value = conversationPage.data;
    detailCollabError.value = '';
  } catch {
    detailActivity.value = [];
    detailConversations.value = [];
    detailCollabError.value = t('crud.loadFailed');
  }
  try {
    detailCustomProps.value = await listCustomProperties('page');
    detailCustomPropsError.value = '';
  } catch {
    detailCustomProps.value = [];
    detailCustomPropsError.value = t('crud.loadFailed');
  }
}

function onDetailTabChange(key: string | number): void {
  const next = String(key) as DetailTab;
  if (next === detailTab.value || !detail.value) {
    return;
  }
  detailTab.value = next;
  const pageFqn = detail.value.fullyQualifiedName;
  if (detailSubTab.value) {
    void router.push({
      name: 'context-center-article-subtab',
      params: { fqn: pageFqn, tab: next, subTab: detailSubTab.value },
    });
  } else if (next === 'overview') {
    void router.push({ name: 'context-center-article', params: { fqn: pageFqn } });
  } else {
    void router.push({ name: 'context-center-article-tab', params: { fqn: pageFqn, tab: next } });
  }
  void loadDetailExtras();
}

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.name'), dataIndex: 'name', key: 'name' },
  { title: t('contextCenter.pageType'), dataIndex: 'pageType', key: 'pageType' },
  { title: t('contextCenter.publicationDate'), dataIndex: 'publicationDate', key: 'publicationDate' },
  { title: t('contextCenter.totalVotes'), dataIndex: 'totalVotes', key: 'totalVotes' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

/**
 * ADR:2026-11-08-context-center-articles-search-mapping
 * ADR:2026-11-08-context-center-articles-offset-load-more — official
 * dual path (KnowledgePageListComponent): ES when filtered or when the
 * sort has no REST equivalent, else REST; both offset-paged 25 at a
 * time and appended with uniqBy(id). Only the latest request commits.
 */
async function load(offset = 0): Promise<void> {
  const request = ++listGeneration;
  if (offset > 0) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }
  errorMessage.value = '';
  try {
    const sort = getArticleSortConfig(sortId.value);
    if (useArticleSearchPath(debouncedSearch.value, filters.value, sort)) {
      const result = await searchKnowledgePages({
        q: debouncedSearch.value,
        offset,
        sortField: sort.esSortField,
        sortOrder: sort.sortOrder,
        queryFilter: buildArticleQueryFilter(filters.value, pageType.value),
      });
      if (request !== listGeneration) {
        return;
      }
      pages.value = offset > 0 ? appendUniquePages(pages.value, result.data) : result.data;
      total.value = result.total;
      facets.value = result.facets;
    } else {
      const result = await listKnowledgePages({
        fields: getKnowledgePageFields(),
        limit: ARTICLE_PAGE_SIZE,
        offset,
        sortBy: sort.restSortBy ?? 'updatedAt',
        sortOrder: sort.sortOrder,
        pageType: pageType.value === 'All' ? undefined : pageType.value,
      });
      if (request !== listGeneration) {
        return;
      }
      pages.value = offset > 0 ? appendUniquePages(pages.value, result.data) : result.data;
      total.value = result.total;
    }
  } catch (error) {
    if (request !== listGeneration) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    if (offset === 0) {
      pages.value = [];
      total.value = undefined;
    }
  } finally {
    if (request === listGeneration) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function loadMore(): void {
  if (!hasMore.value || loadingMore.value) {
    return;
  }
  void load(pages.value.length);
}

function resetToFirstPage(): void {
  void load(0);
}

function applySearch(): void {
  resetToFirstPage();
}

function onSearchInput(value: string): void {
  searchText.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value;
    applySearch();
  }, 300);
}

function onSearchEnter(): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  debouncedSearch.value = searchText.value;
  applySearch();
}

function onFilterChange(id: string, values: string[]): void {
  filters.value = { ...filters.value, [id]: values };
  resetToFirstPage();
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this single select only ever carries a plain string value, so normalise
 * to string here and keep the rest of the handler in string terms.
 */
function onSortChange(value: SelectValue): void {
  if (typeof value !== 'string') {
    return;
  }
  sortId.value = value;
  resetToFirstPage();
}

function onPageTypeChange(key: string | number): void {
  pageType.value = key as KnowledgePageType | 'All';
  resetToFirstPage();
}

function isFollowing(page: KnowledgePage): boolean {
  const userId = auth.user?.id;
  if (!userId) {
    return false;
  }
  return (page.followers ?? []).some((follower) => follower.id === userId);
}

async function onFollowToggle(page: KnowledgePage): Promise<void> {
  const userId = auth.user?.id;
  if (!userId) {
    return;
  }
  try {
    if (isFollowing(page)) {
      const removed = await unFollowKnowledgePage(page.id, userId);
      const removedIds = new Set(removed.map((follower) => follower.id));
      const nextFollowers = (page.followers ?? []).filter(
        (follower) => !removedIds.has(follower.id) && follower.id !== userId,
      );
      applyFollowers(page, nextFollowers);
    } else {
      const added = await followKnowledgePage(page.id, userId);
      const nextFollowers = [...(page.followers ?? []), ...added];
      if (!nextFollowers.some((follower) => follower.id === userId)) {
        nextFollowers.push({ id: userId, type: 'user', name: auth.user?.name ?? userId });
      }
      applyFollowers(page, nextFollowers);
    }
    rightPanelSignal.value += 1;
  } catch {
    message.error(t('contextCenter.followFailed'));
  }
}

function applyFollowers(page: KnowledgePage, followers: KnowledgePage['followers']): void {
  pages.value = pages.value.map((item) =>
    item.id === page.id ? { ...item, followers } : item,
  );
  if (detail.value?.id === page.id) {
    detail.value = { ...detail.value, followers };
  }
}

function onOpenPanelPage(page: {
  fullyQualifiedName?: string;
  pageType?: KnowledgePageType;
  pageUrl?: string;
}): void {
  if (page.pageType === 'QuickLink' && page.pageUrl) {
    window.open(page.pageUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (page.fullyQualifiedName) {
    void router.push({ name: 'context-center-article', params: { fqn: page.fullyQualifiedName } });
  }
}

function onAddQuickLink(): void {
  createPageType.value = 'QuickLink';
  showCreateModal.value = true;
}

async function loadDetail(): Promise<void> {
  if (!fqn.value) {
    detail.value = null;
    return;
  }
  detailLoading.value = true;
  detailError.value = '';
  detailExtrasFor.value = '';
  try {
    detail.value = await getKnowledgePageByFqn(fqn.value);
    if (!detail.value) {
      detailError.value = t('crud.loadFailed');
    } else {
      // ADR:2026-11-07-context-center-recently-viewed-local-per-user —
      // opening the detail counts as a view; re-recording is idempotent.
      recordRecentlyViewed(auth.user?.name, {
        id: detail.value.id,
        title: detail.value.displayName || detail.value.name,
        pageType: detail.value.pageType,
        pageUrl: detail.value.pageUrl,
        fullyQualifiedName: detail.value.fullyQualifiedName,
      });
      if (detailTab.value !== 'overview') {
        await loadDetailExtras();
      }
    }
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    detailLoading.value = false;
  }
}

function openPage(page: KnowledgePage): void {
  recordRecentlyViewed(auth.user?.name, {
    id: page.id,
    title: page.displayName || page.name,
    pageType: page.pageType,
    pageUrl: page.pageUrl,
    fullyQualifiedName: page.fullyQualifiedName,
  });
  if (page.pageType === 'QuickLink' && page.pageUrl) {
    window.open(page.pageUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  void router.push({ name: 'context-center-article', params: { fqn: page.fullyQualifiedName } });
}

async function onCreate(value: {
  name: string;
  displayName?: string;
  description?: string;
  pageType: KnowledgePageType;
  pageUrl?: string;
}): Promise<void> {
  try {
    await createKnowledgePage(value);
    showCreateModal.value = false;
    message.success(t('contextCenter.created'));
    rightPanelSignal.value += 1;
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onEdit(value: {
  name: string;
  displayName?: string;
  description?: string;
  pageType: KnowledgePageType;
  pageUrl?: string;
}): Promise<void> {
  if (!detail.value) {
    return;
  }
  try {
    await updateKnowledgePage(value);
    showEditModal.value = false;
    message.success(t('contextCenter.saved'));
    void loadDetail();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onSaveCustomProperties(next: Record<string, unknown>): Promise<void> {
  if (!detail.value?.id) {
    message.error(t('asset.patchNeedsId'));
    return;
  }
  propsSaving.value = true;
  try {
    // One whole-extension op (add when absent, replace when present) —
    // never per-field add /extension/<name>, which is illegal while the
    // parent object is missing.
    await patchKnowledgePage(detail.value.id, extensionPatch(detail.value.extension, next));
    propsOpen.value = false;
    message.success(t('asset.propsUpdated'));
    await loadDetail();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('asset.updateFailed'));
  } finally {
    propsSaving.value = false;
  }
}

async function onDelete(page: KnowledgePage): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteArticle'),
    content: page.displayName || page.name,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteKnowledgePage(page.id);
    message.success(t('contextCenter.deleted'));
    rightPanelSignal.value += 1;
    if (fqn.value) {
      void router.push({ name: 'context-center-articles' });
      return;
    }
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

watch(
  () => route.params.fqn,
  (nextFqn, prevFqn) => {
    if (!nextFqn && prevFqn) {
      rightPanelSignal.value += 1;
    }
    void loadDetail();
  },
);

watch(
  () => route.params.tab,
  () => {
    detailTab.value = tabFromRoute();
    if (detailTab.value !== 'overview') {
      void loadDetailExtras();
    }
  },
);

onMounted(() => {
  detailTab.value = tabFromRoute();
  void load();
  void loadDetail();
  void loadPermissions();
});
</script>

<template>
  <div data-testid="context-center-articles">
    <ContextCenterNav />
    <div v-if="fqn">
      <EntityDetailShell
        :title="detail?.displayName || detail?.name || ''"
        :name="detail?.name"
        :fqn="detail?.fullyQualifiedName"
        :loading="detailLoading"
        :error="detailError"
        :empty="!detailLoading && !detail"
        :lead="detail?.description"
      >
        <template #actions>
          <Space>
            <Button
              v-if="detail?.pageType === 'QuickLink' && detail?.pageUrl"
              :href="detail.pageUrl"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="article-open-link"
            >
              {{ t('contextCenter.openLink') }}
            </Button>
            <Button
              v-if="detail"
              data-testid="article-follow"
              @click="detail && onFollowToggle(detail)"
            >
              {{ isFollowing(detail) ? t('contextCenter.unfollow') : t('contextCenter.follow') }}
            </Button>
            <Button
              v-if="canEditAll"
              data-testid="article-edit"
              @click="showEditModal = true"
            >
              {{ t('crud.edit') }}
            </Button>
            <Button
              v-if="detail?.version !== undefined && detail?.version !== null"
              data-testid="article-versions"
              @click="
                router.push({
                  name: 'context-center-article-version',
                  params: { fqn: detail.fullyQualifiedName, version: String(detail.version) },
                })
              "
            >
              {{ t('contextCenter.versions') }}
            </Button>
            <Button
              v-if="canDelete"
              danger
              data-testid="article-delete"
              @click="detail && onDelete(detail)"
            >
              {{ t('crud.delete') }}
            </Button>
            <Button @click="router.push({ name: 'context-center-articles' })">
              {{ t('contextCenter.backToList') }}
            </Button>
          </Space>
        </template>
        <div v-if="detail">
          <Tabs
            v-model:active-key="detailTab"
            data-testid="article-detail-tabs"
            @change="onDetailTabChange"
          >
            <Tabs.TabPane key="overview" :tab="t('contextCenter.detailTabs.overview')">
              <Space wrap style="margin-bottom: 12px">
                <Tag>{{ detail.pageType }}</Tag>
                <Tag v-for="tag in detail.tags ?? []" :key="tag.tagFQN">{{ tag.tagFQN }}</Tag>
              </Space>
              <Typography.Paragraph type="secondary" data-testid="article-meta">
                {{ t('contextCenter.updatedBy') }}: {{ detail.updatedBy || '' }}
                {{ formatEpoch(detail.updatedAt) }}
              </Typography.Paragraph>
              <Typography.Paragraph
                v-if="detail.owners && detail.owners.length > 0"
                data-testid="article-owners"
              >
                {{ t('contextCenter.owners') }}:
                {{ detail.owners.map((owner) => owner.displayName || owner.name).join(', ') }}
              </Typography.Paragraph>
              <Typography.Paragraph
                v-if="detail.children && detail.children.length > 0"
                data-testid="article-children"
              >
                {{ t('contextCenter.children') }}:
                {{ detail.children.map((child) => child.displayName || child.name).join(', ') }}
              </Typography.Paragraph>
            </Tabs.TabPane>
            <Tabs.TabPane key="activity_feed" :tab="t('contextCenter.detailTabs.activityFeed')">
              <AssetActivityPanel
                :activity="detailActivity"
                :conversations="detailConversations"
                :collaboration-error="detailCollabError"
                entity-type="page"
                :fqn="detail.fullyQualifiedName"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="custom_properties" :tab="t('contextCenter.detailTabs.customProperties')">
              <!-- Values come from the page's extension (official
                   CustomPropertyTable reads entityDetails.extension);
                   definitions come from the official
                   /metadata/types/name/page/customProperties surface. -->
              <Button
                v-if="canEditAll"
                type="primary"
                data-testid="article-edit-custom-properties"
                @click="propsOpen = true"
              >
                {{ t('asset.editCustomProperties') }}
              </Button>
              <AssetCustomPropertiesPanel
                :defs="detailCustomProps"
                :values="detail?.extension ?? {}"
                :error="detailCustomPropsError"
                entity-type="page"
              />
              <Empty
                v-if="!detailCustomProps.length && !detailCustomPropsError"
                :description="t('contextCenter.detailTabs.noCustomProperties')"
                data-testid="article-custom-properties-empty"
              />
            </Tabs.TabPane>
          </Tabs>
        </div>
      </EntityDetailShell>
      <ArticleFormModal
        v-if="detail"
        :open="showEditModal"
        :initial-name="detail.name"
        :initial-display-name="detail.displayName ?? ''"
        :initial-description="detail.description ?? ''"
        :initial-page-type="detail.pageType"
        :initial-page-url="detail.pageUrl ?? ''"
        @ok="onEdit"
        @cancel="showEditModal = false"
        @update:open="showEditModal = $event"
      />
      <CustomPropertiesEditModal
        :open="propsOpen"
        :defs="detailCustomProps"
        :values="detail?.extension ?? {}"
        :saving="propsSaving"
        @save="onSaveCustomProperties"
        @cancel="propsOpen = false"
      />
    </div>
    <div v-else style="display: flex; gap: 16px; align-items: flex-start">
      <EntityListShell
        style="flex: 1; min-width: 0"
        :title="t('contextCenter.articles')"
        :lead="t('contextCenter.articlesLead')"
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
        table-test-id="articles-table"
        :total="total"
        :empty-text="t('contextCenter.emptyArticles')"
        show-row-actions
        :show-delete-action="canDelete"
        show-search
        :search-value="searchText"
        :search-placeholder="t('contextCenter.searchArticlesPlaceholder')"
        show-load-more
        :has-more="hasMore"
        :loading-more="loadingMore"
        @refresh="load()"
        @update:search-value="onSearchInput($event)"
        @search="onSearchEnter"
        @load-more="loadMore"
        @view="openPage($event as KnowledgePage)"
        @delete="onDelete($event as KnowledgePage)"
      >
        <template #actions>
          <Button
            v-if="canCreate"
            type="primary"
            data-testid="articles-create"
            @click="showCreateModal = true"
          >
            {{ t('contextCenter.createArticle') }}
          </Button>
        </template>
        <template #filters>
          <Tabs
            :active-key="pageType"
            data-testid="articles-page-type-tabs"
            @change="onPageTypeChange"
          >
            <Tabs.TabPane key="All" :tab="t('contextCenter.allTypes')" />
            <Tabs.TabPane key="Article" :tab="t('contextCenter.articleType')" />
            <Tabs.TabPane key="QuickLink" :tab="t('contextCenter.quickLinkType')" />
          </Tabs>
          <ExploreFilterChips
            :facets="facets"
            :filters="filters"
            :facet-ids="ARTICLE_QUICK_FILTER_FACET_IDS"
            @change="onFilterChange"
          />
          <Select
            :value="sortId"
            :options="sortOptions"
            style="width: 180px"
            data-testid="articles-sort"
            @change="onSortChange"
          />
        </template>
        <template #rowActions="{ record }">
          <Menu.Item
            :key="`follow-${(record as KnowledgePage).id}`"
            :data-testid="`article-row-follow-${(record as KnowledgePage).id}`"
            @click="onFollowToggle(record as KnowledgePage)"
          >
            {{
              isFollowing(record as KnowledgePage)
                ? t('contextCenter.unfollow')
                : t('contextCenter.follow')
            }}
          </Menu.Item>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <Button type="link" @click="openPage(record as KnowledgePage)">
              {{ (record as KnowledgePage).displayName || (record as KnowledgePage).name }}
            </Button>
          </template>
          <template v-else-if="column.key === 'publicationDate'">
            {{ formatDateString((record as KnowledgePage).publicationDate) }}
          </template>
          <template v-else>
            {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
          </template>
        </template>
      </EntityListShell>
      <ArticlesRightPanel
        :refresh-signal="rightPanelSignal"
        :can-create="canCreate"
        style="width: 320px; flex-shrink: 0"
        @open-page="onOpenPanelPage"
        @add-quick-link="onAddQuickLink"
      />
      <ArticleFormModal
        :open="showCreateModal"
        :initial-page-type="createPageType"
        @ok="onCreate"
        @cancel="showCreateModal = false"
        @update:open="showCreateModal = $event"
      />
    </div>
  </div>
</template>
