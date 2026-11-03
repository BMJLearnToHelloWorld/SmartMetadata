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
import { Button, Col, List, Row, Space, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import {
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  listContextFiles,
  listDriveFolders,
  uploadDriveFile,
} from '@/api/contextCenter';
import type { ContextFile, DriveFolder } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import FolderFormModal from './FolderFormModal.vue';
import UploadDocumentModal from './UploadDocumentModal.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const files = ref<ContextFile[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();
const folders = ref<DriveFolder[]>([]);
const selectedFolderId = ref<string | undefined>(undefined);
const previewFile = ref<ContextFile | null>(null);
const showUploadModal = ref(false);
const showFolderModal = ref(false);

const selectedFolder = computed(() =>
  folders.value.find((folder) => folder.id === selectedFolderId.value),
);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.name'), dataIndex: 'name', key: 'name' },
  { title: t('contextCenter.fileExtension'), dataIndex: 'fileExtension', key: 'fileExtension' },
  { title: t('contextCenter.folder'), dataIndex: 'folderName', key: 'folderName' },
  { title: t('contextCenter.memoryCount'), dataIndex: 'memoryCount', key: 'memoryCount' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [filePage, folderPage] = await Promise.all([
      listContextFiles({
        limit: 25,
        folderId: selectedFolderId.value,
        after: cursor?.after,
        before: cursor?.before,
      }),
      listDriveFolders({ limit: 100 }),
    ]);
    files.value = filePage.data;
    total.value = filePage.total;
    after.value = filePage.after;
    before.value = filePage.before;
    folders.value = folderPage.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    files.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

function selectFolder(id: string | undefined): void {
  selectedFolderId.value = id;
  void router.replace({
    name: 'context-center-documents',
    query: id ? { folder: id } : {},
  });
  void load();
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

async function onDeleteFile(file: ContextFile): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteDocument'),
    content: file.displayName || file.name,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDriveFile(file.id);
    previewFile.value = null;
    message.success(t('contextCenter.deleted'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onDeleteFolder(): Promise<void> {
  const folder = selectedFolder.value;
  if (!folder) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteFolder'),
    content: folder.displayName || folder.name,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteDriveFolder(folder.id);
    message.success(t('contextCenter.deleted'));
    selectFolder(undefined);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

watch(
  () => route.query.folder,
  (folder) => {
    const id = Array.isArray(folder) ? folder[0] : folder;
    if (id !== selectedFolderId.value) {
      selectedFolderId.value = id;
      void load();
    }
  },
);

onMounted(() => {
  const folder = route.query.folder;
  selectedFolderId.value = Array.isArray(folder) ? folder[0] : folder;
  void load();
});
</script>

<template>
  <div data-testid="context-center-documents">
    <ContextCenterNav />
    <Row :gutter="16">
      <Col :span="6">
        <List
          :header="t('contextCenter.folders')"
          :data-source="folders"
          :locale="{ emptyText: t('contextCenter.emptyFolders') }"
          data-testid="documents-folder-list"
        >
          <template #renderItem="{ item }">
            <List.Item
              :class="{ 'documents-folder--active': (item as DriveFolder).id === selectedFolderId }"
            >
              <Button type="link" @click="selectFolder((item as DriveFolder).id)">
                {{ (item as DriveFolder).displayName || (item as DriveFolder).name }}
              </Button>
              <Typography.Text type="secondary">
                {{ (item as DriveFolder).childrenCount ?? 0 }}
              </Typography.Text>
            </List.Item>
          </template>
        </List>
        <Space wrap style="margin-top: 12px">
          <Button data-testid="documents-all-folders" @click="selectFolder(undefined)">
            {{ t('contextCenter.allFolders') }}
          </Button>
          <Button data-testid="documents-create-folder" @click="showFolderModal = true">
            {{ t('contextCenter.createFolder') }}
          </Button>
          <Button
            v-if="selectedFolder"
            danger
            data-testid="documents-delete-folder"
            @click="onDeleteFolder"
          >
            {{ t('contextCenter.deleteFolder') }}
          </Button>
        </Space>
      </Col>
      <Col :span="18">
        <EntityListShell
          :title="t('contextCenter.documents')"
          :lead="t('contextCenter.documentsLead')"
          :loading="loading"
          :error="errorMessage"
          :columns="columns"
          :data-source="
            files.map((file) => ({
              ...file,
              folderName: file.folder?.displayName || file.folder?.name || '',
              updatedAt: formatEpoch(file.updatedAt),
            }))
          "
          row-key="id"
          table-test-id="documents-table"
          :total="total"
          :has-next="!!after"
          :has-prev="!!before"
          :empty-text="t('contextCenter.emptyDocuments')"
          show-row-actions
          show-delete-action
          @refresh="load()"
          @next="load({ after: after })"
          @prev="load({ before: before })"
          @view="previewFile = $event as ContextFile"
          @delete="onDeleteFile($event as ContextFile)"
        >
          <template #actions>
            <Button type="primary" data-testid="documents-upload" @click="showUploadModal = true">
              {{ t('contextCenter.uploadDocument') }}
            </Button>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <Button type="link" @click="previewFile = record as ContextFile">
                {{ (record as ContextFile).displayName || (record as ContextFile).name }}
              </Button>
            </template>
            <template v-else>
              {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
            </template>
          </template>
        </EntityListShell>
      </Col>
    </Row>
    <SmDrawer
      :open="!!previewFile"
      :title="previewFile?.displayName || previewFile?.name || ''"
      :show-ok="false"
      test-id="document-preview-drawer"
      @cancel="previewFile = null"
      @update:open="previewFile = $event ? previewFile : null"
    >
      <div v-if="previewFile">
        <Typography.Paragraph v-if="previewFile.description">
          {{ previewFile.description }}
        </Typography.Paragraph>
        <p>
          {{ t('contextCenter.fileExtension') }}: {{ previewFile.fileExtension || '' }} ·
          {{ t('contextCenter.fileSize') }}: {{ previewFile.fileSize ?? '' }} ·
          {{ t('contextCenter.memoryCount') }}: {{ previewFile.memoryCount ?? 0 }}
        </p>
        <p>
          {{ t('contextCenter.processingStatus') }}: {{ previewFile.processingStatus || '' }} ·
          {{ t('contextCenter.updatedBy') }}: {{ previewFile.updatedBy || '' }}
          {{ formatEpoch(previewFile.updatedAt) }}
        </p>
        <Space>
          <Button
            v-if="previewFile.sourceUrl"
            :href="previewFile.sourceUrl"
            target="_blank"
            data-testid="document-preview-open"
          >
            {{ t('contextCenter.openLink') }}
          </Button>
          <Button danger data-testid="document-preview-delete" @click="onDeleteFile(previewFile)">
            {{ t('crud.delete') }}
          </Button>
        </Space>
      </div>
    </SmDrawer>
    <UploadDocumentModal
      :open="showUploadModal"
      :folders="folders"
      :initial-folder-fqn="selectedFolder?.fullyQualifiedName"
      @ok="onUpload"
      @cancel="showUploadModal = false"
      @update:open="showUploadModal = $event"
    />
    <FolderFormModal
      :open="showFolderModal"
      @ok="onCreateFolder"
      @cancel="showFolderModal = false"
      @update:open="showFolderModal = $event"
    />
  </div>
</template>

<style scoped>
.documents-folder--active {
  background: var(--sm-color-primary-bg);
}
</style>
