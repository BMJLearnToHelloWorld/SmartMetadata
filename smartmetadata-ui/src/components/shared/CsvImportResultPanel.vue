<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Space, Table, Tag, Typography } from 'ant-design-vue';
import type { CsvImportResult } from '@/api/csvImport';
import {
  classifyImportRow,
  downloadTextFile,
  rowsToRecords,
  safeFileFragment,
  summarizeImportRows,
  type ImportRowOperation,
} from '@/features/csv/csv';

const props = defineProps<{
  result: CsvImportResult;
  /** Filename for the downloaded per-row result CSV (without extension). */
  downloadName: string;
}>();

const { t } = useI18n();

const parsed = computed(() => {
  const csv = props.result.importResultsCsv ?? '';
  if (!csv.trim()) {
    return { headers: [] as string[], records: [] as Array<Record<string, string>> };
  }
  const lines = csv.split(/\r\n?|\n/).filter((line) => line.trim() !== '');
  // Reuse the record parser via a minimal split: the server result CSV is
  // machine-generated (no embedded newlines in fields), so a line split is
  // faithful here; full quoted parsing lives in features/csv for uploads.
  const rows = lines.map((line) => {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  });
  return rowsToRecords(rows);
});

const summary = computed(() => summarizeImportRows(parsed.value.records));

const operationTagColor = (operation: ImportRowOperation): string =>
  operation === 'CREATE' ? 'green' : operation === 'UPDATE' ? 'blue' : 'red';

const operationLabel = (operation: ImportRowOperation): string =>
  operation === 'CREATE'
    ? t('bulkImport.operationCreate')
    : operation === 'UPDATE'
      ? t('bulkImport.operationUpdate')
      : t('bulkImport.operationSkip');

const resultColumns = computed(() => {
  const headers = parsed.value.headers;
  return [
    ...headers.map((header) => ({ title: header, dataIndex: header, key: header, ellipsis: true })),
    { title: t('bulkImport.operation'), dataIndex: '__operation', key: '__operation' },
  ];
});

const resultRows = computed(() =>
  parsed.value.records.map((record, index) => ({
    ...record,
    key: String(index),
    __operation: classifyImportRow(record),
  })),
);

function onDownloadResult(): void {
  if (props.result.importResultsCsv) {
    downloadTextFile(`${safeFileFragment(props.downloadName)}-import-result.csv`, props.result.importResultsCsv);
  }
}
</script>

<template>
  <div>
    <Space style="margin-bottom: 12px" wrap>
      <Typography.Text type="secondary">
        {{
          t('bulkImport.resultSummary', {
            processed: result.numberOfRowsProcessed ?? resultRows.length,
            passed: result.numberOfRowsPassed ?? summary.create + summary.update,
            failed: result.numberOfRowsFailed ?? summary.skip,
          })
        }}
      </Typography.Text>
      <Tag color="green">{{ t('bulkImport.operationCreate') }}: {{ summary.create }}</Tag>
      <Tag color="blue">{{ t('bulkImport.operationUpdate') }}: {{ summary.update }}</Tag>
      <Tag color="red">{{ t('bulkImport.operationSkip') }}: {{ summary.skip }}</Tag>
      <Tag v-if="result.numberOfRowsPendingApproval">
        {{ t('bulkImport.pendingApproval') }}: {{ result.numberOfRowsPendingApproval }}
      </Tag>
    </Space>
    <Typography.Paragraph v-if="result.abortReason" type="danger">
      {{ result.abortReason }}
    </Typography.Paragraph>
    <Typography.Paragraph v-if="result.status" type="secondary">
      {{ t('bulkImport.resultStatus') }}: {{ result.status }}
      <span v-if="result.dryRun">({{ t('bulkImport.dryRun') }})</span>
    </Typography.Paragraph>
    <Table
      v-if="resultRows.length"
      :columns="resultColumns"
      :data-source="resultRows"
      :pagination="{ pageSize: 10 }"
      row-key="key"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === '__operation'">
          <Tag :color="operationTagColor(record.__operation)">
            {{ operationLabel(record.__operation) }}
          </Tag>
        </template>
      </template>
    </Table>
    <Empty v-else :description="t('bulkImport.noResultRows')" />
    <Button v-if="result.importResultsCsv" style="margin-top: 12px" @click="onDownloadResult">
      {{ t('bulkImport.downloadResult') }}
    </Button>
  </div>
</template>
