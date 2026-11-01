<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select, Space } from 'ant-design-vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { LineageGraphModel } from '@/lineage/graphModel';
import {
  IMPACT_DIRECTIONS,
  IMPACT_LEVELS,
  impactColumnRows,
  impactEntityRows,
  type ImpactDirection,
  type ImpactLevel,
} from '@/lineage/impact';

const props = defineProps<{
  model: LineageGraphModel | null;
}>();

const { t } = useI18n();
const direction = ref<ImpactDirection>('downstream');
const level = ref<ImpactLevel>('entity');

const directionOptions = IMPACT_DIRECTIONS.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
}));
const levelOptions = IMPACT_LEVELS.map((item) => ({
  value: item.value,
  label: t(item.labelKey),
}));

const entityColumns = computed(() => [
  { title: t('lineage.impactDepth'), dataIndex: 'depth', key: 'depth' },
  { title: t('crud.name'), dataIndex: 'displayName', key: 'displayName' },
  { title: t('lineage.impactFrom'), dataIndex: 'fromEntity', key: 'fromEntity' },
  { title: t('lineage.impactTo'), dataIndex: 'toEntity', key: 'toEntity' },
]);

const columnColumns = computed(() => [
  { title: t('lineage.impactDepth'), dataIndex: 'depth', key: 'depth' },
  { title: t('lineage.fromColumns'), dataIndex: 'fromColumns', key: 'fromColumns' },
  { title: t('lineage.toColumn'), dataIndex: 'toColumn', key: 'toColumn' },
  { title: t('lineage.function'), dataIndex: 'function', key: 'function' },
]);

const entityRows = computed(() =>
  props.model ? impactEntityRows(props.model, direction.value) : [],
);
const columnRows = computed(() =>
  props.model ? impactColumnRows(props.model, direction.value) : [],
);
const empty = computed(() =>
  level.value === 'entity' ? entityRows.value.length === 0 : columnRows.value.length === 0,
);
</script>

<template>
  <div data-testid="lineage-impact-panel">
    <Space wrap align="center">
      <span>{{ t('lineage.impactDirection') }}</span>
      <Select
        v-model:value="direction"
        data-testid="lineage-impact-direction"
        :options="directionOptions"
      />
      <span>{{ t('lineage.impactLevel') }}</span>
      <Select
        v-model:value="level"
        data-testid="lineage-impact-level"
        :options="levelOptions"
      />
    </Space>
    <SmState
      v-if="empty"
      state="empty"
      test-id="lineage-impact-empty"
      :empty-text="t('lineage.impactEmpty')"
    />
    <SmTable
      v-else-if="level === 'entity'"
      test-id="lineage-impact-table"
      :columns="entityColumns"
      :data-source="entityRows"
      row-key="key"
    />
    <SmTable
      v-else
      test-id="lineage-impact-table"
      :columns="columnColumns"
      :data-source="columnRows"
      row-key="key"
    />
  </div>
</template>
