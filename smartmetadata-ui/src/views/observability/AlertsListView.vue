<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createEventSubscription, listEventSubscriptions } from '@/api/eventSubscriptions';
import { ALERT_TYPES, type EventSubscription } from '@/types/quality';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const alerts = ref<EventSubscription[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  alertType: 'Observability',
  webhookUrl: '',
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'alertType', key: 'alertType', width: 160 },
  { title: 'Enabled', key: 'enabled', width: 100 },
  { title: 'Destinations', key: 'destinations' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listEventSubscriptions({ limit: 50 });
    alerts.value = page.data;
    total.value = page.total;
  } catch (error) {
    alerts.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load alerts';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createEventSubscription({
      name: form.name.trim(),
      alertType: form.alertType,
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
      destinations: [
        {
          category: 'External',
          type: 'Webhook',
          config: { endpoint: form.webhookUrl.trim() },
        },
      ],
    });
    createOpen.value = false;
    message.success(`Created alert ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create alert failed');
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
      <div class="dq-head">
        <div>
          <Typography.Title :level="4">Alerts</Typography.Title>
          <Typography.Paragraph type="secondary">
            Event subscriptions at GET/POST /api/v1/events/subscriptions. Create requires
            <code>name</code>, <code>alertType</code>, and a webhook destination. Slack / email /
            filter-rule authoring is left residual.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-alert" @click="createOpen = true">Create webhook alert</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="alerts-table"
        :columns="columns"
        :data-source="alerts"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`alert-row-${(record as EventSubscription).id}`"
              @click.prevent="
                router.push({ name: 'observability-alert', params: { id: (record as EventSubscription).id } })
              "
            >
              {{ (record as EventSubscription).displayName || (record as EventSubscription).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'enabled'">
            {{ (record as EventSubscription).enabled === false ? 'no' : 'yes' }}
          </template>
          <template v-else-if="column.key === 'destinations'">
            {{
              (record as EventSubscription).destinations
                .map((destination) => destination.type || destination.category)
                .filter(Boolean)
                .join(', ') || '—'
            }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ alerts.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create webhook alert" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-alert-name" />
        </Form.Item>
        <Form.Item label="Alert type" required>
          <Select v-model:value="form.alertType">
            <Select.Option v-for="type in ALERT_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Webhook URL" required>
          <Input v-model:value="form.webhookUrl" data-testid="create-alert-webhook" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.dq-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
