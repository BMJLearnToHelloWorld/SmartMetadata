<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { RouterLink, useRouter } from 'vue-router';
import { AlignRightOutlined, SyncOutlined } from '@ant-design/icons-vue';
import { Button, Descriptions, Form, Input, Tooltip, message } from 'ant-design-vue';
import EntityHeaderTitle from '@/components/shared/EntityHeaderTitle.vue';
import StatItem from '@/components/shared/StatItem.vue';
import TestCaseTestSummary from '@/components/quality/TestCaseTestSummary.vue';
import TestCaseIncidentTab from '@/components/quality/TestCaseIncidentTab.vue';
import { useEntityRules } from '@/composables/useEntityRules';
import FormModal from '@/components/shared/FormModal.vue';
import {
  deleteTestCase,
  getTestCase,
  getTestCaseByName,
  getTestCaseVersion,
  patchTestCase,
  restoreTestCase,
} from '@/api/testCases';
import { getTestDefinition } from '@/api/testDefinitions';
import { listIngestionPipelines, runIngestionPipelineForEntity } from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import { usePermissionStore } from '@/stores/permissions';
import EntityManageButton from '@/components/quality/EntityManageButton.vue';
import TestCaseLastRunBanner from '@/components/quality/TestCaseLastRunBanner.vue';
import {
  getActiveRunState,
  getRunButtonLabelKey,
  getRunDisabledReasonKey,
  getRunnablePipeline,
  getTriggerPermissions,
} from '@/quality/runTestCaseButton';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';
import TestCaseResultRail from '@/components/quality/TestCaseResultRail.vue';
import { loadGovernanceCatalog, type GovernanceCatalog } from '@/governance/catalogOptions';
import {
  dataProductsPatch,
  descriptionPatch,
  domainsPatch,
  ownersPatch,
  tagsPatch,
  type TagLabelInput,
} from '@/governance/assetPatch';
import { compare } from 'fast-json-patch';
import { latestGovernanceVersionPath, listGovernanceVersions } from '@/api/governanceVersions';
import type { EntityVersion } from '@/api/entities';
import { getTestCaseVersionPath } from '@/catalog/versionPaths';
import ServiceVersionTimeline from '@/components/ingestion/ServiceVersionTimeline.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import RestoreEntityModal from '@/features/crud/RestoreEntityModal.vue';
import { getEntityVersionByField } from '@/ingestion/versionDiff';
import { getTestCaseIncidentByStateId } from '@/api/testIncidents';
import { getTask, getTaskCounts } from '@/api/tasks';
import IncidentAssigneePicker from '@/components/observability/IncidentAssigneePicker.vue';
import IncidentInlineSeverity from '@/components/observability/IncidentInlineSeverity.vue';
import IncidentInlineStatus from '@/components/observability/IncidentInlineStatus.vue';
import WidgetDomainCell from '@/components/shared/widgets/WidgetDomainCell.vue';
import WidgetOwnersCell from '@/components/shared/widgets/WidgetOwnersCell.vue';
import {
  assigneeDisplayName,
  incidentStatusMenuOptions,
  reopenResolvedIncident,
  submitIncidentSeverity,
  submitIncidentStatusChange,
  type StatusChangeAdditionalData,
} from '@/features/quality/incidentManager';
import {
  fetchNextTestCaseRunTimestamp,
  getTestSuiteFqns,
  shouldFetchNextRun,
} from '@/quality/testCaseNextRun';
import {
  getIncidentTaskPath,
  getTaskDisplayId,
  type TaskLinkInfo,
} from '@/quality/testCaseLastRunBanner.utils';
import type { CollaborationTask } from '@/types/collaboration';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import SmState from '@/components/shared/SmState.vue';
import DimensionalityPanel from '@/features/quality/DimensionalityPanel.vue';
import TestCaseSqlQueryTab from '@/components/quality/TestCaseSqlQueryTab.vue';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import { parseEntityLink, toEntityLink } from '@/quality/entityLink';
import { ENTITY_TAB_PROFILER, getEntityDetailsPath } from '@/utils/fqnPaths';
import {
  buildTestCaseDetailBreadcrumbs,
  type BreadcrumbLink,
} from '@/utils/qualityDetailBreadcrumbs';
import type { EntityRef } from '@/types/api';
import type { IncidentStatus, TestCase, TestCaseResult, TestDefinition, TestIncident } from '@/types/quality';

const props = defineProps<{ id: string; tab?: string; version?: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const testCase = ref<TestCase | null>(null);
const { entityRules, isRulesLoaded } = useEntityRules('testCase');
const requireDomainForDataProduct = computed(
  () => !isRulesLoaded.value || entityRules.value.requireDomainForDataProduct,
);
/** Pin useTestCaseIncidentHeader: one row from incidentId / inline resolved status, not listTestIncidents. */
const headerIncident = ref<TestIncident | undefined>();
const openTaskCount = ref(0);
// Official TestCasePageTabs default is TEST_CASE_RESULTS. Unknown tabs
// land there; official has no overview fallback (t418u).
const DEFAULT_TEST_CASE_TAB = 'test-case-results';
/** Official TestCaseClassBase labelProps.id values (not route keys). */
const OFFICIAL_TAB_TEST_ID: Record<string, string> = {
  'test-case-results': 'test-case-result',
  dimensionality: 'dimensionality',
  issues: 'incident',
  'sql-query': 'sql-query',
};
const tabKeys = new Set(QUALITY_PAGE_TABS.testCase.map((tab) => tab.key));
const activeTab = ref(props.tab !== undefined && tabKeys.has(props.tab) ? props.tab : DEFAULT_TEST_CASE_TAB);
/** Official useTestCase.store default is expanded on the results tab. */
const isTabExpanded = ref(true);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
});
const dimensionDrawerOpen = ref(false);
const parameterEditOpen = ref(false);
const testDefinitionDetail = ref<TestDefinition | undefined>();
const governanceCatalog = ref<GovernanceCatalog>({ owners: [], tags: [], domains: [] });


function originBreadcrumbFromHistory(): BreadcrumbLink[] | undefined {
  const state = window.history.state as { breadcrumbData?: BreadcrumbLink[] } | null | undefined;
  return state?.breadcrumbData;
}

const breadcrumbs = computed<EntityBreadcrumb[]>(() =>
  buildTestCaseDetailBreadcrumbs(t, {
    testCaseName:
      entityLabel(testCase.value) || t('label.entity-detail-plural', { entity: t('label.test-case') }),
    entityLink: testCase.value?.entityLink,
    originBreadcrumb: originBreadcrumbFromHistory(),
    testCaseFqn: testCase.value?.fullyQualifiedName,
  }),
);

const isVersionPage = computed(() => props.version !== undefined && props.version !== '');
const versionList = ref<EntityVersion[]>([]);
const restoreOpen = ref(false);
const restoring = ref(false);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testCase
    .filter((tab) => {
      if (isVersionPage.value && tab.key === 'issues') {
        return false;
      }
      if (tab.key === 'sql-query') {
        return Boolean(testCase.value?.inspectionQuery);
      }
      if (tab.key === 'dimensionality') {
        return (testCase.value?.dimensionColumns?.length ?? 0) > 0;
      }
      return true;
    })
    .map((tab) => ({
      key: tab.key,
      label: t(tab.labelKey),
      testId: OFFICIAL_TAB_TEST_ID[tab.key] ?? `test-case-tab-${tab.key}`,
      count: tab.key === 'issues' ? openTaskCount.value : undefined,
    })),
);

const isExpandViewSupported = computed(() => activeTab.value === DEFAULT_TEST_CASE_TAB);

function toggleTabExpanded(): void {
  isTabExpanded.value = !isTabExpanded.value;
}

const latestIncident = computed(() => headerIncident.value);
const nextRunTimestamp = ref<number | null | undefined>(undefined);
const incidentTask = ref<CollaborationTask | null>(null);
const incidentTaskLoaded = ref(false);

const testSuiteFqns = computed(() => getTestSuiteFqns(testCase.value ?? undefined));

const hasEditStatusPermission = computed(
  () => !isVersionPage.value && !testCaseDeleted.value && testCasePerms.canEditStatus.value,
);
const canEditTestCaseOwners = computed(
  () =>
    !isVersionPage.value &&
    !testCaseDeleted.value &&
    (permissionStore.isAdminUser || testCasePerms.can('EditOwners')),
);
const canEditTestCaseDomains = computed(
  () =>
    !isVersionPage.value &&
    !testCaseDeleted.value &&
    (permissionStore.isAdminUser || testCasePerms.can('EditDomains')),
);

const incidentHeaderWriting = ref<'status' | 'severity' | 'assignee' | undefined>();
const assigneeCandidates = ref<EntityRef[]>([]);

const headerStatusMenuOptions = computed((): IncidentStatus[] =>
  incidentStatusMenuOptions(latestIncident.value?.testCaseResolutionStatusType),
);

const taskLinkInfo = computed((): TaskLinkInfo | null => {
  if (!incidentTask.value || !testCase.value?.fullyQualifiedName) {
    return null;
  }
  const display = getTaskDisplayId(incidentTask.value.name ?? incidentTask.value.id);
  return {
    path: getIncidentTaskPath(testCase.value.fullyQualifiedName),
    label: display ? `#${display}` : `#${incidentTask.value.id.slice(0, 8)}`,
  };
});

async function loadNextRunTimestamp(): Promise<void> {
  if (
    !shouldFetchNextRun({ activeTab: activeTab.value, testSuiteFqns: testSuiteFqns.value })
  ) {
    return;
  }
  try {
    nextRunTimestamp.value = await fetchNextTestCaseRunTimestamp(testSuiteFqns.value);
  } catch {
    nextRunTimestamp.value = undefined;
  }
}

async function loadHeaderIncident(current: TestCase): Promise<void> {
  headerIncident.value = undefined;
  const inline = current.incidentStatus;
  const resolved = inline?.testCaseResolutionStatusType === 'Resolved' ? inline : undefined;
  const incidentId = current.incidentId;
  const stateId = incidentId ?? resolved?.stateId;
  if (!stateId) {
    return;
  }
  try {
    if (incidentId) {
      headerIncident.value = await getTestCaseIncidentByStateId(incidentId);
    } else {
      headerIncident.value = resolved;
    }
  } catch {
    headerIncident.value = inline;
  }
}

async function loadIncidentTask(): Promise<void> {
  incidentTaskLoaded.value = false;
  incidentTask.value = null;
  const current = testCase.value;
  const inline = current?.incidentStatus;
  const resolved = inline?.testCaseResolutionStatusType === 'Resolved' ? inline : undefined;
  const stateId = current?.incidentId ?? resolved?.stateId ?? latestIncident.value?.stateId;
  if (!stateId) {
    incidentTaskLoaded.value = true;
    return;
  }
  try {
    incidentTask.value = await getTask(stateId);
  } catch {
    incidentTask.value = null;
  } finally {
    incidentTaskLoaded.value = true;
  }
}

function replaceLatestIncident(latest: TestIncident): void {
  headerIncident.value = latest;
}

async function submitHeaderIncidentStatus(
  target: IncidentStatus,
  additional?: StatusChangeAdditionalData,
): Promise<void> {
  const record = latestIncident.value;
  if (!record || incidentHeaderWriting.value !== undefined) {
    return;
  }
  incidentHeaderWriting.value = 'status';
  try {
    const current = record.testCaseResolutionStatusType;
    let latest: TestIncident | undefined;
    if (current === 'Resolved') {
      const fqn = testCase.value?.fullyQualifiedName;
      if (!fqn) {
        message.error(t('observability.incidents.missingFqn'));
        return;
      }
      latest = await reopenResolvedIncident({
        testCaseFqn: fqn,
        testCaseName: testCase.value?.name,
        targetStatus: target,
        currentStateId: record.stateId,
        details: additional,
      });
    } else {
      latest = await submitIncidentStatusChange(record, target, additional);
    }
    if (latest) {
      replaceLatestIncident(latest);
      await loadIncidentTask();
    }
  } catch {
    message.error(t('observability.incidents.updateFailed'));
  } finally {
    incidentHeaderWriting.value = undefined;
  }
}

async function onHeaderSeverityChange(severity: string | undefined): Promise<void> {
  const record = latestIncident.value;
  if (!record || incidentHeaderWriting.value !== undefined || severity === record.severity) {
    return;
  }
  incidentHeaderWriting.value = 'severity';
  try {
    const ok = await submitIncidentSeverity(record, severity);
    if (!ok) {
      message.error(t('observability.incidents.updateFailed'));
      return;
    }
    replaceLatestIncident({ ...record, severity });
  } finally {
    incidentHeaderWriting.value = undefined;
  }
}

async function onHeaderAssigneeChange(assignee: EntityRef | undefined): Promise<void> {
  const record = latestIncident.value;
  if (!record || incidentHeaderWriting.value !== undefined) {
    return;
  }
  const current = record.testCaseResolutionStatusDetails?.assignee;
  if ((current?.name ?? undefined) === (assignee?.name ?? undefined) && (current?.type ?? undefined) === (assignee?.type ?? undefined)) {
    return;
  }
  incidentHeaderWriting.value = 'assignee';
  try {
    let latest: TestIncident | undefined;
    if (assignee === undefined) {
      latest = await submitIncidentStatusChange(record, record.testCaseResolutionStatusType, { assignee: undefined });
    } else {
      latest = await submitIncidentStatusChange(record, 'Assigned', { assignee });
    }
    if (latest) {
      replaceLatestIncident(latest);
    }
  } catch {
    message.error(t('observability.incidents.updateFailed'));
  } finally {
    incidentHeaderWriting.value = undefined;
  }
}

async function onHeaderOwnersSave(owners: Array<{ id: string; type: string }>): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  await patchTestCase(
    testCase.value.id,
    ownersPatch(testCase.value.owners, owners.map((owner) => ({ id: owner.id, type: owner.type }))),
  );
  message.success(t('server.update-entity-success', { entity: t('label.owner-plural') }));
  await load();
}

async function onHeaderDomainsSave(domainIds: string[]): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  await patchTestCase(testCase.value.id, domainsPatch(testCase.value.domains, domainIds));
  message.success(t('server.update-entity-success', { entity: t('label.domain-plural') }));
  await load();
}

async function acknowledgeIncident(): Promise<void> {
  const incident = latestIncident.value;
  if (!incident) {
    return;
  }
  try {
    const updated = await submitIncidentStatusChange(incident, 'Ack');
    if (updated) {
      replaceLatestIncident(updated);
    }
    await loadIncidentTask();
    message.success(t('label.acknowledged'));
  } catch (error) {
    message.error(getErrorText(error, t('server.unexpected-error')));
  }
}
const assetEntity = computed(() =>
  testCase.value?.entityLink ? parseEntityLink(testCase.value.entityLink) : null,
);

const tableFqnForLink = computed(() => assetEntity.value?.fqn || testCase.value?.entityFQN || '');

const tableShortName = computed(() => {
  const fqn = tableFqnForLink.value;
  if (!fqn) {
    return '';
  }
  const parts = fqn.split('.');
  return parts[parts.length - 1] || fqn;
});

const tableProfilerTo = computed(() => {
  const fqn = tableFqnForLink.value;
  if (!fqn) {
    return undefined;
  }
  return getEntityDetailsPath('table', fqn, ENTITY_TAB_PROFILER, 'data-quality');
});

const testDefinitionHeaderName = computed(
  () =>
    testCase.value?.testDefinition?.displayName ||
    testCase.value?.testDefinition?.name ||
    '—',
);

const columnHeaderName = computed(() => assetEntity.value?.column || '—');

const suitePipelines = ref<IngestionPipeline[]>([]);
const pipelinesLoadError = ref(false);
const isTriggeringRun = ref(false);

const permissionStore = usePermissionStore();
const testCaseFqn = computed(() => testCase.value?.fullyQualifiedName ?? '');
const testCaseDeleted = computed(() => testCase.value?.deleted === true);
const testCasePerms = useEntityPermissions('testCase', testCaseFqn, {
  deleted: testCaseDeleted,
  enabled: computed(() => Boolean(testCaseFqn.value)),
});
const hasDeletePermission = computed(
  () => !isVersionPage.value && !testCaseDeleted.value && testCasePerms.canDelete.value,
);
const editDisplayNamePermission = computed(
  () => !isVersionPage.value && !testCaseDeleted.value && testCasePerms.canEditDisplayName.value,
);
const canRestorePermission = computed(
  () => !isVersionPage.value && testCaseDeleted.value && testCasePerms.canEditAll.value,
);
const canEditRailAll = computed(
  () => !isVersionPage.value && !testCaseDeleted.value && testCasePerms.canEditAll.value,
);
const canEditRailDescription = computed(
  () => !isVersionPage.value && !testCaseDeleted.value && testCasePerms.canEditDescription.value,
);
const canEditRailTags = computed(
  () =>
    !isVersionPage.value &&
    !testCaseDeleted.value &&
    (permissionStore.isAdminUser || testCasePerms.can('EditTags')),
);
const canEditRailGlossary = computed(
  () =>
    !isVersionPage.value &&
    !testCaseDeleted.value &&
    (permissionStore.isAdminUser || testCasePerms.can('EditGlossaryTerms')),
);
const isColumnTest = computed(() => (testCase.value?.entityLink ?? '').includes('::columns::'));
const canEditDimensions = computed(
  () =>
    !isVersionPage.value && isColumnTest.value && !testCaseDeleted.value && testCasePerms.canEditAll.value,
);
const manageExtraItems = computed(() =>
  canEditDimensions.value
    ? [
        {
          key: 'edit-dimensions',
          label: t('label.edit-entity', { entity: t('label.dimension-plural') }),
          testId: 'edit-dimensions',
          onClick: () => {
            dimensionDrawerOpen.value = true;
          },
        },
      ]
    : [],
);

const pipelinesLoading = ref(false);
const resourceIngestionPerms = ref(testCasePerms.permissions.value);
const resourcePermsLoading = ref(true);

const runnablePipeline = computed(() => getRunnablePipeline(suitePipelines.value));
const pipelineFqn = computed(() => runnablePipeline.value?.fullyQualifiedName ?? '');
const pipelinePerms = useEntityPermissions('ingestionPipeline', pipelineFqn, {
  enabled: computed(() => Boolean(pipelineFqn.value)),
});
const canTrigger = computed(() =>
  getDerivedPermissionFlags(
    getTriggerPermissions(
      runnablePipeline.value,
      pipelinePerms.permissions.value,
      resourceIngestionPerms.value,
    ),
  ).can('Trigger'),
);
const activeRunState = computed(() => getActiveRunState(runnablePipeline.value));
const runInProgress = computed(() => Boolean(activeRunState.value));
const runButtonLabelKey = computed(() => getRunButtonLabelKey(activeRunState.value));
const runDisabledReasonKey = computed(() =>
  getRunDisabledReasonKey(suitePipelines.value, pipelinesLoadError.value),
);
const canRun = computed(
  () =>
    Boolean(testCase.value) &&
    !isVersionPage.value &&
    !testCaseDeleted.value &&
    !pipelinesLoading.value &&
    !pipelinePerms.isLoading.value &&
    !resourcePermsLoading.value &&
    canTrigger.value,
);

const showVersionControl = computed(
  () => Boolean(testCase.value) && activeTab.value !== 'dimensionality',
);

const headerDisplayName = computed(() => {
  if (!testCase.value) {
    return '';
  }
  if (isVersionPage.value) {
    return getEntityVersionByField(
      testCase.value.changeDescription,
      'displayName',
      testCase.value.displayName,
    );
  }
  return testCase.value.displayName?.trim() || '';
});

async function loadResourceTriggerPermissions(): Promise<void> {
  resourcePermsLoading.value = true;
  try {
    resourceIngestionPerms.value = await permissionStore.getResourcePermission('ingestionPipeline');
  } catch {
    resourceIngestionPerms.value = testCasePerms.permissions.value;
  } finally {
    resourcePermsLoading.value = false;
  }
}

async function loadSuitePipelines(testSuiteFqn?: string): Promise<void> {
  if (!testSuiteFqn) {
    suitePipelines.value = [];
    pipelinesLoadError.value = false;
    pipelinesLoading.value = false;
    return;
  }
  pipelinesLoading.value = true;
  try {
    const page = await listIngestionPipelines({
      testSuite: testSuiteFqn,
      pipelineType: 'TestSuite',
      fields: 'pipelineStatuses',
      limit: 100,
    });
    suitePipelines.value = page.data;
    pipelinesLoadError.value = false;
  } catch {
    suitePipelines.value = [];
    pipelinesLoadError.value = true;
  } finally {
    pipelinesLoading.value = false;
  }
}

async function runTestCase(): Promise<void> {
  const fqn = testCase.value?.fullyQualifiedName;
  if (!fqn || isTriggeringRun.value) {
    return;
  }
  isTriggeringRun.value = true;
  try {
    await runIngestionPipelineForEntity({
      entityLink: toEntityLink('testCase', fqn),
      pipelineType: 'TestSuite',
    });
    message.success(t('message.test-case-run-queued'));
    await loadSuitePipelines(testCase.value?.testSuite?.fullyQualifiedName);
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.unexpected-error')));
  } finally {
    isTriggeringRun.value = false;
  }
}

function onIncidentTabCounts(payload: { open: number; closed: number }): void {
  openTaskCount.value = payload.open;
}

async function loadTestDefinition(definitionId?: string): Promise<void> {
  if (!definitionId) {
    testDefinitionDetail.value = undefined;
    return;
  }
  try {
    testDefinitionDetail.value = await getTestDefinition(definitionId);
  } catch {
    testDefinitionDetail.value = undefined;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    // The /test-case/:fqn alias carries an FQN, not a UUID: the server's
    // GET /v1/dataQuality/testCases/{id} takes a UUID only, so FQNs load
    // through the /name/{fqn} endpoint.
    // ADR:2026-11-08-incident-detail-redirects-to-test-case
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(props.id);
    const loaded = isUuid ? await getTestCase(props.id) : await getTestCaseByName(props.id);
    if (isVersionPage.value && props.version && loaded.id) {
      versionList.value = await listGovernanceVersions('testCase', loaded.id);
      testCase.value = await getTestCaseVersion(loaded.id, props.version);
    } else {
      testCase.value = loaded;
    }
    const current = testCase.value;
    await loadTestDefinition(current?.testDefinition?.id);
    if (current?.fullyQualifiedName) {
      if (!isVersionPage.value) {
        await loadHeaderIncident(current);
      } else {
        headerIncident.value = undefined;
      }
      try {
        const counts = await getTaskCounts({ aboutEntity: current.fullyQualifiedName });
        openTaskCount.value = counts.open ?? 0;
      } catch {
        openTaskCount.value = 0;
      }
      await loadSuitePipelines(current.testSuite?.fullyQualifiedName);
      if (!isVersionPage.value) {
        await Promise.all([loadNextRunTimestamp(), loadIncidentTask()]);
      }
    } else {
      headerIncident.value = undefined;
      await loadSuitePipelines(undefined);
    }
  } catch (error) {
    testCase.value = null;
    testDefinitionDetail.value = undefined;
    headerIncident.value = undefined;
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-case') }));
  } finally {
    loading.value = false;
  }
}

async function onRailDescriptionUpdate(description: string): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  await patchTestCase(testCase.value.id, descriptionPatch(testCase.value.description, description));
  message.success(t('server.update-entity-success', { entity: t('label.description') }));
  await load();
}

async function onRailTagsChange(tags: TagLabelInput[]): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  await patchTestCase(testCase.value.id, tagsPatch(testCase.value.tags, tags));
  message.success(t('server.update-entity-success', { entity: t('label.tag-plural') }));
  await load();
}

async function onRailDataProductsSave(products: EntityRef[]): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  await patchTestCase(
    testCase.value.id,
    dataProductsPatch(
      testCase.value.dataProducts,
      products.map((product) => ({ id: product.id, type: product.type ?? 'dataProduct' })),
    ),
  );
  message.success(t('server.update-entity-success', { entity: t('label.data-product-plural') }));
  await load();
}

async function onParameterSubmitted(): Promise<void> {
  parameterEditOpen.value = false;
  await load();
}

async function onDeleteTestCase(): Promise<void> {
  if (!testCase.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('label.delete'),
    content: t('message.delete-entity-message', { entity: entityLabel(testCase.value) }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteTestCase(testCase.value.id, { hardDelete: true });
    message.success(t('server.entity-deleted-successfully', { entity: entityLabel(testCase.value) }));
    await router.push({ name: 'quality-test-cases' });
  } catch (error) {
    message.error(getErrorText(error, t('server.delete-entity-error', { entity: t('label.test-case') })));
  }
}

async function onOpenVersions(): Promise<void> {
  if (isVersionPage.value) {
    const fqn = testCase.value?.fullyQualifiedName ?? props.id;
    await router.push({ name: 'quality-test-case', params: { id: fqn, tab: activeTab.value } });
    return;
  }
  const entityId = testCase.value?.id;
  const pathId = testCase.value?.fullyQualifiedName ?? props.id;
  if (!entityId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('testCase', entityId, (version) =>
      getTestCaseVersionPath(pathId, version, activeTab.value),
    );
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

function versionHandler(newVersion: string): void {
  const pathId = testCase.value?.fullyQualifiedName ?? props.id;
  void router.push(getTestCaseVersionPath(pathId, newVersion, activeTab.value));
}

function openRestoreModal(): void {
  restoreOpen.value = true;
}

async function onConfirmRestore(): Promise<void> {
  if (!testCase.value?.id) {
    return;
  }
  restoring.value = true;
  try {
    const restored = await restoreTestCase(testCase.value.id);
    testCase.value = restored;
    restoreOpen.value = false;
    message.success(
      t('server.restore-entity-success', {
        entity: restored.displayName ?? restored.name,
      }),
    );
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('message.entity-restored-error', { entity: t('label.test-case') })));
  } finally {
    restoring.value = false;
  }
}

function openRename(): void {
  if (!testCase.value) {
    return;
  }
  editForm.displayName = testCase.value.displayName || '';
  editOpen.value = true;
}

async function onRenameSave(): Promise<void> {
  if (!testCase.value) {
    return;
  }
  saving.value = true;
  try {
    const nextDisplayName = editForm.displayName.trim();
    const operations = compare(testCase.value, {
      ...testCase.value,
      displayName: nextDisplayName || undefined,
    });
    if (operations.length > 0) {
      await patchTestCase(testCase.value.id, operations);
    }
    editOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.display-name') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.display-name') })));
  } finally {
    saving.value = false;
  }
}

async function onDimensionsSubmitted(): Promise<void> {
  dimensionDrawerOpen.value = false;
  await load();
}

watch(
  () => [props.id, props.version] as const,
  () => {
    void load();
  },
);

watch(
  () => props.tab,
  (tab) => {
    activeTab.value = tab !== undefined && tabKeys.has(tab) ? tab : DEFAULT_TEST_CASE_TAB;
  },
);

watch(activeTab, (tab) => {
  if (!isVersionPage.value || !props.version) {
    return;
  }
  const normalizedTab = tab === DEFAULT_TEST_CASE_TAB ? undefined : tab;
  if (normalizedTab === props.tab || (normalizedTab === undefined && (props.tab === undefined || props.tab === ''))) {
    return;
  }
  const pathId = testCase.value?.fullyQualifiedName ?? props.id;
  const routeName = normalizedTab ? 'quality-test-case-version-tab' : 'quality-test-case-version';
  const params = normalizedTab
    ? { id: pathId, version: props.version, tab: normalizedTab }
    : { id: pathId, version: props.version };
  void router.replace({ name: routeName, params });
});

watch([activeTab, testSuiteFqns], () => {
  void loadNextRunTimestamp();
});

watch(latestIncident, () => {
  void loadIncidentTask();
});

onMounted(() => {
  void loadResourceTriggerPermissions();
  void loadGovernanceCatalog()
    .then((catalog) => {
      governanceCatalog.value = catalog;
      assigneeCandidates.value = catalog.owners.map((owner) => ({
        id: owner.id,
        name: owner.label,
        displayName: owner.label,
        type: owner.type,
      }));
    })
    .catch(() => {
      governanceCatalog.value = { owners: [], tags: [], domains: [] };
    });
  void load();
});
</script>

<template>
  <div
    data-testid="test-case-detail-page"
    class="test-case-detail-page"
    :class="{ 'test-case-detail-page--version version-data': isVersionPage }"
  >
  <div class="test-case-detail-page__layout">
  <EntityDetailShell
    :title="entityLabel(testCase) || t('label.entity-detail-plural', { entity: t('label.test-case') })"
    :loading="loading"
    :error="errorMessage"
    :empty="!testCase && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="testCase ? tabs : []"
    v-model:active-tab="activeTab"
    header-container-test-id="test-case-header-container"
    entity-page-header-test-id="entity-page-header"
    tabs-test-id="tabs"
  >
    <template v-if="showVersionControl" #header-toolbar>
      <StatItem
        :icon="SyncOutlined"
        :count="testCase?.version"
        test-id="version-button"
        :tooltip="t('label.version-plural-history')"
        @click="onOpenVersions"
      />
    </template>
    <template v-if="testCase" #header-title>
      <EntityHeaderTitle
        :name="testCase.name"
        :display-name="headerDisplayName || undefined"
        :deleted="testCaseDeleted"
        service-name=""
      />
    </template>
    <template #actions>
      <Button
        v-if="canRestorePermission"
        data-testid="restore-test-case-button"
        :loading="restoring"
        @click="openRestoreModal"
      >
        {{ t('label.restore-entity', { entity: t('label.test-case') }) }}
      </Button>
      <template v-if="canRun">
        <Tooltip
          v-if="runDisabledReasonKey && !runInProgress"
          :title="t(runDisabledReasonKey)"
        >
          <Button
            data-testid="run-test-case-button"
            :disabled="Boolean(runDisabledReasonKey)"
            :loading="isTriggeringRun"
            @click="runTestCase"
          >
            {{ t(runButtonLabelKey) }}
          </Button>
        </Tooltip>
        <Tooltip
          v-else-if="runInProgress"
          :title="t('message.test-case-run-already-in-progress')"
        >
          <Button
            data-testid="run-test-case-button"
            :loading="isTriggeringRun"
            @click="runTestCase"
          >
            {{ t(runButtonLabelKey) }}
          </Button>
        </Tooltip>
        <Button
          v-else
          data-testid="run-test-case-button"
          :loading="isTriggeringRun"
          @click="runTestCase"
        >
          {{ t(runButtonLabelKey) }}
        </Button>
      </template>
      <EntityManageButton
        v-if="!isVersionPage"
        :entity-label="t('label.test-case')"
        :can-rename="editDisplayNamePermission"
        :can-delete="hasDeletePermission"
        :deleted="testCaseDeleted"
        :extra-items="manageExtraItems"
        rename-test-id="edit-test-case"
        delete-test-id="delete-test-case"
        @rename="openRename"
        @delete="onDeleteTestCase"
      />
    </template>
    <template #meta>
      <Descriptions v-if="testCase" bordered :column="3" size="small" data-testid="test-case-header-meta">
        <Descriptions.Item :label="t('label.domain')">
          <WidgetDomainCell
            test-id="test-case-header-domain"
            :domains="testCase.domains ?? []"
            :options="governanceCatalog.domains"
            :has-edit-access="canEditTestCaseDomains"
            :on-change="onHeaderDomainsSave"
          />
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.owner-plural')">
          <WidgetOwnersCell
            test-id="test-case-header-owners"
            :owners="testCase.owners ?? []"
            :options="governanceCatalog.owners"
            :has-edit-access="canEditTestCaseOwners"
            :on-change="onHeaderOwnersSave"
          />
        </Descriptions.Item>
        <Descriptions.Item v-if="taskLinkInfo" :label="t('label.incident')">
          <RouterLink :to="taskLinkInfo.path" data-testid="incident-task-link">
            {{ taskLinkInfo.label }}
          </RouterLink>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.incident-status')">
          <IncidentInlineStatus
            v-if="latestIncident"
            :record="latestIncident"
            :editable="hasEditStatusPermission"
            :loading="incidentHeaderWriting === 'status'"
            :menu-options="headerStatusMenuOptions"
            :assignee-candidates="assigneeCandidates"
            test-id="test-case-header-incident-status"
            @transition="(status, additional) => submitHeaderIncidentStatus(status, additional)"
          />
          <span v-else>{{ t('label.no-entity', { entity: t('label.incident') }) }}</span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.assignee')">
          <div
            v-if="latestIncident && hasEditStatusPermission"
            data-testid="assignee"
          >
            <IncidentAssigneePicker
              :model-value="latestIncident.testCaseResolutionStatusDetails?.assignee"
              :candidates="assigneeCandidates"
              :disabled="incidentHeaderWriting !== undefined"
              :loading="incidentHeaderWriting === 'assignee'"
              test-id="test-case-header-incident-assignee"
              @change="onHeaderAssigneeChange"
            />
          </div>
          <span v-else data-testid="assignee">
            {{
              assigneeDisplayName(latestIncident?.testCaseResolutionStatusDetails?.assignee) ||
              t('observability.incidents.noAssignee')
            }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.severity')">
          <IncidentInlineSeverity
            v-if="latestIncident"
            :severity="latestIncident.severity"
            :editable="hasEditStatusPermission"
            :loading="incidentHeaderWriting === 'severity'"
            test-id="test-case-header-incident-severity"
            @change="onHeaderSeverityChange"
          />
          <span v-else>—</span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.table')">
          <RouterLink
            v-if="tableProfilerTo"
            :to="tableProfilerTo"
            data-testid="table-name"
          >
            {{ tableShortName || tableFqnForLink }}
          </RouterLink>
          <span v-else>{{ tableFqnForLink || '—' }}</span>
        </Descriptions.Item>
        <Descriptions.Item v-if="(testCase.dimensionColumns?.length ?? 0) > 0" :label="t('label.dimension')">
          {{ testCase.dimensionColumns?.join(', ') }}
        </Descriptions.Item>
        <Descriptions.Item v-if="columnHeaderName !== '—'" :label="t('label.column')">
          <span data-testid="test-column-name">{{ columnHeaderName }}</span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.test-type')">
          <span data-testid="test-definition-name">{{ testDefinitionHeaderName }}</span>
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template v-if="isExpandViewSupported" #tab-bar-extra>
      <Tooltip :title="isTabExpanded ? t('label.collapse') : t('label.expand')">
        <Button
          type="text"
          data-testid="tab-expand-button"
          :class="{ 'test-case-detail__expand--collapsed': !isTabExpanded }"
          @click="toggleTabExpanded"
        >
          <AlignRightOutlined />
        </Button>
      </Tooltip>
    </template>
    <template #test-case-results>
      <div
        v-if="testCase"
        class="test-case-last-run-banner-tab-container"
        data-testid="test-case-last-run-banner-tab-container"
      >
        <TestCaseLastRunBanner
          :test-case="testCase"
          :test-case-result="testCase.testCaseResult"
          :test-case-status="testCase.testCaseStatus"
          :next-run-timestamp="nextRunTimestamp"
          :has-edit-status-permission="hasEditStatusPermission"
          :test-case-status-data="latestIncident"
          :task-link-info="taskLinkInfo"
          :incident-task-loaded="incidentTaskLoaded"
          :on-acknowledge="acknowledgeIncident"
        />
      </div>
      <div
        class="test-case-results-layout"
        :class="{ 'test-case-results-layout--expanded': isTabExpanded && isExpandViewSupported }"
        data-testid="test-case-result-tab-container"
      >
        <div class="test-case-results-layout__main">
          <div class="test-case-result-tab-graph" data-testid="test-case-result-tab-graph">
            <TestCaseTestSummary v-if="testCase" :test-case="testCase" />
          </div>
        </div>
        <div
          v-if="isTabExpanded && isExpandViewSupported && testCase"
          class="test-case-results-layout__rail"
        >
          <TestCaseResultRail
            :test-case="testCase"
            :test-definition="testDefinitionDetail"
            :tag-options="governanceCatalog.tags"
            :has-edit-permission="canEditRailAll"
            :has-edit-description-permission="canEditRailDescription"
            :has-edit-tags-permission="canEditRailTags"
            :has-edit-glossary-terms-permission="canEditRailGlossary"
            :on-description-update="onRailDescriptionUpdate"
            :on-tags-change="onRailTagsChange"
            :on-data-products-save="onRailDataProductsSave"
            :require-domain-for-data-product="requireDomainForDataProduct"
            @edit-parameter="parameterEditOpen = true"
          />
        </div>
      </div>
    </template>
    <template #issues>
      <TestCaseIncidentTab
        v-if="testCase?.fullyQualifiedName"
        :test-case-fqn="testCase.fullyQualifiedName"
        :owners="testCase.owners"
        @counts-updated="onIncidentTabCounts"
      />
      <SmState
        v-else
        state="empty"
        test-id="test-case-issues-residual"
        :empty-text="t('label.no-data')"
      />
    </template>
    <template #dimensionality>
      <DimensionalityPanel
        v-if="testCase?.fullyQualifiedName"
        :test-case-fqn="testCase.fullyQualifiedName"
        :dimension-columns="testCase.dimensionColumns ?? []"
      />
      <SmState
        v-else
        state="empty"
        test-id="test-case-dimensionality-residual"
        :empty-text="t('label.no-data')"
      />
    </template>
    <template #sql-query>
      <TestCaseSqlQueryTab
        :test-case="testCase"
        :is-version-page="isVersionPage"
        :change-description="testCase?.changeDescription"
      />
    </template>
  </EntityDetailShell>
  <ServiceVersionTimeline
    v-if="isVersionPage"
    :versions="versionList"
    :current-version="props.version ?? ''"
    entity-type="testCase"
    @select="versionHandler"
    @close="onOpenVersions"
  />
  </div>
  </div>
  <FormModal
    :open="editOpen"
    :title="t('label.edit-entity', { entity: t('label.display-name') })"
    :ok-text="t('label.update')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    @ok="onRenameSave"
    @cancel="editOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('label.display-name')">
        <Input v-model:value="editForm.displayName" data-testid="display-name-input" />
      </Form.Item>
    </Form>
  </FormModal>
  <TestCaseFormDrawer
    :open="dimensionDrawerOpen"
    :test-case="testCase ?? undefined"
    @cancel="dimensionDrawerOpen = false"
    @submitted="onDimensionsSubmitted"
  />
  <TestCaseFormDrawer
    :open="parameterEditOpen"
    :test-case="testCase ?? undefined"
    show-only-parameter
    @cancel="parameterEditOpen = false"
    @submitted="onParameterSubmitted"
  />
  <RestoreEntityModal
    :open="restoreOpen"
    :entity-name="entityLabel(testCase) || testCase?.name || ''"
    :entity-type-label="t('label.test-case')"
    :loading="restoring"
    @cancel="restoreOpen = false"
    @confirm="onConfirmRestore"
  />
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
.test-case-last-run-banner-tab-container {
  padding: 16px 0 12px;
}
.test-case-results-layout {
  display: block;
}
.test-case-results-layout--expanded {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
  gap: 16px;
  align-items: start;
}
.test-case-detail-page__layout {
  display: flex;
  gap: var(--sm-spacing-md, 16px);
  align-items: flex-start;
}
.test-case-detail-page__layout > :first-child {
  flex: 1;
  min-width: 0;
}
.test-case-detail-page--version .test-case-detail-page__layout {
  width: 100%;
}
.test-case-results-layout__main {
  min-width: 0;
}
.test-case-results-layout__rail {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-md, 8px);
  background: var(--sm-content-bg);
}
.test-case-rail__block {
  margin: 0 0 12px;
  color: var(--sm-text-tertiary);
  font-size: 13px;
}
.test-case-rail__params {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.test-case-detail__expand--collapsed :deep(.anticon) {
  transform: rotate(180deg);
}
</style>
