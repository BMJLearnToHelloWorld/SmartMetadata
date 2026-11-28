<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Tooltip, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import { setFieldPatch } from '@/admin/jsonPatch';
import { triggerOnDemandApp } from '@/api/apps';
import { getOrchestratorStatus } from '@/api/ingestionPipelines';
import { getDerivedPermissionFlags, permissionFlags, type OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import { useAuthStore } from '@/stores/auth';
import {
  getWorkflowInstanceStates,
  listWorkflowInstances,
  type WorkflowInstance,
  type WorkflowStatesData,
} from '@/api/workflows';
import {
  createTestConnectionWorkflow,
  deleteTestConnectionWorkflow,
  getTestConnectionDefinition,
  getTestConnectionWorkflow,
  isTestConnectionComplete,
  triggerTestConnectionWorkflow,
} from '@/api/testConnections';
import { countDataModels } from '@/api/dataModels';
import { countDriveAssets } from '@/api/driveAssets';
import type { ServicePageData } from '@/api/servicePageData';
import {
  applyFollowChange,
  applyUnfollowChange,
  followService,
  isServiceFollowing,
  unfollowService,
} from '@/api/serviceFollowers';
import { patchService } from '@/api/servicePatch';
import {
  buildServiceChildrenFields,
  CHILD_ENTITY_TYPE_BY_KIND,
  fetchServiceChildren,
} from '@/api/serviceChildren';
import {
  isOpenMetadataService,
  listServiceAgents,
  resolveAgentsFetchMode,
  resolveAgentsRefreshMode,
  searchServiceAgents,
} from '@/api/serviceAgents';
import { createEmptyPaging, PAGE_SIZE_BASE } from '@/catalog/servicePaging';
import {
  defaultServiceDetailTab,
  firstServiceDetailTab,
  resolveServiceDetailTabs,
} from '@/catalog/serviceDetailTabs';
import SmState from '@/components/shared/SmState.vue';
import FormModal from '@/components/shared/FormModal.vue';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import DataModelsTab from '@/components/ingestion/DataModelsTab.vue';
import DeploymentSummaryCard from '@/components/ingestion/DeploymentSummaryCard.vue';
import DriveAssetTable from '@/components/ingestion/DriveAssetTable.vue';
import MetadataAgentsView from '@/components/ingestion/MetadataAgentsView.vue';
import RunHistoryDrawer from '@/components/ingestion/RunHistoryDrawer.vue';
import ServiceAttributesCard from '@/components/ingestion/ServiceAttributesCard.vue';
import ServiceConnectionDetails from '@/components/ingestion/ServiceConnectionDetails.vue';
import ServiceHeaderFacets from '@/components/ingestion/ServiceHeaderFacets.vue';
import ServiceInsightsTab from '@/components/ingestion/ServiceInsightsTab.vue';
import ServiceMainTab, {
  type ServiceChildRow,
  type ServiceMainTabDetails,
} from '@/components/ingestion/ServiceMainTab.vue';
import { withRequiredFqn } from '@/components/ingestion/serviceChildTable';
import DeleteEntityModal from '@/features/crud/DeleteEntityModal.vue';
import RestoreEntityModal from '@/features/crud/RestoreEntityModal.vue';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import { descriptionPatch } from '@/governance/assetPatch';
import {
  entityTypeForKind,
  SERVICE_KIND_BY_ENTITY_TYPE,
  SERVICE_TYPE_LABEL_KEY_BY_KIND,
} from '@/ingestion/connections';
import {
  AUTO_PILOT_APP_NAME,
  AUTO_PILOT_WORKFLOW_NAME,
  getDayAgoStartGMTinMillis,
  isAutoPilotServiceType,
  isExcludedAutoPilotServiceType,
} from '@/ingestion/autoPilot';
import { agentOverflowPermissions, type AgentAction } from '@/ingestion/agentsUtils';
import { shouldTestConnection } from '@/ingestion/connectionTest';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import { getIngestionTypes, getSupportedPipelineTypes } from '@/ingestion/supportedPipelines';
import { useMetadataAgents } from '@/ingestion/useMetadataAgents';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { getEntityFeedLink } from '@/utils/entityLink';
import { SERVICE_DELETE_API, SERVICE_GET_API, SERVICE_RESTORE_API } from '@/ingestion/serviceApis';
import { getServiceByFqn } from '@/api/serviceLookup';
import { serviceKindFromCategory } from '@/api/serviceVersions';
import { getEditConnectionPath, getServiceDetailsPath, getServiceVersionPath } from '@/utils/fqnPaths';
import { waitForServiceDelete, type DeleteType } from '@/ingestion/serviceDelete';
import type { EntityRef } from '@/types/api';
import type {
  Agent,
  CatalogService,
  IngestionPipeline,
  OrchestratorStatus,
  ServiceAttributes,
  ServiceKind,
  TestConnectionStepResult,
} from '@/types/ingestion';
import IngestionLogsModal from './IngestionLogsModal.vue';
import KillPipelineModal from './KillPipelineModal.vue';

const props = defineProps<{
  serviceCategory: string;
  fqn: string;
  tab?: string;
  subTab?: string;
}>();
const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const deleting = ref(false);
const deleteModalOpen = ref(false);
const restoreModalOpen = ref(false);
const restoring = ref(false);
const servicePermission = ref<OperationPermissions>({});

/**
 * Pin ManageButton / DataAssetsHeader gating (D-F9): the delete entry
 * is omitted when Operation.Delete is denied, and restore rides the
 * ungated EditAll flag. No isAdminUser check gates either. The flags
 * come from the service entity's own permission (fetched in load);
 * until it arrives the entries stay hidden (fail-closed).
 */
const canDeleteService = computed(() => permissionFlags(servicePermission.value).canDelete);
const canRestoreService = computed(() => permissionFlags(servicePermission.value).canEditAll);

/**
 * Pin ServiceDetailsPage flags: the page-level `flags` are derived
 * with the default deleted=false (pin :487-490), so the Connection
 * tab, the Test button, and the header Edit button all ride the
 * UNGATED EditAll flag. The facets strip and the main tab's own
 * edit affordances use the deleted-gated derivation instead.
 */
const ungatedFlags = computed(() => getDerivedPermissionFlags(servicePermission.value));
const gatedFlags = computed(() =>
  getDerivedPermissionFlags(servicePermission.value, service.value?.deleted ?? false),
);

const kind = computed(() => serviceKindFromCategory(props.serviceCategory));

function requireKind(): ServiceKind {
  const value = kind.value;
  if (!value) {
    throw new Error(t('crud.loadFailed'));
  }
  return value;
}

/** Kind-specific service-type label for the delete/restore modals (pin: never a generic "Service"). */
const serviceTypeLabel = computed(() =>
  kind.value ? t(SERVICE_TYPE_LABEL_KEY_BY_KIND[kind.value]) : t('ingestion.services.title'),
);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  // DESIGN §6.7 row 3: the parent chain points at the Services
  // overview (the services category page), not the Connections list.
  // The hard-delete navigation below lands on the Connections list
  // (B-7(c): the staged aggregate list is retired).
  {
    label: t('ingestion.services.title'),
    to: { name: 'settings-category', params: { category: 'services' } },
  },
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
const ingestionPipelineCreateAllowed = ref(false);
const applicationTriggerAllowed = ref(false);
const workflowInstancesLoading = ref(false);
const autoPilotRunning = ref(false);
const triggeringAutoPilot = ref(false);
/** First AutoPilotWorkflow instance, passed straight through to the Insights widget (poll-only). */
const liveAutoPilotStatus = ref<WorkflowInstance | undefined>(undefined);
/** Pin `workflowStatesData`: the first instance plus that run's states, threaded to the Insights tab. */
const workflowStatesData = ref<WorkflowStatesData | undefined>(undefined);
/** FQNs whose entity permission was already requested, so the fill watch never re-fetches. */
const requestedPermissionFqns = new Set<string>();

/**
 * Agents list filters (pin ServiceDetailsPage state): the page has
 * no filter UI, so they stay at their empty defaults and the
 * scheduler always lists — but the resolver wiring is real, and a
 * future filter UI only sets these refs.
 */
const agentsSearchText = ref('');
const agentsTypeFilter = ref<string[]>([]);
const agentsStatusFilter = ref<string[]>([]);

const serviceEntityType = computed(() => (kind.value ? entityTypeForKind(kind.value) : undefined));
const serviceEntityLink = computed(() =>
  serviceEntityType.value
    ? getEntityFeedLink(serviceEntityType.value, service.value?.fullyQualifiedName)
    : undefined,
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

/** Official ServiceDetailsPage: the Agents tab shows for the service owner, a member of an owner team, or an admin — never admin-only. */
const showAgentsTab = computed(() => {
  const ownerIds = new Set(
    (service.value?.owners ?? []).map((owner) => owner.id).filter(Boolean),
  );
  const currentUser = authStore.user;
  const userOwnsService = currentUser?.id ? ownerIds.has(currentUser.id) : false;
  const userInOwnerTeam = (currentUser?.teams ?? []).some(
    (team) => team.id && ownerIds.has(team.id),
  );
  return userOwnsService || userInOwnerTeam || permissionStore.isAdminUser;
});

const tabDefs = computed(() =>
  kind.value
    ? resolveServiceDetailTabs({
        kind: kind.value,
        showAgentsTab: showAgentsTab.value,
        canEditAll: ungatedFlags.value.canEditAll,
      })
    : [],
);

/** The main tab's dynamic slot key (English count-label slug); empty when the kind has no main tab. */
const mainTabKey = computed(() => tabDefs.value.find((def) => def.kind === 'main')?.key ?? '');

/**
 * URL-driven tab (official SERVICE_WITH_TAB path): the tab lives in
 * the route path, not `?tab=`. An absent tab resolves to the kind
 * default (metadata → agents, security → connection, else insights);
 * an invalid tab falls back to the first visible tab without
 * rewriting the URL. An empty tab set renders no tab rather than
 * crashing.
 */
const urlTab = computed(() => (typeof props.tab === 'string' && props.tab ? props.tab : undefined));
const renderedTab = computed(() => {
  const wanted = urlTab.value ?? (kind.value ? defaultServiceDetailTab(kind.value) : undefined);
  if (tabDefs.value.some((def) => def.key === wanted)) {
    return wanted;
  }
  return firstServiceDetailTab(tabDefs.value) ?? '';
});
const activeTab = computed({
  get: () => renderedTab.value,
  set: (key: string) => {
    activeTabHandler(key);
  },
});
function activeTabHandler(key: string): void {
  if (key === renderedTab.value) {
    return;
  }
  // Switching tabs clears every other query param (pin navigation
  // semantics): paging, search, and show-deleted state do not leak
  // across tabs.
  const fqn = props.fqn || service.value?.fullyQualifiedName;
  const category = props.serviceCategory;
  if (fqn && category) {
    void router.push(getServiceDetailsPath(fqn, category, key, key === 'agents' ? props.subTab || 'metadata' : undefined));
  }
}

const tabs = computed<EntityDetailTab[]>(() =>
  tabDefs.value.map((def) => ({
    key: def.key,
    label: t(def.labelKey),
    testId: `service-tab-${def.key}`,
    count:
      def.kind === 'agents'
        ? agentsTabCount.value
        : def.kind === 'main'
          ? mainPaging.paging.value.total
          : def.key === 'data-model'
            ? dataModelCount.value
            : def.key === 'files'
              ? filesCount.value
              : def.key === 'spreadsheets'
                ? spreadsheetsCount.value
                : undefined,
  })),
);

/** Official Ingestion.component: resource Create plus a non-disabled platform. */
const showAddAgent = computed(
  () =>
    ingestionPipelineCreateAllowed.value && serviceOrchestrator.value?.platform !== 'disabled',
);

/** Flag-driven add menu (ADR:2026-11-14-autopilot-agents-ui-parity), one-Usage rule applied. */
const supportedTypes = computed(() =>
  service.value && kind.value
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
    !!serviceEntityType.value &&
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

// ---------------------------------------------------------------------------
// Main-tab children + secondary counts
// ---------------------------------------------------------------------------

const mainPaging = useCursorPaging();
/** The show-deleted toggle lives in the URL (pin `showDeletedTables` filter); absent means false. */
const showDeletedTables = computed(() => route.query.showDeletedTables === 'true');
const schemaSearch = computed(() => {
  const raw = route.query.schema;
  return typeof raw === 'string' ? raw : '';
});
const children = ref<ServicePageData[]>([]);
const childrenLoading = ref(false);
const childViewUsageAllowed = ref(false);
const childPermissionSettled = ref(false);
const dataModelCount = ref(0);
const filesCount = ref(0);
const spreadsheetsCount = ref(0);
let childrenRequest = 0;

const childrenRows = computed<ServiceChildRow[]>(() =>
  children.value.map(withRequiredFqn),
);

function onShowDeletedChange(checked: boolean): void {
  void router.replace({
    query: { ...route.query, showDeletedTables: String(checked) },
  });
}

function setSchemaFilter(filters: { schema?: string }): void {
  const query = { ...route.query };
  if (filters.schema) {
    query.schema = filters.schema;
  } else {
    delete query.schema;
  }
  void router.replace({ query });
}

/** The main tab drives the shared loading flag while its search fetch runs. */
function setChildrenLoading(loadingValue: boolean): void {
  childrenLoading.value = loadingValue;
}

/**
 * Pin getOtherDetails: the current page of child entities for the
 * main tab, dispatched by kind. While a schema search is active the
 * main tab owns the list (its own search effect) and this fetch
 * stays out. A failure blanks the list silently, as the pin does;
 * kinds without a child table resolve to an empty list. A
 * latest-request guard keeps a slow page from overwriting a newer
 * one.
 */
async function loadChildren(): Promise<void> {
  const fqn = service.value?.fullyQualifiedName;
  if (!fqn || !kind.value || !childPermissionSettled.value || schemaSearch.value) {
    return;
  }
  const serviceKind = kind.value;
  const cursor = mainPaging.pagingCursor.value;
  const page = fetchServiceChildren(serviceKind, {
    service: fqn,
    fields: buildServiceChildrenFields(serviceKind, childViewUsageAllowed.value),
    paging: {
      limit: mainPaging.pageSize.value,
      after: cursor.cursorType === 'after' ? cursor.cursorValue : undefined,
      before: cursor.cursorType === 'before' ? cursor.cursorValue : undefined,
    },
    include: showDeletedTables.value ? 'deleted' : 'non-deleted',
  });
  if (!page) {
    children.value = [];
    mainPaging.handlePagingChange(createEmptyPaging());
    return;
  }
  const token = ++childrenRequest;
  childrenLoading.value = true;
  try {
    const result = await page;
    if (token !== childrenRequest) {
      return;
    }
    children.value = result.data;
    mainPaging.handlePagingChange({
      total: result.total ?? 0,
      after: result.after ?? '',
      before: result.before ?? '',
    });
  } catch {
    if (token !== childrenRequest) {
      return;
    }
    children.value = [];
    mainPaging.handlePagingChange(createEmptyPaging());
  } finally {
    if (token === childrenRequest) {
      childrenLoading.value = false;
    }
  }
}

watch(
  [
    () => service.value?.fullyQualifiedName,
    () => mainPaging.pagingCursor.value,
    () => mainPaging.pageSize.value,
    showDeletedTables,
    schemaSearch,
    childPermissionSettled,
  ],
  () => {
    void loadChildren();
  },
);

/**
 * Pin fetchDashboardsDataModel count pattern (limit 0, total only)
 * for the secondary tab badges. A failure toasts and zeroes the
 * badge, as the pin does — it never blocks the main table.
 */
async function loadSecondaryCounts(): Promise<void> {
  const fqn = service.value?.fullyQualifiedName;
  if (!fqn) {
    return;
  }
  const include = showDeletedTables.value ? 'deleted' : 'non-deleted';
  if (kind.value === 'dashboard') {
    try {
      dataModelCount.value = await countDataModels(fqn, include);
    } catch (error) {
      dataModelCount.value = 0;
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  }
  if (kind.value === 'drive') {
    try {
      filesCount.value = await countDriveAssets('file', fqn, include);
    } catch (error) {
      filesCount.value = 0;
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
    try {
      spreadsheetsCount.value = await countDriveAssets('spreadsheet', fqn, include);
    } catch (error) {
      spreadsheetsCount.value = 0;
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  }
}

watch(
  [() => service.value?.fullyQualifiedName, showDeletedTables],
  () => {
    void loadSecondaryCounts();
  },
);

// ---------------------------------------------------------------------------
// Agents scheduler (D18)
// ---------------------------------------------------------------------------

async function probeOrchestrator(): Promise<void> {
  try {
    serviceOrchestrator.value = await getOrchestratorStatus();
  } catch {
    serviceOrchestrator.value = null;
  } finally {
    serviceOrchestratorChecked.value = true;
  }
}

async function fetchAgentsPage(mode: 'list' | 'search'): Promise<void> {
  const target = service.value;
  if (!target?.fullyQualifiedName || !kind.value) {
    return;
  }
  pipelinesLoading.value = true;
  pipelinesError.value = '';
  try {
    const page =
      mode === 'search'
        ? await searchServiceAgents({
            searchText: agentsSearchText.value,
            page: 1,
            pageSize: PAGE_SIZE_BASE,
            serviceDisplayName:
              target.displayName || target.name || target.fullyQualifiedName,
            typeFilter: agentsTypeFilter.value,
            statusFilter: agentsStatusFilter.value,
          })
        : await listServiceAgents({
            serviceFqn: target.fullyQualifiedName,
            kind: requireKind(),
            pageSize: PAGE_SIZE_BASE,
          });
    servicePipelines.value = page.data;
    pipelinesTotal.value = page.total ?? page.data.length;
    loadedPipelinesFqn.value = target.fullyQualifiedName;
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

async function loadPipelines(): Promise<void> {
  const fqn = service.value?.fullyQualifiedName;
  if (!fqn || pipelinesLoaded.value) {
    return;
  }
  const mode = resolveAgentsFetchMode({
    searchText: agentsSearchText.value,
    typeFilter: agentsTypeFilter.value,
    statusFilter: agentsStatusFilter.value,
    isOpenMetadata: isOpenMetadataService(fqn),
  });
  if (mode === 'skip') {
    servicePipelines.value = [];
    pipelinesTotal.value = 0;
    loadedPipelinesFqn.value = fqn;
    pipelinesLoaded.value = true;
    return;
  }
  await fetchAgentsPage(mode);
}

/**
 * Pin refreshAgentsList: no OpenMetadata guard, and only the search
 * text decides — empty re-lists, non-empty re-runs the current
 * search. Filters are never cleared by a refresh.
 */
async function reloadPipelines(): Promise<void> {
  if (!service.value?.fullyQualifiedName) {
    return;
  }
  pipelinesLoaded.value = false;
  await fetchAgentsPage(resolveAgentsRefreshMode(agentsSearchText.value));
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

// ---------------------------------------------------------------------------
// Run history drawer (D12)
// ---------------------------------------------------------------------------

const drawerAgent = ref<Agent | null>(null);
const drawerRunId = ref<string | undefined>(undefined);
/** The live agent object from the stream, so the drawer's status stays current while open. */
const drawerLiveAgent = computed(() => {
  if (!drawerAgent.value) {
    return null;
  }
  return agents.value.find((agent) => agent.fqn === drawerAgent.value?.fqn) ?? drawerAgent.value;
});
const drawerPermissions = computed(() => {
  const pipeline = drawerAgent.value
    ? pipelinesByFqn.value.get(drawerAgent.value.fqn)
    : undefined;
  if (!pipeline) {
    return undefined;
  }
  return agentOverflowPermissions(servicePipelinePermissions.value.get(pipeline.id));
});

function onAgentRunDetails(agent: Agent, runId?: string): void {
  drawerAgent.value = agent;
  drawerRunId.value = runId;
}

function onAgentViewHistory(agent: Agent): void {
  drawerAgent.value = agent;
  drawerRunId.value = undefined;
}

function onDrawerOpenLogs(agent: Agent): void {
  const pipeline = pipelinesByFqn.value.get(agent.fqn);
  if (pipeline) {
    // The logs modal overlays the drawer; the drawer stays open.
    serviceRowActions.onLogs(pipeline);
  }
}

function onDrawerRun(agent: Agent): void {
  const pipeline = pipelinesByFqn.value.get(agent.fqn);
  if (pipeline) {
    serviceRowActions.onRun(pipeline);
  }
}

function logEntityTypeFor(pipeline: IngestionPipeline): string {
  if (pipeline.pipelineType === 'TestSuite') {
    return 'testSuite';
  }
  return SERVICE_KIND_BY_ENTITY_TYPE[pipeline.service?.type ?? ''] ?? '';
}

/**
 * Official ServiceDetailsPage.fetchWorkflowInstanceStates, whole: the
 * first AutoPilotWorkflow instance for this service in the last 7
 * days plus that run's states, fetched with the same window. The
 * trigger button reads the first instance's status; the Insights tab
 * receives the whole object, as pin threads it. A fetch failure
 * toasts and fails open — the button stays enabled rather than
 * trapping the user.
 */
async function loadWorkflowInstanceStates(): Promise<void> {
  if (!service.value?.fullyQualifiedName) {
    return;
  }
  workflowInstancesLoading.value = true;
  try {
    const startTs = getDayAgoStartGMTinMillis(6);
    const endTs = Date.now();
    const page = await listWorkflowInstances(AUTO_PILOT_WORKFLOW_NAME, {
      startTs,
      endTs,
      entityLink: serviceEntityLink.value,
    });
    const mainInstanceState = page.data[0];
    const subInstanceStates = mainInstanceState
      ? (
          await getWorkflowInstanceStates(AUTO_PILOT_WORKFLOW_NAME, mainInstanceState.id, {
            startTs,
            endTs,
          })
        ).data
      : [];
    workflowStatesData.value = { mainInstanceState, subInstanceStates };
    liveAutoPilotStatus.value = mainInstanceState;
    autoPilotRunning.value = mainInstanceState?.status === 'RUNNING';
  } catch (error) {
    workflowStatesData.value = undefined;
    liveAutoPilotStatus.value = undefined;
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

// ---------------------------------------------------------------------------
// Header: follow, version, display-name edit (D17)
// ---------------------------------------------------------------------------

const followLoading = ref(false);
const showFollowButton = computed(
  () => service.value !== null && kind.value === 'database' && !service.value.deleted,
);
const isFollowing = computed(() =>
  isServiceFollowing(service.value?.followers, authStore.user?.id ?? ''),
);
async function onToggleFollow(): Promise<void> {
  const target = service.value;
  const userId = authStore.user?.id;
  if (!target || !userId || followLoading.value) {
    return;
  }
  const wasFollowing = isFollowing.value;
  followLoading.value = true;
  try {
    const payload = wasFollowing
      ? await unfollowService(requireKind(), target.id, userId)
      : await followService(requireKind(), target.id, userId);
    const followers = wasFollowing
      ? applyUnfollowChange(target.followers ?? [], payload)
      : applyFollowChange(target.followers ?? [], payload);
    service.value = { ...target, followers };
  } catch {
    message.error(
      t(wasFollowing ? 'server.entityUnfollowError' : 'server.entityFollowError', {
        entity: entityLabel(target),
      }),
    );
  } finally {
    followLoading.value = false;
  }
}

function officialCategoryAndFqn(): { category: string; fqn: string } | null {
  const fqn = props.fqn || service.value?.fullyQualifiedName;
  const category = props.serviceCategory;
  if (!fqn || !category) {
    return null;
  }
  return { category, fqn };
}

function onEditConnection(): void {
  const target = officialCategoryAndFqn();
  if (target) {
    void router.push(getEditConnectionPath(target.category, target.fqn));
  }
}

function onOpenVersions(): void {
  if (service.value?.version === undefined) {
    return;
  }
  const fqn = props.fqn || service.value.fullyQualifiedName;
  const category = props.serviceCategory;
  if (fqn && category) {
    void router.push(getServiceVersionPath(category, fqn, String(service.value.version)));
  }
}

const canEditDisplayName = computed(() => ungatedFlags.value.canEditDisplayName);
const renameOpen = ref(false);
const renameDraft = ref('');
const renaming = ref(false);
function openRename(): void {
  renameDraft.value = service.value?.displayName ?? '';
  renameOpen.value = true;
}
async function onRename(): Promise<void> {
  const target = service.value;
  if (!target) {
    return;
  }
  const displayName = renameDraft.value.trim();
  if (displayName === (target.displayName ?? '')) {
    renameOpen.value = false;
    return;
  }
  renaming.value = true;
  try {
    // Pin handleUpdateDisplayName merges only the displayName from
    // the PATCH response; clearing sends `replace ''`, never remove.
    const response = await patchService(
      requireKind(),
      target.id,
      setFieldPatch('/displayName', target.displayName, displayName),
    );
    service.value = { ...target, displayName: response.displayName };
    renameOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    renaming.value = false;
  }
}

// ---------------------------------------------------------------------------
// Main-tab writes (pin saveUpdatedServiceData / handleDescriptionUpdate /
// handleDataProductUpdate, as single-field patches: each call site only
// ever changes one field, so the field patch equals the pin's compare()
// result. Failures toast and rethrow so the tab stays in edit mode.)
// ---------------------------------------------------------------------------

async function onSaveUpdatedServiceData(updated: ServiceMainTabDetails): Promise<void> {
  const target = service.value;
  if (!target) {
    return;
  }
  try {
    service.value = await patchService(
      requireKind(),
      target.id,
      setFieldPatch('/tags', target.tags, updated.tags),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    throw error;
  }
}

async function onDescriptionUpdate(html: string): Promise<void> {
  const target = service.value;
  if (!target || target.description === html) {
    return;
  }
  try {
    service.value = await patchService(
      requireKind(),
      target.id,
      descriptionPatch(target.description, html),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    throw error;
  }
}

async function onDataProductUpdate(refs: EntityRef[]): Promise<void> {
  const target = service.value;
  if (!target) {
    return;
  }
  try {
    service.value = await patchService(
      requireKind(),
      target.id,
      setFieldPatch('/dataProducts', target.dataProducts, refs),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Connection tab (D9–D11)
// ---------------------------------------------------------------------------

const canEditConnection = computed(() => ungatedFlags.value.canEditAll);
const editConnectionTooltip = computed(() =>
  canEditConnection.value
    ? t('ingestion.services.editConnection')
    : t('crud.noPermissionForAction'),
);
/**
 * Pin isTestingDisabled, plus the product's orchestrator and
 * Custom-connector gates: no EditAll, the OpenMetadata metadata
 * service, a missing connection config, a Custom connector type,
 * an unreachable orchestrator, or a run already in flight.
 */
const isTestingDisabled = computed(
  () =>
    !canEditConnection.value ||
    (kind.value === 'metadata' &&
      service.value?.fullyQualifiedName === 'OpenMetadata') ||
    service.value?.connection?.config === undefined ||
    !shouldTestConnection(service.value?.serviceType ?? '') ||
    serviceOrchestratorUnavailable.value ||
    testingConnection.value,
);

async function onSaveServiceAttributes(attributes: ServiceAttributes): Promise<void> {
  const target = service.value;
  if (!target) {
    return;
  }
  try {
    const response = await patchService(
      requireKind(),
      target.id,
      setFieldPatch('/serviceAttributes', target.serviceAttributes, attributes),
    );
    // Only the attributes field merges back; the rest of the local
    // service state is untouched.
    service.value = { ...target, serviceAttributes: response.serviceAttributes };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    throw error;
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
      kind: requireKind(),
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
    // Include.All (pin ServiceDetailsPage): the server default is
    // non-deleted, so opening a soft-deleted service would 404 without
    // it (D-F9). The mapper carries the deleted flag to the shell badge.
    const serviceKind = requireKind();
    service.value = await getServiceByFqn(serviceKind, props.fqn, { include: 'all' });
    pipelinesLoaded.value = false;
    servicePipelines.value = [];
    pipelinesTotal.value = 0;
    loadedPipelinesFqn.value = '';
    requestedPermissionFqns.clear();
    autoPilotRunning.value = false;
    liveAutoPilotStatus.value = undefined;
    workflowStatesData.value = undefined;
    childPermissionSettled.value = false;
    // Pin classic: the service fetch writes the show-deleted filter
    // from the service's own deleted flag, so a soft-deleted service
    // opens with its deleted children visible.
    void router.replace({
      query: { ...route.query, showDeletedTables: String(service.value.deleted ?? false) },
    });
    // Resource gates for the Agents tab, fail-closed on any fetch
    // failure: the ingestionPipeline Create bit and the APPLICATION
    // Trigger bit the header button merges onto the service. The third
    // fetch is the service entity's OWN permission, scoped to its FQN
    // (pin ServiceDetailsPage.fetchServicePermission), which gates the
    // delete/restore entries; it fails closed the same way. The fourth
    // fetch is the child entity's resource permission, whose
    // ViewUsage bit decides the usageSummary field on the main tab.
    const childEntityType = CHILD_ENTITY_TYPE_BY_KIND[serviceKind];
    const [createOps, triggerOps, serviceOps, childOps] = await Promise.all([
      permissionStore.getResourcePermission('ingestionPipeline').catch(() => null),
      permissionStore.getResourcePermission('app').catch(() => null),
      service.value.fullyQualifiedName && serviceEntityType.value
        ? permissionStore
            .getEntityPermissionByFqn(serviceEntityType.value, service.value.fullyQualifiedName)
            .catch(() => null)
        : Promise.resolve(null),
      childEntityType
        ? permissionStore.getResourcePermission(childEntityType).catch(() => null)
        : Promise.resolve(null),
    ]);
    ingestionPipelineCreateAllowed.value = createOps?.Create === true;
    applicationTriggerAllowed.value = triggerOps?.Trigger === true;
    servicePermission.value = serviceOps ?? {};
    childViewUsageAllowed.value = childOps
      ? getDerivedPermissionFlags(childOps).canViewUsage
      : false;
    childPermissionSettled.value = true;
    // The orchestrator probe runs independently of the agents list:
    // the OpenMetadata skip must not leave the banner unchecked.
    void probeOrchestrator();
    // Page-level pipeline fetch: the Agents tab count badge needs the
    // total on every tab, matching official's page-level list fetch.
    // The two loads are independent (pin effects): neither waits for
    // the other, and each owns its failure handling.
    void loadPipelines();
    void loadWorkflowInstanceStates();
  } catch (error) {
    service.value = null;
    servicePermission.value = {};
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

/**
 * Delete confirm (D-F5/D-F6): the shared modal supplies the soft/hard
 * choice; the request goes to the async endpoint with recursive=true
 * (pin service surfaces always pass it). The server's job message is
 * toasted on submit (pin AsyncDeleteProvider), then the bounded
 * re-read confirms the end state in place of the pin's websocket
 * completion, and only then does the D-F6 landing rule run. The modal
 * closes at job creation (pin async branch), but `deleting` stays set
 * through the re-read and the landing, so the page Delete button spins
 * for the whole wait — the metrics precedent holds its deleting flag
 * the same way (MetricsListView clears it only after its re-read). A
 * failed submit toasts and stays; the modal closes either way, as in
 * the pin.
 */
async function onDeleteConfirm(deleteType: DeleteType): Promise<void> {
  if (!service.value) {
    return;
  }
  const target = service.value;
  const hardDelete = deleteType === 'hard-delete';
  deleting.value = true;
  try {
    const job = await SERVICE_DELETE_API[requireKind()](target.id, { hardDelete, recursive: true });
    const jobMessage = job?.message?.trim();
    message.success(
      jobMessage ? jobMessage : t('ingestion.services.asyncDeleteSubmitted', { name: target.name }),
    );
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t('ingestion.services.deleteError', { entity: target.name }),
    );
    deleting.value = false;
    return;
  } finally {
    deleteModalOpen.value = false;
  }
  try {
    const confirmed = await waitForServiceDelete(hardDelete, () =>
      SERVICE_GET_API[requireKind()](target.id, 'all'),
    );
    if (confirmed) {
      message.success(t('ingestion.services.deletedSuccessfully', { entity: target.name }));
    } else {
      message.warning(t('ingestion.services.deleteTimeoutWarning'));
    }
    // D-F6 (classic counterpart): navigate to the list ONLY on hard
    // delete; on soft delete, stay and refetch with include=all so the
    // Deleted badge + restore affordance appear. Delete Q2 stays open
    // as a live check against the pin classic page.
    if (hardDelete) {
      await router.push({ name: 'connections' });
    } else {
      await load();
    }
  } finally {
    deleting.value = false;
  }
}

/**
 * Restore confirm (D-F9): the restore endpoint revives the service;
 * the page refetches (pin connections-surface pattern) since restoring
 * revives children too. A failure keeps the modal open for a retry,
 * mirroring the pin (the modal closes only on a successful restore).
 */
async function onRestoreConfirm(): Promise<void> {
  if (!service.value) {
    return;
  }
  const target = service.value;
  restoring.value = true;
  try {
    await SERVICE_RESTORE_API[requireKind()](target.id);
    message.success(
      t('ingestion.services.restoreSuccess', { entity: t('ingestion.services.service') }),
    );
    restoreModalOpen.value = false;
    await load();
  } catch {
    message.error(
      t('ingestion.services.restoreError', { entity: t('ingestion.services.service') }),
    );
  } finally {
    restoring.value = false;
  }
}

watch(
  () => [props.serviceCategory, props.fqn],
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
    :title="entityLabel(service) || t('ingestion.services.title')"
    :name="service?.name"
    :fqn="service?.fullyQualifiedName"
    :deleted="service?.deleted ?? false"
    :lead="t('ingestion.services.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!service && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="service ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #meta>
      <ServiceHeaderFacets
        v-if="service && kind"
        :service-id="service.id"
        :service-kind="kind"
        :owners="service.owners"
        :domains="service.domains"
        :tags="service.tags"
        :can-edit-domains="gatedFlags.canEditDomains"
        :can-edit-owners="gatedFlags.canEditOwners"
        :can-edit-tier="gatedFlags.canEditTier"
        :show-domain="kind !== 'metadata'"
        @updated="service = $event"
      />
    </template>
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
      <Button
        v-if="showFollowButton"
        data-testid="service-follow-button"
        :loading="followLoading"
        @click="onToggleFollow"
      >
        {{ t(isFollowing ? 'asset.unfollow' : 'asset.follow') }}
      </Button>
      <Button
        v-if="service && service.version !== undefined"
        data-testid="service-version-button"
        @click="onOpenVersions"
      >
        v{{ service.version }}
      </Button>
      <Button
        v-if="service && canEditDisplayName"
        data-testid="service-rename-button"
        @click="openRename"
      >
        {{ t('ingestion.services.editDisplayName') }}
      </Button>
      <Tooltip :title="canEditConnection ? undefined : t('crud.noPermissionForAction')">
        <Button
          data-testid="edit-service"
          :disabled="!service || !canEditConnection"
          @click="onEditConnection"
        >
          {{ t('crud.edit') }}
        </Button>
      </Tooltip>
      <Tooltip v-if="canDeleteService" :title="t('ingestion.services.deleteActionHelp')">
        <Button
          data-testid="delete-service"
          danger
          :disabled="!service"
          :loading="deleting"
          :aria-label="t('ingestion.services.deleteActionHelp')"
          @click="deleteModalOpen = true"
        >
          {{ t('crud.delete') }}
        </Button>
      </Tooltip>
      <Tooltip
        v-if="service?.deleted"
        :title="canRestoreService ? undefined : t('crud.noPermissionForAction')"
      >
        <Button
          data-testid="restore-service"
          :disabled="!canRestoreService"
          :loading="restoring"
          @click="restoreModalOpen = true"
        >
          {{ t('crud.restore') }}
        </Button>
      </Tooltip>
    </template>
    <template #insights>
      <ServiceInsightsTab
        v-if="service && kind"
        :service-name="service.name"
        :service-kind="kind"
        :ingestion-pipelines="servicePipelines"
        :is-ingestion-pipeline-loading="pipelinesLoading"
        :live-auto-pilot-status="liveAutoPilotStatus"
        :workflow-states-data="workflowStatesData"
      />
    </template>
    <template #[mainTabKey]>
      <ServiceMainTab
        v-if="service"
        :service-name="service.name"
        :service-details="service"
        :service-permission="servicePermission"
        :data="childrenRows"
        :is-service-loading="childrenLoading"
        :paging="mainPaging.paging"
        :current-page="mainPaging.currentPage"
        :paging-info="{
          handlePageChange: mainPaging.handlePageChange,
          handlePageSizeChange: mainPaging.handlePageSizeChange,
          handlePagingChange: mainPaging.handlePagingChange,
          pageSize: mainPaging.pageSize,
          showPagination: mainPaging.showPagination,
        }"
        :show-deleted="showDeletedTables"
        :set-filters="setSchemaFilter"
        :save-updated-service-data="onSaveUpdatedServiceData"
        :on-description-update="onDescriptionUpdate"
        :on-data-product-update="onDataProductUpdate"
        :on-show-deleted-change="onShowDeletedChange"
        :set-is-service-loading="setChildrenLoading"
      />
    </template>
    <template #data-model>
      <DataModelsTab
        v-if="service?.fullyQualifiedName"
        :service-fqn="service.fullyQualifiedName"
        :show-deleted="showDeletedTables"
        :on-show-deleted-change="onShowDeletedChange"
      />
    </template>
    <template #files>
      <DriveAssetTable
        v-if="service?.fullyQualifiedName"
        entity-type="file"
        :service-fqn="service.fullyQualifiedName"
        :show-deleted="showDeletedTables"
        :on-show-deleted-change="onShowDeletedChange"
      />
    </template>
    <template #spreadsheets>
      <DriveAssetTable
        v-if="service?.fullyQualifiedName"
        entity-type="spreadsheet"
        :service-fqn="service.fullyQualifiedName"
        :show-deleted="showDeletedTables"
        :on-show-deleted-change="onShowDeletedChange"
      />
    </template>
    <template #connection>
      <AirflowMessageBanner
        :status="serviceOrchestrator"
        :checked="serviceOrchestratorChecked"
        :disabled-message="t('ingestion.pipelines.orchestratorDisabled')"
        :unreachable-message="t('ingestion.pipelines.orchestratorUnreachable')"
      />
      <p class="entity-detail__tab-lead">{{ t('ingestion.services.connectionTitle') }}</p>
      <ServiceConnectionDetails
        v-if="service && kind"
        :config="service.connection?.config"
        :kind="kind"
        :service-type="service.serviceType"
      />
      <div class="service-connection-actions">
        <Tooltip :title="editConnectionTooltip">
          <Button
            v-if="service"
            data-testid="edit-service-connection"
            :disabled="!canEditConnection"
            @click="onEditConnection"
          >
            {{ t('ingestion.services.editConnection') }}
          </Button>
        </Tooltip>
        <Button
          v-if="service"
          data-testid="test-service-connection"
          :disabled="isTestingDisabled"
          :loading="testingConnection"
          style="margin-left: 8px"
          @click="onTestConnection"
        >
          {{ testingConnection ? t('ingestion.services.testingConnection') : t('ingestion.services.testConnection') }}
        </Button>
      </div>
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
      <ServiceAttributesCard
        v-if="service"
        :service-attributes="service.serviceAttributes"
        :has-edit-permission="ungatedFlags.canEditAll"
        :on-save="onSaveServiceAttributes"
      />
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
          v-if="kind"
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
          :service-kind="kind"
          :service-id="service?.id ?? ''"
          :service-fqn="service?.fullyQualifiedName ?? props.fqn"
          @refresh="reloadPipelines"
          @action="onAgentAction"
          @logs="serviceRowActions.onLogs"
          @run-details="onAgentRunDetails"
          @view-history="onAgentViewHistory"
        />
      </template>
    </template>
  </EntityDetailShell>
  <RunHistoryDrawer
    v-if="drawerLiveAgent"
    :agent="drawerLiveAgent"
    :agents="agents"
    :open="drawerAgent !== null"
    :initial-run-id="drawerRunId"
    :permissions="drawerPermissions"
    :actions-pending="!serviceOrchestratorChecked"
    :actions-unavailable="serviceOrchestratorUnavailable"
    @close="drawerAgent = null"
    @open-logs="onDrawerOpenLogs"
    @run="onDrawerRun"
  />
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
  <FormModal
    :open="renameOpen"
    :title="t('ingestion.services.editDisplayName')"
    :confirm-loading="renaming"
    test-id="service-rename-modal"
    @ok="void onRename()"
    @cancel="renameOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="renameDraft" data-testid="service-rename-display-name" />
      </Form.Item>
    </Form>
  </FormModal>
  <DeleteEntityModal
    :open="deleteModalOpen"
    :entity-name="service ? (service.displayName ?? service.name) : ''"
    :entity-type-label="serviceTypeLabel"
    :allow-soft-delete="!service?.deleted"
    :loading="deleting"
    @cancel="deleteModalOpen = false"
    @confirm="onDeleteConfirm"
  />
  <RestoreEntityModal
    :open="restoreModalOpen"
    :entity-name="service?.name ?? ''"
    :entity-type-label="serviceTypeLabel"
    :loading="restoring"
    @cancel="restoreModalOpen = false"
    @confirm="onRestoreConfirm"
  />
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
.service-connection-actions {
  margin: 12px 0;
}
</style>
