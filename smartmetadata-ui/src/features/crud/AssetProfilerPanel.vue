<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, ref, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Table, Typography } from 'ant-design-vue';
import { SettingOutlined } from '@ant-design/icons-vue';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import type { ColumnProfile, TableProfile, TestCase } from '@/types/quality';
import ProfilerSettingsModal from './ProfilerSettingsModal.vue';

const props = defineProps<{
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

const router = useRouter();
const { t } = useI18n();
const settingsOpen = ref(false);

const testColumns = computed(() => [
  { title: t('asset.columns.name'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.definition'), key: 'testDefinition' },
  { title: t('asset.columns.status'), key: 'status', width: 140 },
]);

const profileColumns = computed(() => [
  { title: t('asset.columns.column'), dataIndex: 'name', key: 'name' },
  { title: t('asset.columns.nulls'), dataIndex: 'nullCount', key: 'nullCount', width: 90 },
  { title: t('asset.columns.unique'), dataIndex: 'uniqueCount', key: 'uniqueCount', width: 90 },
  { title: t('asset.columns.distinct'), dataIndex: 'distinctCount', key: 'distinctCount', width: 90 },
  { title: t('asset.columns.min'), dataIndex: 'min', key: 'min' },
  { title: t('asset.columns.max'), dataIndex: 'max', key: 'max' },
  { title: t('asset.columns.mean'), dataIndex: 'mean', key: 'mean' },
  { title: t('asset.columns.median'), dataIndex: 'median', key: 'median' },
  { title: t('asset.columns.stddev'), dataIndex: 'stddev', key: 'stddev' },
]);

/** Remaining scalar metrics shown in the expanded row, in schema order. */
const detailFields: { key: keyof ColumnProfile; label: string }[] = [
  { key: 'valuesCount', label: 'valuesCount' },
  { key: 'duplicateCount', label: 'duplicateCount' },
  { key: 'nullProportion', label: 'nullProportion' },
  { key: 'uniqueProportion', label: 'uniqueProportion' },
  { key: 'distinctProportion', label: 'distinctProportion' },
  { key: 'nullMissingCount', label: 'nullMissingCount' },
  { key: 'countInSet', label: 'countInSet' },
  { key: 'likeCount', label: 'likeCount' },
  { key: 'iLikeCount', label: 'iLikeCount' },
  { key: 'notLikeCount', label: 'notLikeCount' },
  { key: 'regexCount', label: 'regexCount' },
  { key: 'notRegexCount', label: 'notRegexCount' },
  { key: 'likeRatio', label: 'likeRatio' },
  { key: 'iLikeRatio', label: 'iLikeRatio' },
  { key: 'minLength', label: 'minLength' },
  { key: 'maxLength', label: 'maxLength' },
  { key: 'sum', label: 'sum' },
  { key: 'firstQuartile', label: 'firstQuartile' },
  { key: 'thirdQuartile', label: 'thirdQuartile' },
  { key: 'interQuartileRange', label: 'interQuartileRange' },
  { key: 'nonParametricSkew', label: 'nonParametricSkew' },
];

function formatDetailValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  return String(value);
}

/**
 * Table-level profile extras, rendered only when present: size and
 * creation time stay unset for dialects without a stats query, so absent
 * extras are omitted rather than shown as dashes. executionSource is
 * deliberately NOT rendered: whether it survives the server round trip
 * is still an open live check (B-12), and an invisible-or-stale value
 * must not be presented as fact until that check settles it.
 */
const tableExtras = computed(() => {
  const profile = props.tableProfile;
  if (!profile) {
    return [];
  }
  const extras: { label: string; value: string }[] = [];
  if (profile.sizeInByte !== undefined) {
    extras.push({ label: 'sizeInByte', value: formatDetailValue(profile.sizeInByte) });
  }
  if (profile.createDateTime !== undefined) {
    extras.push({ label: 'createDateTime', value: profile.createDateTime });
  }
  if (profile.profileSample !== undefined) {
    extras.push({ label: 'profileSample', value: formatDetailValue(profile.profileSample) });
  }
  if (profile.profileSampleType !== undefined) {
    extras.push({ label: 'profileSampleType', value: profile.profileSampleType });
  }
  if (profile.customMetrics?.length) {
    extras.push({
      label: 'customMetrics',
      value: profile.customMetrics
        .map((metric) => `${metric.name}=${formatDetailValue(metric.value)}`)
        .join(', '),
    });
  }
  return extras;
});

function expandedRowRender({ record }: { record: ColumnProfile }): VNode {
  const items = detailFields.map((field) =>
    h('div', { class: 'detail__metric' }, [
      h(Typography.Text, { type: 'secondary' }, () => `${field.label}: `),
      h(Typography.Text, () => formatDetailValue(record[field.key])),
    ]),
  );
  if (record.customMetrics?.length) {
    items.push(
      h('div', { class: 'detail__metric' }, [
        h(Typography.Text, { type: 'secondary' }, () => 'customMetrics: '),
        h(
          Typography.Text,
          () =>
            record
              .customMetrics!.map((metric) => `${metric.name}=${formatDetailValue(metric.value)}`)
              .join(', '),
        ),
      ]),
    );
  }
  if (record.histogram) {
    const bins = record.histogram.boundaries
      .map((boundary, index) => `${boundary}: ${record.histogram!.frequencies[index] ?? 0}`)
      .join(', ');
    items.push(
      h('div', { class: 'detail__metric' }, [
        h(Typography.Text, { type: 'secondary' }, () => `${t('asset.columns.histogram')}: `),
        h(Typography.Text, () => bins || '—'),
      ]),
    );
  }
  if (record.cardinalityDistribution) {
    const distribution = record.cardinalityDistribution;
    const text = distribution.allValuesUnique
      ? t('asset.columns.allValuesUnique')
      : (distribution.categories ?? [])
          .map(
            (category, index) =>
              `${String(category)}: ${distribution.counts?.[index] ?? '—'} (${distribution.percentages?.[index] ?? '—'}%)`,
          )
          .join(', ');
    items.push(
      h('div', { class: 'detail__metric' }, [
        h(Typography.Text, { type: 'secondary' }, () => `${t('asset.columns.cardinality')}: `),
        h(Typography.Text, () => text || '—'),
      ]),
    );
  }
  return h('div', { class: 'detail__expanded' }, items);
}
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
      <div class="detail__profiler-head">
        <Typography.Title :level="5" class="detail__schema-title">{{ t('asset.profilerTitle') }}</Typography.Title>
        <Button
          v-if="tableId"
          data-testid="asset-profiler-settings"
          @click="settingsOpen = true"
        >
          <SettingOutlined /> {{ t('profilerSettings.title') }}
        </Button>
      </div>
      <Typography.Paragraph type="secondary">{{ t('asset.profilerLead') }}</Typography.Paragraph>
      <Typography.Paragraph v-if="tableProfile">
        {{ t('asset.rows', { rows: tableProfile.rowCount ?? '—', columns: tableProfile.columnCount ?? '—' }) }}
      </Typography.Paragraph>
      <div v-if="tableExtras.length" class="detail__extras" data-testid="asset-profile-extras">
        <div v-for="extra in tableExtras" :key="extra.label" class="detail__metric">
          <Typography.Text type="secondary">{{ extra.label }}: </Typography.Text>
          <Typography.Text>{{ extra.value }}</Typography.Text>
        </div>
      </div>
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
        :expanded-row-render="expandedRowRender"
        size="small"
      />
      <ProfilerSettingsModal
        v-if="tableId"
        :open="settingsOpen"
        :table-id="tableId"
        :columns="columns ?? []"
        @cancel="settingsOpen = false"
        @saved="settingsOpen = false"
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
.detail__profiler-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.detail__expanded {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 16px;
}
.detail__extras {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 16px;
  margin-bottom: 12px;
}
.detail__metric {
  overflow-wrap: anywhere;
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
