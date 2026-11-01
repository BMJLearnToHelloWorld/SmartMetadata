<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Table, Typography } from 'ant-design-vue';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { TableProfile, TestCase } from '@/types/quality';

const props = defineProps<{
  tests: TestCase[];
  testsError: string;
  testStatusSeries: ChartSeries[];
  tableProfile: TableProfile | null;
  rowCountSeries: ChartSeries[];
  usageSeries: ChartSeries[];
  columnNullSeries: ChartSeries[];
  entityType: string;
}>();

const router = useRouter();
const { t } = useI18n();

const testColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.definition'), key: 'testDefinition' },
  { title: t('asset.columns.status'), key: 'status', width: 140 },
]);

const profileColumns = computed(() => [
  { title: t('asset.columns.column'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.nulls'), dataIndex: 'nullCount', key: 'nullCount', width: 90 },
  { title: t('asset.columns.unique'), dataIndex: 'uniqueCount', key: 'uniqueCount', width: 90 },
  { title: t('asset.columns.min'), dataIndex: 'min', key: 'min' },
  { title: t('asset.columns.max'), dataIndex: 'max', key: 'max' },
]);
</script>

<template>
  <div>
    <Typography.Title :level="5">{{ t('asset.testsTitle') }}</Typography.Title>
    <Typography.Paragraph type="secondary">{{ t('asset.qualityLead') }}</Typography.Paragraph>
    <Alert v-if="testsError" type="warning" show-icon :message="testsError" class="detail__alert" />
    <Table
      row-key="id"
      data-testid="asset-tests-table"
      :columns="testColumns"
      :data-source="tests"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a
            href="#"
            :data-testid="`asset-test-${(record as TestCase).id}`"
            @click.prevent="router.push({ name: 'quality-test-case', params: { id: (record as TestCase).id } })"
          >
            {{ (record as TestCase).displayName || (record as TestCase).name }}
          </a>
        </template>
        <template v-else-if="column.key === 'testDefinition'">
          <a
            v-if="(record as TestCase).testDefinition?.id"
            href="#"
            @click.prevent="
              router.push({
                name: 'quality-test-definition',
                params: { id: (record as TestCase).testDefinition?.id },
              })
            "
          >
            {{
              (record as TestCase).testDefinition?.fullyQualifiedName ||
              (record as TestCase).testDefinition?.name
            }}
          </a>
          <span v-else>
            {{ (record as TestCase).testDefinition?.name || '—' }}
          </span>
        </template>
        <template v-else-if="column.key === 'status'">
          {{
            (record as TestCase).testCaseResult?.testCaseStatus ||
            (record as TestCase).testCaseStatus ||
            '—'
          }}
        </template>
      </template>
    </Table>
    <div class="detail__chart-block">
      <Typography.Text strong>{{ t('asset.testStatusChart') }}</Typography.Text>
      <Typography.Paragraph type="secondary">{{ t('asset.testStatusChartLead') }}</Typography.Paragraph>
      <SmChart kind="donut" test-id="asset-test-status-chart" :series="testStatusSeries" :empty="t('charts.empty')" />
    </div>
    <template v-if="entityType === 'table'">
      <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.profilerTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('asset.profilerLead') }}</Typography.Paragraph>
      <Typography.Paragraph v-if="tableProfile">
        {{ t('asset.rows', { rows: tableProfile.rowCount ?? '—', columns: tableProfile.columnCount ?? '—' }) }}
      </Typography.Paragraph>
      <div class="detail__charts" data-testid="asset-profile-charts">
        <div>
          <Typography.Text strong>{{ t('asset.rowCountChart') }}</Typography.Text>
          <Typography.Paragraph type="secondary">{{ t('asset.rowCountChartLead') }}</Typography.Paragraph>
          <SmChart kind="line" test-id="asset-rowcount-chart" :series="rowCountSeries" :empty="t('charts.empty')" />
        </div>
        <div>
          <Typography.Text strong>{{ t('asset.usageChart') }}</Typography.Text>
          <Typography.Paragraph type="secondary">{{ t('asset.usageChartLead') }}</Typography.Paragraph>
          <SmChart kind="line" test-id="asset-usage-chart" :series="usageSeries" :empty="t('charts.empty')" />
        </div>
        <div>
          <Typography.Text strong>{{ t('asset.columnNullChart') }}</Typography.Text>
          <Typography.Paragraph type="secondary">{{ t('asset.columnNullChartLead') }}</Typography.Paragraph>
          <SmChart kind="bar" test-id="asset-column-null-chart" :series="columnNullSeries" :empty="t('charts.empty')" />
        </div>
      </div>
      <Table
        row-key="name"
        data-testid="asset-profile-table"
        :columns="profileColumns"
        :data-source="tableProfile?.columns ?? []"
        :pagination="false"
        size="small"
      />
    </template>
  </div>
</template>

<style scoped>
.detail__alert {
  margin-bottom: 16px;
}
.detail__schema-title {
  margin-top: 24px;
}
.detail__charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-block: 12px 16px;
}
.detail__chart-block {
  margin-block: 12px 16px;
  max-width: 420px;
}
</style>
