<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { listActivityEvents } from '@/api/activity';
import { createConversation } from '@/api/conversations';
import { assetLocation } from '@/catalog/entityRoutes';
import { toEntityLink } from '@/quality/entityLink';
import type { ActivityEvent } from '@/types/collaboration';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const events = ref<ActivityEvent[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  entityType: 'table',
  entityFqn: '',
  message: '',
});

const columns = [
  { title: 'When', key: 'timestamp', width: 180 },
  { title: 'Type', dataIndex: 'eventType', key: 'eventType', width: 180 },
  { title: 'Summary', key: 'summary' },
  { title: 'Asset', key: 'entity' },
  { title: 'Actor', key: 'actor', width: 160 },
];

function formatTime(value?: number): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listActivityEvents({ days: 7, limit: 50 });
    events.value = page.data;
    total.value = page.total;
  } catch (error) {
    events.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load activity';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    await createConversation({
      message: form.message.trim(),
      about: toEntityLink(form.entityType, form.entityFqn),
    });
    createOpen.value = false;
    form.message = '';
    message.success('Posted conversation');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create conversation failed');
  } finally {
    creating.value = false;
  }
}

function openAsset(event: ActivityEvent): void {
  const type = event.entity?.type;
  const fqn = event.entity?.fullyQualifiedName || event.entity?.name;
  if (!type || !fqn) {
    return;
  }
  void router.push(assetLocation(type, fqn));
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
          <Typography.Title :level="4">Activity</Typography.Title>
          <Typography.Paragraph type="secondary">
            Change feed from GET /api/v1/activity. Operator comments are POST
            /api/v1/conversations (<code>message</code> + MessageParser
            <code>about</code>). There is no <code>/v1/feed</code> on this server.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-conversation" @click="createOpen = true">
          Post conversation
        </Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="activity-table"
        :columns="columns"
        :data-source="events"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTime((record as ActivityEvent).timestamp) }}
          </template>
          <template v-else-if="column.key === 'summary'">
            {{ (record as ActivityEvent).summary || (record as ActivityEvent).fieldName || '—' }}
          </template>
          <template v-else-if="column.key === 'entity'">
            <a
              v-if="(record as ActivityEvent).entity?.type && ((record as ActivityEvent).entity?.fullyQualifiedName || (record as ActivityEvent).entity?.name)"
              href="#"
              @click.prevent="openAsset(record as ActivityEvent)"
            >
              {{
                (record as ActivityEvent).entity?.fullyQualifiedName ||
                (record as ActivityEvent).entity?.name
              }}
            </a>
            <span v-else>—</span>
          </template>
          <template v-else-if="column.key === 'actor'">
            {{
              (record as ActivityEvent).actor?.displayName ||
              (record as ActivityEvent).actor?.name ||
              '—'
            }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ events.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Post conversation" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Entity type" required>
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="FQN" required>
          <Input v-model:value="form.entityFqn" data-testid="conversation-fqn" />
        </Form.Item>
        <Form.Item label="Message" required>
          <Input.TextArea v-model:value="form.message" data-testid="conversation-message" :rows="3" />
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
