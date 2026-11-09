<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Menu,
  message,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { listTestCasesBySearch } from '@/api/testCases';
import { listTestCaseIncidentsFromSearch } from '@/api/testIncidents';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import FormModal from '@/components/shared/FormModal.vue';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { entityLabel } from '@/features/crud/paging';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import {
  assigneeDisplayName,
  entityNameFromFqn,
  fetchIncidentAssignees,
  incidentStatusMenuOptions,
  mergeAssigneeCandidates,
  reopenResolvedIncident,
  resolveAssigneeRef,
  severityLevel,
  submitIncidentSeverity,
  submitIncidentStatusChange,
  tableFqnFromTestCaseFqn,
  type StatusChangeAdditionalData,
} from '@/features/quality/incidentManager';
import { useDomainStore } from '@/stores/domain';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef } from '@/types/api';
import type { IncidentStatus, TestIncident } from '@/types/quality';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();
const domainStore = useDomainStore();

/**
 * Official default page size for the incident list
 * (getListTestCaseIncidentStatusFromSearch defaults limit to 10).
 */
const PAGE_SIZE = 10;

const RESOLVE_REASONS = ['FalsePositive', 'MissingData', 'Duplicates', 'OutOfBounds', 'Other'] as const;
const SEVERITY_OPTIONS = ['Severity1', 'Severity2', 'Severity3', 'Severity4', 'Severity5'] as const;
const STATUS_OPTIONS: IncidentStatus[] = ['New', 'Ack', 'Assigned', 'Resolved'];
const DATE_FIELD_OPTIONS = ['timestamp', 'updatedAt'] as const;

interface IncidentFilters {
  testCaseFQN?: string;
  assignee?: string;
  status?: IncidentStatus;
  dateField: 'timestamp' | 'updatedAt';
  startTs?: number;
  endTs?: number;
  key?: string;
  title?: string;
}

type PermState = 'loading' | 'denied' | 'error' | 'ready';

const columns = computed(() => [
  { key: 'testCase', title: t('observability.incidents.testCaseName') },
  { key: 'table', title: t('observability.incidents.table') },
  { key: 'timestamp', title: t('observability.incidents.lastUpdated') },
  { key: 'status', title: t('crud.status') },
  { key: 'severity', title: t('observability.incidents.severity') },
  { key: 'assignee', title: t('observability.incidents.assignee') },
]);

const permState = ref<PermState>('loading');
const permError = ref('');
const loading = ref(false);
const errorMessage = ref('');
const incidents = ref<TestIncident[]>([]);
const total = ref(0);
const loadSeq = ref(0);

const testCaseOptions = ref<Array<{ value: string; label: string }>>([]);
const testCaseOptionsLoading = ref(false);
let testCaseSearchTimer: ReturnType<typeof setTimeout> | undefined;

const aggregateAssignees = ref<EntityRef[]>([]);
const assigneeCandidates = ref<EntityRef[]>([]);
const assigneeAggregateFailed = ref(false);
const selectedAssignee = ref<EntityRef[]>([]);

const rowPermissions = ref<Map<string, boolean>>(new Map());
const rowPermsLoading = ref(false);
const writingById = ref<Record<string, 'status' | 'severity' | 'assignee'>>({});

const statusModal = ref<{ record: TestIncident; mode: 'assignee' | 'resolved' } | null>(null);
const statusModalAssignee = ref<EntityRef[]>([]);
const statusModalReason = ref('');
const statusModalComment = ref('');
const statusModalSaving = ref(false);

const assigneeModal = ref<TestIncident | null>(null);
const assigneeModalSelection = ref<EntityRef[]>([]);
const assigneeModalSaving = ref(false);

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function filtersFromQuery(query: Record<string, unknown>): IncidentFilters {
  const status = queryString(query.testCaseResolutionStatusType);
  return {
    testCaseFQN: queryString(query.testCaseFQN),
    assignee: queryString(query.assignee),
    status:
      status !== undefined && STATUS_OPTIONS.includes(status as IncidentStatus)
        ? (status as IncidentStatus)
        : undefined,
    dateField: query.dateField === 'updatedAt' ? 'updatedAt' : 'timestamp',
    startTs: queryNumber(query.startTs),
    endTs: queryNumber(query.endTs),
    key: queryString(query.key),
    title: queryString(query.title),
  };
}

const filters = computed(() => filtersFromQuery(route.query as Record<string, unknown>));

const currentPage = computed(() => {
  const parsed = Number(route.query.currentPage);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
});

const hasActiveFilters = computed(() => {
  const value = filters.value;
  return (
    value.testCaseFQN !== undefined ||
    value.assignee !== undefined ||
    value.status !== undefined ||
    value.startTs !== undefined ||
    value.endTs !== undefined ||
    value.dateField === 'updatedAt'
  );
});

function filtersToQuery(value: IncidentFilters, page: number): Record<string, string> {
  const query: Record<string, string> = {};
  if (value.testCaseFQN) query.testCaseFQN = value.testCaseFQN;
  if (value.assignee) query.assignee = value.assignee;
  if (value.status) query.testCaseResolutionStatusType = value.status;
  if (value.dateField !== 'timestamp') query.dateField = value.dateField;
  if (value.startTs !== undefined) query.startTs = String(value.startTs);
  if (value.endTs !== undefined) query.endTs = String(value.endTs);
  if (value.key) query.key = value.key;
  if (value.title) query.title = value.title;
  if (page > 1) query.currentPage = String(page);
  return query;
}

/**
 * Mirrors the official updateFilters: a value change resets the page to 1,
 * re-selecting the same value keeps the page. key/title are opaque URL-passed
 * strings — they ride along untouched and are dropped only by clear-all.
 * ADR:2026-11-08-incident-date-range-key-title-are-opaque
 */
function updateFilters(patch: Partial<IncidentFilters>): void {
  const current = filters.value;
  const next = { ...current, ...patch };
  const changed = (Object.keys(patch) as Array<keyof IncidentFilters>).some(
    (key) => next[key] !== current[key],
  );
  void router.replace({ query: filtersToQuery(next, changed ? 1 : currentPage.value) });
}

function clearFilters(): void {
  void router.replace({ query: {} });
}

function onPageChange(page: number): void {
  void router.replace({ query: filtersToQuery(filters.value, page) });
}

function formatTs(value?: number): string {
  return value ? new Date(value).toISOString() : '—';
}

function testCaseFqnOf(record: TestIncident): string | undefined {
  return record.testCaseReference?.fullyQualifiedName;
}

function testCaseNameOf(record: TestIncident): string {
  const reference = record.testCaseReference;
  return (
    reference?.displayName ??
    reference?.name ??
    entityNameFromFqn(testCaseFqnOf(record)) ??
    record.id
  );
}

function tableFqnOf(record: TestIncident): string | undefined {
  return tableFqnFromTestCaseFqn(testCaseFqnOf(record));
}

function canEditRow(record: TestIncident): boolean {
  const fqn = testCaseFqnOf(record);
  return fqn !== undefined && (rowPermissions.value.get(fqn) ?? false);
}

function withSelectedTestCase(
  options: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const fqn = filters.value.testCaseFQN;
  if (fqn !== undefined && !options.some((option) => option.value === fqn)) {
    return [{ value: fqn, label: entityNameFromFqn(fqn) ?? fqn }, ...options];
  }
  return options;
}

async function searchTestCaseOptions(text: string): Promise<void> {
  testCaseOptionsLoading.value = true;
  try {
    const page = await listTestCasesBySearch({ q: text.trim() || '*', limit: 25 });
    testCaseOptions.value = withSelectedTestCase(
      page.data.map((testCase) => ({
        value: testCase.fullyQualifiedName ?? testCase.name,
        label: testCase.displayName ?? testCase.name,
      })),
    );
  } catch {
    testCaseOptions.value = withSelectedTestCase([]);
  } finally {
    testCaseOptionsLoading.value = false;
  }
}

function onTestCaseSearch(text: string): void {
  if (testCaseSearchTimer !== undefined) clearTimeout(testCaseSearchTimer);
  testCaseSearchTimer = setTimeout(() => void searchTestCaseOptions(text), 300);
}

function refreshAssigneeCandidates(): void {
  assigneeCandidates.value = mergeAssigneeCandidates(aggregateAssignees.value, incidents.value);
}

async function loadAssigneeCandidates(): Promise<void> {
  const domainFqn = domainStore.activeDomain?.fullyQualifiedName;
  try {
    aggregateAssignees.value = await fetchIncidentAssignees(domainFqn);
    assigneeAggregateFailed.value = false;
  } catch {
    // Degrade to page rows + the picker's own user/team search; the failure is
    // recorded as residual R-W2G14-6, never silently page-only without a note.
    aggregateAssignees.value = [];
    assigneeAggregateFailed.value = true;
  }
  refreshAssigneeCandidates();
}

async function loadRowPermissions(rows: TestIncident[]): Promise<void> {
  const fqns = [
    ...new Set(
      rows.map((row) => testCaseFqnOf(row)).filter((fqn): fqn is string => fqn !== undefined),
    ),
  ];
  if (fqns.length === 0) {
    rowPermissions.value = new Map();
    rowPermsLoading.value = false;
    return;
  }
  rowPermsLoading.value = true;
  try {
    const settled = await Promise.allSettled(
      fqns.map((fqn) => permissionStore.getEntityPermissionByFqn('testCase', fqn)),
    );
    const next = new Map<string, boolean>();
    settled.forEach((result, index) => {
      const fqn = fqns[index];
      if (result.status === 'fulfilled' && fqn !== undefined) {
        next.set(fqn, getDerivedPermissionFlags(result.value, false).can('EditStatus'));
      }
    });
    rowPermissions.value = next;
  } finally {
    rowPermsLoading.value = false;
  }
}

async function load(): Promise<void> {
  if (permState.value !== 'ready') return;
  const seq = ++loadSeq.value;
  loading.value = true;
  errorMessage.value = '';
  try {
    const value = filters.value;
    const page = await listTestCaseIncidentsFromSearch({
      limit: PAGE_SIZE,
      offset: (currentPage.value - 1) * PAGE_SIZE,
      latest: true,
      include: 'non-deleted',
      testCaseFQN: value.testCaseFQN,
      assignee: value.assignee,
      testCaseResolutionStatusType: value.status,
      startTs: value.startTs,
      endTs: value.endTs,
      dateField: value.dateField,
      domain: domainStore.activeDomain?.fullyQualifiedName ?? undefined,
    });
    if (seq !== loadSeq.value) return;
    incidents.value = page.data;
    total.value = page.total ?? 0;
    refreshAssigneeCandidates();
    await loadRowPermissions(page.data);
  } catch (error) {
    if (seq !== loadSeq.value) return;
    incidents.value = [];
    total.value = 0;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    if (seq === loadSeq.value) loading.value = false;
  }
}

async function checkPermission(): Promise<boolean> {
  permState.value = 'loading';
  permError.value = '';
  try {
    const operations = await permissionStore.getResourcePermission('testCase');
    const flags = getDerivedPermissionFlags(operations, false);
    const ready = permissionStore.isAdminUser || flags.hasViewAccess;
    permState.value = ready ? 'ready' : 'denied';
    return ready;
  } catch (error) {
    permState.value = 'error';
    permError.value = error instanceof Error ? error.message : t('crud.loadFailed');
    return false;
  }
}

async function loadAll(): Promise<void> {
  if (!(await checkPermission())) return;
  void searchTestCaseOptions('');
  void loadAssigneeCandidates();
  await load();
}

function openTestCase(record: TestIncident): void {
  const fqn = testCaseFqnOf(record);
  if (fqn !== undefined) {
    void router.push(`/test-case/${encodeURIComponent(fqn)}`);
    return;
  }
  const id = record.testCaseReference?.id;
  if (id !== undefined) {
    void router.push({ name: 'quality-test-case', params: { id } });
  }
}

function openTable(tableFqn: string): void {
  void router.push({
    name: 'asset',
    params: { entityType: 'table', fqn: tableFqn },
    query: { tab: 'quality' },
  });
}

/**
 * Replace the row we submitted, matched by the stateId it carried when we
 * submitted it. The read-back record may carry a different stateId — the
 * reopen-to-New path creates a fresh task, so matching the read-back's own
 * stateId would miss the row. Matching by test-case FQN is wrong: one
 * test case can have many incidents.
 * ADR:2026-11-08-incident-task-flow-reuses-resolve-task
 */
function replaceRow(record: TestIncident, latest: TestIncident): void {
  incidents.value = incidents.value.map((item) =>
    (record.stateId !== undefined && item.stateId === record.stateId) || item.id === record.id
      ? latest
      : item,
  );
}

function toastUpdateFailed(): void {
  message.error(t('observability.incidents.updateFailed'));
}

async function submitStatus(
  record: TestIncident,
  target: IncidentStatus,
  additionalData?: StatusChangeAdditionalData,
): Promise<void> {
  if (writingById.value[record.id] !== undefined) return;
  writingById.value[record.id] = 'status';
  try {
    const fqn = testCaseFqnOf(record);
    const current = record.testCaseResolutionStatusType;
    let latest: TestIncident | undefined;
    if (current === 'Resolved') {
      if (fqn === undefined) {
        message.error(t('observability.incidents.missingFqn'));
        return;
      }
      latest = await reopenResolvedIncident({
        testCaseFqn: fqn,
        testCaseName: testCaseNameOf(record),
        targetStatus: target,
        currentStateId: record.stateId,
        details: additionalData,
      });
    } else {
      latest = await submitIncidentStatusChange(record, target, additionalData);
    }
    if (latest !== undefined) replaceRow(record, latest);
  } catch {
    toastUpdateFailed();
  } finally {
    delete writingById.value[record.id];
  }
}

function onStatusMenuSelect(record: TestIncident, target: IncidentStatus): void {
  if (target === 'Assigned') {
    statusModalAssignee.value = [];
    statusModal.value = { record, mode: 'assignee' };
    return;
  }
  if (target === 'Resolved') {
    statusModalReason.value = '';
    statusModalComment.value = '';
    statusModal.value = { record, mode: 'resolved' };
    return;
  }
  void submitStatus(record, target);
}

const statusModalOkDisabled = computed(() => {
  if (statusModal.value === null) return true;
  if (statusModal.value.mode === 'assignee') return statusModalAssignee.value.length === 0;
  return statusModalReason.value === '' || statusModalComment.value.trim() === '';
});

async function onStatusModalOk(): Promise<void> {
  const modal = statusModal.value;
  if (modal === null) return;
  statusModalSaving.value = true;
  try {
    if (modal.mode === 'assignee') {
      const assignee = statusModalAssignee.value[0];
      if (assignee === undefined) return;
      await submitStatus(modal.record, 'Assigned', { assignee });
    } else {
      await submitStatus(modal.record, 'Resolved', {
        reason: statusModalReason.value,
        comment: statusModalComment.value,
      });
    }
    statusModal.value = null;
  } finally {
    statusModalSaving.value = false;
  }
}

function closeStatusModal(): void {
  statusModal.value = null;
}

async function onSeveritySelect(record: TestIncident, severity: string | undefined): Promise<void> {
  if (writingById.value[record.id] !== undefined) return;
  if (severity === record.severity) return;
  writingById.value[record.id] = 'severity';
  try {
    const ok = await submitIncidentSeverity(record, severity);
    if (!ok) {
      toastUpdateFailed();
      return;
    }
    incidents.value = incidents.value.map((item) =>
      item.id === record.id ? { ...item, severity } : item,
    );
  } finally {
    delete writingById.value[record.id];
  }
}

function openAssigneeModal(record: TestIncident): void {
  const assignee = record.testCaseResolutionStatusDetails?.assignee;
  assigneeModalSelection.value = assignee !== undefined ? [assignee] : [];
  assigneeModal.value = record;
}

function closeAssigneeModal(): void {
  assigneeModal.value = null;
}

async function onAssigneeModalOk(): Promise<void> {
  const record = assigneeModal.value;
  const assignee = assigneeModalSelection.value[0];
  if (record === null || assignee === undefined) return;
  if (writingById.value[record.id] !== undefined) return;
  assigneeModalSaving.value = true;
  writingById.value[record.id] = 'assignee';
  try {
    const latest = await submitIncidentStatusChange(record, 'Assigned', { assignee });
    if (latest !== undefined) replaceRow(record, latest);
    assigneeModal.value = null;
  } catch {
    toastUpdateFailed();
  } finally {
    assigneeModalSaving.value = false;
    delete writingById.value[record.id];
  }
}

watch(
  () => route.query,
  () => {
    if (permState.value === 'ready') void load();
  },
);

watch(
  () => domainStore.activeDomain?.fullyQualifiedName,
  () => {
    if (permState.value !== 'ready') return;
    void loadAssigneeCandidates();
    void load();
  },
);

watch(
  () => filters.value.assignee,
  async (name) => {
    if (name === undefined) {
      selectedAssignee.value = [];
      return;
    }
    selectedAssignee.value = [await resolveAssigneeRef(name)];
  },
  { immediate: true },
);

onMounted(async () => {
  await loadAll();
});

function statusMenuOptions(record: TestIncident): IncidentStatus[] {
  return incidentStatusMenuOptions(record.testCaseResolutionStatusType);
}

function severityLabel(severity: string | undefined): string {
  if (severity === undefined) return t('observability.incidents.noSeverity');
  const level = severityLevel(severity);
  return level === undefined ? severity : `${t('observability.incidents.severity')} ${level}`;
}
</script>

<template>
  <div data-testid="incidents-list-view">
    <div
      v-if="permState === 'loading'"
      data-testid="incidents-permission-loading"
    >
      <Skeleton active />
    </div>
    <div
      v-else-if="permState === 'denied'"
      data-testid="incidents-no-permission"
    >
      <Empty :description="t('observability.incidents.noPermission')" />
    </div>
    <div
      v-else-if="permState === 'error'"
      data-testid="incidents-permission-error"
    >
      <Typography.Text type="danger">{{ permError }}</Typography.Text>
      <Button
        type="primary"
        data-testid="incidents-permission-retry"
        @click="loadAll"
      >
        {{ t('shared.retry') }}
      </Button>
    </div>
    <EntityListShell
      v-else
      :title="t('observability.incidents.title')"
      :lead="t('observability.incidents.lead')"
      :loading="loading"
      :error="errorMessage"
      :columns="columns"
      :data-source="incidents"
      table-test-id="incidents-table"
      :total="total"
      numeric-paging
      :current-page="currentPage"
      :page-size="PAGE_SIZE"
      @refresh="load"
      @page-change="onPageChange"
    >
      <template #filters>
        <Space
          wrap
          data-testid="incidents-filters"
        >
          <Space
            direction="vertical"
            size="small"
          >
            <span>{{ t('observability.incidents.testCaseName') }}</span>
            <Select
              :value="filters.testCaseFQN"
              show-search
              allow-clear
              :filter-option="false"
              :loading="testCaseOptionsLoading"
              :options="testCaseOptions"
              :placeholder="t('observability.incidents.testCaseSearchPlaceholder')"
              data-testid="incident-filter-test-case"
              style="width: 240px"
              @search="onTestCaseSearch"
              @change="(value) => updateFilters({ testCaseFQN: value === undefined ? undefined : String(value) })"
            />
          </Space>
          <Space
            direction="vertical"
            size="small"
          >
            <span>{{ t('observability.incidents.assignee') }}</span>
            <UserTeamPicker
              :model-value="selectedAssignee"
              single
              :candidates="assigneeCandidates"
              data-testid="incident-filter-assignee"
              style="width: 240px"
              @update:model-value="(refs) => updateFilters({ assignee: refs[0]?.name })"
            />
          </Space>
          <Space
            direction="vertical"
            size="small"
          >
            <span>{{ t('crud.status') }}</span>
            <Select
              :value="filters.status"
              allow-clear
              :options="
                STATUS_OPTIONS.map((status) => ({
                  value: status,
                  label: incidentStatusLabel(t, status),
                }))
              "
              data-testid="incident-filter-status"
              style="width: 160px"
              @change="(value) => updateFilters({ status: value === undefined ? undefined : String(value) as IncidentStatus })"
            />
          </Space>
          <Space
            direction="vertical"
            size="small"
          >
            <span>{{ t('observability.incidents.dateField') }}</span>
            <Select
              :value="filters.dateField"
              :options="
                DATE_FIELD_OPTIONS.map((field) => ({
                  value: field,
                  label: t(`observability.incidents.${field === 'timestamp' ? 'createdAt' : 'updatedAt'}`),
                }))
              "
              data-testid="incident-filter-date-field"
              style="width: 160px"
              @change="(value) => updateFilters({ dateField: value === 'updatedAt' ? 'updatedAt' : 'timestamp' })"
            />
          </Space>
          <Space
            direction="vertical"
            size="small"
          >
            <span>{{ t('observability.incidents.dateRange') }}</span>
            <IncidentDateRangeFilter
              :start-ts="filters.startTs"
              :end-ts="filters.endTs"
              test-id="incident-filter-date-range"
              @apply="(range) => updateFilters({ startTs: range.startTs, endTs: range.endTs })"
              @clear="() => updateFilters({ startTs: undefined, endTs: undefined, key: undefined, title: undefined })"
            />
          </Space>
          <Button
            v-if="hasActiveFilters"
            data-testid="incident-clear-filters"
            @click="clearFilters"
          >
            {{ t('observability.incidents.clearAll') }}
          </Button>
        </Space>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'testCase'">
          <a
            :data-testid="`incident-row-${record.id}`"
            @click.prevent="openTestCase(record as TestIncident)"
          >
            {{ entityLabel(record.testCaseReference) || testCaseNameOf(record as TestIncident) }}
          </a>
        </template>
        <template v-else-if="column.key === 'table'">
          <a
            v-if="tableFqnOf(record as TestIncident) !== undefined"
            @click.prevent="openTable(tableFqnOf(record as TestIncident) as string)"
          >
            {{ entityNameFromFqn(tableFqnOf(record as TestIncident)) }}
          </a>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'timestamp'">
          {{ formatTs(record.timestamp) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <Skeleton
            v-if="rowPermsLoading"
            active
            :paragraph="false"
            :title="{ width: 72 }"
          />
          <Dropdown
            v-else-if="canEditRow(record as TestIncident)"
            :trigger="['click']"
            :disabled="writingById[record.id] !== undefined"
          >
            <Button
              size="small"
              :loading="writingById[record.id] === 'status'"
              :data-testid="`incident-status-${record.id}`"
            >
              {{ incidentStatusLabel(t, record.testCaseResolutionStatusType) }}
            </Button>
            <template #overlay>
              <Menu
                @click="({ key }) => onStatusMenuSelect(record as TestIncident, key as IncidentStatus)"
              >
                <Menu.Item
                  v-for="status in statusMenuOptions(record as TestIncident)"
                  :key="status"
                  :data-testid="`incident-status-option-${status}`"
                >
                  {{ incidentStatusLabel(t, status) }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
          <span v-else>
            {{ incidentStatusLabel(t, record.testCaseResolutionStatusType) }}
          </span>
        </template>
        <template v-else-if="column.key === 'severity'">
          <Skeleton
            v-if="rowPermsLoading"
            active
            :paragraph="false"
            :title="{ width: 72 }"
          />
          <Dropdown
            v-else-if="canEditRow(record as TestIncident)"
            :trigger="['click']"
            :disabled="writingById[record.id] !== undefined"
          >
            <Button
              size="small"
              :loading="writingById[record.id] === 'severity'"
              :data-testid="`incident-severity-${record.id}`"
            >
              {{ severityLabel(record.severity) }}
            </Button>
            <template #overlay>
              <Menu
                @click="({ key }) => onSeveritySelect(record as TestIncident, key === 'none' ? undefined : String(key))"
              >
                <Menu.Item
                  v-for="option in SEVERITY_OPTIONS"
                  :key="option"
                  :data-testid="`incident-severity-option-${option}`"
                >
                  {{ severityLabel(option) }}
                </Menu.Item>
                <Menu.Item
                  key="none"
                  data-testid="incident-severity-option-none"
                >
                  {{ t('observability.incidents.noSeverity') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
          <span v-else>
            {{ severityLabel(record.severity) }}
          </span>
        </template>
        <template v-else-if="column.key === 'assignee'">
          <Skeleton
            v-if="rowPermsLoading"
            active
            :paragraph="false"
            :title="{ width: 72 }"
          />
          <Space v-else>
            <span>
              {{
                assigneeDisplayName(record.testCaseResolutionStatusDetails?.assignee) ||
                t('observability.incidents.noAssignee')
              }}
            </span>
            <Button
              v-if="canEditRow(record as TestIncident)"
              size="small"
              type="text"
              :loading="writingById[record.id] === 'assignee'"
              :disabled="writingById[record.id] !== undefined"
              :data-testid="`incident-assignee-edit-${record.id}`"
              @click="openAssigneeModal(record as TestIncident)"
            >
              {{ t('crud.edit') }}
            </Button>
          </Space>
        </template>
      </template>
    </EntityListShell>

    <FormModal
      :open="statusModal !== null"
      :title="
        statusModal?.mode === 'assignee'
          ? t('observability.incidents.assignTo')
          : t('observability.incidents.resolveTitle')
      "
      :ok-disabled="statusModalOkDisabled"
      :confirm-loading="statusModalSaving"
      test-id="incident-status-modal"
      @ok="onStatusModalOk"
      @cancel="closeStatusModal"
    >
      <div v-if="statusModal?.mode === 'assignee'">
        <UserTeamPicker
          :model-value="statusModalAssignee"
          single
          :candidates="assigneeCandidates"
          data-testid="incident-status-modal-assignee"
          @update:model-value="(refs) => { statusModalAssignee = refs; }"
        />
      </div>
      <Space
        v-else-if="statusModal?.mode === 'resolved'"
        direction="vertical"
        style="width: 100%"
      >
        <Select
          :value="statusModalReason || undefined"
          :options="RESOLVE_REASONS.map((reason) => ({ value: reason, label: reason }))"
          :placeholder="t('observability.incidents.resolveReasonPlaceholder')"
          data-testid="incident-status-modal-reason"
          style="width: 100%"
          @change="(value) => { statusModalReason = value === undefined ? '' : String(value); }"
        />
        <Input.TextArea
          :value="statusModalComment"
          :placeholder="t('observability.incidents.resolveCommentPlaceholder')"
          data-testid="incident-status-modal-comment"
          :rows="3"
          @update:value="(value) => { statusModalComment = value; }"
        />
      </Space>
    </FormModal>

    <FormModal
      :open="assigneeModal !== null"
      :title="t('observability.incidents.assignTo')"
      :ok-disabled="assigneeModalSelection.length === 0"
      :confirm-loading="assigneeModalSaving"
      test-id="incident-assignee-modal"
      @ok="onAssigneeModalOk"
      @cancel="closeAssigneeModal"
    >
      <UserTeamPicker
        :model-value="assigneeModalSelection"
        single
        :candidates="assigneeCandidates"
        data-testid="incident-assignee-modal-picker"
        @update:model-value="(refs) => { assigneeModalSelection = refs; }"
      />
    </FormModal>
  </div>
</template>
