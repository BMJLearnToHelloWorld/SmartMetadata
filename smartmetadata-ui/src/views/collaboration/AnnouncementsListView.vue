<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createAnnouncement, listAnnouncements } from '@/api/announcements';
import { toEntityLink } from '@/quality/entityLink';
import { ANNOUNCEMENT_TYPES, type Announcement } from '@/types/collaboration';

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

const columns = [
  { title: 'Title', key: 'title' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 140 },
  { title: 'Status', dataIndex: 'announcementStatus', key: 'announcementStatus', width: 120 },
  { title: 'About', dataIndex: 'entityLink', key: 'entityLink' },
];

function toEpoch(local: string): number {
  const value = new Date(local).getTime();
  if (!Number.isFinite(value)) {
    throw new Error('Start and end times must be valid');
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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load announcements';
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
    message.success('Created announcement');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create announcement failed');
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
        <div>
          <Typography.Title :level="4">Announcements</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/announcements. Create requires <code>description</code>,
            <code>startTime</code>, and <code>endTime</code>. A missing entity link is a
            system announcement and needs admin.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-announcement" @click="createOpen = true">
          Create announcement
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="announcements-table"
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
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ announcements.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal
      v-model:open="createOpen"
      title="Create announcement"
      :confirm-loading="creating"
      @ok="onCreate"
    >
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" data-testid="announcement-title" />
        </Form.Item>
        <Form.Item label="Description" required>
          <Input.TextArea v-model:value="form.description" data-testid="announcement-description" :rows="3" />
        </Form.Item>
        <Form.Item label="Type">
          <Select v-model:value="form.type">
            <Select.Option v-for="type in ANNOUNCEMENT_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Start" required>
          <Input v-model:value="form.startLocal" type="datetime-local" data-testid="announcement-start" />
        </Form.Item>
        <Form.Item label="End" required>
          <Input v-model:value="form.endLocal" type="datetime-local" data-testid="announcement-end" />
        </Form.Item>
        <Form.Item label="About entity type">
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="About FQN">
          <Input v-model:value="form.entityFqn" placeholder="leave empty for a system announcement" />
        </Form.Item>
      </Form>
    </Modal>
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
