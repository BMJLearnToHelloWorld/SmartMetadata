<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Empty, Form, Input, Select, Space, Spin, Switch, Tag, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { ApiError } from '@/api/client';
import {
  bulkUpdateColumnsAsync,
  exportColumnsCsv,
  getColumnGrid,
  importColumnsCsv,
  type ColumnGridOccurrence,
  type ColumnGridTag,
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
import { SOCKET_CHANNELS, useSocketChannel } from '@/composables/useSocketChannel';
import { useSocketStore } from '@/stores/socket';
import {
  buildColumnGridRows,
  buildColumnUpdates,
  columnEntityLocation,
  entityLinkLabel,
  entityLocation,
  expandSelectionToOccurrences,
  hasEditedValues,
  tagDisplayLabel,
  type ColumnGridEditedValues,
  type ColumnGridRow,
} from './columnGridRows';

const { t } = useI18n();

/**
 * Pin model (pages/ColumnBulkOperations/ColumnBulkOperations.component.tsx
 * + ColumnGrid/ColumnGrid.component.tsx at a3012259ca; full memo in
 * ~/workspace/work/next-batch/b2/g4-colbulk/PIN-MEMO.md):
 *
 * One parent row per column name, expanded into one child row per
 * occurrence (a single-occurrence column is one flat row). Rows are
 * selectable; clicking a column name selects the row and opens the edit
 * form, whose values stage onto every selected occurrence row live
 * (edited values render in the grid, cancel discards them). Submit
 * posts the per-occurrence updates straight to bulk-update-async —
 * pin's page has no preview step — and the bulk-assets socket channel
 * drives the processed/total progress indicator until the job
 * completes, when the grid refetches. Each occurrence row links to
 * its entity detail page; the edit form shows a "View asset" link
 * (entity detail on the column's tab, #columnName) for a single
 * selection.
 *
 * Named deviations from pin, kept deliberately:
 * - CSV export/import buttons stay: pin's page has no such buttons
 *   (the API functions exist but the page never calls them), but the
 *   product buttons are working functionality and are not removed.
 * - The edit surface is the shared FormModal, not pin's FormDrawer
 *   (the product has no drawer component); semantics are pin's.
 * - Tag/glossary editing stays comma-separated FQN text inputs
 *   (pin uses pickers); no picker component is in this lane's scope.
 * - STRUCT nested children are not expanded: the product grid API
 *   mapping carries no `children` field (pin expands them).
 */
const PAGE_SIZE_OPTIONS = [15, 25, 50];
const ENTITY_TYPE_OPTIONS = ['table', 'dashboardDataModel'];
const METADATA_STATUS_OPTIONS = ['MISSING', 'INCOMPLETE', 'COMPLETE'];
/** Pin MAX_EARLY_SOCKET_MESSAGES (ColumnGrid.constants.ts). */
const MAX_EARLY_SOCKET_MESSAGES = 100;

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

// Per-occurrence staged edits, keyed by row id (pin's edited* fields on
// ColumnGridRowData). Group rows never carry edits; they select their
// occurrence rows instead.
const editedById = ref<Record<string, ColumnGridEditedValues>>({});
const expandedIds = ref(new Set<string>());
const selectedIds = ref(new Set<string>());
const viewSelectedOnly = ref(false);

const rows = computed<ColumnGridRow[]>(() =>
  buildColumnGridRows(items.value).map((row) =>
    row.kind === 'occurrence'
      ? { ...row, edited: editedById.value[row.id] }
      : row,
  ),
);
const rowById = computed(() => new Map(rows.value.map((row) => [row.id, row])));

const visibleRows = computed<ColumnGridRow[]>(() => {
  if (viewSelectedOnly.value) {
    return rows.value.filter(
      (row) => row.kind === 'occurrence' && selectedIds.value.has(row.id),
    );
  }
  return rows.value.filter((row) => {
    if (row.kind === 'group' || !row.parentId) {
      return true;
    }
    return expandedIds.value.has(row.parentId);
  });
});

const selectedOccurrences = computed<ColumnGridRow[]>(() =>
  expandSelectionToOccurrences(rows.value, selectedIds.value),
);
const selectedOccurrenceCount = computed(() => selectedOccurrences.value.length);
const hasSelection = computed(() => selectedOccurrenceCount.value > 0);
const editedCount = computed(
  () => selectedOccurrences.value.filter((row) => hasEditedValues(row)).length,
);
const singleSelectedOccurrence = computed<ColumnGridRow | null>(() =>
  selectedOccurrences.value.length === 1 ? selectedOccurrences.value[0] : null,
);

// Bulk progress (pin `bulkUpdateProgress` + `isUpdating`): set to
// { processed: 0, total } at submit, driven by the bulk-assets socket
// channel afterwards, cleared on completion / failure.
const applying = ref(false);
const bulkUpdateProgress = ref<{ processed: number; total: number } | null>(null);
const activeJobId = ref<string | null>(null);
const pendingUpdateCount = ref(0);
const earlyMessages = ref<Array<Record<string, unknown>>>([]);
const socketStore = useSocketStore();

const pendingChangesText = computed(() => {
  if (bulkUpdateProgress.value && bulkUpdateProgress.value.total > 0) {
    const processed = Math.min(
      bulkUpdateProgress.value.processed,
      bulkUpdateProgress.value.total,
    );
    return `${processed}/${bulkUpdateProgress.value.total}`;
  }
  return editedCount.value > 0
    ? `${editedCount.value}/${selectedOccurrenceCount.value || editedCount.value}`
    : '0';
});
const showBulkProgressSpinner = computed(
  () =>
    applying.value ||
    Boolean(
      bulkUpdateProgress.value &&
        bulkUpdateProgress.value.total > 0 &&
        bulkUpdateProgress.value.processed < bulkUpdateProgress.value.total,
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

function resetGridState(): void {
  selectedIds.value = new Set();
  editedById.value = {};
  expandedIds.value = new Set();
  viewSelectedOnly.value = false;
}

function onSearch(): void {
  cursor.value = resetCursor();
  resetGridState();
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
  resetGridState();
  void load();
}

function onNext(): void {
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  resetGridState();
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  resetGridState();
  void load();
}

function onPageSizeChange(value: string | number): void {
  pageSize.value = Number(value);
  cursor.value = resetCursor();
  resetGridState();
  void load();
}

// Row selection (pin `handleTableSelectionChange` / `handleGroupSelect`):
// a group id stands for all its occurrence rows, and a group id stays
// selected only while every child is selected.
function normalizeSelection(next: Set<string>): Set<string> {
  for (const row of rows.value) {
    if (row.kind !== 'group' || row.childrenIds.length === 0) {
      continue;
    }
    if (row.childrenIds.every((id) => next.has(id))) {
      next.add(row.id);
    } else {
      next.delete(row.id);
    }
  }
  return next;
}

function onSelectionChange(keys: Array<string | number>): void {
  const next = new Set(keys.map(String));
  const prev = selectedIds.value;
  for (const id of [...next]) {
    if (!prev.has(id)) {
      const row = rowById.value.get(id);
      if (row?.kind === 'group') {
        row.childrenIds.forEach((childId) => next.add(childId));
      }
    }
  }
  for (const id of [...prev]) {
    if (!next.has(id)) {
      const row = rowById.value.get(id);
      if (row?.kind === 'group') {
        row.childrenIds.forEach((childId) => next.delete(childId));
      }
    }
  }
  selectedIds.value = normalizeSelection(next);
}

const rowSelection = computed(() => ({
  selectedRowKeys: [...selectedIds.value],
  onChange: (keys: Array<string | number>) => onSelectionChange(keys),
}));

function toggleExpand(row: ColumnGridRow): void {
  const next = new Set(expandedIds.value);
  if (next.has(row.id)) {
    next.delete(row.id);
  } else {
    next.add(row.id);
  }
  expandedIds.value = next;
}

function onCancelSelection(): void {
  selectedIds.value = new Set();
  viewSelectedOnly.value = false;
}

// Per-occurrence edit: the form stages values onto every selected
// occurrence row live (pin `updateRowField` / `onDisplayNameSync` /
// `onDescriptionChange` / `onTagsUpdate`); cancel discards them.
const editForm = ref({ displayName: '', description: '', tags: '', glossaryTerms: '' });
const showEditModal = ref(false);
const editError = ref('');

const editTitle = computed(
  () => `${t('columnBulkOperations.editTitle')} (${selectedOccurrenceCount.value})`,
);

function tagsOf(row: ColumnGridRow, source: 'Tag' | 'Glossary'): string {
  const tags = (row.edited?.tags ?? row.tags).filter((tag) =>
    source === 'Glossary' ? tag.source === 'Glossary' : tag.source !== 'Glossary',
  );
  return tags.map((tag) => tag.tagFQN).join(', ');
}

function prefillEditForm(): void {
  const first = selectedOccurrences.value[0];
  if (!first) {
    return;
  }
  const single = selectedOccurrences.value.length === 1;
  editForm.value = {
    displayName: first.edited?.displayName ?? first.displayName ?? '',
    description: single ? first.edited?.description ?? first.description ?? '' : '',
    tags: single ? tagsOf(first, 'Tag') : '',
    glossaryTerms: single ? tagsOf(first, 'Glossary') : '',
  };
  editError.value = '';
}

function openEditForRow(row: ColumnGridRow): void {
  const next = new Set(selectedIds.value);
  if (row.kind === 'group') {
    next.add(row.id);
    row.childrenIds.forEach((childId) => next.add(childId));
  } else {
    next.add(row.id);
  }
  selectedIds.value = normalizeSelection(next);
  prefillEditForm();
  showEditModal.value = true;
}

function openEditForSelection(): void {
  if (!hasSelection.value) {
    return;
  }
  prefillEditForm();
  showEditModal.value = true;
}

function stageEdit(rowId: string, patch: Partial<ColumnGridEditedValues>): void {
  editedById.value[rowId] = { ...editedById.value[rowId], ...patch };
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function onDisplayNameInput(event: Event): void {
  const value = inputValue(event);
  editForm.value.displayName = value;
  for (const row of selectedOccurrences.value) {
    stageEdit(row.id, { displayName: value });
  }
}

function onDescriptionInput(event: Event): void {
  const value = inputValue(event);
  editForm.value.description = value;
  for (const row of selectedOccurrences.value) {
    stageEdit(row.id, { description: value });
  }
}

function stageTags(kind: 'tags' | 'glossaryTerms', fqns: string[]): void {
  for (const row of selectedOccurrences.value) {
    const current = row.edited?.tags ?? row.tags;
    const next: ColumnGridTag[] =
      kind === 'tags'
        ? [
            ...fqns.map((tagFQN) => ({ tagFQN, source: 'Tag' })),
            ...current.filter((tag) => tag.source === 'Glossary'),
          ]
        : [
            ...current.filter((tag) => tag.source !== 'Glossary'),
            ...fqns.map((tagFQN) => ({ tagFQN, source: 'Glossary' })),
          ];
    stageEdit(row.id, { tags: next });
  }
}

function onTagsInput(event: Event): void {
  const value = inputValue(event);
  editForm.value.tags = value;
  stageTags('tags', splitList(value));
}

function onGlossaryTermsInput(event: Event): void {
  const value = inputValue(event);
  editForm.value.glossaryTerms = value;
  stageTags('glossaryTerms', splitList(value));
}

function discardSelectedEdits(): void {
  for (const row of selectedOccurrences.value) {
    delete editedById.value[row.id];
  }
}

function onEditCancel(): void {
  discardSelectedEdits();
  showEditModal.value = false;
}

function onEditModalOpenChange(open: boolean): void {
  if (!open && showEditModal.value) {
    onEditCancel();
  }
}

// Bulk update (pin `handleBulkUpdate` :1737): per-occurrence updates,
// straight to bulk-update-async, no preview step. The POST starts the
// server job before answering, so its jobId is tracked on the
// bulk-assets socket channel; without a jobId (or without a socket)
// the grid refetches inline instead of waiting for a message that
// can never arrive.
function clearBulkUpdateJobState(): void {
  activeJobId.value = null;
  bulkUpdateProgress.value = null;
}

async function handleBulkAssetsMessage(payload: Record<string, unknown>): Promise<void> {
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : '';
  if (!activeJobId.value) {
    // Pin buffers early messages until the jobId is known (ADR
    // 2026-10-16): a small job can finish before the POST answers.
    if (bulkUpdateProgress.value && earlyMessages.value.length < MAX_EARLY_SOCKET_MESSAGES) {
      earlyMessages.value.push(payload);
    }
    return;
  }
  if (jobId !== activeJobId.value) {
    return;
  }
  const status = String(payload.status ?? '').toUpperCase();
  const total = typeof payload.total === 'number' ? payload.total : undefined;
  const progress = typeof payload.progress === 'number' ? payload.progress : undefined;
  if (status === 'STARTED') {
    const prevTotal = bulkUpdateProgress.value?.total ?? pendingUpdateCount.value;
    bulkUpdateProgress.value = { processed: 0, total: Math.max(total ?? 0, prevTotal) };
  } else if (status === 'IN_PROGRESS' || status === 'RUNNING') {
    const prev = bulkUpdateProgress.value ?? { processed: 0, total: pendingUpdateCount.value };
    const nextTotal = Math.max(progress ?? 0, total ?? 0, prev.total);
    bulkUpdateProgress.value = {
      processed: Math.min(nextTotal, Math.max(progress ?? 0, prev.processed)),
      total: nextTotal,
    };
  } else if (status === 'COMPLETED' || status === 'SUCCESS') {
    const result = (payload.result ?? {}) as Record<string, unknown>;
    const passed = typeof result.numberOfRowsPassed === 'number' ? result.numberOfRowsPassed : undefined;
    const processed = typeof result.numberOfRowsProcessed === 'number' ? result.numberOfRowsProcessed : undefined;
    const prev = bulkUpdateProgress.value ?? { processed: 0, total: pendingUpdateCount.value };
    const nextTotal = Math.max(passed ?? 0, processed ?? 0, prev.total);
    bulkUpdateProgress.value = {
      processed: Math.min(nextTotal, Math.max(passed ?? nextTotal, 0)),
      total: nextTotal,
    };
    const count = pendingUpdateCount.value;
    activeJobId.value = null;
    await load();
    if (count > 0) {
      message.success(t('columnBulkOperations.applySuccess'));
    }
    bulkUpdateProgress.value = null;
  } else if (status === 'FAILED' || status === 'FAILURE') {
    clearBulkUpdateJobState();
    message.error(t('crud.loadFailed'));
  }
}

useSocketChannel(SOCKET_CHANNELS.BULK_ASSETS, (payload) => {
  void handleBulkAssetsMessage(payload).catch(() => {
    clearBulkUpdateJobState();
    message.error(t('crud.loadFailed'));
  });
});

async function onApply(): Promise<void> {
  const updates = buildColumnUpdates(rows.value, selectedIds.value);
  if (!updates.length) {
    editError.value = t('columnBulkOperations.noChangesToSave');
    return;
  }
  editError.value = '';
  applying.value = true;
  bulkUpdateProgress.value = { processed: 0, total: updates.length };
  earlyMessages.value = [];
  try {
    const { jobId } = await bulkUpdateColumnsAsync(updates);
    const submittedCount = updates.length;
    // Pin closes the drawer and clears selection + staged edits right
    // after the POST; completion is reported by the socket channel.
    showEditModal.value = false;
    discardSelectedEdits();
    selectedIds.value = new Set();
    viewSelectedOnly.value = false;
    if (!jobId || !socketStore.socket) {
      bulkUpdateProgress.value = { processed: submittedCount, total: submittedCount };
      await load();
      message.success(t('columnBulkOperations.applySuccess'));
      bulkUpdateProgress.value = null;
    } else {
      activeJobId.value = jobId;
      pendingUpdateCount.value = submittedCount;
      const buffered = earlyMessages.value;
      earlyMessages.value = [];
      for (const bufferedMessage of buffered) {
        await handleBulkAssetsMessage(bufferedMessage);
      }
    }
  } catch (error) {
    clearBulkUpdateJobState();
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    applying.value = false;
  }
}

const columns = computed(() => [
  { title: t('columnBulkOperations.columnName'), dataIndex: 'columnName', key: 'columnName' },
  { title: t('columnBulkOperations.asset'), dataIndex: 'asset', key: 'asset' },
  { title: t('columnBulkOperations.description'), dataIndex: 'description', key: 'description', ellipsis: true },
  { title: t('columnBulkOperations.dataType'), dataIndex: 'dataType', key: 'dataType' },
  { title: t('columnBulkOperations.tags'), dataIndex: 'tags', key: 'tags' },
  { title: t('columnBulkOperations.glossaryTerms'), dataIndex: 'glossaryTerms', key: 'glossaryTerms' },
]);

function visibleTags(row: ColumnGridRow, source: 'Tag' | 'Glossary', maxVisible: number) {
  const tags = (row.edited?.tags ?? row.tags).filter((tag) =>
    source === 'Glossary' ? tag.source === 'Glossary' : tag.source !== 'Glossary',
  );
  return { visible: tags.slice(0, maxVisible), remaining: Math.max(0, tags.length - maxVisible) };
}

/** Template helpers: the asset cell only renders when the row carries an occurrence. */
function entityLocationForRow(row: ColumnGridRow) {
  return entityLocation(row.occurrence as ColumnGridOccurrence);
}

function columnEntityLocationForRow(row: ColumnGridRow) {
  return columnEntityLocation(row.occurrence as ColumnGridOccurrence);
}

function entityLinkLabelForRow(row: ColumnGridRow): string {
  return entityLinkLabel(row.occurrence as ColumnGridOccurrence);
}

// CSV export/import (kept working by lane decision; pin's page has no
// such buttons — see the named deviation in the header comment and
// PIN-MEMO.md §6. Export downloads the current grid filters as CSV;
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
      <Typography.Text type="secondary" data-testid="column-pending-changes">
        {{ t('columnBulkOperations.pendingChanges') }}: {{ pendingChangesText }}
      </Typography.Text>
      <Spin v-if="showBulkProgressSpinner" size="small" data-testid="bulk-update-progress-spinner" />
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
    <Space style="margin-bottom: 16px; margin-left: 16px">
      <Typography.Text type="secondary">
        {{ t('columnBulkOperations.viewSelected') }} ({{ selectedOccurrenceCount }})
      </Typography.Text>
      <Switch
        :checked="viewSelectedOnly"
        :disabled="!hasSelection"
        data-testid="column-view-selected-toggle"
        @change="(checked) => { viewSelectedOnly = Boolean(checked); }"
      />
      <Button
        type="primary"
        :disabled="!hasSelection"
        data-testid="column-edit-selected-button"
        @click="openEditForSelection"
      >
        {{ t('crud.edit') }}
      </Button>
      <Button
        v-if="hasSelection"
        data-testid="column-cancel-selection-button"
        @click="onCancelSelection"
      >
        {{ t('crud.cancel') }}
      </Button>
    </Space>
    <SmTable
      :columns="columns"
      :data-source="visibleRows"
      row-key="id"
      :loading="loading"
      :pagination="false"
      :empty-text="t('columnBulkOperations.empty')"
      :row-selection="rowSelection"
      test-id="column-grid-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'columnName'">
          <span
            v-if="(record as ColumnGridRow).kind === 'occurrence' && (record as ColumnGridRow).parentId"
            style="padding-left: 24px"
          >
            <Button type="link" @click="openEditForRow(record as ColumnGridRow)">
              {{ (record as ColumnGridRow).columnName }}
            </Button>
          </span>
          <span v-else-if="(record as ColumnGridRow).kind === 'group'">
            <Button type="link" @click="toggleExpand(record as ColumnGridRow)">
              {{ expandedIds.has((record as ColumnGridRow).id) ? '⌄' : '›' }}
            </Button>
            <Button type="link" @click="openEditForRow(record as ColumnGridRow)">
              {{ (record as ColumnGridRow).columnName }} ({{ (record as ColumnGridRow).occurrenceCount }})
            </Button>
          </span>
          <Button v-else type="link" @click="openEditForRow(record as ColumnGridRow)">
            {{ (record as ColumnGridRow).columnName }}
          </Button>
        </template>
        <template v-else-if="column.key === 'asset'">
          <router-link
            v-if="(record as ColumnGridRow).occurrence"
            :to="entityLocationForRow(record as ColumnGridRow)"
            data-testid="column-entity-link"
          >
            {{ entityLinkLabelForRow(record as ColumnGridRow) }}
          </router-link>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'description'">
          <span v-if="(record as ColumnGridRow).kind === 'group'">
            <template v-if="(record as ColumnGridRow).metadataStatus">
              {{ (record as ColumnGridRow).metadataStatus }}
              <template v-if="(record as ColumnGridRow).coverageTotal !== undefined">
                ({{ (record as ColumnGridRow).coverageCovered }}/{{ (record as ColumnGridRow).coverageTotal }})
              </template>
            </template>
            <span v-else>—</span>
          </span>
          <Tag
            v-else-if="(record as ColumnGridRow).edited?.description !== undefined"
            color="warning"
          >
            {{ (record as ColumnGridRow).edited?.description || '—' }}
          </Tag>
          <span v-else>{{ (record as ColumnGridRow).description || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'dataType'">
          {{ (record as ColumnGridRow).dataType || '—' }}
        </template>
        <template v-else-if="column.key === 'tags'">
          <span v-if="visibleTags(record as ColumnGridRow, 'Tag', 2).visible.length">
            <Tag
              v-for="tag in visibleTags(record as ColumnGridRow, 'Tag', 2).visible"
              :key="tag.tagFQN"
            >
              {{ tagDisplayLabel(tag) }}
            </Tag>
            <span v-if="visibleTags(record as ColumnGridRow, 'Tag', 2).remaining">
              +{{ visibleTags(record as ColumnGridRow, 'Tag', 2).remaining }}
            </span>
          </span>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'glossaryTerms'">
          <span v-if="visibleTags(record as ColumnGridRow, 'Glossary', 1).visible.length">
            <Tag
              v-for="tag in visibleTags(record as ColumnGridRow, 'Glossary', 1).visible"
              :key="tag.tagFQN"
            >
              {{ tagDisplayLabel(tag) }}
            </Tag>
            <span v-if="visibleTags(record as ColumnGridRow, 'Glossary', 1).remaining">
              +{{ visibleTags(record as ColumnGridRow, 'Glossary', 1).remaining }}
            </span>
          </span>
          <span v-else>—</span>
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
      :title="editTitle"
      :confirm-loading="applying"
      :error="editError"
      @ok="onApply"
      @cancel="onEditCancel"
      @update:open="onEditModalOpenChange"
    >
      <Form layout="vertical">
        <router-link
          v-if="singleSelectedOccurrence?.occurrence"
          :to="columnEntityLocationForRow(singleSelectedOccurrence)"
          data-testid="column-view-asset-link"
        >
          {{ t('columnBulkOperations.viewAsset') }}
        </router-link>
        <Form.Item :label="t('columnBulkOperations.displayName')">
          <Input
            :value="editForm.displayName"
            data-testid="column-edit-display-name"
            @input="onDisplayNameInput"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.description')">
          <Input.TextArea
            :value="editForm.description"
            data-testid="column-edit-description"
            :rows="3"
            @input="onDescriptionInput"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.tags')">
          <Input
            :value="editForm.tags"
            data-testid="column-edit-tags"
            :placeholder="t('columnBulkOperations.commaSeparated')"
            @input="onTagsInput"
          />
        </Form.Item>
        <Form.Item :label="t('columnBulkOperations.glossaryTerms')">
          <Input
            :value="editForm.glossaryTerms"
            data-testid="column-edit-glossary"
            :placeholder="t('columnBulkOperations.commaSeparated')"
            @input="onGlossaryTermsInput"
          />
        </Form.Item>
        <Typography.Text type="secondary">
          {{ t('columnBulkOperations.editNote') }}
        </Typography.Text>
      </Form>
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
