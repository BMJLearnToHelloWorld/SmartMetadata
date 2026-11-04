<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Empty, Form, Input, Select, Space, Table, Tag, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { ApiError } from '@/api/client';
import {
  bulkUpdateColumnsAsync,
  bulkUpdateColumnsPreview,
  exportColumnsCsv,
  getColumnGrid,
  importColumnsCsv,
  type BulkColumnUpdatePreview,
  type ColumnGridGroup,
  type ColumnGridItem,
} from '@/api/columns';
import type { CsvImportResult } from '@/api/csvImport';
import CsvImportResultPanel from '@/components/shared/CsvImportResultPanel.vue';
import { downloadTextFile, normalizeCsvLineBreaks } from '@/features/csv/csv';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';

const { t } = useI18n();

/**
 * Official page shape (pages/ColumnBulkOperations/ColumnBulkOperations):
 * PageLayoutV1 with a breadcrumb, a deprecated badge (the page is
 * deprecated-but-functional upstream, so the badge is carried, not
 * dropped), the subtitle, and the ColumnGrid: a column-name search with
 * service/database/schema/entity-type/metadata-status/tag/glossary
 * filters, group rows (one per column-name + metadata group, with
 * occurrence count and expandable occurrences), per-group editing of
 * display name, description, tags and glossary terms, and a
 * bulk-update-preview step before the async bulk apply. CSV export
 * (GET /columns/export) and import (POST /columns/import, dryRun preview
 * then apply) from official rest/columnAPI follow the grid filters and
 * render the same per-row CSVImportResult echo as the bulk-import page;
 * the column import endpoint returns its result synchronously, so no
 * job polling is involved here.
 */
const PAGE_SIZE_OPTIONS = [15, 25, 50];
const ENTITY_TYPE_OPTIONS = ['table', 'dashboardDataModel'];
const METADATA_STATUS_OPTIONS = ['MISSING', 'INCOMPLETE', 'COMPLETE'];

interface GridRow extends ColumnGridGroup {
  key: string;
  columnName: string;
}

const loading = ref(false);
const errorMessage = ref('');
const forbidden = ref(false);
const items = ref<ColumnGridItem[]>([]);
const totalOccurrences = ref(0);
const totalUniqueColumns = ref(0);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const cursor = ref<CursorPager>(createCursorPager());
const pageAfter = ref<string | undefined>();

const filters = ref({
  columnNamePattern: '',
  serviceName: '',
  databaseName: '',
  schemaName: '',
  entityTypes: [] as string[],
  metadataStatus: '' as string | undefined,
  tags: '',
  glossaryTerms: '',
});

const rows = computed<GridRow[]>(() =>
  items.value.flatMap((item) =>
    item.groups.map((group) => ({
      ...group,
      key: group.groupId || `${item.columnName}:${group.displayName ?? ''}`,
      columnName: item.columnName,
    })),
  ),
);

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  forbidden.value = false;
  try {
    const page = await getColumnGrid({
      columnNamePattern: filters.value.columnNamePattern || undefined,
      serviceName: filters.value.serviceName || undefined,
      databaseName: filters.value.databaseName || undefined,
      schemaName: filters.value.schemaName || undefined,
      entityTypes: filters.value.entityTypes.length ? filters.value.entityTypes : undefined,
      metadataStatus: filters.value.metadataStatus || undefined,
      tags: splitList(filters.value.tags),
      glossaryTerms: splitList(filters.value.glossaryTerms),
      size: pageSize.value,
      cursor: cursor.value.after,
    });
    items.value = page.columns;
    totalOccurrences.value = page.totalOccurrences;
    totalUniqueColumns.value = page.totalUniqueColumns;
    pageAfter.value = page.cursor;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      forbidden.value = true;
    } else {
      errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  cursor.value = resetCursor();
  void load();
}

function onReset(): void {
  filters.value = {
    columnNamePattern: '',
    serviceName: '',
    databaseName: '',
    schemaName: '',
    entityTypes: [],
    metadataStatus: '',
    tags: '',
    glossaryTerms: '',
  };
  cursor.value = resetCursor();
  void load();
}

function onNext(): void {
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function onPageSizeChange(value: string | number): void {
  pageSize.value = Number(value);
  cursor.value = resetCursor();
  void load();
}

// Per-group edit: the edit applies to every occurrence of the group,
// which is what makes the update "bulk" (official bulkUpdateColumns
// with explicit columnUpdates, one per occurrence columnFQN).
const editing = ref<GridRow | null>(null);
const editForm = ref({ displayName: '', description: '', tags: '', glossaryTerms: '' });
const showEditModal = ref(false);
const preview = ref<BulkColumnUpdatePreview | null>(null);
const showPreviewModal = ref(false);
const applying = ref(false);
const previewing = ref(false);
const editError = ref('');

function openEdit(row: GridRow): void {
  editing.value = row;
  editForm.value = {
    displayName: row.displayName ?? '',
    description: row.description ?? '',
    tags: row.tags
      .filter((tag) => tag.source === 'Tag')
      .map((tag) => tag.tagFQN)
      .join(', '),
    glossaryTerms: row.tags
      .filter((tag) => tag.source === 'Glossary')
      .map((tag) => tag.tagFQN)
      .join(', '),
  };
  editError.value = '';
  showEditModal.value = true;
}

function buildUpdates(): Array<{
  columnFQN: string;
  entityType: string;
  displayName: string;
  description: string;
  tags: string[];
  glossaryTerms: string[];
}> {
  const row = editing.value;
  if (!row) {
    return [];
  }
  return row.occurrences.map((occurrence) => ({
    columnFQN: occurrence.columnFQN,
    entityType: occurrence.entityType,
    displayName: editForm.value.displayName,
    description: editForm.value.description,
    tags: splitList(editForm.value.tags),
    glossaryTerms: splitList(editForm.value.glossaryTerms),
  }));
}

async function onEditConfirm(): Promise<void> {
  const updates = buildUpdates();
  if (!updates.length) {
    editError.value = t('columnBulkOperations.noOccurrences');
    return;
  }
  previewing.value = true;
  editError.value = '';
  try {
    preview.value = await bulkUpdateColumnsPreview(updates);
    showEditModal.value = false;
    showPreviewModal.value = true;
  } catch (error) {
    editError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    previewing.value = false;
  }
}

async function onApply(): Promise<void> {
  const updates = buildUpdates();
  applying.value = true;
  try {
    await bulkUpdateColumnsAsync(updates);
    showPreviewModal.value = false;
    message.success(t('columnBulkOperations.applySuccess'));
    void load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    applying.value = false;
  }
}

const columns = computed(() => [
  { title: t('columnBulkOperations.columnName'), dataIndex: 'columnName', key: 'columnName' },
  { title: t('columnBulkOperations.dataType'), dataIndex: 'dataType', key: 'dataType' },
  { title: t('columnBulkOperations.displayName'), dataIndex: 'displayName', key: 'displayName' },
  { title: t('columnBulkOperations.description'), dataIndex: 'description', key: 'description', ellipsis: true },
  { title: t('columnBulkOperations.occurrences'), dataIndex: 'occurrenceCount', key: 'occurrenceCount' },
  { title: t('columnBulkOperations.metadataStatus'), dataIndex: 'metadataStatus', key: 'metadataStatus' },
  { title: t('crud.actions'), key: 'actions' },
]);

// CSV export/import (official rest/columnAPI exportColumnsCSV /
// importColumnsCSV): export downloads the current grid filters as CSV;
// import runs a dryRun preview first, then the real apply, and renders
// the synchronous CSVImportResult per row — one denied row fails inside
// the result, never the whole file.
const showImportModal = ref(false);
const importCsvContent = ref<string | null>(null);
const importFileName = ref('');
const importPreview = ref<CsvImportResult | null>(null);
const importResult = ref<CsvImportResult | null>(null);
const importStage = ref<'pick' | 'preview' | 'done'>('pick');
const importBusy = ref(false);
const importError = ref('');

function currentCsvFilters() {
  return {
    columnNamePattern: filters.value.columnNamePattern || undefined,
    serviceName: filters.value.serviceName || undefined,
    databaseName: filters.value.databaseName || undefined,
    schemaName: filters.value.schemaName || undefined,
    entityTypes: filters.value.entityTypes.length ? filters.value.entityTypes : undefined,
  };
}

function openImportModal(): void {
  showImportModal.value = true;
  importCsvContent.value = null;
  importFileName.value = '';
  importPreview.value = null;
  importResult.value = null;
  importStage.value = 'pick';
  importError.value = '';
}

async function onImportFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  importCsvContent.value = normalizeCsvLineBreaks(await file.text());
  importFileName.value = file.name;
  importError.value = '';
}

async function onImportOk(): Promise<void> {
  if (importStage.value === 'done') {
    showImportModal.value = false;
    return;
  }
  if (!importCsvContent.value) {
    importError.value = t('columnBulkOperations.importNoFile');
    return;
  }
  importBusy.value = true;
  importError.value = '';
  try {
    if (importStage.value === 'pick') {
      importPreview.value = await importColumnsCsv(importCsvContent.value, currentCsvFilters(), true);
      importStage.value = 'preview';
    } else {
      importResult.value = await importColumnsCsv(importCsvContent.value, currentCsvFilters(), false);
      importStage.value = 'done';
      message.success(t('columnBulkOperations.importApplySuccess'));
      void load();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      forbidden.value = true;
      showImportModal.value = false;
    } else {
      importError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
  } finally {
    importBusy.value = false;
  }
}

async function onExportCsv(): Promise<void> {
  try {
    const csv = await exportColumnsCsv(currentCsvFilters());
    downloadTextFile('columns.csv', csv);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      forbidden.value = true;
    } else {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div>
    <PageHeader
      :header="t('nav.columnBulkOps')"
      :sub-header="t('columnBulkOperations.subtitle')"
    />
    <Space style="margin-bottom: 16px">
      <Tag color="warning" :title="t('columnBulkOperations.deprecatedNote')">
        {{ t('columnBulkOperations.deprecated') }}
      </Tag>
      <Typography.Text type="secondary">
        {{
          t('columnBulkOperations.summary', {
            columns: totalUniqueColumns,
            occurrences: totalOccurrences,
          })
        }}
      </Typography.Text>
    </Space>

    <Card style="margin-bottom: 16px">
      <Form layout="inline">
        <Form.Item :label="t('columnBulkOperations.searchPlaceholder')">
          <Input
            v-model:value="filters.columnNamePattern"
            data-testid="column-grid-search"
            :placeholder="t('columnBulkOperations.searchPlaceholder')"
            style="width: 200px"
            @press-enter="onSearch"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.serviceName')">
          <Input v-model:value="filters.serviceName" style="width: 160px" />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.databaseName')">
          <Input v-model:value="filters.databaseName" style="width: 160px" />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.schemaName')">
          <Input v-model:value="filters.schemaName" style="width: 160px" />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.entityTypes')">
          <Select
            v-model:value="filters.entityTypes"
            mode="multiple"
            style="width: 200px"
            :options="ENTITY_TYPE_OPTIONS.map((value) => ({ value, label: value }))"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.metadataStatus')">
          <Select
            v-model:value="filters.metadataStatus"
            allow-clear
            style="width: 160px"
            :options="METADATA_STATUS_OPTIONS.map((value) => ({ value, label: value }))"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.tags')">
          <Input
            v-model:value="filters.tags"
            style="width: 200px"
            :placeholder="t('columnBulkOperations.commaSeparated')"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.glossaryTerms')">
          <Input
            v-model:value="filters.glossaryTerms"
            style="width: 200px"
            :placeholder="t('columnBulkOperations.commaSeparated')"
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" @click="onSearch">{{ t('columnBulkOperations.search') }}</Button>
            <Button @click="onReset">{{ t('columnBulkOperations.reset') }}</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>

    <Empty v-if="forbidden" :description="t('errors.forbidden')" />
    <Empty v-else-if="errorMessage" :description="errorMessage" />
    <template v-else>
    <Space style="margin-bottom: 16px">
      <Button data-testid="column-export-button" @click="onExportCsv">
        {{ t('columnBulkOperations.exportCsv') }}
      </Button>
      <Button type="primary" data-testid="column-import-button" @click="openImportModal">
        {{ t('columnBulkOperations.importCsv') }}
      </Button>
    </Space>
    <SmTable
      :columns="columns"
      :data-source="rows"
      row-key="key"
      :loading="loading"
      :pagination="false"
      :empty-text="t('columnBulkOperations.empty')"
      :expandable="{
        expandedRowRender: (record) =>
          (record as GridRow).occurrences
            .map((occurrence) => occurrence.entityDisplayName || occurrence.entityFQN || occurrence.columnFQN)
            .join(', '),
      }"
      test-id="column-grid-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'actions'">
          <Button type="link" @click="openEdit(record as GridRow)">
            {{ t('crud.edit') }}
          </Button>
        </template>
        <template v-else-if="column.key === 'metadataStatus'">
          <Tag v-if="(record as GridRow).metadataStatus">{{ (record as GridRow).metadataStatus }}</Tag>
        </template>
      </template>
    </SmTable>
    </template>

    <Space style="margin-top: 16px">
      <Button :disabled="!canGoPrev(cursor)" @click="onPrev">{{ t('columnBulkOperations.previous') }}</Button>
      <Button :disabled="!canGoNext(cursor, pageAfter)" @click="onNext">{{ t('crud.next') }}</Button>
      <Select
        :value="pageSize"
        style="width: 100px"
        :options="PAGE_SIZE_OPTIONS.map((value) => ({ value, label: String(value) }))"
        @change="onPageSizeChange"
      />
    </Space>

    <FormModal
      v-model:open="showEditModal"
      :get-container="false"
      :title="t('columnBulkOperations.editTitle')"
      :confirm-loading="previewing"
      :error="editError"
      @ok="onEditConfirm"
    >
      <Form layout="vertical">
        <Form.Item :label="t('columnBulkOperations.displayName')">
          <Input v-model:value="editForm.displayName" data-testid="column-edit-display-name" />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.description')">
          <Input.TextArea v-model:value="editForm.description" data-testid="column-edit-description" :rows="3" />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.tags')">
          <Input
            v-model:value="editForm.tags"
            data-testid="column-edit-tags"
            :placeholder="t('columnBulkOperations.commaSeparated')"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.glossaryTerms')">
          <Input
            v-model:value="editForm.glossaryTerms"
            data-testid="column-edit-glossary"
            :placeholder="t('columnBulkOperations.commaSeparated')"
          />
        </Form.Item>
        <Typography.Text type="secondary">
          {{ t('columnBulkOperations.editNote') }}
        </Typography.Text>
      </Form>
    </FormModal>

    <FormModal
      v-model:open="showPreviewModal"
      :get-container="false"
      :title="t('columnBulkOperations.previewTitle')"
      :confirm-loading="applying"
      :ok-text="t('columnBulkOperations.apply')"
      @ok="onApply"
    >
      <Typography.Paragraph>
        {{
          t('columnBulkOperations.previewSummary', {
            total: preview?.totalColumns ?? 0,
            changed: preview?.columnPreviews.filter((item) => item.hasChanges).length ?? 0,
          })
        }}
      </Typography.Paragraph>
      <Table
        :data-source="(preview?.columnPreviews ?? []).filter((item) => item.hasChanges)"
        :pagination="false"
        row-key="columnFQN"
        size="small"
      >
        <Table.Column :title="t('columnBulkOperations.columnName')" data-index="columnFQN" />
        <Table.Column :title="t('columnBulkOperations.currentDisplayName')" data-index="currentDisplayName" />
        <Table.Column :title="t('columnBulkOperations.newDisplayName')" data-index="newDisplayName" />
      </Table>
    </FormModal>

    <FormModal
      v-model:open="showImportModal"
      :get-container="false"
      :title="t('columnBulkOperations.importTitle')"
      :confirm-loading="importBusy"
      :error="importError"
      :ok-text="
        importStage === 'pick'
          ? t('columnBulkOperations.importPreview')
          : importStage === 'preview'
            ? t('columnBulkOperations.importApply')
            : t('crud.close')
      "
      @ok="onImportOk"
    >
      <Space direction="vertical" style="width: 100%">
        <Typography.Text type="secondary">{{ t('columnBulkOperations.importHint') }}</Typography.Text>
        <input
          type="file"
          accept=".csv,text/csv"
          data-testid="column-import-file-input"
          @change="onImportFileSelected"
        />
        <Typography.Text v-if="importFileName" type="secondary">{{ importFileName }}</Typography.Text>
        <CsvImportResultPanel
          v-if="importPreview && importStage !== 'done'"
          :result="importPreview"
          download-name="columns"
        />
        <CsvImportResultPanel
          v-if="importResult && importStage === 'done'"
          :result="importResult"
          download-name="columns"
        />
      </Space>
    </FormModal>
  </div>
</template>
