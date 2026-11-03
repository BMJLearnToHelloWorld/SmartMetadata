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
import { Button, Menu, Tabs, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import { useAuthStore } from '@/stores/auth';
import {
  deleteDriveFile,
  getContextFileById,
  listArchivedContextFiles,
  restoreDriveFile,
} from '@/api/contextCenter';
import type { ContextFile } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const auth = useAuthStore();

/** Official archive tabs: all archived documents, or only the ones I archived. */
const filter = ref<'all' | 'mine'>('all');
const loading = ref(false);
const errorMessage = ref('');
const files = ref<ContextFile[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();

const previewFile = ref<ContextFile | null>(null);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.name'), dataIndex: 'name', key: 'name' },
  { title: t('contextCenter.fileExtension'), dataIndex: 'fileExtension', key: 'fileExtension' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listArchivedContextFiles({
      limit: 25,
      updatedBy: filter.value === 'mine' ? auth.user?.name : undefined,
      after: cursor?.after,
      before: cursor?.before,
    });
    files.value = result.data;
    total.value = result.total;
    after.value = result.after;
    before.value = result.before;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    files.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function onPreview(file: ContextFile): Promise<void> {
  try {
    previewFile.value = await getContextFileById(file.id, 'all');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onRestore(file: ContextFile): Promise<void> {
  try {
    await restoreDriveFile(file.id);
    message.success(t('contextCenter.restored'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onHardDelete(file: ContextFile): Promise<void> {
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
    await deleteDriveFile(file.id, true);
    message.success(t('contextCenter.deleted'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

function onFilterChange(key: string | number): void {
  filter.value = key as 'all' | 'mine';
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="context-center-archive">
    <ContextCenterNav />
    <EntityListShell
      :title="t('contextCenter.archive')"
      :lead="t('contextCenter.archiveLead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="
        files.map((file) => ({
          ...file,
          updatedAt: formatEpoch(file.updatedAt),
        }))
      "
      row-key="id"
      table-test-id="archive-table"
      :total="total"
      :has-next="!!after"
      :has-prev="!!before"
      :empty-text="t('contextCenter.emptyArchive')"
      show-row-actions
      show-delete-action
      @refresh="load()"
      @next="load({ after: after })"
      @prev="load({ before: before })"
      @view="onPreview($event as ContextFile)"
      @delete="onHardDelete($event as ContextFile)"
    >
      <template #filters>
        <Tabs :active-key="filter" data-testid="archive-filter-tabs" @change="onFilterChange">
          <Tabs.TabPane key="all" :tab="t('contextCenter.allItems')" />
          <Tabs.TabPane key="mine" :tab="t('contextCenter.myItems')" />
        </Tabs>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <Button type="link" @click="onPreview(record as ContextFile)">
            {{ (record as ContextFile).displayName || (record as ContextFile).name }}
          </Button>
        </template>
        <template v-else>
          {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
        </template>
      </template>
      <template #rowActions="{ record }">
        <Menu.Item
          key="restore"
          data-testid="row-action-restore"
          @click="onRestore(record as ContextFile)"
        >
          {{ t('contextCenter.restore') }}
        </Menu.Item>
      </template>
    </EntityListShell>
    <SmDrawer
      :open="!!previewFile"
      :title="previewFile?.displayName || previewFile?.name || ''"
      :show-ok="false"
      test-id="archive-preview-drawer"
      @cancel="previewFile = null"
      @update:open="previewFile = $event ? previewFile : null"
    >
      <div v-if="previewFile">
        <Typography.Paragraph v-if="previewFile.description">
          {{ previewFile.description }}
        </Typography.Paragraph>
        <p>
          {{ t('contextCenter.fileExtension') }}: {{ previewFile.fileExtension || '' }} ·
          {{ t('contextCenter.updatedBy') }}: {{ previewFile.updatedBy || '' }}
          {{ formatEpoch(previewFile.updatedAt) }}
        </p>
        <Button
          type="primary"
          data-testid="archive-preview-restore"
          @click="onRestore(previewFile)"
        >
          {{ t('contextCenter.restore') }}
        </Button>
      </div>
    </SmDrawer>
  </div>
</template>
