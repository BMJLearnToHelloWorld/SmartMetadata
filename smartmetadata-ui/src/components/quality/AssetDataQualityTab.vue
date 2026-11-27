<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TableProfiler QualityTab + TabFilters 添加 dropdown +
  TestSuitePipelineTab columns (live quality-asset-data-quality /
  incidents / workflows shots). Vue3 + ant-design-vue. No CCL React/CSS
  copy. Does not rename the product asset tab 数据质量.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu, Table, Tabs, Tag, Tooltip, Typography } from 'ant-design-vue';
import { DownOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';
import { INGESTION_PIPELINE_FIELDS, getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import { fetchTestCaseResultByTestSuiteId } from '@/api/dataQualityReports';
import IngestionRecentRuns from '@/components/ingestion/IngestionRecentRuns.vue';
import IngestionStatusCount from '@/components/ingestion/IngestionStatusCount.vue';
import TestSuitePipelineFormDrawer from '@/components/quality/TestSuitePipelineFormDrawer.vue';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { usePermissionStore } from '@/stores/permissions';
import TestCasesListView from '@/views/quality/TestCasesListView.vue';
import IncidentsListView from '@/views/observability/IncidentsListView.vue';
import IngestionLogsModal from '@/views/ingestion/IngestionLogsModal.vue';
import KillPipelineModal from '@/views/ingestion/KillPipelineModal.vue';
import PipelineRowActions from '@/views/ingestion/PipelineRowActions.vue';
import PipelineScheduleCell from '@/views/ingestion/PipelineScheduleCell.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import { aggregateTestResultsByEntity } from '@/quality/testCaseSummary';
import { entityLabel } from '@/features/crud/paging';

const props = defineProps<{
  entityFqn: string;
  testSuiteFqn?: string;
  testSuiteId?: string;
  deleted?: boolean;
}>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const isAdminUser = computed(() => permissionStore.isAdminUser);
const outerTab = ref<'quality' | 'incidents'>('quality');
const innerTab = ref<'testCases' | 'workflows'>('testCases');
const summary = ref({ total: 0, success: 0, failed: 0, aborted: 0 });
const pipelines = ref<IngestionPipeline[]>([]);
const pipelineTotal = ref(0);
const pipelineError = ref('');
const pipelineLoading = ref(false);
const casesView = ref<{ openCreate: () => void } | null>(null);
const pipelineDrawerOpen = ref(false);
const editingPipeline = ref<IngestionPipeline | null>(null);
const orchestratorUnavailable = ref(false);

const testCasesCount = computed(() => summary.value.total);
const workflowCount = computed(() => pipelineTotal.value);
const suiteForDrawer = computed<TestSuite | null>(() =>
  props.testSuiteFqn
    ? ({ name: props.testSuiteFqn, fullyQualifiedName: props.testSuiteFqn } as TestSuite)
    : null,
);

const summaryCards = computed(() => [
  { key: 'total', title: t('quality.asset.totalTests'), value: summary.value.total, testId: 'asset-dq-total' },
  { key: 'success', title: t('quality.asset.successfulTests'), value: summary.value.success, testId: 'asset-dq-success' },
  { key: 'failed', title: t('quality.asset.failedTests'), value: summary.value.failed, testId: 'asset-dq-failed' },
  { key: 'aborted', title: t('quality.asset.abortedTests'), value: summary.value.aborted, testId: 'asset-dq-aborted' },
]);

const workflowColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testCases.title'), key: 'testCases' },
  { title: t('quality.asset.count'), key: 'count', width: 220 },
  { title: t('quality.asset.schedule'), key: 'schedule' },
  { title: t('quality.testCases.lastRun'), key: 'recentRuns', width: 180 },
  { title: t('crud.status'), key: 'status', width: 120 },
  { title: t('crud.actions'), key: 'actions', width: 80 },
]);

/** Official TestSuitePipelineTab: length or label.all ("全部"). */
function pipelineTestCases(pipeline: IngestionPipeline): string {
  const config = (pipeline.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config;
  const names = config?.testCases;
  return names?.length ? String(names.length) : t('quality.asset.all');
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
    pipelineError.value = error instanceof Error ? error.message : t('crud.loadFailed');
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

function onAddMenu({ key }: { key: string | number }): void {
  if (key === 'test-case') {
    casesView.value?.openCreate();
    if (outerTab.value !== 'quality') {
      outerTab.value = 'quality';
    }
    innerTab.value = 'testCases';
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
});
</script>

<template>
  <div class="asset-dq" data-testid="asset-data-quality-tab">
    <div class="asset-dq__header">
      <Tabs v-model:activeKey="outerTab" data-testid="asset-dq-outer-tabs">
        <Tabs.TabPane key="quality" :tab="t('quality.asset.dataQuality')" />
        <Tabs.TabPane key="incidents">
          <template #tab>
            <span data-testid="asset-dq-incidents-tab">{{ t('quality.asset.incidents') }}</span>
          </template>
        </Tabs.TabPane>
      </Tabs>
      <div v-if="!deleted" class="asset-dq__header-actions">
        <Dropdown :trigger="['click']">
          <Button type="primary" data-testid="asset-dq-add">
            {{ t('quality.asset.add') }}
            <DownOutlined />
          </Button>
          <template #overlay>
            <Menu data-testid="asset-dq-add-menu" @click="onAddMenu">
              <Menu.Item key="test-case" data-testid="asset-dq-add-test-case">
                {{ t('quality.asset.addTestCase') }}
              </Menu.Item>
              <Menu.Item key="custom-metric" data-testid="asset-dq-add-custom-metric">
                {{ t('quality.asset.addCustomMetric') }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </div>

    <template v-if="outerTab === 'quality'">
      <div class="asset-dq__cards">
        <div v-for="card in summaryCards" :key="card.key" class="asset-dq__card" :data-testid="card.testId">
          <div class="asset-dq__card-title">{{ card.title }}</div>
          <div class="asset-dq__card-value">{{ card.value }}</div>
        </div>
      </div>

      <div class="asset-dq__toolbar" data-testid="asset-dq-toolbar">
        <Tabs v-model:activeKey="innerTab" size="small" data-testid="asset-dq-inner-tabs">
          <Tabs.TabPane key="testCases">
            <template #tab>{{ t('quality.testCases.title') }} {{ testCasesCount }}</template>
          </Tabs.TabPane>
          <Tabs.TabPane key="workflows">
            <template #tab>
              <span data-testid="asset-dq-workflows-tab">{{ t('quality.asset.workflows') }} {{ workflowCount }}</span>
            </template>
          </Tabs.TabPane>
        </Tabs>
        <Button
          v-if="innerTab === 'workflows' && testSuiteFqn && pipelines.length > 0"
          data-testid="asset-dq-add-pipeline"
          @click="openAddPipeline"
        >
          {{ t('quality.asset.addPipeline') }}
        </Button>
      </div>

      <TestCasesListView
        v-show="innerTab === 'testCases'"
        ref="casesView"
        embedded
        prefer-search
        :entity-fqn="entityFqn"
        data-testid="asset-dq-test-cases"
      />

      <div v-if="innerTab === 'workflows'" data-testid="asset-dq-workflows">
        <Typography.Text v-if="pipelineError" type="danger">{{ pipelineError }}</Typography.Text>
        <div v-if="!pipelineLoading && pipelines.length === 0" class="asset-dq__empty" data-testid="asset-dq-workflows-empty">
          <div>{{ t('quality.asset.noPipelines') }}</div>
          <Button v-if="testSuiteFqn" type="primary" data-testid="asset-dq-add-pipeline-empty" @click="openAddPipeline">
            {{ t('quality.asset.addPipeline') }}
          </Button>
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
              <Tooltip :title="t('quality.asset.testCaseCountInfo')">
                <QuestionCircleOutlined data-testid="asset-dq-test-cases-info" style="margin-left: 4px" />
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
    </template>

    <IncidentsListView
      v-else
      embedded
      :origin-entity-fqn="entityFqn"
      data-testid="asset-dq-incidents"
    />

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
.asset-dq__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.asset-dq__header-actions {
  padding-top: 4px;
}
.asset-dq__cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 8px 0 16px;
}
.asset-dq__card {
  border: 1px solid var(--sm-border-color, #f0f0f0);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--sm-bg-container, #fff);
}
.asset-dq__card-title {
  color: var(--sm-text-secondary, #8c8c8c);
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
