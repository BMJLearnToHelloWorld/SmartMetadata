<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Alert, Button, Card, Descriptions, Form, Input, Select, Space, Spin, Table, Typography, message } from 'ant-design-vue';
import { addTaskComment, getTask, resolveTask } from '@/api/tasks';
import { TASK_RESOLUTIONS, type CollaborationTask } from '@/types/collaboration';

const props = defineProps<{ id: string }>();

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const task = ref<CollaborationTask | null>(null);
const form = reactive({
  resolutionType: 'Completed',
  comment: '',
  message: '',
});

const commentColumns = [
  { title: 'Author', key: 'author', width: 180 },
  { title: 'Message', dataIndex: 'message', key: 'message' },
];

const title = computed(
  () => task.value?.displayName || task.value?.name || props.id,
);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    task.value = await getTask(props.id);
  } catch (error) {
    task.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load task';
  } finally {
    loading.value = false;
  }
}

async function onResolve(): Promise<void> {
  saving.value = true;
  try {
    task.value = await resolveTask(props.id, {
      resolutionType: form.resolutionType as (typeof TASK_RESOLUTIONS)[number],
      comment: form.comment.trim() || undefined,
    });
    message.success('Task resolved');
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Resolve failed');
  } finally {
    saving.value = false;
  }
}

async function onComment(): Promise<void> {
  if (!form.message.trim()) {
    message.error('Comment message is required');
    return;
  }
  saving.value = true;
  try {
    task.value = await addTaskComment(props.id, form.message.trim());
    form.message = '';
    message.success('Comment added');
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Comment failed');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading">
  <Card>
    <Typography.Title :level="4">{{ title }}</Typography.Title>
    <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" class="collab-alert" />
    <template v-if="task">
      <Descriptions bordered :column="1" size="small">
        <Descriptions.Item label="Status">{{ task.status || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Category">{{ task.category || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Type">{{ task.type || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Priority">{{ task.priority || '—' }}</Descriptions.Item>
        <Descriptions.Item label="About">
          {{ task.about?.fullyQualifiedName || task.about?.name || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Assignees">
          {{ task.assignees.map((assignee) => assignee.displayName || assignee.name).join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="Description">{{ task.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title :level="5" class="collab-section">Resolve</Typography.Title>
      <Typography.Paragraph type="secondary">
        POST /api/v1/tasks/{id}/resolve with <code>resolutionType</code>. Workflow-owned types may
        reject a resolve that is not on their transition list.
      </Typography.Paragraph>
      <Space>
        <Select v-model:value="form.resolutionType" style="width: 180px">
          <Select.Option v-for="resolution in TASK_RESOLUTIONS" :key="resolution" :value="resolution">
            {{ resolution }}
          </Select.Option>
        </Select>
        <Input v-model:value="form.comment" placeholder="Optional comment" style="width: 280px" />
        <Button data-testid="resolve-task" type="primary" :loading="saving" @click="onResolve">Resolve</Button>
      </Space>
      <Typography.Title :level="5" class="collab-section">Comments</Typography.Title>
      <Table
        row-key="id"
        data-testid="task-comments-table"
        :columns="commentColumns"
        :data-source="task.comments"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'author'">
            {{ record.author?.displayName || record.author?.name || '—' }}
          </template>
        </template>
      </Table>
      <Form layout="vertical" class="collab-section">
        <Form.Item label="Add comment">
          <Input.TextArea v-model:value="form.message" data-testid="task-comment" :rows="2" />
        </Form.Item>
        <Button data-testid="add-task-comment" :loading="saving" @click="onComment">Add comment</Button>
      </Form>
    </template>
  </Card>
  </Spin>
</template>

<style scoped>
.collab-alert {
  margin-bottom: 16px;
}
.collab-section {
  margin-top: 24px;
}
</style>
