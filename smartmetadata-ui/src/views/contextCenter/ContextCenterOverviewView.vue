<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, List, Row, Space, Typography, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import {
  createDriveFolder,
  createKnowledgePage,
  listContextFiles,
  listContextMemories,
  listDriveFolders,
  listKnowledgePages,
  uploadDriveFile,
} from '@/api/contextCenter';
import type {
  ContextFile,
  ContextMemory,
  DriveFolder,
  KnowledgePage,
} from '@/types/contextCenter';
import ArticleFormModal from './ArticleFormModal.vue';
import ContextCenterNav from './ContextCenterNav.vue';
import FolderFormModal from './FolderFormModal.vue';
import UploadDocumentModal from './UploadDocumentModal.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const articles = ref<KnowledgePage[]>([]);
const articlesTotal = ref(0);
const documents = ref<ContextFile[]>([]);
const documentsTotal = ref(0);
const folders = ref<DriveFolder[]>([]);
const memories = ref<ContextMemory[]>([]);
const memoriesTotal = ref(0);

const showArticleModal = ref(false);
const showFolderModal = ref(false);
const showUploadModal = ref(false);

const pillars = computed(() => [
  {
    key: 'articles',
    title: t('nav.articles'),
    count: articlesTotal.value,
    route: 'context-center-articles',
  },
  {
    key: 'documents',
    title: t('nav.documents'),
    count: documentsTotal.value,
    route: 'context-center-documents',
  },
  {
    key: 'memories',
    title: t('nav.memories'),
    count: memoriesTotal.value,
    route: 'context-center-memories',
  },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [articlePage, documentPage, folderPage, memoryPage] = await Promise.all([
      listKnowledgePages({ limit: 3 }),
      listContextFiles({ limit: 3 }),
      listDriveFolders({ limit: 25 }),
      listContextMemories({ limit: 3, statuses: 'Approved,Unprocessed' }),
    ]);
    articles.value = articlePage.data;
    articlesTotal.value = articlePage.total ?? articlePage.data.length;
    documents.value = documentPage.data;
    documentsTotal.value = documentPage.total ?? documentPage.data.length;
    folders.value = folderPage.data;
    memories.value = memoryPage.data;
    memoriesTotal.value = memoryPage.total ?? memoryPage.data.length;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreateArticle(value: {
  name: string;
  displayName?: string;
  description?: string;
  pageType: 'Article' | 'QuickLink';
  pageUrl?: string;
}): Promise<void> {
  try {
    await createKnowledgePage(value);
    showArticleModal.value = false;
    message.success(t('contextCenter.created'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onCreateFolder(value: {
  name: string;
  displayName?: string;
  description?: string;
}): Promise<void> {
  try {
    await createDriveFolder(value);
    showFolderModal.value = false;
    message.success(t('contextCenter.created'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onUpload(value: { file: File; folderFqn?: string }): Promise<void> {
  try {
    await uploadDriveFile(value.file, value.folderFqn);
    showUploadModal.value = false;
    message.success(t('contextCenter.uploaded'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function openArticle(article: KnowledgePage): void {
  void router.push({
    name: 'context-center-article',
    params: { fqn: article.fullyQualifiedName },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="context-center-overview" data-tour-step="context-center" data-tour-page>
    <PageHeader :header="t('contextCenter.overview')" :sub-header="t('contextCenter.overviewLead')" />
    <ContextCenterNav />
    <Space wrap style="margin-bottom: 16px">
      <Button type="primary" data-testid="overview-create-article" @click="showArticleModal = true">
        {{ t('contextCenter.createArticle') }}
      </Button>
      <Button data-testid="overview-upload-document" @click="showUploadModal = true">
        {{ t('contextCenter.uploadDocument') }}
      </Button>
      <Button data-testid="overview-create-folder" @click="showFolderModal = true">
        {{ t('contextCenter.createFolder') }}
      </Button>
    </Space>
    <Typography.Text v-if="errorMessage" type="danger" data-testid="overview-error">
      {{ errorMessage }}
    </Typography.Text>
    <Row :gutter="16" style="margin-bottom: 16px">
      <Col v-for="pillar in pillars" :key="pillar.key" :span="8">
        <Card
          hoverable
          :data-testid="`overview-pillar-${pillar.key}`"
          @click="router.push({ name: pillar.route })"
        >
          <Typography.Title :level="4" style="margin: 0">{{ pillar.count }}</Typography.Title>
          <Typography.Text type="secondary">{{ pillar.title }}</Typography.Text>
        </Card>
      </Col>
    </Row>
    <Row :gutter="16">
      <Col :span="12">
        <Card :title="t('contextCenter.recentArticles')" :loading="loading">
          <List
            :data-source="articles"
            :locale="{ emptyText: t('contextCenter.emptyArticles') }"
          >
            <template #renderItem="{ item }">
              <List.Item>
                <Button type="link" @click="openArticle(item as KnowledgePage)">
                  {{ (item as KnowledgePage).displayName || (item as KnowledgePage).name }}
                </Button>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
      <Col :span="12">
        <Card :title="t('contextCenter.recentDocuments')" :loading="loading">
          <List
            :data-source="documents"
            :locale="{ emptyText: t('contextCenter.emptyDocuments') }"
          >
            <template #renderItem="{ item }">
              <List.Item>
                {{ (item as ContextFile).displayName || (item as ContextFile).name }}
                <Typography.Text type="secondary">
                  {{ formatEpoch((item as ContextFile).updatedAt) }}
                </Typography.Text>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
    </Row>
    <Row :gutter="16" style="margin-top: 16px">
      <Col :span="12">
        <Card :title="t('contextCenter.folders')" :loading="loading">
          <List :data-source="folders" :locale="{ emptyText: t('contextCenter.emptyFolders') }">
            <template #renderItem="{ item }">
              <List.Item>
                <Button
                  type="link"
                  @click="router.push({ name: 'context-center-documents', query: { folder: (item as DriveFolder).id } })"
                >
                  {{ (item as DriveFolder).displayName || (item as DriveFolder).name }}
                </Button>
                <Typography.Text type="secondary">
                  {{ (item as DriveFolder).childrenCount ?? 0 }}
                </Typography.Text>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
      <Col :span="12">
        <Card :title="t('contextCenter.recentMemories')" :loading="loading">
          <List :data-source="memories" :locale="{ emptyText: t('contextCenter.emptyMemories') }">
            <template #renderItem="{ item }">
              <List.Item>
                {{ (item as ContextMemory).question || (item as ContextMemory).displayName }}
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
    </Row>
    <ArticleFormModal
      :open="showArticleModal"
      @ok="onCreateArticle"
      @cancel="showArticleModal = false"
      @update:open="showArticleModal = $event"
    />
    <FolderFormModal
      :open="showFolderModal"
      @ok="onCreateFolder"
      @cancel="showFolderModal = false"
      @update:open="showFolderModal = $event"
    />
    <UploadDocumentModal
      :open="showUploadModal"
      :folders="folders"
      @ok="onUpload"
      @cancel="showUploadModal = false"
      @update:open="showUploadModal = $event"
    />
  </div>
</template>
