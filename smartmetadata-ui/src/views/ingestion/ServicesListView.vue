<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, Select, Tabs, message } from 'ant-design-vue';
import { listDatabaseServices } from '@/api/databaseServices';
import { listDashboardServices } from '@/api/dashboardServices';
import { listMessagingServices } from '@/api/messagingServices';
import { listStorageServices } from '@/api/storageServices';
import { listPipelineServices } from '@/api/pipelineServices';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import { entityLabel } from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import {
  SERVICE_KIND_DEFAULT_TYPE,
  SERVICE_TYPES_BY_KIND,
  buildServiceConnection,
  createEmptyServiceForm,
} from '@/ingestion/connections';
import { SERVICE_CREATE_API, SERVICE_DELETE_API } from '@/ingestion/serviceApis';
import type { CatalogService, ServiceFormValues, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const services = ref<CatalogService[]>([]);
const total = ref<number | undefined>();
const activeKind = ref<string>('all');
const supportedCategories = computed(() => SERVICE_CATEGORIES.filter((row) => row.supported));
const filteredServices = computed(() =>
  activeKind.value === 'all' ? services.value : services.value.filter((item) => item.kind === activeKind.value),
);
const displayedTotal = computed(() =>
  activeKind.value === 'all' ? total.value : filteredServices.value.length,
);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());

const typeOptions = computed(() => SERVICE_TYPES_BY_KIND[form.kind]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.services.kind'), dataIndex: 'kind', key: 'kind', width: 120 },
  { title: t('crud.type'), dataIndex: 'serviceType', key: 'serviceType', width: 140 },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
]);

function resetForm(): void {
  Object.assign(form, createEmptyServiceForm());
}

function onKindChange(kind: ServiceKind): void {
  form.kind = kind;
  form.serviceType = SERVICE_KIND_DEFAULT_TYPE[kind];
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [databasesResult, messagingResult, dashboardsResult, storageResult, pipelinesResult] =
      await Promise.allSettled([
        listDatabaseServices({ limit: 100 }),
        listMessagingServices({ limit: 100 }),
        listDashboardServices({ limit: 100 }),
        listStorageServices({ limit: 100 }),
        listPipelineServices({ limit: 100 }),
      ]);
    const databases = databasesResult.status === 'fulfilled' ? databasesResult.value : { data: [], total: undefined };
    const messaging = messagingResult.status === 'fulfilled' ? messagingResult.value : { data: [], total: undefined };
    const dashboards = dashboardsResult.status === 'fulfilled' ? dashboardsResult.value : { data: [], total: undefined };
    const storage = storageResult.status === 'fulfilled' ? storageResult.value : { data: [], total: undefined };
    const pipelines = pipelinesResult.status === 'fulfilled' ? pipelinesResult.value : { data: [], total: undefined };
    services.value = [
      ...databases.data,
      ...messaging.data,
      ...dashboards.data,
      ...storage.data,
      ...pipelines.data,
    ];
    total.value =
      databases.total !== undefined &&
      messaging.total !== undefined &&
      dashboards.total !== undefined &&
      storage.total !== undefined &&
      pipelines.total !== undefined
        ? databases.total + messaging.total + dashboards.total + storage.total + pipelines.total
        : undefined;
    if (
      databasesResult.status !== 'fulfilled' &&
      messagingResult.status !== 'fulfilled' &&
      dashboardsResult.status !== 'fulfilled' &&
      storageResult.status !== 'fulfilled' &&
      pipelinesResult.status !== 'fulfilled'
    ) {
      const first = [
        databasesResult,
        messagingResult,
        dashboardsResult,
        storageResult,
        pipelinesResult,
      ].find((item) => item.status === 'rejected') as PromiseRejectedResult;
      throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
    }
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
    const created = await SERVICE_CREATE_API[form.kind](body);
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
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.services.deleteConfirm', { name: service.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await SERVICE_DELETE_API[service.kind](service.id);
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
    :data-source="filteredServices"
    table-test-id="services-table"
    show-row-actions
    show-edit-action
    show-delete-action
    :total="displayedTotal"
    @refresh="load"
    @view="openDetail($event as CatalogService)"
    @edit="openDetail($event as CatalogService)"
    @delete="onDelete($event as CatalogService)"
  >
    <template #actions>
      <Button data-testid="create-service-wizard" @click="router.push({ name: 'ingestion-service-add' })">
        {{ t('ingestion.services.createWizard') }}
      </Button>
      <Button type="primary" data-testid="create-service" @click="createOpen = true">
        {{ t('ingestion.services.create') }}
      </Button>
    </template>
    <template #filters>
      <Tabs :active-key="activeKind" data-testid="services-kind-tabs" @change="(key) => (activeKind = String(key))">
        <Tabs.TabPane key="all" :tab="t('ingestion.services.allKinds')" />
        <Tabs.TabPane
          v-for="row in supportedCategories"
          :key="row.key"
          :tab="t(row.labelKey)"
        />
      </Tabs>
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
        <Select :value="form.kind" data-testid="create-service-kind" @update:value="(value) => onKindChange(value as ServiceKind)">
          <Select.Option value="database">{{ t('ingestion.services.database') }}</Select.Option>
          <Select.Option value="messaging">{{ t('ingestion.services.messaging') }}</Select.Option>
          <Select.Option value="dashboard">{{ t('ingestion.services.dashboard') }}</Select.Option>
          <Select.Option value="storage">{{ t('ingestion.services.storage') }}</Select.Option>
          <Select.Option value="pipeline">{{ t('ingestion.services.pipeline') }}</Select.Option>
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
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <ServiceConnectionFields :form="form" />
    </Form>
  </Modal>
</template>
