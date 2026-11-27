<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TableProfiler QualityTab + TestSuitePipelineTab columns.
  Vue3 + ant-design-vue. No CCL React/CSS copy. Official QualityTab
  does not host a top-level Incidents tab, add menu, or profiler
  settings gear (those live on DataObservabilityTab / TabFilters).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu, Table, Tabs, Tag, Tooltip, Typography, message } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { INGESTION_PIPELINE_FIELDS, getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import { fetchTestCaseResultByTestSuiteId } from '@/api/dataQualityReports';
import IngestionRecentRuns from '@/components/ingestion/IngestionRecentRuns.vue';
import IngestionStatusCount from '@/components/ingestion/IngestionStatusCount.vue';
import TestSuitePipelineFormDrawer from '@/components/quality/TestSuitePipelineFormDrawer.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { exportTestCasesInCSV } from '@/api/testCases';
import { markCsvJobOwned, notifyCsvJobsRefresh } from '@/api/csvJobs';
import { downloadCsv } from '@/features/csv/csv';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { usePermissionStore } from '@/stores/permissions';
import TestCasesListView from '@/views/quality/TestCasesListView.vue';
import IngestionLogsModal from '@/views/ingestion/IngestionLogsModal.vue';
import KillPipelineModal from '@/views/ingestion/KillPipelineModal.vue';
import PipelineRowActions from '@/views/ingestion/PipelineRowActions.vue';
import PipelineScheduleCell from '@/views/ingestion/PipelineScheduleCell.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import { aggregateTestResultsByEntity } from '@/quality/testCaseSummary';
import { entityLabel } from '@/features/crud/paging';

const props = withDefaults(defineProps<{
  entityFqn: string;
  testSuiteFqn?: string;
  testSuiteId?: string;
  deleted?: boolean;
  /**
   * Official QualityTab: PermissionPlaceholder only when permissions are
   * loaded and ViewTests is false. Unknown still shows the tab.
   */
  permissionsLoaded?: boolean;
  viewTests?: boolean;
}>(), { permissionsLoaded: false, viewTests: false });

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const isAdminUser = computed(() => permissionStore.isAdminUser);

const testsDenied = computed(() => props.permissionsLoaded && !props.viewTests);

const showQualityManage = computed(
  () => innerTab.value === 'testCases' && !props.deleted && (testCaseViewAll.value || testCaseEditAll.value),
);
const innerTab = ref<'testCases' | 'workflows'>('testCases');
const summary = ref({ total: 0, success: 0, failed: 0, aborted: 0 });
const pipelines = ref<IngestionPipeline[]>([]);
const pipelineTotal = ref(0);
const pipelineError = ref('');
const pipelineLoading = ref(false);
/** Official QualityTab TabsLabel count is testCasePaging.paging.total. */
const listTestCaseTotal = ref(0);
const pipelineDrawerOpen = ref(false);
const editingPipeline = ref<IngestionPipeline | null>(null);
const orchestratorUnavailable = ref(false);
const testCaseViewAll = ref(false);
const testCaseEditAll = ref(false);

const testCasesCount = computed(() => listTestCaseTotal.value);
const workflowCount = computed(() => pipelineTotal.value);
const suiteForDrawer = computed<TestSuite | null>(() =>
  props.testSuiteFqn
    ? ({ name: props.testSuiteFqn, fullyQualifiedName: props.testSuiteFqn } as TestSuite)
    : null,
);

const summaryCards = computed(() => [
  { key: 'total', title: t('label.test-plural-type', { type: t('label.total') }), value: summary.value.total, testId: 'asset-dq-total' },
  { key: 'success', title: t('label.test-plural-type', { type: t('label.successful') }), value: summary.value.success, testId: 'asset-dq-success' },
  { key: 'failed', title: t('label.test-plural-type', { type: t('label.failed') }), value: summary.value.failed, testId: 'asset-dq-failed' },
  { key: 'aborted', title: t('label.test-plural-type', { type: t('label.aborted') }), value: summary.value.aborted, testId: 'asset-dq-aborted' },
]);

const workflowColumns = computed(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.test-case-plural'), key: 'testCases' },
  { title: t('label.count'), key: 'count', width: 220 },
  { title: t('label.schedule'), key: 'schedule' },
  { title: t('label.recent-run-plural'), key: 'recentRuns', width: 180 },
  { title: t('label.status'), key: 'status', width: 120 },
  { title: t('label.action-plural'), key: 'actions', width: 80 },
]);

/** Official TestSuitePipelineTab: length or label.all ("全部"). */
function pipelineTestCases(pipeline: IngestionPipeline): string {
  const config = (pipeline.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config;
  const names = config?.testCases;
  return names?.length ? String(names.length) : t('label.all');
}

function pipelineSchedule(pipeline: IngestionPipeline): string | undefined {
  return (pipeline.airflowConfig as { scheduleInterval?: string } | undefined)?.scheduleInterval;
}

function latestStatus(pipeline: IngestionPipeline) {
  return pipeline.pipelineStatuses?.[0];
}

async function loadSummary(): Promise<void> {
  /** Official TableProfilerProvider.fetchTestCaseSummary: skip when the asset has no testSuite.id. */
  if (!props.testSuiteId) {
    summary.value = { total: 0, success: 0, failed: 0, aborted: 0 };
    return;
  }
  try {
    const report = await fetchTestCaseResultByTestSuiteId(props.testSuiteId);
    const aggregated = aggregateTestResultsByEntity(report.data);
    const total = aggregated.total ?? { total: 0, success: 0, failed: 0, aborted: 0 };
    summary.value = {
      total: total.total,
      success: total.success,
      failed: total.failed,
      aborted: total.aborted,
    };
  } catch {
    summary.value = { total: 0, success: 0, failed: 0, aborted: 0 };
  }
}

async function loadPipelines(): Promise<void> {
  pipelineError.value = '';
  if (!props.testSuiteFqn) {
    pipelines.value = [];
    pipelineTotal.value = 0;
    return;
  }
  pipelineLoading.value = true;
  try {
    const page = await listIngestionPipelines({
      testSuite: props.testSuiteFqn,
      pipelineType: 'TestSuite',
      limit: 50,
      fields: INGESTION_PIPELINE_FIELDS,
    });
    pipelines.value = page.data;
    pipelineTotal.value = page.total ?? page.data.length;
  } catch (error) {
    pipelines.value = [];
    pipelineTotal.value = 0;
    pipelineError.value = getErrorText(error, t('server.unexpected-error'));
  } finally {
    pipelineLoading.value = false;
  }
}

const rowActions = usePipelineRowActions({
  isAdminUser: () => isAdminUser.value,
  getOps: () => undefined,
  refresh: () => loadPipelines(),
});
const logsPipeline = rowActions.logsPipeline;
const killPipeline = rowActions.killPipeline;

function officialExportFileName(name: string): string {
  return `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
}

/** Official ExtraTestCaseDropdownOptions + EntityExportModalProvider.runTrayExport (CSV-only). */
async function exportTestCasesTray(name: string): Promise<void> {
  try {
    const result = await exportTestCasesInCSV(name, { recursive: true });
    if (typeof result === 'string') {
      downloadCsv(result, officialExportFileName(name));
      return;
    }
    const jobId = result && typeof result === 'object' && 'jobId' in result
      ? (result as { jobId?: unknown }).jobId
      : undefined;
    markCsvJobOwned(typeof jobId === 'string' ? jobId : undefined);
    notifyCsvJobsRefresh();
  } catch (error: unknown) {
    message.error(getErrorText(error, t('server.unexpected-error')));
  }
}

function openAddPipeline(): void {
  editingPipeline.value = null;
  pipelineDrawerOpen.value = true;
}

function openEditPipeline(pipeline: IngestionPipeline): void {
  editingPipeline.value = pipeline;
  pipelineDrawerOpen.value = true;
}

function onViewPipeline(pipeline: IngestionPipeline): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: pipeline.id } });
}

async function loadTestCaseResourcePermission(): Promise<void> {
  try {
    const ops = await permissionStore.getResourcePermission('testCase');
    testCaseViewAll.value = ops.ViewAll === true;
    testCaseEditAll.value = ops.EditAll === true;
  } catch {
    testCaseViewAll.value = false;
    testCaseEditAll.value = false;
  }
}

/** Official ExtraTestCaseDropdownOptions on QualityTab ManageButton. */
function onQualityManage({ key }: { key: string | number }): void {
  if (key === 'import-button') {
    void router.push({
      path: `/bulk/import/testCase/${encodeURIComponent(props.entityFqn)}`,
      query: { sourceEntityType: 'table' },
    });
    return;
  }
  if (key === 'bulk-edit-button') {
    void router.push({
      path: `/bulk/edit/testCase/${encodeURIComponent(props.entityFqn)}`,
      query: { sourceEntityType: 'table' },
    });
    return;
  }
  if (key === 'export-button') {
    void exportTestCasesTray(props.entityFqn);
  }
}

async function loadOrchestrator(): Promise<void> {
  try {
    const status = await getOrchestratorStatus();
    orchestratorUnavailable.value = status.platform === 'disabled' || status.code !== 200;
  } catch {
    orchestratorUnavailable.value = true;
  }
}

watch(
  () => [props.entityFqn, props.testSuiteFqn, props.testSuiteId, props.deleted] as const,
  () => {
    void loadSummary();
    void loadPipelines();
  },
);

onMounted(() => {
  void loadSummary();
  void loadPipelines();
  void loadOrchestrator();
  void loadTestCaseResourcePermission();
});
</script>

<template>
  <div v-if="testsDenied" class="asset-dq" data-testid="asset-data-quality-tab">
    <PermissionPlaceholder
      :permission-value="t('label.view-entity', { entity: t('label.data-observability') })"
      test-id="permission-error-placeholder"
    />
  </div>
  <div v-else class="asset-dq" data-testid="asset-data-quality-tab">
      <div class="asset-dq__cards">
        <div v-for="card in summaryCards" :key="card.key" class="asset-dq__card" :data-testid="card.testId">
          <div class="asset-dq__card-title">{{ card.title }}</div>
          <div class="asset-dq__card-value">{{ card.value }}</div>
        </div>
      </div>

      <div class="asset-dq__toolbar" data-testid="asset-dq-toolbar">
        <Tabs v-model:activeKey="innerTab" size="small" data-testid="asset-dq-inner-tabs">
          <Tabs.TabPane key="testCases">
            <template #tab>
              <span data-testid="test-cases" class="asset-dq__tab-label">
                {{ t('label.test-case-plural') }}
                <span data-testid="count" class="asset-dq__tab-count">{{ testCasesCount }}</span>
              </span>
            </template>
          </Tabs.TabPane>
          <Tabs.TabPane key="workflows">
            <template #tab>
              <span data-testid="asset-dq-workflows-tab" class="asset-dq__tab-label">
                <span data-testid="pipeline">{{ t('label.pipeline-plural') }}</span>
                <span data-testid="count" class="asset-dq__tab-count">{{ workflowCount }}</span>
              </span>
            </template>
          </Tabs.TabPane>
        </Tabs>
        <Dropdown v-if="showQualityManage" :trigger="['click']">
          <Button data-testid="manage-button" :title="t('label.manage-entity', { entity: t('label.test-case-plural') })">
            ⋯
          </Button>
          <template #overlay>
            <Menu data-testid="manage-dropdown-list-container" @click="onQualityManage">
              <Menu.Item v-if="testCaseEditAll" key="import-button" data-testid="import-button">
                <div>{{ t('label.import') }}</div>
                <div class="asset-dq__manage-help">{{ t('message.import-entity-help', { entity: t('label.test-case-lowercase-plural') }) }}</div>
              </Menu.Item>
              <Menu.Item v-if="testCaseViewAll" key="export-button" data-testid="export-button">
                <div>{{ t('label.export') }}</div>
                <div class="asset-dq__manage-help">{{ t('message.export-entity-help', { entity: t('label.test-case-lowercase-plural') }) }}</div>
              </Menu.Item>
              <Menu.Item v-if="testCaseEditAll" key="bulk-edit-button" data-testid="bulk-edit-button">
                <div>{{ t('label.bulk-edit') }}</div>
                <div class="asset-dq__manage-help">{{ t('message.bulk-edit-entity-help', { entity: t('label.test-case-lowercase-plural') }) }}</div>
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
        <Button
          v-if="innerTab === 'workflows' && testSuiteFqn && pipelines.length > 0"
          data-testid="add-pipeline-button"
          @click="openAddPipeline"
        >
          {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
        </Button>
      </div>

      <TestCasesListView
        v-show="innerTab === 'testCases'"
        embedded
        prefer-search
        :entity-fqn="entityFqn"
        data-testid="asset-dq-test-cases"
        @update:total="listTestCaseTotal = $event ?? 0"
      />

      <div v-if="innerTab === 'workflows'" data-testid="asset-dq-workflows">
        <Typography.Text v-if="pipelineError" type="danger">{{ pipelineError }}</Typography.Text>
        <div v-if="!pipelineLoading && pipelines.length === 0" class="asset-dq__empty" data-testid="asset-dq-workflows-empty">
          <template v-if="testSuiteFqn">
            <div>{{ t('message.no-pipelines-yet') }}</div>
            <div class="asset-dq__empty-help">{{ t('message.no-table-pipeline') }}</div>
            <Button type="primary" data-testid="add-pipeline-button" @click="openAddPipeline">
              {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
            </Button>
          </template>
          <div v-else data-testid="no-data-placeholder">{{ t('message.no-test-suite-table-pipeline') }}</div>
        </div>
        <Table
          v-else
          :columns="workflowColumns"
          :data-source="pipelines"
          :loading="pipelineLoading"
          :pagination="false"
          row-key="id"
          data-testid="asset-dq-workflows-table"
        >
          <template #headerCell="{ column }">
            <template v-if="column.key === 'testCases'">
              <span>{{ column.title }}</span>
              <Tooltip :title="t('message.test-case-count-info')">
                <QuestionCircleOutlined data-testid="test-cases-info-tooltip-icon" style="margin-left: 4px" />
              </Tooltip>
            </template>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                href="#"
                :data-testid="`asset-dq-pipeline-${(record as IngestionPipeline).id}`"
                @click.prevent="onViewPipeline(record as IngestionPipeline)"
              >
                {{ entityLabel(record as IngestionPipeline) }}
              </a>
            </template>
            <template v-else-if="column.key === 'testCases'">
              <span :data-testid="`test-case-count-${(record as IngestionPipeline).name}`">
                {{ pipelineTestCases(record as IngestionPipeline) }}
              </span>
            </template>
            <template v-else-if="column.key === 'count'">
              <IngestionStatusCount
                :summary="latestStatus(record as IngestionPipeline)?.status?.[0]"
                :run-id="latestStatus(record as IngestionPipeline)?.runId"
              />
            </template>
            <template v-else-if="column.key === 'schedule'">
              <PipelineScheduleCell :schedule-interval="pipelineSchedule(record as IngestionPipeline)" />
            </template>
            <template v-else-if="column.key === 'recentRuns'">
              <IngestionRecentRuns :statuses="(record as IngestionPipeline).pipelineStatuses" />
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="(record as IngestionPipeline).enabled === false ? 'default' : 'success'">
                {{
                  (record as IngestionPipeline).enabled === false
                    ? t('settings.services.pipeline.statusPaused')
                    : t('settings.services.pipeline.statusActive')
                }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Dropdown :trigger="['click']">
                <Button data-testid="asset-dq-workflow-actions">⋯</Button>
                <template #overlay>
                  <Menu>
                    <PipelineRowActions
                      :pipeline="record as IngestionPipeline"
                      :is-admin-user="isAdminUser"
                      :orchestrator-unavailable="orchestratorUnavailable"
                      show-view
                      @view="onViewPipeline"
                      @run="rowActions.onRun"
                      @deploy="rowActions.onDeploy"
                      @toggle="rowActions.onToggle"
                      @logs="rowActions.onLogs"
                      @edit="openEditPipeline"
                      @kill="rowActions.onKill"
                      @delete="rowActions.onDelete"
                    />
                  </Menu>
                </template>
              </Dropdown>
            </template>
          </template>
        </Table>
      </div>

    <TestSuitePipelineFormDrawer
      :open="pipelineDrawerOpen"
      :suite="suiteForDrawer"
      :ingestion-pipeline="editingPipeline"
      @close="pipelineDrawerOpen = false"
      @success="
        pipelineDrawerOpen = false;
        void loadPipelines();
      "
    />
    <IngestionLogsModal
      :open="logsPipeline !== null"
      :pipeline="logsPipeline"
      log-entity-type="testSuite"
      @close="logsPipeline = null"
    />
    <KillPipelineModal
      :open="killPipeline !== null"
      :pipeline-id="killPipeline?.id ?? ''"
      :pipeline-name="killPipeline ? entityLabel(killPipeline) : ''"
      @close="killPipeline = null"
      @killed="rowActions.onKillDone"
    />
  </div>
</template>

<style scoped>
.asset-dq__cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 8px 0 16px;
}
.asset-dq__card {
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--sm-bg-container);
}
.asset-dq__card-title {
  color: var(--sm-text-secondary);
  font-size: 13px;
}
.asset-dq__card-value {
  font-size: 24px;
  font-weight: 600;
}
.asset-dq__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.asset-dq__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 0;
}
</style>
