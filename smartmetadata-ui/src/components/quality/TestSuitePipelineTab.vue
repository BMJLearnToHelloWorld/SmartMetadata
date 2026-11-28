<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSuitePipelineTab / AssetDataQualityTab workflows depth.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu, Table, Tag, Tooltip, Typography } from 'ant-design-vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { INGESTION_PIPELINE_FIELDS, getOrchestratorStatus, listIngestionPipelines } from '@/api/ingestionPipelines';
import IngestionRecentRuns from '@/components/ingestion/IngestionRecentRuns.vue';
import IngestionStatusCount from '@/components/ingestion/IngestionStatusCount.vue';
import TestSuitePipelineFormDrawer from '@/components/quality/TestSuitePipelineFormDrawer.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
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

const pipelineError = ref('');
const pipelineDrawerOpen = ref(false);
const editingPipeline = ref<IngestionPipeline | null>(null);
const orchestratorUnavailable = ref(false);
const canCreatePipeline = ref(false);

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

const {
  items,
  paging,
  isLoading,
  page,
  pageSize,
  showPagination,
  onPageChange,
  onPageSizeChange,
} = useCursorPagedList<IngestionPipeline>(
  async ({ after, before, limit }) => {
    if (!props.testSuiteFqn) {
      return { data: [], paging: { total: 0 } };
    }
    pipelineError.value = '';
    const pageResult = await listIngestionPipelines({
      testSuite: props.testSuiteFqn,
      pipelineType: 'TestSuite',
      limit,
      after,
      before,
      fields: INGESTION_PIPELINE_FIELDS,
    });
    return {
      data: pageResult.data,
      paging: {
        after: pageResult.after,
        before: pageResult.before,
        total: pageResult.total ?? pageResult.data.length,
      },
    };
  },
  {
    resetKey: () => [props.testSuiteFqn, props.deleted] as const,
    onError: (error) => {
      pipelineError.value = getErrorText(error, t('server.unexpected-error'));
    },
  },
);

/** Official sortBy test-case count ascending (all pipelines last). */
const sortedPipelines = computed(() =>
  [...items.value].sort((a, b) => {
    const lenA = (a.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config
      ?.testCases?.length;
    const lenB = (b.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config
      ?.testCases?.length;
    const scoreA = lenA ? lenA : Number.NEGATIVE_INFINITY;
    const scoreB = lenB ? lenB : Number.NEGATIVE_INFINITY;
    return scoreA - scoreB;
  }),
);

const showPager = computed(() => showPagination.value && (paging.value.total ?? 0) > 0);

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

const rowActions = usePipelineRowActions({
  isAdminUser: () => isAdminUser.value,
  getOps: () => undefined,
  refresh: () => onPageChange(page.value),
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

async function loadCreatePermission(): Promise<void> {
  try {
    const ops = await permissionStore.getResourcePermission('ingestionPipeline');
    canCreatePipeline.value = ops.Create === true;
  } catch {
    canCreatePipeline.value = false;
  }
}

watch(
  () => paging.value.total,
  (total) => {
    emit('update:total', total ?? 0);
  },
  { immediate: true },
);

onMounted(() => {
  void loadOrchestrator();
  void loadCreatePermission();
});
</script>

<template>
  <div data-testid="test-suite-pipeline-tab">
    <Button
      v-if="testSuiteFqn && !deleted && sortedPipelines.length > 0"
      data-testid="add-pipeline-button"
      style="margin-bottom: 16px"
      @click="openAddPipeline"
    >
      {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
    </Button>
    <Typography.Text v-if="pipelineError" type="danger" data-testid="test-suite-pipelines-error">
      {{ pipelineError }}
    </Typography.Text>
    <div
      v-if="!isLoading && sortedPipelines.length === 0 && !pipelineError"
      class="suite-pipeline__empty"
      data-testid="test-suite-pipelines-empty"
    >
      <div>{{ t('message.no-pipelines-yet') }}</div>
      <div class="suite-pipeline__empty-help">{{ t('message.no-table-pipeline') }}</div>
      <Button
        v-if="canCreatePipeline"
        type="primary"
        data-testid="add-test-suite-ingestion"
        @click="openAddPipeline"
      >
        {{ t('label.add-entity', { entity: t('label.pipeline') }) }}
      </Button>
    </div>
    <Table
      v-else-if="sortedPipelines.length > 0 || isLoading"
      :columns="workflowColumns"
      :data-source="sortedPipelines"
      :loading="isLoading"
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

    <NextPrevious
      v-if="showPager"
      data-testid="test-suite-pipeline-pager"
      :paging="paging"
      :paging-handler="({ currentPage }) => onPageChange(currentPage)"
      :page-size="pageSize"
      :current-page="page"
      :is-loading="isLoading"
      :on-show-size-change="onPageSizeChange"
    />

    <TestSuitePipelineFormDrawer
      :open="pipelineDrawerOpen"
      :suite="suiteForDrawer"
      :ingestion-pipeline="editingPipeline"
      @close="pipelineDrawerOpen = false"
      @success="
        pipelineDrawerOpen = false;
        onPageChange(page);
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