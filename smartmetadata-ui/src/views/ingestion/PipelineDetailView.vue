<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Alert, Button, Descriptions, Tag, Tooltip, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import {
  deleteIngestionPipeline,
  deployIngestionPipeline,
  getIngestionPipeline,
  getOrchestratorStatus,
  isPipelineClientDisabled,
  listPipelineStatuses,
  toggleIngestionPipeline,
  triggerIngestionPipeline,
} from '@/api/ingestionPipelines';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { buildCliWorkflowYaml } from '@/ingestion/cliWorkflow';
import { SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
import {
  dedupeStatusesByRunId,
  formatRunDuration,
  formatRunTimestamp,
} from '@/ingestion/pipelineDisplay';
import { useScheduleDescriptionTexts } from '@/ingestion/scheduleDescription';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import type {
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineServiceClientResponse,
  PipelineStatus,
  ServiceKind,
} from '@/types/ingestion';
import IngestionLogsModal from './IngestionLogsModal.vue';
import IngestionRunDetailsModal from './IngestionRunDetailsModal.vue';
import KillPipelineModal from './KillPipelineModal.vue';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const loading = ref(false);
const errorMessage = ref('');
const pipeline = ref<IngestionPipeline | null>(null);
const service = ref<CatalogService | null>(null);
const statuses = ref<PipelineStatus[]>([]);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);
const activeTab = ref('overview');
const deploying = ref(false);
const triggering = ref(false);
const toggling = ref(false);
const actionResult = ref<PipelineServiceClientResponse | null>(null);
const pipelineOps = ref<OperationPermissions | null>(null);
const statusLoading = ref(false);
const statusError = ref('');
const statusLimit = ref(5);
const runDetailsStatus = ref<PipelineStatus | null>(null);
const logsOpen = ref(false);
const killOpen = ref(false);

/**
 * Official PipelineActions gating (openmetadata-ui
 * IngestionListTable/PipelineActions): deploy needs EditAll or Deploy,
 * trigger needs Trigger, both need the pipeline enabled, trigger also
 * needs it deployed. The P1 isAdminUser line ORs in on top; a failed or
 * missing permission fetch denies (fail-closed, as the list view does).
 * P-24 merges the orchestrator probe in: a disabled/unreachable
 * pipeline service blocks deploy/trigger (and Logs/Kill below).
 */
const orchestratorUnavailable = computed(
  () =>
    orchestratorChecked.value &&
    (orchestrator.value == null ||
      orchestrator.value.platform === 'disabled' ||
      orchestrator.value.code !== 200),
);

const orchestratorBannerMessage = computed(() => {
  if (!orchestratorUnavailable.value) {
    return '';
  }
  if (orchestrator.value?.platform === 'disabled') {
    return t('ingestion.pipelines.orchestratorDisabled');
  }
  if (orchestrator.value?.reason) {
    return orchestrator.value.reason;
  }
  return t('ingestion.pipelines.orchestratorUnreachable');
});

const canDeploy = computed(
  () =>
    pipeline.value?.enabled !== false &&
    !orchestratorUnavailable.value &&
    (permissionStore.isAdminUser ||
      pipelineOps.value?.EditAll === true ||
      pipelineOps.value?.Deploy === true),
);
const canTrigger = computed(
  () =>
    pipeline.value?.enabled !== false &&
    pipeline.value?.deployed === true &&
    !orchestratorUnavailable.value &&
    (permissionStore.isAdminUser || pipelineOps.value?.Trigger === true),
);
/**
 * Official PipelineActions editStatusPermission: EditAll or
 * EditIngestionPipelineStatus, plus the P1 isAdminUser line; a failed or
 * missing permission fetch denies (fail-closed, as deploy/trigger do).
 * The button is additionally disabled while the pipeline is not deployed
 * (official: isDisabled || !pipeline.deployed).
 * ADR:2026-11-11-ingestion-pipeline-born-unpaused
 */
const canToggleStatus = computed(
  () =>
    permissionStore.isAdminUser ||
    pipelineOps.value?.EditAll === true ||
    pipelineOps.value?.EditIngestionPipelineStatus === true,
);
/** P-46: edit/delete gates (admin line ORs in, fail-closed). */
const canEdit = computed(
  () => permissionStore.isAdminUser || pipelineOps.value?.EditAll === true,
);
const canDelete = computed(
  () => permissionStore.isAdminUser || pipelineOps.value?.Delete === true,
);
/** P-05: Kill renders only for EditAll (or admin); the orchestrator gate disables it, it does not hide it. */
const canKillPermission = computed(
  () => permissionStore.isAdminUser || pipelineOps.value?.EditAll === true,
);
const canKill = computed(() => canKillPermission.value && !orchestratorUnavailable.value);
const canViewLogs = computed(() => !orchestratorUnavailable.value);

const actionResultType = computed(() => {
  if (!actionResult.value) {
    return 'info';
  }
  if (actionResult.value.reason === 'Pipeline Client Disabled') {
    return 'warning';
  }
  return actionResult.value.code === 200 ? 'success' : 'info';
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('ingestion.pipelines.title'), to: { name: 'ingestion-pipelines' } },
  { label: entityLabel(pipeline.value) || t('ingestion.pipelines.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'pipeline-tab-overview' },
  { key: 'status', label: t('ingestion.pipelines.statusTab'), testId: 'pipeline-tab-status' },
]);

/** P-37: triggeredBy renders when present, the column drops when always empty. */
const hasTriggeredBy = computed(() => statuses.value.some((status) => Boolean(status.triggeredBy)));

const statusColumns = computed<EntityListColumn[]>(() => {
  const columns: EntityListColumn[] = [
    { title: t('ingestion.pipelines.run'), dataIndex: 'runId', key: 'runId' },
    { title: t('ingestion.pipelines.state'), dataIndex: 'pipelineState', key: 'pipelineState', width: 140 },
    { title: t('ingestion.pipelines.timestamp'), dataIndex: 'timestamp', key: 'timestamp', width: 180 },
    { title: t('ingestion.pipelines.startDate'), dataIndex: 'startDate', key: 'startDate', width: 180 },
    { title: t('ingestion.pipelines.endDate'), dataIndex: 'endDate', key: 'endDate', width: 180 },
    { title: t('ingestion.pipelines.duration'), dataIndex: 'duration', key: 'duration', width: 140 },
  ];
  if (hasTriggeredBy.value) {
    columns.push({ title: t('ingestion.pipelines.triggeredBy'), dataIndex: 'triggeredBy', key: 'triggeredBy', width: 160 });
  }
  return columns;
});

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

/** P-44: the airflowConfig row shows the two-line cronstrue description. */
const scheduleTexts = useScheduleDescriptionTexts(() => pipeline.value?.airflowConfig?.scheduleInterval);
const schedulePrimary = computed(
  () => scheduleTexts.value.descriptionFirstPart || pipeline.value?.airflowConfig?.scheduleInterval || '',
);
const scheduleSecondary = computed(() => scheduleTexts.value.descriptionSecondPart);

/** P-45: owners row (displayName ?? name, '—' when empty). */
const ownersLabel = computed(() => {
  const owners = pipeline.value?.owners ?? [];
  if (owners.length === 0) {
    return '—';
  }
  return owners.map((owner) => owner.displayName ?? owner.name).join(', ');
});

/** P-45: sourceConfig row — type plus the already-mapped filter summary. */
const sourceConfigSummary = computed(() => {
  const config = pipeline.value?.sourceConfig?.config;
  if (!config) {
    return '—';
  }
  const parts: string[] = [config.type ?? '—'];
  const patterns: Array<[string | undefined, string[] | undefined, string[] | undefined]> = [
    ['schema', config.schemaFilterPattern?.includes, config.schemaFilterPattern?.excludes],
    ['topic', config.topicFilterPattern?.includes, config.topicFilterPattern?.excludes],
    ['dashboard', config.dashboardFilterPattern?.includes, config.dashboardFilterPattern?.excludes],
    ['chart', config.chartFilterPattern?.includes, config.chartFilterPattern?.excludes],
    ['container', config.containerFilterPattern?.includes, config.containerFilterPattern?.excludes],
  ];
  for (const [name, includes, excludes] of patterns) {
    if (includes?.length) {
      parts.push(`${name}: ${includes.join(', ')}`);
    }
    if (excludes?.length) {
      parts.push(`${name} (excluded): ${excludes.join(', ')}`);
    }
  }
  return parts.join(' · ');
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

/**
 * P-25/P-26: statuses only — table-level loading, no full-page Spin.
 * A failure sets statusError (the status tab shows an Alert + retry)
 * instead of being swallowed to an empty list.
 */
async function loadStatusesOnly(): Promise<void> {
  if (!pipeline.value?.fullyQualifiedName) {
    statuses.value = [];
    return;
  }
  statusLoading.value = true;
  statusError.value = '';
  try {
    const page = await listPipelineStatuses(pipeline.value.fullyQualifiedName, {
      limit: statusLimit.value,
    });
    statuses.value = dedupeStatusesByRunId(page.data);
  } catch (error) {
    statuses.value = [];
    statusError.value = error instanceof Error ? error.message : t('ingestion.pipelines.statusLoadFailed');
  } finally {
    statusLoading.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const current = await getIngestionPipeline(props.id);
    pipeline.value = current;
    const [linked, orch] = await Promise.all([
      loadLinkedService(current),
      getOrchestratorStatus().catch(() => null),
    ]);
    service.value = linked;
    orchestrator.value = orch;
    orchestratorChecked.value = true;
    pipelineOps.value = current.fullyQualifiedName
      ? await permissionStore
          .getEntityPermissionByFqn('ingestionPipeline', current.fullyQualifiedName)
          .catch(() => null)
      : null;
    await loadStatusesOnly();
  } catch (error) {
    pipeline.value = null;
    service.value = null;
    statuses.value = [];
    pipelineOps.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

/** C-01: a 200 with reason "Pipeline Client Disabled" is an error, never a success toast. */
function reportActionResult(
  result: PipelineServiceClientResponse,
  actionKey: 'actionDeployed' | 'actionTriggered',
): void {
  actionResult.value = result;
  if (isPipelineClientDisabled(result)) {
    message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
    return;
  }
  if (result.code !== undefined && result.code !== 200) {
    message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
    return;
  }
  message.success(
    t('ingestion.pipelines.actionSuccess', { action: t(`ingestion.pipelines.${actionKey}`) }),
  );
}

async function onDeploy(): Promise<void> {
  if (!pipeline.value || !canDeploy.value) {
    message.error(t('errors.forbidden'));
    return;
  }
  deploying.value = true;
  try {
    reportActionResult(await deployIngestionPipeline(pipeline.value.id), 'actionDeployed');
    setTimeout(() => {
      void loadStatusesOnly();
    }, 500);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    deploying.value = false;
  }
}

async function onTrigger(): Promise<void> {
  if (!pipeline.value || !canTrigger.value) {
    message.error(t('errors.forbidden'));
    return;
  }
  triggering.value = true;
  try {
    reportActionResult(await triggerIngestionPipeline(pipeline.value.id), 'actionTriggered');
    setTimeout(() => {
      void loadStatusesOnly();
    }, 500);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    triggering.value = false;
  }
}

async function onToggle(): Promise<void> {
  if (!pipeline.value || !canToggleStatus.value) {
    message.error(t('errors.forbidden'));
    return;
  }
  toggling.value = true;
  try {
    // The toggle endpoint returns the updated pipeline; apply it so the
    // Pause/Resume label flips immediately — the 500ms statuses-only
    // refresh (P-25) does not refetch the pipeline itself. Merge only
    // the fields the endpoint actually returns: it answers with
    // fields=OWNERS, so the mapped response has no pipelineStatuses —
    // spread-merging the whole response would wipe the loaded statuses
    // (and the Logs modal's runId) until a full page reload.
    const updated = await toggleIngestionPipeline(pipeline.value.id);
    if (updated && pipeline.value) {
      pipeline.value = {
        ...pipeline.value,
        ...(updated.enabled !== undefined ? { enabled: updated.enabled } : {}),
        ...(updated.deployed !== undefined ? { deployed: updated.deployed } : {}),
      };
    }
    setTimeout(() => {
      void loadStatusesOnly();
    }, 500);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    toggling.value = false;
  }
}

function onEdit(): void {
  if (!pipeline.value || !canEdit.value) {
    message.error(t('errors.forbidden'));
    return;
  }
  void router.push({ name: 'ingestion-pipeline-edit', params: { id: props.id } });
}

async function onDelete(): Promise<void> {
  if (!pipeline.value) {
    return;
  }
  if (!canDelete.value) {
    message.error(t('errors.forbidden'));
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('ingestion.pipelines.deleteConfirm', { name: pipeline.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
    onOk: async () => {
      if (!pipeline.value) {
        return;
      }
      try {
        await deleteIngestionPipeline(pipeline.value.id);
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
        throw error;
      }
    },
  });
  if (!confirmed) {
    return;
  }
  message.success(t('ingestion.pipelines.deleted', { name: pipeline.value.name }));
  await router.push({ name: 'ingestion-pipelines' });
}

async function onCopyYaml(): Promise<void> {
  try {
    await navigator.clipboard.writeText(cliYaml.value);
    message.success(t('ingestion.pipelines.copied'));
  } catch {
    message.error(t('ingestion.pipelines.copyFailed'));
  }
}

function onViewMoreStatuses(): void {
  statusLimit.value += 5;
  void loadStatusesOnly();
}

function onStatusRowClick(status: PipelineStatus): void {
  runDetailsStatus.value = status;
}

function onKillDone(): void {
  killOpen.value = false;
  setTimeout(() => {
    void loadStatusesOnly();
  }, 500);
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
    :deleted="pipeline?.deleted"
    :breadcrumbs="breadcrumbs"
    :tabs="pipeline ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #meta>
      <Tag v-if="pipeline" :color="pipeline.enabled === false ? 'default' : 'success'">
        {{
          t(
            pipeline.enabled === false
              ? 'ingestion.pipelines.statusPaused'
              : 'ingestion.pipelines.statusActive',
          )
        }}
      </Tag>
      <Tag v-if="pipeline" :color="pipeline.deployed === true ? 'success' : 'default'">
        {{
          t(pipeline.deployed === true ? 'ingestion.pipelines.deployed' : 'ingestion.pipelines.undeployed')
        }}
      </Tag>
    </template>
    <template #actions>
      <Button
        data-testid="deploy-pipeline"
        type="primary"
        :disabled="!pipeline || !canDeploy"
        :loading="deploying"
        @click="onDeploy"
      >
        {{ t(pipeline?.deployed === true ? 'ingestion.pipelines.redeploy' : 'ingestion.pipelines.deploy') }}
      </Button>
      <Button
        data-testid="trigger-pipeline"
        :disabled="!pipeline || !canTrigger"
        :loading="triggering"
        @click="onTrigger"
      >
        {{ t('ingestion.pipelines.trigger') }}
      </Button>
      <Tooltip
        :title="
          pipeline?.deployed === true
            ? t(pipeline.enabled === false ? 'ingestion.pipelines.resume' : 'ingestion.pipelines.pause')
            : t('ingestion.pipelines.notDeployed')
        "
      >
        <Button
          :data-testid="pipeline?.enabled === false ? 'resume-button' : 'pause-button'"
          :disabled="!pipeline || !canToggleStatus || pipeline.deployed !== true"
          :loading="toggling"
          @click="onToggle"
        >
          {{ t(pipeline?.enabled === false ? 'ingestion.pipelines.resume' : 'ingestion.pipelines.pause') }}
        </Button>
      </Tooltip>
      <Button
        data-testid="logs-pipeline"
        :disabled="!pipeline || !canViewLogs"
        @click="logsOpen = true"
      >
        {{ t('ingestion.pipelines.logs') }}
      </Button>
      <Button
        v-if="canKillPermission"
        data-testid="kill-pipeline"
        danger
        :disabled="!pipeline || !canKill"
        @click="killOpen = true"
      >
        {{ t('ingestion.pipelines.kill') }}
      </Button>
      <Button data-testid="edit-pipeline" :disabled="!pipeline || !canEdit" @click="onEdit">{{ t('crud.edit') }}</Button>
      <Tooltip :title="t('crud.deleteHelp')">
        <Button
          data-testid="delete-pipeline"
          danger
          :disabled="!pipeline || !canDelete"
          :aria-label="t('crud.deleteHelp')"
          @click="onDelete"
        >
          {{ t('crud.delete') }}
        </Button>
      </Tooltip>
      <Button data-testid="refresh-status" :disabled="!pipeline" @click="loadStatusesOnly">
        {{ t('crud.refresh') }}
      </Button>
    </template>
    <template #overview>
      <Alert
        v-if="orchestratorUnavailable"
        type="warning"
        show-icon
        data-testid="pipeline-orchestrator-banner"
        :message="orchestratorBannerMessage"
        style="margin-top: 16px"
      />
      <Alert
        v-if="actionResult"
        :type="actionResultType"
        show-icon
        data-testid="pipeline-action-result"
        :message="t('ingestion.pipelines.actionResult')"
        :description="[
          `${t('ingestion.pipelines.resultCode')}: ${actionResult.code ?? '—'}`,
          `${t('ingestion.pipelines.resultPlatform')}: ${actionResult.platform ?? '—'}`,
          `${t('ingestion.pipelines.resultReason')}: ${actionResult.reason ?? '—'}`,
          `${t('ingestion.pipelines.resultRun')}: ${actionResult.runId ?? '—'}`,
        ].join(' · ')"
        style="margin-top: 16px"
      />
      <Descriptions v-if="pipeline" bordered :column="1" size="small" style="margin-top: 16px">
        <Descriptions.Item :label="t('crud.name')">{{ pipeline.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ pipeline.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.type')">{{ pipeline.pipelineType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.service')">
          {{ pipeline.service?.name || service?.name || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.owners')">{{ ownersLabel }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.sourceConfig')">{{ sourceConfigSummary }}</Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.airflowConfig')">
          <span v-if="pipeline.airflowConfig?.scheduleInterval">
            <span>{{ schedulePrimary }}</span>
            <span v-if="scheduleSecondary" style="display: block; font-size: 12px; color: var(--sm-text-secondary)">
              {{ scheduleSecondary }}
            </span>
          </span>
          <span v-else>
            {{
              t('ingestion.pipelines.airflowValue', {
                pause: String(pipeline.airflowConfig?.pausePipeline ?? false),
                schedule: '',
              })
            }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('ingestion.pipelines.orchestrator')">{{ orchestratorLabel }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ pipeline.description || '—' }}</Descriptions.Item>
      </Descriptions>
      <p class="entity-detail__tab-lead">
        {{ t('ingestion.pipelines.yamlTitle') }}
        <Button
          v-if="cliYaml"
          size="small"
          data-testid="pipeline-copy-yaml"
          style="margin-left: 8px"
          @click="onCopyYaml"
        >
          {{ t('ingestion.pipelines.copy') }}
        </Button>
      </p>
      <pre v-if="cliYaml" class="ing-yaml" data-testid="pipeline-cli-yaml">{{ cliYaml }}</pre>
    </template>
    <template #status>
      <Alert
        v-if="statusError"
        type="error"
        show-icon
        data-testid="pipeline-status-error"
        :message="t('ingestion.pipelines.statusLoadFailed')"
        :description="statusError"
        style="margin-bottom: 16px"
      >
        <template #action>
          <Button size="small" @click="loadStatusesOnly">{{ t('shared.retry') }}</Button>
        </template>
      </Alert>
      <SmTable
        row-key="runId"
        size="small"
        test-id="pipeline-status-table"
        :columns="statusColumns"
        :data-source="statuses"
        :pagination="false"
        :loading="statusLoading"
        :empty-text="t('ingestion.pipelines.noRunRecords')"
        :custom-row="(record: PipelineStatus) => ({ onClick: () => onStatusRowClick(record) })"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatRunTimestamp((record as PipelineStatus).timestamp) }}
          </template>
          <template v-else-if="column.key === 'startDate'">
            {{ formatRunTimestamp((record as PipelineStatus).startDate) }}
          </template>
          <template v-else-if="column.key === 'endDate'">
            {{ formatRunTimestamp((record as PipelineStatus).endDate) }}
          </template>
          <template v-else-if="column.key === 'duration'">
            {{ formatRunDuration((record as PipelineStatus).startDate, (record as PipelineStatus).endDate) }}
          </template>
        </template>
      </SmTable>
      <Button
        v-if="statuses.length >= statusLimit"
        data-testid="pipeline-status-view-more"
        style="margin-top: 12px"
        :loading="statusLoading"
        @click="onViewMoreStatuses"
      >
        {{ t('crud.loadMore') }}
      </Button>
    </template>
  </EntityDetailShell>
  <IngestionLogsModal
    :open="logsOpen"
    :pipeline="pipeline"
    :log-entity-type="pipeline?.pipelineType === 'TestSuite' ? 'testSuite' : serviceKindFromRef(pipeline?.service?.type)"
    @close="logsOpen = false"
  />
  <KillPipelineModal
    :open="killOpen"
    :pipeline-id="pipeline?.id ?? ''"
    :pipeline-name="pipeline ? entityLabel(pipeline) : ''"
    @close="killOpen = false"
    @killed="onKillDone"
  />
  <IngestionRunDetailsModal
    :open="runDetailsStatus !== null"
    :status="runDetailsStatus"
    @close="runDetailsStatus = null"
  />
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-top: 24px;
  margin-bottom: 12px;
}
.ing-yaml {
  background: var(--sm-bg-elevated);
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
