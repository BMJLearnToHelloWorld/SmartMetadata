<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Divider, Table, Typography } from 'ant-design-vue';
import type { AssetDetail } from '@/types/api';
import VersionTable from '@/components/entityVersion/VersionTable.vue';
import {
  getColumnsDataWithVersionChanges,
  getConstraintChanges,
  EntityField,
  type VersionColumn,
} from '@/ingestion/versionDiff';
import { schemaRowsToVersionColumns } from '@/utils/versionColumns';
import { getEntityName } from '@/components/shared/profilePictureUtils';

const props = defineProps<{
  entityType: string;
  contentKind: string;
  currentVersionData: AssetDetail;
  isVersionLoading?: boolean;
  childRows?: { id?: string; name?: string; displayName?: string; fullyQualifiedName?: string; description?: string }[];
  childLoading?: boolean;
}>();

const { t } = useI18n();

const changeDescription = computed(() => props.currentVersionData.changeDescription);

const columnRows = computed(() =>
  getColumnsDataWithVersionChanges(
    changeDescription.value,
    schemaRowsToVersionColumns(props.currentVersionData.schemaRows),
    props.entityType === 'container',
  ),
);

const columnConstraints = computed(() => getConstraintChanges(changeDescription.value, EntityField.CONSTRAINT));
const tableConstraints = computed(() =>
  getConstraintChanges(changeDescription.value, EntityField.TABLE_CONSTRAINTS),
);

const taskRows = computed<VersionColumn[]>(() =>
  (props.currentVersionData.tasks ?? []).map((task) => ({
    name: task.name,
    displayName: task.displayName,
    description: task.description,
    tags: task.tags,
    fullyQualifiedName: task.fullyQualifiedName || task.name,
    key: task.name,
  })),
);

const tasksWithDiffs = computed(() =>
  getColumnsDataWithVersionChanges(changeDescription.value, taskRows.value),
);

const featureRows = computed(() => {
  const raw = props.currentVersionData.mlFeaturesRaw;
  if (Array.isArray(raw) && raw.length) {
    return raw as Array<Record<string, unknown>>;
  }
  return (props.currentVersionData.mlFeatures ?? []).map((feature) => ({
    name: feature.name,
    fullyQualifiedName: feature.fullyQualifiedName,
    dataType: feature.dataType,
    description: feature.description,
    tags: feature.tags,
  }));
});

const chartRows = computed(() => {
  if (props.currentVersionData.charts?.length) {
    return props.currentVersionData.charts;
  }
  return props.currentVersionData.children ?? [];
});

const chartColumns = computed(() => [
  { title: t('label.name'), dataIndex: 'name', key: 'name' },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
]);

const childColumns = computed(() => [
  { title: t('label.name'), key: 'name' },
  { title: t('label.description'), dataIndex: 'description', key: 'description' },
]);

const childData = computed(() => props.childRows ?? props.currentVersionData.children ?? []);

const code = computed(() => {
  const stored = props.currentVersionData.storedProcedureCode;
  if (!stored) {
    return '';
  }
  if (typeof stored === 'string') {
    return stored;
  }
  return stored.code || '';
});

function featureName(feature: Record<string, unknown>): string {
  return String(feature.name ?? feature.fullyQualifiedName ?? '');
}

function featureType(feature: Record<string, unknown>): string {
  return String(feature.dataType ?? '--');
}

function featureAlgorithm(feature: Record<string, unknown>): string {
  return String(feature.featureAlgorithm ?? '--');
}
</script>

<template>
  <VersionTable
    v-if="contentKind === 'columns'"
    :added-column-constraint-diffs="columnConstraints.addedConstraintDiffs"
    :added-table-constraint-diffs="tableConstraints.addedConstraintDiffs"
    :columns="columnRows"
    :deleted-column-constraint-diffs="columnConstraints.deletedConstraintDiffs"
    :deleted-table-constraint-diffs="tableConstraints.deletedConstraintDiffs"
    :is-loading="isVersionLoading"
    :joins="currentVersionData.joins?.columnJoins"
    :table-constraints="currentVersionData.tableConstraints"
  />
  <VersionTable
    v-else-if="contentKind === 'tasks'"
    :columns="tasksWithDiffs"
    :is-loading="isVersionLoading"
  />
  <div v-else-if="contentKind === 'features'" data-testid="feature-list">
    <template v-if="featureRows.length">
      <Divider />
      <Typography.Title :level="5">{{ t('label.feature-plural-used') }}</Typography.Title>
      <Card
        v-for="feature in featureRows"
        :key="String(feature.fullyQualifiedName || feature.name)"
        class="entity-version-features__card"
        :data-testid="`feature-card-${featureName(feature)}`"
      >
        <Typography.Text strong>{{ featureName(feature) }}</Typography.Text>
        <div>{{ t('label.type') }}: {{ featureType(feature) }}</div>
        <div>{{ t('label.algorithm') }}: {{ featureAlgorithm(feature) }}</div>
        <p v-if="feature.description">{{ feature.description }}</p>
      </Card>
    </template>
    <p v-else class="entity-version-features__empty">{{ t('label.no-entity', { entity: t('label.feature-plural') }) }}</p>
  </div>
  <Table
    v-else-if="contentKind === 'charts'"
    :columns="chartColumns"
    :data-source="chartRows"
    :pagination="false"
    data-testid="schema-table"
    row-key="id"
    size="small"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">{{ getEntityName(record) || record.name }}</template>
    </template>
  </Table>
  <div v-else-if="contentKind === 'code'" data-testid="version-code">
    <pre v-if="code" class="entity-version-code"><code>{{ code }}</code></pre>
  </div>
  <div v-else-if="contentKind === 'metric-overview'" data-testid="metric-overview">
    <pre v-if="code" class="entity-version-code"><code>{{ code }}</code></pre>
    <ul v-if="currentVersionData.relatedMetrics?.length">
      <li v-for="metric in currentVersionData.relatedMetrics" :key="metric.id || metric.fullyQualifiedName">
        {{ getEntityName(metric) || metric.name }}
      </li>
    </ul>
  </div>
  <div v-else-if="contentKind === 'topic-schema' || contentKind === 'api-schema'">
    <VersionTable :columns="columnRows" :is-loading="isVersionLoading" />
  </div>
  <Table
    v-else-if="contentKind === 'children' || contentKind === 'schemas' || contentKind === 'tables' || contentKind === 'endpoints'"
    :columns="childColumns"
    :data-source="childData"
    :loading="childLoading"
    :pagination="false"
    data-testid="schema-table"
    row-key="id"
    size="small"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">{{ getEntityName(record) || record.name || record.fullyQualifiedName }}</template>
    </template>
  </Table>
</template>

<style scoped>
.entity-version-features__card {
  margin-bottom: 16px;
}
.entity-version-code {
  margin: 0;
  padding: 12px;
  overflow: auto;
  background: var(--sm-color-bg-muted, rgba(0, 0, 0, 0.04));
  border-radius: 6px;
  color: var(--sm-color-text, inherit);
}
</style>
