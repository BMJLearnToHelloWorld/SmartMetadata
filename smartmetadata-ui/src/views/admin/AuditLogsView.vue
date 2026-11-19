<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of pages/AuditLogsPage/AuditLogsPage.tsx (03 §11): the feed list
  replaces the product table + drawer (#6 with #18, as a pair); instant
  debounced search; the closed four-category filter set; cursor paging
  through NextPrevious; and the export modal with the dual-channel
  completion path (shared socket client + 5s polling fallback, 02
  rulings Q-01–Q-13: explicit jobId match, completion-consumed guard,
  CANCELLED ends through the poll side only).
-->
<script setup lang="ts">
import { Button, Card, Input, Modal, Progress, RangePicker, Select, Spin, Typography, Alert, message } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { asNumber, asString } from '@/api/json';
import {
  exportAuditLogs,
  getAuditLogExportJob,
  getAuditLogExportResult,
  listAuditLogs,
  type AuditLogEntry,
  type AuditLogExportJob,
} from '@/api/auditLogs';
import { searchAssets } from '@/api/search';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import {
  SOCKET_CHANNELS,
  createCompletionConsumedGuard,
  isMatchingExportJob,
  useSocketChannel,
} from '@/composables/useSocketChannel';
import {
  AUDIT_LOG_CATEGORY_LABEL_KEYS,
  AUDIT_LOG_DEFAULT_TIME_RANGE,
  AUDIT_LOG_ENTITY_TYPE_OPTIONS,
  AUDIT_LOG_TIME_FILTER_RANGE,
  CUSTOM_DATE_RANGE_KEY,
  auditLogCustomRangeLabel,
  auditLogDayRangeBounds,
  auditLogPresetRange,
  auditLogUserSearchQueryFilter,
  buildParamsFromFilters,
  type AuditLogActiveFilter,
  type AuditLogFilterCategoryType,
  type AuditLogTimeFilterValue,
} from '@/catalog/auditLogFilters';
import { CursorType, type PagingHandlerParams } from '@/utils/pagination';
import AuditLogList from './AuditLogList.vue';
import { getErrorText } from './accessApiErrors';

/** Fallback cadence for the export modal (pin EXPORT_POLL_INTERVAL_MS). */
const EXPORT_POLL_INTERVAL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;

const { t } = useI18n();

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  // The settings/access category route is a routing-line request; until
  // it exists the segment renders without a link, as in the lists.
  { label: t('label.access-control') },
  { label: t('label.audit-log-plural') },
]);

// --- List state ---------------------------------------------------------

const logs = ref<AuditLogEntry[]>([]);
const paging = ref({ after: undefined as string | undefined, before: undefined as string | undefined, total: 0 });
const currentPage = ref(1);
const isLoading = ref(false);
const pageSize = ref(25);

const searchInputValue = ref('');
const searchTerm = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const activeFilters = ref<AuditLogActiveFilter[]>([]);
const filterParams = computed(() => buildParamsFromFilters(activeFilters.value));

const hasActiveSearch = computed(() => Boolean(searchTerm.value.trim()));
const hasActiveFiltersOnly = computed(() => activeFilters.value.length > 0);
const hasActiveFilters = computed(() => hasActiveFiltersOnly.value || hasActiveSearch.value);

async function fetchLogs(options: { after?: string; before?: string } = {}): Promise<void> {
  isLoading.value = true;
  try {
    const page = await listAuditLogs({
      limit: pageSize.value,
      after: options.after,
      before: options.before,
      q: searchTerm.value || undefined,
      ...filterParams.value,
    });
    logs.value = page.data;
    paging.value = { after: page.after, before: page.before, total: page.total ?? 0 };
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    isLoading.value = false;
  }
}

function handlePaging(params: PagingHandlerParams): void {
  currentPage.value = params.currentPage;
  if (params.cursorType === CursorType.AFTER) {
    void fetchLogs({ after: paging.value.after });
  } else if (params.cursorType === CursorType.BEFORE) {
    void fetchLogs({ before: paging.value.before });
  }
}

function handlePageSizeChange(size: number): void {
  pageSize.value = size;
  currentPage.value = 1;
  void fetchLogs();
}

function handleFiltersChange(filters: AuditLogActiveFilter[]): void {
  activeFilters.value = filters;
  currentPage.value = 1;
  void fetchLogs();
}

function cancelSearchDebounce(): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function handleSearchInput(value: string): void {
  searchInputValue.value = value;
  cancelSearchDebounce();
  searchTimer = setTimeout(() => {
    searchTerm.value = value;
    currentPage.value = 1;
    void fetchLogs();
  }, SEARCH_DEBOUNCE_MS);
}

function handleClearFilters(): void {
  cancelSearchDebounce();
  activeFilters.value = [];
  searchInputValue.value = '';
  searchTerm.value = '';
  currentPage.value = 1;
  void fetchLogs();
}

function handleRemoveFilter(category: AuditLogFilterCategoryType): void {
  handleFiltersChange(activeFilters.value.filter((filter) => filter.category !== category));
}

// --- Filter controls ----------------------------------------------------

const timeFilter = computed(() =>
  activeFilters.value.find((filter) => filter.category === 'time'),
);
// Local select state: picking "custom" must reveal the range picker
// before any filter exists, so the value cannot derive from the filter
// alone; the watcher re-syncs it whenever the filter changes elsewhere
// (chip removal, clear-all, preset picks).
const timeSelectValue = ref<string | undefined>(undefined);
watch(
  timeFilter,
  (filter) => {
    if (!filter) {
      timeSelectValue.value = undefined;
      return;
    }
    const value = filter.value as AuditLogTimeFilterValue;
    timeSelectValue.value = AUDIT_LOG_TIME_FILTER_RANGE.some((row) => row.key === value.key)
      ? value.key
      : CUSTOM_DATE_RANGE_KEY;
  },
  { immediate: true },
);
const customRangeValue = computed<[Dayjs, Dayjs] | null>(() => {
  const filter = timeFilter.value;
  if (!filter) {
    return null;
  }
  const value = filter.value as AuditLogTimeFilterValue;
  if (value.key !== CUSTOM_DATE_RANGE_KEY || value.startTs === undefined || value.endTs === undefined) {
    return null;
  }
  return [dayjs(value.startTs), dayjs(value.endTs)];
});
const timeOptions = computed(() => [
  ...AUDIT_LOG_TIME_FILTER_RANGE.map((row) => ({
    value: row.key,
    label: t(row.titleKey, row.titleData ?? {}),
  })),
  { value: CUSTOM_DATE_RANGE_KEY, label: t('label.custom-range') },
]);
const defaultTimeLabel = computed(() =>
  t(AUDIT_LOG_DEFAULT_TIME_RANGE.titleKey, AUDIT_LOG_DEFAULT_TIME_RANGE.titleData ?? {}),
);

function upsertFilter(next: AuditLogActiveFilter): void {
  const existingIndex = activeFilters.value.findIndex((filter) => filter.category === next.category);
  const filters =
    existingIndex >= 0
      ? activeFilters.value.map((filter, index) => (index === existingIndex ? next : filter))
      : [...activeFilters.value, next];
  handleFiltersChange(filters);
}

function handleTimeSelect(value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  timeSelectValue.value = value;
  if (value === CUSTOM_DATE_RANGE_KEY) {
    // The range picker below applies the filter once both dates exist.
    return;
  }
  const row = AUDIT_LOG_TIME_FILTER_RANGE.find((item) => item.key === value);
  if (!row) {
    return;
  }
  const { startTs, endTs } = auditLogPresetRange(row.days);
  upsertFilter({
    category: 'time',
    value: { key: row.key, label: t(row.titleKey, row.titleData ?? {}), startTs, endTs },
  });
}

/**
 * RangePicker emits Dayjs pairs (no valueFormat is set); the declared
 * event type also allows string pairs and the clear path passes null,
 * so narrow to a Dayjs pair here and ignore anything else.
 */
function handleCustomRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null | undefined,
): void {
  if (!dates) {
    return;
  }
  const [start, end] = dates;
  if (!dayjs.isDayjs(start) || !dayjs.isDayjs(end)) {
    return;
  }
  const startDayMs = start.startOf('day').valueOf();
  const endDayMs = end.startOf('day').valueOf();
  const { startTs, endTs } = auditLogDayRangeBounds(startDayMs, endDayMs);
  upsertFilter({
    category: 'time',
    value: {
      key: CUSTOM_DATE_RANGE_KEY,
      label: auditLogCustomRangeLabel(startDayMs, endDayMs),
      startTs,
      endTs,
    },
  });
}

const optionFilterValue = (category: AuditLogFilterCategoryType) =>
  computed(() => {
    const filter = activeFilters.value.find((item) => item.category === category);
    return filter ? (filter.value as { key: string }).key : undefined;
  });
const userSelectValue = optionFilterValue('user');
const botSelectValue = optionFilterValue('bot');
const entityTypeSelectValue = optionFilterValue('entityType');

interface ActorOption {
  value: string;
  label: string;
}
const userOptions = ref<ActorOption[]>([]);
const botOptions = ref<ActorOption[]>([]);
let actorSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function runActorSearch(query: string, category: 'user' | 'bot'): Promise<void> {
  try {
    const page = await searchAssets(query, 0, 10, {
      index: 'user',
      query_filter: auditLogUserSearchQueryFilter(category === 'bot'),
    });
    const options = page.hits.map((hit) => ({
      value: hit.name,
      label: getEntityName(hit) || hit.name,
    }));
    if (category === 'user') {
      userOptions.value = options;
    } else {
      botOptions.value = options;
    }
  } catch {
    if (category === 'user') {
      userOptions.value = [];
    } else {
      botOptions.value = [];
    }
  }
}

function handleActorSearch(query: string, category: 'user' | 'bot'): void {
  if (actorSearchTimer !== undefined) {
    clearTimeout(actorSearchTimer);
  }
  actorSearchTimer = setTimeout(() => {
    void runActorSearch(query, category);
  }, SEARCH_DEBOUNCE_MS);
}

function handleActorDropdown(open: boolean, category: 'user' | 'bot'): void {
  if (open) {
    void runActorSearch('', category);
  }
}

function handleActorSelect(value: unknown, category: 'user' | 'bot'): void {
  if (value === undefined) {
    handleRemoveFilter(category);
    return;
  }
  if (typeof value !== 'string') {
    return;
  }
  const options = category === 'user' ? userOptions.value : botOptions.value;
  const label = options.find((option) => option.value === value)?.label ?? value;
  upsertFilter({ category, value: { key: value, label } });
}

function handleEntityTypeSelect(value: unknown): void {
  if (value === undefined) {
    handleRemoveFilter('entityType');
    return;
  }
  if (typeof value !== 'string') {
    return;
  }
  const label = AUDIT_LOG_ENTITY_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
  upsertFilter({ category: 'entityType', value: { key: value, label } });
}

function entityTypeFilterOption(input: string, option?: { label?: unknown }): boolean {
  return String(option?.label ?? '')
    .toLowerCase()
    .includes(input.toLowerCase());
}

function chipLabel(filter: AuditLogActiveFilter): string {
  const value = filter.value as AuditLogTimeFilterValue;
  if (filter.category === 'time' && value.key === CUSTOM_DATE_RANGE_KEY) {
    return t('label.custom-range');
  }
  return filter.value.label;
}

// --- Export ---------------------------------------------------------------

const isExportModalOpen = ref(false);
const exportDateRange = ref<[Dayjs, Dayjs] | null>(null);

/**
 * RangePicker emits Dayjs pairs (no valueFormat is set); the declared
 * event type also allows string pairs and the clear path passes null,
 * so narrow to a Dayjs pair here and reset to null for anything else
 * (the established empty state, see handleExport/handleExportModalClose).
 */
function handleExportRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null | undefined,
): void {
  if (!dates) {
    exportDateRange.value = null;
    return;
  }
  const [start, end] = dates;
  if (dayjs.isDayjs(start) && dayjs.isDayjs(end)) {
    exportDateRange.value = [start, end];
  } else {
    exportDateRange.value = null;
  }
}

const isExporting = ref(false);
const exportJob = ref<AuditLogExportJob | null>(null);
const completionGuard = createCompletionConsumedGuard();

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollGeneration = 0;

function stopPolling(): void {
  pollGeneration += 1;
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

function handleExportDownload(data: string): void {
  const element = document.createElement('a');
  const file = new Blob([data], { type: 'application/json' });
  const fileName = `audit_logs_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
  element.href = URL.createObjectURL(file);
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
  URL.revokeObjectURL(element.href);
  element.remove();
}

function completeExport(data: string): void {
  handleExportDownload(data);
  message.success(t('message.export-successful'));
  isExporting.value = false;
  isExportModalOpen.value = false;
  exportJob.value = null;
  stopPolling();
}

async function downloadExportResult(jobId: string): Promise<void> {
  try {
    completeExport(await getAuditLogExportResult(jobId));
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
    isExporting.value = false;
    stopPolling();
  }
}

function startPolling(jobId: string): void {
  stopPolling();
  const generation = pollGeneration;
  const pollOnce = async (): Promise<void> => {
    try {
      const job = await getAuditLogExportJob(jobId);
      if (generation !== pollGeneration || exportJob.value?.jobId !== jobId) {
        return;
      }
      if (job.status === 'COMPLETED') {
        if (completionGuard.consume(jobId)) {
          void downloadExportResult(jobId);
        }
        return;
      }
      if (job.status === 'FAILED' || job.status === 'CANCELLED') {
        exportJob.value = { ...job, jobId };
        isExporting.value = false;
        return;
      }
    } catch {
      // A transient failure must not end the export; the next tick retries.
    }
    if (generation === pollGeneration) {
      pollTimer = setTimeout(() => void pollOnce(), EXPORT_POLL_INTERVAL_MS);
    }
  };
  pollTimer = setTimeout(() => void pollOnce(), EXPORT_POLL_INTERVAL_MS);
}

useSocketChannel(SOCKET_CHANNELS.CSV_EXPORT, (payload) => {
  const current = exportJob.value;
  if (!current || !isMatchingExportJob(payload, current.jobId)) {
    return;
  }
  const status = asString(payload.status) || undefined;
  exportJob.value = {
    ...current,
    status,
    error: asString(payload.error) || undefined,
    message: asString(payload.message) || undefined,
    progress: asNumber(payload.progress),
    total: asNumber(payload.total),
  };
  if (status === 'COMPLETED') {
    const data = typeof payload.data === 'string' ? payload.data : null;
    if (data !== null) {
      // Old servers still carry the payload inline; honour it.
      if (current.jobId && completionGuard.consume(current.jobId)) {
        completeExport(data);
      }
    } else if (current.jobId && completionGuard.consume(current.jobId)) {
      void downloadExportResult(current.jobId);
    }
  } else if (status === 'FAILED') {
    isExporting.value = false;
    stopPolling();
  }
  // CANCELLED only updates the job; the poll tick ends the export.
});

async function handleExport(): Promise<void> {
  const range = exportDateRange.value;
  if (!range) {
    return;
  }
  completionGuard.reset();
  isExporting.value = true;
  try {
    const [start, end] = range;
    const { startTs, endTs } = auditLogDayRangeBounds(
      start.startOf('day').valueOf(),
      end.startOf('day').valueOf(),
    );
    const response = await exportAuditLogs({
      startTs,
      endTs,
      q: searchTerm.value || undefined,
      ...filterParams.value,
    });
    const job: AuditLogExportJob = { jobId: response.jobId, message: response.message };
    exportJob.value = job;
    if (job.jobId) {
      startPolling(job.jobId);
    }
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
    isExporting.value = false;
  }
}

function handleExportModalClose(): void {
  if (!isExporting.value) {
    isExportModalOpen.value = false;
    exportDateRange.value = null;
    exportJob.value = null;
    stopPolling();
  }
}

const exportProgressPercent = computed(() => {
  const job = exportJob.value;
  if (!job || job.status !== 'IN_PROGRESS') {
    return 0;
  }
  return job.total && job.total > 0 ? Math.round(((job.progress ?? 0) / job.total) * 100) : 0;
});

function disableFutureDates(current: Dayjs): boolean {
  return current > dayjs().endOf('day');
}

onMounted(() => {
  void fetchLogs();
});

onBeforeUnmount(() => {
  cancelSearchDebounce();
  if (actorSearchTimer !== undefined) {
    clearTimeout(actorSearchTimer);
  }
  stopPolling();
});
</script>

<template>
  <div data-testid="audit-logs-page">
    <SmBreadcrumb :items="breadcrumbItems" />
    <Card data-testid="audit-logs-page-header" class="audit-logs__header-card">
      <div class="audit-logs__header-row">
        <PageHeader
          :header="t('label.audit-log-plural')"
          :sub-header="t('message.page-sub-header-for-audit-logs')"
        />
        <Button
          type="primary"
          data-testid="export-audit-logs-button"
          @click="isExportModalOpen = true"
        >
          {{ t('label.export') }}
        </Button>
      </div>
    </Card>

    <Card class="audit-logs__content-card">
      <div class="audit-logs__filters-row">
        <div data-testid="audit-log-search-container">
          <Input
            :value="searchInputValue"
            :placeholder="t('label.search-audit-logs')"
            data-testid="audit-log-search"
            class="audit-logs__search"
            @update:value="handleSearchInput"
          />
        </div>
        <div data-testid="audit-log-filters" class="audit-logs__filters">
          <Select
            :value="timeSelectValue"
            :options="timeOptions"
            :placeholder="defaultTimeLabel"
            data-testid="audit-log-time-filter"
            class="audit-logs__filter"
            @change="handleTimeSelect"
          />
          <div
            v-if="timeSelectValue === CUSTOM_DATE_RANGE_KEY"
            data-testid="audit-log-custom-range"
          >
            <RangePicker
              :value="customRangeValue ?? undefined"
              class="audit-logs__filter"
              @change="handleCustomRangeChange"
            />
          </div>
          <Select
            :value="userSelectValue"
            :options="userOptions"
            show-search
            allow-clear
            :filter-option="false"
            :placeholder="t('label.user')"
            data-testid="audit-log-user-filter"
            class="audit-logs__filter"
            @search="(query) => handleActorSearch(query, 'user')"
            @dropdown-visible-change="(open) => handleActorDropdown(open, 'user')"
            @change="(value) => handleActorSelect(value, 'user')"
          />
          <Select
            :value="botSelectValue"
            :options="botOptions"
            show-search
            allow-clear
            :filter-option="false"
            :placeholder="t('label.bot')"
            data-testid="audit-log-bot-filter"
            class="audit-logs__filter"
            @search="(query) => handleActorSearch(query, 'bot')"
            @dropdown-visible-change="(open) => handleActorDropdown(open, 'bot')"
            @change="(value) => handleActorSelect(value, 'bot')"
          />
          <Select
            :value="entityTypeSelectValue"
            :options="AUDIT_LOG_ENTITY_TYPE_OPTIONS"
            show-search
            allow-clear
            :filter-option="entityTypeFilterOption"
            :placeholder="t('label.entity-type')"
            data-testid="audit-log-entity-type-filter"
            class="audit-logs__filter"
            @change="handleEntityTypeSelect"
          />
        </div>
      </div>
      <div
        v-if="hasActiveFilters"
        data-testid="filter-selection-container"
        class="audit-logs__chips"
      >
        <div class="audit-logs__chip-list">
          <span v-for="filter in activeFilters" :key="filter.category" class="audit-logs__chip">
            <span :data-testid="`filter-chip-${filter.category}`">
              <span class="audit-logs__chip-category">{{ t(AUDIT_LOG_CATEGORY_LABEL_KEYS[filter.category]) }}:</span>
              {{ ' ' }}
              <span :title="filter.value.label">{{ chipLabel(filter) }}</span>
            </span>
            <Button
              type="text"
              size="small"
              :data-testid="`remove-filter-${filter.category}`"
              :aria-label="t('label.remove')"
              @click="handleRemoveFilter(filter.category)"
            >
              ×
            </Button>
          </span>
        </div>
        <Button type="link" data-testid="clear-filters" @click="handleClearFilters">
          {{ t('label.clear-entity', { entity: t('label.all-lowercase') }) }}
        </Button>
      </div>

      <AuditLogList
        :logs="logs"
        :is-loading="isLoading"
        :has-active-search="hasActiveSearch"
        :has-active-filters="hasActiveFiltersOnly"
        :on-clear-filters="handleClearFilters"
      />

      <div v-if="logs.length > 0" class="audit-logs__pagination">
        <NextPrevious
          :paging="paging"
          :paging-handler="handlePaging"
          :page-size="pageSize"
          :current-page="currentPage"
          :is-loading="isLoading"
          :page-size-options="[15, 25, 50]"
          :on-show-size-change="handlePageSizeChange"
        />
      </div>
    </Card>
  </div>

  <Modal
    :open="isExportModalOpen"
    :title="t('label.export-entity', { entity: t('label.audit-log-plural') })"
    :ok-text="t('label.export')"
    :cancel-text="t('label.cancel')"
    :ok-button-props="{ disabled: isExporting || !exportDateRange }"
    :confirm-loading="isExporting"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    data-testid="export-audit-logs-modal"
    @ok="handleExport"
    @cancel="handleExportModalClose"
  >
    <div class="audit-logs__export-body">
      <Typography.Paragraph>{{ t('message.export-audit-logs-description') }}</Typography.Paragraph>
      <div>
        <Typography.Paragraph class="audit-logs__export-label">
          {{ t('label.date-range') }} <span class="audit-logs__required">*</span>
        </Typography.Paragraph>
        <div data-testid="export-date-range-picker">
          <RangePicker
            :value="exportDateRange ?? undefined"
            :disabled="isExporting"
            :disabled-date="disableFutureDates"
            style="width: 100%"
            @change="handleExportRangeChange"
          />
        </div>
      </div>
      <div v-if="exportJob?.status === 'IN_PROGRESS'" class="audit-logs__export-progress">
        <Progress :percent="exportProgressPercent" :show-info="false" />
        <Typography.Paragraph>{{ exportJob.message ?? t('message.exporting') }}</Typography.Paragraph>
      </div>
      <div v-if="exportJob && exportJob.status !== 'IN_PROGRESS'" class="audit-logs__export-result">
        <Spin v-if="isExporting && !exportJob.error" size="small" />
        <Alert
          :type="exportJob.error ? 'error' : 'success'"
          :message="exportJob.error ?? exportJob.message ?? ''"
          show-icon
        />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.audit-logs__header-card {
  margin-top: 4px;
  margin-bottom: 8px;
}

.audit-logs__header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.audit-logs__filters-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.audit-logs__search {
  max-width: 344px;
}

.audit-logs__filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.audit-logs__filter {
  min-width: 160px;
}

.audit-logs__chips {
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 8px;
  padding-right: 14px;
}

.audit-logs__chip-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.audit-logs__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 4px;
}

.audit-logs__chip-category {
  color: var(--sm-text-secondary);
  font-weight: 500;
}

.audit-logs__pagination {
  display: flex;
  justify-content: center;
  padding: 8px;
}

.audit-logs__export-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.audit-logs__export-label {
  margin-bottom: 8px !important;
}

.audit-logs__required {
  color: var(--sm-color-error);
}

.audit-logs__export-progress,
.audit-logs__export-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
