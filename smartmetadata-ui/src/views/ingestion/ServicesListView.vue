<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'ant-design-vue';
import { createDatabaseService, listDatabaseServices } from '@/api/databaseServices';
import { createMessagingService, listMessagingServices } from '@/api/messagingServices';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import { buildServiceConnection } from '@/ingestion/connections';
import {
  DATABASE_SERVICE_TYPES,
  MESSAGING_SERVICE_TYPES,
  type CatalogService,
  type ServiceFormValues,
  type ServiceKind,
} from '@/types/ingestion';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const services = ref<CatalogService[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive<ServiceFormValues>({
  name: '',
  displayName: '',
  description: '',
  kind: 'database',
  serviceType: 'Postgres',
  hostPort: '',
  username: '',
  database: '',
  databaseName: '',
  databaseSchema: '',
  account: '',
  warehouse: '',
  role: '',
  bootstrapServers: '',
  schemaRegistryURL: '',
  password: '',
  storeConnectionSecrets: false,
});

const typeOptions = computed(() =>
  form.kind === 'database' ? DATABASE_SERVICE_TYPES : MESSAGING_SERVICE_TYPES,
);

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Kind', dataIndex: 'kind', key: 'kind', width: 120 },
  { title: 'Type', dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: 'FQN', dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
];

function resetForm(): void {
  form.name = '';
  form.displayName = '';
  form.description = '';
  form.kind = 'database';
  form.serviceType = 'Postgres';
  form.hostPort = '';
  form.username = '';
  form.database = '';
  form.databaseName = '';
  form.databaseSchema = '';
  form.account = '';
  form.warehouse = '';
  form.role = '';
  form.bootstrapServers = '';
  form.schemaRegistryURL = '';
  form.password = '';
  form.storeConnectionSecrets = false;
}

function onKindChange(kind: ServiceKind): void {
  form.kind = kind;
  form.serviceType = kind === 'database' ? 'Postgres' : 'Kafka';
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [databases, messaging] = await Promise.all([
      listDatabaseServices({ limit: 100 }),
      listMessagingServices({ limit: 100 }),
    ]);
    services.value = [...databases.data, ...messaging.data];
    total.value = (databases.total ?? databases.data.length) + (messaging.total ?? messaging.data.length);
  } catch (error) {
    services.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load services';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const connection = buildServiceConnection(form);
    const body = {
      name: form.name.trim(),
      serviceType: form.serviceType,
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
      connection,
    };
    const created =
      form.kind === 'database' ? await createDatabaseService(body) : await createMessagingService(body);
    createOpen.value = false;
    resetForm();
    message.success(`Created service ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create service failed');
  } finally {
    creating.value = false;
  }
}

function openDetail(service: CatalogService): void {
  void router.push({
    name: 'ingestion-service',
    params: { kind: service.kind, id: service.id },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="ing-head">
        <div>
          <Typography.Title :level="4">Services</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/services/databaseServices and /messagingServices. Create requires
            <code>name</code> + <code>serviceType</code>. Connection fields match
            <code>smartmetadata-ingestion</code> Postgres / MySQL / Snowflake / Kafka. Dashboard and
            pipeline services are not wired.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-service" @click="createOpen = true">Create service</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="services-table"
        :columns="columns"
        :data-source="services"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`service-row-${(record as CatalogService).id}`"
              @click.prevent="openDetail(record as CatalogService)"
            >
              {{ (record as CatalogService).displayName || (record as CatalogService).name }}
            </a>
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ services.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
      </Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create service" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Kind" required>
          <Select :value="form.kind" data-testid="create-service-kind" @update:value="onKindChange">
            <Select.Option value="database">Database</Select.Option>
            <Select.Option value="messaging">Messaging</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Service type" required>
          <Select v-model:value="form.serviceType" data-testid="create-service-type">
            <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-service-name" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="3" />
        </Form.Item>
        <ServiceConnectionFields :form="form" />
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.ing-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
