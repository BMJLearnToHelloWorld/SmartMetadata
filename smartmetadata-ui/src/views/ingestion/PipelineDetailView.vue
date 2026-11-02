<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Checkbox, Descriptions, Form, Input, Modal, Table, Tooltip, message } from 'ant-design-vue';
import {
  deleteIngestionPipeline,
  getIngestionPipeline,
  getOrchestratorStatus,
  listPipelineStatuses,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { buildCliWorkflowYaml } from '@/ingestion/cliWorkflow';
import { SERVICE_KIND_BY_ENTITY_TYPE, entityTypeForKind } from '@/ingestion/connections';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import { buildSourceConfig, formHintsFromSourceConfig } from '@/ingestion/sourceConfig';
import type {
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineFormValues,
  PipelineStatus,
  ServiceKind,
} from '@/types/ingestion';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const pipeline = ref<IngestionPipeline | null>(null);
const service = ref<CatalogService | null>(null);
const statuses = ref<PipelineStatus[]>([]);
const orchestrator = ref<OrchestratorStatus | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const deleting = ref(false);
const editForm = reactive<PipelineFormValues>({
  name: '',
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

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('ingestion.pipelines.title'), to: { name: 'ingestion-pipelines' } },
  { label: entityLabel(pipeline.value) || t('ingestion.pipelines.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'pipeline-tab-overview' },
  { key: 'status', label: t('ingestion.pipelines.statusTab'), testId: 'pipeline-tab-status' },
]);

const statusColumns = computed<EntityListColumn[]>(() => [
  { title: t('ingestion.pipelines.run'), dataIndex: 'runId', key: 'runId' },
  { title: t('ingestion.pipelines.state'), dataIndex: 'pipelineState', key: 'pipelineState', width: 140 },
  { title: t('ingestion.pipelines.timestamp'), dataIndex: 'timestamp', key: 'timestamp', width: 180 },
  { title: t('ingestion.pipelines.triggeredBy'), dataIndex: 'triggeredBy', key: 'triggeredBy', width: 160 },
]);

const cliYaml = computed(() => {
  if (!pipeline.value || !service.value) {
    return '';
  }
  return buildCliWorkflowYaml(pipeline.value, service.value);
});

const orchestratorLabel = computed(() => {
  if (!orchestrator.value) {
    return 'unknown';
  }
  const platform = orchestrator.value.platform || 'unknown';
  const reason = orchestrator.value.reason ? ` — ${orchestrator.value.reason}` : '';
  return `${platform}${reason}`;
});

function serviceKindFromRef(type: string | undefined): ServiceKind {
  return (type && SERVICE_KIND_BY_ENTITY_TYPE[type]) || 'database';
}

async function loadLinkedService(current: IngestionPipeline): Promise<CatalogService | null> {
  const id = current.service?.id;
  if (!id) {
    return null;
  }
  return SERVICE_GET_API[serviceKindFromRef(current.service?.type)](id);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const current = await getIngestionPipeline(props.id);
    pipeline.value = current;
    const [linked, statusPage, orch] = await Promise.all([
      loadLinkedService(current),
      current.fullyQualifiedName
        ? listPipelineStatuses(current.fullyQualifiedName).catch(() => ({ data: [] as PipelineStatus[] }))
        : Promise.resolve({ data: [] as PipelineStatus[] }),
      getOrchestratorStatus().catch(() => null),
    ]);
    service.value = linked;
    statuses.value = statusPage.data;
    orchestrator.value = orch;
  } catch (error) {
    pipeline.value = null;
    service.value = null;
    statuses.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!pipeline.value) {
    return;
  }
  const kind = serviceKindFromRef(pipeline.value.service?.type);
  const hints = formHintsFromSourceConfig(pipeline.value.sourceConfig, kind);
  editForm.name = pipeline.value.name;
  editForm.displayName = pipeline.value.displayName || '';
  editForm.description = pipeline.value.description || '';
  editForm.pipelineType = pipeline.value.pipelineType || 'metadata';
  editForm.serviceId = pipeline.value.service?.id || '';
  editForm.serviceKind = kind;
  editForm.includeViews = hints.includeViews;
  editForm.includeSchemas = hints.includeSchemas || '';
  editForm.includeTopics = hints.includeTopics || '';
  editForm.includeDashboards = hints.includeDashboards || '';
  editForm.includeCharts = hints.includeCharts || '';
  editForm.scheduleInterval = pipeline.value.airflowConfig?.scheduleInterval || '';
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!pipeline.value?.service?.id) {
    return;
  }
  saving.value = true;
  try {
    await updateIngestionPipeline({
      name: pipeline.value.name,
      pipelineType: pipeline.value.pipelineType || 'metadata',
      service: {
        id: pipeline.value.service.id,
        type: entityTypeForKind(serviceKindFromRef(pipeline.value.service.type)),
      },
      sourceConfig: buildSourceConfig(editForm),
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: editForm.scheduleInterval?.trim() || undefined,
      },
      displayName: editForm.displayName?.trim() || undefined,
      description: editForm.description?.trim() || undefined,
    });
    editOpen.value = false;
    message.success(t('ingestion.pipelines.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!pipeline.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.pipelines.deleteConfirm', { name: pipeline.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  deleting.value = true;
  try {
    await deleteIngestionPipeline(pipeline.value.id);
    message.success(t('ingestion.pipelines.deleted', { name: pipeline.value.name }));
    await router.push({ name: 'ingestion-pipelines' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(pipeline) || t('ingestion.pipelines.title')"
    :name="pipeline?.name"
    :fqn="pipeline?.fullyQualifiedName"
    :lead="t('ingestion.pipelines.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!pipeline && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="pipeline ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-pipeline" :disabled="!pipeline" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Tooltip :title="t('crud.deleteHelp')">
        <Button
          data-testid="delete-pipeline"
          danger
          :disabled="!pipeline"
          :loading="deleting"
          :aria-label="t('crud.deleteHelp')"
          @click="onDelete"
        >
          {{ t('crud.delete') }}
        </Button>
      </Tooltip>
    </template>
    <template #overview>
      <Alert
        type="info"
        show-icon
        data-testid="pipeline-run-note"
        :message="t('ingestion.pipelines.runNote')"
      />
      <Descriptions v-if="pipeline" bordered :column="1" size="small" style="margin-top: 16px">
        <Descriptions.Item :label="t('crud.name')">{{ pipeline.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ pipeline.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ pipeline.pipelineType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.service')">
          {{ pipeline.service?.name || service?.name || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.sourceConfigType')">
          {{ pipeline.sourceConfig?.config?.type || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.airflowConfig')">
          {{
            t('ingestion.pipelines.airflowValue', {
              pause: String(pipeline.airflowConfig?.pausePipeline ?? true),
              schedule: pipeline.airflowConfig?.scheduleInterval
                ? ` · schedule=${pipeline.airflowConfig.scheduleInterval}`
                : '',
            })
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.orchestrator')">{{ orchestratorLabel }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ pipeline.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <p class="entity-detail__tab-lead">{{ t('ingestion.pipelines.yamlTitle') }}</p>
      <pre v-if="cliYaml" class="ing-yaml" data-testid="pipeline-cli-yaml">{{ cliYaml }}</pre>
    </template>
    <template #status>
      <Table
        row-key="runId"
        size="small"
        data-testid="pipeline-status-table"
        :columns="statusColumns"
        :data-source="statuses"
        :pagination="false"
      />
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('ingestion.pipelines.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item v-if="editForm.serviceKind === 'database'">
        <Checkbox v-model:checked="editForm.includeViews">
          {{ t('ingestion.pipelines.includeViews') }}
        </Checkbox>
      </Form.Item>
      <Form.Item
        v-if="editForm.serviceKind === 'database'"
        :label="t('ingestion.pipelines.includeSchemas')"
        :extra="t('ingestion.pipelines.includeSchemasHelp')"
      >
        <Input v-model:value="editForm.includeSchemas" />
      </Form.Item>
      <Form.Item
        v-if="editForm.serviceKind === 'messaging'"
        :label="t('ingestion.pipelines.includeTopics')"
        :extra="t('ingestion.pipelines.includeTopicsHelp')"
      >
        <Input v-model:value="editForm.includeTopics" />
      </Form.Item>
      <Form.Item
        v-if="editForm.serviceKind === 'dashboard'"
        :label="t('ingestion.pipelines.includeDashboards')"
        :extra="t('ingestion.pipelines.includeDashboardsHelp')"
      >
        <Input v-model:value="editForm.includeDashboards" />
      </Form.Item>
      <Form.Item
        v-if="editForm.serviceKind === 'dashboard'"
        :label="t('ingestion.pipelines.includeCharts')"
        :extra="t('ingestion.pipelines.includeChartsHelp')"
      >
        <Input v-model:value="editForm.includeCharts" />
      </Form.Item>
      <Form.Item :label="t('ingestion.pipelines.schedule')" :extra="t('ingestion.pipelines.scheduleHelp')">
        <Input v-model:value="editForm.scheduleInterval" />
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-top: 24px;
  margin-bottom: 12px;
}
.ing-yaml {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
