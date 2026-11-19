<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Button,
  Table,
  Tag,
  message,
  type TableColumnType,
} from 'ant-design-vue';
import type { FilterValue } from 'ant-design-vue/es/table/interface';
import {
  deployIngestionPipeline,
  getOrchestratorStatus,
  listIngestionPipelines,
} from '@/api/ingestionPipelines';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import ColumnFilter from '@/components/ingestion/ColumnFilter.vue';
import IngestionRecentRuns from '@/components/ingestion/IngestionRecentRuns.vue';
import IngestionStatusCount from '@/components/ingestion/IngestionStatusCount.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { formatBulkDeployFailureText, summarizeBulkDeploy } from '@/ingestion/bulkDeploy';
import { startCase } from '@/ingestion/ingestionSchemas';
import { getEntityTypeFromServiceCategory } from '@/ingestion/serviceCategories';
import { useCursorPaging } from '@/ingestion/useCursorPaging';
import { useAuthStore } from '@/stores/auth';
import { splitTransElement } from '@/utils/emptyPlaceholder';
import type { PagingHandlerParams } from '@/utils/pagination';
import PipelineScheduleCell from '@/views/ingestion/PipelineScheduleCell.vue';
import {
  PIPELINE_TYPES,
  type IngestionPipeline,
  type OrchestratorStatus,
} from '@/types/ingestion';

/**
 * Pin INGESTION_FRAMEWORK_DEPLOYMENT_DOCS / WORKFLOWS_METADATA_DOCS
 * (DocumentationLinksClassBase.ts:46-47): the docs base URL default
 * is https://docs.open-metadata.org/latest/.
 */
const INGESTION_FRAMEWORK_DEPLOYMENT_DOCS =
  'https://docs.open-metadata.org/latest/deployment/ingestion';
const WORKFLOWS_METADATA_DOCS =
  'https://docs.open-metadata.org/latest/connectors/ingestion/workflows/metadata';

const props = defineProps<{
  /**
   * Official IngestionPipelineList props (pin a3012259ca):
   * the ServiceCategory enum value, or 'testSuites' for the
   * data-observability tab.
   */
  serviceName: string;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const {
  paging,
  handlePagingChange,
  currentPage,
  handlePageChange,
  pageSize,
  handlePageSizeChange,
  showPagination,
  pagingCursor,
  resetPaging,
} = useCursorPaging(undefined, [15, 25, 50], {
  storage: window.localStorage,
  userName: () => auth.user?.name,
});

const pipelines = ref<IngestionPipeline[]>([]);
const loading = ref(false);
const selectedRowKeys = ref<string[]>([]);
const bulkDeploying = ref(false);
const typeFilter = ref<string[]>([]);
const orchestrator = ref<OrchestratorStatus | null>(null);
const orchestratorChecked = ref(false);
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let loadSeq = 0;

/** Pin toSortOrder: only asc/desc are accepted; anything else means no sort. */
const sortOrder = computed<'asc' | 'desc' | undefined>(() => {
  const value = route.query.sortOrder;
  return value === 'asc' ? 'asc' : value === 'desc' ? 'desc' : undefined;
});

const serviceTypeParam = computed(() =>
  props.serviceName === 'testSuites'
    ? 'testSuite'
    : getEntityTypeFromServiceCategory(props.serviceName),
);

const isPlatformDisabled = computed(() => orchestrator.value?.platform === 'disabled');
const orchestratorUnavailable = computed(
  () =>
    orchestratorChecked.value &&
    (orchestrator.value === null ||
      orchestrator.value.platform === 'disabled' ||
      orchestrator.value.code !== 200),
);

const bulkDeployDisabled = computed(
  () =>
    selectedRowKeys.value.length === 0 ||
    !orchestratorChecked.value ||
    orchestratorUnavailable.value ||
    bulkDeploying.value,
);

const typeFilterOptions = computed(() =>
  PIPELINE_TYPES.map((type) => ({ text: startCase(type), value: type })),
);

const columns = computed<TableColumnType<IngestionPipeline>[]>(() => [
  {
    title: t('crud.name'),
    dataIndex: 'name',
    key: 'name',
    sorter: true,
    sortOrder: sortOrder.value === 'asc' ? 'ascend' : sortOrder.value === 'desc' ? 'descend' : null,
  },
  {
    title: t('crud.type'),
    dataIndex: 'pipelineType',
    key: 'pipelineType',
    filters: typeFilterOptions.value,
    filteredValue: typeFilter.value,
    customFilterDropdown: true,
  },
  {
    title: t('settings.services.pipeline.countColumn'),
    key: 'count',
    width: 300,
  },
  {
    title: t('settings.services.pipeline.scheduleColumn'),
    key: 'schedule',
    width: 150,
  },
  {
    title: t('settings.services.pipeline.recentRunsColumn'),
    key: 'recentRuns',
    width: 180,
  },
  {
    title: t('settings.services.pipeline.statusColumn'),
    key: 'status',
    width: 100,
  },
]);

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: Array<string | number>) => {
    selectedRowKeys.value = keys.map((key) => String(key));
  },
  getCheckboxProps: (record: IngestionPipeline) => ({ name: record.fullyQualifiedName }),
}));

async function load(): Promise<void> {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const cursor = pagingCursor.value;
    const page = await listIngestionPipelines({
      limit: pageSize.value,
      after: cursor.cursorType === 'after' ? cursor.cursorValue : undefined,
      before: cursor.cursorType === 'before' ? cursor.cursorValue : undefined,
      serviceType: serviceTypeParam.value,
      pipelineType: typeFilter.value.length > 0 ? typeFilter.value.join(',') : undefined,
      sortField: sortOrder.value ? 'displayName' : undefined,
      sortOrder: sortOrder.value,
    });
    if (seq !== loadSeq) {
      return;
    }
    pipelines.value = page.data;
    handlePagingChange({
      after: page.after ?? '',
      before: page.before ?? '',
      total: page.total ?? 0,
    });
  } catch {
    // Silent failure (pin IngestionPipelineList.component.tsx:172-212):
    // keep the old rows, just stop loading. No toast, no clearing.
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
    }
  }
}

function resetAndReload(): void {
  const cursor = pagingCursor.value;
  const atStart = !cursor.cursorType && !cursor.cursorValue && cursor.currentPage === '1';
  resetPaging();
  if (atStart) {
    void load();
  }
}

function sameTypeFilter(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

watch(typeFilter, (next, prev) => {
  // The bulk-deploy finally clears the filter unconditionally; when
  // it was already empty the clear must not trigger a reload — T-1
  // forbids reloading after an all-failed deploy.
  if (sameTypeFilter(next, prev)) {
    return;
  }
  resetAndReload();
});

watch(pagingCursor, () => {
  void load();
});

watch(
  () => props.serviceName,
  () => {
    resetAndReload();
  },
);

watch(sortOrder, () => {
  resetAndReload();
});

function handleTableChange(
  _pagination: unknown,
  filters: Record<string, FilterValue | null>,
  sorter: { columnKey?: string | number; order?: 'ascend' | 'descend' | null } | Array<{ columnKey?: string | number; order?: 'ascend' | 'descend' | null }>,
  extra: { action: string },
): void {
  // Action separation (pin IngestionPipelineList.component.tsx:265-289):
  // a filter action only handles the filter, a sort action only the
  // sort — sorting must never clear the filter or vice versa.
  if (extra.action === 'filter') {
    const next = filters.pipelineType;
    typeFilter.value = Array.isArray(next) ? next.map(String) : [];
    return;
  }
  if (extra.action !== 'sort') {
    return;
  }
  const single = Array.isArray(sorter) ? sorter[0] : sorter;
  if (single?.columnKey !== 'name') {
    return;
  }
  const nextOrder =
    single.order === 'ascend' ? 'asc' : single.order === 'descend' ? 'desc' : undefined;
  // The sort is written to the URL first; the sortOrder watcher
  // below resets paging and reloads once the URL settles. Resetting
  // here as well would merge a second replace from the stale query
  // and drop the sortOrder write.
  void router.replace({
    query: {
      ...route.query,
      ...(nextOrder ? { sortOrder: nextOrder } : { sortOrder: undefined }),
    },
  });
}

function handlePaging(data: PagingHandlerParams): void {
  if (data.cursorType === 'after') {
    handlePageChange(data.currentPage, { cursorType: 'after', cursorValue: paging.value.after });
  } else if (data.cursorType === 'before') {
    handlePageChange(data.currentPage, { cursorType: 'before', cursorValue: paging.value.before });
  } else {
    handlePageChange(data.currentPage, { cursorType: null });
  }
}

async function onBulkDeploy(): Promise<void> {
  const targets = pipelines.value.filter((pipeline) =>
    selectedRowKeys.value.includes(pipeline.fullyQualifiedName ?? ''),
  );
  // M-7: an empty target set returns silently.
  if (targets.length === 0) {
    return;
  }
  bulkDeploying.value = true;
  try {
    const results = await Promise.all(
      targets.map((pipeline) => deployIngestionPipeline(pipeline.id)),
    );
    const summary = summarizeBulkDeploy(targets.length, results);
    if (summary.outcome === 'all-deployed') {
      message.success(t('ingestion.pipelines.bulkDeploySuccess'));
    } else if (summary.outcome === 'unverifiable') {
      message.error(t('ingestion.pipelines.actionFailed'));
    } else {
      message.error(
        formatBulkDeployFailureText(
          t('ingestion.pipelines.bulkDeployPartial', {
            deployed: summary.deployed,
            failed: summary.failed,
          }),
          summary.outcome === 'none-deployed' ? summary.sharedReason : undefined,
        ),
      );
    }
    if (summary.shouldReload) {
      reloadTimer = setTimeout(() => {
        void load();
      }, 500);
    }
  } catch (error) {
    // M-5: a throw keeps the error message, falling back to actionFailed.
    message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
  } finally {
    // The official finally: clear the type filter, the selection,
    // and the busy state together.
    typeFilter.value = [];
    selectedRowKeys.value = [];
    bulkDeploying.value = false;
  }
}

/** Empty-state description (pin getPipelineExtraInfo, default branch). */
const emptyDescription = computed(() => {
  const disabled = isPlatformDisabled.value;
  const rendered = disabled
    ? t('settings.services.pipeline.disabledDeployment', {
        link: t('settings.services.pipeline.documentationLink'),
      })
    : t('settings.services.pipeline.noIngestionDescription', {
        link: t('settings.services.pipeline.metadataAgentsLink'),
      });
  return {
    parts: splitTransElement(rendered),
    href: disabled ? INGESTION_FRAMEWORK_DEPLOYMENT_DOCS : WORKFLOWS_METADATA_DOCS,
    fallback: rendered,
  };
});

function loadOrchestratorStatus(): void {
  getOrchestratorStatus()
    .then((status) => {
      orchestrator.value = status;
    })
    .catch(() => {
      orchestrator.value = null;
    })
    .finally(() => {
      orchestratorChecked.value = true;
    });
}

onMounted(() => {
  // The list fetch is not gated on the airflow status (pin
  // IngestionPipelineList.component.tsx:244-261): both probes run.
  void load();
  loadOrchestratorStatus();
});

onUnmounted(() => {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
});
</script>

<template>
  <div>
    <AirflowMessageBanner
      :status="orchestrator"
      :checked="orchestratorChecked"
      :disabled-message="t('settings.services.pipeline.disabledFallback')"
      :unreachable-message="t('settings.services.pipeline.unreachableFallback')"
    />
    <div class="ingestion-pipeline-list__toolbar">
      <Button
        data-testid="bulk-re-deploy-button"
        :disabled="bulkDeployDisabled"
        :loading="bulkDeploying"
        @click="onBulkDeploy"
      >
        {{ t('settings.services.pipeline.reDeploy') }}
      </Button>
    </div>

    <div v-if="!loading && pipelines.length === 0" class="ingestion-pipeline-list__empty">
      <NoDataPlaceholder :title="t('settings.services.pipeline.noAgentsSetUpYet')">
        <template #description>
          <span v-if="emptyDescription.parts">
            {{ emptyDescription.parts.before }}<a
              :href="emptyDescription.href"
              target="_blank"
              rel="noreferrer"
              :aria-label="t('settings.services.pipeline.documentation')"
            >{{ emptyDescription.parts.inner }}</a>{{ emptyDescription.parts.after }}
          </span>
          <span v-else>{{ emptyDescription.fallback }}</span>
        </template>
      </NoDataPlaceholder>
    </div>

    <template v-else>
      <Table
        :columns="columns"
        :data-source="pipelines"
        :loading="loading"
        :pagination="false"
        row-key="fullyQualifiedName"
        :row-selection="rowSelection"
        data-testid="pipelines-table"
        @change="handleTableChange"
      >
        <template #customFilterDropdown="{ setSelectedKeys, selectedKeys, confirm }">
          <ColumnFilter
            :options="typeFilterOptions"
            :selected-values="(selectedKeys as string[])"
            :confirm="confirm"
            @change="setSelectedKeys($event)"
          />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ getEntityName(record as IngestionPipeline) }}
          </template>
          <template v-else-if="column.key === 'count'">
            <IngestionStatusCount
              :summary="(record as IngestionPipeline).pipelineStatuses?.[0]?.status?.[0]"
              :run-id="(record as IngestionPipeline).pipelineStatuses?.[0]?.runId"
            />
          </template>
          <template v-else-if="column.key === 'schedule'">
            <PipelineScheduleCell
              :schedule-interval="(record as IngestionPipeline).airflowConfig?.scheduleInterval"
            />
          </template>
          <template v-else-if="column.key === 'recentRuns'">
            <IngestionRecentRuns :statuses="(record as IngestionPipeline).pipelineStatuses" />
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="(record as IngestionPipeline).enabled === false ? 'default' : 'success'">
              {{
                (record as IngestionPipeline).enabled === false
                  ? t('settings.services.pipeline.statusPaused')
                  : t('settings.services.pipeline.statusActive')
              }}
            </Tag>
          </template>
        </template>
      </Table>
      <NextPrevious
        v-if="showPagination"
        :paging="paging"
        :paging-handler="handlePaging"
        :page-size="pageSize"
        :current-page="currentPage"
        :is-number-based="false"
        :is-loading="loading"
        :page-size-options="[15, 25, 50]"
        :on-show-size-change="handlePageSizeChange"
      />
    </template>
  </div>
</template>

<style scoped>
.ingestion-pipeline-list__toolbar {
  margin-bottom: 12px;
}

.ingestion-pipeline-list__empty {
  position: relative;
  min-height: 240px;
}
</style>
