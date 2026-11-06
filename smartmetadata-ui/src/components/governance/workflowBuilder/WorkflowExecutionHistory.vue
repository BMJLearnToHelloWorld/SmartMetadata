<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Button, Empty, Tag, Typography } from 'ant-design-vue';
import { HistoryOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '@/api/client';
import { listWorkflowInstances, type WorkflowInstance } from '@/api/workflows';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { DEFAULT_PAGE_SIZE } from '@/features/crud/paging';
import { getWorkflowStatusMapping } from '@/constants/workflowBuilder';
import { convertMillisecondsToHumanReadableFormat } from '@/utils/workflowDateTime';

/**
 * Official WorkflowExecutionHistory (pin a3012259ca): the paginated runs
 * of one workflow — execution date, status, related entity, duration.
 * The related entity comes from the `global_relatedEntity` variable
 * (`<#E::table::fqn>`); it links when the product has a detail page for
 * that entity type, else shows the trailing name as plain text. The
 * pager reads the response's before/after cursors as offsets, page size
 * 25, and shows whenever the list is non-empty. A 403 renders the
 * forbidden card; any other load error renders an error card with a
 * retry that reads page 1 again.
 */
const props = defineProps<{
  workflowFqn?: string;
}>();

const { t } = useI18n();
const route = useRoute();

const workflowFqn = computed(
  () => props.workflowFqn ?? (route.params.fqn as string | undefined),
);
const instances = ref<WorkflowInstance[]>([]);
const loading = ref(false);
const loadError = ref<Error | undefined>(undefined);
const paging = ref<{ after?: string; before?: string; total?: number }>({
  total: 0,
});
const currentPage = ref(1);

const GLOBAL_RELATED_ENTITY_VARIABLE = 'global_relatedEntity';

/** The last segment of an FQN, keeping quoted segments together. */
function getNameFromFqn(fqn: string): string {
  const segments: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of fqn) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '.' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  segments.push(current);
  const last = segments[segments.length - 1] ?? fqn;
  return last.replace(/^"|"$/g, '');
}

function parseEntityLink(link: string): { entityType: string; fqn: string } | null {
  const match = /^<#E::([^:]+)::(.+)>$/.exec(link.trim());
  if (!match) {
    return null;
  }
  return { entityType: match[1], fqn: match[2] };
}

async function fetchExecutionHistory(offsetCursor?: string): Promise<void> {
  if (!workflowFqn.value) {
    return;
  }
  try {
    loading.value = true;
    loadError.value = undefined;
    const response = await listWorkflowInstances(workflowFqn.value, {
      limit: DEFAULT_PAGE_SIZE,
      ...(offsetCursor ? { offset: offsetCursor } : {}),
    });
    instances.value = response.data ?? [];
    paging.value = {
      after: response.after,
      before: response.before,
      total: response.total,
    };
  } catch (error) {
    loadError.value = error as Error;
    instances.value = [];
  } finally {
    loading.value = false;
  }
}

function handlePageNavigation(direction: 'before' | 'after'): void {
  currentPage.value += direction === 'after' ? 1 : -1;
  const cursor =
    direction === 'before' ? paging.value.before : paging.value.after;
  void fetchExecutionHistory(cursor ?? undefined);
}

function handleRetry(): void {
  // The retry reads the first page, so the pager must show page 1.
  currentPage.value = 1;
  void fetchExecutionHistory();
}

watch(
  workflowFqn,
  () => {
    currentPage.value = 1;
    void fetchExecutionHistory();
  },
);
onMounted(() => {
  void fetchExecutionHistory();
});

const statusMapping = computed(() => getWorkflowStatusMapping(t));

function getStatusInfo(status?: string): {
  displayLabel: string;
  tone: 'success' | 'running' | 'failed' | 'warning';
} {
  if (status && status in statusMapping.value) {
    return statusMapping.value[status];
  }
  return {
    displayLabel: status
      ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
      : t('workflows.builder.unknown'),
    tone: 'warning',
  };
}

const toneToTagColor: Record<string, string> = {
  success: 'success',
  running: 'processing',
  failed: 'error',
  warning: 'warning',
};

function formatDuration(record: WorkflowInstance): string {
  if (record.startedAt && record.endedAt) {
    return convertMillisecondsToHumanReadableFormat(
      record.endedAt - record.startedAt,
    );
  }
  if (record.startedAt && !record.endedAt) {
    return t('workflows.builder.runningEllipsis');
  }
  return '—';
}

const isEmpty = computed(() => !loading.value && instances.value.length === 0);
const isForbidden = computed(
  () => loadError.value instanceof ApiError && loadError.value.status === 403,
);

const columns = computed(() => [
  {
    title: t('workflows.builder.executionDate'),
    dataIndex: 'startedAt',
    key: 'executionDate',
  },
  {
    title: t('workflows.builder.status'),
    dataIndex: 'status',
    key: 'status',
  },
  {
    title: t('workflows.builder.entity'),
    dataIndex: 'variables',
    key: 'entity',
  },
  {
    title: t('workflows.builder.duration'),
    dataIndex: 'endedAt',
    key: 'duration',
  },
]);

interface RelatedEntity {
  kind: 'link' | 'text';
  entityType: string;
  fqn: string;
  displayName: string;
}

function relatedEntity(record: WorkflowInstance): RelatedEntity | null {
  const link = record.variables?.[GLOBAL_RELATED_ENTITY_VARIABLE] as
    | string
    | undefined;
  if (!link) {
    return null;
  }
  let parsed: { entityType: string; fqn: string } | null = null;
  try {
    parsed = parseEntityLink(link);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return null;
  }
  return {
    kind: isDetailWired(parsed.entityType) ? 'link' : 'text',
    entityType: parsed.entityType,
    fqn: parsed.fqn,
    displayName: getNameFromFqn(parsed.fqn),
  };
}
</script>

<template>
  <div
    v-if="loadError && !loading"
    style="position: relative; flex: 1; min-height: 0"
  >
    <Empty
      v-if="isForbidden"
      data-testid="workflow-execution-history-forbidden"
      :description="t('errors.forbidden')"
    />
    <SmState
      v-else
      state="error"
      :error-text="t('workflows.builder.executionHistoryFetchError')"
      :show-retry="true"
      @retry="handleRetry"
    />
  </div>
  <div
    v-else-if="!workflowFqn || isEmpty"
    data-testid="workflow-execution-history-empty"
    style="position: relative; flex: 1; min-height: 0"
  >
    <Empty :description="t('workflows.builder.noRunsRecordedYet')">
      <template #image>
        <HistoryOutlined style="font-size: 32px; color: var(--sm-text-secondary)" />
      </template>
    </Empty>
  </div>
  <div
    v-else
    data-testid="workflow-execution-history"
    style="display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden"
  >
    <div style="flex: 1; min-height: 0; overflow-y: auto">
      <SmTable
        :columns="columns"
        :data-source="instances"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'executionDate'">
            {{
              (record as WorkflowInstance).startedAt
                ? new Date((record as WorkflowInstance).startedAt as number).toLocaleString()
                : '—'
            }}
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag
              :data-testid="`workflow-status-badge-${(record as WorkflowInstance).id}`"
              :color="toneToTagColor[getStatusInfo((record as WorkflowInstance).status).tone]"
            >
              {{ getStatusInfo((record as WorkflowInstance).status).displayLabel }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'entity'">
            <RouterLink
              v-if="relatedEntity(record as WorkflowInstance)?.kind === 'link'"
              data-testid="related-entity-link"
              :title="relatedEntity(record as WorkflowInstance)!.fqn"
              :to="
                assetLocation(
                  relatedEntity(record as WorkflowInstance)!.entityType,
                  relatedEntity(record as WorkflowInstance)!.fqn,
                )
              "
            >
              {{ relatedEntity(record as WorkflowInstance)!.displayName }}
            </RouterLink>
            <Typography.Text
              v-else-if="relatedEntity(record as WorkflowInstance)?.kind === 'text'"
              data-testid="related-entity-name"
              :title="relatedEntity(record as WorkflowInstance)!.fqn"
            >
              {{ relatedEntity(record as WorkflowInstance)!.displayName }}
            </Typography.Text>
            <Typography.Text v-else data-testid="related-entity-placeholder">
              —
            </Typography.Text>
          </template>
          <template v-else-if="column.key === 'duration'">
            {{ formatDuration(record as WorkflowInstance) }}
          </template>
        </template>
      </SmTable>
    </div>
    <div
      v-if="instances.length > 0"
      style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px"
    >
      <Button :disabled="currentPage <= 1" @click="handlePageNavigation('before')">
        {{ t('crud.previous') }}
      </Button>
      <Button :disabled="!paging.after" @click="handlePageNavigation('after')">
        {{ t('crud.next') }}
      </Button>
    </div>
  </div>
</template>
