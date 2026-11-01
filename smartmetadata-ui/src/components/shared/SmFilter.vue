<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Select, Space } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Generic filter bar: filter definitions are data (key + label +
 * options + current value). No per-filter if/else branches live here;
 * the caller owns the meaning of each key.
 */
export interface SmFilterOption {
  value: string;
  label: string;
}
export interface SmFilterDef {
  key: string;
  label: string;
  options: SmFilterOption[];
  value?: string;
}

withDefaults(defineProps<{ filters: SmFilterDef[]; testId?: string }>(), { testId: 'sm-filter' });
const emit = defineEmits<{ change: [key: string, value: string | undefined]; clear: [] }>();
const { t } = useI18n();
</script>

<template>
  <Space wrap :data-testid="testId">
    <span>{{ t('shared.filters') }}</span>
    <Select
      v-for="filter in filters"
      :key="filter.key"
      :data-testid="`sm-filter-${filter.key}`"
      :value="filter.value"
      :placeholder="filter.label"
      allow-clear
      style="min-width: 160px"
      :options="filter.options.map((option) => ({ value: option.value, label: option.label }))"
      @update:value="(value) => emit('change', filter.key, typeof value === 'string' ? value : undefined)"
    />
    <Button :data-testid="`${testId}-clear`" @click="emit('clear')">{{ t('shared.clearFilters') }}</Button>
  </Space>
</template>
