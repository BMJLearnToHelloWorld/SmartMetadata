<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TableProfiler QualityTab + sibling IncidentsTab (live
  quality-asset-data-quality / incidents / workflows shots). Vue3 + ant-design-vue.
  No CCL React/CSS copy. Does not rename the product asset tab 数据质量.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Table, Tabs, Typography } from 'ant-design-vue';
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import { listTestCasesBySearch } from '@/api/testCases';
import TestCasesListView from '@/views/quality/TestCasesListView.vue';
import IncidentsListView from '@/views/observability/IncidentsListView.vue';
import { formatChartTs } from '@/features/charts/series';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestCase } from '@/types/quality';
import { testCaseStatus } from '@/quality/landing';

const props = defineProps<{
  entityFqn: string;
  testSuiteFqn?: string;
  deleted?: boolean;
}>();

const { t } = useI18n();
const outerTab = ref<'quality' | 'incidents'>('quality');
const innerTab = ref<'testCases' | 'workflows'>('testCases');
const summary = ref({ total: 0, success: 0, failed: 0, aborted: 0 });
const pipelines = ref<IngestionPipeline[]>([]);
const pipelineTotal = ref(0);
const pipelineError = ref('');
const pipelineLoading = ref(false);
const casesView = ref<{ openCreate: () => void } | null>(null);

const testCasesCount = computed(() => summary.value.total);
const workflowCount = computed(() => pipelineTotal.value);

const summaryCards = computed(() => [
  { key: 'total', title: t('quality.asset.totalTests'), value: summary.value.total, testId: 'asset-dq-total' },
  { key: 'success', title: t('quality.asset.successfulTests'), value: summary.value.success, testId: 'asset-dq-success' },
  { key: 'failed', title: t('quality.asset.failedTests'), value: summary.value.failed, testId: 'asset-dq-failed' },
  { key: 'aborted', title: t('quality.asset.abortedTests'), value: summary.value.aborted, testId: 'asset-dq-aborted' },
]);

const workflowColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('quality.testCases.title'), key: 'testCases' },
  { title: t('quality.asset.count'), key: 'count', width: 80 },
  { title: t('quality.asset.schedule'), key: 'schedule' },
  { title: t('quality.testCases.lastRun'), key: 'lastRun' },
  { title: t('crud.status'), key: 'status', width: 120 },
]);

function pipelineRecord(pipeline: IngestionPipeline): Record<string, unknown> {
  return pipeline as unknown as Record<string, unknown>;
}


function pipelineTestCases(pipeline: IngestionPipeline): string {
  const config = (pipeline.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config;
  const names = config?.testCases;
  if (!names?.length) {
    return t('quality.asset.all');
  }
  return names.join(', ');
}

function pipelineTestCaseCount(pipeline: IngestionPipeline): string {
  const config = (pipeline.sourceConfig as { config?: { testCases?: string[] } } | undefined)?.config;
  const names = config?.testCases;
  return names?.length ? String(names.length) : '—';
}

function pipelineSchedule(pipeline: IngestionPipeline): string {
  const airflow = pipeline.airflowConfig as { scheduleInterval?: string } | undefined;
  return airflow?.scheduleInterval || '—';
}

function pipelineStatus(pipeline: IngestionPipeline): string {
  const raw = pipelineRecord(pipeline).pipelineStatuses as
    | { status?: string; timestamp?: number }
    | Array<{ status?: string; timestamp?: number }>
    | undefined;
  if (Array.isArray(raw) && raw[0]?.status) {
    return raw[0].status;
  }
  if (raw && !Array.isArray(raw) && raw.status) {
    return raw.status;
  }
  return pipeline.enabled === false ? '—' : '—';
}

function pipelineLastRun(pipeline: IngestionPipeline): string {
  const raw = pipelineRecord(pipeline).pipelineStatuses as
    | { timestamp?: number; endDate?: number }
    | Array<{ timestamp?: number; endDate?: number }>
    | undefined;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const ts = first?.timestamp ?? first?.endDate;
  return ts ? formatChartTs(ts) || '—' : '—';
}

async function loadSummary(): Promise<void> {
  if (!props.entityFqn) {
    summary.value = { total: 0, success: 0, failed: 0, aborted: 0 };
    return;
  }
  try {
    const page = await listTestCasesBySearch({
      entityFQN: props.entityFqn,
      includeAllTests: true,
      limit: 100,
      include: props.deleted ? 'deleted' : 'non-deleted',
    });
    const counts = { total: page.total ?? page.data.length, success: 0, failed: 0, aborted: 0 };
    for (const item of page.data) {
      const status = testCaseStatus(item as TestCase);
      if (status === 'Success') counts.success += 1;
      else if (status === 'Failed') counts.failed += 1;
      else if (status === 'Aborted') counts.aborted += 1;
    }
    summary.value = counts;
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
      fields: 'pipelineStatuses',
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

watch(
  () => [props.entityFqn, props.testSuiteFqn, props.deleted] as const,
  () => {
    void loadSummary();
    void loadPipelines();
  },
);

onMounted(() => {
  void loadSummary();
  void loadPipelines();
});
</script>

<template>
  <div class="asset-dq" data-testid="asset-data-quality-tab">
    <Tabs v-model:activeKey="outerTab" data-testid="asset-dq-outer-tabs">
      <Tabs.TabPane key="quality" :tab="t('quality.asset.dataQuality')" />
      <Tabs.TabPane key="incidents">
        <template #tab>
          <span data-testid="asset-dq-incidents-tab">{{ t('quality.asset.incidents') }}</span>
        </template>
      </Tabs.TabPane>
    </Tabs>

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
        <Table
          :columns="workflowColumns"
          :data-source="pipelines"
          :loading="pipelineLoading"
          :pagination="false"
          row-key="id"
          data-testid="asset-dq-workflows-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ (record as IngestionPipeline).displayName || (record as IngestionPipeline).name }}
            </template>
            <template v-else-if="column.key === 'testCases'">{{ pipelineTestCases(record as IngestionPipeline) }}</template>
            <template v-else-if="column.key === 'count'">{{ pipelineTestCaseCount(record as IngestionPipeline) }}</template>
            <template v-else-if="column.key === 'schedule'">{{ pipelineSchedule(record as IngestionPipeline) }}</template>
            <template v-else-if="column.key === 'lastRun'">{{ pipelineLastRun(record as IngestionPipeline) }}</template>
            <template v-else-if="column.key === 'status'">{{ pipelineStatus(record as IngestionPipeline) }}</template>
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
  gap: 12px;
  margin-bottom: 12px;
}
</style>
