<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official CustomMetricGraphs: area charts plus edit/delete overflow when
  TableProfilerProvider permissions allow EditDataProfile or Delete.
  Official showHeader=false / read-only preview passes no permissions, so
  the overflow is hidden. Vue3 + ant-design-vue + SmChart. No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu, Modal, Typography, message } from 'ant-design-vue';
import { MoreOutlined } from '@ant-design/icons-vue';
import type { ChartSeries } from '@/features/charts/types';
import type { OperationPermissions } from '@/api/permissions';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { deleteCustomMetric, type CustomMetricRecord } from '@/api/customMetrics';
import SmChart from '@/features/charts/SmChart.vue';

const props = withDefaults(
  defineProps<{
    series: ChartSeries[];
    customMetrics?: CustomMetricRecord[];
    emptyText: string;
    permissions?: OperationPermissions;
    tableId?: string;
  }>(),
  {
    customMetrics: () => [],
    permissions: undefined,
    tableId: undefined,
  },
);

const emit = defineEmits<{
  (event: 'edit', metric: CustomMetricRecord): void;
  (event: 'deleted'): void;
}>();

const { t } = useI18n();

const editPermission = computed(
  () => Boolean(props.permissions && getDerivedPermissionFlags(props.permissions).can('EditDataProfile')),
);
const deletePermission = computed(() => props.permissions?.Delete === true);
const showOverflow = computed(() => editPermission.value || deletePermission.value);

const selected = ref<CustomMetricRecord | undefined>();
const deleteOpen = ref(false);
const deleting = ref(false);

const visibleSeries = computed(() =>
  props.series.filter((series) => props.customMetrics.some((metric) => metric.name === series.name) || props.customMetrics.length === 0),
);

function metricFor(name: string): CustomMetricRecord | undefined {
  return props.customMetrics.find((metric) => metric.name === name);
}

function onMenu(key: string, name: string): void {
  const metric = metricFor(name);
  if (!metric) {
    return;
  }
  if (key === 'edit') {
    emit('edit', metric);
    return;
  }
  if (key === 'delete') {
    selected.value = metric;
    deleteOpen.value = true;
  }
}

function onCancelDelete(): void {
  deleteOpen.value = false;
  selected.value = undefined;
}

async function onConfirmDelete(): Promise<void> {
  if (!props.tableId || !selected.value) {
    return;
  }
  deleting.value = true;
  try {
    await deleteCustomMetric({
      tableId: props.tableId,
      customMetricName: selected.value.name,
      columnName: selected.value.columnName,
    });
    message.success(t('server.entity-deleted-successfully', { entity: selected.value.name }));
    emit('deleted');
    onCancelDelete();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="custom-metric-graphs" data-testid="custom-metric-graph-container">
    <div
      v-for="item in visibleSeries"
      :key="item.name"
      class="custom-metric-graphs__card"
      :data-testid="`custom-metric-graph-${item.name}`"
    >
      <div class="custom-metric-graphs__title">
        <Typography.Text strong>{{ item.name }}</Typography.Text>
        <Dropdown v-if="showOverflow" :trigger="['click']">
          <Button type="text" :data-testid="`${item.name}-custom-metrics-menu`">
            <MoreOutlined />
          </Button>
          <template #overlay>
            <Menu @click="(info) => onMenu(String(info.key), item.name)">
              <Menu.Item key="edit" :disabled="!editPermission" data-testid="custom-metric-edit">
                {{ t('label.edit') }}
              </Menu.Item>
              <Menu.Item key="delete" :disabled="!deletePermission" data-testid="custom-metric-delete">
                {{ t('label.delete') }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
      <SmChart kind="area" :test-id="`custom-metric-chart-${item.name}`" :series="[item]" :empty="emptyText" :height="240" />
    </div>
    <Modal
      :open="deleteOpen"
      :confirm-loading="deleting"
      :ok-text="t('label.delete')"
      :cancel-text="t('label.cancel')"
      ok-type="danger"
      data-testid="custom-metric-delete-modal"
      @ok="onConfirmDelete"
      @cancel="onCancelDelete"
    >
      <p>
        {{
          t('message.permanently-delete-common-message', {
            entity: (selected?.name ?? t('label.custom-metric')).toLowerCase(),
          })
        }}
      </p>
    </Modal>
  </div>
</template>

<style scoped>
.custom-metric-graphs {
  display: flex;
  flex-direction: column;
  gap: 30px;
}
.custom-metric-graphs__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.custom-metric-graphs__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
