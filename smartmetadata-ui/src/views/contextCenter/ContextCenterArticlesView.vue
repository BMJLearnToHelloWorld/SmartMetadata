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
import { Alert, Button, Empty, Space, Tabs, Tag, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import AssetActivityPanel from '@/features/crud/AssetActivityPanel.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import {
  createKnowledgePage,
  deleteKnowledgePage,
  getKnowledgePageByFqn,
  listKnowledgePages,
  updateKnowledgePage,
} from '@/api/contextCenter';
import { listEntityActivity } from '@/api/activity';
import { listConversations } from '@/api/conversations';
import { listCustomProperties } from '@/api/customProperties';
import { toEntityLink } from '@/quality/entityLink';
import type { ActivityEvent, Conversation, CustomPropertyDef } from '@/types/collaboration';
import type { KnowledgePage, KnowledgePageType } from '@/types/contextCenter';
import ArticleFormModal from './ArticleFormModal.vue';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const fqn = computed(() => {
  const param = route.params.fqn;
  return Array.isArray(param) ? param[0] : param;
});

const loading = ref(false);
const errorMessage = ref('');
const pages = ref<KnowledgePage[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();
const pageType = ref<KnowledgePageType | 'All'>('All');
const showCreateModal = ref(false);
const showEditModal = ref(false);

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
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listKnowledgePages({
      limit: 25,
      pageType: pageType.value === 'All' ? undefined : pageType.value,
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
    } else if (detailTab.value !== 'overview') {
      await loadDetailExtras();
    }
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    detailLoading.value = false;
  }
}

function openPage(page: KnowledgePage): void {
  void router.push({ name: 'context-center-article', params: { fqn: page.fullyQualifiedName } });
}

function onPageTypeChange(key: string | number): void {
  pageType.value = key as KnowledgePageType | 'All';
  void load();
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
  () => {
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
              data-testid="article-open-link"
            >
              {{ t('contextCenter.openLink') }}
            </Button>
            <Button data-testid="article-edit" @click="showEditModal = true">
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
            <Button danger data-testid="article-delete" @click="detail && onDelete(detail)">
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
              <!-- Definitions only: the product KnowledgePage type carries
                   no extension/custom-property values, so value editing
                   (official CustomPropertyTable's edit path) is not
                   faked here; definitions come from the official
                   /metadata/types/name/page/customProperties surface. -->
              <Alert v-if="detailCustomPropsError" type="error" show-icon :message="detailCustomPropsError" />
              <SmTable
                row-key="name"
                test-id="article-custom-properties-table"
                :columns="[
                  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
                  { title: t('crud.displayName'), dataIndex: 'displayName', key: 'displayName' },
                  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
                ]"
                :data-source="detailCustomProps"
                :pagination="false"
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
    </div>
    <div v-else>
      <EntityListShell
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
        :has-next="!!after"
        :has-prev="!!before"
        :empty-text="t('contextCenter.emptyArticles')"
        show-row-actions
        show-delete-action
        @refresh="load()"
        @next="load({ after: after })"
        @prev="load({ before: before })"
        @view="openPage($event as KnowledgePage)"
        @delete="onDelete($event as KnowledgePage)"
      >
        <template #actions>
          <Button type="primary" data-testid="articles-create" @click="showCreateModal = true">
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
        </template>
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
      <ArticleFormModal
        :open="showCreateModal"
        @ok="onCreate"
        @cancel="showCreateModal = false"
        @update:open="showCreateModal = $event"
      />
    </div>
  </div>
</template>
