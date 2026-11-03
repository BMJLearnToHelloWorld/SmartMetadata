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
import { Button, Select, Switch, Typography, message } from 'ant-design-vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { EntityListColumn } from '@/features/crud/types';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import {
  createContextMemory,
  deleteContextMemory,
  listContextMemories,
  pinContextMemory,
  unpinContextMemory,
} from '@/api/contextCenter';
import type { ContextMemory } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import MemoryFormModal from './MemoryFormModal.vue';
import { formatEpoch } from './time';

const { t } = useI18n();

const loading = ref(false);
const errorMessage = ref('');
const memories = ref<ContextMemory[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const before = ref<string | undefined>();
const selectedStatuses = ref<string[]>(['Approved', 'Unprocessed']);
const pinnedOnly = ref(false);
const sortBy = ref('updatedAt');
const showCreateModal = ref(false);
const previewMemory = ref<ContextMemory | null>(null);

const statusOptions = computed(() => [
  { value: 'Unprocessed', label: t('contextCenter.statusUnprocessed') },
  { value: 'Draft', label: t('contextCenter.statusDraft') },
  { value: 'Approved', label: t('contextCenter.statusApproved') },
  { value: 'Superseded', label: t('contextCenter.statusSuperseded') },
  { value: 'Invalidated', label: t('contextCenter.statusInvalidated') },
  { value: 'Archived', label: t('contextCenter.statusArchived') },
  { value: 'Rejected', label: t('contextCenter.statusRejected') },
  { value: 'Deprecated', label: t('contextCenter.statusDeprecated') },
]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('contextCenter.question'), dataIndex: 'question', key: 'question' },
  { title: t('contextCenter.status'), dataIndex: 'entityStatus', key: 'entityStatus' },
  { title: t('contextCenter.pinned'), dataIndex: 'pinnedLabel', key: 'pinnedLabel' },
  { title: t('contextCenter.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy' },
  { title: t('contextCenter.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
]);

async function load(cursor?: { after?: string; before?: string }): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listContextMemories({
      limit: 25,
      statuses: selectedStatuses.value.join(',') || undefined,
      pinned: pinnedOnly.value ? true : undefined,
      sortBy: sortBy.value,
      sortOrder: 'desc',
      after: cursor?.after,
      before: cursor?.before,
    });
    memories.value = result.data;
    total.value = result.total;
    after.value = result.after;
    before.value = result.before;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    memories.value = [];
    total.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function onCreate(value: {
  question: string;
  answer?: string;
  description?: string;
}): Promise<void> {
  try {
    await createContextMemory(value);
    showCreateModal.value = false;
    message.success(t('contextCenter.created'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onTogglePin(memory: ContextMemory): Promise<void> {
  try {
    if (memory.pinned) {
      await unpinContextMemory(memory.id);
      message.success(t('contextCenter.unpinned'));
    } else {
      await pinContextMemory(memory.id);
      message.success(t('contextCenter.pinned'));
    }
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function onDelete(memory: ContextMemory): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteMemory'),
    content: memory.question || memory.displayName || memory.id,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteContextMemory(memory.id, true);
    message.success(t('contextCenter.deleted'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="context-center-memories">
    <ContextCenterNav />
    <EntityListShell
      :title="t('contextCenter.memories')"
      :lead="t('contextCenter.memoriesLead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="
        memories.map((memory) => ({
          ...memory,
          question: memory.question || memory.displayName || '',
          pinnedLabel: memory.pinned ? t('contextCenter.yes') : '',
          updatedAt: formatEpoch(memory.updatedAt),
        }))
      "
      row-key="id"
      table-test-id="memories-table"
      :total="total"
      :has-next="!!after"
      :has-prev="!!before"
      :empty-text="t('contextCenter.emptyMemories')"
      show-row-actions
      show-delete-action
      @refresh="load()"
      @next="load({ after: after })"
      @prev="load({ before: before })"
      @view="previewMemory = $event as ContextMemory"
      @delete="onDelete($event as ContextMemory)"
    >
      <template #actions>
        <Button type="primary" data-testid="memories-create" @click="showCreateModal = true">
          {{ t('contextCenter.createMemory') }}
        </Button>
      </template>
      <template #filters>
        <Select
          v-model:value="selectedStatuses"
          mode="multiple"
          style="min-width: 220px"
          data-testid="memories-status-filter"
          :options="statusOptions"
          @change="load()"
        />
        <span>
          {{ t('contextCenter.pinnedOnly') }}
          <Switch
            v-model:checked="pinnedOnly"
            data-testid="memories-pinned-filter"
            @change="load()"
          />
        </span>
        <Select
          v-model:value="sortBy"
          style="min-width: 160px"
          data-testid="memories-sort"
          :options="[
            { value: 'updatedAt', label: t('contextCenter.sortUpdatedAt') },
            { value: 'updatedBy', label: t('contextCenter.sortUpdatedBy') },
          ]"
          @change="load()"
        />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pinnedLabel'">
          <Button
            type="link"
            :data-testid="`memory-pin-${(record as ContextMemory).id}`"
            @click="onTogglePin(record as ContextMemory)"
          >
            {{
              (record as ContextMemory).pinned
                ? t('contextCenter.unpin')
                : t('contextCenter.pin')
            }}
          </Button>
        </template>
        <template v-else>
          {{ (record as Record<string, unknown>)[String(column.dataIndex ?? '')] }}
        </template>
      </template>
    </EntityListShell>
    <SmDrawer
      :open="!!previewMemory"
      :title="previewMemory?.displayName || previewMemory?.question || ''"
      :show-ok="false"
      test-id="memory-preview-drawer"
      @cancel="previewMemory = null"
      @update:open="previewMemory = $event ? previewMemory : null"
    >
      <div v-if="previewMemory">
        <Typography.Paragraph>
          {{ t('contextCenter.question') }}: {{ previewMemory.question || '' }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="previewMemory.answer">
          {{ t('contextCenter.answer') }}: {{ previewMemory.answer }}
        </Typography.Paragraph>
        <Typography.Paragraph v-if="previewMemory.description">
          {{ previewMemory.description }}
        </Typography.Paragraph>
        <p>
          {{ t('contextCenter.status') }}: {{ previewMemory.entityStatus || '' }} ·
          {{ t('contextCenter.updatedBy') }}: {{ previewMemory.updatedBy || '' }}
          {{ formatEpoch(previewMemory.updatedAt) }}
        </p>
        <Button
          data-testid="memory-preview-pin"
          @click="onTogglePin(previewMemory)"
        >
          {{ previewMemory.pinned ? t('contextCenter.unpin') : t('contextCenter.pin') }}
        </Button>
      </div>
    </SmDrawer>
    <MemoryFormModal
      :open="showCreateModal"
      @ok="onCreate"
      @cancel="showCreateModal = false"
      @update:open="showCreateModal = $event"
    />
  </div>
</template>
