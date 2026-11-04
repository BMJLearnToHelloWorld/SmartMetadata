<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Steps,
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
import CsvImportResultPanel from '@/components/shared/CsvImportResultPanel.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import {
  classifyImportRow,
  downloadTextFile,
  normalizeCsvLineBreaks,
  parseCsv,
  rowsToRecords,
  safeFileFragment,
  stringifyCsv,
} from '@/features/csv/csv';
import { usePermissionStore } from '@/stores/permissions';

const props = defineProps<{ entityType: string; fqn: string }>();
const { t } = useI18n();
const permissionStore = usePermissionStore();

/**
 * Official page shape (pages/EntityImport/BulkEntityImportPage, route
 * /bulk/import/:entityType/:fqn): a three-step wizard — upload, preview
 * and validate, import — over the per-entity importAsync endpoint
 * (dryRun validate, then the real import), with the per-row result CSV
 * as the authoritative echo. Two product adaptations, both explicit:
 * completion is polled from /csvAsyncJobs (the product has no import-job
 * websocket channel, and official's csvAPI ships the pollable getCsvAsyncJob
 * for exactly this), and the preview grid is a plain editable table
 * (official's rich grid editors — owner dropdowns, glossary pickers,
 * metric bulk-edit scope, background jobs tray — are not ported here).
 * Per-row authorization is server-side (upstream S3): one denied row
 * fails inside the result, never the whole file, so results always render
 * per row.
 */
type Step = 0 | 1 | 2;

const step = ref<Step>(0);
const loadingDoc = ref(false);
const documentation = ref<CsvDocumentation | null>(null);
const docFailed = ref(false);

const selectedFile = ref<{ name: string; content: string; rowCount: number; sizeLabel: string } | null>(null);
const headers = ref<string[]>([]);
const gridRows = ref<string[][]>([]);
const initialCsv = ref('');
const validationResult = ref<CsvImportResult | null>(null);
const importResult = ref<CsvImportResult | null>(null);
const failedOnly = ref(false);

const busy = ref(false);
const busyLabel = ref('');
const job = ref<CsvAsyncJob | null>(null);
const jobCancelled = ref(false);
const errorMessage = ref('');
const forbidden = ref(false);

const isAdminUser = computed(() => permissionStore.isAdminUser);
const canImport = ref(true);
const permissionChecked = ref(false);

const fileSizeLabel = (bytes = 0): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  if (!bytes) {
    return `0 ${units[0]}`;
  }
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const gridRecords = computed(() =>
  gridRows.value.map((row, index) => {
    const record: Record<string, string> = { key: String(index) };
    headers.value.forEach((header, col) => {
      record[header] = row[col] ?? '';
    });
    return record;
  }),
);

const failedRowIndices = computed(() => {
  const csv = validationResult.value?.importResultsCsv ?? '';
  if (!csv.trim()) {
    return new Set<number>();
  }
  const { records } = rowsToRecords(parseCsv(csv));
  const failed = new Set<number>();
  records.forEach((record, index) => {
    if (classifyImportRow(record) === 'SKIP') {
      failed.add(index);
    }
  });
  return failed;
});

const visibleGridRecords = computed(() =>
  failedOnly.value
    ? gridRecords.value.filter((_, index) => failedRowIndices.value.has(index))
    : gridRecords.value,
);

const gridColumns = computed(() =>
  headers.value.map((header) => ({ title: header, dataIndex: header, key: header, ellipsis: true })),
);

const currentCsv = computed(() => stringifyCsv([headers.value, ...gridRows.value]));

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
    canImport.value = isAdminUser.value || flags.canEditAll;
  } catch (error) {
    // A denied permission lookup blocks entry; any other failure (unknown
    // resource for this entity kind, network) leaves the server as the
    // enforcer and surfaces as a 403 state on submit instead of a guess.
    if (error instanceof ApiError && error.status === 403) {
      canImport.value = false;
    } else {
      canImport.value = true;
    }
  } finally {
    permissionChecked.value = true;
  }
}

async function loadDocumentation(): Promise<void> {
  loadingDoc.value = true;
  docFailed.value = false;
  try {
    documentation.value = await getCsvDocumentation(props.entityType, true);
  } catch {
    documentation.value = null;
    docFailed.value = true;
  } finally {
    loadingDoc.value = false;
  }
}

function resetFlow(): void {
  selectedFile.value = null;
  headers.value = [];
  gridRows.value = [];
  initialCsv.value = '';
  validationResult.value = null;
  importResult.value = null;
  failedOnly.value = false;
  job.value = null;
  errorMessage.value = '';
  step.value = 0;
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  const content = normalizeCsvLineBreaks(await file.text());
  const parsed = parseCsv(content);
  if (parsed.length === 0) {
    errorMessage.value = t('bulkImport.emptyFile');
    return;
  }
  errorMessage.value = '';
  selectedFile.value = {
    name: file.name,
    content,
    rowCount: parsed.length - 1,
    sizeLabel: fileSizeLabel(file.size),
  };
  headers.value = parsed[0];
  gridRows.value = parsed.slice(1);
  initialCsv.value = content;
  validationResult.value = null;
  importResult.value = null;
  failedOnly.value = false;
}

function onDownloadTemplate(): void {
  const doc = documentation.value;
  if (!doc) {
    return;
  }
  const headerRow = doc.headers.map((header) => (header.required ? `${header.name}*` : header.name));
  const exampleRow = doc.headers.map((header) => header.examples?.[0] ?? '');
  downloadTextFile(
    `${safeFileFragment(props.entityType)}.csv`,
    stringifyCsv([headerRow, exampleRow]),
  );
}

async function runImportJob(dryRun: boolean): Promise<CsvImportResult | null> {
  busy.value = true;
  busyLabel.value = dryRun ? t('bulkImport.validating') : t('bulkImport.importing');
  errorMessage.value = '';
  jobCancelled.value = false;
  job.value = null;
  try {
    const response = await importEntityCsv({
      entityType: props.entityType,
      name: props.fqn,
      data: currentCsv.value,
      dryRun,
      recursive: true,
    });
    if (!response.jobId) {
      throw new Error(t('bulkImport.noJobId'));
    }
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

async function onPreview(): Promise<void> {
  if (!selectedFile.value || headers.value.length === 0) {
    return;
  }
  step.value = 1;
  const result = await runImportJob(true);
  if (result) {
    validationResult.value = result;
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
    step.value = 2;
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

function onAddRow(): void {
  gridRows.value = [...gridRows.value, headers.value.map(() => '')];
}

function onRevert(): void {
  const parsed = parseCsv(initialCsv.value);
  headers.value = parsed[0] ?? [];
  gridRows.value = parsed.slice(1);
  validationResult.value = null;
  failedOnly.value = false;
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
  step.value = step.value === 2 ? 1 : 0;
}

onMounted(() => {
  void checkPermission();
  void loadDocumentation();
});
</script>

<template>
  <div>
    <PageHeader
      :header="t('bulkImport.title')"
      :sub-header="t('bulkImport.subtitle', { entityType, fqn })"
    />

    <Empty v-if="forbidden || (permissionChecked && !canImport)" :description="t('errors.forbidden')" />
    <template v-else>
      <Steps :current="step" style="margin-bottom: 16px">
        <Steps.Step :title="t('bulkImport.stepUpload')" />
        <Steps.Step :title="t('bulkImport.stepPreview')" />
        <Steps.Step :title="t('bulkImport.stepImport')" />
      </Steps>

      <Alert v-if="errorMessage" type="error" :message="errorMessage" style="margin-bottom: 16px" show-icon />

      <!-- Step 0: upload -->
      <Card v-if="step === 0" :title="t('bulkImport.stepUpload')">
        <Space direction="vertical" style="width: 100%">
          <Typography.Text type="secondary">{{ t('bulkImport.uploadHint') }}</Typography.Text>
          <input
            type="file"
            accept=".csv,text/csv"
            data-testid="bulk-import-file-input"
            @change="onFileSelected"
          />
          <Typography.Text v-if="selectedFile" data-testid="bulk-import-file-info">
            {{
              t('bulkImport.fileInfo', {
                name: selectedFile.name,
                rows: selectedFile.rowCount,
                size: selectedFile.sizeLabel,
              })
            }}
          </Typography.Text>
          <Space>
            <Button
              type="primary"
              :disabled="!selectedFile"
              data-testid="bulk-import-preview-button"
              @click="onPreview"
            >
              {{ t('bulkImport.startPreview') }}
            </Button>
            <Button
              :disabled="!documentation"
              :loading="loadingDoc"
              data-testid="bulk-import-template-button"
              @click="onDownloadTemplate"
            >
              {{ t('bulkImport.downloadTemplate') }}
            </Button>
          </Space>
          <Typography.Text v-if="docFailed" type="secondary">
            {{ t('bulkImport.docUnavailable') }}
          </Typography.Text>
          <Table
            v-if="documentation"
            :columns="[
              { title: t('bulkImport.headerName'), dataIndex: 'name', key: 'name' },
              { title: t('bulkImport.headerRequired'), dataIndex: 'required', key: 'required' },
              { title: t('bulkImport.headerDescription'), dataIndex: 'description', key: 'description' },
            ]"
            :data-source="documentation.headers.map((h) => ({ ...h, key: h.name }))"
            :pagination="false"
            row-key="key"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'required'">
                {{ record.required ? t('bulkImport.yes') : t('bulkImport.no') }}
              </template>
            </template>
          </Table>
        </Space>
      </Card>

      <!-- Step 1: preview + validate -->
      <Card v-if="step === 1" :title="t('bulkImport.stepPreview')">
        <Space direction="vertical" style="width: 100%">
          <Space wrap>
            <Button data-testid="bulk-import-add-row" @click="onAddRow">
              {{ t('bulkImport.addRow') }}
            </Button>
            <Button data-testid="bulk-import-revert" @click="onRevert">
              {{ t('bulkImport.revert') }}
            </Button>
            <Button
              :disabled="!validationResult"
              :type="failedOnly ? 'primary' : 'default'"
              data-testid="bulk-import-failed-only"
              @click="failedOnly = !failedOnly"
            >
              {{ t('bulkImport.failedOnly') }}
            </Button>
            <Button
              type="primary"
              :loading="busy"
              data-testid="bulk-import-validate-button"
              @click="onValidate"
            >
              {{ t('bulkImport.validate') }}
            </Button>
            <Button
              type="primary"
              :loading="busy"
              :disabled="!validationResult"
              data-testid="bulk-import-import-button"
              @click="onImport"
            >
              {{ t('bulkImport.import') }}
            </Button>
            <Button v-if="busy" danger data-testid="bulk-import-cancel-job" @click="onCancelJob">
              {{ t('bulkImport.cancelJob') }}
            </Button>
            <Button @click="onBack">{{ t('bulkImport.back') }}</Button>
          </Space>
          <Typography.Text v-if="busy" type="secondary">
            {{ busyLabel }}
            <span v-if="job">
              ({{ job.status ?? '' }}
              <span v-if="job.total"> {{ job.progress ?? 0 }}/{{ job.total }} </span>)
            </span>
          </Typography.Text>
          <Table
            :columns="gridColumns"
            :data-source="visibleGridRecords"
            :pagination="{ pageSize: 15 }"
            row-key="key"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <Input
                :value="record[column.dataIndex]"
                :data-testid="`bulk-import-cell-${record.key}-${column.dataIndex}`"
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
            :download-name="`${entityType}-${fqn}`"
          />
        </Space>
      </Card>

      <!-- Step 2: import results -->
      <Card v-if="step === 2" :title="t('bulkImport.stepImport')">
        <Space direction="vertical" style="width: 100%">
          <CsvImportResultPanel
            v-if="importResult"
            :result="importResult"
            :download-name="`${entityType}-${fqn}`"
          />
          <Typography.Paragraph type="secondary">
            {{ t('bulkImport.perRowNote') }}
          </Typography.Paragraph>
          <Space>
            <Button @click="onBack">{{ t('bulkImport.back') }}</Button>
            <Button type="primary" @click="resetFlow">{{ t('bulkImport.importAnother') }}</Button>
          </Space>
        </Space>
      </Card>
    </template>
  </div>
</template>
