<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Col, Dropdown, List, Menu, Modal, Row, Space, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import {
  bulkDeleteDriveFiles,
  bulkMoveFilesToFolder,
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  downloadDriveFiles,
  getBulkSuccessfulIds,
  listContextFiles,
  listDriveFolders,
  searchContextFiles,
  uploadDriveFile,
} from '@/api/contextCenter';
import { permissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { ContextFile, DriveFolder } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import FolderFormModal from './FolderFormModal.vue';
import UploadDocumentModal from './UploadDocumentModal.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

/**
 * ADR:2026-11-07-context-center-permission-gates — upload and folder
 * creation are hidden without page Create; folder and file deletion are
 * hidden without page Delete. A failed permission request leaves all
 * three false (fail-closed). Bulk-bar gates (move EditAll, delete Delete,
 * download ungated) ride the same flags in the bulk bar below.
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

const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');
const files = ref<ContextFile[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
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

/**
 * G-20 list shape (condition 4, pre-decided): official infinite scroll —
 * limit 100 + cursor append + "Load more", no prev/next pager.
 */
const PAGE_SIZE = 100;

async function loadFolders(): Promise<void> {
  try {
    folders.value = (await listDriveFolders({ limit: 100 })).data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  }
}

async function loadFirstPage(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const filePage = await listContextFiles({
      limit: PAGE_SIZE,
      folderId: selectedFolderId.value,
    });
    files.value = filePage.data;
    total.value = filePage.total;
    after.value = filePage.after;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    files.value = [];
    total.value = undefined;
    after.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !after.value || isSearching.value) {
    return;
  }
  loadingMore.value = true;
  try {
    const filePage = await listContextFiles({
      limit: PAGE_SIZE,
      folderId: selectedFolderId.value,
      after: after.value,
    });
    files.value = [...files.value, ...filePage.data];
    total.value = filePage.total;
    after.value = filePage.after;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loadingMore.value = false;
  }
}

/**
 * G-20 search: 300ms debounce, ES contextFile index, folder term filter
 * only when a folder is selected. Search state never touches the REST
 * list or load-more, and the header count follows the search result set.
 * ADR:2026-11-07-context-center-g20-search-size-100.
 */
const searchInput = ref('');
const debouncedSearch = ref('');
const isSearching = computed(() => debouncedSearch.value.trim().length > 0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;

async function runSearch(query: string): Promise<void> {
  const generation = ++searchGeneration;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await searchContextFiles(query, { folderId: selectedFolderId.value });
    if (generation !== searchGeneration) {
      return;
    }
    files.value = result.data;
    total.value = result.total;
    after.value = undefined;
  } catch (error) {
    if (generation !== searchGeneration) {
      return;
    }
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    files.value = [];
    total.value = undefined;
  } finally {
    if (generation === searchGeneration) {
      loading.value = false;
    }
  }
}

function applySearch(): void {
  searchTimer = undefined;
  const query = searchInput.value.trim();
  if (query.length === 0) {
    // Clearing the search restores the REST list from the first page.
    debouncedSearch.value = '';
    searchGeneration++;
    void loadFirstPage();
    return;
  }
  debouncedSearch.value = query;
  void runSearch(query);
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(applySearch, 300);
}

function onSearchEnter(): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  applySearch();
}

onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

async function refreshCurrent(): Promise<void> {
  if (isSearching.value) {
    await runSearch(debouncedSearch.value);
  } else {
    await loadFirstPage();
  }
}

function selectFolder(id: string | undefined): void {
  selectedFolderId.value = id;
  selectedIds.value = new Set();
  void router.replace({
    name: 'context-center-documents',
    query: id ? { folder: id } : {},
  });
  void refreshCurrent();
}

async function onUpload(value: { file: File; folderFqn?: string }): Promise<void> {
  try {
    await uploadDriveFile(value.file, value.folderFqn);
    showUploadModal.value = false;
    message.success(t('contextCenter.uploaded'));
    await loadFolders();
    void loadFirstPage();
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
    await loadFolders();
    void loadFirstPage();
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
    files.value = files.value.filter((item) => item.id !== file.id);
    total.value = total.value !== undefined ? Math.max(0, total.value - 1) : undefined;
    message.success(t('contextCenter.deleted'));
    void loadFolders();
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
    void loadFolders();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

/**
 * Multi-select + bulk bar (official DocumentsView ListHeader). The
 * selection is a Set of ids so it survives load-more appends; the bulk
 * bar replaces nothing — it renders above the table while any row is
 * selected.
 */
const selectedIds = ref<Set<string>>(new Set());
const showBulkDeleteModal = ref(false);
const bulkDeleting = ref(false);

const rowSelection = computed(() => ({
  selectedRowKeys: [...selectedIds.value],
  onChange: (keys: Array<string | number>) => {
    selectedIds.value = new Set(keys.map((key) => String(key)));
  },
}));

function clearSelection(): void {
  selectedIds.value = new Set();
}

async function onConfirmBulkDelete(): Promise<void> {
  const ids = [...selectedIds.value];
  if (ids.length === 0) {
    showBulkDeleteModal.value = false;
    return;
  }
  bulkDeleting.value = true;
  try {
    const result = await bulkDeleteDriveFiles(ids, false);
    const deletedIds = getBulkSuccessfulIds(result);
    const failedCount = result.numberOfRowsFailed ?? 0;
    if (deletedIds.size > 0) {
      files.value = files.value.filter((file) => !deletedIds.has(file.id));
      total.value = total.value !== undefined ? Math.max(0, total.value - deletedIds.size) : undefined;
      selectedIds.value = new Set([...selectedIds.value].filter((id) => !deletedIds.has(id)));
      message.success(t('contextCenter.deleted'));
      void loadFolders();
    }
    if (failedCount > 0) {
      // Official: the confirmation stays open on partial failure so the
      // failed rows (still selected) can be retried.
      message.error(t('contextCenter.bulkDeletePartial'));
    } else {
      showBulkDeleteModal.value = false;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    bulkDeleting.value = false;
  }
}

async function onBulkDownload(): Promise<void> {
  const ids = [...selectedIds.value];
  if (ids.length === 0) {
    return;
  }
  try {
    const blob = await downloadDriveFiles(ids);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'context-center-documents.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    clearSelection();
    message.success(t('contextCenter.downloaded'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onBulkMove(folderId: string): Promise<void> {
  const ids = [...selectedIds.value];
  if (ids.length === 0) {
    return;
  }
  try {
    const result = await bulkMoveFilesToFolder(ids, folderId);
    const movedIds = getBulkSuccessfulIds(result);
    const failedCount = result.numberOfRowsFailed ?? 0;
    const target = folders.value.find((folder) => folder.id === folderId);
    if (movedIds.size > 0) {
      files.value = files.value.map((file) =>
        movedIds.has(file.id)
          ? {
              ...file,
              folder: {
                id: folderId,
                name: target?.name ?? folderId,
                displayName: target?.displayName,
                type: 'folder',
              },
            }
          : file,
      );
      selectedIds.value = new Set([...selectedIds.value].filter((id) => !movedIds.has(id)));
      message.success(t('contextCenter.moved'));
      void loadFolders();
    }
    if (failedCount > 0) {
      message.error(t('contextCenter.bulkMovePartial'));
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

watch(
  () => route.query.folder,
  (folder) => {
    const id = (Array.isArray(folder) ? folder[0] : folder) ?? undefined;
    if (id !== selectedFolderId.value) {
      selectedFolderId.value = id;
      selectedIds.value = new Set();
      void refreshCurrent();
    }
  },
);

onMounted(() => {
  const folder = route.query.folder;
  selectedFolderId.value = (Array.isArray(folder) ? folder[0] : folder) ?? undefined;
  void loadFirstPage();
  void loadFolders();
  void loadPermissions();
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
          <Button
            v-if="canCreate"
            data-testid="documents-create-folder"
            @click="showFolderModal = true"
          >
            {{ t('contextCenter.createFolder') }}
          </Button>
          <Button
            v-if="selectedFolder && canDelete"
            danger
            data-testid="documents-delete-folder"
            @click="onDeleteFolder"
          >
            {{ t('contextCenter.deleteFolder') }}
          </Button>
        </Space>
      </Col>
      <Col :span="18">
        <div
          v-if="selectedIds.size > 0"
          data-testid="documents-bulk-bar"
          class="documents-bulk-bar"
        >
          <Typography.Text strong>
            {{ t('contextCenter.selectedCount', { count: selectedIds.size }) }}
          </Typography.Text>
          <Button data-testid="documents-bulk-clear" @click="clearSelection">
            {{ t('crud.clear') }}
          </Button>
          <span class="documents-bulk-bar__spacer" />
          <Button data-testid="documents-bulk-download" @click="onBulkDownload">
            {{ t('contextCenter.bulkDownload') }}
          </Button>
          <Dropdown v-if="canEditAll" :trigger="['click']">
            <Button data-testid="documents-bulk-move">
              {{ t('contextCenter.bulkMove') }}
            </Button>
            <template #overlay>
              <Menu>
                <Menu.Item
                  v-for="folder in folders"
                  :key="folder.id"
                  :data-testid="`bulk-move-to-${folder.id}`"
                  @click="onBulkMove(folder.id)"
                >
                  {{ folder.displayName || folder.name }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
          <Button
            v-if="canDelete"
            danger
            data-testid="documents-bulk-delete"
            @click="showBulkDeleteModal = true"
          >
            {{ t('contextCenter.bulkDelete') }}
          </Button>
        </div>
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
          :row-selection="rowSelection"
          show-search
          :search-value="searchInput"
          :search-placeholder="t('contextCenter.searchDocuments')"
          :empty-text="t('contextCenter.emptyDocuments')"
          show-row-actions
          :show-delete-action="canDelete"
          show-load-more
          :has-more="!!after && !isSearching"
          :loading-more="loadingMore"
          @update:search-value="onSearchInput"
          @search="onSearchEnter"
          @refresh="refreshCurrent()"
          @load-more="loadMore()"
          @view="previewFile = $event as ContextFile"
          @delete="onDeleteFile($event as ContextFile)"
        >
          <template #actions>
            <Button
              v-if="canCreate"
              type="primary"
              data-testid="documents-upload"
              @click="showUploadModal = true"
            >
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
    <Modal
      :open="showBulkDeleteModal"
      :title="t('contextCenter.bulkDeleteTitle')"
      :confirm-loading="bulkDeleting"
      :ok-text="t('crud.delete')"
      :cancel-text="t('crud.cancel')"
      :destroy-on-close="true"
      ok-type="danger"
      data-testid="documents-bulk-delete-modal"
      @ok="onConfirmBulkDelete"
      @cancel="showBulkDeleteModal = false"
    >
      <p>{{ t('contextCenter.bulkDeleteContent', { count: selectedIds.size }) }}</p>
    </Modal>
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
          <Button
            v-if="canDelete"
            danger
            data-testid="document-preview-delete"
            @click="onDeleteFile(previewFile)"
          >
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

.documents-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--sm-color-primary-bg);
  border-radius: 8px;
}

.documents-bulk-bar__spacer {
  flex: 1;
}
</style>
