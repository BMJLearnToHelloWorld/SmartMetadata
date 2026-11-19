<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script lang="ts">
export interface AppRunsHistoryExposed {
  refreshAppHistory: () => void;
}
</script>

<script setup lang="ts">
import { HistoryOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { Button, Modal, Table, message } from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  fetchAppLogsRecursively,
  getApplicationRuns,
  type AppRunRecordWithId,
  type AppRunStatus,
} from '@/api/apps';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import {
  SOCKET_CHANNELS,
  mergeAppRunRecord,
  useSocketChannel,
} from '@/composables/useSocketChannel';
import { useAuthStore } from '@/stores/auth';
import type { AdminApp } from '@/types/admin';
import { INITIAL_PAGING, type Paging, type PagingHandlerParams } from '@/utils/pagination';
import { readGlobalPageSize, writeGlobalPageSize } from '@/utils/userPageSizePreference';
import AppLogViewerModal from './AppLogViewerModal.vue';
import AppLogsViewer from './AppLogsViewer.vue';
import AppSchemaForm from './AppSchemaForm.vue';
import AppStopRunModal from './AppStopRunModal.vue';
import StatusBadge from './StatusBadge.vue';
import type { JsonSchema } from './appAssets';
import {
  NO_DATA_PLACEHOLDER,
  STATUS_LABEL,
  buildSyntheticRunRecord,
  canStopAppRun,
  formatAppDateTime,
  formatDurationToHHMMSS,
  getAppRunFailureLogs,
  getEntityName,
  getEpochMillisForPastDays,
  getIntervalInMilliseconds,
  getStatusTypeForApplication,
  hasAppRunStats,
  runRowId,
  showLogAction,
} from './appUtils';

const props = withDefaults(
  defineProps<{
    appData?: AdminApp;
    maxRecords?: number;
    jsonSchema?: JsonSchema;
    showPagination?: boolean;
    onViewRunConfig?: (record: AppRunRecordWithId) => void;
    variant?: string;
  }>(),
  {
    appData: undefined,
    maxRecords: undefined,
    jsonSchema: undefined,
    showPagination: true,
    onViewRunConfig: undefined,
    variant: undefined,
  },
);

const { t } = useI18n();
const authStore = useAuthStore();

/**
 * Official AppRunsHistory (components/Settings/Applications/
 * AppRunsHistory/AppRunsHistory.component.tsx, pin a3012259ca):
 * internal apps page by offset through getApplicationRuns;
 * external apps fetch a 30-day window through the same endpoint and
 * slice to maxRecords. A synthetic current-config row stands in
 * when an internal app has no runs. Rows expand into AppLogsViewer
 * only when they carry stats; otherwise the Logs button opens the
 * failure-logs viewer, and external rows open the streamed logs
 * modal (here: the static viewer fed by the recursive log fetch,
 * since the streaming viewer is out of scope for this batch).
 * Socket updates merge by appId + startTime, keeping the row id;
 * unknown runs are never appended.
 */
const fqn = computed(() => props.appData?.fullyQualifiedName ?? '');
const isExternalApp = computed(() => props.appData?.appType === 'external');

const isLoading = ref(true);
const runs = ref<AppRunRecordWithId[]>([]);
const expandedRowKeys = ref<string[]>([]);
const logsModalRecord = ref<AppRunRecordWithId | null>(null);
const isStopModalOpen = ref(false);
const selectedRunId = ref<string | undefined>(undefined);
const showConfigModal = ref(false);
const runRecordConfig = ref<Record<string, unknown>>({});
const externalLogsOpen = ref(false);
const externalLogsLoading = ref(false);
const externalLogsText = ref('');

const currentPage = ref(1);
const pageSize = ref(readGlobalPageSize(window.localStorage, authStore.user?.name));
const paging = ref<Paging>({ ...INITIAL_PAGING });

const paginationVisible = computed(
  () =>
    Boolean(paging.value.before || paging.value.after) ||
    (paging.value.total ?? 0) > pageSize.value ||
    pageSize.value !== 15,
);

const tableData = computed<AppRunRecordWithId[]>(() => {
  if (runs.value.length > 0 || isExternalApp.value || !props.appData) {
    return runs.value;
  }
  return [buildSyntheticRunRecord(props.appData)];
});

async function fetchAppHistory(offset = 0): Promise<void> {
  try {
    isLoading.value = true;
    if (isExternalApp.value) {
      const { data } = await getApplicationRuns(fqn.value, {
        startTs: getEpochMillisForPastDays(30),
        endTs: Date.now(),
        limit: props.maxRecords ?? pageSize.value,
      });
      runs.value = data
        .map((item) => ({ ...item, id: runRowId(item) }))
        .slice(0, props.maxRecords);
    } else {
      const response = await getApplicationRuns(fqn.value, {
        offset,
        limit: props.maxRecords ?? pageSize.value,
      });
      runs.value = response.data.map((item) => ({ ...item, id: runRowId(item) }));
      // Paged is flat (data/after/before/total); build the Paging object
      // the pagination formula reads from the flat fields.
      paging.value = {
        after: response.after,
        before: response.before,
        total: response.total ?? 0,
      };
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isLoading.value = false;
  }
}

function refreshAppHistory(): void {
  void fetchAppHistory();
}

defineExpose<AppRunsHistoryExposed>({ refreshAppHistory });

function handlePageChange({ currentPage: page }: PagingHandlerParams): void {
  currentPage.value = page;
  void fetchAppHistory((page - 1) * pageSize.value);
}

function handlePageSizeChange(size: number): void {
  writeGlobalPageSize(window.localStorage, authStore.user?.name, size);
  pageSize.value = size;
  currentPage.value = 1;
}

watch(pageSize, () => {
  void fetchAppHistory();
});

onMounted(() => {
  void fetchAppHistory();
});

function handleRecordUpdate(payload: Record<string, unknown>): void {
  runs.value = mergeAppRunRecord(runs.value, payload) as AppRunRecordWithId[];
}

useSocketChannel(SOCKET_CHANNELS.SEARCH_INDEX_JOB, handleRecordUpdate);
useSocketChannel(SOCKET_CHANNELS.RDF_INDEX_JOB, handleRecordUpdate);
useSocketChannel(SOCKET_CHANNELS.DATA_INSIGHTS_JOB, handleRecordUpdate);
useSocketChannel(SOCKET_CHANNELS.CACHE_WARMUP_JOB, handleRecordUpdate);

async function openExternalLogs(record: AppRunRecordWithId): Promise<void> {
  const rawRunId = record.properties?.pipelineRunId;
  const runId = typeof rawRunId === 'string' ? rawRunId : undefined;
  externalLogsOpen.value = true;
  externalLogsLoading.value = true;
  externalLogsText.value = '';
  try {
    externalLogsText.value = await fetchAppLogsRecursively(props.appData?.name ?? '', runId);
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
    externalLogsOpen.value = false;
  } finally {
    externalLogsLoading.value = false;
  }
}

function asRunRecord(record: unknown): AppRunRecordWithId {
  return record as AppRunRecordWithId;
}

function handleRowExpandable(record: AppRunRecordWithId): void {
  if (isExternalApp.value && props.appData) {
    void openExternalLogs(record);
    return;
  }
  if (!hasAppRunStats(record)) {
    logsModalRecord.value = record;
    return;
  }
  const key = record.id;
  expandedRowKeys.value = expandedRowKeys.value.includes(key)
    ? expandedRowKeys.value.filter((item) => item !== key)
    : [...expandedRowKeys.value, key];
}

function showAppRunConfig(record: AppRunRecordWithId): void {
  if (!props.jsonSchema) {
    return;
  }
  if (props.onViewRunConfig) {
    props.onViewRunConfig(record);
    return;
  }
  showConfigModal.value = true;
  runRecordConfig.value = record.config ?? {};
}

function openStopModal(record: AppRunRecordWithId): void {
  const rawRunId = record.properties?.pipelineRunId;
  selectedRunId.value = typeof rawRunId === 'string' ? rawRunId : undefined;
  isStopModalOpen.value = true;
}

function runAt(record: AppRunRecordWithId): string {
  if (record.isSynthetic) {
    return NO_DATA_PLACEHOLDER;
  }
  return formatAppDateTime(isExternalApp.value ? record.startTime : record.timestamp);
}

function durationText(record: AppRunRecordWithId): string {
  if (record.isSynthetic) {
    return NO_DATA_PLACEHOLDER;
  }
  if (isExternalApp.value && record.executionTime) {
    return formatDurationToHHMMSS(record.executionTime);
  }
  if (record.startTime) {
    return formatDurationToHHMMSS(getIntervalInMilliseconds(record.startTime, record.endTime || Date.now()));
  }
  return NO_DATA_PLACEHOLDER;
}

const columns = computed(() => [
  { title: t('label.run-at'), dataIndex: 'timestamp', key: 'timestamp' },
  { title: t('label.run-type'), dataIndex: 'runType', key: 'runType' },
  { title: t('label.triggered-by'), dataIndex: 'triggeredBy', key: 'triggeredBy' },
  { title: t('label.duration'), dataIndex: 'executionTime', key: 'executionTime' },
  { title: t('label.status'), dataIndex: 'status', key: 'status' },
  { title: t('label.action-plural'), dataIndex: 'actions', key: 'actions' },
]);

const hasConfigSchema = computed(
  () => props.jsonSchema !== undefined && Object.keys(props.jsonSchema.properties ?? {}).length > 0,
);
</script>

<template>
  <div>
    <Table
      :columns="columns"
      data-testid="app-run-history-table"
      :data-source="tableData"
      :expanded-row-keys="expandedRowKeys"
      :loading="isLoading"
      :pagination="false"
      :row-expandable="
        (record: AppRunRecordWithId) => !showLogAction(record, isExternalApp) && hasAppRunStats(record)
      "
      row-key="id"
      :show-expand-column="false"
      size="small"
      @update:expanded-row-keys="(keys: (string | number)[]) => (expandedRowKeys = keys.map(String))"
    >
      <template #emptyText>
        <div style="position: relative; min-height: 240px">
          <NoDataPlaceholder :icon="HistoryOutlined" :title="t('message.no-data-available')" />
        </div>
      </template>
      <template #expandedRowRender="{ record }">
        <AppLogsViewer :data="asRunRecord(record)" />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'timestamp'">
          {{ runAt(asRunRecord(record)) }}
        </template>
        <template v-else-if="column.key === 'runType'">
          {{ record.isSynthetic ? NO_DATA_PLACEHOLDER : (record.runType ?? NO_DATA_PLACEHOLDER) }}
        </template>
        <template v-else-if="column.key === 'triggeredBy'">
          <UserPopOverCard
            v-if="!record.isSynthetic && record.triggeredBy"
            :profile-width="24"
            show-user-name
            :user-name="record.triggeredBy"
          />
          <span v-else>{{ NO_DATA_PLACEHOLDER }}</span>
        </template>
        <template v-else-if="column.key === 'executionTime'">
          {{ durationText(asRunRecord(record)) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusBadge
            v-if="record.status"
            data-test-id="pipeline-status"
            :label="STATUS_LABEL[record.status as AppRunStatus] ?? ''"
            :status="getStatusTypeForApplication(record.status ?? 'stopped')"
          />
          <span v-else>{{ NO_DATA_PLACEHOLDER }}</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button
            data-testid="logs"
            :disabled="showLogAction(asRunRecord(record), isExternalApp)"
            size="small"
            type="link"
            @click="handleRowExpandable(asRunRecord(record))"
          >
            {{ t('label.log-plural') }}
          </Button>
          <Button
            data-testid="app-historical-config"
            :disabled="!jsonSchema"
            size="small"
            type="link"
            @click="showAppRunConfig(asRunRecord(record))"
          >
            {{ t('label.config') }}
          </Button>
          <Button
            v-if="canStopAppRun(asRunRecord(record), appData?.supportsInterrupt)"
            data-testid="stop-button"
            size="small"
            type="link"
            @click="openStopModal(asRunRecord(record))"
          >
            {{ t('label.stop') }}
          </Button>
        </template>
      </template>
    </Table>

    <NextPrevious
      v-if="showPagination && paginationVisible"
      :current-page="currentPage"
      :is-loading="isLoading"
      :is-number-based="true"
      :page-size="pageSize"
      :paging="paging"
      :paging-handler="handlePageChange"
      :on-show-size-change="handlePageSizeChange"
    />

    <AppStopRunModal
      v-if="isStopModalOpen"
      :app-name="fqn"
      :display-name="appData?.displayName ?? ''"
      :is-modal-open="isStopModalOpen"
      :run-id="selectedRunId"
      :on-close="
        () => {
          isStopModalOpen = false;
          selectedRunId = undefined;
        }
      "
      :on-stop-workflows-update="() => fetchAppHistory()"
    />

    <AppLogViewerModal
      :logs="logsModalRecord ? getAppRunFailureLogs(logsModalRecord) : ''"
      :open="Boolean(logsModalRecord)"
      :title="t('label.log-plural')"
      :on-close="() => (logsModalRecord = null)"
    />

    <AppLogViewerModal
      :loading="externalLogsLoading"
      :logs="externalLogsText"
      :open="externalLogsOpen"
      :title="t('label.log-plural')"
      :on-close="() => (externalLogsOpen = false)"
    />

    <Modal
      :closable="false"
      :footer="null"
      :keyboard="false"
      :mask-closable="false"
      :open="showConfigModal"
      :title="t('label.entity-configuration', { entity: getEntityName(appData) || t('label.application') })"
      width="800"
      @cancel="showConfigModal = false"
    >
      <div data-testid="edit-table-type-property-modal">
        <AppSchemaForm
          v-if="hasConfigSchema"
          flat-property-layout
          :form-data="runRecordConfig"
          hide-footer
          readonly
          :schema="jsonSchema!"
          @submit="() => {}"
        />
        <div v-else style="position: relative; min-height: 240px">
          <NoDataPlaceholder
            data-testid="app-run-config-empty"
            :icon="SettingOutlined"
            :title="t('label.no-entity', { entity: t('label.configuration') })"
          />
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 16px">
          <Button data-testid="app-run-config-close" size="small" type="primary" @click="showConfigModal = false">
            {{ t('label.close') }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
