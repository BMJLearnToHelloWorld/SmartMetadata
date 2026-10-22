<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createTask, listTasks } from '@/api/tasks';
import { toEntityLink } from '@/quality/entityLink';
import {
  CREATABLE_TASK_TYPES,
  TASK_CATEGORIES,
  type CollaborationTask,
} from '@/types/collaboration';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const tasks = ref<CollaborationTask[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  category: 'Custom',
  type: 'CustomTask',
  description: '',
  entityType: 'table',
  entityFqn: '',
  assignees: '',
});

const columns = [
  { title: 'Name', key: 'name' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 180 },
  { title: 'Status', dataIndex: 'status', key: 'status', width: 120 },
  { title: 'About', key: 'about' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTasks({ limit: 50, statusGroup: 'open' });
    tasks.value = page.data;
    total.value = page.total;
  } catch (error) {
    tasks.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load tasks';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const assignees = form.assignees
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const created = await createTask({
      category: form.category as (typeof TASK_CATEGORIES)[number],
      type: form.type as (typeof CREATABLE_TASK_TYPES)[number],
      description: form.description.trim() || undefined,
      about: form.entityFqn.trim() ? toEntityLink(form.entityType, form.entityFqn) : undefined,
      assignees: assignees.length ? assignees : undefined,
    });
    createOpen.value = false;
    message.success(`Created task ${created.name || created.id}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create task failed');
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
          <Typography.Title :level="4">Tasks</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/tasks. Create requires <code>category</code> +
            <code>type</code>. MemoryConflictReview and MetadataCompletion are
            server-opened and are not offered here.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-task" @click="createOpen = true">Create task</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="tasks-table"
        :columns="columns"
        :data-source="tasks"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`task-row-${(record as CollaborationTask).id}`"
              @click.prevent="router.push({ name: 'task', params: { id: (record as CollaborationTask).id } })"
            >
              {{
                (record as CollaborationTask).displayName ||
                (record as CollaborationTask).name ||
                (record as CollaborationTask).id
              }}
            </a>
          </template>
          <template v-else-if="column.key === 'about'">
            {{
              (record as CollaborationTask).about?.fullyQualifiedName ||
              (record as CollaborationTask).about?.name ||
              '—'
            }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ tasks.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create task" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Category" required>
          <Select v-model:value="form.category">
            <Select.Option v-for="category in TASK_CATEGORIES" :key="category" :value="category">
              {{ category }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Type" required>
          <Select v-model:value="form.type">
            <Select.Option v-for="type in CREATABLE_TASK_TYPES" :key="type" :value="type">
              {{ type }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" data-testid="create-task-description" :rows="3" />
        </Form.Item>
        <Form.Item label="About entity type">
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="About FQN">
          <Input v-model:value="form.entityFqn" data-testid="create-task-fqn" />
        </Form.Item>
        <Form.Item label="Assignee FQNs">
          <Input v-model:value="form.assignees" placeholder="comma-separated user or team FQNs" />
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
