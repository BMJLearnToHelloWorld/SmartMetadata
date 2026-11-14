<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Descriptions, Tooltip, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { triggerOnDemandApp } from '@/api/apps';
import { getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { useAuthStore } from '@/stores/auth';
import { listWorkflowInstances } from '@/api/workflows';
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
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import DeploymentSummaryCard from '@/components/ingestion/DeploymentSummaryCard.vue';
import MetadataAgentsView from '@/components/ingestion/MetadataAgentsView.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import {
  entityTypeForKind,
  redactConnectionForDisplay,
  SERVICE_KIND_BY_ENTITY_TYPE,
} from '@/ingestion/connections';
import { cliSourceType } from '@/ingestion/cliWorkflow';
import {
  AUTO_PILOT_APP_NAME,
  AUTO_PILOT_WORKFLOW_NAME,
  getDayAgoStartGMTinMillis,
  isAutoPilotServiceType,
  isExcludedAutoPilotServiceType,
} from '@/ingestion/autoPilot';
import type { AgentAction } from '@/ingestion/agentsUtils';
import { getIngestionTypes, getSupportedPipelineTypes } from '@/ingestion/supportedPipelines';
import { useMetadataAgents } from '@/ingestion/useMetadataAgents';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { getEntityFeedLink } from '@/utils/entityLink';
import { SERVICE_DELETE_API, SERVICE_GET_API } from '@/ingestion/serviceApis';
import { SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import type {
  Agent,
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

const permissionStore = usePermissionStore();
const authStore = useAuthStore();
const servicePipelines = ref<IngestionPipeline[]>([]);
const pipelinesLoading = ref(false);
const pipelinesError = ref('');
const pipelinesLoaded = ref(false);
const pipelinesTotal = ref(0);
const loadedPipelinesFqn = ref('');
const servicePipelinePermissions = ref(new Map<string, OperationPermissions>());
const serviceOrchestrator = ref<OrchestratorStatus | null>(null);
const serviceOrchestratorChecked = ref(false);
const serviceRunDetailsStatus = ref<PipelineStatus | null>(null);
const ingestionPipelineCreateAllowed = ref(false);
const applicationTriggerAllowed = ref(false);
const workflowInstancesLoading = ref(false);
const autoPilotRunning = ref(false);
const triggeringAutoPilot = ref(false);
/** FQNs whose entity permission was already requested, so the fill watch never re-fetches. */
const requestedPermissionFqns = new Set<string>();

const serviceEntityType = computed(() => entityTypeForKind(kind.value));
const serviceEntityLink = computed(() =>
  getEntityFeedLink(serviceEntityType.value, service.value?.fullyQualifiedName),
);

/**
 * Page-level agent state (official ServiceDetailsPage calls
 * useMetadataAgents at page level, so the discovery stream stays
 * connected on every tab, not just the Agents tab).
 */
const { agents, discoveredCount, pipelinesByFqn } = useMetadataAgents(
  servicePipelines,
  () => serviceEntityType.value,
  () => service.value?.fullyQualifiedName,
);

const agentsTabCount = computed(() => pipelinesTotal.value + discoveredCount.value);

const tabs = computed<EntityDetailTab[]>(() => {
  // Official ServiceDetailsPage: the Agents tab shows for the service
  // owner, a member of an owner team, or an admin — never admin-only.
  const ownerIds = new Set(
    (service.value?.owners ?? []).map((owner) => owner.id).filter(Boolean),
  );
  const currentUser = authStore.user;
  const userOwnsService = currentUser?.id ? ownerIds.has(currentUser.id) : false;
  const userInOwnerTeam = (currentUser?.teams ?? []).some(
    (team) => team.id && ownerIds.has(team.id),
  );
  const showAgentsTab = userOwnsService || userInOwnerTeam || permissionStore.isAdminUser;
  return SERVICE_DETAIL_TABS.filter((tab) => {
    if (tab.excludedKinds?.includes(kind.value)) {
      return false;
    }
    if (tab.key === 'agents' && !showAgentsTab) {
      return false;
    }
    return true;
  }).map((tab) => ({
    key: tab.key,
    label: t(tab.labelKey),
    testId: `service-tab-${tab.key}`,
    count: tab.key === 'agents' ? agentsTabCount.value : undefined,
  }));
});

/** Official Ingestion.component: resource Create plus a non-disabled platform. */
const showAddAgent = computed(
  () =>
    ingestionPipelineCreateAllowed.value && serviceOrchestrator.value?.platform !== 'disabled',
);

/** Flag-driven add menu (ADR:2026-11-14-autopilot-agents-ui-parity), one-Usage rule applied. */
const supportedTypes = computed(() =>
  service.value
    ? getIngestionTypes(
        getSupportedPipelineTypes(service.value, kind.value),
        [...pipelinesByFqn.value.values()],
      )
    : [],
);

const isDataInsightExists = computed(() =>
  [...pipelinesByFqn.value.values()].some((pipeline) => pipeline.pipelineType === 'dataInsight'),
);

/**
 * Official DataAssetsHeader trigger button: shown for the pin's
 * service entity types except security, gated on the APPLICATION
 * resource Trigger bit (merged onto the service permission, not
 * the service's own operation, and not admin-only). The fork's
 * llm/mcp kinds are outside the pin list and get no button.
 */
const showTriggerButton = computed(
  () =>
    service.value !== null &&
    isAutoPilotServiceType(serviceEntityType.value) &&
    !isExcludedAutoPilotServiceType(serviceEntityType.value) &&
    applicationTriggerAllowed.value,
);

const triggerDisabled = computed(() => workflowInstancesLoading.value || autoPilotRunning.value);
const triggerTooltip = computed(() =>
  autoPilotRunning.value
    ? t('ingestion.agents.autoPilotAlreadyRunning')
    : t('ingestion.agents.triggerAutoPilotTooltip'),
);

/** First load for this service blanks the list; refetches must not. */
const isAgentsLoading = computed(
  () => pipelinesLoading.value && loadedPipelinesFqn.value !== (service.value?.fullyQualifiedName ?? ''),
);
const isAgentsRefreshing = computed(
  () =>
    pipelinesLoading.value && loadedPipelinesFqn.value === (service.value?.fullyQualifiedName ?? ''),
);

/** P-24: same orchestrator rule as the list — null/disabled/non-200 once the probe has settled. */
const serviceOrchestratorUnavailable = computed(
  () =>
    serviceOrchestratorChecked.value &&
    (serviceOrchestrator.value == null ||
      serviceOrchestrator.value.platform === 'disabled' ||
      serviceOrchestrator.value.code !== 200),
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
        agentType: 'metadata',
      }),
      getOrchestratorStatus().catch(() => null),
    ]);
    servicePipelines.value = page.data;
    pipelinesTotal.value = page.total ?? page.data.length;
    loadedPipelinesFqn.value = service.value.fullyQualifiedName;
    serviceOrchestrator.value = orch;
    serviceOrchestratorChecked.value = true;
    pipelinesLoaded.value = true;
    const results = await Promise.allSettled(
      page.data
        .filter((pipeline) => Boolean(pipeline.fullyQualifiedName))
        .map(async (pipeline) => {
          requestedPermissionFqns.add(pipeline.fullyQualifiedName as string);
          return {
            id: pipeline.id,
            ops: await permissionStore.getEntityPermissionByFqn(
              'ingestionPipeline',
              pipeline.fullyQualifiedName as string,
            ),
          };
        }),
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
    pipelinesTotal.value = 0;
    pipelinesError.value = t('crud.loadFailed');
  } finally {
    pipelinesLoading.value = false;
  }
}

/**
 * Agents the stream discovers arrive without a permission entry; fetch
 * each missing one once so its card menu is gated correctly, merging
 * into the map the list load built (official useAgentPermissions
 * fetches per agent FQN the same way).
 */
watch(agents, (list) => {
  const missing: IngestionPipeline[] = [];
  for (const agent of list) {
    const pipeline = pipelinesByFqn.value.get(agent.fqn);
    if (
      pipeline?.fullyQualifiedName &&
      !servicePipelinePermissions.value.has(pipeline.id) &&
      !requestedPermissionFqns.has(pipeline.fullyQualifiedName)
    ) {
      requestedPermissionFqns.add(pipeline.fullyQualifiedName);
      missing.push(pipeline);
    }
  }
  if (missing.length === 0) {
    return;
  }
  void Promise.allSettled(
    missing.map(async (pipeline) => ({
      id: pipeline.id,
      ops: await permissionStore.getEntityPermissionByFqn(
        'ingestionPipeline',
        pipeline.fullyQualifiedName as string,
      ),
    })),
  ).then((results) => {
    const next = new Map(servicePipelinePermissions.value);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        next.set(result.value.id, result.value.ops);
      }
    }
    servicePipelinePermissions.value = next;
  });
});

async function reloadPipelines(): Promise<void> {
  pipelinesLoaded.value = false;
  await loadPipelines();
}

/** Card action dispatch onto the shared row-action handlers — no second action implementation. */
const agentActionHandlers: Record<AgentAction, (pipeline: IngestionPipeline) => void> = {
  run: (pipeline) => serviceRowActions.onRun(pipeline),
  redeploy: (pipeline) => serviceRowActions.onDeploy(pipeline),
  kill: (pipeline) => serviceRowActions.onKill(pipeline),
  pause: (pipeline) => serviceRowActions.onToggle(pipeline),
  resume: (pipeline) => serviceRowActions.onToggle(pipeline),
  edit: (pipeline) => serviceRowActions.onEdit(pipeline),
  delete: (pipeline) => serviceRowActions.onDelete(pipeline),
};

function onAgentAction(action: AgentAction, pipeline: IngestionPipeline): void {
  agentActionHandlers[action](pipeline);
}

/**
 * A run dot resolves its PipelineStatus from the pipeline's statuses
 * and opens the existing run details modal; Diagnose and the
 * view-history button land on the pipeline detail page, which is
 * this console's run-history surface (official opens the
 * RunHistoryDrawer instead).
 */
function onAgentRunDetails(agent: Agent, runId?: string): void {
  const pipeline = pipelinesByFqn.value.get(agent.fqn);
  const status =
    runId === undefined
      ? undefined
      : pipeline?.pipelineStatuses?.find((item) => item.runId === runId);
  if (status) {
    serviceRunDetailsStatus.value = status;
    return;
  }
  void router.push({ name: 'ingestion-pipeline', params: { id: agent.id } });
}

function onAgentViewHistory(agent: Agent): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: agent.id } });
}

function logEntityTypeFor(pipeline: IngestionPipeline): string {
  if (pipeline.pipelineType === 'TestSuite') {
    return 'testSuite';
  }
  return SERVICE_KIND_BY_ENTITY_TYPE[pipeline.service?.type ?? ''] ?? '';
}

/**
 * Official ServiceDetailsPage.fetchWorkflowInstanceStates, list half
 * only: the first AutoPilotWorkflow instance for this service in the
 * last 7 days decides whether the trigger button disables. The
 * per-instance state fetch feeds the Insights widget and stays
 * residual (D-10). A fetch failure toasts and fails open — the
 * button stays enabled rather than trapping the user.
 */
async function loadWorkflowInstanceStates(): Promise<void> {
  if (!service.value?.fullyQualifiedName) {
    return;
  }
  workflowInstancesLoading.value = true;
  try {
    const page = await listWorkflowInstances(AUTO_PILOT_WORKFLOW_NAME, {
      startTs: getDayAgoStartGMTinMillis(6),
      endTs: Date.now(),
      entityLink: serviceEntityLink.value,
    });
    autoPilotRunning.value = page.data[0]?.status === 'RUNNING';
  } catch (error) {
    autoPilotRunning.value = false;
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    workflowInstancesLoading.value = false;
  }
}

/**
 * Official DataAssetsHeader trigger: no confirm, no success toast;
 * errors toast, and a successful trigger refetches the instance
 * states so the button disables while the run is in flight.
 */
async function onTriggerAutoPilot(): Promise<void> {
  if (!service.value?.fullyQualifiedName) {
    return;
  }
  triggeringAutoPilot.value = true;
  try {
    await triggerOnDemandApp(AUTO_PILOT_APP_NAME, { entityLink: serviceEntityLink.value });
    await loadWorkflowInstanceStates();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    triggeringAutoPilot.value = false;
  }
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
    pipelinesTotal.value = 0;
    loadedPipelinesFqn.value = '';
    requestedPermissionFqns.clear();
    autoPilotRunning.value = false;
    versionsLoaded.value = false;
    versions.value = [];
    selectedVersion.value = null;
    versionSnapshot.value = null;
    // Resource gates for the Agents tab, fail-closed on any fetch
    // failure: the ingestionPipeline Create bit and the APPLICATION
    // Trigger bit the header button merges onto the service.
    const [createOps, triggerOps] = await Promise.all([
      permissionStore.getResourcePermission('ingestionPipeline').catch(() => null),
      permissionStore.getResourcePermission('application').catch(() => null),
    ]);
    ingestionPipelineCreateAllowed.value = createOps?.Create === true;
    applicationTriggerAllowed.value = triggerOps?.Trigger === true;
    // Page-level pipeline fetch: the Agents tab count badge needs the
    // total on every tab, matching official's page-level list fetch.
    await loadPipelines();
    if (showTriggerButton.value) {
      await loadWorkflowInstanceStates();
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
  if (tab === 'agents') {
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
      <Tooltip v-if="showTriggerButton" :title="triggerTooltip">
        <Button
          type="primary"
          data-testid="trigger-auto-pilot-application-button"
          :disabled="triggerDisabled"
          :loading="workflowInstancesLoading || triggeringAutoPilot"
          @click="onTriggerAutoPilot"
        >
          {{ t('ingestion.agents.triggerAutoPilot') }}
        </Button>
      </Tooltip>
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
    <template #agents>
      <AirflowMessageBanner
        :status="serviceOrchestrator"
        :checked="serviceOrchestratorChecked"
        :disabled-message="t('ingestion.pipelines.orchestratorDisabled')"
        :unreachable-message="t('ingestion.pipelines.orchestratorUnreachable')"
      />
      <SmState
        v-if="pipelinesError"
        state="error"
        test-id="service-pipelines-error"
        :error-text="pipelinesError"
      />
      <template v-else>
        <DeploymentSummaryCard :agents="agents" :total-agents="agentsTabCount" />
        <MetadataAgentsView
          :agents="agents"
          :pipelines-by-fqn="pipelinesByFqn"
          :permissions-by-id="servicePipelinePermissions"
          :is-admin-user="permissionStore.isAdminUser"
          :orchestrator-unavailable="serviceOrchestratorUnavailable"
          :is-pending="!serviceOrchestratorChecked"
          :is-loading="isAgentsLoading"
          :is-refreshing="isAgentsRefreshing"
          :can-create-agent="ingestionPipelineCreateAllowed"
          :action-status-pending="!serviceOrchestratorChecked"
          :show-add-agent="showAddAgent"
          :supported-types="supportedTypes"
          :is-data-insight-exists="isDataInsightExists"
          :service-kind="props.kind"
          :service-id="props.id"
          @refresh="reloadPipelines"
          @action="onAgentAction"
          @logs="serviceRowActions.onLogs"
          @run-details="onAgentRunDetails"
          @view-history="onAgentViewHistory"
        />
      </template>
    </template>
    <template #assets>
      <SmState state="empty" test-id="service-assets-residual" :empty-text="residualByKey.get('assets')" />
    </template>
    <template #insights>
      <SmState state="empty" test-id="service-insights-residual" :empty-text="residualByKey.get('insights')" />
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
