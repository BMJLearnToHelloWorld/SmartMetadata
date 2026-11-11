<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Descriptions, Dropdown, Menu, Tag, Tooltip, Typography, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { getServiceVersion, listServiceVersions } from '@/api/serviceVersions';
import type { EntityVersion } from '@/api/entities';
import {
  createTestConnectionWorkflow,
  deleteTestConnectionWorkflow,
  getTestConnectionDefinition,
  getTestConnectionWorkflow,
  isTestConnectionComplete,
  triggerTestConnectionWorkflow,
} from '@/api/testConnections';
import { SERVICE_DETAIL_TABS } from '@/catalog/ingestionTabs';
import SmState from '@/components/shared/SmState.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { redactConnectionForDisplay, SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
import { cliSourceType } from '@/ingestion/cliWorkflow';
import {
  getIngestionStatusCount,
  renderPipelineState,
  renderPipelineType,
  runBadgeColor,
} from '@/ingestion/pipelineDisplay';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { agentKindsForService } from '@/types/ingestion';
import { SERVICE_DELETE_API, SERVICE_GET_API } from '@/ingestion/serviceApis';
import { SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import type {
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineStatus,
  ServiceKind,
  TestConnectionStepResult,
} from '@/types/ingestion';
import IngestionLogsModal from './IngestionLogsModal.vue';
import IngestionRunDetailsModal from './IngestionRunDetailsModal.vue';
import KillPipelineModal from './KillPipelineModal.vue';
import PipelineRowActions from './PipelineRowActions.vue';

const props = defineProps<{ kind: string; id: string; initialTab?: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const activeTab = ref(props.initialTab ?? 'overview');
const deleting = ref(false);

const kind = computed<ServiceKind>(() =>
  (Object.keys(SERVICE_TYPES_BY_KIND) as ServiceKind[]).includes(props.kind as ServiceKind)
    ? (props.kind as ServiceKind)
    : 'database',
);
const supported = computed(() => Boolean(service.value && cliSourceType(service.value.serviceType)));
const connectionJson = computed(() =>
  JSON.stringify(redactConnectionForDisplay(service.value?.connection) ?? {}, null, 2),
);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('ingestion.services.title'), to: { name: 'ingestion-services' } },
  { label: entityLabel(service.value) || t('ingestion.services.title') },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  SERVICE_DETAIL_TABS.map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `service-tab-${tab.key}`,
  })),
);
const servicePipelines = ref<IngestionPipeline[]>([]);
const pipelinesLoading = ref(false);
const pipelinesError = ref('');
const pipelinesLoaded = ref(false);
const servicePipelinePermissions = ref(new Map<string, OperationPermissions>());
const serviceOrchestrator = ref<OrchestratorStatus | null>(null);
const serviceOrchestratorChecked = ref(false);
const serviceRunDetailsStatus = ref<PipelineStatus | null>(null);
const permissionStore = usePermissionStore();

/** P-24: same orchestrator rule as the list — null/disabled/non-200 once the probe has settled. */
const serviceOrchestratorUnavailable = computed(
  () =>
    serviceOrchestratorChecked.value &&
    (serviceOrchestrator.value == null ||
      serviceOrchestrator.value.platform === 'disabled' ||
      serviceOrchestrator.value.code !== 200),
);

const serviceOrchestratorBannerMessage = computed(() => {
  if (!serviceOrchestratorUnavailable.value) {
    return '';
  }
  if (serviceOrchestrator.value?.platform === 'disabled') {
    return t('ingestion.pipelines.orchestratorDisabled');
  }
  if (serviceOrchestrator.value?.reason) {
    return serviceOrchestrator.value.reason;
  }
  return t('ingestion.pipelines.orchestratorUnreachable');
});

/** P-38: the add-ingestion menu lists the kinds this service supports (official AddIngestionButton), never a hardcoded 'metadata'. */
const addIngestionKinds = computed(() =>
  service.value ? agentKindsForService(service.value.serviceType) : [],
);

const serviceRowActions = usePipelineRowActions({
  isAdminUser: () => permissionStore.isAdminUser,
  getOps: (pipeline) => servicePipelinePermissions.value.get(pipeline.id),
  refresh: () => reloadPipelines(),
});

/**
 * Template auto-unwrap applies to top-level refs only (see the list
 * view): bind the two modal refs at top level, handlers stay on
 * `serviceRowActions`.
 */
const serviceLogsPipeline = serviceRowActions.logsPipeline;
const serviceKillPipeline = serviceRowActions.killPipeline;

const pipelineColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: t('ingestion.pipelines.status'), key: 'status', width: 110 },
  { title: t('ingestion.pipelines.count'), key: 'count', width: 190 },
  { title: t('ingestion.pipelines.recentRuns'), key: 'recentRuns', width: 210 },
  { title: '', key: 'rowActions', width: 64 },
]);
const residualByKey = computed(() => {
  const map = new Map<string, string>();
  for (const tab of SERVICE_DETAIL_TABS) {
    if (!tab.supported && tab.residualReason) {
      map.set(tab.key, tab.residualReason);
    }
  }
  return map;
});

async function loadPipelines(): Promise<void> {
  if (!service.value?.fullyQualifiedName || pipelinesLoaded.value) {
    return;
  }
  pipelinesLoading.value = true;
  pipelinesError.value = '';
  try {
    const [page, orch] = await Promise.all([
      listIngestionPipelines({
        service: service.value.fullyQualifiedName,
        limit: 100,
        fields: 'owners,pipelineStatuses',
      }),
      getOrchestratorStatus().catch(() => null),
    ]);
    servicePipelines.value = page.data;
    serviceOrchestrator.value = orch;
    serviceOrchestratorChecked.value = true;
    pipelinesLoaded.value = true;
    const results = await Promise.allSettled(
      page.data
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
    servicePipelinePermissions.value = next;
  } catch {
    servicePipelines.value = [];
    pipelinesError.value = t('crud.loadFailed');
  } finally {
    pipelinesLoading.value = false;
  }
}

async function reloadPipelines(): Promise<void> {
  pipelinesLoaded.value = false;
  await loadPipelines();
}

function openRunDetails(status: PipelineStatus): void {
  serviceRunDetailsStatus.value = status;
}

function recentRunBadges(pipeline: IngestionPipeline): PipelineStatus[] {
  return (pipeline.pipelineStatuses ?? []).slice(0, 5).reverse();
}

function runTooltip(status: PipelineStatus): string {
  const parts: string[] = [];
  if (status.timestamp) {
    parts.push(`${t('ingestion.pipelines.timestamp')}: ${new Date(status.timestamp).toLocaleString()}`);
  }
  if (status.startDate) {
    parts.push(`${t('ingestion.pipelines.startDate')}: ${new Date(status.startDate).toLocaleString()}`);
  }
  if (status.endDate) {
    parts.push(`${t('ingestion.pipelines.endDate')}: ${new Date(status.endDate).toLocaleString()}`);
  }
  return parts.join('\n');
}

function logEntityTypeFor(pipeline: IngestionPipeline): string {
  if (pipeline.pipelineType === 'TestSuite') {
    return 'testSuite';
  }
  return SERVICE_KIND_BY_ENTITY_TYPE[pipeline.service?.type ?? ''] ?? '';
}

function onAddIngestion(ingestionType: string): void {
  void router.push({
    name: 'ingestion-service-add-ingestion',
    params: { kind: props.kind, id: props.id, ingestionType },
  });
}

const versions = ref<EntityVersion[]>([]);
const versionsLoading = ref(false);
const versionsError = ref('');
const versionsLoaded = ref(false);
const versionColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.version'), dataIndex: 'version', key: 'version', width: 100 },
  { title: t('crud.updatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 160 },
  { title: t('crud.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180 },
]);
const selectedVersion = ref<EntityVersion | null>(null);
const versionSnapshot = ref<CatalogService | null>(null);
const versionSnapshotLoading = ref(false);
const versionSnapshotJson = computed(() =>
  JSON.stringify(redactConnectionForDisplay(versionSnapshot.value?.connection) ?? {}, null, 2),
);
const versionChangedFields = computed(() => {
  const change = selectedVersion.value?.changeDescription;
  if (!change) {
    return [];
  }
  const names = new Set<string>();
  for (const group of [change.fieldsAdded, change.fieldsUpdated, change.fieldsDeleted]) {
    for (const field of group ?? []) {
      if (field.field) {
        names.add(field.field);
      }
    }
  }
  return [...names];
});

async function loadVersions(): Promise<void> {
  if (!service.value || versionsLoaded.value) {
    return;
  }
  versionsLoading.value = true;
  versionsError.value = '';
  try {
    versions.value = await listServiceVersions(kind.value, service.value.id);
    versionsLoaded.value = true;
  } catch {
    versions.value = [];
    versionsError.value = t('crud.loadFailed');
  } finally {
    versionsLoading.value = false;
  }
}

async function onViewVersion(version: EntityVersion): Promise<void> {
  if (!service.value || version.version === undefined) {
    return;
  }
  selectedVersion.value = version;
  versionSnapshotLoading.value = true;
  try {
    versionSnapshot.value = await getServiceVersion(kind.value, service.value.id, version.version);
  } catch {
    versionSnapshot.value = null;
  } finally {
    versionSnapshotLoading.value = false;
  }
}

const testingConnection = ref(false);
const testSteps = ref<TestConnectionStepResult[]>([]);
const testStatus = ref<string | undefined>(undefined);
const testTimedOut = ref(false);
const testError = ref('');
const testRunToken = ref(0);
const TEST_CONNECTION_POLL_MS = 2000;
const TEST_CONNECTION_MAX_POLLS = 30;

const lastTestLabel = computed(() => {
  const result = service.value?.testConnectionResult;
  if (!result) {
    return t('ingestion.services.testConnectionNever');
  }
  const at = result.lastUpdatedAt ? new Date(result.lastUpdatedAt).toLocaleString() : '—';
  return `${result.status ?? '—'} · ${at}`;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Official TestConnection flow, surfaced on the connection tab: fetch
 * the definition, create + trigger the automations workflow, poll until
 * it completes, then reload the service (the runner writes the stored
 * testConnectionResult) and delete the finished workflow. A polling
 * timeout leaves the workflow in place and says so — with the
 * in-memory execution backend a run may stay queued forever.
 */
async function onTestConnection(): Promise<void> {
  if (!service.value || testingConnection.value) {
    return;
  }
  const token = ++testRunToken.value;
  testingConnection.value = true;
  testSteps.value = [];
  testStatus.value = undefined;
  testTimedOut.value = false;
  testError.value = '';
  let workflowId: string | undefined;
  try {
    const definition = await getTestConnectionDefinition(service.value.serviceType);
    if (definition.length === 0) {
      throw new Error(t('ingestion.services.testConnectionFailed'));
    }
    const workflow = await createTestConnectionWorkflow({
      serviceName: service.value.name,
      kind: kind.value,
      connectionType: service.value.serviceType,
      connection: (service.value.connection ?? {}) as Record<string, unknown>,
    });
    workflowId = workflow.id;
    await triggerTestConnectionWorkflow(workflow.id).catch(async (error) => {
      await deleteTestConnectionWorkflow(workflow.id).catch(() => undefined);
      // The workflow is gone — clear the id so the outer catch does not
      // delete it a second time (ADR:2026-11-11-test-connection-workflow-hard-delete-cleanup).
      workflowId = undefined;
      throw error;
    });
    let completed = false;
    for (let poll = 0; poll < TEST_CONNECTION_MAX_POLLS && !completed; poll++) {
      await sleep(TEST_CONNECTION_POLL_MS);
      if (token !== testRunToken.value) {
        return;
      }
      const current = await getTestConnectionWorkflow(workflow.id);
      if (isTestConnectionComplete(current.status)) {
        completed = true;
        testStatus.value = current.response?.status ?? current.status;
        testSteps.value = current.response?.steps ?? [];
        await deleteTestConnectionWorkflow(workflow.id).catch(() => undefined);
        workflowId = undefined;
        await load();
      }
    }
    if (!completed) {
      testTimedOut.value = true;
    }
  } catch (error) {
    if (workflowId) {
      await deleteTestConnectionWorkflow(workflowId).catch(() => undefined);
    }
    testError.value = error instanceof Error ? error.message : t('ingestion.services.testConnectionFailed');
  } finally {
    if (token === testRunToken.value) {
      testingConnection.value = false;
    }
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind.value](props.id);
    pipelinesLoaded.value = false;
    servicePipelines.value = [];
    versionsLoaded.value = false;
    versions.value = [];
    selectedVersion.value = null;
    versionSnapshot.value = null;
    if (activeTab.value === 'pipelines') {
      await loadPipelines();
    }
    if (activeTab.value === 'versions') {
      await loadVersions();
    }
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (!service.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.services.deleteConfirm', { name: service.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  deleting.value = true;
  try {
    await SERVICE_DELETE_API[kind.value](service.value.id);
    message.success(t('ingestion.services.deleted', { name: service.value.name }));
    await router.push({ name: 'ingestion-services' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

watch(
  () => [props.kind, props.id],
  () => {
    void load();
  },
);

watch(activeTab, (tab) => {
  if (tab === 'pipelines') {
    void loadPipelines();
  }
  if (tab === 'versions') {
    void loadVersions();
  }
});

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(service) || t('ingestion.services.title')"
    :name="service?.name"
    :fqn="service?.fullyQualifiedName"
    :lead="t('ingestion.services.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!service && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="service ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button data-testid="edit-service" :disabled="!service" @click="router.push({ name: 'ingestion-service-connection', params: { kind: props.kind, id: props.id } })">
        {{ t('crud.edit') }}
      </Button>
      <Tooltip :title="t('crud.deleteHelp')">
        <Button
          data-testid="delete-service"
          danger
          :disabled="!service"
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
        v-if="service && !supported"
        type="info"
        show-icon
        :message="t('ingestion.services.unsupported')"
      />
      <Descriptions v-if="service" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ service.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ service.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.services.kind')">{{ service.kind }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ service.serviceType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.services.cliSource')">
          {{ cliSourceType(service.serviceType) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.services.lastTestConnection')">{{ lastTestLabel }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ service.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #connection>
      <p class="entity-detail__tab-lead">{{ t('ingestion.services.connectionTitle') }}</p>
      <Button
        v-if="service"
        data-testid="edit-service-connection"
        @click="router.push({ name: 'ingestion-service-connection', params: { kind: props.kind, id: props.id } })"
      >
        {{ t('ingestion.services.editConnection') }}
      </Button>
      <Button
        v-if="service"
        data-testid="test-service-connection"
        :loading="testingConnection"
        style="margin-left: 8px"
        @click="onTestConnection"
      >
        {{ testingConnection ? t('ingestion.services.testingConnection') : t('ingestion.services.testConnection') }}
      </Button>
      <Alert
        v-if="testingConnection"
        type="info"
        show-icon
        data-testid="test-connection-running"
        :message="t('ingestion.services.testingConnection')"
        style="margin-top: 16px"
      />
      <Alert
        v-if="testTimedOut"
        type="warning"
        show-icon
        data-testid="test-connection-timeout"
        :message="t('ingestion.services.testConnectionTimeout', { seconds: TEST_CONNECTION_POLL_MS * TEST_CONNECTION_MAX_POLLS / 1000 })"
        style="margin-top: 16px"
      />
      <Alert
        v-if="testError"
        type="error"
        show-icon
        data-testid="test-connection-error"
        :message="testError"
        style="margin-top: 16px"
      />
      <template v-if="testSteps.length > 0">
        <p class="entity-detail__tab-lead">
          {{ t('ingestion.services.testConnectionSteps') }} — {{ testStatus ?? '—' }}
        </p>
        <SmTable
          test-id="test-connection-steps-table"
          row-key="name"
          size="small"
          :columns="[
            { title: t('ingestion.services.testConnectionStep'), dataIndex: 'name', key: 'name' },
            { title: t('ingestion.services.testConnectionStatus'), dataIndex: 'status', key: 'status', width: 120 },
            { title: t('ingestion.services.testConnectionMessage'), dataIndex: 'message', key: 'message' },
          ]"
          :data-source="testSteps.map((step) => ({ ...step, message: step.message ?? step.resultSummary ?? step.errorLog ?? step.diagnosisTitle ?? '—', status: step.status ?? (step.passed === true ? 'Passed' : step.passed === false ? 'Failed' : '—') }))"
          :pagination="false"
        />
      </template>
      <p v-if="service" class="entity-detail__tab-lead" data-testid="service-connection-json-help">
        {{ t('ingestion.services.connectionJsonHelp') }}
      </p>
      <pre v-if="service" class="ing-json" data-testid="service-connection-json">{{ connectionJson }}</pre>
    </template>
    <template #pipelines>
      <Dropdown v-if="service" :trigger="['click']">
        <template #overlay>
          <Menu>
            <Menu.Item
              v-for="ingestionType in addIngestionKinds"
              :key="ingestionType"
              :data-testid="`add-ingestion-${ingestionType}`"
              @click="onAddIngestion(ingestionType)"
            >
              {{ t(`ingestion.pipelines.types.${ingestionType}`) }}
            </Menu.Item>
          </Menu>
        </template>
        <Button data-testid="add-service-ingestion" style="margin-bottom: 16px">
          {{ t('ingestion.pipelines.addIngestion') }}
        </Button>
      </Dropdown>
      <Alert
        v-if="serviceOrchestratorUnavailable"
        type="warning"
        show-icon
        data-testid="pipeline-orchestrator-banner"
        :message="serviceOrchestratorBannerMessage"
        style="margin-bottom: 16px"
      />
      <SmState
        v-if="pipelinesError"
        state="error"
        test-id="service-pipelines-error"
        :error-text="pipelinesError"
      />
      <SmTable
        v-else
        test-id="service-pipelines-table"
        row-key="id"
        size="small"
        :columns="pipelineColumns"
        :data-source="servicePipelines"
        :loading="pipelinesLoading"
        :pagination="false"
        :empty-text="t('ingestion.pipelines.noPipelinesYet')"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`service-pipeline-${(record as IngestionPipeline).id}`"
              @click.prevent="router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })"
            >
              {{ entityLabel(record as IngestionPipeline) }}
            </a>
          </template>
          <template v-else-if="column.key === 'pipelineType'">
            {{ renderPipelineType((record as IngestionPipeline).pipelineType) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="(record as IngestionPipeline).enabled === false ? 'default' : 'success'">
              {{
                t(
                  (record as IngestionPipeline).enabled === false
                    ? 'ingestion.pipelines.statusPaused'
                    : 'ingestion.pipelines.statusActive',
                )
              }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'count'">
            <span v-if="getIngestionStatusCount(record as IngestionPipeline)">
              <Tag
                v-for="count in getIngestionStatusCount(record as IngestionPipeline)"
                :key="count.type"
                :color="count.type === 'success' ? 'success' : count.type === 'failed' ? 'error' : 'warning'"
              >
                {{ t(`ingestion.pipelines.count${count.label === 'success' ? 'Success' : count.label === 'failed' ? 'Failed' : 'Warning'}`) }} {{ count.value }}
              </Tag>
            </span>
            <span v-else>—</span>
          </template>
          <template v-else-if="column.key === 'recentRuns'">
            <span v-if="(record as IngestionPipeline).pipelineStatuses?.length">
              <Tooltip
                v-for="(status, index) in recentRunBadges(record as IngestionPipeline)"
                :key="status.runId ?? index"
                :title="runTooltip(status)"
              >
                <Tag
                  :color="runBadgeColor(status.pipelineState)"
                  :data-testid="`service-pipeline-status-${status.runId}`"
                  style="cursor: pointer"
                  @click="openRunDetails(status)"
                >
                  {{
                    index === recentRunBadges(record as IngestionPipeline).length - 1
                      ? renderPipelineState(status.pipelineState)
                      : ''
                  }}
                </Tag>
              </Tooltip>
            </span>
            <span v-else>—</span>
          </template>
          <template v-else-if="column.key === 'rowActions'">
            <Dropdown :trigger="['click']">
              <template #overlay>
                <Menu>
                  <PipelineRowActions
                    show-view
                    :pipeline="record as IngestionPipeline"
                    :ops="servicePipelinePermissions.get((record as IngestionPipeline).id)"
                    :is-admin-user="permissionStore.isAdminUser"
                    :orchestrator-unavailable="serviceOrchestratorUnavailable"
                    @view="router.push({ name: 'ingestion-pipeline', params: { id: (record as IngestionPipeline).id } })"
                    @run="serviceRowActions.onRun"
                    @deploy="serviceRowActions.onDeploy"
                    @toggle="serviceRowActions.onToggle"
                    @logs="serviceRowActions.onLogs"
                    @edit="serviceRowActions.onEdit"
                    @kill="serviceRowActions.onKill"
                    @delete="serviceRowActions.onDelete"
                  />
                </Menu>
              </template>
              <Button data-testid="service-pipeline-row-overflow" size="small">⋯</Button>
            </Dropdown>
          </template>
        </template>
      </SmTable>
      <div
        v-if="!pipelinesLoading && !pipelinesError && servicePipelines.length === 0"
        data-testid="service-pipelines-empty-extra"
        style="margin-top: 16px"
      >
        <Typography.Text v-if="serviceOrchestratorUnavailable" type="secondary">
          {{ serviceOrchestratorBannerMessage }}
        </Typography.Text>
        <Dropdown v-else-if="service" :trigger="['click']">
          <template #overlay>
            <Menu>
              <Menu.Item
                v-for="ingestionType in addIngestionKinds"
                :key="ingestionType"
                :data-testid="`empty-add-ingestion-${ingestionType}`"
                @click="onAddIngestion(ingestionType)"
              >
                {{ t(`ingestion.pipelines.types.${ingestionType}`) }}
              </Menu.Item>
            </Menu>
          </template>
          <Button type="primary" data-testid="empty-add-service-ingestion">
            {{ t('ingestion.pipelines.addIngestion') }}
          </Button>
        </Dropdown>
      </div>
    </template>
    <template #assets>
      <SmState state="empty" test-id="service-assets-residual" :empty-text="residualByKey.get('assets')" />
    </template>
    <template #insights>
      <SmState state="empty" test-id="service-insights-residual" :empty-text="residualByKey.get('insights')" />
    </template>
    <template #agents>
      <SmState state="empty" test-id="service-agents-residual" :empty-text="residualByKey.get('agents')" />
    </template>
    <template #versions>
      <SmState
        v-if="versionsError"
        state="error"
        test-id="service-versions-error"
        :error-text="versionsError"
      />
      <template v-else>
        <SmTable
          test-id="service-versions-table"
          row-key="version"
          size="small"
          :columns="versionColumns"
          :data-source="versions"
          :loading="versionsLoading"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'version'">
              <a
                href="#"
                :data-testid="`service-version-${(record as EntityVersion).version}`"
                @click.prevent="onViewVersion(record as EntityVersion)"
              >
                {{ (record as EntityVersion).version }}
              </a>
            </template>
            <template v-else-if="column.key === 'updatedAt'">
              {{ (record as EntityVersion).updatedAt ? new Date((record as EntityVersion).updatedAt as number).toLocaleString() : '—' }}
            </template>
          </template>
        </SmTable>
        <SmState
          v-if="!versionsLoading && versions.length === 0"
          state="empty"
          test-id="service-versions"
          :empty-text="t('ingestion.services.versionsEmpty')"
        />
        <template v-if="selectedVersion && versionSnapshot">
          <p class="entity-detail__tab-lead">
            {{ t('ingestion.services.versionSnapshot') }} — {{ selectedVersion.version }}
          </p>
          <Descriptions bordered :column="1" size="small">
            <Descriptions.Item :label="t('crud.name')">{{ versionSnapshot.name }}</Descriptions.Item>
            <Descriptions.Item :label="t('crud.displayName')">{{ versionSnapshot.displayName || '—' }}</Descriptions.Item>
            <Descriptions.Item :label="t('crud.description')">{{ versionSnapshot.description || '—' }}</Descriptions.Item>
            <Descriptions.Item :label="t('crud.type')">{{ versionSnapshot.serviceType || '—' }}</Descriptions.Item>
            <Descriptions.Item v-if="versionChangedFields.length > 0" :label="t('ingestion.services.versionChangedFields')">
              {{ versionChangedFields.join(', ') }}
            </Descriptions.Item>
          </Descriptions>
          <pre class="ing-json" data-testid="service-version-connection-json">{{ versionSnapshotJson }}</pre>
        </template>
      </template>
    </template>
  </EntityDetailShell>
  <IngestionLogsModal
    :open="serviceLogsPipeline !== null"
    :pipeline="serviceLogsPipeline"
    :log-entity-type="serviceLogsPipeline ? logEntityTypeFor(serviceLogsPipeline) : ''"
    @close="serviceLogsPipeline = null"
  />
  <KillPipelineModal
    :open="serviceKillPipeline !== null"
    :pipeline-id="serviceKillPipeline?.id ?? ''"
    :pipeline-name="serviceKillPipeline ? entityLabel(serviceKillPipeline) : ''"
    @close="serviceKillPipeline = null"
    @killed="serviceRowActions.onKillDone"
  />
  <IngestionRunDetailsModal
    :open="serviceRunDetailsStatus !== null"
    :status="serviceRunDetailsStatus"
    @close="serviceRunDetailsStatus = null"
  />
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
.ing-json {
  background: var(--sm-bg-elevated);
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
</style>
