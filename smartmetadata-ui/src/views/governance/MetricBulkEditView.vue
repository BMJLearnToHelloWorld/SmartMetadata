<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Table,
  Typography,
} from 'ant-design-vue';
import { ApiError } from '@/api/client';
import {
  cancelCsvAsyncJob,
  getCsvAsyncImportResult,
  getCsvDocumentation,
  importEntityCsv,
  pollCsvAsyncJob,
  type CsvAsyncJob,
  type CsvDocumentation,
  type CsvImportResult,
} from '@/api/csvImport';
import { notifyCsvJobsRefresh } from '@/api/csvJobs';
import { listMetrics, type Metric } from '@/api/metrics';
import CsvImportResultPanel from '@/components/shared/CsvImportResultPanel.vue';
import GlossaryTermCellEditor from '@/components/shared/GlossaryTermCellEditor.vue';
import OwnerCellEditor from '@/components/shared/OwnerCellEditor.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { stringifyCsv } from '@/features/csv/csv';
import {
  changedRowIndices,
  csvColumnLeaf,
  metricToCsvRow,
} from '@/features/csv/metricBulkEdit';
import { useBulkEditScopeStore, type MetricBulkEditScope } from '@/stores/bulkEditScope';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Official metric bulk edit (pages/EntityImport/BulkEntityImportPage in
 * bulk-edit mode, route /bulk/edit/:entityType/:fqn with fqn === '*'):
 * the listing page navigates with a scope — selected metric ids/names,
 * or the listing filters — and the grid is loaded from the listing
 * (utils/CSV/MetricBulkEditListing fetchMetricBulkEditGrid: page GET
 * /v1/metrics with limit 1000, keep live metrics, apply the scope
 * filters client-side). Saving posts only the changed rows as CSV to
 * the collection import (server: "Metric import scope. Use * for
 * collection import", MetricResource importCsvAsync) with
 * recursive=false, dryRun validate first, then the real import — the
 * same per-row result echo as the import wizard. The scope is carried
 * in a session store (the product has no router-state precedent);
 * a direct navigation with no stored scope falls back to official's
 * default: filtered with empty filters, i.e. everything.
 */
const props = defineProps<{ entityType: string; fqn: string }>();
const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const scopeStore = useBulkEditScopeStore();

const isMetricWildcard = computed(() => props.entityType === 'metric' && props.fqn === '*');

const scope = ref<MetricBulkEditScope>({ mode: 'filtered', filters: {} });
const loading = ref(false);
const headers = ref<string[]>([]);
const gridRows = ref<string[][]>([]);
const initialRows = ref<string[][]>([]);
const loadedCount = ref(0);
const matchedCount = ref(0);
const documentation = ref<CsvDocumentation | null>(null);
const docFailed = ref(false);

const validationResult = ref<CsvImportResult | null>(null);
const importResult = ref<CsvImportResult | null>(null);
const busy = ref(false);
const busyLabel = ref('');
const job = ref<CsvAsyncJob | null>(null);
const jobCancelled = ref(false);
const errorMessage = ref('');
const forbidden = ref(false);
const canEdit = ref(true);
const permissionChecked = ref(false);

const isAdminUser = computed(() => permissionStore.isAdminUser);

const gridRecords = computed(() =>
  gridRows.value.map((row, index) => {
    const record: Record<string, string> = { key: String(index) };
    headers.value.forEach((header, col) => {
      record[header] = row[col] ?? '';
    });
    return record;
  }),
);

const gridColumns = computed(() =>
  headers.value.map((header) => ({ title: header, dataIndex: header, key: header, ellipsis: true })),
);

const changedIndices = computed(() => changedRowIndices(initialRows.value, gridRows.value));
const changedCsv = computed(() => {
  const rows = changedIndices.value.map((index) => gridRows.value[index] ?? []);
  return stringifyCsv([headers.value, ...rows]);
});

function markForbidden(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 403) {
    forbidden.value = true;
    return true;
  }
  return false;
}

async function checkPermission(): Promise<void> {
  try {
    const ops = await permissionStore.getEntityPermissionByFqn(props.entityType, props.fqn);
    const flags = permissionStore.permissionFlags(ops);
    canEdit.value = isAdminUser.value || flags.canEditAll;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      canEdit.value = false;
    } else {
      canEdit.value = true;
    }
  } finally {
    permissionChecked.value = true;
  }
}

function scopeMatches(metric: Metric, active: MetricBulkEditScope): boolean {
  if (active.mode === 'selected') {
    const ids = new Set(active.metricIds);
    const names = new Set(active.metricNames);
    return ids.has(metric.id) || names.has(metric.name);
  }
  const search = active.filters.searchText?.trim().toLowerCase();
  const matchesSearch = search
    ? [metric.name, metric.displayName, metric.fullyQualifiedName, metric.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    : true;
  const matchesStatus = active.filters.statusFilter
    ? metric.entityStatus === active.filters.statusFilter
    : true;
  return matchesSearch && matchesStatus;
}

async function loadGrid(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const doc = await getCsvDocumentation('metric', false);
    documentation.value = doc;
    headers.value = doc.headers.map((header) => header.name);
  } catch {
    documentation.value = null;
    docFailed.value = true;
    headers.value = [];
  }
  try {
    const matched: Metric[] = [];
    let after: string | undefined;
    let totalLoaded = 0;
    do {
      const page = await listMetrics({ limit: 1000, after });
      totalLoaded += page.data.length;
      matched.push(...page.data.filter((metric) => scopeMatches(metric, scope.value)));
      after = page.after;
    } while (after);
    loadedCount.value = totalLoaded;
    matchedCount.value = matched.length;
    gridRows.value = matched.map((metric) => metricToCsvRow(metric, documentation.value?.headers ?? []));
    initialRows.value = gridRows.value.map((row) => [...row]);
  } catch (error) {
    if (!markForbidden(error)) {
      errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    gridRows.value = [];
    initialRows.value = [];
  } finally {
    loading.value = false;
  }
}

async function runImportJob(dryRun: boolean): Promise<CsvImportResult | null> {
  busy.value = true;
  busyLabel.value = dryRun ? t('bulkImport.validating') : t('bulkImport.importing');
  errorMessage.value = '';
  jobCancelled.value = false;
  job.value = null;
  try {
    const response = await importEntityCsv({
      entityType: 'metric',
      name: '*',
      data: changedCsv.value,
      dryRun,
      recursive: false,
    });
    if (!response.jobId) {
      throw new Error(t('bulkImport.noJobId'));
    }
    notifyCsvJobsRefresh();
    const terminal = await pollCsvAsyncJob(response.jobId, {
      onProgress: (progress) => {
        job.value = progress;
      },
      isCancelled: () => jobCancelled.value,
    });
    job.value = terminal;
    if (jobCancelled.value || terminal.status === 'CANCELLED') {
      errorMessage.value = t('bulkImport.jobCancelled');
      return null;
    }
    if (terminal.status === 'FAILED' && terminal.error) {
      errorMessage.value = terminal.error;
    }
    const result = await getCsvAsyncImportResult(response.jobId);
    if (terminal.status !== 'COMPLETED' && terminal.status !== 'FAILED') {
      errorMessage.value = t('bulkImport.jobTimeout');
      return null;
    }
    return result;
  } catch (error) {
    if (!markForbidden(error)) {
      errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    return null;
  } finally {
    busy.value = false;
  }
}

async function onValidate(): Promise<void> {
  const result = await runImportJob(true);
  if (result) {
    validationResult.value = result;
  }
}

async function onImport(): Promise<void> {
  const result = await runImportJob(false);
  if (result) {
    importResult.value = result;
    initialRows.value = gridRows.value.map((row) => [...row]);
  }
}

async function onCancelJob(): Promise<void> {
  jobCancelled.value = true;
  const current = job.value;
  if (current?.jobId) {
    try {
      await cancelCsvAsyncJob(current.jobId);
    } catch {
      // The poll loop already stops on the cancelled flag; a failed cancel
      // call must not mask the import result that may still arrive.
    }
  }
}

function onCellEdit(rowIndex: number, header: string, value: string): void {
  const col = headers.value.indexOf(header);
  if (col < 0 || !gridRows.value[rowIndex]) {
    return;
  }
  const next = gridRows.value.map((row) => [...row]);
  next[rowIndex][col] = value;
  gridRows.value = next;
}

function onBack(): void {
  void router.push({ name: 'governance-metrics' });
}

onMounted(() => {
  scope.value = scopeStore.takeScope();
  void checkPermission();
  if (isMetricWildcard.value) {
    void loadGrid();
  }
});
</script>

<template>
  <div>
    <PageHeader
      :header="t('metricBulkEdit.title')"
      :sub-header="t('metricBulkEdit.subtitle')"
    />

    <Empty v-if="!isMetricWildcard" :description="t('metricBulkEdit.metricOnly')">
      <Button type="primary" @click="onBack">{{ t('metricBulkEdit.backToMetrics') }}</Button>
    </Empty>
    <Empty v-else-if="forbidden || (permissionChecked && !canEdit)" :description="t('errors.forbidden')" />
    <template v-else>
      <Alert v-if="errorMessage" type="error" :message="errorMessage" style="margin-bottom: 16px" show-icon />
      <Alert
        v-if="docFailed"
        type="warning"
        :message="t('metricBulkEdit.docUnavailable')"
        style="margin-bottom: 16px"
        show-icon
      />
      <Card :loading="loading">
        <Space direction="vertical" style="width: 100%">
          <Typography.Text type="secondary">
            {{
              t('metricBulkEdit.loaded', {
                matched: matchedCount,
                loaded: loadedCount,
                changed: changedIndices.length,
              })
            }}
          </Typography.Text>
          <Space wrap>
            <Button
              type="primary"
              :loading="busy"
              :disabled="changedIndices.length === 0"
              data-testid="metric-bulk-edit-validate-button"
              @click="onValidate"
            >
              {{ t('bulkImport.validate') }}
            </Button>
            <Button
              type="primary"
              :loading="busy"
              :disabled="changedIndices.length === 0 || !validationResult"
              data-testid="metric-bulk-edit-import-button"
              @click="onImport"
            >
              {{ t('bulkImport.import') }}
            </Button>
            <Button v-if="busy" danger data-testid="metric-bulk-edit-cancel-job" @click="onCancelJob">
              {{ t('bulkImport.cancelJob') }}
            </Button>
            <Button @click="onBack">{{ t('metricBulkEdit.backToMetrics') }}</Button>
          </Space>
          <Typography.Text v-if="busy" type="secondary">
            {{ busyLabel }}
            <span v-if="job">
              ({{ job.status ?? '' }}
              <span v-if="job.total"> {{ job.progress ?? 0 }}/{{ job.total }} </span>)
            </span>
          </Typography.Text>
          <Typography.Text v-if="changedIndices.length === 0" type="secondary">
            {{ t('metricBulkEdit.noChanges') }}
          </Typography.Text>
          <Table
            :columns="gridColumns"
            :data-source="gridRecords"
            :pagination="{ pageSize: 15 }"
            row-key="key"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <OwnerCellEditor
                v-if="csvColumnLeaf(column.dataIndex) === 'owner' || csvColumnLeaf(column.dataIndex) === 'owners'"
                :model-value="record[column.dataIndex]"
                :test-id="`metric-bulk-edit-cell-${record.key}-${column.dataIndex}`"
                @update:model-value="(value: string) => onCellEdit(Number(record.key), column.dataIndex, value)"
              />
              <GlossaryTermCellEditor
                v-else-if="
                  csvColumnLeaf(column.dataIndex) === 'glossaryTerms' ||
                  csvColumnLeaf(column.dataIndex) === 'relatedTerms'
                "
                :model-value="record[column.dataIndex]"
                :test-id="`metric-bulk-edit-cell-${record.key}-${column.dataIndex}`"
                @update:model-value="(value: string) => onCellEdit(Number(record.key), column.dataIndex, value)"
              />
              <Input
                v-else
                :value="record[column.dataIndex]"
                :data-testid="`metric-bulk-edit-cell-${record.key}-${column.dataIndex}`"
                @change="
                  (event: Event) =>
                    onCellEdit(Number(record.key), column.dataIndex, (event.target as HTMLInputElement).value)
                "
              />
            </template>
          </Table>
          <CsvImportResultPanel
            v-if="validationResult"
            :result="validationResult"
            download-name="metric-bulk-edit-validate"
          />
          <CsvImportResultPanel
            v-if="importResult"
            :result="importResult"
            download-name="metric-bulk-edit"
          />
        </Space>
      </Card>
    </template>
  </div>
</template>
