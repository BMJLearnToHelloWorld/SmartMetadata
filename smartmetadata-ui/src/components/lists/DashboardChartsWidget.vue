<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { EditOutlined } from '@ant-design/icons-vue';
import { Alert, Button, message, Modal, Select, Switch, Tag, Typography } from 'ant-design-vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { fetchCharts, updateChart, type ChartRow } from '@/api/charts';
import { getDerivedPermissionFlags, type DerivedPermissionFlags } from '@/api/permissions';
import { DEFAULT_ENTITY_PERMISSION } from '@/composables/useEntityPermissions';
import { diffJsonPatch } from '@/admin/jsonPatch';
import { mergeChartTags } from '@/catalog/chartTags';
import { assetLocation } from '@/catalog/entityRoutes';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef, TagRef } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';
import type { TableProps } from 'ant-design-vue';

/**
 * ChartsTable (pin DashboardChartTable.tsx): the charts of a dashboard.
 * Per-chart fetch (`fetchCharts`, fulfilled only) and per-chart
 * permission evaluation (`getChartPermissionFlags` equivalent: each
 * chart's own entity permission derived without `deleted`; a chart
 * whose permission fetch fails falls back to all-false). Description
 * editing opens the A7 §4.3 modal; tags and glossary terms edit inline
 * in the cell (the row is the permission boundary — pin's
 * `getChartPermissionFlags` is evaluated once per row, so the
 * description/tag/term cells of one row share one gate). The dashboard
 * itself is the read-only switch: `isReadOnly` is the dashboard's
 * `deleted` flag. No search input in pin — only tag filters and
 * sorting.
 */
const props = withDefaults(
  defineProps<{
    chartRefs: EntityRef[];
    dashboardFqn: string;
    deleted?: boolean;
    tagOptions?: AssetTagOption[];
  }>(),
  { deleted: false, tagOptions: () => [] },
);

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const isAdminUser = computed(() => permissionStore.isAdminUser);

const rows = ref<ChartRow[]>([]);
const loading = ref(false);
const error = ref('');
const showDeleted = ref(false);
const chartFlags = ref<Record<string, DerivedPermissionFlags>>({});
const flagsLoaded = ref(false);

const descriptionChart = ref<ChartRow | null>(null);
const descriptionEditorKey = ref(0);
const descriptionEditorRef = ref<{ getEditorContent: () => string } | null>(null);
const savingDescription = ref(false);

let fetchSeq = 0;

function flagsFor(row: ChartRow): DerivedPermissionFlags {
  return chartFlags.value[row.id] ?? DEFAULT_ENTITY_PERMISSION;
}

function canEditRow(row: ChartRow): boolean {
  return !props.deleted && (isAdminUser.value || flagsFor(row).canEditDescription);
}

function tagFilterOptions(source: 'Classification' | 'Glossary') {
  const seen = new Map<string, string>();
  for (const row of rows.value) {
    for (const tag of row.tags ?? []) {
      if (tag.source === source) {
        seen.set(tag.tagFQN, tag.name);
      }
    }
  }
  return [...seen.entries()].map(([value, text]) => ({ text, value }));
}

function optionsFor(source: 'Classification' | 'Glossary') {
  return props.tagOptions
    .filter((option) => option.source === source)
    .map((option) => ({ label: option.name, value: option.tagFQN }));
}

const columns: TableProps['columns'] = [
  {
    title: t('label.name'),
    dataIndex: 'name',
    key: 'name',
    width: 280,
    sorter: (a: unknown, b: unknown) =>
      String((a as ChartRow).name ?? '').localeCompare(String((b as ChartRow).name ?? '')),
  },
  { title: t('label.type'), dataIndex: 'chartType', key: 'chartType' },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
  {
    title: t('label.tag-plural'),
    dataIndex: 'tags',
    key: 'tags',
    filters: tagFilterOptions('Classification'),
    onFilter: (value: string | number | boolean, record: ChartRow) =>
      (record.tags ?? []).some((tag) => tag.tagFQN === value),
  },
  {
    title: t('lists.termPlural'),
    dataIndex: 'terms',
    key: 'terms',
    filters: tagFilterOptions('Glossary'),
    onFilter: (value: string | number | boolean, record: ChartRow) =>
      (record.tags ?? []).some((tag) => tag.tagFQN === value),
  },
];

function tagsOf(row: ChartRow, source: 'Classification' | 'Glossary'): TagRef[] {
  return (row.tags ?? []).filter((tag) => tag.source === source);
}

function openDescriptionEdit(row: ChartRow): void {
  descriptionChart.value = row;
  descriptionEditorKey.value += 1;
  savingDescription.value = false;
}

function closeDescriptionEdit(): void {
  descriptionChart.value = null;
}

async function saveDescriptionEdit(): Promise<void> {
  const row = descriptionChart.value;
  if (!row || savingDescription.value) {
    return;
  }
  const nextDescription = descriptionEditorRef.value?.getEditorContent()?.trim() ?? '';
  if (nextDescription === (row.description ?? '')) {
    closeDescriptionEdit();
    return;
  }
  savingDescription.value = true;
  try {
    const patch = diffJsonPatch({ description: row.description ?? '' }, { description: nextDescription });
    const updated = await updateChart(row.id, patch);
    rows.value = rows.value.map((item) =>
      item.id === row.id ? { ...item, description: updated.description } : item,
    );
    closeDescriptionEdit();
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  } finally {
    savingDescription.value = false;
  }
}

async function onTagChange(row: ChartRow, source: 'Classification' | 'Glossary', selectedFqns: string[]): Promise<void> {
  const merged = mergeChartTags(row.tags ?? [], source, selectedFqns, props.tagOptions);
  try {
    const patch = diffJsonPatch({ tags: row.tags ?? [] }, { tags: merged });
    const updated = await updateChart(row.id, patch);
    rows.value = rows.value.map((item) => (item.id === row.id ? { ...item, tags: updated.tags } : item));
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  }
}

function onShowDeletedChange(value: boolean): void {
  showDeleted.value = value;
  void fetchChartsAndPermissions();
}

async function fetchChartsAndPermissions(): Promise<void> {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    const charts = await fetchCharts(props.chartRefs, showDeleted.value);
    if (seq !== fetchSeq) {
      return;
    }
    rows.value = charts;
    // Per-chart permissions in parallel (pin getChartPermissionFlags);
    // a fetch failure leaves that chart's flags at the all-false
    // fallback instead of unlocking its edit cells.
    const flagsEntries = await Promise.all(
      charts.map(async (chart): Promise<[string, DerivedPermissionFlags]> => {
        try {
          const permissions = await permissionStore.getEntityPermissionById('chart', chart.id);
          return [chart.id, getDerivedPermissionFlags(permissions)];
        } catch {
          return [chart.id, getDerivedPermissionFlags(DEFAULT_ENTITY_PERMISSION)];
        }
      }),
    );
    if (seq !== fetchSeq) {
      return;
    }
    chartFlags.value = Object.fromEntries(flagsEntries);
    flagsLoaded.value = true;
  } catch (err) {
    if (seq !== fetchSeq) {
      return;
    }
    rows.value = [];
    error.value = err instanceof Error ? err.message : t('crud.loadFailed');
  } finally {
    if (seq === fetchSeq) {
      loading.value = false;
    }
  }
}

function openChart(row: ChartRow): void {
  void router.push(assetLocation('chart', row.fullyQualifiedName ?? row.name));
}

onMounted(() => {
  void fetchChartsAndPermissions();
});

watch(
  () => [props.chartRefs, props.dashboardFqn],
  () => {
    void fetchChartsAndPermissions();
  },
);
</script>

<template>
  <div data-testid="dashboard-charts-widget">
    <div class="lists-widget__toolbar">
      <span class="lists-widget__toggle">
        <Switch :checked="showDeleted" data-testid="show-deleted" size="small" @change="onShowDeletedChange(Boolean($event))" />
        <Typography.Text>{{ t('lists.deleted') }}</Typography.Text>
      </span>
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" class="lists-widget__alert" />
    <SmTable
      row-key="id"
      test-id="dashboard-chart-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      size="small"
      :empty-text="t('lists.noEntityDataAvailable', { entity: t('label.chart-plural') })"
      :custom-row="(row: ChartRow) => ({ onClick: () => openChart(row) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a href="#" @click.prevent="openChart(record as ChartRow)">
            {{ (record as ChartRow).displayName || (record as ChartRow).name }}
          </a>
        </template>
        <template v-else-if="column.key === 'chartType'">
          {{ (record as ChartRow).chartType || '—' }}
        </template>
        <template v-else-if="column.key === 'description'">
          <span class="lists-widget__description-cell">
            <DescriptionCell :markdown="(record as ChartRow).description" />
            <Button
              v-if="flagsLoaded && canEditRow(record as ChartRow)"
              type="text"
              size="small"
              data-testid="edit-description"
              :aria-label="t('crud.edit')"
              @click.stop="openDescriptionEdit(record as ChartRow)"
            >
              <EditOutlined />
            </Button>
          </span>
        </template>
        <template v-else-if="column.key === 'tags'">
          <Select
            v-if="flagsLoaded && canEditRow(record as ChartRow)"
            mode="multiple"
            allow-clear
            :value="tagsOf(record as ChartRow, 'Classification').map((tag) => tag.tagFQN)"
            :options="optionsFor('Classification')"
            :placeholder="t('label.tag-plural')"
            class="lists-widget__tag-select"
            @change="(values) => onTagChange(record as ChartRow, 'Classification', values as string[])"
          />
          <span v-else>
            <Tag v-for="tag in tagsOf(record as ChartRow, 'Classification')" :key="tag.tagFQN">{{ tag.name }}</Tag>
            <span v-if="tagsOf(record as ChartRow, 'Classification').length === 0">—</span>
          </span>
        </template>
        <template v-else-if="column.key === 'terms'">
          <Select
            v-if="flagsLoaded && canEditRow(record as ChartRow)"
            mode="multiple"
            allow-clear
            :value="tagsOf(record as ChartRow, 'Glossary').map((tag) => tag.tagFQN)"
            :options="optionsFor('Glossary')"
            :placeholder="t('lists.termPlural')"
            class="lists-widget__tag-select"
            @change="(values) => onTagChange(record as ChartRow, 'Glossary', values as string[])"
          />
          <span v-else>
            <Tag v-for="tag in tagsOf(record as ChartRow, 'Glossary')" :key="tag.tagFQN">{{ tag.name }}</Tag>
            <span v-if="tagsOf(record as ChartRow, 'Glossary').length === 0">—</span>
          </span>
        </template>
      </template>
    </SmTable>
    <Modal
      :open="descriptionChart !== null"
      :title="t('label.edit-description-for', { entityName: descriptionChart?.displayName || descriptionChart?.name || '' })"
      :mask-closable="false"
      :keyboard="false"
      :closable="false"
      :confirm-loading="savingDescription"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :destroy-on-close="true"
      @ok="saveDescriptionEdit"
      @cancel="closeDescriptionEdit"
    >
      <SmRichTextEditor
        :key="descriptionEditorKey"
        ref="descriptionEditorRef"
        :autofocus="true"
        :initial-value="descriptionChart?.description ?? ''"
      />
    </Modal>
  </div>
</template>

<style scoped>
.lists-widget__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.lists-widget__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lists-widget__alert {
  margin-bottom: 12px;
}
.lists-widget__description-cell {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.lists-widget__tag-select {
  min-width: 180px;
  width: 100%;
}
</style>
