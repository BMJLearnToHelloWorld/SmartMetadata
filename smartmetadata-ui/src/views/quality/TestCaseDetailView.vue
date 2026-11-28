<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Form, Input, Tooltip, message } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { deleteTestCase, getTestCase, getTestCaseByName, updateTestCase } from '@/api/testCases';
import { listIngestionPipelines, runIngestionPipelineForEntity } from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import { usePermissionStore } from '@/stores/permissions';
import EntityManageButton from '@/components/quality/EntityManageButton.vue';
import {
  getActiveRunState,
  getRunButtonLabelKey,
  getRunDisabledReasonKey,
  getRunnablePipeline,
  getTriggerPermissions,
} from '@/quality/runTestCaseButton';
import { getTestDefinition } from '@/api/testDefinitions';
import { latestGovernanceVersionPath } from '@/api/governanceVersions';
import { getTestCaseVersionPath } from '@/catalog/versionPaths';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { listTestCaseResults } from '@/api/testCaseResults';
import { listTestIncidents } from '@/api/testIncidents';
import SmChart from '@/features/charts/SmChart.vue';
import { testResultsToTimeline } from '@/features/charts/series';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import SmState from '@/components/shared/SmState.vue';
import DimensionalityPanel from '@/features/quality/DimensionalityPanel.vue';
import { QUALITY_PAGE_TABS } from '@/catalog/qualityTabs';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import { parseEntityLink, toEntityLink } from '@/quality/entityLink';
import TableDiffFields from '@/features/quality/TableDiffFields.vue';
import { TABLE2_PARAM, isTableDiffDefinition } from '@/features/quality/tableDiffParams';
import type { TestCase, TestCaseResult, TestDefinition, TestIncident } from '@/types/quality';

const props = defineProps<{ id: string; tab?: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const testCase = ref<TestCase | null>(null);
const editDefinition = ref<TestDefinition | null>(null);
const results = ref<TestCaseResult[]>([]);
const issues = ref<TestIncident[]>([]);
const issuesError = ref('');
// Official TestCasePageTabs default is TEST_CASE_RESULTS. Unknown tabs
// land there; official has no overview fallback (t418u).
const DEFAULT_TEST_CASE_TAB = 'test-case-results';
const tabKeys = new Set(QUALITY_PAGE_TABS.testCase.map((tab) => tab.key));
const activeTab = ref(props.tab !== undefined && tabKeys.has(props.tab) ? props.tab : DEFAULT_TEST_CASE_TAB);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  parameterText: '',
  /** tableDiff 编辑态的参数值（与创建表单同一份 modelValue 形态）。 */
  parameterValues: {} as Record<string, string>,
});

const isTableDiff = computed(() =>
  isTableDiffDefinition(
    testCase.value?.testDefinition?.name,
    testCase.value?.testDefinition?.fullyQualifiedName,
  ),
);

const editEntity = computed(() => {
  if (!testCase.value?.entityLink) {
    return null;
  }
  return parseEntityLink(testCase.value.entityLink);
});

const resultSeries = computed(() => testResultsToTimeline(results.value));

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('label.data-quality'), to: { name: 'quality-test-cases' } },
  { label: entityLabel(testCase.value) || t('label.entity-detail-plural', { entity: t('label.test-case') }) },
]);

const tabs = computed<EntityDetailTab[]>(() =>
  QUALITY_PAGE_TABS.testCase
    .filter((tab) => tab.key !== 'sql-query' || Boolean(testCase.value?.inspectionQuery))
    .map((tab) => ({
      key: tab.key,
      label: t(tab.labelKey),
      testId: `test-case-tab-${tab.key}`,
    })),
);

const latestIncident = computed(() => issues.value[0]);
const assetEntity = computed(() =>
  testCase.value?.entityLink ? parseEntityLink(testCase.value.entityLink) : null,
);

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
const hasDeletePermission = computed(() => !testCaseDeleted.value && testCasePerms.canDelete.value);
const editDisplayNamePermission = computed(() => !testCaseDeleted.value && testCasePerms.canEditDisplayName.value);

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
    !testCaseDeleted.value &&
    !pipelinesLoading.value &&
    !pipelinePerms.isLoading.value &&
    !resourcePermsLoading.value &&
    canTrigger.value,
);

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

const issueColumns = computed<EntityListColumn[]>(() => [
  { title: t('label.status'), dataIndex: 'testCaseResolutionStatusType', key: 'status', width: 120 },
  { title: t('observability.incidents.severity'), dataIndex: 'severity', key: 'severity', width: 120 },
  { title: t('observability.incidents.updated'), key: 'timestamp', width: 200 },
]);

const resultColumns = computed<EntityListColumn[]>(() => [
  { title: t('label.status'), dataIndex: 'testCaseStatus', key: 'testCaseStatus', width: 120 },
  { title: t('label.last-run'), key: 'timestamp', width: 200 },
  { title: t('label.test-case-result'), dataIndex: 'result', key: 'result' },
  // Official result values have no product "diff values" heading; keep the
  // measured-value cells the API returned (no invented placeholder values).
  { title: '', key: 'values', width: 220 },
]);

function formatTs(value?: number): string {
  if (!value) {
    return '—';
  }
  const millis = value < 1e12 ? value * 1000 : value;
  return new Date(millis).toISOString();
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
    testCase.value = loaded;
    editDefinition.value = null;
    if (
      loaded.testDefinition?.id &&
      isTableDiffDefinition(loaded.testDefinition.name, loaded.testDefinition.fullyQualifiedName)
    ) {
      // 编辑态需要定义的完整 parameterDefinition（不能只从已有参数值推导，
      // 否则未填过的参数在编辑表单里直接消失）；取不到时回落到文本编辑。
      try {
        editDefinition.value = await getTestDefinition(loaded.testDefinition.id);
      } catch {
        editDefinition.value = null;
      }
    }
    if (loaded.fullyQualifiedName) {
      const page = await listTestCaseResults(loaded.fullyQualifiedName);
      results.value = page.data;
      try {
        const incidentPage = await listTestIncidents({ testCaseFQN: loaded.fullyQualifiedName });
        issues.value = incidentPage.data;
        issuesError.value = '';
      } catch {
        issues.value = [];
        issuesError.value = t('server.entity-fetch-error', { entity: t('label.incident') });
      }
      await loadSuitePipelines(loaded.testSuite?.fullyQualifiedName);
    } else {
      results.value = [];
      issues.value = [];
      await loadSuitePipelines(undefined);
    }
  } catch (error) {
    testCase.value = null;
    editDefinition.value = null;
    results.value = [];
    issues.value = [];
    errorMessage.value = getErrorText(error, t('server.entity-fetch-error', { entity: t('label.test-case') }));
  } finally {
    loading.value = false;
  }
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
  const targetId = testCase.value?.id ?? props.id;
  if (!targetId) {
    return;
  }
  try {
    const path = await latestGovernanceVersionPath('testCase', targetId, (version) => getTestCaseVersionPath(targetId, version));
    if (!path) {
      message.info(t('asset.versionsEmpty'));
      return;
    }
    await router.push(path);
  } catch {
    message.error(t('asset.versionsFailed'));
  }
}

function openEdit(): void {
  if (!testCase.value) {
    return;
  }
  editForm.displayName = testCase.value.displayName || '';
  editForm.description = testCase.value.description || '';
  editForm.parameterText = testCase.value.parameterValues.map((item) => `${item.name}=${item.value}`).join('\n');
  editForm.parameterValues = Object.fromEntries(
    testCase.value.parameterValues.map((item) => [item.name, item.value]),
  );
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!testCase.value?.entityLink || !testCase.value.testDefinition) {
    message.error(t('message.field-text-is-required', { field: t('label.test-case') }));
    return;
  }
  if (isTableDiff.value && !(editForm.parameterValues[TABLE2_PARAM] ?? '').trim()) {
    message.error(t('message.field-text-is-required', { field: t('label.table') }));
    return;
  }
  saving.value = true;
  try {
    const parameterValues = isTableDiff.value
      ? Object.entries(editForm.parameterValues)
          .map(([name, value]) => ({ name, value: value.trim() }))
          .filter((entry) => entry.value.length > 0)
      : editForm.parameterText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .flatMap((line) => {
            const eq = line.indexOf('=');
            return eq > 0 ? [{ name: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }] : [];
          });
    await updateTestCase({
      name: testCase.value.name,
      testDefinition: testCase.value.testDefinition.fullyQualifiedName || testCase.value.testDefinition.name,
      entityLink: testCase.value.entityLink,
      description: editForm.description.trim() || undefined,
      displayName: editForm.displayName.trim() || undefined,
      parameterValues,
    });
    editOpen.value = false;
    message.success(t('server.update-entity-success', { entity: t('label.test-case') }));
    await load();
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.test-case') })));
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.id,
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

onMounted(() => {
  void loadResourceTriggerPermissions();
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(testCase) || t('label.entity-detail-plural', { entity: t('label.test-case') })"
    :name="testCase?.name"
    :fqn="testCase?.fullyQualifiedName"
    :lead="t('label.entity-detail-plural', { entity: t('label.test-case') })"
    :loading="loading"
    :error="errorMessage"
    :empty="!testCase && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="testCase ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
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
      <Button data-testid="test-case-versions" :disabled="!testCase" @click="onOpenVersions">{{ t('label.version-plural-history') }}</Button>
      <EntityManageButton
        :entity-label="t('label.test-case')"
        :can-rename="editDisplayNamePermission"
        :can-delete="hasDeletePermission"
        :deleted="testCaseDeleted"
        rename-test-id="edit-test-case"
        delete-test-id="delete-test-case"
        @rename="openEdit"
        @delete="onDeleteTestCase"
      />
    </template>
    <template #meta>
      <Descriptions v-if="testCase" bordered :column="3" size="small" data-testid="test-case-header-meta">
        <Descriptions.Item :label="t('label.incident-status')">
          {{ latestIncident?.testCaseResolutionStatusType || t('label.no-entity', { entity: t('label.incident') }) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.assignee')">
          {{ latestIncident?.testCaseResolutionStatusDetails?.assignee?.displayName || latestIncident?.testCaseResolutionStatusDetails?.assignee?.name || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.severity')">
          {{ latestIncident?.severity || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.table')">
          {{ assetEntity?.fqn || testCase.entityFQN || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.dimension')">
          {{ testCase.dimensionColumns?.join(', ') || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.column')">
          {{ assetEntity?.column || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('label.test-type')">
          {{ testCase.testDefinition?.displayName || testCase.testDefinition?.name || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #test-case-results>
      <p class="entity-detail__tab-lead">{{ t('asset.resultsChartLead') }}</p>
      <SmChart kind="bar" test-id="test-case-results-chart" :series="resultSeries" :empty="t('charts.empty')" />
      <SmTable
        test-id="test-case-results-table"
        row-key="timestamp"
        size="small"
        style="margin-top: 16px"
        :columns="resultColumns"
        :data-source="results"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTs((record as TestCaseResult).timestamp) }}
          </template>
          <template v-else-if="column.key === 'values'">
            <div
              v-if="(record as TestCaseResult).testResultValue?.length"
              :data-testid="`test-case-result-values-${(record as TestCaseResult).timestamp}`"
            >
              <div
                v-for="entry in (record as TestCaseResult).testResultValue"
                :key="entry.name"
              >
                {{ entry.name }}: {{ entry.value }}
              </div>
            </div>
            <span v-else>—</span>
          </template>
        </template>
      </SmTable>
    </template>
    <template #issues>
      <SmState
        v-if="issuesError"
        state="error"
        test-id="test-case-issues-error"
        :error-text="issuesError"
      />
      <SmTable
        v-else
        test-id="test-case-issues-table"
        row-key="id"
        size="small"
        :columns="issueColumns"
        :data-source="issues"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTs((record as TestIncident).timestamp) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a
              href="#"
              :data-testid="`test-case-issue-${(record as TestIncident).id}`"
              @click.prevent="
                router.push(
                  `/test-case/${encodeURIComponent(
                    testCase?.fullyQualifiedName ??
                      (record as TestIncident).testCaseReference?.fullyQualifiedName ??
                      '',
                  )}/issues`,
                )
              "
            >
              {{ (record as TestIncident).testCaseResolutionStatusType || '—' }}
            </a>
          </template>
        </template>
      </SmTable>
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
      <pre data-testid="test-case-sql-query" class="entity-detail__sql-query">{{ testCase?.inspectionQuery }}</pre>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('label.edit-entity', { entity: t('label.test-case') })"
    :ok-text="t('label.update')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('label.display-name')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <TableDiffFields
        v-if="isTableDiff && editDefinition"
        :definitions="editDefinition.parameterDefinition"
        :entity-fqn="editEntity?.fqn ?? testCase?.entityFQN ?? ''"
        :entity-type="editEntity?.entityType ?? 'table'"
        :model-value="editForm.parameterValues"
        @update:model-value="editForm.parameterValues = $event"
      />
      <Form.Item v-else :label="t('label.parameter-plural')">
        <Input.TextArea v-model:value="editForm.parameterText" :rows="3" />
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
.entity-detail__sql-query {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--sm-font-mono, ui-monospace, monospace);
}
</style>
