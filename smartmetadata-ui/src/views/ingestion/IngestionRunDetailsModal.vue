<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, ref, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { EntityListColumn } from '@/features/crud/types';
import { formatRunTimestamp, startCaseState } from '@/ingestion/pipelineDisplay';
import type { PipelineStatus, PipelineStepStatus } from '@/types/ingestion';

const props = defineProps<{
  open: boolean;
  status: PipelineStatus | null;
}>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/**
 * Official IngestionRunDetailsModal (openmetadata-ui, pin a3012259ca):
 * title "Run status: <State> at <time>"; step table Step / Records /
 * Filtered / Updated / Warnings / Errors / Failures; a step with
 * failures shows a Logs button that expands the row into failure cards
 * carrying the error text and the stackTrace; footer is Cancel only.
 */
const title = computed(() =>
  t('ingestion.pipelines.runStatusAt', {
    status: startCaseState(props.status?.pipelineState),
    timestamp: formatRunTimestamp(props.status?.timestamp),
  }),
);

const expandedKeys = ref<string[]>([]);

const columns = computed<EntityListColumn[]>(() => [
  { title: t('ingestion.pipelines.step'), dataIndex: 'name', key: 'name' },
  { title: t('ingestion.pipelines.records'), dataIndex: 'records', key: 'records', width: 90 },
  { title: t('ingestion.pipelines.filtered'), dataIndex: 'filtered', key: 'filtered', width: 90 },
  { title: t('ingestion.pipelines.updatedRecords'), dataIndex: 'updated_records', key: 'updated_records', width: 90 },
  { title: t('ingestion.pipelines.warnings'), dataIndex: 'warnings', key: 'warnings', width: 90 },
  { title: t('ingestion.pipelines.errors'), dataIndex: 'errors', key: 'errors', width: 90 },
  { title: t('ingestion.pipelines.failures'), dataIndex: 'failures', key: 'failures', width: 110 },
]);

const steps = computed<PipelineStepStatus[]>(() => props.status?.status ?? []);

function stepKey(step: PipelineStepStatus): string {
  return step.name ?? '';
}

function failureCount(step: PipelineStepStatus): number {
  return step.failures?.length ?? 0;
}

function expandStep(step: PipelineStepStatus): void {
  expandedKeys.value = [stepKey(step)];
}

/**
 * antd-vue's expandedRowRender takes a single object argument
 * ({ record, index, indent, expanded }) — unlike React antd's
 * positional (record, index, indent, expanded). Passing the record
 * positionally renders an empty row (the object has no failures).
 */
function expandedRowRender({ record }: { record: PipelineStepStatus }): VNode {
  const step = record;
  return h(
    'div',
    { class: 'ing-run-failures' },
    (step.failures ?? []).map((failure) =>
      h('div', { class: 'ing-run-failure', key: failure.name ?? failure.error }, [
        failure.name ? h('div', { class: 'ing-run-failure__name' }, failure.name) : null,
        failure.error ? h('div', { class: 'ing-run-failure__error' }, failure.error) : null,
        failure.stackTrace ? h('pre', { class: 'ing-run-failure__trace' }, failure.stackTrace) : null,
      ]),
    ),
  );
}

const expandable = {
  // Official renders no expand icon: rows open only from the Logs button.
  expandIcon: () => h('span'),
  rowExpandable: (record: unknown) => failureCount(record as PipelineStepStatus) > 0,
};
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :footer="null"
    width="900"
    data-testid="ingestion-run-details-modal"
    @cancel="emit('close')"
  >
    <SmTable
      row-key="name"
      size="small"
      test-id="ingestion-run-steps-table"
      :columns="columns"
      :data-source="steps"
      :pagination="false"
      :expanded-row-keys="expandedKeys"
      :expanded-row-render="expandedRowRender"
      :expand-icon="expandable.expandIcon"
      :row-expandable="expandable.rowExpandable"
      :empty-text="t('ingestion.pipelines.noRunSteps')"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ (record as PipelineStepStatus).name || '—' }}
        </template>
        <template v-else-if="column.key === 'records'">
          {{ (record as PipelineStepStatus).records ?? '—' }}
        </template>
        <template v-else-if="column.key === 'filtered'">
          {{ (record as PipelineStepStatus).filtered ?? '—' }}
        </template>
        <template v-else-if="column.key === 'updated_records'">
          {{ (record as PipelineStepStatus).updated_records ?? '—' }}
        </template>
        <template v-else-if="column.key === 'warnings'">
          {{ (record as PipelineStepStatus).warnings ?? '—' }}
        </template>
        <template v-else-if="column.key === 'errors'">
          {{ (record as PipelineStepStatus).errors ?? '—' }}
        </template>
        <template v-else-if="column.key === 'failures'">
          <Button
            v-if="failureCount(record as PipelineStepStatus) > 0"
            type="link"
            size="small"
            :data-testid="`log-${(record as PipelineStepStatus).name}`"
            @click="expandStep(record as PipelineStepStatus)"
          >
            {{ t('ingestion.pipelines.logs') }}
          </Button>
          <span v-else>—</span>
        </template>
      </template>
    </SmTable>
    <div style="margin-top: 16px; text-align: right">
      <Button data-testid="ingestion-run-details-cancel" @click="emit('close')">
        {{ t('crud.cancel') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.ing-run-failures {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ing-run-failure {
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  padding: 8px 12px;
}
.ing-run-failure__name {
  font-weight: 600;
}
.ing-run-failure__error {
  margin-top: 4px;
}
.ing-run-failure__trace {
  margin-top: 8px;
  background: var(--sm-bg-elevated);
  border-radius: 6px;
  padding: 8px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
