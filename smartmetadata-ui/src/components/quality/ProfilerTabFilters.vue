<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataObservability TabFilters: shared date range, add menu
  (test-case / custom-metric only), profiler settings gear, and column
  picker when a column profile is open. Vue3 + ant-design-vue. No CCL
  React/CSS copy. Official add menu does not include a bundle suite item.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu, Tooltip } from 'ant-design-vue';
import { DownOutlined, SettingOutlined } from '@ant-design/icons-vue';
import IncidentDateRangeFilter from '@/components/quality/IncidentDateRangeFilter.vue';
import type { IncidentDateRange } from '@/quality/incidentDatePresets';
import { entityDisplayName } from '@/quality/columnProfile';

const TABLE_PROFILE = 'table-profile';
const COLUMN_PROFILE = 'column-profile';
const DATA_QUALITY = 'data-quality';
const INCIDENTS = 'incidents';

const props = withDefaults(
  defineProps<{
    activeTab: string;
    activeColumnFqn?: string;
    deleted?: boolean;
    editDataProfile?: boolean;
    createTestCasePermission?: boolean;
    startTs?: number;
    endTs?: number;
    rangeKey?: string;
    rangeTitle?: string;
    columns?: Array<{ name: string; dataType?: string; fullyQualifiedName?: string; displayName?: string }>;
  }>(),
  {
    activeColumnFqn: '',
    deleted: false,
    editDataProfile: false,
    createTestCasePermission: false,
    startTs: undefined,
    endTs: undefined,
    rangeKey: undefined,
    rangeTitle: undefined,
    columns: () => [],
  },
);

const emit = defineEmits<{
  (event: 'date-change', range: IncidentDateRange): void;
  (event: 'add-test-case'): void;
  (event: 'add-custom-metric'): void;
  (event: 'open-settings'): void;
  (event: 'select-column', fqn: string): void;
}>();

const { t } = useI18n();

const hideDateFilter = computed(() => {
  const hideOnTab = [COLUMN_PROFILE, DATA_QUALITY, INCIDENTS].includes(props.activeTab);
  return hideOnTab && !props.activeColumnFqn;
});

const canAddTableTest = computed(() => props.editDataProfile || props.createTestCasePermission);

const selectedColumn = computed(() =>
  props.columns.find((column) => (column.fullyQualifiedName || column.name) === props.activeColumnFqn),
);

function columnLabel(column: { name: string; dataType?: string; fullyQualifiedName?: string; displayName?: string }): string {
  const name = entityDisplayName(column);
  return column.dataType ? `${name} (${column.dataType})` : name;
}
</script>

<template>
  <div class="profiler-tab-filters" data-testid="profiler-tab-filters">
    <div v-if="activeColumnFqn" class="profiler-tab-filters__group">
      <span class="profiler-tab-filters__label">{{ t('label.column') }}:</span>
      <Dropdown :trigger="['click']">
        <Button data-testid="column-picker-menu-button">
          {{ selectedColumn ? entityDisplayName(selectedColumn) : activeColumnFqn }}
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu
            data-testid="column-picker-menu"
            @click="(info) => emit('select-column', String(info.key))"
          >
            <Menu.Item
              v-for="column in columns"
              :key="column.fullyQualifiedName || column.name"
              :data-testid="`column-picker-menu-item-${column.fullyQualifiedName || column.name}`"
            >
              {{ columnLabel(column) }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </div>

    <div v-if="!hideDateFilter" class="profiler-tab-filters__group">
      <span class="profiler-tab-filters__label">{{ t('label.date') }}:</span>
      <IncidentDateRangeFilter
        :start-ts="startTs"
        :end-ts="endTs"
        :range-key="rangeKey"
        :range-title="rangeTitle"
        test-id="profiler-date-range"
        @apply="emit('date-change', $event)"
      />
    </div>

    <template v-if="!deleted">
      <Dropdown v-if="canAddTableTest" :trigger="['click']">
        <Button type="primary" data-testid="profiler-add-table-test-btn">
          {{ t('label.add') }}
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu data-testid="profiler-add-menu">
            <Menu.Item
              v-if="createTestCasePermission"
              key="test-case"
              data-testid="profiler-add-test-case"
              @click="emit('add-test-case')"
            >
              {{ t('label.test-case') }}
            </Menu.Item>
            <Menu.Item
              v-if="editDataProfile"
              key="custom-metric"
              data-testid="profiler-add-custom-metric"
              @click="emit('add-custom-metric')"
            >
              {{ t('label.custom-metric') }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
      <Tooltip v-if="editDataProfile" :title="t('label.setting-plural')">
        <Button data-testid="profiler-setting-btn" @click="emit('open-settings')">
          <SettingOutlined />
        </Button>
      </Tooltip>
    </template>
  </div>
</template>

<style scoped>
.profiler-tab-filters {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 16px;
}
.profiler-tab-filters__group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.profiler-tab-filters__label {
  color: var(--sm-text-primary);
  font-weight: 500;
  font-size: 0.875rem;
}
</style>
