<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Checkbox, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { listDatabaseServices } from '@/api/databaseServices';
import { createIngestionPipeline, deleteIngestionPipeline, listIngestionPipelines } from '@/api/ingestionPipelines';
import { listDashboardServices } from '@/api/dashboardServices';
import { listMessagingServices } from '@/api/messagingServices';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { entityTypeForKind } from '@/ingestion/connections';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import type { CatalogService, IngestionPipeline, PipelineFormValues } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const pipelines = ref<IngestionPipeline[]>([]);
const catalogServices = ref<CatalogService[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive<PipelineFormValues>({
  name: '',
  displayName: '',
  description: '',
  pipelineType: 'metadata',
  serviceId: '',
  serviceKind: 'database',
  includeViews: true,
  includeSchemas: '',
  includeTopics: '',
  includeDashboards: '',
  includeCharts: '',
  scheduleInterval: '',
});

const selectedService = computed(
  () => catalogServices.value.find((item) => item.id === form.serviceId) ?? null,
);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: t('ingestion.pipelines.service'), key: 'service' },
  { title: t('crud.enabled'), key: 'enabled', width: 100 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [page, databases, messaging, dashboards] = await Promise.all([
      listIngestionPipelines({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after }),
      listDatabaseServices({ limit: 100 }),
      listMessagingServices({ limit: 100 }),
      listDashboardServices({ limit: 100 }),
    ]);
    pipelines.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
    catalogServices.value = [...databases.data, ...messaging.data, ...dashboards.data];
  } catch (error) {
    pipelines.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function onServiceChange(id: string): void {
  form.serviceId = id;
  const service = catalogServices.value.find((item) => item.id === id);
  if (service) {
    form.serviceKind = service.kind;
  }
}

async function onCreate(): Promise<void> {
  const service = selectedService.value;
  if (!service) {
    message.error(t('ingestion.pipelines.selectService'));
    return;
  }
  creating.value = true;
  try {
    const created = await createIngestionPipeline({
      name: form.name.trim(),
      pipelineType: 'metadata',
      service: { id: service.id, type: entityTypeForKind(service.kind) },
      sourceConfig: buildSourceConfig({ ...form, serviceKind: service.kind }),
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: form.scheduleInterval?.trim() || undefined,
      },
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
    });
    createOpen.value = false;
    message.success(t('ingestion.pipelines.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

function openDetail(pipeline: IngestionPipeline): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: pipeline.id } });
}

async function onDelete(pipeline: IngestionPipeline): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.pipelines.deleteConfirm', { name: pipeline.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteIngestionPipeline(pipeline.id);
    message.success(t('ingestion.pipelines.deleted', { name: pipeline.name }));
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
    :title="t('ingestion.pipelines.title')"
    :lead="t('ingestion.pipelines.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="pipelines"
    table-test-id="pipelines-table"
    show-row-actions
    show-edit-action
    show-delete-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="openDetail($event as IngestionPipeline)"
    @edit="openDetail($event as IngestionPipeline)"
    @delete="onDelete($event as IngestionPipeline)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-pipeline" @click="createOpen = true">
        {{ t('ingestion.pipelines.create') }}
      </Button>
    </template>
    <template #filters>
      <Alert type="info" show-icon :message="t('ingestion.pipelines.triggerNote')" />
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`pipeline-row-${(record as IngestionPipeline).id}`"
          @click.prevent="
            router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })
          "
        >
          {{ entityLabel(record as IngestionPipeline) }}
        </a>
      </template>
      <template v-else-if="column.key === 'service'">
        {{ (record as IngestionPipeline).service?.name || '—' }}
      </template>
      <template v-else-if="column.key === 'enabled'">
        {{ (record as IngestionPipeline).enabled === false ? t('crud.no') : t('crud.yes') }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('ingestion.pipelines.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-pipeline-name" />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.service')" :rules="requiredField(t, t('ingestion.pipelines.service'))">
        <Select
          :value="form.serviceId"
          data-testid="create-pipeline-service"
          :placeholder="t('ingestion.pipelines.selectServicePlaceholder')"
          @update:value="onServiceChange"
        >
          <Select.Option v-for="item in catalogServices" :key="item.id" :value="item.id">
            {{ item.name }} ({{ item.serviceType }})
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item v-if="form.serviceKind === 'database'">
        <Checkbox v-model:checked="form.includeViews" data-testid="create-pipeline-include-views">
          {{ t('ingestion.pipelines.includeViews') }}
        </Checkbox>
      </Form.Item>
      <Form.Item
        v-if="form.serviceKind === 'database'"
        :label="t('ingestion.pipelines.includeSchemas')"
        :extra="t('ingestion.pipelines.includeSchemasHelp')"
      >
        <Input v-model:value="form.includeSchemas" placeholder="public, analytics" />
      </Form.Item>
      <Form.Item
        v-if="form.serviceKind === 'messaging'"
        :label="t('ingestion.pipelines.includeTopics')"
        :extra="t('ingestion.pipelines.includeTopicsHelp')"
      >
        <Input v-model:value="form.includeTopics" placeholder="orders, payments" />
      </Form.Item>
      <Form.Item
        v-if="form.serviceKind === 'dashboard'"
        :label="t('ingestion.pipelines.includeDashboards')"
        :extra="t('ingestion.pipelines.includeDashboardsHelp')"
      >
        <Input v-model:value="form.includeDashboards" placeholder="sales, ops" />
      </Form.Item>
      <Form.Item
        v-if="form.serviceKind === 'dashboard'"
        :label="t('ingestion.pipelines.includeCharts')"
        :extra="t('ingestion.pipelines.includeChartsHelp')"
      >
        <Input v-model:value="form.includeCharts" placeholder="kpi-1, funnel" />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.schedule')" :extra="t('ingestion.pipelines.scheduleHelp')">
        <Input v-model:value="form.scheduleInterval" placeholder="0 0 * * *" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
    </Form>
  </Modal>
</template>
