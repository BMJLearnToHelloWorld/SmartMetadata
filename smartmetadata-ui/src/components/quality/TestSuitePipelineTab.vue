<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSuitePipelineTab / AssetDataQualityTab workflows depth.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu, Table, Tag, Tooltip, Typography, message } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { INGESTION_PIPELINE_FIELDS, getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import IngestionRecentRuns from '@/components/ingestion/IngestionRecentRuns.vue';
import IngestionStatusCount from '@/components/ingestion/IngestionStatusCount.vue';
import TestSuitePipelineFormDrawer from '@/components/quality/TestSuitePipelineFormDrawer.vue';
import { getErrorText } from '@/views/admin/accessApiErrors';
import { usePipelineRowActions } from '@/ingestion/usePipelineRowActions';
import { usePermissionStore } from '@/stores/permissions';
import IngestionLogsModal from '@/views/ingestion/IngestionLogsModal.vue';
import KillPipelineModal from '@/views/ingestion/KillPipelineModal.vue';
import PipelineRowActions from '@/views/ingestion/PipelineRowActions.vue';
import PipelineScheduleCell from '@/views/ingestion/PipelineScheduleCell.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import { entityLabel } from '@/features/crud/paging';

const props = defineProps<{
  testSuiteFqn: string;
  testSuiteId?: string;
  deleted?: boolean;
}>();

const emit = defineEmits<{ 'update:total': [total: number] }>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const isAdminUser = computed(() => permissionStore.isAdminUser);

const pipelines = ref<IngestionPipeline[]>([]);
const pipelineTotal = ref(0);
const pipelineError = ref('');
const pipelineLoading = ref(false);
const pipelineDrawerOpen = ref(false);
const editingPipeline = ref<IngestionPipeline | null>(null);
const orchestratorUnavailable = ref(false);

const suiteForDrawer = computed<TestSuite | null>(() =>
  props.testSuiteFqn
    ? ({ name: props.testSuiteFqn, fullyQualifiedName: props.testSuiteFqn } as TestSuite)
    : null,
);

const workflowColumns = computed(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.test-case-plural'), key: 'testCases' },
  { title: t('label.count'), key: 'count', width: 220 },
  { title: t('label.schedule'), key: 'schedule' },
  { title: t('label.recent-run-plural'), key: 'recentRuns', width: 180 },
  { title: t('label.status'), key: 'status', width: 120 },
  { title: t('label.action-plural'), key: 'actions', width: 80 },
]);

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

async function loadPipelines(): Promise<void> {
  pipelineError.value = '';
  if (!props.testSuiteFqn) {
    pipelines.value = [];
    pipelineTotal.value = 0;
    emit('update:total', 0);
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
    emit('update:total', pipelineTotal.value);
  } catch (error) {
    pipelines.value = [];
    pipelineTotal.value = 0;
    emit('update:total', 0);
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
  () => [props.testSuiteFqn, props.testSuiteId, props.deleted] as const,
  () => {
    void loadPipelines();
  },
);

onMounted(() => {
  void loadPipelines();
  void loadOrchestrator();
});
</script>

<template>
  <div data-testid="test-suite-pipeline-tab">
    <Button
      v-if="testSuiteFqn && !deleted"
      data-testid="add-test-suite-ingestion"
      style="margin-bottom: 16px"
      @click="openAddPipeline"
    >
      {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
    </Button>
    <Typography.Text v-if="pipelineError" type="danger" data-testid="test-suite-pipelines-error">
      {{ pipelineError }}
    </Typography.Text>
    <div
      v-if="!pipelineLoading && pipelines.length === 0 && !pipelineError"
      class="suite-pipeline__empty"
      data-testid="test-suite-pipelines-empty"
    >
      <div>{{ t('message.no-pipelines-yet') }}</div>
      <div class="suite-pipeline__empty-help">{{ t('message.no-table-pipeline') }}</div>
      <Button type="primary" data-testid="add-pipeline-button" @click="openAddPipeline">
        {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
      </Button>
    </div>
    <Table
      v-else-if="pipelines.length > 0 || pipelineLoading"
      :columns="workflowColumns"
      :data-source="pipelines"
      :loading="pipelineLoading"
      :pagination="false"
      row-key="id"
      data-testid="test-suite-pipelines-table"
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
            :data-testid="`test-suite-pipeline-${(record as IngestionPipeline).id}`"
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
            <Button :data-testid="`test-suite-pipeline-actions-${(record as IngestionPipeline).id}`">⋯</Button>
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
.suite-pipeline__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 0;
}
.suite-pipeline__empty-help {
  color: var(--sm-text-secondary);
}
</style>