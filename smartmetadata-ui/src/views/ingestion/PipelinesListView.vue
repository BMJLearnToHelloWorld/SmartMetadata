<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {Alert, Button, Form, Input, Modal, Select, Tag, Tooltip, Typography, message} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmTable from '@/components/shared/SmTable.vue';
import {
  bulkDeployIngestionPipelines,
  createIngestionPipeline,
  deployIngestionPipeline,
  getOrchestratorStatus,
  isPipelineClientDisabled,
  listIngestionPipelines,
} from '@/api/ingestionPipelines';
import { SERVICE_LIST_API } from '@/ingestion/serviceApis';
import { SERVICE_KIND_BY_ENTITY_TYPE } from '@/ingestion/connections';
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
import SchemaDrivenSourceConfigForm from '@/components/ingestion/SchemaDrivenSourceConfigForm.vue';
import {
  SERVICE_CATEGORY_BY_KIND,
  getSchemaByWorkflowType,
  type RjsfSchema,
} from '@/ingestion/ingestionSchemas';
import { canDeployPipeline } from '@/ingestion/pipelineActions';
import {
  getIngestionStatusCount,
  renderPipelineState,
  renderPipelineType,
  runBadgeColor,
  splitSearchHighlight,
} from '@/ingestion/pipelineDisplay';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { getSupportedPipelineTypes } from '@/ingestion/supportedPipelines';
import {
  PIPELINE_TYPES,
  type CatalogService,
  type IngestionPipeline,
  type OrchestratorStatus,
  type PipelineFormValues,
  type PipelineServiceClientResponse,
  type PipelineStatus,
  type PipelineType,
} from '@/types/ingestion';
import IngestionLogsModal from './IngestionLogsModal.vue';
import IngestionRunDetailsModal from './IngestionRunDetailsModal.vue';
import KillPipelineModal from './KillPipelineModal.vue';
import PipelineRowActions from './PipelineRowActions.vue';
import PipelineScheduleCell from './PipelineScheduleCell.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
/**
 * Official IngestionListTable gating: row actions come from the
 * per-pipeline entity permission by FQN, create from the
 * ingestionPipeline resource permission. A missing or failed fetch
 * denies (fail-closed), matching official canCreate=false-on-error.
 */
const permissionStore = usePermissionStore();
const pipelinePermissions = ref(new Map<string, OperationPermissions>());
const pipelineCreateAllowed = ref(false);
const permissionsLoading = ref(false);
const selectedRowKeys = ref<string[]>([]);
const bulkDeploying = ref(false);
const bulkResults = ref<Array<{ id: string; name: string } & PipelineServiceClientResponse>>([]);
const bulkResultsOpen = ref(false);
const bulkNotDeployed = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const pipelines = ref<IngestionPipeline[]>([]);
const catalogServices = ref<CatalogService[]>([]);
const servicesLoaded = ref(false);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);
const selectedTypes = ref<string[]>([]);
const selectedService = ref<string | undefined>(undefined);
const searchText = ref('');
const pageSize = ref(DEFAULT_PAGE_SIZE);
const sortOrder = ref<'asc' | 'desc' | undefined>(
  route.query.sortOrder === 'asc' ? 'asc' : route.query.sortOrder === 'desc' ? 'desc' : undefined,
);
const runDetailsStatus = ref<PipelineStatus | null>(null);
const form = reactive<PipelineFormValues>({
  name: '',
  displayName: '',
  description: '',
  pipelineType: 'metadata',
  serviceId: '',
  serviceKind: 'database',
  sourceConfigData: {},
  scheduleInterval: '',
});
// The schema-driven sourceConfig form (P-08(d)) for the create modal:
// resolved from the selected service + pipeline type.
const createSchema = ref<RjsfSchema | null>(null);
const createSchemaFormRef = ref<{ validate: () => boolean } | null>(null);
const createSchemaFormValid = ref(true);

/**
 * P-24: the orchestrator probe decides availability. Null counts only
 * once the probe has settled (a failed fetch is null too); while the
 * probe is in flight nothing is gated, so the banner and the disabled
 * buttons never flash on a healthy deployment.
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
  // Official AirflowMessageBanner: a disabled platform gets the disabled
  // fallback, otherwise the server reason, otherwise the unreachable one.
  if (orchestrator.value?.platform === 'disabled') {
    return t('ingestion.pipelines.orchestratorDisabled');
  }
  if (orchestrator.value?.reason) {
    return orchestrator.value.reason;
  }
  return t('ingestion.pipelines.orchestratorUnreachable');
});

const selectedFormService = computed(
  () => catalogServices.value.find((item) => item.id === form.serviceId) ?? null,
);

const availablePipelineTypes = computed<readonly PipelineType[]>(() => {
  const service = selectedFormService.value;
  if (!service) {
    return ['metadata'] as const;
  }
  // The list records carry the stored connection config, so the
  // flag-driven kinds derive synchronously — no extra GET per
  // selection (ADR:2026-11-14-autopilot-agents-ui-parity).
  return getSupportedPipelineTypes(service);
});

const columns = computed<EntityListColumn[]>(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: true,
    sortOrder: sortOrder.value === 'asc' ? 'ascend' : sortOrder.value === 'desc' ? 'descend' : null,
  },
  { title: t('crud.type'), dataIndex: 'pipelineType', key: 'pipelineType', width: 140 },
  { title: t('ingestion.pipelines.service'), key: 'service' },
  { title: t('ingestion.pipelines.count'), key: 'count', width: 190 },
  { title: t('ingestion.pipelines.scheduleInterval'), key: 'schedule', width: 210 },
  { title: t('ingestion.pipelines.recentRuns'), key: 'recentRuns', width: 210 },
  { title: t('ingestion.pipelines.status'), key: 'status', width: 110 },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

/** P-36: the list search filters the loaded page by name (official's searchText only highlights — the server offers no pipeline full-text search). */
const displayedPipelines = computed(() => {
  if (!searchText.value) {
    return pipelines.value;
  }
  const needle = searchText.value.toLowerCase();
  return pipelines.value.filter((pipeline) =>
    entityLabel(pipeline).toLowerCase().includes(needle),
  );
});

const typeFilterOptions = computed(() =>
  PIPELINE_TYPES.map((pipelineType) => ({
    value: pipelineType,
    label: t(`ingestion.pipelines.types.${pipelineType}`),
  })),
);

const serviceFilterOptions = computed(() =>
  catalogServices.value.map((service) => ({
    value: service.fullyQualifiedName ?? service.name,
    label: service.displayName ?? service.name,
  })),
);

const rowActions = usePipelineRowActions({
  isAdminUser: () => permissionStore.isAdminUser,
  getOps: (pipeline) => pipelinePermissions.value.get(pipeline.id),
  refresh: () => load(),
});

/**
 * Template auto-unwrap applies to top-level refs only: passing
 * `rowActions.logsPipeline` to a modal would hand it the Ref object
 * itself (and its `.value` would never update the prop). Bind the two
 * modal refs at top level; the handlers stay on `rowActions`.
 */
const logsPipeline = rowActions.logsPipeline;
const killPipeline = rowActions.killPipeline;

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [page, orch] = await Promise.all([
      listIngestionPipelines({
        limit: pageSize.value,
        after: cursor.value.after,
        pipelineType: selectedTypes.value.length ? selectedTypes.value.join(',') : undefined,
        service: selectedService.value,
        sortField: sortOrder.value ? 'displayName' : undefined,
        sortOrder: sortOrder.value,
      }),
      getOrchestratorStatus().catch(() => null),
    ]);
    pipelines.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
    orchestrator.value = orch;
    orchestratorChecked.value = true;
    void loadPipelinePermissions();
  } catch (error) {
    pipelines.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadPipelinePermissions(): Promise<void> {
  permissionsLoading.value = true;
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
  // P-17: Trigger and EditIngestionPipelineStatus arrive in the same
  // per-FQN fetch — the permission API returns the full operation map,
  // so no second request is needed; the Run and Pause/Resume gates read
  // them from this map (see pipelineActions.ts).
  permissionsLoading.value = false;
}

/**
 * P-49: the service list is fetched lazily, once — on first create-modal
 * open or first service-filter open — never on every load().
 */
let servicesLoading: Promise<void> | null = null;
async function ensureServicesLoaded(): Promise<void> {
  if (servicesLoaded.value) {
    return;
  }
  if (servicesLoading) {
    return servicesLoading;
  }
  servicesLoading = (async () => {
    const serviceKinds = Object.keys(SERVICE_LIST_API) as Array<keyof typeof SERVICE_LIST_API>;
    const settled = await Promise.allSettled(
      serviceKinds.map((kind) => SERVICE_LIST_API[kind]({ limit: 100 })),
    );
    catalogServices.value = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.data : [],
    );
    servicesLoaded.value = true;
  })();
  try {
    await servicesLoading;
  } finally {
    servicesLoading = null;
  }
}

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: Array<string | number>) => {
    selectedRowKeys.value = keys.map((key) => String(key));
  },
}));

const deployableSelected = computed(() =>
  pipelines.value.filter(
    (pipeline) =>
      selectedRowKeys.value.includes(pipeline.id) &&
      canDeployPipeline(permissionStore.isAdminUser, pipelinePermissions.value.get(pipeline.id), pipeline),
  ),
);

const bulkResultColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.pipelines.resultCode'), dataIndex: 'code', key: 'code', width: 120 },
  { title: t('ingestion.pipelines.resultPlatform'), dataIndex: 'platform', key: 'platform', width: 140 },
  { title: t('ingestion.pipelines.resultReason'), dataIndex: 'reason', key: 'reason' },
]);

function excludedReason(pipeline: IngestionPipeline): 'bulkDeployExcludedOrchestrator' | 'bulkDeployExcludedDisabled' | 'bulkDeployExcludedNoPermission' {
  if (orchestratorUnavailable.value) {
    return 'bulkDeployExcludedOrchestrator';
  }
  if (pipeline.enabled === false) {
    return 'bulkDeployExcludedDisabled';
  }
  return 'bulkDeployExcludedNoPermission';
}

async function onBulkDeploy(): Promise<void> {
  const selected = pipelines.value.filter((pipeline) =>
    selectedRowKeys.value.includes(pipeline.id),
  );
  const targets = deployableSelected.value;
  const excluded = selected.filter((pipeline) => !targets.includes(pipeline));
  if (excluded.length > 0) {
    const reasons = [...new Set(excluded.map((pipeline) => excludedReason(pipeline)))];
    message.warning(
      t('ingestion.pipelines.bulkDeployExcluded', {
        count: excluded.length,
        reason: reasons.map((reason) => t(`ingestion.pipelines.${reason}`)).join(', '),
      }),
    );
  }
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
    // P-29: the summary names the rows that were not actually deployed
    // (C-01: a 200 with reason "Pipeline Client Disabled" deployed nothing).
    bulkNotDeployed.value = bulkResults.value.filter(
      (result) => result.code !== 200 || isPipelineClientDisabled(result),
    ).length;
    bulkResultsOpen.value = true;
    selectedRowKeys.value = [];
    // C-01: re-fetch row statuses after the 500ms delay.
    setTimeout(() => {
      void load();
    }, 500);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    bulkDeploying.value = false;
  }
}

function resetCursorAndLoad(): void {
  cursor.value = createCursorPager();
  void load();
}

function onFilterChange(): void {
  resetCursorAndLoad();
}

function onServiceFilterOpen(open: boolean): void {
  if (open) {
    void ensureServicesLoaded();
  }
}

/**
 * antd Select emits SelectValue (string | number | arrays | ...); the
 * handlers take unknown and narrow to what the control actually offers,
 * so the signature stays assignable to the component's onChange type.
 */
function onServiceFilterChange(value: unknown): void {
  selectedService.value = typeof value === 'string' ? value : undefined;
  onFilterChange();
}

function onPageSizeChange(value: unknown): void {
  const size = Number(value);
  if (!Number.isFinite(size)) {
    return;
  }
  pageSize.value = size;
  resetCursorAndLoad();
}

function onTableChange(sorter: { columnKey?: string | number; order?: 'ascend' | 'descend' | null }): void {
  if (sorter.columnKey !== 'name') {
    return;
  }
  sortOrder.value =
    sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : undefined;
  // P-28: the sort value is written to the route query string (?sortOrder=).
  void router.replace({
    query: {
      ...route.query,
      ...(sortOrder.value ? { sortOrder: sortOrder.value } : { sortOrder: undefined }),
    },
  });
  resetCursorAndLoad();
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

function onServiceChange(id: unknown): void {
  if (typeof id !== 'string') {
    return;
  }
  form.serviceId = id;
  const service = catalogServices.value.find((item) => item.id === id);
  if (service) {
    form.serviceKind = service.kind;
    const kinds = getSupportedPipelineTypes(service);
    if (!kinds.includes(form.pipelineType as PipelineType)) {
      form.pipelineType = kinds[0] ?? 'metadata';
    }
  }
}

async function onCreate(): Promise<void> {
  const service = selectedFormService.value;
  if (!service) {
    message.error(t('ingestion.pipelines.selectService'));
    return;
  }
  // The schema form validates its own fields (AJV + ownerConfig maps)
  // and shows the errors inline.
  if (createSchemaFormRef.value && !createSchemaFormRef.value.validate()) {
    return;
  }
  if (!createSchemaFormValid.value) {
    return;
  }
  creating.value = true;
  try {
    const created = await createIngestionPipeline({
      name: form.name.trim(),
      pipelineType: form.pipelineType || 'metadata',
      service: { id: service.id, type: entityTypeForKind(service.kind) },
      sourceConfig: buildSourceConfig({
        pipelineType: form.pipelineType as PipelineType,
        serviceKind: service.kind,
        sourceConfigData: form.sourceConfigData ?? {},
      }),
      airflowConfig: {
        scheduleInterval: form.scheduleInterval?.trim() || undefined,
      },
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
    });
    // P-30: a created pipeline is deployed immediately (official
    // onAddIngestionSave -> onIngestionDeploy). The deploy runs outside
    // the create try: a deploy throw must not be reported as a create
    // failure — the pipeline was created, only its deploy failed. A
    // disabled client or a non-200 deploy is the existing deployFailed
    // error, never a bare "created" success toast.
    let deployFailed = false;
    try {
      const deployResult = await deployIngestionPipeline(created.id);
      deployFailed =
        isPipelineClientDisabled(deployResult) ||
        (deployResult.code !== undefined && deployResult.code !== 200);
    } catch {
      deployFailed = true;
    }
    createOpen.value = false;
    if (deployFailed) {
      message.error(t('ingestion.pipelines.deployFailed'));
    } else {
      message.success(t('ingestion.pipelines.created', { name: created.name }));
    }
    setTimeout(() => {
      void load();
    }, 500);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

function openDetail(pipeline: IngestionPipeline): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: pipeline.id } });
}

/** Official openLogs branch (PipelineActions.tsx:112-122): TestSuite -> testSuite, otherwise the service category. */
function logEntityTypeFor(pipeline: IngestionPipeline): string {
  if (pipeline.pipelineType === 'TestSuite') {
    return 'testSuite';
  }
  return SERVICE_KIND_BY_ENTITY_TYPE[pipeline.service?.type ?? ''] ?? '';
}

function openRunDetails(status: PipelineStatus): void {
  runDetailsStatus.value = status;
}

/** Recent runs, newest first in the data, rendered oldest-first like official IngestionRecentRuns (latest last, with text). */
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

watch(createOpen, (open) => {
  if (open) {
    void ensureServicesLoaded();
  }
});

// Resolve the ingestion schema for the create modal's (service, type)
// selection; a new selection means a new config, so the form data resets
// and the form remounts (via :key) to seed the schema defaults.
async function loadCreateSchema(): Promise<void> {
  const service = selectedFormService.value;
  if (!createOpen.value || !service) {
    createSchema.value = null;
    return;
  }
  createSchema.value = await getSchemaByWorkflowType(
    form.pipelineType as PipelineType,
    SERVICE_CATEGORY_BY_KIND[service.kind],
    service.serviceType,
  );
  form.sourceConfigData = {};
}

watch(
  () => [form.serviceId, form.pipelineType],
  () => {
    void loadCreateSchema();
  },
);

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
    :data-source="displayedPipelines"
    table-test-id="pipelines-table"
    show-row-actions
    :row-actions-loading="permissionsLoading"
    :row-selection="rowSelection"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    show-search
    :search-value="searchText"
    :search-placeholder="t('ingestion.pipelines.searchByName')"
    :empty-text="t('ingestion.pipelines.noPipelinesYet')"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="openDetail($event as IngestionPipeline)"
    @table-change="onTableChange"
    @update:search-value="searchText = $event"
  >
    <template #rowActions="{ record }">
      <PipelineRowActions
        :pipeline="record as IngestionPipeline"
        :ops="pipelinePermissions.get((record as IngestionPipeline).id)"
        :is-admin-user="permissionStore.isAdminUser"
        :orchestrator-unavailable="orchestratorUnavailable"
        @run="rowActions.onRun"
        @deploy="rowActions.onDeploy"
        @toggle="rowActions.onToggle"
        @logs="rowActions.onLogs"
        @edit="rowActions.onEdit"
        @kill="rowActions.onKill"
        @delete="rowActions.onDelete"
      />
    </template>
    <template #actions>
      <Button
        data-testid="bulk-deploy-pipelines"
        :disabled="orchestratorUnavailable || deployableSelected.length === 0 || loading"
        :loading="bulkDeploying"
        @click="onBulkDeploy"
      >
        {{ t('ingestion.pipelines.deploySelected') }}
      </Button>
      <Button
        type="primary"
        data-testid="create-pipeline"
        :disabled="!pipelineCreateAllowed || loading || orchestratorUnavailable"
        @click="createOpen = true"
      >
        {{ t('ingestion.pipelines.create') }}
      </Button>
    </template>
    <template #filters>
      <Alert
        v-if="orchestratorUnavailable"
        type="warning"
        show-icon
        data-testid="pipeline-orchestrator-banner"
        :message="orchestratorBannerMessage"
      />
      <Select
        v-model:value="selectedTypes"
        mode="multiple"
        :placeholder="t('ingestion.pipelines.filterByType')"
        data-testid="pipeline-type-filter"
        style="width: 220px"
        :options="typeFilterOptions"
        @change="onFilterChange"
      />
      <Select
        :value="selectedService"
        :placeholder="t('ingestion.pipelines.filterByService')"
        data-testid="pipeline-service-filter"
        style="width: 220px"
        allow-clear
        :options="serviceFilterOptions"
        @change="onServiceFilterChange"
        @dropdown-visible-change="onServiceFilterOpen"
      />
      <Select
        :value="pageSize"
        :aria-label="t('ingestion.pipelines.pageSize')"
        data-testid="pipeline-page-size"
        style="width: 110px"
        @change="onPageSizeChange"
      >
        <Select.Option :value="10">10</Select.Option>
        <Select.Option :value="25">25</Select.Option>
        <Select.Option :value="50">50</Select.Option>
      </Select>
    </template>
    <template #emptyExtra>
      <Typography.Text v-if="orchestratorUnavailable" type="secondary">
        {{ orchestratorBannerMessage }}
      </Typography.Text>
      <Button
        v-else
        type="primary"
        data-testid="empty-create-pipeline"
        :disabled="!pipelineCreateAllowed"
        @click="createOpen = true"
      >
        {{ t('ingestion.pipelines.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`pipeline-row-${(record as IngestionPipeline).id}`"
          @click.prevent="openDetail(record as IngestionPipeline)"
        >
          <template v-for="(part, index) in splitSearchHighlight(entityLabel(record as IngestionPipeline), searchText)" :key="index">
            <mark v-if="part.match">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </a>
      </template>
      <template v-else-if="column.key === 'pipelineType'">
        {{ renderPipelineType((record as IngestionPipeline).pipelineType) }}
      </template>
      <template v-else-if="column.key === 'service'">
        {{ (record as IngestionPipeline).service?.name || '—' }}
      </template>
      <template v-else-if="column.key === 'count'">
        <span v-if="getIngestionStatusCount(record as IngestionPipeline)" :data-testid="`pipeline-count-${(record as IngestionPipeline).id}`">
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
      <template v-else-if="column.key === 'schedule'">
        <PipelineScheduleCell
          :schedule-interval="(record as IngestionPipeline).airflowConfig?.scheduleInterval"
        />
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
              :data-testid="`pipeline-status-${status.runId}`"
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
      <template v-else-if="column.key === 'description'">
        <span :title="(record as IngestionPipeline).description || ''">
          {{ (record as IngestionPipeline).description || '—' }}
        </span>
      </template>
    </template>
  </EntityListShell>
  <Modal
    :open="bulkResultsOpen"
    :title="t('ingestion.pipelines.bulkDeployResults')"
    :footer="null"
    @cancel="bulkResultsOpen = false"
  >
    <p v-if="bulkNotDeployed > 0" data-testid="bulk-deploy-summary">
      {{ t('ingestion.pipelines.bulkDeployNotDeployed', { count: bulkNotDeployed }) }}
    </p>
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
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="form.displayName" data-testid="create-pipeline-display-name" />
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
      <SchemaDrivenSourceConfigForm
        v-if="createSchema"
        :key="`${form.serviceKind}-${form.pipelineType}`"
        ref="createSchemaFormRef"
        :schema="createSchema"
        v-model="form.sourceConfigData"
        @validity-change="(valid) => (createSchemaFormValid = valid)"
      />
      <Form.Item :label="t('ingestion.pipelines.schedule')" :extra="t('ingestion.pipelines.scheduleHelp')">
        <Input v-model:value="form.scheduleInterval" placeholder="0 0 * * *" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
  <IngestionLogsModal
    :open="logsPipeline !== null"
    :pipeline="logsPipeline"
    :log-entity-type="logsPipeline ? logEntityTypeFor(logsPipeline) : ''"
    @close="logsPipeline = null"
  />
  <KillPipelineModal
    :open="killPipeline !== null"
    :pipeline-id="killPipeline?.id ?? ''"
    :pipeline-name="killPipeline ? entityLabel(killPipeline) : ''"
    @close="killPipeline = null"
    @killed="rowActions.onKillDone"
  />
  <IngestionRunDetailsModal
    :open="runDetailsStatus !== null"
    :status="runDetailsStatus"
    @close="runDetailsStatus = null"
  />
</template>
