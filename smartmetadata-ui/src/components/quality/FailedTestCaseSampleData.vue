<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official FailedTestCaseSampleData (OSS IncidentManager).
-->
<script setup lang="ts">
import { DeleteOutlined, MoreOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Menu, Spin, Table, Typography, message } from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, RouterLink } from 'vue-router';
import AlertDeleteModal from '@/components/notifications/AlertDeleteModal.vue';
import FailedSampleDataCell from '@/components/quality/FailedSampleDataCell.vue';
import {
  deleteTestCaseFailedSampleData,
  getTestCaseFailedSampleData,
} from '@/api/testCases';
import { ApiError } from '@/api/client';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import {
  FAILED_SAMPLE_DIFF_TYPE,
  FAILED_SAMPLE_DIFF_VALUES,
  FAILED_SAMPLE_ROW_KEY,
  getSampleDataWithType,
  isFailedRowsSampleExpected,
  type FailedSampleColumn,
  type FailedSampleTableModel,
} from '@/quality/failedTestCaseSampleData.utils';
import { getColumnNameFromEntityLink } from '@/quality/testSummary.utils';
import type { TestCase } from '@/types/quality';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{
  testCase: TestCase;
}>();

const { t } = useI18n();
const route = useRoute();

const sampleData = ref<FailedSampleTableModel | undefined>();
const loading = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);

const testCaseFqn = computed(() => props.testCase.fullyQualifiedName ?? '');
const testCaseDeleted = computed(() => props.testCase.deleted === true);
const perms = useEntityPermissions('testCase', testCaseFqn, {
  enabled: computed(() => Boolean(testCaseFqn.value)),
  deleted: testCaseDeleted,
});

const isVersionPage = computed(() => typeof route.params.version === 'string' && route.params.version.length > 0);
const hasViewSampleDataPermission = computed(() => perms.can('ViewSampleData'));
const hasEditPermission = computed(() => !isVersionPage.value && perms.canEditAll.value);

const columnName = computed(() => getColumnNameFromEntityLink(props.testCase.entityLink));
const diffColumnId = computed(() => sampleData.value?.columns.find((col) => col.name === FAILED_SAMPLE_DIFF_TYPE)?.id);

const hasFailedRows = computed(() => isFailedRowsSampleExpected(props.testCase.testCaseResult));

const exploreHref = computed(() => {
  const fqn = props.testCase.fullyQualifiedName;
  if (!fqn) {
    return '';
  }
  return `/test-case/${encodeURIComponent(fqn)}/sql-query`;
});

const tableColumns = computed(() =>
  (sampleData.value?.columns ?? []).map((col) => ({
    title: col.label,
    dataIndex: col.id,
    key: col.id,
    colMeta: col,
  })),
);

const deleteMessage = computed(() =>
  t('message.delete-entity-message', { entity: t('label.sample-data') }),
);

async function fetchSample(isStale?: () => boolean): Promise<void> {
  const id = props.testCase.id;
  if (!id) {
    return;
  }
  sampleData.value = undefined;
  loading.value = true;
  try {
    const response = await getTestCaseFailedSampleData(id);
    if (!isStale?.()) {
      sampleData.value = getSampleDataWithType(response);
    }
  } catch (error) {
    if (!isStale?.()) {
      sampleData.value = undefined;
      if (!(error instanceof ApiError && error.status === 404)) {
        message.error(getErrorText(error));
      }
    }
  } finally {
    if (!isStale?.()) {
      loading.value = false;
    }
  }
}

async function handleDelete(): Promise<void> {
  const id = props.testCase.id;
  if (!id) {
    return;
  }
  deleting.value = true;
  try {
    await deleteTestCaseFailedSampleData(id);
    deleteOpen.value = false;
    await fetchSample();
  } catch (error) {
    message.error(
      getErrorText(error, t('server.delete-entity-error', { entity: t('label.sample-data') })),
    );
  } finally {
    deleting.value = false;
  }
}

function cellClass(col: FailedSampleColumn, record: Record<string, unknown>, diffColId?: string): string {
  const diffType = diffColId ? record[diffColId] : undefined;
  const isDiffCol = col.name === FAILED_SAMPLE_DIFF_TYPE;
  const isFailedCol = col.name === columnName.value;
  const classes = ['failed-sample-data-cell'];
  if (isDiffCol) {
    classes.push('failed-sample-data-cell--diff');
  }
  if (isFailedCol) {
    classes.push('failed-sample-data-column');
  }
  if (diffType === FAILED_SAMPLE_DIFF_VALUES.ADD) {
    classes.push('failed-sample-data-row--add');
  } else if (diffType === FAILED_SAMPLE_DIFF_VALUES.NOT_EQUAL) {
    classes.push('failed-sample-data-row--not-equal');
  } else if (diffType === FAILED_SAMPLE_DIFF_VALUES.REMOVE) {
    classes.push('failed-sample-data-row--remove');
  }
  return classes.join(' ');
}

function rowClass(record: Record<string, unknown>): string {
  const diffColId = diffColumnId.value;
  const diffType = diffColId ? record[diffColId] : undefined;
  if (diffType === FAILED_SAMPLE_DIFF_VALUES.ADD) {
    return 'failed-sample-data-row--add';
  }
  if (diffType === FAILED_SAMPLE_DIFF_VALUES.NOT_EQUAL) {
    return 'failed-sample-data-row--not-equal';
  }
  if (diffType === FAILED_SAMPLE_DIFF_VALUES.REMOVE) {
    return 'failed-sample-data-row--remove';
  }
  return '';
}

watch(
  () => [
    props.testCase.id,
    props.testCase.testCaseResult?.timestamp,
    props.testCase.testCaseResult?.testCaseStatus,
    props.testCase.testCaseResult?.failedRows,
    hasViewSampleDataPermission.value,
    hasFailedRows.value,
  ],
  (_value, _old, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    if (hasViewSampleDataPermission.value && hasFailedRows.value) {
      void fetchSample(() => cancelled);
    } else {
      sampleData.value = undefined;
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <template v-if="hasViewSampleDataPermission">
    <Spin v-if="loading" />
    <div v-else-if="sampleData" class="failed-sample-data" data-testid="failed-sample-data">
      <div class="failed-sample-data__header">
        <Typography.Title :level="5" class="failed-sample-data__title">
          {{ t('label.sample-data') }}
        </Typography.Title>
        <div class="failed-sample-data__actions">
          <RouterLink
            v-if="testCase.inspectionQuery && !isVersionPage && exploreHref"
            :to="exploreHref"
          >
            <Button type="primary" data-testid="explore-with-query">
              {{ t('label.explore-with-query') }}
            </Button>
          </RouterLink>
          <Dropdown v-if="hasEditPermission" :trigger="['click']">
            <Button data-testid="sample-data-manage-button" type="default">
              {{ t('label.manage-entity', { entity: t('label.sample-data') }) }}
              <MoreOutlined />
            </Button>
            <template #overlay>
              <Menu>
                <Menu.Item key="delete" data-testid="delete-button" @click="deleteOpen = true">
                  <DeleteOutlined />
                  <span class="failed-sample-data__menu-desc">
                    {{ t('message.delete-entity-type-action-description', { entityType: t('label.sample-data') }) }}
                  </span>
                  {{ t('label.delete') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </div>
      </div>
      <Table
        class="failed-sample-data__table"
        data-testid="sample-data-table"
        size="small"
        :pagination="false"
        :scroll="{ x: 'max-content' }"
        :columns="tableColumns"
        :data-source="sampleData.rows"
        :row-key="(record) => String(record[FAILED_SAMPLE_ROW_KEY])"
        :row-class-name="(_record) => rowClass(_record as Record<string, unknown>)"
      >
        <template #bodyCell="{ column, record }">
          <div
            v-if="column.colMeta"
            :class="cellClass(column.colMeta, record as Record<string, unknown>, diffColumnId)"
          >
            <Typography.Text
              v-if="column.colMeta.name === FAILED_SAMPLE_DIFF_TYPE"
              class="failed-sample-data-cell__diff-type"
            >
              {{ record[column.colMeta.id as string] }}
            </Typography.Text>
            <FailedSampleDataCell
              v-else
              :value="record[column.colMeta.id as string] as never"
            />
          </div>
        </template>
      </Table>
      <AlertDeleteModal
        :open="deleteOpen"
        :entity-title="t('label.sample-data')"
        :message="deleteMessage"
        :deleting="deleting"
        @cancel="deleteOpen = false"
        @confirm="void handleDelete()"
      />
    </div>
  </template>
</template>

<style scoped>
.failed-sample-data {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.failed-sample-data__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.failed-sample-data__title {
  margin: 0 !important;
}
.failed-sample-data__actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.failed-sample-data__menu-desc {
  display: block;
  font-size: 12px;
  color: var(--sm-text-secondary, #6b7280);
}
.failed-sample-data__table {
  border: 1px solid var(--sm-border-color, #e5e7eb);
  border-radius: 10px;
  overflow: hidden;
}
.failed-sample-data :deep(.failed-sample-data-row--add) {
  background: color-mix(in srgb, var(--ant-color-success) 12%, transparent);
}
.failed-sample-data :deep(.failed-sample-data-row--not-equal) {
  background: var(--ant-color-fill-secondary, #f5f5f5);
}
.failed-sample-data :deep(.failed-sample-data-row--remove) {
  background: color-mix(in srgb, var(--ant-color-error) 12%, transparent);
}
.failed-sample-data-column {
  background: color-mix(in srgb, var(--ant-color-error) 18%, transparent);
}
.failed-sample-data-cell--diff {
  text-align: center;
  border-right: 1px solid var(--sm-border-color, #e5e7eb);
  min-width: 2.5rem;
}
</style>