<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import {Alert, Button, Descriptions, Tag, Tooltip, message} from 'ant-design-vue';
import { DetailWidgetKeys } from '@/catalog/detailWidgetDispatch';
import GenericTab from '@/components/customize/GenericTab.vue';
import SmTable from '@/components/shared/SmTable.vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import {
  deleteIngestionPipeline,
  deployIngestionPipeline,
  getIngestionPipeline,
  getOrchestratorStatus,
  isPipelineDeployed,
  listPipelineStatuses,
  toggleIngestionPipeline,
  triggerIngestionPipeline,
} from '@/api/ingestionPipelines';
import type { OperationPermissions } from '@/api/permissions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { getDetailsTabWithNewLabel, findCustomizedTabEntry, useCustomPages } from '@/composables/useCustomPages';
import { resolveWidgetLayout } from '@/composables/customizeWidgetLayout';
import { isWidgetLayoutTab } from '@/views/admin/persona/editors/customizePageData';
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
import { DATA_OBSERVABILITY_SEGMENT, kindToSegment } from '@/router/serviceTabSegments';
import type {
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineServiceClientResponse,
  PipelineStatus,
  ServiceKind,
} from '@/types/ingestion';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';
import IngestionLogsModal from './IngestionLogsModal.vue';
import IngestionRunDetailsModal from './IngestionRunDetailsModal.vue';
import KillPipelineModal from './KillPipelineModal.vue';
import PipelineDetailWidgetCell, {
  type PipelineDetailWidgetFragment,
} from './PipelineDetailWidgetCell.vue';

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

/**
 * D-4 derived flags (official getDerivedPermissionFlags): the
 * pipeline's `deleted` gates every Edit* flag. Deploy/Trigger are
 * their own operations and are read through the `can` escape hatch,
 * which applies the same derivation (deleted revokes Edit* only).
 */
const pipelineFlags = computed(() =>
  getDerivedPermissionFlags(pipelineOps.value ?? {}, pipeline.value?.deleted === true),
);
const canEditDescription = computed(() => pipelineFlags.value.canEditDescription);

const canDeploy = computed(
  () =>
    pipeline.value?.enabled !== false &&
    !orchestratorUnavailable.value &&
    (permissionStore.isAdminUser ||
      pipelineFlags.value.canEditAll ||
      pipelineFlags.value.can('Deploy')),
);
const canTrigger = computed(
  () =>
    pipeline.value?.enabled !== false &&
    pipeline.value?.deployed === true &&
    !orchestratorUnavailable.value &&
    (permissionStore.isAdminUser || pipelineFlags.value.can('Trigger')),
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
    pipelineFlags.value.canEditAll ||
    pipelineFlags.value.can('EditIngestionPipelineStatus'),
);
/** P-46: edit/delete gates (admin line ORs in, fail-closed). */
const canEdit = computed(
  () => permissionStore.isAdminUser || pipelineFlags.value.canEditAll,
);
const canDelete = computed(
  () => permissionStore.isAdminUser || pipelineFlags.value.canDelete,
);
/** P-05: Kill renders only for EditAll (or admin); the orchestrator gate disables it, it does not hide it. */
const canKillPermission = computed(
  () => permissionStore.isAdminUser || pipelineFlags.value.canEditAll,
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

/**
 * Parent of this detail page. The standalone `ingestion-pipelines`
 * list route was deleted — its content merged into the services
 * page Pipelines Tab (S-ROUTES §9) — so the parent is the kind's
 * Pipelines Tab: the dataObservability tab for TestSuite pipelines,
 * the kind tab otherwise. llm/mcp kinds have no list tab (C-2), so
 * no parent resolves for them: the crumb stays unlinked, and a
 * delete lands on the services overview instead (see onDelete).
 */
const pipelinesParentLocation = computed<RouteLocationRaw | null>(() => {
  const current = pipeline.value;
  if (!current) {
    return null;
  }
  if (current.pipelineType === 'TestSuite') {
    return {
      name: 'settings-services',
      params: { tab: DATA_OBSERVABILITY_SEGMENT },
      query: { tab: 'pipelines' },
    };
  }
  const segment = kindToSegment(serviceKindFromRef(current.service?.type));
  if (!segment) {
    return null;
  }
  return { name: 'settings-services', params: { tab: segment }, query: { tab: 'pipelines' } };
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => {
  const parent = pipelinesParentLocation.value;
  return [
    parent
      ? { label: t('ingestion.pipelines.title'), to: parent }
      : { label: t('ingestion.pipelines.title') },
    { label: entityLabel(pipeline.value) || t('ingestion.pipelines.title') },
  ];
});

// C-4 consume side: the selected persona's Pipeline page reorders and
// renames these tabs (official `getDetailsTabWithNewLabel` — see
// `useCustomPages.ts`). This is the ingestion-pipeline surface
// (overview + runs), not the official catalog-Pipeline tab set: the
// Pipeline TabsIds (`tasks`, `activity_feed`, `executions`, `lineage`,
// `contract`, `custom_properties`) resolve to neither rendered key,
// so both keys are product-only surfaces the editor's tab model can
// never mention (it writes Pipeline TabsIds only — a stored document
// can still name `overview` through the `documentation` alias, which
// renames it rather than removing it), and `preserveKeys` keeps
// them; only an explicitly empty list removes them.
const { customizedPage } = useCustomPages('Pipeline');

const tabs = computed<EntityDetailTab[]>(() =>
  getDetailsTabWithNewLabel(
    [
      { key: 'overview', label: t('crud.overview'), testId: 'pipeline-tab-overview' },
      { key: 'status', label: t('ingestion.pipelines.statusTab'), testId: 'pipeline-tab-status' },
    ],
    customizedPage.value?.tabs,
    { preserveKeys: ['overview', 'status'] },
  ),
);

// B-8 widget layer: a tab renders the widget grid only when the
// customized page carries a tab entry resolving to the rendered tab
// key AND the entry's official id is a mount tab for this page type
// (`isWidgetLayoutTab`). The editor saves an entry for every system
// tab with `layout: []` on the non-editable ones, so entry existence
// alone would blank tabs whose official children are fixed. The
// check uses the ENTRY's id — not the rendered key, which may differ
// through an alias — because the official mount set is keyed by tab
// id. The mechanism is currently inert on this surface: the Pipeline
// mount tab is `tasks`, and this ingestion-pipeline view renders no
// tasks tab (overview + status only), so no stored entry can both
// resolve to a rendered key and pass the mount check; the wiring
// stays so a future tasks surface activates it without a behavior
// change here. A resolved mount tab whose layout is []/missing/
// non-array would still render an empty grid. `null` means "no grid"
// (no entry, a non-mount entry, or no customized page): the existing
// default pane renders unchanged. An empty array is a real (empty)
// grid, so callers compare against `null` rather than truthiness.
function widgetLayoutFor(slotKey: string): WidgetConfig[] | null {
  const entry = findCustomizedTabEntry(customizedPage.value?.tabs, slotKey);
  if (!entry?.id) {
    return null;
  }
  if (!isWidgetLayoutTab('Pipeline', entry.id)) {
    return null;
  }
  return resolveWidgetLayout('Pipeline', entry.id, customizedPage.value);
}

// Content-key → widget-cell fragment. This surface is not the
// official catalog Pipeline page: it has no task graph, no
// executions widget, and no custom-properties surface, so only the
// two fragments below have content here. Every other key (including
// PIPELINE_TASKS) maps to no fragment and its cell stays empty while
// keeping its grid space.
const WIDGET_CONTENT_FRAGMENTS: Record<string, PipelineDetailWidgetFragment> = {
  [DetailWidgetKeys.DESCRIPTION]: 'description',
  [DetailWidgetKeys.OWNERS]: 'owners',
};

function fragmentForContentKey(contentKey: string | null): PipelineDetailWidgetFragment | null {
  return contentKey ? (WIDGET_CONTENT_FRAGMENTS[contentKey] ?? null) : null;
}

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
  if (!isPipelineDeployed(result)) {
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
  await router.push(
    pipelinesParentLocation.value ?? { name: 'settings-category', params: { category: 'services' } },
  );
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
      <GenericTab
        v-if="widgetLayoutFor('overview') !== null"
        :layout="widgetLayoutFor('overview') ?? []"
        page-type="Pipeline"
      >
        <template #widget="{ contentKey }">
          <PipelineDetailWidgetCell
            :fragment="fragmentForContentKey(contentKey)"
            :pipeline="pipeline"
            :owners-label="ownersLabel"
          />
        </template>
      </GenericTab>
      <template v-else>
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
        <Descriptions.Item :label="t('crud.description')">
          <!-- D-3 preview-only: the ingestion Pipeline has no description
               write path (no onDescriptionUpdate), so the cell renders no
               edit button whatever the permission flags say. -->
          <EntityDescriptionCell
            :description="pipeline.description"
            :entity-name="pipeline.displayName || pipeline.name"
            :has-edit-access="canEditDescription"
          />
        </Descriptions.Item>
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
    </template>
    <template #status>
      <GenericTab
        v-if="widgetLayoutFor('status') !== null"
        :layout="widgetLayoutFor('status') ?? []"
        page-type="Pipeline"
      >
        <template #widget="{ contentKey }">
          <PipelineDetailWidgetCell
            :fragment="fragmentForContentKey(contentKey)"
            :pipeline="pipeline"
            :owners-label="ownersLabel"
          />
        </template>
      </GenericTab>
      <template v-else>
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
