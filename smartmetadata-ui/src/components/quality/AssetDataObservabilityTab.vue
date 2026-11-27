<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataObservabilityTab (Table page Profiler tab): sub-tabs
  Table Profile, Column Profile, Data Quality, and Incidents. Vue3 +
  ant-design-vue. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tabs } from 'ant-design-vue';
import AssetProfilerPanel from '@/features/crud/AssetProfilerPanel.vue';
import AssetDataQualityTab from '@/components/quality/AssetDataQualityTab.vue';
import ColumnProfileTable from '@/components/quality/ColumnProfileTable.vue';
import IncidentsListView from '@/views/observability/IncidentsListView.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { TableProfile, TestCase } from '@/types/quality';

/** Official ProfilerTabPath keys used as sub-tab ids. */
const TABLE_PROFILE = 'table-profile';
const COLUMN_PROFILE = 'column-profile';
const DATA_QUALITY = 'data-quality';
const INCIDENTS = 'incidents';

defineProps<{
  entityFqn: string;
  testSuiteFqn?: string;
  testSuiteId?: string;
  deleted?: boolean;
  tests: TestCase[];
  testsError: string;
  testStatusSeries: ChartSeries[];
  tableProfile: TableProfile | null;
  rowCountSeries: ChartSeries[];
  usageSeries: ChartSeries[];
  columnNullSeries: ChartSeries[];
  entityType: string;
  tableId?: string;
  columns?: { name: string; dataType: string }[];
}>();

const { t } = useI18n();
/** Official profilerClassBase.getDefaultTabKey: TABLE_PROFILE. */
const activeSubTab = ref(TABLE_PROFILE);
</script>

<template>
  <div class="asset-data-observability" data-testid="table-profiler-container">
    <Tabs v-model:activeKey="activeSubTab" data-testid="asset-data-observability-tabs">
      <Tabs.TabPane :key="TABLE_PROFILE" :tab="t('label.table-entity-text', { entityText: t('label.profile') })" />
      <Tabs.TabPane :key="COLUMN_PROFILE" :tab="t('label.column-entity', { entity: t('label.profile') })" />
      <Tabs.TabPane :key="DATA_QUALITY" :tab="t('label.data-quality')" />
      <Tabs.TabPane :key="INCIDENTS" :tab="t('label.incident-plural')" />
    </Tabs>

    <div v-show="activeSubTab === TABLE_PROFILE">
      <AssetProfilerPanel
        :table-profile="tableProfile"
        :row-count-series="rowCountSeries"
        :usage-series="usageSeries"
        :column-null-series="columnNullSeries"
        :entity-type="entityType"
        :table-id="tableId"
        :columns="columns"
      />
    </div>

    <div v-show="activeSubTab === COLUMN_PROFILE">
      <ColumnProfileTable
        :entity-fqn="entityFqn"
        :test-suite-id="testSuiteId"
        :table-profile="tableProfile"
        @open-data-quality="activeSubTab = DATA_QUALITY"
      />
    </div>

    <div v-show="activeSubTab === DATA_QUALITY">
      <AssetDataQualityTab
        :entity-fqn="entityFqn"
        :test-suite-fqn="testSuiteFqn"
        :test-suite-id="testSuiteId"
        :deleted="deleted"
        :table-id="tableId"
        :columns="columns"
        :show-incidents="false"
      />
    </div>

    <div v-show="activeSubTab === INCIDENTS">
      <IncidentsListView embedded :origin-entity-fqn="entityFqn" data-testid="asset-dq-incidents" />
    </div>
  </div>
</template>
