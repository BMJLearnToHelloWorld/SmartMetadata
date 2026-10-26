<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { listActivityEvents } from '@/api/activity';
import { createConversation } from '@/api/conversations';
import { assetLocation } from '@/catalog/entityRoutes';
import { toEntityLink } from '@/quality/entityLink';
import type { ActivityEvent } from '@/types/collaboration';

const router = useRouter();
const { t } = useI18n();
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

const columns = computed(() => [
  { title: t('collaboration.activity.when'), key: 'timestamp', width: 180 },
  { title: t('collaboration.activity.type'), dataIndex: 'eventType', key: 'eventType', width: 180 },
  { title: t('collaboration.activity.summary'), key: 'summary' },
  { title: t('collaboration.activity.asset'), key: 'entity' },
  { title: t('collaboration.activity.actor'), key: 'actor', width: 160 },
]);

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
    errorMessage.value = error instanceof Error ? error.message : t('collaboration.activity.loadFailed');
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
    message.success(t('collaboration.activity.posted'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('collaboration.activity.createFailed'));
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
          <Typography.Title :level="4">{{ t('collaboration.activity.title') }}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {{ t('collaboration.activity.lead') }}
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-conversation" @click="createOpen = true">
          {{ t('collaboration.activity.post') }}
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
        {{
          total !== undefined
            ? t('crud.shownOf', { shown: events.length, total })
            : t('crud.shown', { shown: events.length })
        }}
      </Typography.Text>
    </Space>
    <Modal
      v-model:open="createOpen"
      :title="t('collaboration.activity.createTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
    >
      <Form layout="vertical">
        <Form.Item :label="t('collaboration.activity.entityType')" required>
          <Select v-model:value="form.entityType">
            <Select.Option value="table">table</Select.Option>
            <Select.Option value="topic">topic</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('collaboration.activity.fqn')" required>
          <Input v-model:value="form.entityFqn" data-testid="conversation-fqn" />
        </Form.Item>
        <Form.Item :label="t('collaboration.activity.message')" required>
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
