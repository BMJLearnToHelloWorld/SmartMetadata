<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official FieldValueBoostList: base columns on every page,
  modifier/missing/range columns only on the global page, row key
  `field`, edit/delete row actions.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons-vue';
import { Button, Space, Typography } from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import type { SearchFieldValueBoost } from '@/types/admin';

const props = withDefaults(
  defineProps<{
    entitySearchSettingsPage?: boolean;
    fieldValueBoosts: SearchFieldValueBoost[];
    isLoading: boolean;
    dataTestId: string;
  }>(),
  { entitySearchSettingsPage: false },
);
const emit = defineEmits<{
  edit: [boost: SearchFieldValueBoost];
  delete: [field: string];
}>();
const { t } = useI18n();

const columns = computed(() => {
  const base = [
    { title: t('settings.searchPrefs.field'), dataIndex: 'field', key: 'field', width: 250 },
    { title: t('settings.searchPrefs.factor'), dataIndex: 'factor', key: 'factor', width: 80 },
  ];
  const additional = props.entitySearchSettingsPage
    ? []
    : [
        { title: t('settings.searchPrefs.modifier'), dataIndex: 'modifier', key: 'modifier', width: 120 },
        { title: t('settings.searchPrefs.missingValue'), dataIndex: 'missing', key: 'missing', width: 120 },
        { title: t('settings.searchPrefs.greaterThan'), key: 'gt', width: 120 },
        { title: t('settings.searchPrefs.greaterThanOrEqualTo'), key: 'gte', width: 120 },
        { title: t('settings.searchPrefs.lessThan'), key: 'lt', width: 120 },
        { title: t('settings.searchPrefs.lessThanOrEqualTo'), key: 'lte', width: 120 },
      ];
  return [
    ...base,
    ...additional,
    { title: t('settings.searchPrefs.actions'), key: 'actions', width: 100 },
  ];
});

function rangeValue(
  record: SearchFieldValueBoost,
  key: 'gt' | 'gte' | 'lt' | 'lte',
): number | string {
  const value = record.condition?.range?.[key];
  return value ?? '-';
}
</script>

<template>
  <SmTable
    row-key="field"
    :columns="columns"
    :data-source="fieldValueBoosts"
    :loading="isLoading"
    :pagination="false"
    size="small"
    :test-id="dataTestId"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'gt' || column.key === 'gte' || column.key === 'lt' || column.key === 'lte'">
        <Typography>
          {{ rangeValue(record as SearchFieldValueBoost, column.key as 'gt' | 'gte' | 'lt' | 'lte') }}
        </Typography>
      </template>
      <template v-else-if="column.key === 'actions'">
        <Space :size="8">
          <Button
            type="text"
            size="small"
            data-testid="edit-field-value-boost-btn"
            :aria-label="t('settings.searchPrefs.editFieldValueBoost')"
            @click="emit('edit', record as SearchFieldValueBoost)"
          >
            <EditOutlined />
          </Button>
          <Button
            type="text"
            size="small"
            data-testid="delete-field-value-boost-btn"
            :aria-label="t('settings.searchPrefs.deleteFieldValueBoost')"
            @click="emit('delete', (record as SearchFieldValueBoost).field ?? '')"
          >
            <DeleteOutlined />
          </Button>
        </Space>
      </template>
    </template>
  </SmTable>
</template>
