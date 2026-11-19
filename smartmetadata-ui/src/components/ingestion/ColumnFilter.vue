<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Checkbox } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

export interface ColumnFilterOption {
  text: string;
  value: string;
}

const props = defineProps<{
  /** Filter options; labels are already startCase-rendered by the caller. */
  options: ColumnFilterOption[];
  selectedValues: string[];
  /**
   * The table dropdown's confirm callback. The official filter confirms
   * immediately on every toggle, so the caller passes the slot's
   * `confirm` straight through.
   */
  confirm?: () => void;
}>();

const emit = defineEmits<{
  (e: 'change', values: string[]): void;
}>();

const { t } = useI18n();

function toggle(value: string): void {
  const next = props.selectedValues.includes(value)
    ? props.selectedValues.filter((item) => item !== value)
    : [...props.selectedValues, value];
  emit('change', next);
  props.confirm?.();
}
</script>

<template>
  <!--
    Port of official ColumnFilter (pin a3012259ca): a checkbox list
    whose click toggles the option and confirms immediately; an empty
    option list renders the no-data-found text instead of a list.
  -->
  <div v-if="options.length === 0" data-testid="no-filter-options">
    {{ t('settings.services.noDataFound') }}
  </div>
  <div v-else class="column-filter">
    <label v-for="option in options" :key="option.value" class="column-filter__row">
      <Checkbox
        :checked="selectedValues.includes(option.value)"
        @change="toggle(option.value)"
      />
      <span>{{ option.text }}</span>
    </label>
  </div>
</template>

<style scoped>
.column-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  min-width: 160px;
}

.column-filter__row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--sm-border-radius);
}

.column-filter__row:hover {
  background: var(--sm-bg-container-hover, var(--sm-bg-container));
}
</style>
