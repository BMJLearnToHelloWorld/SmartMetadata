<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createDatabaseService, deleteDatabaseService, listDatabaseServices } from '@/api/databaseServices';
import { createMessagingService, deleteMessagingService, listMessagingServices } from '@/api/messagingServices';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import { entityLabel } from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { buildServiceConnection } from '@/ingestion/connections';
import {
  DATABASE_SERVICE_TYPES,
  MESSAGING_SERVICE_TYPES,
  type CatalogService,
  type ServiceFormValues,
  type ServiceKind,
} from '@/types/ingestion';

const { t } = useI18n();
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

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.services.kind'), dataIndex: 'kind', key: 'kind', width: 120 },
  { title: t('crud.type'), dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

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
    total.value =
      databases.total !== undefined && messaging.total !== undefined
        ? databases.total + messaging.total
        : undefined;
  } catch (error) {
    services.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
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
    message.success(t('ingestion.services.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
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

async function onDelete(service: CatalogService): Promise<void> {
  if (!window.confirm(t('ingestion.services.deleteConfirm', { name: service.name }))) {
    return;
  }
  try {
    if (service.kind === 'messaging') {
      await deleteMessagingService(service.id);
    } else {
      await deleteDatabaseService(service.id);
    }
    message.success(t('ingestion.services.deleted', { name: service.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('ingestion.services.title')"
    :lead="t('ingestion.services.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="services"
    table-test-id="services-table"
    show-row-actions
    show-edit-action
    show-delete-action
    :total="total"
    @refresh="load"
    @view="openDetail($event as CatalogService)"
    @edit="openDetail($event as CatalogService)"
    @delete="onDelete($event as CatalogService)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-service" @click="createOpen = true">
        {{ t('ingestion.services.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`service-row-${(record as CatalogService).id}`"
          @click.prevent="openDetail(record as CatalogService)"
        >
          {{ entityLabel(record as CatalogService) }}
        </a>
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('ingestion.services.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('ingestion.services.kind')" required>
        <Select :value="form.kind" data-testid="create-service-kind" @update:value="onKindChange">
          <Select.Option value="database">{{ t('ingestion.services.database') }}</Select.Option>
          <Select.Option value="messaging">{{ t('ingestion.services.messaging') }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.type')" required>
        <Select v-model:value="form.serviceType" data-testid="create-service-type">
          <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-service-name" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <ServiceConnectionFields :form="form" />
    </Form>
  </Modal>
</template>
