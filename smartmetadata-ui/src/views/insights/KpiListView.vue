<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Descriptions, Spin, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { deleteKpi, listKpis } from '@/api/kpi';
import { confirmDelete } from '@/features/crud/confirmDelete';
import type { Kpi } from '@/types/kpi';

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const errorMessage = ref('');
const kpis = ref<Kpi[]>([]);
const selectedKpi = ref<Kpi | null>(null);
const deleting = ref(false);

function formatKpiTs(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString() : '—';
}

function kpiCurrent(kpi: Kpi): string {
  const value = kpi.kpiResult?.targetResult[0]?.value;
  return value === undefined ? '—' : value;
}

function kpiTargetMet(kpi: Kpi): boolean | undefined {
  return kpi.kpiResult?.targetResult[0]?.targetMet;
}

function kpiChartName(kpi: Kpi): string {
  return kpi.dataInsightChart?.displayName || kpi.dataInsightChart?.name || '—';
}

function kpiOwners(kpi: Kpi): string {
  const names = kpi.owners.map((owner) => owner.displayName || owner.name).filter(Boolean);
  return names.join(', ') || '—';
}

function kpiRowKey(row: Kpi): string {
  return row.id || row.name;
}

const kpiColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('insights.kpis.metricType'), dataIndex: 'metricType', key: 'metricType' },
  { title: t('insights.kpis.target'), key: 'target' },
  { title: t('insights.kpis.current'), key: 'current' },
  { title: t('insights.kpis.chart'), key: 'chart' },
  { title: t('insights.kpis.start'), key: 'start' },
  { title: t('insights.kpis.end'), key: 'end' },
  { title: t('crud.actions'), key: 'actions' },
]);

function onSelectKpi(record: Kpi): void {
  selectedKpi.value = record;
}

function kpiCustomRow(record: Kpi) {
  return {
    onClick: () => onSelectKpi(record as Kpi),
  };
}

function onAddKpi(): void {
  void router.push({ name: 'insights-kpis-add' });
}

function onEditKpi(record: Kpi): void {
  void router.push({ name: 'insights-kpis-edit', params: { fqn: record.fullyQualifiedName || record.name } });
}

async function onDeleteKpi(record: Kpi): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('insights.kpis.deleteTitle'),
    content: t('insights.kpis.deleteContent', { name: record.displayName || record.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed || !record.id) {
    return;
  }
  deleting.value = true;
  try {
    await deleteKpi(record.id, { hardDelete: true });
    if (selectedKpi.value?.id === record.id) {
      selectedKpi.value = null;
    }
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.kpisFailed');
  } finally {
    deleting.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listKpis({ limit: 50 });
    kpis.value = page.data;
    selectedKpi.value = page.data[0] ?? null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.kpisFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout test-id="kpi-list-layout">
    <PageHeader :header="t('insights.tabs.kpis')" :sub-header="t('insights.kpisLead')" />
    <Spin :spinning="loading || deleting">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="kpi-list__alert" />
      <Button type="primary" data-testid="kpi-add" @click="onAddKpi">{{ t('insights.kpis.add') }}</Button>
      <SmTable
        test-id="kpi-list-table"
        :columns="kpiColumns"
        :data-source="kpis"
        :row-key="kpiRowKey"
        :pagination="false"
        :custom-row="kpiCustomRow"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <Button type="link" data-testid="kpi-select" @click.stop="onSelectKpi(record as Kpi)">
              {{ record.displayName || record.name }}
            </Button>
          </template>
          <template v-else-if="column.key === 'metricType'">{{ record.metricType || '—' }}</template>
          <template v-else-if="column.key === 'target'">
            {{ record.targetValue === undefined ? '—' : record.targetValue }}
          </template>
          <template v-else-if="column.key === 'current'">{{ kpiCurrent(record as Kpi) }}</template>
          <template v-else-if="column.key === 'chart'">{{ kpiChartName(record as Kpi) }}</template>
          <template v-else-if="column.key === 'start'">{{ formatKpiTs(record.startDate) }}</template>
          <template v-else-if="column.key === 'end'">{{ formatKpiTs(record.endDate) }}</template>
          <template v-else-if="column.key === 'actions'">
            <Button type="link" data-testid="kpi-view" @click.stop="router.push({ name: 'insights-kpi-detail', params: { fqn: (record as Kpi).fullyQualifiedName || (record as Kpi).name } })">{{ t('crud.view') }}</Button>
            <Button type="link" data-testid="kpi-edit" @click.stop="onEditKpi(record as Kpi)">{{ t('crud.edit') }}</Button>
            <Button type="link" danger data-testid="kpi-delete" @click.stop="onDeleteKpi(record as Kpi)">{{ t('crud.delete') }}</Button>
          </template>
        </template>
      </SmTable>
      <Typography.Title v-if="selectedKpi" :level="5" class="kpi-list__sub">
        {{ t('insights.kpisDetail') }}
      </Typography.Title>
      <Descriptions v-if="selectedKpi" data-testid="kpi-detail" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ selectedKpi.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.displayName')">{{ selectedKpi.displayName || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ selectedKpi.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.metricType')">{{ selectedKpi.metricType || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.target')">
          {{ selectedKpi.targetValue === undefined ? '—' : selectedKpi.targetValue }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.current')">{{ kpiCurrent(selectedKpi) }}</Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.targetMet')">
          {{ kpiTargetMet(selectedKpi) === undefined ? '—' : kpiTargetMet(selectedKpi) ? t('crud.yes') : t('crud.no') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.chart')">{{ kpiChartName(selectedKpi) }}</Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.start')">{{ formatKpiTs(selectedKpi.startDate) }}</Descriptions.Item>
        <Descriptions.Item :label="t('insights.kpis.end')">{{ formatKpiTs(selectedKpi.endDate) }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">{{ kpiOwners(selectedKpi) }}</Descriptions.Item>
      </Descriptions>
    </Spin>
  </PageLayout>
</template>

<style scoped>
.kpi-list__alert {
  margin-block: 12px;
}
.kpi-list__sub {
  margin-top: 20px;
}
</style>
