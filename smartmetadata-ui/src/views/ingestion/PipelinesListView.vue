<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Checkbox, Form, Input, Menu, Modal, Select, message} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { bulkDeployIngestionPipelines, createIngestionPipeline, deleteIngestionPipeline, listIngestionPipelines } from '@/api/ingestionPipelines';
import { SERVICE_LIST_API } from '@/ingestion/serviceApis';
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
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { entityTypeForKind } from '@/ingestion/connections';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import {
  agentKindsForService,
  type CatalogService,
  type IngestionPipeline,
  type PipelineFormValues,
  type PipelineServiceClientResponse,
  type PipelineType,
} from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
/**
 * Official IngestionListTable gating: row actions come from the
 * per-pipeline entity permission by FQN, create from the
 * ingestionPipeline resource permission. A missing or failed fetch
 * denies (fail-closed), matching official canCreate=false-on-error.
 */
const permissionStore = usePermissionStore();
const pipelinePermissions = ref(new Map<string, OperationPermissions>());
const pipelineCreateAllowed = ref(false);
const selectedRowKeys = ref<string[]>([]);
const bulkDeploying = ref(false);
const bulkResults = ref<Array<{ id: string; name: string } & PipelineServiceClientResponse>>([]);
const bulkResultsOpen = ref(false);
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
  generateSampleData: false,
  includeDashboards: '',
  includeCharts: '',
  includeContainers: '',
  scheduleInterval: '',
});

const selectedService = computed(
  () => catalogServices.value.find((item) => item.id === form.serviceId) ?? null,
);

const availablePipelineTypes = computed<readonly PipelineType[]>(() => {
  const service = selectedService.value;
  if (!service) {
    return ['metadata'] as const;
  }
  return agentKindsForService(service.serviceType);
});

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
    const serviceKinds = Object.keys(SERVICE_LIST_API) as Array<keyof typeof SERVICE_LIST_API>;
    const settled = await Promise.allSettled([
      listIngestionPipelines({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after }),
      ...serviceKinds.map((kind) => SERVICE_LIST_API[kind]({ limit: 100 })),
    ]);
    const pageResult = settled[0];
    if (pageResult.status !== 'fulfilled') {
      throw pageResult.reason instanceof Error
        ? pageResult.reason
        : new Error(String(pageResult.reason));
    }
    const page = pageResult.value;
    pipelines.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
    catalogServices.value = settled.slice(1).flatMap((result) =>
      result.status === 'fulfilled' ? result.value.data : [],
    );
    void loadPipelinePermissions();
  } catch (error) {
    pipelines.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadPipelinePermissions(): Promise<void> {
  try {
    const resourceOps = await permissionStore.getResourcePermission('ingestionPipeline');
    pipelineCreateAllowed.value = resourceOps.Create === true;
  } catch {
    pipelineCreateAllowed.value = false;
  }
  const results = await Promise.allSettled(
    pipelines.value
      .filter((pipeline) => Boolean(pipeline.fullyQualifiedName))
      .map(async (pipeline) => ({
        id: pipeline.id,
        ops: await permissionStore.getEntityPermissionByFqn(
          'ingestionPipeline',
          pipeline.fullyQualifiedName as string,
        ),
      })),
  );
  const next = new Map<string, OperationPermissions>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      next.set(result.value.id, result.value.ops);
    }
  }
  pipelinePermissions.value = next;
}

function canEditPipeline(pipeline: IngestionPipeline): boolean {
  return pipelinePermissions.value.get(pipeline.id)?.EditAll === true;
}

function canDeletePipeline(pipeline: IngestionPipeline): boolean {
  return pipelinePermissions.value.get(pipeline.id)?.Delete === true;
}

/** Same official deploy rule as the detail view: EditAll or Deploy, plus the P1 admin line. */
function canDeployPipeline(pipeline: IngestionPipeline): boolean {
  if (pipeline.enabled === false) {
    return false;
  }
  const ops = pipelinePermissions.value.get(pipeline.id);
  return permissionStore.isAdminUser || ops?.EditAll === true || ops?.Deploy === true;
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: Array<string | number>) => {
    selectedRowKeys.value = keys.map((key) => String(key));
  },
}));

const deployableSelected = computed(() =>
  pipelines.value.filter(
    (pipeline) => selectedRowKeys.value.includes(pipeline.id) && canDeployPipeline(pipeline),
  ),
);

const bulkResultColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.pipelines.resultCode'), dataIndex: 'code', key: 'code', width: 120 },
  { title: t('ingestion.pipelines.resultPlatform'), dataIndex: 'platform', key: 'platform', width: 140 },
  { title: t('ingestion.pipelines.resultReason'), dataIndex: 'reason', key: 'reason' },
]);

async function onBulkDeploy(): Promise<void> {
  const targets = deployableSelected.value;
  if (targets.length === 0) {
    message.warning(t('ingestion.pipelines.bulkDeployNoneSelected'));
    return;
  }
  bulkDeploying.value = true;
  try {
    const results = await bulkDeployIngestionPipelines(targets.map((pipeline) => pipeline.id));
    bulkResults.value = targets.map((pipeline, index) => ({
      id: pipeline.id,
      name: pipeline.name,
      ...(results[index] ?? {}),
    }));
    bulkResultsOpen.value = true;
    selectedRowKeys.value = [];
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    bulkDeploying.value = false;
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
    const kinds = agentKindsForService(service.serviceType);
    if (!kinds.includes(form.pipelineType as PipelineType)) {
      form.pipelineType = kinds[0] ?? 'metadata';
    }
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
      pipelineType: form.pipelineType || 'metadata',
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

function onEditPipeline(pipeline: IngestionPipeline): void {
  if (!canEditPipeline(pipeline)) {
    message.error(t('errors.forbidden'));
    return;
  }
  openDetail(pipeline);
}

async function onDelete(pipeline: IngestionPipeline): Promise<void> {
  if (!canDeletePipeline(pipeline)) {
    message.error(t('errors.forbidden'));
    return;
  }
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
    :row-selection="rowSelection"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="openDetail($event as IngestionPipeline)"
    @delete="onDelete($event as IngestionPipeline)"
  >
    <template #rowActions="{ record }">
      <Menu.Item
        key="edit"
        data-testid="row-overflow-edit"
        :disabled="!canEditPipeline(record as IngestionPipeline)"
        @click="onEditPipeline(record as IngestionPipeline)"
      >
        {{ t('crud.edit') }}
      </Menu.Item>
      <Menu.Item
        key="delete"
        danger
        data-testid="row-overflow-delete"
        :disabled="!canDeletePipeline(record as IngestionPipeline)"
        @click="onDelete(record as IngestionPipeline)"
      >
        {{ t('crud.delete') }}
      </Menu.Item>
    </template>
    <template #actions>
      <Button
        data-testid="bulk-deploy-pipelines"
        :disabled="deployableSelected.length === 0"
        :loading="bulkDeploying"
        @click="onBulkDeploy"
      >
        {{ t('ingestion.pipelines.deploySelected') }}
      </Button>
      <Button type="primary" data-testid="create-pipeline" :disabled="!pipelineCreateAllowed" @click="createOpen = true">
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
    :open="bulkResultsOpen"
    :title="t('ingestion.pipelines.bulkDeployResults')"
    :footer="null"
    @cancel="bulkResultsOpen = false"
  >
    <SmTable
      row-key="id"
      size="small"
      test-id="bulk-deploy-results-table"
      :columns="bulkResultColumns"
      :data-source="bulkResults"
      :pagination="false"
    />
  </Modal>
  <FormModal
    :open="createOpen"
    :title="t('ingestion.pipelines.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate" @cancel="createOpen = false">
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
      <Form.Item
        :label="t('ingestion.pipelines.pipelineType')"
        :rules="requiredField(t, t('ingestion.pipelines.pipelineType'))"
        :extra="t('ingestion.pipelines.pipelineTypeHelp')"
      >
        <Select
          v-model:value="form.pipelineType"
          data-testid="create-pipeline-type"
          :placeholder="t('ingestion.pipelines.selectPipelineTypePlaceholder')"
        >
          <Select.Option v-for="pt in availablePipelineTypes" :key="pt" :value="pt">
            {{ t(`ingestion.pipelines.types.${pt}`) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item v-if="form.serviceKind === 'database' && form.pipelineType === 'metadata'">
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
        v-if="form.serviceKind === 'messaging'"
        :extra="t('ingestion.pipelines.generateSampleDataHelp')"
      >
        <Checkbox v-model:checked="form.generateSampleData" data-testid="create-pipeline-generate-sample-data">
          {{ t('ingestion.pipelines.generateSampleData') }}
        </Checkbox>
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
      <Form.Item
        v-if="form.serviceKind === 'storage'"
        :label="t('ingestion.pipelines.includeContainers')"
        :extra="t('ingestion.pipelines.includeContainersHelp')"
      >
        <Input v-model:value="form.includeContainers" placeholder="analytics, raw" />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.schedule')" :extra="t('ingestion.pipelines.scheduleHelp')">
        <Input v-model:value="form.scheduleInterval" placeholder="0 0 * * *" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
</template>
