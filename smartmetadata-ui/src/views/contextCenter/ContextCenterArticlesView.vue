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
import { Button, Space, Tabs, Tag, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import {
  createKnowledgePage,
  deleteKnowledgePage,
  getKnowledgePageByFqn,
  listKnowledgePages,
  updateKnowledgePage,
} from '@/api/contextCenter';
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
  try {
    detail.value = await getKnowledgePageByFqn(fqn.value);
    if (!detail.value) {
      detailError.value = t('crud.loadFailed');
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

onMounted(() => {
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
            <Button danger data-testid="article-delete" @click="detail && onDelete(detail)">
              {{ t('crud.delete') }}
            </Button>
            <Button @click="router.push({ name: 'context-center-articles' })">
              {{ t('contextCenter.backToList') }}
            </Button>
          </Space>
        </template>
        <div v-if="detail">
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
