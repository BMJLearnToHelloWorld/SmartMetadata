<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  patchAnnouncement,
  type AnnouncementPatchOp,
} from '@/api/announcements';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { requiredField } from '@/features/crud/formRules';
import { toEntityLink } from '@/quality/entityLink';
import { ANNOUNCEMENT_TYPES, type Announcement } from '@/types/collaboration';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const announcements = ref<Announcement[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  displayName: '',
  description: '',
  type: 'Notice',
  entityType: 'table',
  entityFqn: '',
  startLocal: '',
  endLocal: '',
});

const columns = computed(() => [
  { title: t('collaboration.announcements.titleCol'), key: 'title' },
  { title: t('collaboration.announcements.type'), dataIndex: 'type', key: 'type', width: 140 },
  { title: t('collaboration.announcements.status'), dataIndex: 'announcementStatus', key: 'announcementStatus', width: 120 },
  { title: t('collaboration.announcements.about'), dataIndex: 'entityLink', key: 'entityLink' },
  { title: t('collaboration.announcements.actions'), key: 'actions', width: 160 },
]);

const editOpen = ref(false);
const editing = ref(false);
const editingAnnouncement = ref<Announcement | null>(null);
const editForm = reactive({
  displayName: '',
  description: '',
  type: 'Notice',
  entityType: 'table',
  entityFqn: '',
  startLocal: '',
  endLocal: '',
});

function toLocalInput(epoch?: number): string {
  if (!epoch) {
    return '';
  }
  const date = new Date(epoch);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openEdit(announcement: Announcement): void {
  editingAnnouncement.value = announcement;
  editForm.displayName = announcement.displayName ?? '';
  editForm.description = announcement.description ?? '';
  editForm.type = announcement.type ?? 'Notice';
  // Parse the stored entity link back into the form's type + FQN fields so
  // an unchanged edit does not silently turn into an entityLink remove op.
  const linkParts = (announcement.entityLink ?? '').replace(/^<#E::/, '').replace(/>$/, '').split('::');
  editForm.entityType = linkParts[0] || 'table';
  editForm.entityFqn = linkParts.slice(1).join('::');
  editForm.startLocal = toLocalInput(announcement.startTime);
  editForm.endLocal = toLocalInput(announcement.endTime);
  editOpen.value = true;
}

async function onDelete(announcement: Announcement): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('collaboration.announcements.deleteConfirmTitle'),
    content: t('collaboration.announcements.deleteConfirmContent'),
    okText: t('collaboration.announcements.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteAnnouncement(announcement.id);
    message.success(t('collaboration.announcements.deleted'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.announcements.deleteFailed'));
  }
}

/**
 * Patch ops are built from a field descriptor table: only fields whose
 * value actually changed produce an op, so an unchanged edit sends no
 * request at all (and never a full-object PUT disguised as a patch).
 */
async function onUpdate(): Promise<void> {
  const current = editingAnnouncement.value;
  if (!current) {
    return;
  }
  editing.value = true;
  try {
    const nextEntityLink = editForm.entityFqn.trim()
      ? toEntityLink(editForm.entityType, editForm.entityFqn)
      : undefined;
    const fields: Array<{ path: string; next: unknown; prev: unknown }> = [
      { path: '/displayName', next: editForm.displayName.trim() || undefined, prev: current.displayName },
      { path: '/description', next: editForm.description.trim(), prev: current.description },
      { path: '/type', next: editForm.type, prev: current.type },
      { path: '/startTime', next: toEpoch(editForm.startLocal), prev: current.startTime },
      { path: '/endTime', next: toEpoch(editForm.endLocal), prev: current.endTime },
      { path: '/entityLink', next: nextEntityLink, prev: current.entityLink },
    ];
    const ops: AnnouncementPatchOp[] = fields.flatMap((field) => {
      if (field.next === field.prev) {
        return [];
      }
      if (field.next === undefined) {
        return [{ op: 'remove' as const, path: field.path }];
      }
      return [{ op: 'replace' as const, path: field.path, value: field.next }];
    });
    if (!ops.length) {
      editOpen.value = false;
      message.info(t('collaboration.announcements.noChanges'));
      return;
    }
    await patchAnnouncement(current.id, ops);
    editOpen.value = false;
    message.success(t('collaboration.announcements.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.announcements.updateFailed'));
  } finally {
    editing.value = false;
  }
}

function toEpoch(local: string): number {
  const value = new Date(local).getTime();
  if (!Number.isFinite(value)) {
    throw new Error(t('collaboration.announcements.invalidTimes'));
  }
  return value;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listAnnouncements({ limit: 50 });
    announcements.value = page.data;
    total.value = page.total;
  } catch (error) {
    announcements.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.announcements.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    await createAnnouncement({
      description: form.description.trim(),
      startTime: toEpoch(form.startLocal),
      endTime: toEpoch(form.endLocal),
      displayName: form.displayName.trim() || undefined,
      type: form.type as (typeof ANNOUNCEMENT_TYPES)[number],
      entityLink: form.entityFqn.trim() ? toEntityLink(form.entityType, form.entityFqn) : undefined,
    });
    createOpen.value = false;
    message.success(t('collaboration.announcements.created'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.announcements.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="collab-head">
        <PageHeader :header="t('collaboration.announcements.title')" :sub-header="t('collaboration.announcements.lead')" />
        <Button type="primary" data-testid="create-announcement" @click="createOpen = true">
          {{ t('collaboration.announcements.create') }}
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <SmTable
        row-key="id"
        test-id="announcements-table"
        :columns="columns"
        :data-source="announcements"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'title'">
            {{
              (record as Announcement).displayName ||
              (record as Announcement).name ||
              (record as Announcement).description ||
              (record as Announcement).id
            }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <Button
                size="small"
                :data-testid="`announcement-edit-${(record as Announcement).id}`"
                @click="openEdit(record as Announcement)"
              >
                {{ t('collaboration.announcements.edit') }}
              </Button>
              <Button
                size="small"
                danger
                :data-testid="`announcement-delete-${(record as Announcement).id}`"
                @click="onDelete(record as Announcement)"
              >
                {{ t('collaboration.announcements.delete') }}
              </Button>
            </Space>
          </template>
        </template>
      </SmTable>
      <Typography.Text type="secondary">
        {{
          total !== undefined
            ? t('crud.shownOf', { shown: announcements.length, total })
            : t('crud.shown', { shown: announcements.length })
        }}
      </Typography.Text>
    </Space>
    <FormModal
      :open="createOpen"
      :title="t('collaboration.announcements.createTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
    @cancel="createOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.announcements.displayName')" :extra="t('collaboration.announcements.displayNameHelp')">
          <Input v-model:value="form.displayName" data-testid="announcement-title" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.description')" :rules="requiredField(t, t('collaboration.announcements.description'))">
          <Input.TextArea v-model:value="form.description" data-testid="announcement-description" :rows="3" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.type')" :extra="t('collaboration.announcements.typeHelp')">
          <Select v-model:value="form.type">
            <Select.Option v-for="type in ANNOUNCEMENT_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.start')" :rules="requiredField(t, t('collaboration.announcements.start'))">
          <Input v-model:value="form.startLocal" type="datetime-local" data-testid="announcement-start" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.end')" :rules="requiredField(t, t('collaboration.announcements.end'))">
          <Input v-model:value="form.endLocal" type="datetime-local" data-testid="announcement-end" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.entityType')" :extra="t('collaboration.announcements.entityTypeHelp')">
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.fqn')" :extra="t('collaboration.announcements.fqnHelp')">
          <Input v-model:value="form.entityFqn" :placeholder="t('collaboration.announcements.fqnPlaceholder')" />
        </Form.Item>
      </Form>
    </FormModal>
    <FormModal
      :open="editOpen"
      :title="t('collaboration.announcements.editTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="editing"
      @ok="onUpdate"
      @cancel="editOpen = false"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.announcements.displayName')" :extra="t('collaboration.announcements.displayNameHelp')">
          <Input v-model:value="editForm.displayName" data-testid="announcement-edit-title" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.description')" :rules="requiredField(t, t('collaboration.announcements.description'))">
          <Input.TextArea v-model:value="editForm.description" data-testid="announcement-edit-description" :rows="3" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.type')" :extra="t('collaboration.announcements.typeHelp')">
          <Select v-model:value="editForm.type">
            <Select.Option v-for="type in ANNOUNCEMENT_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.start')" :rules="requiredField(t, t('collaboration.announcements.start'))">
          <Input v-model:value="editForm.startLocal" type="datetime-local" data-testid="announcement-edit-start" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.end')" :rules="requiredField(t, t('collaboration.announcements.end'))">
          <Input v-model:value="editForm.endLocal" type="datetime-local" data-testid="announcement-edit-end" />
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.entityType')" :extra="t('collaboration.announcements.entityTypeHelp')">
          <Select v-model:value="editForm.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.announcements.fqn')" :extra="t('collaboration.announcements.fqnHelp')">
          <Input v-model:value="editForm.entityFqn" :placeholder="t('collaboration.announcements.fqnPlaceholder')" />
        </Form.Item>
      </Form>
    </FormModal>
  </Card>
</template>

<style scoped>
.collab-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
