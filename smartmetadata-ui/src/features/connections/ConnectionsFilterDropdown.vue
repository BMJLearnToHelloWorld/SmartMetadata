<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Select, Tooltip } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Multi-select filter dropdown, mirroring official
 * `ConnectionsFilterButton` (pin a3012259ca): the trigger shows the
 * fallback label when nothing is selected, the single item's label
 * when one is selected, and "N selected" (with a tooltip listing every
 * selected name) when more are; selected items pin to the top of the
 * list in stable order; an empty selection means "no filter".
 *
 * Built on the product's existing antd `Select mode="multiple"` pattern
 * (ServiceHeaderFacets, MetricCreateDrawer): `maxTagCount={0}` collapses
 * the tags into one placeholder, which carries the trigger text — the
 * tag stack antd would otherwise render is not the pin behaviour.
 */
export interface ConnectionsFilterOption {
  value: string;
  label: string;
  count: number;
}

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    options: ConnectionsFilterOption[];
    fallbackLabel: string;
    searchable?: boolean;
    testId: string;
  }>(),
  { searchable: false },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void;
}>();

const { t } = useI18n();

const selectedSet = computed(() => new Set(props.modelValue));

const labelByValue = computed(
  () => new Map(props.options.map((option) => [option.value, option.label])),
);

/** Selected first, stable order within each group (pin FilterButton). */
const sortedOptions = computed(() => {
  const selected = props.options.filter((option) => selectedSet.value.has(option.value));
  const rest = props.options.filter((option) => !selectedSet.value.has(option.value));
  return [...selected, ...rest].map((option) => ({
    label: `${option.label} (${option.count})`,
    value: option.value,
  }));
});

const triggerLabel = computed(() => {
  if (props.modelValue.length === 0) {
    return props.fallbackLabel;
  }
  if (props.modelValue.length === 1) {
    return labelByValue.value.get(props.modelValue[0]) ?? props.fallbackLabel;
  }
  return t('connections.nSelected', { count: props.modelValue.length });
});

const selectedLabelsTooltip = computed(() =>
  props.modelValue.length > 1
    ? props.modelValue.map((value) => labelByValue.value.get(value) ?? value).join(', ')
    : '',
);

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this dropdown only ever carries plain string option values, so narrow to
 * string terms here and keep the emit in string terms. Non-string values
 * (numbers, labeled values without a string value) cannot occur for these
 * options and are dropped rather than coerced.
 */
function asStringArray(value: SelectValue): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return list.flatMap((item) => {
    if (typeof item === 'string') {
      return [item];
    }
    if (typeof item === 'object' && item !== null && typeof item.value === 'string') {
      return [item.value];
    }
    return [];
  });
}

function onChange(value: SelectValue): void {
  emit('update:modelValue', asStringArray(value));
}
</script>

<template>
  <Tooltip :title="selectedLabelsTooltip || undefined">
    <Select
      :value="modelValue"
      :data-testid="testId"
      mode="multiple"
      :show-search="searchable"
      option-filter-prop="label"
      :options="sortedOptions"
      :placeholder="fallbackLabel"
      :max-tag-count="0"
      :max-tag-placeholder="() => triggerLabel"
      :allow-clear="false"
      class="connections-filter-dropdown"
      @change="onChange"
    />
  </Tooltip>
</template>

<style scoped>
.connections-filter-dropdown {
  min-width: 180px;
}
</style>
