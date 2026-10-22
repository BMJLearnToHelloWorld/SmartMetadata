<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'ant-design-vue';
import { getDatabaseService } from '@/api/databaseServices';
import {
  deleteIngestionPipeline,
  getIngestionPipeline,
  getOrchestratorStatus,
  listPipelineStatuses,
  updateIngestionPipeline,
} from '@/api/ingestionPipelines';
import { getMessagingService } from '@/api/messagingServices';
import { buildCliWorkflowYaml } from '@/ingestion/cliWorkflow';
import { entityTypeForKind } from '@/ingestion/connections';
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
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const pipeline = ref<IngestionPipeline | null>(null);
const service = ref<CatalogService | null>(null);
const statuses = ref<PipelineStatus[]>([]);
const orchestrator = ref<OrchestratorStatus | null>(null);
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
  scheduleInterval: '',
});

const statusColumns = [
  { title: 'Run', dataIndex: 'runId', key: 'runId' },
  { title: 'State', dataIndex: 'pipelineState', key: 'pipelineState', width: 140 },
  { title: 'Timestamp', dataIndex: 'timestamp', key: 'timestamp', width: 180 },
  { title: 'Triggered by', dataIndex: 'triggeredBy', key: 'triggeredBy', width: 160 },
];

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
  return type === 'messagingService' ? 'messaging' : 'database';
}

async function loadLinkedService(current: IngestionPipeline): Promise<CatalogService | null> {
  const id = current.service?.id;
  if (!id) {
    return null;
  }
  const kind = serviceKindFromRef(current.service?.type);
  return kind === 'messaging' ? getMessagingService(id) : getDatabaseService(id);
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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load pipeline';
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
    message.success('Pipeline updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!pipeline.value) {
    return;
  }
  if (!window.confirm(`Delete pipeline ${pipeline.value.name}? This cannot be undone from this console.`)) {
    return;
  }
  deleting.value = true;
  try {
    await deleteIngestionPipeline(pipeline.value.id);
    message.success(`Deleted ${pipeline.value.name}`);
    await router.push({ name: 'ingestion-pipelines' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Delete failed');
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
  <Spin :spinning="loading">
    <Card>
      <Typography.Title :level="4">
        {{ pipeline?.displayName || pipeline?.name || 'Ingestion pipeline' }}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        GET/PUT /api/v1/services/ingestionPipelines · status GET /{fqn}/pipelineStatus
      </Typography.Paragraph>
      <Space>
        <Button data-testid="edit-pipeline" :disabled="!pipeline" @click="openEdit">Edit</Button>
        <Button data-testid="delete-pipeline" danger :disabled="!pipeline" :loading="deleting" @click="onDelete">
          Delete
        </Button>
      </Space>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="ing-alert" />
      <Alert
        class="ing-alert"
        type="info"
        show-icon
        data-testid="pipeline-run-note"
        message="This page does not call POST /trigger/{id} or /deploy/{id}. Those endpoints proxy the Airflow pipeline-service client. Run the job with smartmetadata-ingest, then any runner that can write pipelineStatus will appear below."
      />
      <Descriptions v-if="pipeline" bordered :column="1" size="small" class="ing-desc">
        <Descriptions.Item label="Name">{{ pipeline.name }}</Descriptions.Item>
        <Descriptions.Item label="FQN">{{ pipeline.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item label="Type">{{ pipeline.pipelineType || '—' }}</Descriptions.Item>
        <Descriptions.Item label="Service">{{ pipeline.service?.name || service?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item label="sourceConfig.type">
          {{ pipeline.sourceConfig?.config?.type || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="airflowConfig">
          pausePipeline={{ pipeline.airflowConfig?.pausePipeline ?? true }}
          <template v-if="pipeline.airflowConfig?.scheduleInterval">
            · schedule={{ pipeline.airflowConfig.scheduleInterval }}
          </template>
          (catalog field; CLI ignores it)
        </Descriptions.Item>
        <Descriptions.Item label="Orchestrator GET /status">{{ orchestratorLabel }}</Descriptions.Item>
        <Descriptions.Item label="Description">{{ pipeline.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <Typography.Title :level="5" class="ing-sub">Stored run status</Typography.Title>
      <Table
        row-key="runId"
        size="small"
        data-testid="pipeline-status-table"
        :columns="statusColumns"
        :data-source="statuses"
        :pagination="false"
      />
      <Typography.Title :level="5" class="ing-sub">smartmetadata-ingest YAML</Typography.Title>
      <pre v-if="cliYaml" class="ing-yaml" data-testid="pipeline-cli-yaml">{{ cliYaml }}</pre>
    </Card>
    <Modal v-model:open="editOpen" title="Edit ingestion pipeline" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
        <Form.Item v-if="editForm.serviceKind === 'database'">
          <Checkbox v-model:checked="editForm.includeViews">
            Include views (catalog includeViews; CLI includeViewLineage)
          </Checkbox>
        </Form.Item>
        <Form.Item v-if="editForm.serviceKind === 'database'" label="Include schemas">
          <Input v-model:value="editForm.includeSchemas" />
        </Form.Item>
        <Form.Item v-if="editForm.serviceKind === 'messaging'" label="Include topics">
          <Input v-model:value="editForm.includeTopics" />
        </Form.Item>
        <Form.Item label="Schedule interval (catalog only)">
          <Input v-model:value="editForm.scheduleInterval" />
        </Form.Item>
      </Form>
    </Modal>
  </Spin>
</template>

<style scoped>
.ing-alert,
.ing-desc {
  margin-top: 16px;
}
.ing-sub {
  margin-top: 24px;
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
